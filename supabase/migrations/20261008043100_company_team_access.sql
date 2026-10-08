create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'invited' check (status in ('active', 'invited')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_members_email_normalized check (
    email is null or (email = lower(btrim(email)) and length(email) <= 320)
  )
);

create unique index company_members_company_user_uidx
  on public.company_members(company_id, user_id)
  where user_id is not null;
create unique index company_members_company_email_uidx
  on public.company_members(company_id, lower(email))
  where email is not null;
create index company_members_user_status_idx
  on public.company_members(user_id, status);
create index company_members_company_status_idx
  on public.company_members(company_id, status);
create index company_members_company_role_status_user_idx
  on public.company_members(company_id, role, status, user_id);

insert into public.company_members (company_id, user_id, email, role, status)
select p.company_id, p.id, nullif(lower(btrim(p.email)), ''), 'owner', 'active'
from public.profiles p
where p.company_id is not null
on conflict (company_id, user_id) where user_id is not null do nothing;

create table public.company_activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index company_activity_company_created_idx
  on public.company_activity(company_id, created_at desc);

alter table public.company_members enable row level security;
alter table public.company_activity enable row level security;

revoke all on table public.company_members from public, anon, authenticated;
grant select on table public.company_members to authenticated;
grant all on table public.company_members to service_role;
revoke all on table public.company_activity from public, anon, authenticated;
grant select on table public.company_activity to authenticated;
grant all on table public.company_activity to service_role;

create or replace function private.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = (select auth.uid())
      and cm.role = 'owner'
      and cm.status = 'active'
  )
$function$;
revoke all on function private.is_company_owner(uuid) from public, anon;
grant execute on function private.is_company_owner(uuid) to authenticated, service_role;

create policy company_members_read_company on public.company_members
for select to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
);

create policy company_activity_read_owner on public.company_activity
for select to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
);

drop policy if exists "company own" on public.companies;
create policy company_read_members on public.companies
for select to authenticated
using (
  id = (select private.my_company_id())
  and (select private.has_active_app_access())
);
create policy company_manage_owner on public.companies
for all to authenticated
using (
  id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(id))
)
with check (
  id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(id))
);

drop policy if exists "settings company" on public.company_settings;
create policy company_settings_read_members on public.company_settings
for select to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
);
create policy company_settings_manage_owner on public.company_settings
for all to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
)
with check (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
);

drop policy if exists "ai company" on public.ai_settings;
create policy ai_settings_read_members on public.ai_settings
for select to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
);
create policy ai_settings_manage_owner on public.ai_settings
for all to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
)
with check (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
);

drop policy if exists "whatsapp automation company" on public.whatsapp_automation_settings;
create policy whatsapp_automation_read_members on public.whatsapp_automation_settings
for select to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
);
create policy whatsapp_automation_manage_owner on public.whatsapp_automation_settings
for all to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
)
with check (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
);

drop policy if exists "company avatars delete" on storage.objects;
drop policy if exists "company avatars insert" on storage.objects;
drop policy if exists "company avatars update" on storage.objects;
drop policy if exists "company avatars select" on storage.objects;
create policy company_avatars_read_members on storage.objects
for select to authenticated
using (
  bucket_id = 'company-avatars'
  and (storage.foldername(name))[1] = (select private.my_company_id())::text
  and (select private.has_active_app_access())
);
create policy company_avatars_delete_owner on storage.objects
for delete to authenticated
using (
  bucket_id = 'company-avatars'
  and (storage.foldername(name))[1] = (select private.my_company_id())::text
  and (select private.has_active_app_access())
  and (select private.is_company_owner((select private.my_company_id())))
);
create policy company_avatars_insert_owner on storage.objects
for insert to authenticated
with check (
  bucket_id = 'company-avatars'
  and (storage.foldername(name))[1] = (select private.my_company_id())::text
  and (select private.has_active_app_access())
  and (select private.is_company_owner((select private.my_company_id())))
);
create policy company_avatars_update_owner on storage.objects
for update to authenticated
using (
  bucket_id = 'company-avatars'
  and (storage.foldername(name))[1] = (select private.my_company_id())::text
  and (select private.has_active_app_access())
  and (select private.is_company_owner((select private.my_company_id())))
)
with check (
  bucket_id = 'company-avatars'
  and (storage.foldername(name))[1] = (select private.my_company_id())::text
  and (select private.has_active_app_access())
  and (select private.is_company_owner((select private.my_company_id())))
);

