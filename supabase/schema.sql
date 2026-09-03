-- ============================================================
--  Site Visit Log — Supabase schema
--  Run once in Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1) Profiles: one row per auth user -------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text,
  role       text not null default 'tech' check (role in ('tech','admin')),
  created_at timestamptz not null default now()
);

-- keep profiles in sync with auth.users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.email),
          coalesce(new.raw_user_meta_data->>'role', 'tech'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper: is the caller an admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- 2) Visits ---------------------------------------------------
create table if not exists public.visits (
  id          uuid primary key,
  owner       uuid not null references auth.users on delete cascade,
  author_name text,
  client      text,
  site        text,
  city        text,
  visit_date  date,
  loc         text,
  notes       text,
  wall_t      int  not null default 100,
  data        jsonb not null default '{}'::jsonb,   -- drawing, blocks, items, view, photo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists visits_owner_idx on public.visits (owner);
create index if not exists visits_date_idx  on public.visits (visit_date desc);
create index if not exists visits_client_idx on public.visits (client);

-- 3) Row level security --------------------------------------
alter table public.profiles enable row level security;
alter table public.visits   enable row level security;

-- profiles: everyone signed in can read the team list; you edit your own row; admins edit anyone
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin());

-- visits: the whole team can read; you create your own; you edit/delete your own, admins any
drop policy if exists visits_read on public.visits;
create policy visits_read on public.visits
  for select to authenticated using (true);

drop policy if exists visits_insert on public.visits;
create policy visits_insert on public.visits
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists visits_update on public.visits;
create policy visits_update on public.visits
  for update to authenticated using (owner = auth.uid() or public.is_admin());

drop policy if exists visits_delete on public.visits;
create policy visits_delete on public.visits
  for delete to authenticated using (owner = auth.uid() or public.is_admin());

-- 4) touch updated_at ----------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists visits_touch on public.visits;
create trigger visits_touch before update on public.visits
  for each row execute function public.touch_updated_at();


-- 6) Type thumbnail library ---------------------------------
-- One image per item type (table, sink, hood ...). Upload your own
-- SolidWorks / AutoCAD renders once and every item of that type uses them.
create table if not exists public.type_thumbs (
  type       text primary key,
  image      text not null,             -- data URL (downscaled JPEG)
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);

alter table public.type_thumbs enable row level security;

drop policy if exists thumbs_read on public.type_thumbs;
create policy thumbs_read on public.type_thumbs
  for select to authenticated using (true);

drop policy if exists thumbs_write on public.type_thumbs;
create policy thumbs_write on public.type_thumbs
  for all to authenticated using (true) with check (true);

-- 5) Make yourself an admin (run after your first sign-up):
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@company.com');
