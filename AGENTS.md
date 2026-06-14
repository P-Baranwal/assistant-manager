# AGENTS.md

# Clerify — Project Memory

> Generated snapshot for LLM context. The codebase is a Svelte 5 + Supabase SaaS app,
> currently at **Phase 3 complete** of the 10-phase `saas-conversion-plan.md`.

---

## 1. Project Identity

| Field | Value |
|---|---|
| **App name** | Clerify (rebranded from "Assistant Manager") |
| **Original purpose** | Personal offline task/assignment manager with local LLM analysis |
| **Current state** | SaaS conversion in progress; Phases 0–3 shipped |
| **Entry point** | `index.html` → `src/main.js` → `src/App.svelte` |
| **App title in HTML** | Still "Assignment Manager" — needs updating to Clerify |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | Svelte 5 (runes, `$state`, Svelte stores) |
| Build Tool | Vite 8 (uses rolldown bundler internally) |
| Styling | Vanilla CSS in `style.css`; CSS custom properties for theming |
| Fonts | Outfit (headings) + DM Sans (body) from Google Fonts |
| Storage (guest) | Browser `localStorage` via `LocalAdapter` |
| Storage (authed) | Supabase Postgres via `SupabaseAdapter` |
| Auth | Supabase Auth (email/password + Google + GitHub OAuth) |
| Backend functions | Supabase Edge Functions (Deno runtime) |
| Billing | Stripe (Checkout, Customer Portal, Webhooks) |
| PDF parsing | `pdf.js` loaded on-demand from CDN |
| Path alias | `$lib` → `src/lib/` (configured in `vite.config.js` + `jsconfig.json`) |
| CI | GitHub Actions: lint → type-check → build on push to `main`/`saas-base` |

---

## 3. Directory Structure

