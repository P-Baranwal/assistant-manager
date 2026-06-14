-- ============================================================
-- Phase 5: Collaboration (Team Tier)
-- Teams, members, invites, shared projects, comments, activity
-- ============================================================

-- ============================================================
-- 1. Teams table
-- ============================================================
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  team_skills_profile text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 2. Team Members (many-to-many with roles)
-- ============================================================
create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  joined_at timestamptz default now(),
  primary key (team_id, user_id)
);

-- ============================================================
-- 3. Team Invites (pending invitations)
-- ============================================================
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')) default 'member',
  invited_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz default now(),
  unique(team_id, email)
);

-- ============================================================
-- 4. Alter projects for shared visibility
-- ============================================================
alter table public.projects
  add column team_id uuid references public.teams(id) on delete set null;

alter table public.projects
  add column visibility text check (visibility in ('private', 'shared')) default 'private';

-- ============================================================
-- 5. Alter tasks for team assignment
-- ============================================================
alter table public.tasks
  add column assigned_to uuid references auth.users(id) on delete set null;

-- ============================================================
-- 6. Task Comments
-- ============================================================
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.task_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- 7. Activity Log
-- ============================================================
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  entity_title text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- 8. Notifications (for @mentions)
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_team_members_user on public.team_members(user_id);
create index idx_team_members_team on public.team_members(team_id);
create index idx_team_invites_email on public.team_invites(email);
create index idx_projects_team on public.projects(team_id) where team_id is not null;
create index idx_tasks_assigned on public.tasks(assigned_to) where assigned_to is not null;
create index idx_task_comments_task on public.task_comments(task_id);
create index idx_activity_log_team on public.activity_log(team_id, created_at desc);
create index idx_notifications_user on public.notifications(user_id, created_at desc);

-- ============================================================
-- Updated_at triggers for new tables
-- ============================================================
create trigger set_updated_at_teams
  before update on public.teams
  for each row execute procedure public.update_updated_at_column();

create trigger set_updated_at_task_comments
  before update on public.task_comments
  for each row execute procedure public.update_updated_at_column();

-- ============================================================
-- RLS Policies
-- ============================================================

-- Enable RLS on all new tables
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.task_comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;

-- ── Helper function: get user's team IDs ──
create or replace function public.get_user_team_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select team_id from public.team_members where user_id = auth.uid();
$$;

-- ── Teams ──
create policy "Team members can read their teams"
  on public.teams for select
  using (id in (select public.get_user_team_ids()));

create policy "Authenticated users can create teams"
  on public.teams for insert
  with check (auth.uid() = owner_id);

create policy "Team owners can update their teams"
  on public.teams for update
  using (owner_id = auth.uid());

create policy "Team owners can delete their teams"
  on public.teams for delete
  using (owner_id = auth.uid());

-- ── Team Members ──
create policy "Team members can view members of their teams"
  on public.team_members for select
  using (team_id in (select public.get_user_team_ids()));

create policy "Team owners/admins can add members"
  on public.team_members for insert
  with check (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  );

create policy "Team owners can update member roles"
  on public.team_members for update
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
        and tm.user_id = auth.uid()
        and tm.role = 'owner'
    )
  );

create policy "Team owners/admins can remove members, members can leave"
  on public.team_members for delete
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
    or team_members.user_id = auth.uid()
  );

-- ── Team Invites ──
create policy "Team owners/admins can manage invites"
  on public.team_invites for all
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_invites.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  );

-- ── Projects: drop old policy, create team-aware one ──
drop policy if exists "Users can manage their own projects" on public.projects;

create policy "Users can manage their own projects"
  on public.projects for all
  using (
    user_id = auth.uid()
    or (
      visibility = 'shared'
      and team_id in (select public.get_user_team_ids())
    )
  );

-- ── Tasks: drop old policy, create team-aware one ──
drop policy if exists "Users can manage their own tasks" on public.tasks;

create policy "Users can manage their own tasks"
  on public.tasks for all
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = tasks.project_id
        and p.visibility = 'shared'
        and p.team_id in (select public.get_user_team_ids())
    )
  );

-- ── Task Comments ──
create policy "Team members can read comments on accessible tasks"
  on public.task_comments for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_comments.task_id
        and t.user_id = auth.uid()
    )
    or exists (
      select 1 from public.tasks t
      join public.projects p on p.id = t.project_id
      where t.id = task_comments.task_id
        and p.visibility = 'shared'
        and p.team_id in (select public.get_user_team_ids())
    )
  );

create policy "Authenticated users can add comments"
  on public.task_comments for insert
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.tasks t
        where t.id = task_comments.task_id
          and t.user_id = auth.uid()
      )
      or exists (
        select 1 from public.tasks t
        join public.projects p on p.id = t.project_id
        where t.id = task_comments.task_id
          and p.visibility = 'shared'
          and p.team_id in (select public.get_user_team_ids())
      )
    )
  );

create policy "Comment authors can update their own comments"
  on public.task_comments for update
  using (user_id = auth.uid());

create policy "Comment authors can delete their own comments"
  on public.task_comments for delete
  using (user_id = auth.uid());

-- ── Activity Log ──
create policy "Team members can read activity log"
  on public.activity_log for select
  using (team_id in (select public.get_user_team_ids()));

-- ── Notifications ──
create policy "Users can read their own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "System can create notifications"
  on public.notifications for insert
  with check (true);

create policy "Users can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid());

create policy "Users can delete their own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());

-- ============================================================
-- Activity Log Trigger (server-side logging for shared projects)
-- ============================================================
create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
as $$
declare
  v_team_id uuid;
  v_action text;
  v_entity_title text;
begin
  -- Find the team for this task's project
  if TG_OP = 'INSERT' or TG_OP = 'UPDATE' then
    select p.team_id into v_team_id
    from public.projects p
    where p.id = NEW.project_id
      and p.visibility = 'shared';
  elsif TG_OP = 'DELETE' then
    select p.team_id into v_team_id
    from public.projects p
    where p.id = OLD.project_id
      and p.visibility = 'shared';
  end if;

  -- Only log if task belongs to a shared project
  if v_team_id is null then
    return coalesce(NEW, OLD);
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'task.created';
    v_entity_title := NEW.title;
  elsif TG_OP = 'UPDATE' then
    if OLD.status is distinct from NEW.status then
      v_action := 'task.moved';
    else
      v_action := 'task.updated';
    end if;
    v_entity_title := NEW.title;
  elsif TG_OP = 'DELETE' then
    v_action := 'task.deleted';
    v_entity_title := OLD.title;
  end if;

  insert into public.activity_log (team_id, user_id, action, entity_type, entity_id, entity_title, metadata)
  values (
    v_team_id,
    auth.uid(),
    v_action,
    'task',
    coalesce(NEW.id, OLD.id),
    v_entity_title,
    case when TG_OP = 'UPDATE' then
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    else '{}'::jsonb end
  );

  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_task_activity
  after insert or update or delete on public.tasks
  for each row execute procedure public.log_task_activity();
