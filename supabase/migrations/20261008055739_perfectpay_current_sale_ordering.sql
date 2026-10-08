-- Track the sale that currently owns the account entitlement. This lets an old
-- sale remain in the ledger without being able to change a newer purchase.
alter table public.profiles
  add column if not exists subscription_provider_sale_code text;

-- An exact match can identify some existing sales, but older paid accounts may
-- have no subscription history. Keep their entitlement and use the profile's
-- last persisted update as a conservative event-time watermark. A later
-- PerfectPay approval can establish the first known sale without inventing an
-- ID; older or undated events remain ambiguous and cannot change access.
alter table public.profiles
  add column if not exists subscription_legacy_sale_unknown_since timestamptz;

alter table public.subscriptions
  add column if not exists last_provider_event_at timestamptz;

alter table public.subscription_webhook_events
  add column if not exists provider_event_at timestamptz;

-- Backfill only an exact match. If legacy state is ambiguous, leave the pointer
-- null so the RPC can fail closed while that paid entitlement is still live.
with matching_profiles as (
  select p.id, min(s.provider_sale_code) as provider_sale_code
    from public.profiles p
    join public.subscriptions s
      on s.user_id = p.id
     and s.provider_sale_code is not null
     and s.plan = p.plan
     and s.billing_cycle is not distinct from p.billing_cycle
     and s.status = p.subscription_status
     and s.expires_at is not distinct from p.subscription_expires_at
   where p.plan in ('essencial', 'profissional', 'business')
     and p.subscription_status in ('active', 'cancelled')
     and p.subscription_provider_sale_code is null
   group by p.id
  having count(*) = 1
)
update public.profiles p
   set subscription_provider_sale_code = matching.provider_sale_code
  from matching_profiles matching
 where p.id = matching.id;

update public.profiles
   set subscription_legacy_sale_unknown_since = coalesce(updated_at, created_at)
 where subscription_provider_sale_code is null
   and subscription_legacy_sale_unknown_since is null
   and plan in ('essencial', 'profissional', 'business');

drop function public.apply_perfectpay_webhook_event(
  text, text, text, integer, text, text, uuid, text, text, text, text,
  text, text, numeric, timestamptz, text
);

