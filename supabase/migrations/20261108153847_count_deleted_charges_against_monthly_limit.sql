-- Count every charge creation in the current month, even when the charge is later deleted.
-- This first version uses the append-only audit events. The following atomic-ledger
-- migration moves enforcement into a private BEFORE INSERT counter for bulk inserts.

do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='charges'
      and t.tgname='company_activity_charges'
      and not t.tgisinternal and t.tgenabled='O'
  ) then
    raise exception 'Required company_activity_charges audit trigger is missing or disabled';
  end if;
end;
$$;

revoke insert, update, delete, truncate on public.company_activity from public, anon, authenticated;

create index if not exists company_activity_charge_insert_count_idx
  on public.company_activity (company_id, created_at)
  where entity_type='charges' and event_type='insert';

create or replace function private.enforce_plan_insert_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan text;
  v_limit integer;
  v_count bigint;
  v_company_id uuid;
  v_month_start timestamptz;
  v_month_end timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select p.plan,p.company_id into v_plan,v_company_id from public.profiles p where p.id=v_uid;
  if v_company_id is null or v_company_id<>new.company_id then raise exception 'company_access_denied'; end if;
  if not (select private.has_active_app_access()) then raise exception 'subscription_inactive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));

  if tg_table_name='customers' then
    v_limit:=case v_plan when 'free' then 10 when 'essencial' then 50 when 'profissional' then 200 else null end;
    if v_limit is not null then
      select count(*) into v_count from public.customers where company_id=new.company_id;
      if v_count>=v_limit then raise exception 'plan_customer_limit:%:%',v_plan,v_limit using errcode='P0001'; end if;
    end if;
  elsif tg_table_name='charges' then
    v_limit:=case v_plan when 'free' then 20 when 'essencial' then 150 when 'profissional' then 500 else null end;
    if v_limit is not null then
      v_month_start:=date_trunc('month',now());
      v_month_end:=v_month_start+interval '1 month';
      select count(*) into v_count from public.company_activity
       where company_id=new.company_id and entity_type='charges' and event_type='insert'
         and created_at>=v_month_start and created_at<v_month_end;
      if v_count>=v_limit then raise exception 'plan_charge_limit:%:%',v_plan,v_limit using errcode='P0001'; end if;
    end if;
  end if;
  new.created_at:=now();
  if tg_table_name='charges' then new.updated_at:=now(); end if;
  return new;
end;
$$;
revoke all on function private.enforce_plan_insert_limit() from public,anon,authenticated;
