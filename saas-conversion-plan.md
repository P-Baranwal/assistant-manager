# SaaS Conversion Plan — Assistant Manager
**Stack:** Svelte 5 + Vite · Supabase (auth + DB) · Stripe (billing) · [AI proxy provider TBD]
**App name:** Clerify
**Last updated:** June 2026

---

## Overview

This document is an ordered, phase-by-phase implementation plan for converting Assistant Manager from a local-first, single-device tool into a multi-user SaaS product. Each phase builds on the previous one and is designed to be shippable independently — the app remains functional at every stage.

**Guiding principle:** Ship revenue-generating features early. Don't over-build before charging.

---

## Phase 0 — Pre-work & Repository Housekeeping
*Estimated effort: 1–2 days*
*Dependency: None — do this before touching anything else*

This phase has no user-visible changes. It sets up the architecture so every later phase has clean foundations to build on.

### 0.1 Abstract the Storage Layer

The entire app currently reads/writes `localStorage` directly. Before Supabase can be dropped in, all storage calls need to go through a single adapter interface.

- Create `src/lib/storage/adapter.ts` with a typed interface:
  ```ts
  interface StorageAdapter {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    getAll(): Promise<Record<string, unknown>>
  }
  ```
- Create `src/lib/storage/local.adapter.ts` — wraps the current `localStorage` logic, implements the interface above. No behavior changes yet.
- Replace all direct `localStorage` calls across the codebase with calls to the adapter.
- Wire the adapter into Svelte stores via context or a singleton import.

> **Why:** When Supabase auth is added in Phase 1, you swap the adapter per user state (guest → local, logged-in → cloud) without touching any component.

### 0.2 Audit & Document the Data Schema

Before moving data to Postgres you need to know exactly what you're moving.

- List every key currently stored in `localStorage` and its shape.
- Document the schema versioning/migration logic already in the codebase.
- Draft the equivalent Postgres schema (tables, columns, types, relationships). This becomes the Supabase migration in Phase 1.

### 0.3 Environment Config

- Set up `.env` files: `.env.local` (dev), `.env.production`.
- Add placeholder variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_AI_PROXY_URL`.
- Add `.env*.local` to `.gitignore` if not already.

### 0.4 CI/CD Pipeline

- Set up GitHub Actions (or equivalent) for: lint → type-check → build on every PR.
- Configure a staging environment (e.g. Vercel preview deployments or a separate Supabase project).
- Staging and production should be fully separate Supabase projects from day one.

---

## Phase 1 — Auth + Cloud Sync (The Foundation)
*Estimated effort: 1–2 weeks*
*Dependency: Phase 0 complete*

This is the most critical phase. Everything else depends on users having persistent identities and server-side data. The app should feel identical to users at the end of this phase — the only visible change is a login screen.

### 1.1 Supabase Project Setup

- Create two Supabase projects: `assistantmanager-staging` and `assistantmanager-prod`.
- Enable the following in both: Email/Password auth, Google OAuth, GitHub OAuth.
- Configure redirect URLs, email templates (confirmation, password reset) with the app's branding.

### 1.2 Database Schema Migration

Using the schema documented in Phase 0.2, create the following tables in Supabase (Postgres). All tables include `user_id uuid references auth.users(id) on delete cascade` and `created_at`, `updated_at` timestamps.

Core tables (adjust to match your actual schema):

```sql
-- profiles: extends auth.users with app-specific user data
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  mode text check (mode in ('student', 'professional')) default 'student',
  skills_profile text,
  priority_preset text,
  custom_sort_rules text,
  ai_provider text,
  ai_model text,
  ai_byok_key text,        -- encrypted at rest; see 1.5
  theme text default 'system',
  tier text check (tier in ('free', 'pro', 'team')) default 'free',
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- assignments (Student mode)
create table assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  -- all existing assignment fields go here
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- projects + tasks (Professional mode)
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  -- all existing task fields go here
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

- Write Row Level Security (RLS) policies on every table so users can only read/write their own rows. **Do not skip RLS.** Example:
  ```sql
  alter table assignments enable row level security;
  create policy "users own their assignments"
    on assignments for all using (auth.uid() = user_id);
  ```

### 1.3 Supabase Storage Adapter

