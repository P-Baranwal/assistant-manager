# Data Schema Audit & Supabase Postgres Plan

This document details the audit of local storage keys, data models, schema migrations, and plans the migration to Supabase Postgres in Phase 1.

---

## 1. Local Storage Schema Audit

### 1.1 Keys & Shapes

The following keys are stored in `localStorage`. Values are JSON-serialized unless noted.

#### `app:schemaVersion`
* **Type:** Integer
* **Purpose:** Tracks the current schema version for local migrations.
* **Default:** `0` (or `3` on fresh install via migration run).

#### `app:deviceId`
* **Type:** UUID string
* **Purpose:** Uniquely identifies the user's device.

#### `theme`
* **Type:** String (`'light' | 'dark' | 'system'`)
* **Purpose:** The user's active theme preference.

#### `profile`
* **Type:** Object
* **Purpose:** User configuration, AI settings, and current application tier.
* **Shape:**
```json
{
  "skills": "string (e.g., 'proficient in Python, weak in Calculus')",
  "priorityPreset": "string ('Balanced' | 'Deadline-first' | 'Difficulty-first' | 'Easiest-first')",
  "customPriorityRule": "string (custom prompt instructions)",
  "provider": "string ('ollama' | 'anthropic' | 'openai' | 'gemini' | 'groq')",
  "ollamaUrl": "string (defaults to 'http://localhost:11434')",
  "ollamaModel": "string (defaults to 'qwen2.5-coder:7b')",
  "apiKey": "string",
  "tier": "string ('student' | 'professional')",
  "defaultProjectId": "string (UUID or null)"
}
```

#### `assignments:index`
* **Type:** Array of UUID strings
* **Purpose:** Primary key index of all student assignments.
* **Shape:** `["uuid-1", "uuid-2", ...]`

#### `assignments:<uuid>`
* **Type:** Object
* **Purpose:** Details of a specific assignment (Student tier).
* **Shape:**
```json
{
  "id": "string (UUID)",
  "entityType": "string ('assignment')",
  "title": "string",
  "type": "string ('Essay' | 'Coding' | 'Math' | 'Research' | 'Other')",
  "deadline": "string (YYYY-MM-DD or null)",
  "status": "string ('active' | 'done' | 'todo' | 'in_progress' | 'blocked')",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "analyzedAt": "string (ISO 8601)",
  "difficulty": "number (1-10)",
  "difficultyReasoning": "string",
  "estimatedHours": "number (>= 0)",
  "estimatedHoursReasoning": "string",
  "priorityScore": "number (0-100)",
  "priorityReasoning": "string",
  "boost": {
    "active": "boolean",
    "reason": "string or null",
    "boostedPriorityScore": "number or null"
  },
  "checklist": [
    {
      "id": "string (UUID)",
      "text": "string",
      "done": "boolean"
    }
  ],
  "rawContent": "string (original text input for AI scoring)"
}
```

#### `tasks:index`
* **Type:** Array of UUID strings
* **Purpose:** Primary key index of all tasks (Professional tier).
* **Shape:** `["uuid-1", "uuid-2", ...]`

#### `tasks:<uuid>`
* **Type:** Object
* **Purpose:** Details of a specific task.
* **Shape:**
```json
{
  "id": "string (UUID)",
  "entityType": "string ('task')",
  "title": "string",
  "description": "string",
  "status": "string ('active' | 'done' | 'todo' | 'in_progress' | 'blocked')",
  "priorityScore": "number (0-100)",
  "priorityReasoning": "string",
  "boost": {
    "active": "boolean",
    "reason": "string or null",
    "boostedPriorityScore": "number or null"
  },
  "deadline": "string (YYYY-MM-DD or null)",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)",
  "projectId": "string (UUID or null)",
  "actualHours": "number (>= 0)",
  "estimatedHours": "number (>= 0)",
  "impactScore": "number (1-10 or null)",
  "blockerNote": "string or null"
}
```

#### `projects:index`
* **Type:** Array of UUID strings
* **Purpose:** Primary key index of all projects (Professional tier).
* **Shape:** `["uuid-1", "uuid-2", ...]`

#### `projects:<uuid>`
* **Type:** Object
* **Purpose:** Details of a specific project.
* **Shape:**
```json
{
  "id": "string (UUID)",
  "entityType": "string ('project')",
  "title": "string",
  "clientContext": "string",
  "status": "string ('active' | 'done')",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

---

## 2. Existing Migration/Schema Versioning Logic

The application uses `src/lib/migrations.js` to manage schema evolution. 
* **Current version:** `3`
* **Version 1:** Normalizes existing assignments and profile using validators.
* **Version 2:** Introduces the `entityType: 'assignment'` flag onto all existing assignment objects.
* **Version 3:** Adds the `tier` field to profile (defaulting to `'student'`), backfills pro fields onto existing tasks (e.g. `projectId: null`, `actualHours: 0`, default `estimatedHours: 1`), and ensures an empty `projects:index` exists.

---

## 3. Equivalent Postgres Schema (Supabase Migration Plan)

For Phase 1, the Postgres database will represent this schema. RLS (Row Level Security) will be enabled on all tables, ensuring users can only read and write their own data.

```sql
-- Enable Extensions
create extension if not exists "pgcrypto";

-- profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  skills text default '',
  priority_preset text check (priority_preset in ('Balanced', 'Deadline-first', 'Difficulty-first', 'Easiest-first')) default 'Balanced',
  custom_priority_rule text default '',
  provider text check (provider in ('ollama', 'anthropic', 'openai', 'gemini', 'groq')) default 'ollama',
  ollama_url text default 'http://localhost:11434',
  ollama_model text default 'qwen2.5-coder:7b',
  api_key text default '', -- Will be encrypted at rest in Phase 1.7
  tier text check (tier in ('student', 'professional')) default 'student',
  default_project_id uuid, -- Will be set as foreign key after projects table is defined
  theme text check (theme in ('light', 'dark', 'system')) default 'system',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- projects table
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Project',
  client_context text default '',
  status text check (status in ('active', 'done')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add foreign key constraint back to profiles now that projects exists
alter table public.profiles
  add constraint fk_profiles_default_project
  foreign key (default_project_id) references public.projects(id) on delete set null;

-- assignments table
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

-- tasks table
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

-- Enable Row Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.assignments enable row level security;
alter table public.tasks enable row level security;

-- Create Policies for RLS
create policy "Users can view and edit their own profiles"
  on public.profiles for all using (auth.uid() = id);

create policy "Users can view and edit their own projects"
  on public.projects for all using (auth.uid() = user_id);

create policy "Users can view and edit their own assignments"
  on public.assignments for all using (auth.uid() = user_id);

create policy "Users can view and edit their own tasks"
  on public.tasks for all using (auth.uid() = user_id);
```
