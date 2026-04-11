# Svelte Migration + Feature Integration Plan
### Assignment Manager

---

## Overview

This plan covers migrating from the current vanilla JS / ES module architecture to Svelte, while integrating all planned features. The strategy is **additive-first** — the existing pure-JS core (`storage.js`, `model.js`, `llm/`, `constants.js`, `migrations.js`) is preserved entirely. Only the UI layer gets replaced.

**Total estimated phases: 5**
**Approach: Migrate one view at a time, ship features alongside migration**

---

## What Stays Untouched

These files require zero changes and move over as-is:

| File | Reason |
|---|---|
| `src/storage.js` | Pure adapter, no UI concerns |
| `src/model.js` | Pure normalization functions |
| `src/constants.js` | Constants only |
| `src/migrations.js` | Storage versioning logic |
| `src/llm/` (all files) | Pure async API calls |
| `src/utils/id.js` | Pure utility |
| `style.css` | CSS variables and base styles carry over |

The `src/utils/date.js` `calculateUrgency` function also stays — just import it into Svelte components directly.

---

## What Gets Replaced

| Current File | Replaced By |
|---|---|
| `src/actions.js` | Svelte event handling (native) |
| `src/state.js` | Svelte stores (`$lib/stores.js`) |
| `src/ui/dashboard.js` | `Dashboard.svelte` |
| `src/ui/detail.js` | `Detail.svelte` |
| `src/ui/add.js` | `Add.svelte` |
| `src/ui/settings.js` | `Settings.svelte` |
| `src/utils/dom.js` | Not needed — Svelte handles DOM |
| `src/index.js` | `App.svelte` + `main.js` |
| `online_version.html` | `index.html` (Vite entry) |
| `main.js` (legacy) | Delete after validation |

---

## Project Structure (Post-Migration)

```
/
├── index.html
├── vite.config.js
├── package.json
├── style.css
├── src/
│   ├── main.js                  ← Svelte entry point
│   ├── App.svelte               ← Root: layout, routing, health check
│   ├── lib/
│   │   ├── stores.js            ← Svelte writable stores (replaces state.js)
│   │   ├── storage.js           ← Unchanged
│   │   ├── model.js             ← Unchanged
│   │   ├── constants.js         ← Unchanged
│   │   ├── migrations.js        ← Unchanged
│   │   └── llm/                 ← Unchanged
│   │       ├── client.js
│   │       ├── contract.js
│   │       └── providers/
│   ├── components/
│   │   ├── Header.svelte
│   │   ├── Spinner.svelte
│   │   └── ConfirmModal.svelte
│   └── views/
│       ├── Dashboard.svelte
│       ├── Detail.svelte
│       ├── Add.svelte
│       ├── Settings.svelte
│       └── Calendar.svelte      ← New feature
```

---

## Stores Design (`src/lib/stores.js`)

This replaces `src/state.js`. Svelte stores are reactive by default — any component that imports them re-renders when they change.

```javascript
import { writable, derived } from 'svelte/store';

export const view = writable('dashboard');         // active view name
export const profile = writable(null);             // user profile object
export const providerReachable = writable(false);  // AI status dot
export const activeDetailId = writable(null);      // detail view target
export const activeDraft = writable(null);         // add view draft

// Derived: combined sorted priority list (assignments + tasks)
export const priorityList = derived(
  [assignments, tasks],
  ([$assignments, $tasks]) => {
    return [...$assignments, ...$tasks]
      .filter(i => i.status !== 'done')
      .sort((a, b) => effectiveScore(b) - effectiveScore(a));
  }
);
```

---

## Phase 0 — Tooling Setup
**Duration: ~1 hour**
**No visible changes to the app**

1. Initialize package.json
   ```bash
   npm create vite@latest . -- --template svelte
   ```
2. Install dependencies
   ```bash
   npm install
   npm install -D @sveltejs/vite-plugin-svelte
   ```
3. Configure `vite.config.js` to resolve `$lib` alias to `src/lib/`
4. Move existing `src/` pure-JS files into `src/lib/`
5. Verify the existing `online_version.html` still works independently as a fallback

**Exit criteria:** `npm run dev` serves a blank Svelte app. Old HTML file still opens directly in browser.

---

## Phase 1 — Core Shell + Dashboard Migration
**Duration: 2–3 days**
**Ships: working dashboard in Svelte, identical to current**

### Tasks

1. **Create `src/lib/stores.js`** — writable stores for `view`, `profile`, `providerReachable`, `activeDetailId`, `activeDraft`

2. **Create `App.svelte`**
   - Handles bootstrap (storage init, profile load, health check)
   - Conditionally renders the active view using `{#if $view === 'dashboard'}` blocks
   - Houses `<Header>`, `<Spinner>`, `<ConfirmModal>` always