drop policy if exists "whatsapp connections company" on public.whatsapp_connections;
create policy whatsapp_connections_read_members on public.whatsapp_connections
for select to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
);
create policy whatsapp_connections_manage_owner on public.whatsapp_connections
for all to authenticated
using (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
)
with check (
  company_id = (select private.my_company_id())
  and (select private.has_active_app_access())
  and (select private.is_company_owner(company_id))
);

create or replace function private.has_active_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p.id is null or cm.user_id is null then false
    when cm.role = 'owner' then
      case
        when p.plan = 'free' then p.subscription_status in ('inactive', 'pending')
          and coalesce(u.created_at, now()) + interval '7 days' > now()
        else p.subscription_status in ('active', 'cancelled')
          and p.subscription_expires_at is not null
          and p.subscription_expires_at > now()
      end
    when cm.role = 'member' then exists (
      select 1
      from public.company_members owner_member
      join public.profiles owner_profile on owner_profile.id = owner_member.user_id
      where owner_member.company_id = p.company_id
        and owner_member.role = 'owner'
        and owner_member.status = 'active'
        and owner_profile.plan = 'business'
        and owner_profile.subscription_status in ('active', 'cancelled')
        and owner_profile.subscription_expires_at > now()
    )
    else false
  end
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.company_members cm
    on cm.user_id = p.id
   and cm.company_id = p.company_id
   and cm.status = 'active'
  where p.id = (select auth.uid())
$function$;

create or replace function private.ensure_company_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.company_id is not null and not exists (
    select 1 from public.company_members cm
    where cm.company_id = new.company_id and cm.user_id = new.id
  ) then
    insert into public.company_members (company_id, user_id, email, role, status)
    values (new.company_id, new.id, nullif(lower(btrim(new.email)), ''), 'owner', 'active')
    on conflict (company_id, user_id) where user_id is not null do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function private.ensure_company_owner_membership() from public, anon, authenticated;

create trigger a_ensure_company_owner_membership
after insert or update of company_id, email on public.profiles
for each row execute function private.ensure_company_owner_membership();

create or replace function private.sync_company_member_entitlements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.company_id is null
     or not exists (
       select 1 from public.company_members cm
       where cm.company_id = new.company_id
         and cm.user_id = new.id
         and cm.role = 'owner'
         and cm.status = 'active'
     ) then
    return new;
  end if;

  if new.plan = 'business'
     and new.subscription_status in ('active', 'cancelled')
     and new.subscription_expires_at > now() then
    update public.profiles member_profile
       set plan = 'business',
           billing_cycle = new.billing_cycle,
           subscription_status = 'active',
           subscription_expires_at = new.subscription_expires_at
      from public.company_members cm
     where cm.company_id = new.company_id
       and cm.user_id = member_profile.id
       and cm.role = 'member'
       and cm.status in ('active', 'invited')
       and member_profile.id <> new.id;
  else
    update public.profiles member_profile
       set plan = 'free',
           billing_cycle = null,
           subscription_status = 'inactive',
           subscription_expires_at = null
      from public.company_members cm
     where cm.company_id = new.company_id
       and cm.user_id = member_profile.id
       and cm.role = 'member'
       and cm.status in ('active', 'invited')
       and member_profile.id <> new.id;
  end if;

  return new;
end;
$function$;
revoke all on function private.sync_company_member_entitlements() from public, anon, authenticated;

create trigger z_sync_company_member_entitlements
after update of company_id, plan, billing_cycle, subscription_status, subscription_expires_at
on public.profiles
for each row execute function private.sync_company_member_entitlements();

create or replace function private.activate_company_invite_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_confirmation_changed boolean := false;
begin
  if new.confirmed_at is not null then
    if tg_op = 'INSERT' then
      v_confirmation_changed := true;
    else
      v_confirmation_changed := old.confirmed_at is distinct from new.confirmed_at;
    end if;
  end if;

  if v_confirmation_changed then
    update public.company_members
       set status = 'active',
           updated_at = now()
     where user_id = new.id
       and status = 'invited';
  end if;
  return new;
end;
$function$;
revoke all on function private.activate_company_invite_on_confirmation() from public, anon, authenticated;

create trigger auth_user_confirmation_activates_company_invite
after update of confirmed_at on auth.users
for each row
when (old.confirmed_at is distinct from new.confirmed_at and new.confirmed_at is not null)
execute function private.activate_company_invite_on_confirmation();

create trigger auth_user_confirmation_activates_company_invite_on_insert
after insert on auth.users
for each row
when (new.confirmed_at is not null)
execute function private.activate_company_invite_on_confirmation();