create or replace function public.apply_perfectpay_webhook_event(
  p_event_key text,
  p_provider_sale_code text,
  p_provider_plan_code text,
  p_sale_status integer,
  p_subscription_status text,
  p_subscription_status_event text,
  p_user_id uuid,
  p_event_plan text,
  p_event_billing_cycle text,
  p_profile_plan text,
  p_profile_billing_cycle text,
  p_profile_status text,
  p_subscription_record_status text,
  p_amount numeric,
  p_expires_at timestamptz,
  p_action text,
  p_provider_event_at timestamptz
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_current_sale_code text;
  v_current_plan text;
  v_current_cycle text;
  v_current_status text;
  v_current_expires_at timestamptz;
  v_legacy_sale_unknown_since timestamptz;
  v_legacy_indeterminate boolean := false;
  v_current_event_at timestamptz;
  v_incoming_status text;
  v_incoming_user_id uuid;
  v_effective_action text := p_action;
  v_event_rows integer;
  v_write_rows integer;
  v_result text := 'applied';
  v_is_current boolean;
begin
  if p_action not in ('activated', 'revoked', 'cancelled', 'ignored') then
    raise exception 'invalid_subscription_action';
  end if;
  if p_event_key is null or length(p_event_key) > 1000 then
    raise exception 'invalid_event_key';
  end if;
  if p_provider_sale_code is null or length(p_provider_sale_code) > 255 then
    raise exception 'invalid_provider_sale_code';
  end if;

  -- This lock serializes every PerfectPay event for this account. All state
  -- reads/writes below, including deduplication and history, share this txn.
  select p.company_id, p.subscription_provider_sale_code, p.plan,
         p.billing_cycle, p.subscription_status, p.subscription_expires_at,
         p.subscription_legacy_sale_unknown_since
    into v_company_id, v_current_sale_code, v_current_plan,
         v_current_cycle, v_current_status, v_current_expires_at,
         v_legacy_sale_unknown_since
    from public.profiles p
   where p.id = p_user_id
   for update;
  if not found then raise exception 'profile_not_found'; end if;

  -- Repair an unambiguous legacy pointer at runtime as well as during migration.
  if v_current_sale_code is null
     and v_current_plan in ('essencial', 'profissional', 'business')
     and v_current_status in ('active', 'cancelled')
     and v_current_expires_at > now() then
    select min(s.provider_sale_code), min(coalesce(s.last_provider_event_at, s.created_at))
      into v_current_sale_code, v_current_event_at
      from public.subscriptions s
     where s.user_id = p_user_id
       and s.plan = v_current_plan
       and s.billing_cycle is not distinct from v_current_cycle
       and s.status = v_current_status
       and s.expires_at is not distinct from v_current_expires_at
    having count(*) = 1;
    if v_current_sale_code is not null then
      update public.profiles
         set subscription_provider_sale_code = v_current_sale_code,
             subscription_legacy_sale_unknown_since = null
       where id = p_user_id;
      v_legacy_sale_unknown_since := null;
    end if;
  end if;

  v_legacy_indeterminate :=
    v_current_sale_code is null and v_legacy_sale_unknown_since is not null;
  v_is_current := coalesce(v_current_sale_code = p_provider_sale_code, false);
  select s.status, s.user_id, coalesce(s.last_provider_event_at, s.created_at)
    into v_incoming_status, v_incoming_user_id, v_current_event_at
    from public.subscriptions s
   where s.provider_sale_code = p_provider_sale_code
   for update;

  if found and v_incoming_user_id is distinct from p_user_id then
    v_effective_action := 'ignored';
    v_result := 'out_of_order';
  elsif p_action = 'activated' then
    if v_legacy_indeterminate then
      -- The cutoff rejects delayed approvals from before this migration. A
      -- post-cutoff PerfectPay approval is a new paid transaction (purchase or
      -- renewal) and may establish the pointer without guessing a sale code.
      if v_incoming_status in ('cancelled', 'refunded', 'expired') then
        v_effective_action := 'ignored';
        v_result := 'out_of_order';
      elsif p_provider_event_at is null
         or p_provider_event_at <= v_legacy_sale_unknown_since then
        v_effective_action := 'ignored';
        v_result := 'legacy_indeterminate';
      end if;
    elsif v_incoming_status in ('cancelled', 'refunded', 'expired') then
      v_effective_action := 'ignored';
      v_result := 'out_of_order';
    elsif v_is_current then
      if p_provider_event_at is not null
         and v_current_event_at is not null
         and p_provider_event_at <= v_current_event_at then
        v_effective_action := 'ignored';
        v_result := 'out_of_order';
      end if;
    elsif v_current_sale_code is not null then
      -- A different sale may replace the current sale only when PerfectPay
      -- provides a timestamp that proves it is newer, even if access expired.
      select coalesce(s.last_provider_event_at, s.created_at) into v_current_event_at
        from public.subscriptions s
       where s.provider_sale_code = v_current_sale_code
         and s.user_id = p_user_id
       for update;
      if p_provider_event_at is null
         or v_current_event_at is null
         or p_provider_event_at <= v_current_event_at then
        v_effective_action := 'ignored';
        v_result := 'out_of_order';
      end if;
    elsif v_current_status in ('active', 'cancelled')
       and v_current_plan in ('essencial', 'profissional', 'business')
       and v_current_expires_at > now()
       and v_current_sale_code is null then
      -- Unknown legacy sale identity: preserve its live entitlement rather
      -- than guessing which sale is newer.
      v_effective_action := 'ignored';
      v_result := 'out_of_order';
    end if;
  elsif p_action in ('revoked', 'cancelled') then
    if not v_is_current then
      v_effective_action := 'ignored';
      v_result := case when v_legacy_indeterminate
        then 'legacy_indeterminate' else 'stale_sale' end;
    elsif p_provider_event_at is not null
       and v_current_event_at is not null
       and p_provider_event_at < v_current_event_at
       and v_incoming_status not in ('cancelled', 'refunded', 'expired') then
      v_effective_action := 'ignored';
      v_result := 'out_of_order';
    end if;
  end if;

  insert into public.subscription_webhook_events (
    event_key, provider_sale_code, provider_plan_code, sale_status,
    subscription_status, subscription_status_event, user_id, company_id,
    plan, billing_cycle, action, amount, expires_at, provider_event_at
  ) values (
    p_event_key, p_provider_sale_code, left(p_provider_plan_code, 120),
    p_sale_status, left(p_subscription_status, 120),
    left(p_subscription_status_event, 120), p_user_id, v_company_id,
    p_event_plan, p_event_billing_cycle, v_effective_action, p_amount,
    p_expires_at, p_provider_event_at
  ) on conflict (event_key) do nothing;
  get diagnostics v_event_rows = row_count;
  if v_event_rows = 0 then return 'duplicate'; end if;

  -- Keep the historical sale row accurate even when it no longer owns access.
  if p_action in ('activated', 'revoked', 'cancelled')
     and (v_incoming_user_id is null or v_incoming_user_id = p_user_id)
     and not (
       p_provider_event_at is not null
       and v_current_event_at is not null
       and p_provider_event_at < v_current_event_at
     ) then
    insert into public.subscriptions (
      user_id, company_id, provider, provider_plan_code, provider_sale_code,
      plan, billing_cycle, status, amount, currency, expires_at,
      last_event_status, last_event_at, last_provider_event_at
    ) values (
      p_user_id, v_company_id, 'perfectpay', left(p_provider_plan_code, 120),
      p_provider_sale_code, p_event_plan, p_event_billing_cycle,
      p_subscription_record_status, p_amount, 'BRL',
      case when p_action = 'cancelled' and v_is_current
        then v_current_expires_at else p_expires_at end,
      p_sale_status::text, now(), p_provider_event_at
    ) on conflict (provider_sale_code) do update
      set company_id = excluded.company_id,
          plan = excluded.plan,
          billing_cycle = excluded.billing_cycle,
          status = case
            when public.subscriptions.status = 'refunded'
              then 'refunded'
            when public.subscriptions.status = 'expired'
             and excluded.status in ('active', 'cancelled')
              then 'expired'
            when public.subscriptions.status = 'cancelled'
             and excluded.status = 'active'
              then 'cancelled'
            else excluded.status
          end,
          amount = excluded.amount,
          expires_at = case
            when p_action = 'cancelled' and v_is_current then v_current_expires_at
            when p_action = 'cancelled' then public.subscriptions.expires_at
            else excluded.expires_at
          end,
          last_event_status = excluded.last_event_status,
          last_event_at = now(),
          last_provider_event_at = coalesce(
            excluded.last_provider_event_at,
            public.subscriptions.last_provider_event_at
          ),
          updated_at = now()
      where public.subscriptions.user_id = excluded.user_id;
    get diagnostics v_write_rows = row_count;
    if v_write_rows = 0 and v_incoming_user_id is not null
       and v_incoming_user_id <> p_user_id then
      return 'out_of_order';
    end if;
  end if;

  if v_effective_action in ('activated', 'revoked', 'cancelled') then
    update public.profiles
       set plan = case when v_effective_action = 'cancelled'
             then v_current_plan else p_profile_plan end,
           billing_cycle = case when v_effective_action = 'cancelled'
             then v_current_cycle else p_profile_billing_cycle end,
           subscription_status = case when v_effective_action = 'cancelled'
             then 'cancelled' else p_profile_status end,
           subscription_expires_at = case when v_effective_action = 'cancelled'
             then v_current_expires_at else p_expires_at end,
           subscription_provider_sale_code = case
             when v_effective_action = 'activated' then p_provider_sale_code
             else subscription_provider_sale_code
           end,
           subscription_legacy_sale_unknown_since = case
             when v_effective_action = 'activated' then null
             else subscription_legacy_sale_unknown_since
           end
     where id = p_user_id;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.apply_perfectpay_webhook_event(
  text, text, text, integer, text, text, uuid, text, text, text, text,
  text, text, numeric, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_perfectpay_webhook_event(
  text, text, text, integer, text, text, uuid, text, text, text, text,
  text, text, numeric, timestamptz, text, timestamptz
) to service_role;