```
/
├── index.html                         # App shell
├── style.css                          # Global CSS (vars, components, layout)
├── vite.config.js                     # Vite + Svelte plugin, $lib alias
├── jsconfig.json                      # TS path aliases for svelte-check
├── eslint.config.js                   # ESLint flat config (JS + Svelte)
├── package.json                       # deps: @supabase/supabase-js, @stripe/stripe-js
├── .env.production                    # Placeholder env vars (safe to commit)
├── saas-conversion-plan.md            # 10-phase SaaS roadmap (master spec)
├── CHANGELOG.md                       # Feature changelog
│
├── src/
│   ├── main.js                        # Svelte mount
│   ├── App.svelte                     # Root: auth state, adapter routing, view switch
│   │
│   ├── lib/
│   │   ├── supabase.js                # createClient() export
│   │   ├── stores.js                  # All Svelte writable/derived stores
│   │   ├── storage.js                 # Storage facade (proxy to active adapter)
│   │   ├── model.js                   # normalizeProfile/Assignment/Task/Project
│   │   ├── migrations.js              # Schema migration runner (v1–v4)
│   │   ├── constants.js               # TYPES, STATUS, SUBSCRIPTION_*, STORAGE_KEYS
│   │   ├── billing.js                 # canCreateItem, canUseAI, canAccessFeature
│   │   ├── undoStack.js               # Single-level undo store
│   │   │
│   │   ├── storage/
│   │   │   ├── adapter.js             # Base StorageAdapter class (interface)
│   │   │   ├── local.adapter.js       # LocalAdapter (localStorage)
│   │   │   └── supabase.adapter.js    # SupabaseAdapter (Postgres via REST)
│   │   │
│   │   ├── llm/
│   │   │   ├── client.js              # fetchHealth(), analyzeAssignment(), generateWBS()
│   │   │   ├── contract.js            # JSON_SCHEMA_PROMPT, normalizeAnalysisResult()
│   │   │   └── providers/
│   │   │       ├── ollama.js
│   │   │       ├── anthropic.js
│   │   │       ├── openai.js
│   │   │       ├── gemini.js
│   │   │       └── groq.js
│   │   │
│   │   ├── parsers/
│   │   │   └── pdf.js                 # extractPdfText() using pdf.js CDN
│   │   │
│   │   └── utils/
│   │       ├── date.js                # parseDateLocal(), calculateUrgency()
│   │       └── id.js                  # uuid() using crypto.randomUUID()
│   │
│   ├── components/                    # Shared UI components
│   │   ├── Spinner.svelte
│   │   ├── ConfirmModal.svelte
│   │   ├── UndoToast.svelte
│   │   ├── UpgradeBanner.svelte       # Inline upgrade prompt strip
│   │   └── UpgradeGate.svelte         # Full-panel feature lock UI
│   │
│   ├── routes/
│   │   ├── auth/
│   │   │   └── Auth.svelte            # Login / SignUp / Reset Password
│   │   └── billing/
│   │       └── Pricing.svelte         # 3-tier pricing page (Free/Student/Pro)
│   │
│   ├── student/
│   │   ├── components/
│   │   │   └── StudentHeader.svelte   # Stats bar + nav (Dashboard/Tasks/Calendar/Add)
│   │   └── views/
│   │       ├── Dashboard.svelte       # Priority list (active + completed tabs)
│   │       ├── Add.svelte             # Add assignment (paste/upload/manual + AI)
│   │       ├── Detail.svelte          # Assignment/task detail, checklist, boost
│   │       ├── Settings.svelte        # Profile, AI provider, billing, import/export
│   │       ├── TaskManager.svelte     # Quick task add (basic or AI-scored)
│   │       └── Calendar.svelte        # Monthly calendar with deadline chips
│   │
│   └── pro/
│       ├── components/
│       │   └── ProHeader.svelte       # Stats bar + nav (Projects/Blocked/ROI)
│       └── views/
│           ├── ProDashboard.svelte    # Kanban board (todo/in_progress/blocked/done) + ROI sidebar
│           ├── ProAdd.svelte          # New project + AI WBS generator
│           └── ProDetail.svelte       # Task detail (impact/hours/blocker/variance)
│
├── supabase/
│   ├── functions/
│   │   ├── create-checkout-session/index.ts
│   │   ├── create-portal-session/index.ts
│   │   └── stripe-webhook/index.ts
│   └── migrations/
│       ├── 00001_initial_schema.sql   # Profiles, projects, assignments, tasks, RLS, triggers, BYOK
│       └── 00002_billing_schema.sql   # tier→mode rename, subscription col, ai_usage table, RPCs
│
└── .github/workflows/ci.yml
```

---

## 4. Core Architecture Concepts

### 4.1 Storage Adapter Pattern

All data access goes through a single interface defined in `src/lib/storage/adapter.js`:

```js
class StorageAdapter {
  async get(key)         // returns parsed value or null
  async set(key, value)  // persists value
  async delete(key)      // removes key
  async getAll()         // returns { [key]: value } map
}
```

Two concrete implementations:
- **`LocalAdapter`** — wraps `localStorage` with JSON parse/stringify
- **`SupabaseAdapter`** — maps key-based API to Supabase table rows via REST

The active adapter is selected in `src/lib/storage.js` by subscribing to `authStore`:
```js
authStore.subscribe(state => {
  activeAdapter = state?.user ? supabaseAdapter : localAdapter;
});
```

`storage.js` exports a `Proxy` object (`adapter`) that forwards all calls to the currently active adapter, and a `storage` object with higher-level CRUD methods.

### 4.2 View Routing

There is **no router library**. Routing is done via a single Svelte store:

```js
// src/lib/stores.js
export const view = writable('dashboard');
```

`App.svelte` switches on `$view` with `{#if}` blocks. Valid view names:
- `'dashboard'`, `'add'`, `'detail'`, `'settings'`, `'task-manager'`, `'calendar'` — Student
- `'dashboard'`, `'add'`, `'detail'`, `'settings'` — Pro (same names, different components)
- `'auth'` — Auth page
- `'pricing'` — Pricing page

The active mode (`$profile.mode`) determines which header and which view components render.

