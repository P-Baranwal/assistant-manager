# Clerify

An AI-powered task and project manager for students and professionals. Paste an assignment, brief, or a quick note and Clerify analyzes it with an LLM to produce calibrated difficulty, time estimates, priority scores, and checklists — then keeps your work organized across two interface modes.

> Previously "Assistant Manager" / "Assignment Manager".

Clerify runs two ways:

- **Local-only (default)** — data stays in your browser's `localStorage`; no backend required. AI analysis uses your own Sarvam API key (BYOK).
- **Cloud** — optional Supabase + Paddle SaaS mode with accounts, cross-device sync, billing, teams, and a managed AI proxy (no API key needed).

---

## Interface Modes

You can switch modes from **Settings** (Professional mode requires a Pro or Team plan in cloud mode).

### Student Mode
A focused workspace for coursework:

- Paste a prompt/rubric, upload a PDF, or enter an assignment manually.
- AI generates difficulty (1–10), estimated hours, priority score (0–100), reasoning, and an actionable checklist.
- Priority presets (Balanced, Deadline-first, Difficulty-first, Easiest-first) plus an optional custom plain-text sorting directive.
- Calendar view, natural-language task entry, weekly planning, and deadline risk alerts.

### Professional Mode
A project-delivery workspace:

- **Projects** group tasks (or leave them in an unassigned inbox).
- **Kanban dashboard** with *To Do*, *In Progress*, *Blocked*, and *Done* columns.
- **AI Work Breakdown Structure (WBS)** generator that decomposes a client brief into sub-tasks with estimated hours and impact scores.
- **ROI priority metric** — tasks are ranked by impact divided by estimated effort.
- Blocker tracking and actual-vs-estimated time logging with variance indicators.

---

## Key Features

- **AI analysis & scoring** — difficulty, hours, priority, reasoning, and checklists for assignments; WBS + ROI for projects.
- **Priority boost** — add context (e.g. "this counts for 40% of my grade") to trigger an LLM-calculated score adjustment.
- **Re-analyze** — re-score individual items, or batch re-score everything from Settings.
- **Natural-language entry** — type or paste a sentence; the AI extracts a structured task.
- **Weekly planning** — generate a day-by-day Mon–Fri schedule from active work.
- **Risk alerts** — a dismissible overload warning when upcoming work exceeds your daily capacity.
- **Calendar sync** — export an iCal feed to Google Calendar, Apple Calendar, or Outlook.
- **Productivity analytics** — velocity, time accuracy, project breakdown, streaks, and CSV export.
- **Teams (cloud)** — shared projects, comments, activity feed, assignees, and real-time sync.
- **PWA** — installable, offline-capable, with an IndexedDB mutation queue that flushes on reconnect.
- **Browser extension** — capture tasks from any webpage into your Clerify account.
- **Undo stack**, **JSON backup/restore**, and **light/dark/system themes**.

---

## AI: Sarvam