- Create `src/lib/storage/supabase.adapter.ts` implementing the same interface from 0.1.
- Uses the Supabase JS client (`@supabase/supabase-js`) for all reads/writes.
- Handles optimistic updates: write to local state immediately, sync to Supabase in the background.
- Handles conflict resolution (last-write-wins is acceptable for V1).

### 1.4 Auth UI

- Create `src/routes/auth/` with Login and Sign Up pages.
- Keep the UI minimal and on-brand: email/password form + "Continue with Google" + "Continue with GitHub" buttons.
- Add a `[APP_NAME] is free to get started — no credit card required` line to reduce friction.
- Handle: email confirmation flow, password reset flow, OAuth redirects.
- Wire Supabase auth state (`onAuthStateChange`) into a global Svelte store (`$authStore`).

### 1.5 Guest Mode + Upgrade Flow

This is critical for preserving the current no-friction UX.

- On first visit with no auth, the app runs exactly as it does today: local storage adapter, full functionality with free-tier limits.
- After the user has created meaningful data (e.g. 3+ assignments/tasks), show a non-intrusive persistent banner: *"Your data is saved locally on this device. Sign up to sync across devices."*
- On sign-up, **migrate local data to Supabase** automatically:
  - Read everything from `localStorage`.
  - POST it to Supabase under the new `user_id`.
  - Clear `localStorage` and switch to the cloud adapter.
  - Show a one-time confirmation: *"Your [X] assignments have been saved to your account."*

### 1.6 Adapter Routing

In `src/lib/storage/index.ts`, export a reactive adapter that returns:
- `LocalAdapter` when `$authStore.user === null`
- `SupabaseAdapter` when `$authStore.user !== null`

All components import from this single entry point and never know which adapter is running.

### 1.7 Encrypt BYOK Keys at Rest

API keys stored in user profiles are sensitive. Do not store them as plaintext in Postgres.

- Use Supabase's `pgcrypto` extension to encrypt `ai_byok_key` with a server-side secret.
- Alternatively, store keys in a separate `secrets` table with stricter RLS and a Supabase Edge Function as the only accessor.
- **At minimum:** never return the raw key in any API response that isn't the settings page for the authenticated user.

---

## Phase 2 — Billing & Tier Enforcement
*Estimated effort: 1 week*
*Dependency: Phase 1 complete (users must exist before they can pay)*

### 2.1 Stripe Setup

- Create Stripe account, configure products and prices:
  - **Student Plan:** $2/month recurring
  - **Pro Plan:** $5/month recurring
  - **Team Plan:** $10/month per seat recurring
- Create a Stripe webhook endpoint (Supabase Edge Function or a small serverless function).
- Store `stripe_customer_id` and `tier` on the `profiles` table (already in schema above).

### 2.2 Checkout Flow

- Add a **Upgrade** button in the app header/settings, visible to free users.
- Clicking it opens a simple pricing page (within the app, not a separate marketing site yet).
- Pricing page shows three tiers with a clear comparison table. Student tier should show *"Verify with .edu email"* as a note.
- "Choose Plan" → creates a Stripe Checkout session via a Supabase Edge Function → redirects to Stripe-hosted checkout.
- On success: Stripe webhook fires → Edge Function updates `profiles.tier` → user lands back in app with a welcome toast.

### 2.3 Tier Limit Enforcement

Define limits per tier and enforce them **server-side** (in RLS or Edge Functions), not just client-side.

| Feature | Free | Student ($2) | Pro ($5) | Team ($10/seat) |
|---|---|---|---|---|
| Tasks / assignments | 50 | Unlimited | Unlimited | Unlimited |
| AI analyses per month | 10 | 100 | Unlimited | Unlimited |
| Modes available | Student only | Student only | Both | Both |
| WBS generator | ✗ | ✗ | ✓ | ✓ |
| Shared projects | ✗ | ✗ | ✗ | ✓ |
| Calendar sync (iCal) | ✗ | ✓ | ✓ | ✓ |
| PWA / offline | ✓ | ✓ | ✓ | ✓ |
| JSON backup/restore | ✓ | ✓ | ✓ | ✓ |
| AI proxy (no BYOK needed) | ✗ | ✓ | ✓ | ✓ |
| BYOK | ✓ | ✓ | ✓ | ✓ |

