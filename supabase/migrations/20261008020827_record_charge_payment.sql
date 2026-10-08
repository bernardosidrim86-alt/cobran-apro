create table if not exists public.subscription_webhook_events (
  event_key text primary key,
  provider_sale_code text not null,
  sale_status integer not null,
  subscription_status text,
  subscription_status_event text,
  user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  plan text,
  billing_cycle text,
  action text not null check (action in ('activated', 'revoked', 'cancelled', 'ignored')),
  amount numeric,
  currency text not null default 'BRL',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.subscription_webhook_events enable row level security;
revoke all on table public.subscription_webhook_events from public, anon, authenticated;
grant all on table public.subscription_webhook_events to service_role;

create or replace function public.apply_perfectpay_webhook_event(
  p_event_key text,
  p_provider_sale_code text,
  p_sale_status integer,
  p_subscription_status text,
  p_subscription_status_event text,
  p_user_id uuid,
  p_plan text,
  p_billing_cycle text,
  p_profile_status text,
  p_subscription_record_status text,
  p_amount numeric,
  p_expires_at timestamptz,
  p_action text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_rows integer;
begin
  if p_action not in ('activated', 'revoked', 'cancelled', 'ignored') then
    raise exception 'invalid_subscription_action';
  end if;

  insert into public.subscription_webhook_events (
    event_key,
    provider_sale_code,
    sale_status,
    subscription_status,
    subscription_status_event,
    user_id,
    plan,
    billing_cycle,
    action,
    amount,
    expires_at
  ) values (
    p_event_key,
    p_provider_sale_code,
    p_sale_status,
    p_subscription_status,
    p_subscription_status_event,
    p_user_id,
    p_plan,
    p_billing_cycle,
    p_action,
    p_amount,
    p_expires_at
  )
  on conflict (event_key) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  if p_action in ('activated', 'revoked', 'cancelled') then
    update public.profiles
       set plan = p_plan,
           billing_cycle = p_billing_cycle,
           subscription_status = p_profile_status,
           subscription_expires_at = p_expires_at
     where id = p_user_id
     returning company_id into v_company_id;

    if not found then
      raise exception 'profile_not_found';
    end if;

    insert into public.subscriptions (
      user_id,
      company_id,
      provider,
      provider_sale_code,
      plan,
      billing_cycle,
      status,
      amount,
      currency,
      expires_at,
      last_event_status,
      last_event_at
    ) values (
      p_user_id,
      v_company_id,
      'perfectpay',
      p_provider_sale_code,
      p_plan,
      p_billing_cycle,
      p_subscription_record_status,
      p_amount,
      'BRL',
      p_expires_at,
      p_sale_status::text,
      now()
    )
    on conflict (provider_sale_code) do update
       set company_id = excluded.company_id,
           plan = excluded.plan,
           billing_cycle = excluded.billing_cycle,
           status = excluded.status,
           amount = excluded.amount,
           expires_at = excluded.expires_at,
           last_event_status = excluded.last_event_status,
           last_event_at = excluded.last_event_at,
           updated_at = now();
  end if;

  return true;
end;
$function$;

revoke all on function public.apply_perfectpay_webhook_event(
  text, text, integer, text, text, uuid, text, text, text, text, numeric, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.apply_perfectpay_webhook_event(
  text, text, integer, text, text, uuid, text, text, text, text, numeric, timestamptz, text
) to service_role;

create or replace function public.record_charge_payment(p_charge_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_charge public.charges%rowtype;
begin
  select *
    into v_charge
    from public.charges
   where id = p_charge_id
     and company_id = (select private.my_company_id())
   for update;

  if not found then
    raise exception 'charge_not_found';
  end if;

  if v_charge.status <> 'pending' then
    raise exception 'charge_not_pending';
  end if;

  insert into public.payments (
    company_id,
    charge_id,
    customer_id,
    amount,
    payment_method,
    paid_at
  ) values (
    v_charge.company_id,
    v_charge.id,
    v_charge.customer_id,
    v_charge.amount,
    v_charge.payment_method,
    now()
  );

  update public.charges
     set status = 'paid'
   where id = v_charge.id
     and company_id = v_charge.company_id;
end;
$function$;

revoke all on function public.record_charge_payment(uuid) from public, anon;
grant execute on function public.record_charge_payment(uuid) to authenticated;
