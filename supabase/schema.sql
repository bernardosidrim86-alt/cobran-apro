-- CobrançaPro - schema inicial
create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text,
  phone text,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  created_at timestamptz not null default now()
);

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

create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

drop policy if exists "company own" on public.companies;
create policy "company own" on public.companies for all using (id = public.my_company_id()) with check (id = public.my_company_id());

drop policy if exists "profile own" on public.profiles;
create policy "profile own" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "customers company" on public.customers;
create policy "customers company" on public.customers for all using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

drop policy if exists "charges company" on public.charges;
create policy "charges company" on public.charges for all using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

drop policy if exists "payments company" on public.payments;
create policy "payments company" on public.payments for all using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

drop policy if exists "ai company" on public.ai_settings;
create policy "ai company" on public.ai_settings for all using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

drop policy if exists "settings company" on public.company_settings;
create policy "settings company" on public.company_settings for all using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

drop policy if exists "messages company" on public.message_logs;
create policy "messages company" on public.message_logs for all using (company_id = public.my_company_id()) with check (company_id = public.my_company_id());

-- Cria a empresa do usuário no onboarding (RLS impede o insert direto antes do vínculo).
create or replace function public.create_my_company(p_name text, p_segment text default null, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select company_id into v_company_id from public.profiles where id = auth.uid();
  if v_company_id is not null then
    return v_company_id;
  end if;

  insert into public.companies (name, segment, phone)
  values (coalesce(nullif(trim(p_name), ''), 'Minha empresa'), p_segment, p_phone)
  returning id into v_company_id;

  insert into public.profiles (id, company_id)
  values (auth.uid(), v_company_id)
  on conflict (id) do update set company_id = excluded.company_id;

  return v_company_id;
end;
$$;

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
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