- Client-side: gate UI elements by `$profileStore.tier`. Show a friendly upgrade prompt when a locked feature is accessed — not an error.
- Server-side: Edge Functions that handle AI proxy calls check the tier and monthly usage counter before executing.

### 2.4 Student Tier Verification

- On checkout for the Student plan, add a step after payment: *"Enter your .edu email address to activate your student discount."*
- Send a confirmation email to the `.edu` address.
- On confirmation, apply a Stripe coupon (50% off → $1/month effective, billed as $2 minus coupon, or just price it at $2 directly without a coupon for simplicity).
- Alternatively for V1: honor the $2 price without verification and add a note in settings that abuse will result in account review. Keep it simple initially.

### 2.5 Subscription Management

- Add a **Billing** section in Settings:
  - Current plan + next billing date.
  - "Manage subscription" → opens Stripe Customer Portal (one function call, Stripe handles everything).
  - For Team plan: seat count display.
- Stripe Customer Portal handles upgrades, downgrades, cancellations, and invoice history natively.

### 2.6 Cancellation & Downgrade Handling

- When a paid subscription is cancelled, the Stripe webhook sets `tier = 'free'` at the end of the billing period.
- If the user has more than 50 tasks when downgraded: do NOT delete data. Show a banner: *"You're on the free plan. Your [X] tasks are preserved but hidden. Upgrade to access them."*
- Never delete user data on downgrade.

---

## Phase 3 — AI Proxy Layer
*Estimated effort: 3–5 days*
*Dependency: Phase 2 complete (proxy is a paid feature)*

### 3.1 Architecture

The AI proxy is a Supabase Edge Function (Deno) that sits between the client and the LLM provider. It:
- Authenticates the request (validates the Supabase JWT).
- Checks the user's tier and monthly usage counter.
- Routes to the configured provider (to be decided).
- Logs the request (model, token count, user_id, timestamp) to a `ai_usage` table.
- Returns the model response to the client.

### 3.2 BYOK Coexistence

The Settings page already handles AI provider config. Extend it:

- Add a toggle: **"Use my own API key"** / **"Use [App Name] AI (included in plan)"**.
- If BYOK is selected: the client calls the provider directly (current behavior, unchanged).
- If proxy is selected: the client sends requests to `VITE_AI_PROXY_URL/v1/chat` with the Supabase auth token. The Edge Function handles the provider call.
- Free users only see the BYOK option (proxy is locked, shown with an upgrade prompt).

### 3.3 Usage Tracking

- `ai_usage` table: `id`, `user_id`, `model`, `input_tokens`, `output_tokens`, `feature` (e.g. `wbs_generate`, `priority_score`, `re_analyze`), `created_at`.
- Edge Function increments a monthly counter (or query-counts on the fly).
- At 80% of the monthly limit, send one email warning.
- At 100%, return a 429 with a helpful error message in the UI: *"You've used your 100 AI analyses this month. Upgrade to Pro for unlimited. Resets [date]."*

### 3.4 Cost Controls

- Set hard token limits per request type in the Edge Function (WBS generation can use more tokens than a priority re-score).
- Add a Stripe spending limit or budget alert on the provider account to catch runaway costs early.
- Log estimated cost per request to `ai_usage` for your own monitoring.

---

## Phase 4 — Progressive Web App (PWA)
*Estimated effort: 2–3 days*
*Dependency: Phase 1 complete*

PWA gives mobile users a native-feeling app from the browser with offline capability — a genuine differentiator for a task management tool.

### 4.1 PWA Manifest

- Create `/public/manifest.json`:
  ```json
  {
    "name": "[App Name]",
    "short_name": "[App Name]",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#[your brand color]",
    "icons": [
      { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
      { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
      { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
    ]
  }
  ```
- Generate icons at all required sizes. Create a maskable version (safe zone: centered icon with padding).
- Link manifest in `index.html`.

### 4.2 Service Worker via vite-plugin-pwa

- Install `vite-plugin-pwa` — this integrates Workbox with Vite and handles most of the complexity.
- Configure in `vite.config.ts`:
  ```ts
  VitePWA({
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/[your-supabase-url]/,
          handler: 'NetworkFirst',    // Try network, fall back to cache
          options: { cacheName: 'supabase-cache', expiration: { maxAgeSeconds: 60 * 60 * 24 } }
        }
      ]
    }
  })
  ```