Clerify uses [Sarvam AI](https://sarvam.ai) as its single provider.

| Capability | Model |
|---|---|
| Analysis & planning | `sarvam-105b` |
| PDF extraction (cloud) | Sarvam Document AI (Vision) |

Two access paths:

1. **BYOK** — bring your own Sarvam API key. Works in both local-only and cloud mode. The key is stored in your browser (or encrypted at rest in Supabase in cloud mode) and used directly.
2. **Clerify AI proxy** — cloud mode only, on paid plans. Requests route through a Supabase Edge Function that uses a server-side Sarvam key, so you don't need your own.

In local-only mode, PDFs are parsed with `pdf.js` in the browser. In cloud mode, PDFs are digitized with Sarvam Document AI (paid plans), falling back to `pdf.js` on failure.

---

## Subscription Tiers

| Tier | Items | AI | Modes | Notes |
|---|---|---|---|---|
| **Free** | 50 | 10 analyses/month (BYOK) | Student | No proxy, WBS, calendar sync, or Professional mode |
| **Student** | Unlimited | 100 analyses/month (proxy) | Student | Calendar sync + AI proxy |
| **Pro** | Unlimited | Unlimited | Student + Professional | WBS, calendar sync, AI proxy |
| **Team** | Unlimited | Unlimited | Student + Professional | Shared projects + team collaboration |

The pricing page surfaces Free, Student, and Pro; the Team tier is defined in code and the webhook handler. Paid plans include a 7-day free trial.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | [Svelte 5](https://svelte.dev) (runes + stores) |
| Build | [Vite 8](https://vite.dev) |
| Styling | Vanilla CSS with custom properties (light/dark themes) |
| Local storage | Browser `localStorage` (adapter pattern) |
| Cloud storage | Supabase Postgres |
| Auth | Supabase Auth (email/password + Google + GitHub) |
| Backend | Supabase Edge Functions (Deno) + Realtime |
| Billing | [Paddle](https://paddle.com) (Checkout overlay + webhooks) |
| AI | Sarvam AI (`sarvam-105b` + Document AI) |
| PDF parsing | Sarvam Document AI (cloud) with `pdf.js` fallback |
| PWA | `vite-plugin-pwa` + Workbox, IndexedDB offline queue |
| Charts | Chart.js (`svelte-chartjs`) |
| Extension | Chrome Manifest V3 (webpack) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+ and npm.

### Install & run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Local-only mode is the **default**, so a fresh checkout runs offline with browser storage — no environment variables required.

### Local-only vs cloud mode

Local-only mode is the default and uses only browser storage. It exposes both Student and Professional modes but hides authentication, billing, teams, calendar sync, and the AI proxy.

Cloud mode is an explicit opt-in:

```bash
# .env.local
VITE_LOCAL_ONLY=false
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AI_PROXY_URL=https://your-project.supabase.co/functions/v1/ai-proxy
```

### AI setup (BYOK)

1. Get a Sarvam API key from [Sarvam](https://sarvam.ai).
2. In **Settings → AI Provider**, choose "Use my own API key (BYOK)".
3. Enter the key and click **Test Connection**.

Clerify uses `sarvam-105b` for analysis and planning. When cloud mode is enabled on a paid plan, you can instead select "Use Clerify AI" to route through the managed proxy without a key.

---

## Cloud Setup (Supabase + Paddle)

### 1. Supabase project

Apply the migrations in `supabase/migrations/` in order (`00001` → `00006`). They create the profiles, projects, assignments, tasks, billing, AI usage, collaboration, and calendar-feed schema, along with RLS policies, triggers, and RPCs.

### 2. Edge functions

Deploy the functions under `supabase/functions/`:

| Function | Purpose |
|---|---|
| `ai-proxy` | Managed Sarvam chat proxy with JWT auth, subscription gating, and usage logging |
| `doc-ai` | Sarvam Document AI PDF digitization (paid plans) |
| `paddle-webhook` | Paddle subscription lifecycle webhooks (HMAC-verified) |
| `manage-subscription` | Cancel / change-plan via the Paddle REST API |
| `calendar-feed` | iCal export with a long-lived revocable token |
| `weekly-digest` | Scheduled email digest (requires Resend + a cron trigger) |

Server-side env vars needed by the functions:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SARVAM_API_KEY
PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
PADDLE_PRICE_STUDENT_MONTHLY
PADDLE_PRICE_STUDENT_YEARLY
PADDLE_PRICE_PRO_MONTHLY
PADDLE_PRICE_PRO_YEARLY
PADDLE_PRICE_TEAM
RESEND_API_KEY          # weekly-digest only
RESEND_FROM             # weekly-digest only
```

### 3. Paddle (client-side)

```
VITE_PADDLE_TOKEN=your-paddle-client-token
VITE_PADDLE_ENVIRONMENT=sandbox   # or production
VITE_PADDLE_PRICE_STUDENT_MONTHLY=pri_...
VITE_PADDLE_PRICE_STUDENT_YEARLY=pri_...
VITE_PADDLE_PRICE_PRO_MONTHLY=pri_...
VITE_PADDLE_PRICE_PRO_YEARLY=pri_...
```

Paddle webhooks update the vendor-agnostic profile columns (`billing_customer_id`, `billing_subscription_id`, `subscription`, `subscription_status`, `current_period_end`).

---

## Project Structure

```
├── index.html                    # App shell (PWA meta + service worker)
├── style.css                     # Global CSS / design tokens
├── vite.config.js                # Vite + Svelte + PWA + $lib alias
├── src/
│   ├── main.js                   # Svelte mount + PWA init
│   ├── App.svelte                # Root: routing, auth, storage adapter selection
│   ├── lib/
│   │   ├── storage/              # LocalAdapter + SupabaseAdapter (shared interface)
│   │   ├── llm/                  # Sarvam provider, proxy, client, JSON contract
│   │   ├── parsers/pdf.js        # PDF extraction (Sarvam Document AI → pdf.js fallback)
│   │   ├── supabase.js           # Supabase client (null in local-only mode)
│   │   ├── billing.js            # Tier/limit checks
│   │   ├── teams.js              # Team CRUD, invites, comments, activity
│   │   ├── realtime.js           # Supabase Realtime subscriptions
│   │   ├── offlineQueue.js       # IndexedDB offline mutation queue
│   │   ├── stores.js             # Svelte writable/derived stores
│   │   ├── model.js              # Normalizers (profile/assignment/task/project)
│   │   └── migrations.js         # Local schema migrations (v1–v4)
│   ├── components/               # Shared UI (Analytics, UpgradeGate, RiskBanner, …)
│   ├── routes/
│   │   ├── auth/Auth.svelte      # Login / signup / reset
│   │   └── billing/              # Pricing + Welcome (post-checkout)
│   ├── student/                  # Student mode header + views
│   └── pro/                      # Professional mode header + views
├── supabase/
│   ├── migrations/               # 00001–00006 Postgres schema
│   └── functions/                # Deno Edge Functions (+ _shared/)
├── packages/extension/           # Chrome extension (Manifest V3)
├── tests/e2e/                    # Local offline e2e tests (Python)
└── .github/workflows/ci.yml      # lint → type-check → build
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build the production bundle |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run `svelte-check` |
| `npm run test:e2e` | Run Python e2e tests |
| `npm run extension:dev` | Build the Chrome extension in watch mode |
| `npm run extension:build` | Build the Chrome extension |

---

## Browser Extension

`packages/extension/` is a Manifest V3 Chrome extension for capturing tasks from any webpage. It syncs with your Clerify account via Supabase, pre-fills task details from page context, and shows a badge of tasks due today. See [`packages/extension/README.md`](packages/extension/README.md) for build and load instructions.

---

## Testing & CI

CI runs `lint`, `type-check`, and `build` on pushes and PRs to `main` and `saas-base`. Local e2e tests (`tests/e2e/`) cover the local-offline flow.

---

## Data & Privacy

- **Local-only mode** keeps all app data in your browser's `localStorage`. No database or tracking.
- **Cloud mode** stores data in Supabase Postgres, protected by row-level security.
- **BYOK keys** are used from your browser in local-only mode; in cloud mode they are encrypted at rest in Postgres.
- The AI model is used only to analyze and organize work — it never completes assignments or briefs for you.