3. **Create `Header.svelte`**
   - Stat bar (Total, This Week, Overdue, Completed)
   - AI status dot (reads `$providerReachable`)
   - Navigation buttons

4. **Create `Dashboard.svelte`**
   - Replaces `src/ui/dashboard.js`
   - Uses `{#each}` blocks instead of HTML string concatenation
   - **Fix the XSS issue**: `{t.title}` instead of innerHTML — Svelte escapes by default
   - Assignment cards with urgency tags, difficulty pills, progress bars
   - **Add: separate completed tab** (new feature — trivial in Svelte with a boolean toggle + `{#if}`)

5. **Create `Spinner.svelte` and `ConfirmModal.svelte`** — reusable, replaces the DOM-mutation versions in `dom.js`

### New Feature Delivered in This Phase
- **Separate tab for completed assignments** — instead of a collapsible section, render as a proper tab alongside "Active" using Svelte's reactive tab state. Trivial to add while building the Dashboard component.

**Exit criteria:** Dashboard loads, cards render correctly, clicking a card logs the ID to console (detail not migrated yet).

---

## Phase 2 — Add View + Image Parser Input
**Duration: 3–4 days**
**Ships: full add flow in Svelte + image input method**

### Tasks

1. **Create `Add.svelte`**
   - Three tabs: Paste, Upload PDF, Manual — now add **Image** as a fourth
   - Replaces the tab-switching and form logic from `src/ui/add.js`
   - PDF extraction logic moves into a `lib/parsers/pdf.js` helper
   - Preview card renders reactively as `$activeDraft` is set

2. **Add "Extra Notes for AI" to all input methods**
   - Currently only the PDF upload tab has this field
   - In Svelte, this is just one shared `extraNotes` variable bound with `bind:value`
   - Pass it appended to `rawContent` before every `analyzeAssignment()` call

3. **Image Parser input tab** (new feature)
   - New tab: "Upload Image"
   - Accept `image/png`, `image/jpeg` inputs
   - Convert to base64, send to LLM provider that supports vision (Anthropic Claude, OpenAI GPT-4o)
   - Add a capability check: if the selected provider doesn't support vision, show a clear message
   - Extend `src/lib/llm/client.js` with an `analyzeImage(base64, mimeType, profile)` function
   - The image message format differs per provider:
     - Anthropic: `{ type: "image", source: { type: "base64", media_type, data } }`
     - OpenAI: `{ type: "image_url", image_url: { url: "data:..." } }`
     - Ollama: vision-capable models only (llava, etc.) — document this in the UI

**Exit criteria:** All four input methods work. Extra notes field present on all tabs. Analysis and preview flow works end to end.

---

## Phase 3 — Detail View + Settings Migration
**Duration: 2 days**
**Ships: complete view migration**

### Tasks