- Strategy: app shell + static assets cached on install (Cache First), Supabase API calls use Network First with a stale fallback.

### 4.3 Offline State Handling

- Detect online/offline status via `navigator.onLine` and the `online`/`offline` events. Store in a Svelte store.
- When offline:
  - Show a subtle status indicator in the header (not a disruptive banner).
  - Read operations: serve from cache — tasks, assignments, profile all load normally.
  - Write operations: queue mutations in IndexedDB (a simple pending-mutations queue).
  - On reconnect: flush the queue to Supabase, resolve conflicts (last-write-wins for V1).
- AI features gracefully degrade: show *"AI features require an internet connection"* when offline.

### 4.4 Install Prompt

- Listen for the `beforeinstallprompt` event. Store it.
- After a user has visited 3+ times (track in localStorage), show an unobtrusive *"Add to Home Screen"* banner at the bottom of the screen.
- Dismiss permanently if the user clicks "Not now."

### 4.5 iOS-Specific Handling

Safari on iOS does not fire `beforeinstallprompt`. Detect iOS Safari and show a manual instruction: *"To install: tap the Share button → Add to Home Screen."* Show this only once per device.

---

## Phase 5 — Collaboration (Team Tier)
*Estimated effort: 2–3 weeks*
*Dependency: Phases 1, 2, and 3 complete*

Collaboration is the primary justification for the Team tier and the feature that drives team-wide adoption (viral growth within organizations and study groups).

### 5.1 Data Model Changes

Add the following tables:

```sql
-- teams: a group of users
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- team_members: many-to-many with roles
create table team_members (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner', 'admin', 'member')) default 'member',
  joined_at timestamptz default now(),
  primary key (team_id, user_id)
);

-- shared_projects: projects visible to a whole team
alter table projects add column team_id uuid references teams(id) on delete set null;

-- task assignments: which team member a task is assigned to
alter table tasks add column assigned_to uuid references auth.users(id) on delete set null;

-- comments: per-task threaded discussion
create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  parent_id uuid references task_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- activity log: audit trail for shared projects
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,   -- e.g. 'task.moved', 'task.completed', 'ai.rescored'
  entity_type text,       -- 'task', 'project', etc.
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);
```

Update RLS policies so team members can access their team's shared projects and tasks.

### 5.2 Team Management UI

Add a **Team** section in Settings (visible to Team tier users only):

- Create a team (owner only).
- Invite members by email → sends invitation email via Supabase Auth.
- View all members, their roles, their assigned tasks count.
- Remove members (owner/admin only) — their personal tasks remain, shared task assignments are cleared.
- "Leave team" option for non-owners.
- Seat count display with Stripe seat management deep link.

### 5.3 Shared Projects & Kanban

- In Pro Dashboard, projects have a **Visibility** field: Private (current behavior) or Shared with Team.
- Shared projects appear for all team members in their Pro Dashboard.
- Task cards in shared projects show an **assignee avatar** and the assignee's name.
- Drag-to-move on the Kanban updates the task status in real-time for all team members (Supabase Realtime subscriptions).

### 5.4 Real-Time Sync

Supabase Realtime handles this via Postgres changes.

- Subscribe to `tasks` and `projects` tables for the current user's team when they open the Pro Dashboard.
- On receiving a change event: update the relevant Svelte store.
- Show a subtle indicator when someone else is active: *"3 people online"* in the top bar of the Pro Dashboard.
- Conflict handling: last-write-wins. Show a toast if the user's in-progress edit was overwritten: *"This task was updated by [Name]. Your changes were discarded."*

### 5.5 Task Comments

- Each task detail view gets a **Comments** section at the bottom.
- Flat list for V1 (no threading UI, though the data model supports it).
- `@mention` support: typing `@` shows a dropdown of team members. Mentioning someone sends them an in-app notification and email.
- Comments are visible to all team members with access to the project.

### 5.6 Activity Feed

- A new **Activity** tab or panel in the Pro Dashboard sidebar.
- Shows the last 50 events for the team's shared projects: task movements, completions, AI re-scores, new task creations, comments.
- Format: `[Avatar] Sarah moved "Redesign landing page" to Done · 2 hours ago`
- Each entry links to the relevant task.
- Server-side: all write operations on shared resources append to `activity_log` (via a Postgres trigger or application code).

