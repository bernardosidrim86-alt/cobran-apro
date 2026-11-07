-- Team invitations: one-time links, verified-email acceptance and owner-only controls.
alter table public.company_members
  add column if not exists invite_token_hash text,
  add column if not exists invite_expires_at timestamptz;

create index if not exists company_members_invite_expiry_idx
  on public.company_members(company_id, invite_expires_at)
  where role = 'member' and status = 'invited';

create or replace function public.get_company_team()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_role text;
  v_company_name text;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select p.company_id, cm.role into v_company_id, v_role
  from public.profiles p
  join public.company_members cm
    on cm.company_id = p.company_id
   and cm.user_id = p.id
   and cm.status = 'active'
  where p.id = v_user_id;

  if v_company_id is null or v_role is null then
    raise exception 'company_membership_required';
  end if;
  if not (select private.has_active_app_access()) then
    raise exception 'subscription_inactive';
  end if;

  select c.name into v_company_name
  from public.companies c where c.id = v_company_id;

  select jsonb_build_object(
    'company_id', v_company_id,
    'company_name', v_company_name,
    'my_role', v_role,
    'seat_limit', 5,
    'member_count', (
      select count(*)::integer
      from public.company_members cm
      where cm.company_id = v_company_id
        and (
          cm.status = 'active'
          or (cm.status = 'invited' and (cm.invite_expires_at is null or cm.invite_expires_at > now()))
        )
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', cm.id,
          'user_id', cm.user_id,
          'email', cm.email,
          'full_name', nullif(btrim(p.full_name), ''),
          'role', cm.role,
          'status', cm.status,
          'created_at', cm.created_at,
          'invite_expires_at', cm.invite_expires_at
        )
        order by case when cm.role = 'owner' then 0 else 1 end,
                 case when cm.status = 'active' then 0 else 1 end,
                 cm.created_at
      )
      from public.company_members cm
      left join public.profiles p on p.id = cm.user_id
      where cm.company_id = v_company_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;
revoke all on function public.get_company_team() from public, anon;
grant execute on function public.get_company_team() to authenticated;

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
  v_existing_company_id uuid;
  v_existing_role text;
  v_existing_status text;
  v_existing_expiry timestamptz;
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

  select cm.id, cm.company_id, cm.role, cm.status, cm.invite_expires_at
    into v_existing_id, v_existing_company_id, v_existing_role, v_existing_status, v_existing_expiry
  from public.company_members cm
  where lower(cm.email) = v_email
  order by cm.created_at desc limit 1
  for update;

  if v_existing_id is not null and v_existing_company_id <> v_company_id then
    if v_existing_status = 'active' or v_existing_expiry is null or v_existing_expiry > now() then
      raise exception 'email_already_in_another_company';
    end if;
  end if;

  select p.company_id into v_profile_company_id
  from public.profiles p where lower(p.email) = v_email limit 1;
  if v_profile_company_id is not null and v_profile_company_id <> v_company_id then
    raise exception 'email_already_in_another_company';
  elsif v_profile_company_id = v_company_id then
    raise exception 'member_already_exists';
  end if;

  if v_existing_id is not null and v_existing_company_id = v_company_id
     and (v_existing_role <> 'member' or v_existing_status = 'active') then
    raise exception 'member_already_exists';
  end if;
  if v_existing_id is not null and v_existing_company_id = v_company_id
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

  if v_existing_id is not null and v_existing_company_id = v_company_id then
    update public.company_members
    set email = v_email, invited_by = v_user_id, invite_token_hash = v_token_hash,
        invite_expires_at = v_expires_at, updated_at = now()
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
  v_existing_company_id uuid;
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

  select p.company_id into v_existing_company_id
  from public.profiles p where p.id = v_user_id for update;
  if v_existing_company_id is not null then raise exception 'already_linked_to_company'; end if;
  if exists (
    select 1 from public.company_members cm where cm.user_id = v_user_id and cm.status = 'active'
  ) then raise exception 'already_linked_to_company'; end if;

  select p.plan, p.billing_cycle, p.subscription_status, p.subscription_expires_at
    into v_owner_plan, v_owner_cycle, v_owner_status, v_owner_expiry
  from public.profiles p
  join public.company_members owner_member
    on owner_member.user_id = p.id and owner_member.company_id = v_company_id
   and owner_member.role = 'owner' and owner_member.status = 'active'
  where p.company_id = v_company_id;

  if v_owner_plan <> 'business' or v_owner_status not in ('active', 'cancelled')
     or v_owner_expiry is null or v_owner_expiry <= now() then
    raise exception 'business_plan_required';
  end if;

  update public.company_members
     set user_id = v_user_id, status = 'active', updated_at = now()
   where id = v_member_id;

  update public.profiles
     set company_id = v_company_id, plan = v_owner_plan, billing_cycle = v_owner_cycle,
         subscription_status = v_owner_status, subscription_expires_at = v_owner_expiry,
         updated_at = now()
   where id = v_user_id;

  insert into public.company_activity (company_id, actor_user_id, event_type, entity_type, entity_id)
  values (v_company_id, v_user_id, 'team_member_joined', 'team_member', v_member_id);

  select c.name into v_company_name from public.companies c where c.id = v_company_id;
  return jsonb_build_object('company_id', v_company_id, 'company_name', v_company_name, 'already_member', false);
end;
$function$;
revoke all on function public.accept_company_invitation(text) from public, anon;
grant execute on function public.accept_company_invitation(text) to authenticated;

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

  insert into public.company_activity (company_id, actor_user_id, event_type, entity_type, entity_id)
  values (
    v_company_id, v_user_id,
    case when v_member.status = 'invited' then 'team_invitation_revoked' else 'team_member_removed' end,
    'team_member', v_member.id
  );

  if v_member.user_id is not null then
    update public.profiles
       set company_id = null, plan = 'free', billing_cycle = null,
           subscription_status = 'inactive', subscription_expires_at = null,
           updated_at = now()
     where id = v_member.user_id and company_id = v_company_id;
  end if;

  delete from public.company_members where id = v_member.id;
end;
$function$;
revoke all on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.remove_company_member(uuid) to authenticated;