### 4.3 Auth Flow

`App.svelte` listens to `supabase.auth.onAuthStateChange`. On every auth event:
1. Updates `authStore` with `{ user, session, isGuest }`
2. Calls `loadData()` to reload all stores from the active adapter
3. Reloads theme and runs a background health check on the AI provider

On **sign-up**, `Auth.svelte` calls `storage.migrateLocalToCloud()` which:
1. Reads everything from `localAdapter`
2. Writes it to `supabaseAdapter`
3. Clears `localStorage` (except `app:deviceId`)

### 4.4 Schema Migrations

`src/lib/migrations.js` runs `runMigrations(adapter)` on every `storage.init()` call.

| Version | What it does |
|---|---|
| v1 | Normalize all assignments + profile |
| v2 | Add `entityType: 'assignment'` flag |
| v3 | Add `tier` to profile; backfill pro task fields; ensure `projects:index` exists |
| v4 | Rename `profile.tier` → `profile.mode`; add `profile.subscription = 'free'` |

Current schema version: **4** (`LATEST_SCHEMA_VERSION = 4` in `migrations.js`).

---

## 5. Data Models

All models are normalized by functions in `src/lib/model.js`.

### 5.1 Profile
```js
{
  skills: string,              // e.g. "proficient in Python, weak in Calculus"
  priorityPreset: string,      // 'Balanced'|'Deadline-first'|'Difficulty-first'|'Easiest-first'
  customPriorityRule: string,  // plain-text AI sorting directive
  provider: string,            // 'ollama'|'anthropic'|'openai'|'gemini'|'groq'
  ollamaUrl: string,           // default: 'http://localhost:11434'
  ollamaModel: string,         // default: 'qwen2.5-coder:7b'
  apiKey: string,              // BYOK; stored encrypted in Supabase
  mode: string,                // 'student'|'professional'  ← UI mode
  subscription: string,        // 'free'|'student'|'pro'|'team'  ← billing tier
  defaultProjectId: string|null
}
```

**Critical distinction**: `mode` (UI interface) ≠ `subscription` (billing tier). A user can be on `subscription: 'free'` and `mode: 'student'`. Professional mode requires `pro` or `team` subscription.

### 5.2 Assignment (Student mode)
```js
{
  id: uuid,
  entityType: 'assignment',
  title, type,           // type: 'Essay'|'Coding'|'Math'|'Research'|'Other'
  deadline,              // YYYY-MM-DD or null
  status,                // 'active'|'done'|'todo'|'in_progress'|'blocked'
  createdAt, updatedAt, analyzedAt,  // ISO 8601
  difficulty,            // 1–10
  difficultyReasoning,
  estimatedHours,        // ≥ 0
  estimatedHoursReasoning,
  priorityScore,         // 0–100
  priorityReasoning,
  boost: { active, reason, boostedPriorityScore },
  checklist: [{ id, text, done }],
  rawContent             // original text sent to AI
}
```

### 5.3 Task (Professional mode)
```js
{
  id: uuid,
  entityType: 'task',
  title, description,
  status,                // 'active'|'done'|'todo'|'in_progress'|'blocked'
  priorityScore,         // computed from ROI: (impactScore / max(estimatedHours, 0.5)) * 10
  priorityReasoning,
  boost: { active, reason, boostedPriorityScore },
  deadline,
  createdAt, updatedAt,
  projectId: uuid|null,
  actualHours,
  estimatedHours,
  impactScore: 1–10|null,
  blockerNote: string|null
}
```

Priority for tasks is **dynamically computed** in `normalizeTask()` using ROI when `impactScore` is set. Otherwise falls back to stored `priorityScore`.

### 5.4 Project
```js
{
  id: uuid,
  entityType: 'project',
  title,
  clientContext,   // raw brief pasted for WBS generation
  status,          // 'active'|'done'
  createdAt, updatedAt
}
```

---

## 6. Storage Key Mapping (localStorage / SupabaseAdapter)