### 5.7 Shared Skills Profile

- Teams can define a **Team Skills Profile** in Settings (owner/admin only).
- When the AI proxy generates WBS or scores tasks for a shared project, it uses the team profile instead of the individual profile.
- Individual users can still override with their personal profile for personal (private) tasks.

---

## Phase 6 — Smart AI Features
*Estimated effort: 1–2 weeks*
*Dependency: Phase 3 (proxy) complete*

These features use the now-established AI infrastructure to add high-value intelligence that justifies the subscription.

### 6.1 Smart Scheduling

A new feature: generate a realistic daily/weekly work plan based on all active tasks.

- Available in settings or as a dashboard action: *"Plan my week"*.
- Sends to AI: all active tasks with due dates, estimated hours, priority scores, and the current date/time.
- AI returns: a day-by-day schedule ("Monday morning: Task A (2h), Monday afternoon: Task B (1.5h)...").
- Display as a read-only **Week Plan** view — a simple timeline, not a full calendar editor.
- User can regenerate at any time. Plan is not persisted (stateless, generated on demand).

### 6.2 Deadline Risk Alerts

- Run on: every time the user opens the app (debounced to once per day), and every time a new task is added.
- Logic: compare total estimated hours of tasks due in the next 7 days against a configurable available-hours-per-day setting (default: 6h/day).
- If overloaded: show a dismissible **Risk Banner** at the top of the dashboard: *"You have ~34 hours of work due in the next 7 days. Consider rescheduling or deprioritizing some tasks."*
- Optionally ask AI to identify the best candidate tasks to defer.
- This can be computed client-side (no AI call needed for the math) — only invoke AI for the *"which tasks to defer"* recommendation.

### 6.3 Natural Language Task Entry

- Add an input field to the top of both dashboards (Student and Pro): *"Add a task... (e.g. 'Coding assignment due Friday, 3 hours, 20% of grade')"*
- On submit, send the raw text to the AI with a structured extraction prompt.
- AI returns structured JSON: `{ title, type, due_date, estimated_hours, weight_percent, notes }`.
- Show a **preview card** — user confirms or edits before saving.
- Falls back to the existing manual form if the user ignores the natural language field.

### 6.4 Weekly Digest Email

