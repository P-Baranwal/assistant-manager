# Assistant Manager (formerly Assignment Manager)

A personal, offline-capable assignment and task management tool that uses a local or cloud LLM to **analyze, score, and prioritize** your work — without ever completing it for you.

Originally an assignment manager for students, the project is evolving into a dual-tier application supporting both Student and Professional workflows. Built with Svelte and Vite, it operates entirely in your browser and keeps your data local.

---

## Features

### 📋 Dashboard
- Assignments/Tasks ranked by AI-computed **priority score** (highest priority first)
- Stat bar showing: **Total**, **Due This Week**, **Overdue**, and **Completed** counts
- Per-card summary: title, type tag, urgency label, difficulty score, estimated hours, checklist progress bar
- Collapsible **Completed Assignments** section
- Live **AI provider status indicator** (green = reachable, amber = offline/misconfigured)

### ➕ Add Assignment — Three Input Modes

| Mode | How it works |
|---|---|
| **Paste Text** | Paste the full prompt, instructions, or rubric and hit Analyze |
| **Upload PDF** | Pick a PDF — text is extracted client-side via pdf.js, then analyzed |
| **Manual Entry** | Fill in title, type, deadline, and optional description; AI analyzes if a description is provided |

After analysis, a **preview card** is shown where you can edit any field before saving.

### 🔍 AI Analysis — What Gets Generated

For every assignment, the LLM outputs:

- **Title** — extracted or inferred from the content
- **Type** — Essay / Coding / Math / Research / Other
- **Deadline** — extracted from text (editable before save)
- **Difficulty score** (1–10) — calibrated to *your* skill profile, not an absolute scale
- **Estimated hours** — with a one-sentence reasoning
- **Priority score** (0–100) — computed from deadline, difficulty, your skills, and your chosen priority strategy
- **Checklist** — 3–8 concrete, actionable subtasks

### ⚡ Priority Boost
On any assignment's detail view, you can apply a **boost** with a plain-language reason:

> *"Prof mentioned this again in class today"* or *"This counts for 40% of my grade"*

The LLM re-scores the priority with the reason factored in. Boosted cards show a badge on the dashboard. Boost can be removed at any time, which triggers a fresh baseline re-score.

### 🔄 Re-analyze
Manually re-run the AI analysis on any assignment from its detail view. Useful after:
- Updating your Skills Profile in Settings
- Feeling the original analysis was off

Regenerates difficulty, time estimate, checklist, and priority score using fresh settings.

### ✅ Checklist Tracking
- Checkboxes on the detail view, progress bar on the dashboard card
- Completing all items does **not** auto-mark as done — you decide when it's finished
- Mark Done button on detail view (requires confirmation) moves the assignment to Completed

### 🗑️ Lifecycle Management
- **Mark Done** — archives the assignment to Completed section
- **Delete** — permanently removes with a confirmation prompt
- **Edit Deadline** — editable date picker on the detail view; re-sorts dashboard automatically

---

## Future Features (Roadmap)

We are currently transitioning the app into a **Dual-Tier Architecture** that supports both Student workflows (Assignments) and Professional workflows (Projects & Tasks). 

### Professional Mode
A local "Mode Toggle" in Settings will allow switching between the two interfaces:

- **Project-Based Organization:** Work will be organized into `Projects`, with `Tasks` belonging to projects. This data model shift supports professional workflows better than standalone assignments.
- **Pro Dashboard:** A new dashboard (`ProDashboard.svelte`) tailored for professionals. It will group tasks by Project and highlight Blocked tasks and high-ROI (High Impact / Low Effort) tasks.
- **AI Work Breakdown Structure (WBS) Generation:** A new Pro Add view (`ProAdd.svelte`) where pasting a "Client Brief" or feature request triggers the AI to generate a complete WBS (Epics -> Sub-tasks), complete with individual time estimates and impact scores.
- **Advanced Tracking:**
  - **Actual Time Tracking:** Inputs to track actual time spent vs. estimated time.
  - **Blocker Tracking:** Mark tasks as blocked by other tasks. The AI and UI will dynamically down-prioritize blocked tasks until the blocker is resolved.
  - **ROI Calculation:** The priority algorithm for professionals will heavily weigh the `impactScore` (1-10) against `estimatedHours` to surface high-ROI work automatically.

---

## Settings

### Skills & Knowledge Profile
Free-text description of your current abilities, e.g.:
> *"Junior CS student, comfortable with Python, weak at calculus, decent at essay writing."*

The LLM uses this on every analysis call to calibrate difficulty and priority relative to **your** level.