1. **Create `Detail.svelte`**
   - Replaces `src/ui/detail.js`
   - Checklist items with reactive checkbox binding (`bind:checked`)
   - Boost / Unboost flow
   - Re-analyze flow
   - Deadline date picker with reactive save (no separate "Save Date" button needed — use Svelte's `on:change`)

2. **Create `Settings.svelte`**
   - Replaces `src/ui/settings.js`
   - Provider selector reactively shows/hides API key vs base URL fields
   - Model hints update reactively based on selected provider
   - Test connection button

3. **Add light/dark theme toggle** (new feature)
   - Add a `theme` writable store (`'light'` | `'dark'` | `'system'`)
   - On change, toggle a `data-theme` attribute on `<html>`
   - Move CSS variables into `[data-theme="light"]` and `[data-theme="dark"]` blocks in `style.css`
   - Default: `'system'` (reads `prefers-color-scheme` — existing behavior preserved)
   - Persist theme choice to localStorage via `storage.js`

**Exit criteria:** All four views migrated. Old `online_version.html` and `main.js` can be deleted. Light/dark toggle works.

---

## Phase 4 — Task Manager + Combined Priority List
**Duration: 3–4 days**
**Ships: tasks feature, unified priority view**

### Data Model

Add a new entity type. Tasks are intentionally simpler than assignments — no PDF parsing, no AI analysis by default, just text + priority.

```javascript
// src/lib/model.js — add normalizeTask()
export function normalizeTask(t) {
  return {
    id: t.id || null,
    entityType: 'task',           // distinguishes from assignment in combined list
    title: t.title || 'Untitled',
    description: t.description || '',
    status: STATUS.includes(t.status) ? t.status : 'active',
    priorityScore: clamp(parseInt(t.priorityScore) || 50, 0, 100),
    priorityReasoning: t.priorityReasoning || '',
    boost: normalizeBoost(t.boost),
    deadline: t.deadline || null,
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || new Date().toISOString(),
  };
}
```

Storage keys:
- `tasks:index` — array of task IDs
- `tasks:{id}` — individual task objects
- Increment `LATEST_SCHEMA_VERSION` to 2 in `migrations.js`

### Tasks

1. **Extend `src/lib/storage.js`** with `getTask`, `saveTask`, `deleteTask`, `getTaskIndex`

2. **Extend `src/lib/constants.js`** — add `ENTITY_TYPES = ['assignment', 'task']`

3. **Create `TaskManager.svelte`** (new view accessible from header nav)
   - Text-only input: title + optional description + deadline
   - Optional AI analysis button (uses same `analyzeAssignment` call with task text)
   - Task list with same card design, urgency labels, boost support
   - Mark done / delete

4. **Update `Dashboard.svelte`** — combined priority list
   - The `priorityList` derived store merges assignments + tasks
   - Each card shows an `entityType` badge ("Assignment" vs "Task") so they're distinguishable
   - Completed section groups both types together under the completed tab

5. **Update `Header.svelte`** — add Tasks nav button

**Exit criteria:** Tasks can be created, prioritized, boosted, and completed. Combined list sorts correctly across both types.

---

## Phase 5 — Calendar Integration
**Duration: 3–5 days**
**Ships: calendar view with assignment/task overlay**

### Approach

Use **[svelte-calendar](https://github.com/6eDesign/svelte-calendar)** or build a lightweight month-grid component from scratch (recommended — gives full control over how items render on dates).

### Tasks

1. **Create `Calendar.svelte`** (new view)
   - Month grid view (7 columns, variable rows)
   - Each cell shows the date number + any assignments/tasks due that day as small chips
   - Clicking a chip navigates to that item's detail view
   - Previous/Next month navigation
   - Today highlighted

2. **Due date awareness**
   - Items with `deadline` set appear on their date cell
   - Items with `urgency === 'Overdue'` show in a distinct color on past dates
   - Items without a deadline show in an "Undated" sidebar panel beside the calendar

3. **Add Calendar nav button to `Header.svelte`**

4. **Google Calendar integration** (optional stretch goal for this phase)
   - Export a single assignment/task as an `.ics` file (no OAuth needed)
   - Or: integrate via Google Calendar MCP if the user has it connected
   - Keep this behind a feature flag in Settings ("Enable calendar export")

**Exit criteria:** Calendar renders correctly. All items with deadlines appear on correct dates. Navigation between months works. Clicking an item opens its detail view.

---

## Security Fix (Do Before or During Phase 1)

Current `dashboard.js` and `detail.js` insert `t.title` and other user-provided strings directly via `innerHTML`. This is an XSS vector if a user pastes malicious content as an assignment title.

**Fix in Svelte:** This is automatic — Svelte's `{expression}` syntax escapes HTML by default. The only place to be careful is if you use `{@html ...}` — avoid it unless absolutely necessary, and sanitize with DOMPurify if you do.

**Also fix in the legacy file before migrating** (one-liner):
```javascript
// In dashboard.js, replace:
html += `<h3 class="card-title">${t.title}</h3>`
// With:
const titleEl = document.createElement('h3');
titleEl.className = 'card-title';
titleEl.textContent = t.title;
```

---

## Migration Execution Order Summary

```
Phase 0   Tooling setup                          ~1 hour
Phase 1   Shell + Dashboard + Completed tab      ~2–3 days
Phase 2   Add view + Image parser + Extra notes  ~3–4 days
Phase 3   Detail + Settings + Light theme        ~2 days
Phase 4   Task manager + Combined list           ~3–4 days
Phase 5   Calendar                               ~3–5 days
```

Each phase is independently shippable. After Phase 1, the app is usable. Each subsequent phase adds features without breaking existing ones.

---

## Dependency Summary

```json
{
  "dependencies": {},
  "devDependencies": {
    "vite": "^5.0.0",
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "svelte": "^4.0.0"
  }
}
```

No runtime dependencies are required. All LLM calls, storage, and parsing are handled by your existing code. DOMPurify is optional if you ever use `{@html}`.

---

## Notes on Provider Support for Image Parsing

| Provider | Vision Support | Notes |
|---|---|---|
| Anthropic (Claude) | Yes | claude-3 and above; base64 image in message content |
| OpenAI (GPT-4o) | Yes | `image_url` with base64 data URI |
| Ollama | Model-dependent | llava, bakllava, moondream — must be pulled separately |

The UI should check `profile.provider` before showing the image tab, or show it always but display a warning if the selected model is unlikely to support vision.
