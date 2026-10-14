CREATE OR REPLACE FUNCTION private.has_active_app_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select case
    when p.id is null then false
    when p.company_id is null
      and p.plan = 'free'
      and p.subscription_status in ('inactive', 'pending')
      and coalesce(u.created_at, now()) + interval '7 days' > now()
      then true
    when p.company_id is null
      and p.plan in ('essencial', 'profissional', 'business')
      and p.subscription_status in ('active', 'cancelled')
      and p.subscription_expires_at is not null
      and p.subscription_expires_at > now()
      then true
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
