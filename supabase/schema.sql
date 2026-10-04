-- CobrançaPro - schema inicial
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text,
  phone text,
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  avatar_url text
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  created_at timestamptz not null default now(),
  email text,
  plan text not null default 'free' check (plan in ('free','essencial','profissional','business')),
  billing_cycle text check (billing_cycle is null or billing_cycle in ('monthly','annual')),
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive','pending','active','cancelled','refunded','expired')),
  subscription_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  provider text not null default 'perfectpay',
  provider_plan_code text,
  provider_sale_code text unique,
  plan text not null check (plan in ('essencial','profissional','business')),
  billing_cycle text not null check (billing_cycle in ('monthly','annual')),
  status text not null default 'pending' check (status in ('pending','active','cancelled','refunded','expired')),
  amount numeric,
  currency text not null default 'BRL',
  customer_email text,
  expires_at timestamptz,
  last_event_status text,
  last_event_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_company_id_idx on public.subscriptions(company_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions own" on public.subscriptions;
create policy "subscriptions own" on public.subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  payment_method text,
  recurrence text not null default 'none',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  charge_id uuid not null references public.charges(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  paid_at timestamptz not null default now(),
  payment_method text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid unique not null references public.companies(id) on delete cascade,
  assistant_name text not null default 'Assistente CobrançaPro',
  tone text not null default 'friendly',
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid unique not null references public.companies(id) on delete cascade,
  whatsapp_connected boolean not null default false,
  default_payment_methods text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  charge_id uuid references public.charges(id) on delete set null,
  channel text not null default 'whatsapp',
  message text not null,
  status text not null default 'draft',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customers_company_id_idx on public.customers(company_id);
create index if not exists charges_company_id_idx on public.charges(company_id);
create index if not exists charges_due_date_idx on public.charges(due_date);
create index if not exists payments_company_id_idx on public.payments(company_id);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.ai_settings enable row level security;
alter table public.company_settings enable row level security;
alter table public.message_logs enable row level security;

create schema if not exists private;

create or replace function private.has_active_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select case
    when p.id is null then false
    when p.plan = 'free' then
      coalesce(u.created_at, now()) + interval '7 days' > now()
    else
      p.subscription_status = 'active'
      and p.subscription_expires_at is not null
      and p.subscription_expires_at > now()
  end
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = (select auth.uid())
$;

revoke all on function private.has_active_app_access() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_active_app_access() to authenticated;

create or replace function private.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id
  from public.profiles
  where id = (select auth.uid())
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.my_company_id() from public, anon;
grant execute on function private.my_company_id() to authenticated;
grant execute on function private.my_company_id() to authenticated;

drop policy if exists "company own" on public.companies;
create policy "company own" on public.companies for all to authenticated using ((select private.has_active_app_access()) and id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and id = (select private.my_company_id()));
drop policy if exists "profile own" on public.profiles;
drop policy if exists "profile own select" on public.profiles;
drop policy if exists "profile own update" on public.profiles;
create policy "profile own select" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profile own update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists "customers company" on public.customers;
create policy "customers company" on public.customers for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
drop policy if exists "charges company" on public.charges;
create policy "charges company" on public.charges for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
drop policy if exists "payments company" on public.payments;
create policy "payments company" on public.payments for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
drop policy if exists "ai company" on public.ai_settings;
create policy "ai company" on public.ai_settings for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
drop policy if exists "settings company" on public.company_settings;
create policy "settings company" on public.company_settings for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
drop policy if exists "messages company" on public.message_logs;
create policy "messages company" on public.message_logs for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
alter table public.subscriptions enable row level security;
drop policy if exists "subscription own" on public.subscriptions;
drop policy if exists "subscription own select" on public.subscriptions;
create policy "subscription own select" on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));
create or replace function private.create_my_company_impl(p_name text, p_segment text default null, p_phone text default null) returns uuid language plpgsql security definer set search_path = '' as $fn$ declare v_company_id uuid; begin if (select auth.uid()) is null then raise exception 'not authenticated'; end if; if not (select private.has_active_app_access()) then raise exception 'subscription_inactive'; end if; select company_id into v_company_id from public.profiles where id = (select auth.uid()); if v_company_id is not null then return v_company_id; end if; insert into public.companies (name, segment, phone) values (coalesce(nullif(trim(p_name), ''), 'Minha empresa'), nullif(trim(coalesce(p_segment, '')), ''), nullif(trim(coalesce(p_phone, '')), '')) returning id into v_company_id; update public.profiles set company_id = v_company_id where id = (select auth.uid()) and company_id is null; return v_company_id; end; $fn$;
revoke all on function private.create_my_company_impl(text, text, text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_my_company_impl(text, text, text) to authenticated;
create or replace function public.create_my_company(p_name text, p_segment text default null, p_phone text default null) returns uuid language sql security invoker set search_path = '' as $fn$ select private.create_my_company_impl($1, $2, $3); $fn$;
revoke all on function public.create_my_company(text, text, text) from public, anon;
grant execute on function public.create_my_company(text, text, text) to authenticated;

-- Trigger para criar perfil após cadastro.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- WhatsApp automation
create table if not exists public.whatsapp_automation_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid unique not null references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  reminder_before_days integer not null default 1 check (reminder_before_days between 0 and 30),
  reminder_on_due boolean not null default true,
  reminder_after_days integer[] not null default '{1,3,7}',
  send_start_hour smallint not null default 8 check (send_start_hour between 0 and 23),
  send_end_hour smallint not null default 18 check (send_end_hour between 0 and 23),
  template_before text not null default 'Olá {nome}! Passando para lembrar que sua cobrança de {valor} vence em {vencimento}.',
  template_due text not null default 'Olá {nome}! Sua cobrança de {valor} vence hoje ({vencimento}).',
  template_after text not null default 'Olá {nome}! Identificamos que sua cobrança de {valor}, com vencimento em {vencimento}, está em aberto.',
  template_before_name text,
  template_due_name text,
  template_after_name text,
  template_language text not null default 'pt_BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid unique not null references public.companies(id) on delete cascade,
  phone_number_id text,
  business_account_id text,
  display_phone text,
  status text not null default 'disconnected' check (status in ('disconnected','pending','connected','error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_automation_settings enable row level security;
alter table public.whatsapp_connections enable row level security;

drop policy if exists "whatsapp automation company" on public.whatsapp_automation_settings;
create policy "whatsapp automation company" on public.whatsapp_automation_settings for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));
drop policy if exists "whatsapp connections company" on public.whatsapp_connections;
create policy "whatsapp connections company" on public.whatsapp_connections for all to authenticated using ((select private.has_active_app_access()) and company_id = (select private.my_company_id())) with check ((select private.has_active_app_access()) and company_id = (select private.my_company_id()));

alter table public.message_logs add column if not exists automation_key text;
alter table public.message_logs add column if not exists error text;
create unique index if not exists message_logs_automation_once_idx on public.message_logs(charge_id, automation_key) where charge_id is not null and automation_key is not null;

revoke all on function public.handle_new_user() from public, anon, authenticated;


-- Hardening: client roles get only the Data API operations used by the app.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;
revoke all on table public.companies, public.customers, public.charges, public.payments, public.ai_settings, public.company_settings, public.message_logs, public.whatsapp_automation_settings, public.whatsapp_connections from anon, authenticated;
grant select, insert, update, delete on table public.companies, public.customers, public.charges, public.payments, public.ai_settings, public.company_settings, public.message_logs, public.whatsapp_automation_settings, public.whatsapp_connections to authenticated;
revoke execute on function public.create_my_company(text, text, text) from public, anon;
grant execute on function public.create_my_company(text, text, text) to authenticated;
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;

-- Hardening: company avatar storage must never accept anonymous uploads.
revoke all on table storage.objects from anon;
grant select on table storage.objects to anon;
grant select, insert, update, delete on table storage.objects to authenticated;

drop policy if exists "company avatars select" on storage.objects;
create policy "company avatars select"
on storage.objects
for select to authenticated
using (
  bucket_id = 'company-avatars'
  and (storage.foldername(name))[1] = (
    select (profiles.company_id)::text
    from public.profiles
    where profiles.id = auth.uid()
  )
);

update storage.buckets
set file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'company-avatars';

-- Hardening: enforce access and plan limits in the database, not only in the browser.
create or replace function private.enforce_plan_insert_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  v_uid uuid := (select auth.uid());
  v_plan text;
  v_limit integer;
  v_count bigint;
  v_company_id uuid;
  v_month_start timestamptz;
  v_month_end timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.plan, p.company_id
    into v_plan, v_company_id
    from public.profiles p
   where p.id = v_uid;

  if v_company_id is null or v_company_id <> new.company_id then
    raise exception 'company_access_denied';
  end if;

  if not (select private.has_active_app_access()) then
    raise exception 'subscription_inactive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text, 0));

  if tg_table_name = 'customers' then
    v_limit := case v_plan
      when 'free' then 10
      when 'essencial' then 50
      when 'profissional' then 200
      else null
    end;

    if v_limit is not null then
      select count(*) into v_count
      from public.customers
      where company_id = new.company_id;

      if v_count >= v_limit then
        raise exception 'plan_customer_limit:%:%', v_plan, v_limit using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name = 'charges' then
    v_limit := case v_plan
      when 'free' then 20
      when 'essencial' then 150
      when 'profissional' then 500
      else null
    end;

    if v_limit is not null then
      v_month_start := date_trunc('month', now());
      v_month_end := v_month_start + interval '1 month';

      select count(*) into v_count
      from public.charges
      where company_id = new.company_id
        and created_at >= v_month_start
        and created_at < v_month_end;

      if v_count >= v_limit then
        raise exception 'plan_charge_limit:%:%', v_plan, v_limit using errcode = 'P0001';
      end if;
    end if;
  end if;

  new.created_at := now();
  if tg_table_name = 'charges' then
    new.updated_at := now();
  end if;

  return new;
end;
$;

revoke all on function private.enforce_plan_insert_limit() from public, anon, authenticated;

drop trigger if exists enforce_customer_plan_insert on public.customers;
create trigger enforce_customer_plan_insert before insert on public.customers
for each row execute function private.enforce_plan_insert_limit();

drop trigger if exists enforce_charge_plan_insert on public.charges;
create trigger enforce_charge_plan_insert before insert on public.charges
for each row execute function private.enforce_plan_insert_limit();

create or replace function private.guard_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  new.id := old.id;
  new.company_id := old.company_id;
  new.created_at := old.created_at;
  return new;
end;
$;

revoke all on function private.guard_immutable_fields() from public, anon, authenticated;

drop trigger if exists guard_customer_immutable_fields on public.customers;
create trigger guard_customer_immutable_fields before update on public.customers
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_charge_immutable_fields on public.charges;
create trigger guard_charge_immutable_fields before update on public.charges
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_payment_immutable_fields on public.payments;
create trigger guard_payment_immutable_fields before update on public.payments
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_message_log_immutable_fields on public.message_logs;
create trigger guard_message_log_immutable_fields before update on public.message_logs
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_ai_settings_immutable_fields on public.ai_settings;
create trigger guard_ai_settings_immutable_fields before update on public.ai_settings
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_company_settings_immutable_fields on public.company_settings;
create trigger guard_company_settings_immutable_fields before update on public.company_settings
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_whatsapp_automation_immutable_fields on public.whatsapp_automation_settings;
create trigger guard_whatsapp_automation_immutable_fields before update on public.whatsapp_automation_settings
for each row execute function private.guard_immutable_fields();

drop trigger if exists guard_whatsapp_connections_immutable_fields on public.whatsapp_connections;
create trigger guard_whatsapp_connections_immutable_fields before update on public.whatsapp_connections
for each row execute function private.guard_immutable_fields();

alter table public.customers add constraint customers_company_id_id_key unique (company_id, id);
alter table public.charges add constraint charges_company_id_id_key unique (company_id, id);

alter table public.charges drop constraint if exists charges_customer_id_fkey;
alter table public.charges add constraint charges_customer_company_fkey
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade;

alter table public.payments add constraint payments_company_id_id_key unique (company_id, id);
alter table public.payments drop constraint if exists payments_charge_id_fkey;
alter table public.payments add constraint payments_charge_company_fkey
  foreign key (company_id, charge_id) references public.charges (company_id, id) on delete cascade;

alter table public.payments drop constraint if exists payments_customer_id_fkey;
alter table public.payments add constraint payments_customer_company_fkey
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete cascade;

alter table public.message_logs drop constraint if exists message_logs_customer_id_fkey;
alter table public.message_logs add constraint message_logs_customer_company_fkey
  foreign key (company_id, customer_id) references public.customers (company_id, id) on delete set null;

alter table public.message_logs drop constraint if exists message_logs_charge_id_fkey;
alter table public.message_logs add constraint message_logs_charge_company_fkey
  foreign key (company_id, charge_id) references public.charges (company_id, id) on delete set null;


-- Hardening: server-side rate limit for the AI endpoint.
create table if not exists private.ai_rate_limits (
  user_id uuid primary key,
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0,
  day_started_at date not null default current_date,
  day_count integer not null default 0
);

alter table private.ai_rate_limits enable row level security;

drop policy if exists "ai rate limit own" on private.ai_rate_limits;
create policy "ai rate limit own"
on private.ai_rate_limits
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on table private.ai_rate_limits from public, anon;
grant select, insert, update on table private.ai_rate_limits to authenticated;

create or replace function public.consume_ai_rate_limit()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz := now();
  v_today date := current_date;
  v_allowed boolean;
begin
  if v_uid is null then
    return false;
  end if;

  insert into private.ai_rate_limits(user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select
    case
      when day_started_at < v_today then true
      when day_count >= 300 then false
      when window_started_at < v_now - interval '10 minutes' then true
      when window_count >= 30 then false
      else true
    end
  into v_allowed
  from private.ai_rate_limits
  where user_id = v_uid
  for update;

  if not v_allowed then
    return false;
  end if;

  update private.ai_rate_limits
     set window_started_at = case
           when window_started_at < v_now - interval '10 minutes' then v_now
           else window_started_at
         end,
         window_count = case
           when window_started_at < v_now - interval '10 minutes' then 1
           else window_count + 1
         end,
         day_started_at = case
           when day_started_at < v_today then v_today
           else day_started_at
         end,
         day_count = case
           when day_started_at < v_today then 1
           else day_count + 1
         end
   where user_id = v_uid;

  return true;
end;
$function$;

revoke all on function public.consume_ai_rate_limit() from public, anon;
grant execute on function public.consume_ai_rate_limit() to authenticated;
