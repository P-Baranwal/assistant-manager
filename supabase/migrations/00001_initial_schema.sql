-- ============================================================
-- Clerify: Initial Database Schema
-- Phase 1 — Auth + Cloud Sync
-- ============================================================

-- Enable Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. Profiles table
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text default '',
  skills text default '',
  priority_preset text check (priority_preset in ('Balanced', 'Deadline-first', 'Difficulty-first', 'Easiest-first')) default 'Balanced',
  custom_priority_rule text default '',
  provider text check (provider in ('ollama', 'anthropic', 'openai', 'gemini', 'groq')) default 'ollama',
  ollama_url text default 'http://localhost:11434',
  ollama_model text default 'qwen2.5-coder:7b',
  -- API key encrypted at rest via pgcrypto (see Phase 1.7 functions below)
  api_key_encrypted bytea,
  tier text check (tier in ('student', 'professional', 'free', 'pro', 'team')) default 'student',
  default_project_id uuid,
  theme text check (theme in ('light', 'dark', 'system')) default 'system',
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 2. Projects table
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Project',
  client_context text default '',
  status text check (status in ('active', 'done')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FK from profiles.default_project_id -> projects.id
alter table public.profiles
  add constraint fk_profiles_default_project
  foreign key (default_project_id) references public.projects(id) on delete set null;

-- ============================================================
-- 3. Assignments table (Student mode)
-- ============================================================
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  type text not null default 'Other',
  deadline date,
  status text not null default 'active',
  difficulty integer check (difficulty >= 1 and difficulty <= 10) default 5,
  difficulty_reasoning text default '',
  estimated_hours numeric(5, 2) check (estimated_hours >= 0) default 1.0,
  estimated_hours_reasoning text default '',
  priority_score integer check (priority_score >= 0 and priority_score <= 100) default 50,
  priority_reasoning text default '',
  boost jsonb not null default '{"active": false, "reason": null, "boostedPriorityScore": null}'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  raw_content text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  analyzed_at timestamptz default now()
);

-- ============================================================
-- 4. Tasks table (Professional mode)
-- ============================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null default 'Untitled',
  description text default '',
  status text not null default 'active',
  priority_score integer check (priority_score >= 0 and priority_score <= 100) default 50,
  priority_reasoning text default '',
  boost jsonb not null default '{"active": false, "reason": null, "boostedPriorityScore": null}'::jsonb,
  deadline date,
  actual_hours numeric(5, 2) check (actual_hours >= 0) default 0.0,
  estimated_hours numeric(5, 2) check (estimated_hours >= 0) default 1.0,
  impact_score integer check (impact_score >= 1 and impact_score <= 10),
  blocker_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 5. Row Level Security (RLS)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.assignments enable row level security;
alter table public.tasks enable row level security;

create policy "Users can manage their own profile"
  on public.profiles for all using (auth.uid() = id);

create policy "Users can manage their own projects"
  on public.projects for all using (auth.uid() = user_id);

create policy "Users can manage their own assignments"
  on public.assignments for all using (auth.uid() = user_id);

create policy "Users can manage their own tasks"
  on public.tasks for all using (auth.uid() = user_id);

-- ============================================================
-- 6. Auto-create profile on new user signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, theme, tier)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'system',
    'student'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 7. Auto-update `updated_at` timestamp
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

create trigger set_updated_at_projects
  before update on public.projects
  for each row execute procedure public.update_updated_at_column();

create trigger set_updated_at_assignments
  before update on public.assignments
  for each row execute procedure public.update_updated_at_column();

create trigger set_updated_at_tasks
  before update on public.tasks
  for each row execute procedure public.update_updated_at_column();

-- ============================================================
-- 8. BYOK Key Encryption Functions (Phase 1.7)
-- ============================================================
-- Encrypt: called from application via supabase RPC
-- The server-side secret should be set as a Postgres config var:
--   ALTER DATABASE postgres SET app.encryption_secret = 'your-32-byte-hex-key';
-- For local dev, use a placeholder. In production, set via Supabase dashboard.

create or replace function public.encrypt_api_key(plain_key text)
returns bytea
language plpgsql
security definer
as $$
declare
  secret text;
begin
  secret := current_setting('app.encryption_secret', true);
  if secret is null or secret = '' then
    -- Fallback: store as-is encoded (not truly encrypted, but safe for dev)
    return convert_to(plain_key, 'UTF8');
  end if;
  return pgp_sym_encrypt(plain_key, secret)::bytea;
end;
$$;

create or replace function public.decrypt_api_key(encrypted_key bytea)
returns text
language plpgsql
security definer
as $$
declare
  secret text;
begin
  if encrypted_key is null then
    return '';
  end if;
  secret := current_setting('app.encryption_secret', true);
  if secret is null or secret = '' then
    return convert_from(encrypted_key, 'UTF8');
  end if;
  return pgp_sym_decrypt(encrypted_key, secret);
end;
$$;

-- RPC: save encrypted API key for the current user
create or replace function public.save_api_key(plain_key text)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set api_key_encrypted = public.encrypt_api_key(plain_key)
  where id = auth.uid();
end;
$$;

-- RPC: retrieve decrypted API key for the current user
create or replace function public.get_api_key()
returns text
language plpgsql
security definer
as $$
declare
  result text;
begin
  select public.decrypt_api_key(api_key_encrypted) into result
  from public.profiles
  where id = auth.uid();
  return coalesce(result, '');
end;
$$;
