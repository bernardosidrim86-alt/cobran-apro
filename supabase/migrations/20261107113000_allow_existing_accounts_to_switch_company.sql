-- Allow an existing account that owns a company to join another Business company
-- without losing its original company or subscription. The original state is kept
-- in a private table and restored when the member leaves or is removed.

create table if not exists private.company_member_return_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  home_company_id uuid references public.companies(id) on delete set null,
  home_plan text not null check (home_plan in ('free', 'essencial', 'profissional', 'business')),
  home_billing_cycle text,
  home_subscription_status text not null,
  home_subscription_expires_at timestamptz,
  home_subscription_provider_sale_code text,
  home_subscription_legacy_sale_unknown_since timestamptz,
  created_at timestamptz not null default now()
);

alter table private.company_member_return_state enable row level security;
revoke all on table private.company_member_return_state from public, anon, authenticated;

create or replace function public.create_company_invitation(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_user_email text;
  v_company_id uuid;
  v_email text := lower(btrim(p_email));
  v_owner_plan text;
  v_owner_status text;
  v_owner_expiry timestamptz;
  v_existing_id uuid;
  v_existing_role text;
  v_existing_status text;
  v_existing_expiry timestamptz;
  v_invitee_user_id uuid;
  v_profile_company_id uuid;
  v_used integer;
  v_token text;
  v_token_hash text;
  v_membership_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if v_email is null or length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;

  select lower(u.email) into v_user_email from auth.users u where u.id = v_user_id;
  if v_user_email = v_email then raise exception 'cannot_invite_self'; end if;

  select p.company_id, p.plan, p.subscription_status, p.subscription_expires_at
    into v_company_id, v_owner_plan, v_owner_status, v_owner_expiry
  from public.profiles p where p.id = v_user_id;

  if v_company_id is null or not exists (
    select 1 from public.company_members cm
    where cm.company_id = v_company_id and cm.user_id = v_user_id
      and cm.role = 'owner' and cm.status = 'active'
  ) then raise exception 'owner_required'; end if;

  if v_owner_plan <> 'business' or v_owner_status not in ('active', 'cancelled')
     or v_owner_expiry is null or v_owner_expiry <= now() then
    raise exception 'business_plan_required';
  end if;

  perform 1 from public.companies c where c.id = v_company_id for update;
  if not found then raise exception 'company_not_found'; end if;

  -- Existing accounts may be invited while they are using their own company,
  -- but not while they are already a member of somebody else's company.
  select p.id, p.company_id
    into v_invitee_user_id, v_profile_company_id
  from public.profiles p
  where lower(p.email) = v_email
  limit 1;

  if v_invitee_user_id is not null then
    if v_profile_company_id = v_company_id then
      raise exception 'member_already_exists';
    end if;

    if v_profile_company_id is not null and not exists (
      select 1 from public.company_members cm
      where cm.company_id = v_profile_company_id
        and cm.user_id = v_invitee_user_id
        and cm.role = 'owner'
        and cm.status = 'active'
    ) then
      raise exception 'email_already_in_another_company';
    end if;

    if exists (
      select 1 from public.company_members cm
      where cm.user_id = v_invitee_user_id
        and cm.status = 'active'
        and cm.company_id <> coalesce(v_profile_company_id, v_company_id)
    ) then
      raise exception 'email_already_in_another_company';
    end if;
  end if;

  -- Only inspect an existing invitation/membership in the company doing the invite.
  select cm.id, cm.role, cm.status, cm.invite_expires_at
    into v_existing_id, v_existing_role, v_existing_status, v_existing_expiry
  from public.company_members cm
  where cm.company_id = v_company_id
    and lower(cm.email) = v_email
  order by cm.created_at desc
  limit 1
  for update;

  if v_existing_id is not null
     and (v_existing_role <> 'member' or v_existing_status = 'active') then
    raise exception 'member_already_exists';
  end if;

  if v_existing_id is not null
     and v_existing_status = 'invited'
     and (v_existing_expiry is null or v_existing_expiry > now()) then
    raise exception 'invitation_already_pending';
  end if;

  select count(*)::integer into v_used
  from public.company_members cm
  where cm.company_id = v_company_id
    and (
      cm.status = 'active'
      or (
        cm.status = 'invited'
        and cm.invite_expires_at is not null
        and cm.invite_expires_at > now()
        and cm.id <> coalesce(v_existing_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
    );
  if v_used >= 5 then raise exception 'seat_limit_reached'; end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  if v_existing_id is not null then
    update public.company_members
       set user_id = null,
           email = v_email,
           role = 'member',
           status = 'invited',
           invited_by = v_user_id,
           invite_token_hash = v_token_hash,
           invite_expires_at = v_expires_at,
           updated_at = now()
     where id = v_existing_id;
    v_membership_id := v_existing_id;
  else
    insert into public.company_members (
      company_id, email, role, status, invited_by, invite_token_hash, invite_expires_at
    ) values (
      v_company_id, v_email, 'member', 'invited', v_user_id, v_token_hash, v_expires_at
    ) returning id into v_membership_id;
  end if;

  insert into public.company_activity (company_id, actor_user_id, event_type, entity_type, entity_id)
  values (v_company_id, v_user_id, 'team_member_invited', 'team_member', v_membership_id);

  return jsonb_build_object(
    'membership_id', v_membership_id, 'email', v_email, 'token', v_token,
    'expires_at', v_expires_at, 'seat_limit', 5
  );
end;
$function$;

revoke all on function public.create_company_invitation(text) from public, anon;
grant execute on function public.create_company_invitation(text) to authenticated;

create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_confirmed_at timestamptz;
  v_token_hash text;
  v_company_id uuid;
  v_company_name text;
  v_previous_company_id uuid;
  v_previous_plan text;
  v_previous_cycle text;
  v_previous_status text;
  v_previous_expiry timestamptz;
  v_previous_sale_code text;
  v_previous_legacy_sale_unknown_since timestamptz;
  v_member_id uuid;
  v_owner_plan text;
  v_owner_cycle text;
  v_owner_status text;
  v_owner_expiry timestamptz;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_token is null or length(p_token) < 40 or length(p_token) > 200 then
    raise exception 'invalid_or_expired_invite';
  end if;
  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select lower(u.email), coalesce(u.email_confirmed_at, u.confirmed_at)
    into v_email, v_confirmed_at
  from auth.users u where u.id = v_user_id;
  if v_email is null then raise exception 'authentication_required'; end if;
  if v_confirmed_at is null then raise exception 'email_confirmation_required'; end if;

  select cm.company_id, cm.id into v_company_id, v_member_id
  from public.company_members cm
  where cm.invite_token_hash = v_token_hash and cm.user_id = v_user_id
    and cm.email = v_email and cm.role = 'member' and cm.status = 'active'
  limit 1;
  if v_member_id is not null then
    select c.name into v_company_name from public.companies c where c.id = v_company_id;
    return jsonb_build_object('company_id', v_company_id, 'company_name', v_company_name, 'already_member', true);
  end if;

  select cm.id, cm.company_id into v_member_id, v_company_id
  from public.company_members cm
  where cm.invite_token_hash = v_token_hash and cm.email = v_email
    and cm.role = 'member' and cm.status = 'invited' and cm.invite_expires_at > now()
  limit 1 for update;
  if v_member_id is null then raise exception 'invalid_or_expired_invite'; end if;

  perform 1 from public.companies c where c.id = v_company_id for update;
  if not found then raise exception 'company_not_found'; end if;

  select p.company_id, p.plan, p.billing_cycle, p.subscription_status,
         p.subscription_expires_at, p.subscription_provider_sale_code,
         p.subscription_legacy_sale_unknown_since
    into v_previous_company_id, v_previous_plan, v_previous_cycle, v_previous_status,
         v_previous_expiry, v_previous_sale_code, v_previous_legacy_sale_unknown_since
  from public.profiles p
  where p.id = v_user_id
  for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_previous_company_id = v_company_id then
    raise exception 'member_already_exists';
  end if;

  -- A pre-existing company can be temporarily left only by its owner.
  if v_previous_company_id is not null and not exists (
    select 1 from public.company_members cm
    where cm.company_id = v_previous_company_id
      and cm.user_id = v_user_id
      and cm.role = 'owner'
      and cm.status = 'active'
  ) then
    raise exception 'already_linked_to_company';
  end if;

  -- Do not allow an account already participating in another team to hop teams.
  if exists (
    select 1 from public.company_members cm
    where cm.user_id = v_user_id
      and cm.status = 'active'
      and cm.company_id <> coalesce(v_previous_company_id, v_company_id)
  ) then
    raise exception 'already_linked_to_company';
  end if;

  if exists (
    select 1 from private.company_member_return_state rs
    where rs.user_id = v_user_id
  ) then
    raise exception 'company_return_state_already_exists';
  end if;

  select p.plan, p.billing_cycle, p.subscription_status, p.subscription_expires_at
    into v_owner_plan, v_owner_cycle, v_owner_status, v_owner_expiry
  from public.profiles p
  join public.company_members owner_member
    on owner_member.user_id = p.id
   and owner_member.company_id = v_company_id
   and owner_member.role = 'owner'
   and owner_member.status = 'active'
  where p.company_id = v_company_id;

  if v_owner_plan is distinct from 'business'
     or v_owner_status not in ('active', 'cancelled')
     or v_owner_expiry is null or v_owner_expiry <= now() then
    raise exception 'business_plan_required';
  end if;

  insert into private.company_member_return_state (
    user_id, home_company_id, home_plan, home_billing_cycle,
    home_subscription_status, home_subscription_expires_at,
    home_subscription_provider_sale_code,
    home_subscription_legacy_sale_unknown_since
  ) values (
    v_user_id, v_previous_company_id, coalesce(v_previous_plan, 'free'),
    v_previous_cycle, coalesce(v_previous_status, 'inactive'),
    v_previous_expiry, v_previous_sale_code,
    v_previous_legacy_sale_unknown_since
  );

  update public.company_members
     set user_id = v_user_id, status = 'active', updated_at = now()
   where id = v_member_id;

  update public.profiles
     set company_id = v_company_id,
         plan = v_owner_plan,
         billing_cycle = v_owner_cycle,
         subscription_status = v_owner_status,
         subscription_expires_at = v_owner_expiry,
         updated_at = now()
   where id = v_user_id;

  insert into public.company_activity (company_id, actor_user_id, event_type, entity_type, entity_id)
  values (v_company_id, v_user_id, 'team_member_joined', 'team_member', v_member_id);

  select c.name into v_company_name from public.companies c where c.id = v_company_id;
  return jsonb_build_object(
    'company_id', v_company_id,
    'company_name', v_company_name,
    'previous_company_id', v_previous_company_id,
    'already_member', false
  );
end;
$function$;

revoke all on function public.accept_company_invitation(text) from public, anon;
grant execute on function public.accept_company_invitation(text) to authenticated;

create or replace function public.leave_company_and_return()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_member_id uuid;
  v_home_company_id uuid;
  v_home_company_name text;
  v_home_plan text := 'free';
  v_home_cycle text;
  v_home_status text := 'inactive';
  v_home_expiry timestamptz;
  v_home_sale_code text;
  v_home_legacy_sale_unknown_since timestamptz;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select p.company_id into v_company_id
  from public.profiles p
  where p.id = v_user_id
  for update;
  if v_company_id is null then raise exception 'not_team_member'; end if;

  select cm.id into v_member_id
  from public.company_members cm
  where cm.company_id = v_company_id
    and cm.user_id = v_user_id
    and cm.role = 'member'
    and cm.status = 'active'
  for update;
  if v_member_id is null then raise exception 'not_team_member'; end if;

  select rs.home_company_id, rs.home_plan, rs.home_billing_cycle,
         rs.home_subscription_status, rs.home_subscription_expires_at,
         rs.home_subscription_provider_sale_code,
         rs.home_subscription_legacy_sale_unknown_since
    into v_home_company_id, v_home_plan, v_home_cycle, v_home_status,
         v_home_expiry, v_home_sale_code, v_home_legacy_sale_unknown_since
  from private.company_member_return_state rs
  where rs.user_id = v_user_id
  for update;

  if not found then
    v_home_company_id := null;
    v_home_plan := 'free';
    v_home_cycle := null;
    v_home_status := 'inactive';
    v_home_expiry := null;
    v_home_sale_code := null;
    v_home_legacy_sale_unknown_since := null;
  end if;

  insert into public.company_activity (company_id, actor_user_id, event_type, entity_type, entity_id)
  values (v_company_id, v_user_id, 'team_member_left', 'team_member', v_member_id);

  update public.profiles
     set company_id = v_home_company_id,
         plan = v_home_plan,
         billing_cycle = v_home_cycle,
         subscription_status = v_home_status,
         subscription_expires_at = v_home_expiry,
         subscription_provider_sale_code = v_home_sale_code,
         subscription_legacy_sale_unknown_since = v_home_legacy_sale_unknown_since,
         updated_at = now()
   where id = v_user_id
     and company_id = v_company_id;

  delete from public.company_members where id = v_member_id;
  delete from private.company_member_return_state where user_id = v_user_id;

  if v_home_company_id is not null then
    select c.name into v_home_company_name
    from public.companies c where c.id = v_home_company_id;
  end if;

  return jsonb_build_object(
    'company_id', v_home_company_id,
    'company_name', v_home_company_name,
    'returned_to_company', v_home_company_id is not null
  );
end;
$function$;

revoke all on function public.leave_company_and_return() from public, anon;
grant execute on function public.leave_company_and_return() to authenticated;

create or replace function public.remove_company_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_member public.company_members%rowtype;
  v_return_state private.company_member_return_state%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select p.company_id into v_company_id from public.profiles p where p.id = v_user_id;
  if v_company_id is null or not exists (
    select 1 from public.company_members owner_member
    where owner_member.company_id = v_company_id and owner_member.user_id = v_user_id
      and owner_member.role = 'owner' and owner_member.status = 'active'
  ) then raise exception 'owner_required'; end if;

  select * into v_member from public.company_members cm
  where cm.id = p_membership_id and cm.company_id = v_company_id for update;
  if not found then raise exception 'member_not_found'; end if;
  if v_member.role <> 'member' then raise exception 'cannot_remove_owner'; end if;

  insert into public.company_activity (
    company_id, actor_user_id, event_type, entity_type, entity_id
  ) values (
    v_company_id, v_user_id,
    case when v_member.status = 'invited' then 'team_invitation_revoked' else 'team_member_removed' end,
    'team_member', v_member.id
  );

  if v_member.user_id is not null then
    select * into v_return_state
    from private.company_member_return_state rs
    where rs.user_id = v_member.user_id
    for update;

    if found then
      update public.profiles
         set company_id = v_return_state.home_company_id,
             plan = v_return_state.home_plan,
             billing_cycle = v_return_state.home_billing_cycle,
             subscription_status = v_return_state.home_subscription_status,
             subscription_expires_at = v_return_state.home_subscription_expires_at,
             subscription_provider_sale_code = v_return_state.home_subscription_provider_sale_code,
             subscription_legacy_sale_unknown_since = v_return_state.home_subscription_legacy_sale_unknown_since,
             updated_at = now()
       where id = v_member.user_id
         and company_id = v_company_id;

      delete from private.company_member_return_state where user_id = v_member.user_id;
    else
      update public.profiles
         set company_id = null,
             plan = 'free',
             billing_cycle = null,
             subscription_status = 'inactive',
             subscription_expires_at = null,
             subscription_provider_sale_code = null,
             subscription_legacy_sale_unknown_since = null,
             updated_at = now()
       where id = v_member.user_id
         and company_id = v_company_id;
    end if;
  end if;

  delete from public.company_members where id = v_member.id;
end;
$function$;

revoke all on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.remove_company_member(uuid) to authenticated;