### Priority Preset
Choose a base strategy:
- **Deadline-first** — urgency always wins
- **Difficulty-first** — tackle the hardest thing first
- **Easiest-first** — quick wins to build momentum
- **Balanced** — deadline and difficulty weighted equally

Add an optional **Custom Rule** in plain language, e.g.:
> *"Always prioritize CS assignments over humanities"*

The LLM interprets preset + custom rule together on each call.

### AI Provider
Supports three backends — switch in Settings:

| Provider | Config needed | Model examples |
|---|---|---|
| **Ollama** (default, local) | Base URL (default: `http://localhost:11434`) | `qwen2.5:14b`, `llama3.1:8b`, `phi4` |
| **Anthropic** | API key (`sk-ant-…`) | `claude-sonnet-4-20250514`, `claude-opus-4-5` |
| **OpenAI** | API key (`sk-…`) | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |

Use the **Test Connection** button to verify reachability before saving.

---

## Getting Started

### Prerequisites
- Node.js and npm installed

### Running Locally

1. Clone the repository and navigate into it.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open the provided localhost URL in your browser.

### AI Configuration

**With Ollama (recommended — fully offline)**
1. Install [Ollama](https://ollama.com) and pull a model:
   ```bash
   ollama pull qwen2.5:14b
   ```
2. In the app, go to **Settings** → confirm the base URL and model name → **Save**.
3. The status dot in the header turns green when Ollama is reachable.

**With Anthropic or OpenAI**
1. Go to **Settings** → AI Provider → select your provider.
2. Paste your API key and enter the model name.
3. Save and start adding tasks.

> **Note:** The PDF upload tab requires an internet connection to load the pdf.js parsing script on first use.

---

## Tech Stack

| Concern | Technology |
|---|---|
| UI Framework | [Svelte 5](https://svelte.dev) |
| Build Tool | [Vite](https://vitejs.dev) |
| Styling | Vanilla CSS (no Tailwind/Bootstrap) |
| Storage | `localStorage` (persisted across sessions) |
| Fonts | [Outfit](https://fonts.google.com/specimen/Outfit) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) via Google Fonts |
| PDF parsing | [pdf.js](https://mozilla.github.io/pdf.js/) (loaded on-demand) |
| AI (local) | [Ollama](https://ollama.com) `/api/chat` |
| AI (cloud) | Anthropic or OpenAI API |
| Theme | Light + automatic dark mode via `prefers-color-scheme` |

## Architecture & Refactoring

### Project Structure
The app is built as a Single Page Application using Svelte and organized under `src/`:
- `lib/actions.js`: Centralized action router for UI events.
- `lib/model.js`: Pure normalization for exact data shapes.
- `lib/migrations.js`: Strict schema versioning updates logic.
- `lib/storage.js`: LocalStorage adapter wrapping `init()` boundary.
- `lib/stores.js`: Svelte writable and derived stores for state management.
- `lib/llm/`: Pluggable AI engine layer (Ollama, Anthropic, OpenAI).
- `views/` & `components/`: Granular Svelte components corresponding to exact views and UI elements.

### Storage Migrations
Data format changes are handled transparently via a `schemaVersion`. Any structural changes explicitly increment the version constant. On startup (`storage.init()`), the app securely reads the existing objects and patches legacy keys to ensure absolute UI stability, before rendering the main dashboard.

### Data Model Structure
- `app:schemaVersion`: Integer governing the migration level applied to the system.
- `app:deviceId`: Stable persistent string identifying the local environment.
- `profile`: Central user config (skills, AI keys, custom priority logic, app mode).
- `assignments:index` & `projects:index`: Arrays of entity IDs.
- `assignments:id` & `projects:id`: Core documents containing normalized outputs like difficulty, priority score, or status.

---

## Data & Privacy (Threat Model)

- All data is stored locally in your browser's `localStorage`.
- **API Keys**: When using cloud providers, keys are stored explicitly in plaintext within `localStorage`. Do not use this tool on a shared or un-trusted device. Avoid entering production keys with overly broad permissions; scope the keys strictly to LLM inference if possible.
- The AI is **never** asked to complete assignments, and requests execute strictly over HTTPS or localhost boundaries.

---

## Assignment Types & Color Coding

| Type | Color |
|---|---|
| Essay | Purple |
| Coding | Blue |
| Math | Amber |
| Research | Teal |
| Other | Gray |

Difficulty badges: **1–3** green · **4–6** amber · **7–10** red

---

## Out of Scope

This is a personal, single-device tool. The following are intentionally not included:
- User authentication / accounts
- Multi-device sync
- Push notifications or reminders
- Calendar integration
- Collaboration or sharing
- Automatic re-analysis when settings change