- A scheduled Supabase Edge Function (cron, runs Sunday at 8am user's local time — approximate via UTC offsets on the profile).
- For each active paying user: gather their top 5 priority tasks for the coming week.
- Send AI a prompt: summarize the week ahead in 3–4 sentences, motivational but grounded in the actual tasks.
- Send via Resend (or Supabase's built-in email) with a clean, minimal HTML template.
- Users can opt out in Settings (default: opted in).

### 6.5 Accuracy Feedback Loop

The app already tracks estimated vs. actual hours. Make this useful:

- After a task is marked complete (if it has both estimated and actual hours logged), show a small inline note in the completed task card: *"You estimated 3h, took 4.5h (+50%)"*.
- In Settings → Skills Profile, add an **"AI Insights"** section that shows patterns: *"Over your last 12 completed tasks: you underestimate coding tasks by 38% on average."*
- Feed these insights back into the skills profile prompt automatically, so future AI analyses are more calibrated.

---

## Phase 7 — Productivity Analytics
*Estimated effort: 1 week*
*Dependency: Phases 1 and 5 (cloud data + time tracking)*

### 7.1 Personal Dashboard Stats

Add an **Analytics** page accessible from the main nav. Shows:

- **Velocity:** tasks completed per week (bar chart, last 8 weeks).
- **Time accuracy:** estimated vs. actual hours by task type (table + simple bar chart).
- **Subject/project breakdown:** where time is being spent (pie or donut chart, last 30 days).
- **Streaks:** consecutive days with at least one task completed.
- **AI calibration drift:** how your priority scores and difficulty estimates have changed over time as your skills profile has evolved.

Keep charts simple — no heavy charting library needed. CSS-only bar charts or a lightweight lib (e.g. Chart.js, already familiar to Svelte ecosystem) are sufficient for V1.

### 7.2 Team Analytics (Team Tier)

Visible to team admins/owners only:

- **Team velocity:** tasks completed per week across all members.
- **Workload distribution:** task count and estimated hours per member (to spot imbalances).
- **Blocker trends:** which tasks have been in "Blocked" status longest.
- **WBS accuracy:** if a project started with an AI-generated WBS, how did actual hours compare to the WBS estimates?

Present as simple tables and bar charts. Do not build a BI dashboard — keep it actionable and scannable.

### 7.3 Data Export

- **CSV export:** all tasks/assignments with all fields, for users who want to do their own analysis in Excel/Sheets.
- **PDF report:** monthly summary — current tasks, completion rate, time accuracy. Rendered server-side or via `jsPDF` client-side. A Pro/Team feature.
- The existing JSON backup/restore remains available on all tiers.

---

## Phase 8 — Browser Extension
*Estimated effort: 1–2 weeks*
*Dependency: Phase 1 complete (needs auth to sync tasks to the user's account)*

A browser extension lets users capture tasks from any webpage without switching apps — a significant friction reducer.

### 8.1 Architecture

Build as a **Manifest V3** Chrome extension (also compatible with Edge and Brave). Firefox uses Manifest V2 — support it in a second pass if demand exists.

The extension is a separate project/package in a `packages/extension/` directory (monorepo structure recommended).

### 8.2 Core Functionality: Capture from Page

- Extension adds a **toolbar button** (the app icon).
- Clicking it opens a popup with a compact "Add Task" form, pre-filled with:
  - Page title → as the task title (editable).
  - Page URL → stored as a source link in task notes.
  - Selected text on the page (if any) → pasted into the description field.
- User fills in due date, estimated hours, type — clicks **Add Task**.
- Extension calls the Supabase API directly (using the stored auth token) to create the task.
- Shows a *"Task added!"* confirmation in the popup.

### 8.3 Auth in Extension

- On install, extension opens the app's login page in a new tab.
- After login, the app writes the Supabase access token + refresh token to `chrome.storage.local`.
- Extension reads tokens from `chrome.storage.local` for all API calls.
- Handle token refresh automatically.
- If not logged in: popup shows *"Log in to [App Name] to use the extension"* with a button.

### 8.4 Context Menu Integration

- Add a right-click context menu item: *"Send to [App Name]"*.
- Right-clicking highlighted text → opens popup with that text pre-filled as the task description.
- Right-clicking a link → adds the link URL as the source.

### 8.5 Badge Count

- Extension badge (the number on the icon) shows the count of tasks due today.
- Updated each time the popup is opened or via a background alarm (polling Supabase, ~every 15 min).

---

## Phase 9 — Calendar Sync (iCal Export)
*Estimated effort: 2–3 days*
*Dependency: Phase 1 complete*

iCal export is a read-only feed — task deadlines appear in any calendar app that supports subscribed calendars (Google Calendar, Apple Calendar, Outlook, etc.).

### 9.1 Generate iCal Feed

- Create a Supabase Edge Function: `GET /api/calendar/:user_token`
- `user_token` is a separate, long-lived, revocable token stored on the user profile (not the Supabase JWT, which expires). Generate a random UUID on first request and store it.
- Edge Function queries all active tasks/assignments for that user_token, generates a `.ics` file conforming to RFC 5545.
- Each task becomes a `VEVENT` with: `SUMMARY` (task title), `DTSTART`/`DTEND` (due date, all-day event), `DESCRIPTION` (type, estimated hours, priority score), `URL` (deep link into the app).

### 9.2 User-Facing Setup

In Settings → Integrations:

- Show the calendar feed URL with a **Copy** button.
- Show instructions for subscribing in Google Calendar, Apple Calendar, and Outlook (3 short steps each, with screenshots or GIFs).
- A **Regenerate feed URL** button (invalidates the old token — useful if they accidentally share it).
- Filter options (optional for V1): include all tasks / only upcoming 30 days / specific projects.

### 9.3 Caching

- The iCal feed response is cacheable. Set `Cache-Control: max-age=3600` (1 hour).
- Calendar apps typically poll subscribed calendars every few hours — this frequency is fine.

---

## Phase 10 — Marketing Site & Growth
*Estimated effort: 1 week*
*Dependency: Phases 1–4 complete and stable*

The in-app experience is built. Now acquire users.

### 10.1 Marketing Landing Page

Build a separate static site (or a `/` route in the same Svelte app that's only shown to logged-out visitors).

Essential sections:
- **Hero:** one sentence on what the app does + a clear CTA ("Get started free" → sign-up).
- **Mode showcase:** Student and Pro mode screenshots/demos side by side.
- **Key features:** 3–4 features with icons. Lead with AI scoring, offline-capable, and BYOK privacy angle.
- **Pricing table:** Free / Student / Pro / Team. Make the Student plan prominent.
- **Social proof:** once you have 10+ users, add a testimonials section.
- **FAQ:** "Is my data private?", "What AI providers are supported?", "Can I use it offline?", "What's the refund policy?"

### 10.2 SEO Basics

- `<title>` and `<meta description>` tags for each route.
- `og:image` (Open Graph) for social sharing previews.
- `sitemap.xml` and `robots.txt`.
- Target keywords: "AI task manager for students", "assignment priority tool", "offline task manager", "work breakdown structure generator".

### 10.3 Referral / Viral Loop

The Team tier is the natural viral mechanism — one user on Team invites others, who then see the product and potentially sign up for their own accounts.

- When a team invitation email is sent, the footer of the email should include a tasteful *"Powered by [App Name] — try it free"* line.
- When a shared project is viewed by a new team member (logged-in but not yet paid), show a subtle banner about Pro features they're benefiting from.

### 10.4 Student Outreach

Students talk to each other. The cheapest acquisition channel is community:

- Post in relevant subreddits: r/productivity, r/college, r/compsci, r/ADHD (productivity tools are very popular here).
- Share in Discord servers for students and developers.
- ProductHunt launch after Phase 4–5 are stable. Time it for a Tuesday/Wednesday.
- Create a short (60-90s) demo video. Post to YouTube and embed on the landing page.

---

## Implementation Order Summary

| # | Phase | Effort | Ships to users | Unlocks |
|---|---|---|---|---|
| 0 | Pre-work & Architecture | 1–2 days | No | Everything |
| 1 | Auth + Cloud Sync | 1–2 weeks | Yes (login/sync) | All paid features |
| 2 | Billing & Tiers | 1 week | Yes (payments) | Revenue |
| 3 | AI Proxy | 3–5 days | Yes (proxy AI) | Usage-based limits |
| 4 | PWA | 2–3 days | Yes (mobile install) | Offline |
| 5 | Collaboration | 2–3 weeks | Yes (Team tier) | Team sales |
| 6 | Smart AI Features | 1–2 weeks | Yes (Pro/Team) | Retention |
| 7 | Analytics | 1 week | Yes (all tiers) | Retention |
| 8 | Browser Extension | 1–2 weeks | Yes (all tiers) | Acquisition |
| 9 | Calendar Sync | 2–3 days | Yes (Student+) | Retention |
| 10 | Marketing & Growth | 1 week | N/A | Acquisition |

**Total estimated effort:** ~10–14 weeks solo, faster with help.

---

## Tech Decisions Log

| Decision | Choice | Reason |
|---|---|---|
| Backend | Supabase | Auth + DB + Realtime + Edge Functions + Storage in one platform. Minimal infra ops. |
| AI proxy provider | TBD | Decide based on cost-per-token at usage scale. Compare Groq, Anthropic Haiku, and Gemini Flash. |
| Billing | Stripe | Industry standard. Customer Portal handles almost all subscription management. |
| Email | Resend or Supabase built-in | Resend for transactional at scale; Supabase built-in fine for early stage. |
| Extension | Chrome MV3 | Widest reach. Firefox MV2 in a later pass. |
| Calendar | iCal (RFC 5545) | Works with all major calendar apps. Zero external dependency. |
| App name | CLerify | Decide before Phase 2 (needed for Stripe, domain, email). |

---

## Open Questions (Resolve Before Building)

1. **AI proxy provider** — needed before Phase 3. Run a cost estimate: assume 1,000 MAU on paid plans × 50 AI calls/month average × estimated tokens per call.
2. **Email provider** — Resend vs. Supabase built-in. Supabase covers basic auth emails; Resend needed for weekly digest and notifications at scale.
3. **Monorepo or separate repos?** — Recommended: a single repo with `packages/app` and `packages/extension`. Simplifies shared types and auth code.
4. **Mobile-specific UX review** — before Phase 4 ships, do a pass on the Svelte UI at 375px width. Some dashboard layouts (Kanban columns, WBS table) may need mobile-specific layouts.