create or replace function private.activate_confirmed_company_member_on_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.user_id is not null and new.status = 'invited' and exists (
    select 1 from auth.users u
    where u.id = new.user_id and u.confirmed_at is not null
  ) then
    update public.company_members
       set status = 'active',
           updated_at = now()
     where id = new.id and status = 'invited';
  end if;
  return new;
end;
$function$;
revoke all on function private.activate_confirmed_company_member_on_link() from public, anon, authenticated;

create trigger company_member_link_activates_confirmed_user
after insert or update of user_id on public.company_members
for each row execute function private.activate_confirmed_company_member_on_link();

create or replace function private.audit_company_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company_id uuid;
  v_entity_id uuid;
  v_fields text[] := '{}';
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_entity_id := old.id;
  else
    v_company_id := new.company_id;
    v_entity_id := new.id;
  end if;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}')
      into v_fields
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key <> 'updated_at';
  end if;

  if v_company_id is not null then
    insert into public.company_activity (
      company_id, actor_user_id, event_type, entity_type, entity_id, changed_fields
    ) values (
      v_company_id,
      (select auth.uid()),
      lower(tg_op),
      tg_table_name,
      v_entity_id,
      v_fields
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function private.audit_company_row() from public, anon, authenticated;

create trigger company_activity_customers
after insert or update or delete on public.customers
for each row execute function private.audit_company_row();
create trigger company_activity_charges
after insert or update or delete on public.charges
for each row execute function private.audit_company_row();
create trigger company_activity_payments
after insert or update or delete on public.payments
for each row execute function private.audit_company_row();
create trigger company_activity_message_logs
after insert or update or delete on public.message_logs
for each row execute function private.audit_company_row();

create or replace function public.reserve_company_invite(
  p_company_id uuid,
  p_email text,
  p_invited_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_email text := lower(btrim(p_email));
  v_used integer;
  v_invite_id uuid;
begin
  if v_email is null or length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;

  perform 1 from public.companies where id = p_company_id for update;
  if not found then raise exception 'company_not_found'; end if;

  if not exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = p_invited_by
      and cm.role = 'owner'
      and cm.status = 'active'
  ) then
    raise exception 'owner_required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_invited_by
      and p.company_id = p_company_id
      and p.plan = 'business'
      and p.subscription_status in ('active', 'cancelled')
      and p.subscription_expires_at > now()
  ) then
    raise exception 'business_plan_required';
  end if;

  select count(*) into v_used
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.status in ('active', 'invited');

  if v_used >= 5 then raise exception 'seat_limit_reached'; end if;

  if exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id
      and lower(cm.email) = v_email
  ) then
    raise exception 'member_already_exists';
  end if;

  insert into public.company_members (company_id, email, role, status, invited_by)
  values (p_company_id, v_email, 'member', 'invited', p_invited_by)
  returning id into v_invite_id;

  insert into public.company_activity (
    company_id, actor_user_id, event_type, entity_type, entity_id
  ) values (
    p_company_id, p_invited_by, 'team_member_invited', 'team_member', v_invite_id
  );

  return v_invite_id;
end;
$function$;
revoke all on function public.reserve_company_invite(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_company_invite(uuid, text, uuid) to service_role;

create or replace function public.revoke_company_member(
  p_company_id uuid,
  p_membership_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_member public.company_members%rowtype;
begin
  if not exists (
    select 1 from public.company_members owner_member
    where owner_member.company_id = p_company_id
      and owner_member.user_id = p_actor_id
      and owner_member.role = 'owner'
      and owner_member.status = 'active'
  ) then
    raise exception 'owner_required';
  end if;

  select * into v_member
  from public.company_members
  where id = p_membership_id
    and company_id = p_company_id
  for update;

  if not found then raise exception 'member_not_found'; end if;
  if v_member.role <> 'member' then raise exception 'cannot_remove_owner'; end if;

  if v_member.user_id is not null then
    update public.profiles
       set company_id = null,
           plan = 'free',
           billing_cycle = null,
           subscription_status = 'inactive',
           subscription_expires_at = null
     where id = v_member.user_id
       and company_id = p_company_id;
  end if;

  insert into public.company_activity (
    company_id, actor_user_id, event_type, entity_type, entity_id
  ) values (
    p_company_id, p_actor_id, 'team_member_removed', 'team_member', v_member.id
  );

  delete from public.company_members where id = v_member.id;
end;
$function$;
revoke all on function public.revoke_company_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_company_member(uuid, uuid, uuid) to service_role;