| Key | localStorage | Supabase table/column |
|---|---|---|
| `app:schemaVersion` | integer | N/A (local only) |
| `app:deviceId` | UUID string | `localStorage` always (even in cloud mode) |
| `theme` | string | `profiles.theme` |
| `profile` | object | `profiles.*` row (user's own) |
| `assignments:index` | `string[]` | Derived: `SELECT id FROM assignments WHERE user_id=?` |
| `assignments:<uuid>` | object | `assignments` row |
| `tasks:index` | `string[]` | Derived: `SELECT id FROM tasks WHERE user_id=?` |
| `tasks:<uuid>` | object | `tasks` row |
| `projects:index` | `string[]` | Derived: `SELECT id FROM projects WHERE user_id=?` |
| `projects:<uuid>` | object | `projects` row |

The `SupabaseAdapter` ignores writes to `*:index` keys (they're computed from relational queries). It also strips billing-controlled fields from profile writes: `subscription`, `subscriptionStatus`, `stripeSubscriptionId`, `stripeCustomerId`, `currentPeriodEnd`.

**camelCase ↔ snake_case**: `SupabaseAdapter` converts JS camelCase to Postgres snake_case automatically via `camelToSnake()` / `snakeToCamel()` helpers.

---

## 7. Svelte Stores (`src/lib/stores.js`)

| Store | Type | Description |
|---|---|---|
| `view` | writable | Current route string |
| `profile` | writable | User profile object |
| `providerReachable` | writable | AI status dot (green/amber) |
| `activeDetailId` | writable | `{ id, type }` for detail view |
| `activeDraft` | writable | Draft state for add view |
| `authStore` | writable | `{ user, session, isGuest }` |
| `theme` | writable | `'light'|'dark'|'system'` |
| `assignments` | writable | All assignment objects array |
| `tasks` | writable | All task objects array |
| `projects` | writable | All project objects array |
| `priorityList` | derived | Active assignments+tasks sorted by effective score |
| `completedList` | derived | Done items sorted by updatedAt desc |
| `tasksByProject` | derived | `{ [projectId]: { project, tasks[] } }` |
| `unassignedTasks` | derived | Active tasks with no projectId |
| `blockedTasks` | derived | Tasks with status 'blocked' |
| `highRoiTasks` | derived | Top 5 tasks by ROI score |

---

## 8. AI Integration

### 8.1 Provider Interface

Each provider in `src/lib/llm/providers/` must implement:
```js
export function validate(profile)       // → { ok: bool, message: string }
export async function healthCheck(profile)  // → { reachable: bool, label: string }
export async function analyze({ system, user, profile })  // → raw string (model output)
```

### 8.2 Key Functions (`src/lib/llm/client.js`)

- **`fetchHealth(profile)`** — runs provider health check, updates `providerReachable` store
- **`analyzeAssignment(rawContent, profile, boostReason?, existingContext?)`** — full assignment analysis; returns normalized object with difficulty/hours/priority/checklist
- **`generateWBS(brief, profile)`** — generates Work Breakdown Structure for Pro mode; returns `[{ title, estimatedHours, impactScore }]`

### 8.3 Anthropic Provider Note

`src/lib/llm/providers/anthropic.js` uses `profile.ollamaModel` as the model field (not a dedicated `anthropicModel` field). The default is `claude-3-5-sonnet-20240620`. This is a naming inconsistency to be aware of — same pattern applies to all non-Ollama providers.

### 8.4 AI Response Contract

The LLM is instructed to return only raw JSON (no markdown fences). `contract.js` provides:
- `JSON_SCHEMA_PROMPT`: the expected JSON shape injected into the system prompt
- `normalizeAnalysisResult(jStr)`: parses and clamps all fields to valid ranges; strips markdown fences if the model disobeys

---

## 9. Subscription System

### 9.1 Tiers and Limits (`src/lib/constants.js`)

```js
SUBSCRIPTION_LIMITS = {
  free:    { maxItems: 50,  aiMonthlyLimit: 10,  modes: ['student'], wbsGenerator: false, aiProxy: false },
  student: { maxItems: -1,  aiMonthlyLimit: 100, modes: ['student'], wbsGenerator: false, aiProxy: true  },
  pro:     { maxItems: -1,  aiMonthlyLimit: -1,  modes: ['student', 'professional'], wbsGenerator: true, aiProxy: true },
  team:    { maxItems: -1,  aiMonthlyLimit: -1,  modes: ['student', 'professional'], wbsGenerator: true, aiProxy: true },
}
```

- `-1` means unlimited
- Professional mode requires `pro` or `team` subscription
- WBS generator requires `pro` or `team`

### 9.2 Billing Utility Functions (`src/lib/billing.js`)

```js
getLimits(subscription)                     // returns limit object
canAccessFeature(subscription, feature)     // boolean
canUseMode(subscription, mode)              // boolean
canCreateItem(subscription, currentCount)   // boolean
canUseAI(subscription, monthlyUsage)        // boolean
getMonthlyUsageRemaining(subscription, monthlyUsage)  // number or Infinity
```

### 9.3 Stripe Integration

**Edge Functions** (Deno):
- `create-checkout-session`: Gets/creates Stripe customer → creates Checkout Session → returns redirect URL
- `create-portal-session`: Opens Stripe Customer Portal for subscription management
- `stripe-webhook`: Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

Webhook updates `profiles` table columns: `subscription`, `subscription_status`, `stripe_subscription_id`, `current_period_end`.

**Price ID mapping** (in `stripe-webhook/index.ts`):
```
STRIPE_PRICE_STUDENT env var → 'student' tier
STRIPE_PRICE_PRO env var     → 'pro' tier
STRIPE_PRICE_TEAM env var    → 'team' tier
```

**Env vars needed** (Stripe edge functions):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STUDENT`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`
- `APP_URL` (for redirect URLs)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### 9.4 UI Enforcement

- `UpgradeGate.svelte`: Full panel shown when a feature is inaccessible; redirects guests to auth, paid users to pricing
- `UpgradeBanner.svelte`: Inline strip shown above content with upgrade CTA
- `Settings.svelte`: Professional mode radio disabled if `subscription` is not `pro`/`team`
- `Pricing.svelte`: Shows 3 plans (Free, Student, Pro); no Team plan shown yet in UI

---

## 10. Database Schema (Supabase Postgres)

### Tables

**`profiles`** (one per auth user)
```sql
id uuid PK → auth.users(id)
display_name, skills, priority_preset, custom_priority_rule
provider, ollama_url, ollama_model
api_key_encrypted bytea          -- encrypted via pgcrypto
mode text CHECK ('student'|'professional')
subscription text CHECK ('free'|'student'|'pro'|'team')
stripe_customer_id, stripe_subscription_id
subscription_status text CHECK ('active'|'trialing'|'past_due'|'canceled'|'unpaid')
current_period_end timestamptz
default_project_id uuid → projects(id)
theme text CHECK ('light'|'dark'|'system')
created_at, updated_at
```

**`projects`**
```sql
id uuid PK, user_id → auth.users, title, client_context, status, created_at, updated_at
```

**`assignments`**
```sql
id uuid PK, user_id, title, type, deadline date, status
difficulty int(1-10), difficulty_reasoning
estimated_hours numeric(5,2), estimated_hours_reasoning
priority_score int(0-100), priority_reasoning
boost jsonb, checklist jsonb, raw_content text
created_at, updated_at, analyzed_at
```

**`tasks`**
```sql
id uuid PK, user_id, project_id → projects, title, description, status
priority_score, priority_reasoning, boost jsonb, deadline date
actual_hours, estimated_hours, impact_score int(1-10), blocker_note
created_at, updated_at
```

**`ai_usage`**
```sql
id uuid PK, user_id, feature text, model text
input_tokens int, output_tokens int, created_at
```

### RLS Policies

All tables have RLS enabled. Each table has a single "all operations" policy: `auth.uid() = user_id` (or `auth.uid() = id` for profiles).

### Key Postgres Functions/RPCs

- `handle_new_user()` — trigger on `auth.users` INSERT; auto-creates profile with `mode='student'`, `subscription='free'`
- `update_updated_at_column()` — trigger on all table UPDATEs
- `save_api_key(plain_key text)` — encrypts and stores BYOK key for current user
- `get_api_key()` → `text` — decrypts and returns BYOK key for current user
- `log_ai_usage(feature, model, input_tokens, output_tokens)` — inserts usage record
- `get_monthly_usage(feature?)` → `int` — counts AI calls this month for current user

---

## 11. Environment Variables

```
# .env.local (dev) — never committed
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_AI_PROXY_URL=https://xxx.supabase.co/functions/v1/ai-proxy

# .env.production (placeholder values committed — safe)
# Same keys, prod values set in deployment environment
```

Accessed in code via `import.meta.env.VITE_*`.

---

## 12. Feature Flags / State Checks

Common patterns found throughout the codebase:

```js
// Check if user can access pro mode
$: canAccessProMode = p.subscription === 'pro' || p.subscription === 'team';

// Guest check
$authStore.isGuest   // true when no Supabase session

// Redirect guest to auth, paid users to pricing
if ($authStore.isGuest) view.set('auth');
else view.set('pricing');

// Effective priority score (boost overrides base)
const effectiveScore = t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore;
```

---

## 13. Undo System (`src/lib/undoStack.js`)

Single-level undo. After any destructive action:
```js
undoStack.push(label, async () => { /* restore function */ });
```

`UndoToast.svelte` renders a floating toast that auto-dismisses after 8 seconds. The toast calls `undoStack.undo()` which executes the restore function.

---

## 14. Date Handling (`src/lib/utils/date.js`)

**Critical**: Always use `parseDateLocal()` instead of `new Date(dateStr)` for YYYY-MM-DD strings. The standard JS Date constructor parses ISO date-only strings as UTC midnight, causing off-by-one day errors in non-UTC timezones.

```js
parseDateLocal('2026-06-15')  // → local midnight June 15
// vs
new Date('2026-06-15')        // → UTC midnight = June 14 in UTC-5
```

`calculateUrgency(dateStr)` returns: `'Overdue'|'Due Today'|'Due Tomorrow'|'This Week'|null`

---

## 15. CSS Architecture

All CSS is global in `style.css`. No CSS modules or scoped styles at the global level (Svelte scoped `<style>` blocks are used within components for component-specific styles).

Key CSS variables:
- `--primary`, `--primary-hover`, `--primary-surface` — indigo theme
- `--danger`, `--success` — red/green
- `--bg-color` — page background
- `--surface-color` — card/input background
- `--text-main`, `--text-muted`, `--text-light`
- `--border-color`, `--radius`, `--shadow-sm`, `--shadow-md`
- `--bg-essay/coding/math/research/other` + `--text-essay/...` — assignment type tag colors
- `--diff-low/med/high` — difficulty badge colors
- `--font-display` (Outfit), `--font-body` (DM Sans)

Dark mode: applied via `[data-theme='dark']` attribute on `<html>` OR `@media (prefers-color-scheme: dark)` when no explicit theme is set.

---

## 16. Phase Completion Status

| Phase | Name | Status |
|---|---|---|
| 0 | Pre-work & Architecture | ✅ Complete |
| 1 | Auth + Cloud Sync | ✅ Complete |
| 2 | Billing & Tier Enforcement | ✅ Complete |
| 3 | AI Proxy Layer | ✅ Complete |
| 4 | PWA | ⏳ Not started |
| 5 | Collaboration (Team) | ⏳ Not started |
| 6 | Smart AI Features | ⏳ Not started |
| 7 | Analytics | ⏳ Not started |
| 8 | Browser Extension | ⏳ Not started |
| 9 | Calendar Sync (iCal) | ⏳ Not started |
| 10 | Marketing & Growth | ⏳ Not started |

---

## 17. Known Issues / TODOs in Current Code

1. **`index.html` title** still says "Assignment Manager" — should be "Clerify"
2. **Anthropic provider model field** uses `profile.ollamaModel` (should be a dedicated `profile.cloudModel` or per-provider field)
3. **AI proxy Edge Function** requires server-side API keys: `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` env vars on the Supabase project
4. **`STRIPE_PRICE_STUDENT/PRO/TEAM`** are hardcoded placeholder strings in `Pricing.svelte` (`'STRIPE_PRICE_STUDENT'`) — must be replaced with real Stripe Price IDs
5. **Team plan** is defined in `SUBSCRIPTION_LIMITS` and `stripe-webhook` but not shown in the Pricing page UI (only Free/Student/Pro shown)
6. **`bugs.md`** and `new_features.md`** are gitignored; `bugs.md` is empty, `new_features.md` has raw feature ideas not yet implemented
7. **`AGENTS.md`** is empty
8. **`app.encryption_secret`** Postgres config var must be set in production for real BYOK encryption (dev fallback stores keys unencrypted)
9. **`src/lib/storage.js`** imports `authStore` from `'./stores.js'` — circular dependency risk; works currently due to JS module evaluation order but should be monitored
10. **Supabase `app:schemaVersion` key** — the `SupabaseAdapter.get()` returns `null` for unknown keys, so schema version tracking still effectively runs only against localStorage for guests; cloud users always re-run migration checks harmlessly
11. **Migration 00003** (`use_proxy` column) must be applied to Supabase before proxy features work

---

## 18. Key Patterns & Conventions

- **Normalize before save**: Always pass data through `normalizeAssignment()`, `normalizeTask()`, etc. before writing to storage. `storage.saveAssignment()` calls normalize internally.
- **Refresh stores after mutations**: After any storage write, manually re-fetch the index and update the Svelte store (e.g. `assignments.set(all)`). There is no real-time subscription yet.
- **No form tags in Svelte**: Use `on:click` / `on:change` handlers, not `<form on:submit>`.
- **Spinner for async ops**: Use `Spinner` component with `bind:show={processing}` and `spinnerText`.
- **Confirm before destructive actions**: Use `ConfirmModal` with `confirmConfig` object pattern.
- **`$` prefix in Svelte templates** = auto-subscribed store value (e.g., `$profile`, `$tasks`).
- **Detail view targets**: Set `activeDetailId.set({ id, type })` then `view.set('detail')`. `Detail.svelte` and `ProDetail.svelte` react to `$activeDetailId`.

---

## 19. Next Steps (Phase 4 — PWA)

The next phase to implement per `saas-conversion-plan.md`:

1. Create PWA manifest at `/public/manifest.json` with app icons
2. Install `vite-plugin-pwa` and configure Workbox with caching strategies
3. Add offline state detection via Svelte store (`online`/`offline` events)
4. Show subtle offline indicator in header when disconnected
5. Queue write mutations in IndexedDB when offline, flush on reconnect
6. Add "Add to Home Screen" install prompt after 3+ visits
7. iOS Safari manual install instruction for devices without `beforeinstallprompt`

---

## 20. Quick Reference — Important Import Paths

```js
import { supabase } from '$lib/supabase';
import { storage, adapter } from '$lib/storage';
import { view, profile, assignments, tasks, projects, authStore, theme } from '$lib/stores';
import { normalizeProfile, normalizeAssignment, normalizeTask, normalizeProject } from '$lib/model';
import { runMigrations } from '$lib/migrations';
import { SUBSCRIPTION_LIMITS, SUBSCRIPTION_LABELS, STORAGE_KEYS } from '$lib/constants';
import { canCreateItem, canUseAI, canAccessFeature } from '$lib/billing';
import { analyzeAssignment, generateWBS, fetchHealth } from '$lib/llm/client';
import { uuid } from '$lib/utils/id';
import { parseDateLocal, calculateUrgency } from '$lib/utils/date';
import { undoStack } from '$lib/undoStack';
```
