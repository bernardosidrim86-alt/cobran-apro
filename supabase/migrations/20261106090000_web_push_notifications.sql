create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  user_agent text,
  notify_payments boolean not null default true,
  notify_due boolean not null default true,
  notify_overdue boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

drop policy if exists "push subscriptions select own" on public.push_subscriptions;
create policy "push subscriptions select own"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
create policy "push subscriptions insert own"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "push subscriptions update own" on public.push_subscriptions;
create policy "push subscriptions update own"
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
create policy "push subscriptions delete own"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.push_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  created_at timestamptz not null default now(),
  unique(user_id, event_key)
);

alter table public.push_delivery_log enable row level security;
revoke all on table public.push_delivery_log from public, anon, authenticated;
grant select, insert, delete on table public.push_delivery_log to service_role;
