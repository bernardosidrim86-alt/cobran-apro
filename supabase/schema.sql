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

revoke all on function private.my_company_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.my_company_id() to authenticated;

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
create policy "whatsapp automation company" on public.whatsapp_automation_settings for all using (company_id = (select private.my_company_id())) with check (company_id = (select private.my_company_id()));
drop policy if exists "whatsapp connections company" on public.whatsapp_connections;
create policy "whatsapp connections company" on public.whatsapp_connections for all using (company_id = (select private.my_company_id())) with check (company_id = (select private.my_company_id()));

alter table public.message_logs add column if not exists automation_key text;
alter table public.message_logs add column if not exists error text;
create unique index if not exists message_logs_automation_once_idx on public.message_logs(charge_id, automation_key) where charge_id is not null and automation_key is not null;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.my_company_id() from public, anon;
grant execute on function public.my_company_id() to authenticated;


-- Hardening: client roles get only the Data API operations used by the app.
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;
revoke all on table public.companies, public.customers, public.charges, public.payments, public.ai_settings, public.company_settings, public.message_logs, public.whatsapp_automation_settings, public.whatsapp_connections from anon;
revoke execute on function public.create_my_company(text, text, text) from public, anon;
grant execute on function public.create_my_company(text, text, text) to authenticated;
alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke usage, select on sequences from anon;
