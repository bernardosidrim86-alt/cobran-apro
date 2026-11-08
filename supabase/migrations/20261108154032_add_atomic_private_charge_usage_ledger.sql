-- Count charge creations in a private BEFORE INSERT ledger.
-- Each row in a bulk REST insert is counted before the next row is validated.

create table if not exists private.charge_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  charge_id uuid primary key,
  created_at timestamptz not null default now()
);
revoke all on table private.charge_usage from public,anon,authenticated,service_role;
create index if not exists charge_usage_company_created_idx on private.charge_usage(company_id,created_at);

insert into private.charge_usage(company_id,charge_id,created_at)
select company_id,entity_id,created_at
from public.company_activity
where entity_type='charges' and event_type='insert' and entity_id is not null
  and created_at>=date_trunc('month',now())
  and created_at<date_trunc('month',now())+interval '1 month'
on conflict(charge_id) do nothing;

insert into private.charge_usage(company_id,charge_id,created_at)
select company_id,id,created_at from public.charges
where created_at>=date_trunc('month',now())
  and created_at<date_trunc('month',now())+interval '1 month'
on conflict(charge_id) do nothing;

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
    v_month_start:=date_trunc('month',now());
    v_month_end:=v_month_start+interval '1 month';

    select count(*) into v_count from private.charge_usage
    where company_id=new.company_id and created_at>=v_month_start and created_at<v_month_end;

    if v_limit is not null and v_count>=v_limit then
      raise exception 'plan_charge_limit:%:%',v_plan,v_limit using errcode='P0001';
    end if;

    if new.id is null then raise exception 'charge_id_required'; end if;
    insert into private.charge_usage(company_id,charge_id,created_at)
    values(new.company_id,new.id,now());
  end if;

  new.created_at:=now();
  if tg_table_name='charges' then new.updated_at:=now(); end if;
  return new;
end;
$$;
revoke all on function private.enforce_plan_insert_limit() from public,anon,authenticated;
