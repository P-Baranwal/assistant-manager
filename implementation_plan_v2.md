# Dual-Tier Architecture: Implementation Plan v2

## Design Decisions (Locked)

| Decision | Choice |
|---|---|
| Pro dashboard layout | Kanban board (To Do → In Progress → Blocked → Done) |
| Mode switching | None — subscription tier determines interface at load time |
| Header | Two separate components: `StudentHeader.svelte`, `ProHeader.svelte` |
| Epics tier | Not included — data model is flat: Projects → Tasks only |
| Blocker field | `blockerNote: string` (plain text, avoids stale ID references) |
| WBS flow | AI generates sub-tasks as a preview; user edits before saving |

---

## Phase 0: Structural Refactor (No New Features)

Relocate existing files into the namespaced layout without changing any logic. The app must remain fully functional after this phase.

### New Directory Layout

```
src/
  lib/                        ← unchanged, fully shared
    llm/
      providers/
        anthropic.js
        openai.js
        ollama.js
        gemini.js
        groq.js
      client.js
      contract.js
    utils/
      date.js
      id.js
    storage.js
    model.js
    stores.js
    constants.js
    migrations.js

  components/                 ← only truly shared primitives
    Spinner.svelte
    ConfirmModal.svelte

  student/
    views/
      Dashboard.svelte        ← moved from src/views/
      Add.svelte              ← moved from src/views/
      Detail.svelte           ← moved from src/views/
      Calendar.svelte         ← moved from src/views/
      TaskManager.svelte      ← moved from src/views/
      Settings.svelte         ← moved from src/views/
    components/
      StudentHeader.svelte    ← extracted from src/components/Header.svelte

  pro/
    views/                    ← all new (Phase 2+)
    components/               ← all new (Phase 2+)

  App.svelte                  ← updated routing (Phase 1)
  main.js
```

### Steps

1. Create directory structure above.
2. Move all `src/views/*.svelte` → `src/student/views/`.
3. Create `src/student/components/StudentHeader.svelte` by copying the current `Header.svelte` verbatim — no logic changes yet.
4. Delete `src/components/Header.svelte`.
5. Update all import paths in every moved file and in `App.svelte`.
6. Update `vite.config.js` alias if needed.
7. Run the app and confirm it is identical to pre-refactor.

---

## Phase 1: Data Model & Storage Layer

All changes here are additive and backward-compatible. Existing student data must survive untouched.

### 1.1 `src/lib/constants.js`

```js
// ADD to STORAGE_KEYS:
INDEX_PROJECTS: 'projects:index'

// ADD to ENTITY_TYPES:
'project'

// ADD new constant:
export const TIERS = ['student', 'professional'];

// ADD new constant:
export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done'];
// Note: existing student tasks use 'active' and 'done'.
// 'active' maps to 'todo' in pro context. Migration handles this.

// ADD new constant:
export const IMPACT = {
    MIN: 1,
    MAX: 10
};
```

### 1.2 `src/lib/model.js`

**Update `normalizeProfile`:**
```js
export function normalizeProfile(p) {
    if (!p) p = {};
    return {
        // ... existing fields unchanged ...
        tier: TIERS.includes(p.tier) ? p.tier : 'student'  // ADD THIS
    };
}
```

**Update `normalizeTask` — add pro fields with safe defaults:**
```js
export function normalizeTask(t) {
    if (!t) t = {};
    return {
        // ... all existing fields unchanged ...
        
        // Pro fields — safe defaults mean existing student tasks are unaffected
        projectId: t.projectId || null,
        actualHours: Math.max(0, parseFloat(t.actualHours) || 0),
        impactScore: t.impactScore
            ? Math.max(IMPACT.MIN, Math.min(IMPACT.MAX, parseInt(t.impactScore)))
            : null,
        blockerNote: t.blockerNote || null
    };
}
```

**Add `normalizeProject`:**
```js
export function normalizeProject(p) {
    if (!p) p = {};
    return {
        id: p.id || null,
        entityType: 'project',
        title: p.title || 'Untitled Project',
        clientContext: p.clientContext || '',   // brief/context pasted by user
        status: ['active', 'done'].includes(p.status) ? p.status : 'active',
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString()
    };
}
```

**Note on Task status for Pro:** Pro Kanban uses `todo | in_progress | blocked | done`. Student tasks use `active | done`. The `normalizeTask` STATUS check should remain lenient — accept all valid values from both sets. Update the STATUS constant:

```js
// constants.js
export const STATUS = ['active', 'done', 'todo', 'in_progress', 'blocked'];
```

### 1.3 `src/lib/storage.js`

Add Project CRUD below the existing task methods:

```js
async getProjectIndex() {
    return (await adapter.get(STORAGE_KEYS.INDEX_PROJECTS)) || [];
},
async getProject(id) {
    const p = await adapter.get(`projects:${id}`);
    return p ? normalizeProject(p) : null;
},
async saveProject(project) {
    const norm = normalizeProject(project);
    await adapter.set(`projects:${norm.id}`, norm);
    let idx = await this.getProjectIndex();
    if (!idx.includes(norm.id)) {
        idx.push(norm.id);
        await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, idx);
    }
},
async deleteProject(id) {
    await adapter.delete(`projects:${id}`);
    let idx = await this.getProjectIndex();
    idx = idx.filter(x => x !== id);
    await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, idx);
}
```

### 1.4 `src/lib/migrations.js`

Increment `LATEST_SCHEMA_VERSION` to `3`.

```js
if (currentVersion < 3) {
    // v3: Add tier to profile; add pro fields to existing tasks;
    //     initialize empty projects index.

    // Backfill profile tier
    let profile = await adapter.get(STORAGE_KEYS.PROFILE) || {};
    if (!profile.tier) {
        profile.tier = 'student';
        await adapter.set(STORAGE_KEYS.PROFILE, profile);
    }

    // Backfill pro fields on existing tasks (normalizeTask handles defaults)
    let tIndex = await adapter.get(STORAGE_KEYS.INDEX_TASKS) || [];
    for (const id of tIndex) {
        let task = await adapter.get(`tasks:${id}`);
        if (task) {
            task = normalizeTask(task);  // adds projectId:null, etc.
            await adapter.set(`tasks:${id}`, task);
        }
    }

    // Initialize empty projects index if absent
    const existingIdx = await adapter.get(STORAGE_KEYS.INDEX_PROJECTS);
    if (!existingIdx) {
        await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, []);
    }

    currentVersion = 3;
    await adapter.set(STORAGE_KEYS.SCHEMA_VERSION, currentVersion);
    console.log('[Migrations] Migrated to schema version 3');
}
```

### 1.5 `src/lib/stores.js`

Add pro-specific stores below existing ones:

```js
// ADD
export const projects = writable([]);

// ADD derived: tasks grouped by projectId
export const tasksByProject = derived(
    [projects, tasks],
    ([$projects, $tasks]) => {
        const map = {};
        for (const p of $projects) {
            map[p.id] = {
                project: p,
                tasks: $tasks.filter(t => t.projectId === p.id && t.status !== 'done')
            };
        }
        return map;
    }
);

// ADD derived: tasks with no project (orphans / inbox)
export const unassignedTasks = derived(
    tasks,
    ($tasks) => $tasks.filter(t => !t.projectId && t.status !== 'done')
);

// ADD derived: tasks flagged as blocked
export const blockedTasks = derived(
    tasks,
    ($tasks) => $tasks.filter(t => t.status === 'blocked')
);

// ADD derived: high ROI tasks (high impact, low estimated hours)
// ROI score = impactScore / max(estimatedHours, 0.5)
export const highRoiTasks = derived(
    tasks,
    ($tasks) => $tasks
        .filter(t => t.impactScore && t.estimatedHours && t.status !== 'done')
        .sort((a, b) => (b.impactScore / b.estimatedHours) - (a.impactScore / a.estimatedHours))
        .slice(0, 5)
);
```

---

## Phase 2: App Routing

### `src/App.svelte`

Load projects alongside tasks/assignments on `onMount`. Route based on `profile.tier`:

```js
// onMount additions:
const pIndex = await storage.getProjectIndex();
const pPromises = pIndex.map(id => storage.getProject(id));
const allProjects = (await Promise.all(pPromises)).filter(Boolean);
projects.set(allProjects);
```

Update the router:

```svelte
{#if $profile?.tier === 'professional'}
    <ProHeader />
    <main class="view fade-in">
        {#if $view === 'dashboard'}   <ProDashboard />
        {:else if $view === 'add'}    <ProAdd />
        {:else if $view === 'detail'} <ProDetail />
        {:else if $view === 'settings'} <Settings />
        {/if}
    </main>
{:else}
    <StudentHeader />
    <main class="view fade-in">
        {#if $view === 'dashboard'}      <Dashboard />
        {:else if $view === 'add'}       <Add />
        {:else if $view === 'detail'}    <Detail />
        {:else if $view === 'settings'}  <Settings />
        {:else if $view === 'task-manager'} <TaskManager />
        {:else if $view === 'calendar'}  <Calendar />
        {/if}
    </main>
{/if}
```

`Settings.svelte` is shared — it adapts internally based on `$profile.tier` for which fields to show.

---

## Phase 3: Professional UI

### 3.1 `src/pro/components/ProHeader.svelte`

Stat bar shows: **Active Projects · Tasks This Week · Blocked · High ROI**.

Actions: **New Project** button (routes to `add`), **Settings** icon.

No calendar or task-manager nav — Pro workflow is entirely project-scoped.

### 3.2 `src/pro/views/ProDashboard.svelte`

**Layout:** Kanban board. Four columns, horizontally scrollable on mobile.

| Column | Filter |
|---|---|
| To Do | `status === 'todo'` |
| In Progress | `status === 'in_progress'` |
| Blocked | `status === 'blocked'` |
| Done | `status === 'done'` (capped at last 10, collapsible) |

Each column renders task cards from `tasksByProject`. Tasks without a project appear in an **Inbox** section above the board.

Drag-and-drop between columns updates `task.status` and calls `storage.saveTask()`. If drag-and-drop is deferred, provide a status dropdown on each card as a fallback — do not ship the board without a way to move tasks.

A **High ROI** sidebar (collapsible) pulls from the `highRoiTasks` derived store and highlights the top 5 tasks regardless of project.

### 3.3 `src/pro/views/ProAdd.svelte`

**Flow:**

1. User selects or creates a Project (dropdown + "New Project" inline creation).
2. User pastes a feature request / client brief into a textarea.
3. Clicking **Generate Work Breakdown** calls the LLM with the WBS prompt (see Phase 4).
4. A preview table renders the returned sub-tasks: title, estimated hours, impact score — all editable inline.
5. User can delete rows or add blank ones manually.
6. **Save All Tasks** writes each task to storage under the selected `projectId`.

Do not auto-save on generation — the preview step is required per the design decision.

### 3.4 `src/pro/views/ProDetail.svelte`

Extends task detail with pro-specific fields:

- **Status selector:** `todo | in_progress | blocked | done` (replaces the binary Mark Done button for pro tasks).
- **Impact Score:** 1–10 input, shown alongside estimated hours.
- **Actual Hours:** Number input, compared to `estimatedHours` with a variance indicator (e.g., "2h over estimate").
- **Blocker Note:** Plain text field. When non-empty, status is automatically set to `blocked` on save.
- **Project:** Read-only display of the parent project name, with a link-style button to re-assign.

---

## Phase 4: AI Engine Updates

All changes are in `src/lib/llm/` — not a new file.

### 4.1 `src/lib/llm/contract.js`

Add `impactScore` to the existing JSON schema prompt:

```js
export const JSON_SCHEMA_PROMPT = `
...
{
  ...existing fields...,
  "impactScore": integer (1-10) or null,
  "impactReasoning": "one short sentence, null if not a pro task"
}`;
```

Update `normalizeAnalysisResult` to handle `impactScore`:

```js
parsed.impactScore = parsed.impactScore
    ? Math.max(1, Math.min(10, parseInt(parsed.impactScore)))
    : null;
```

### 4.2 `src/lib/llm/client.js`

Add a new exported function `generateWBS` alongside `analyzeAssignment`:

```js
export async function generateWBS(brief, profile) {
    const plugin = providers[profile.provider || 'ollama'];
    const v = plugin.validate(profile);
    if (!v.ok) throw new Error(`Provider invalid: ${v.message}`);

    const system = `
You are a professional project planner. Given a client brief or feature request,
decompose the work into concrete, actionable sub-tasks.

Output ONLY a raw JSON array — no markdown, no fences, no preamble.
Each item must match this shape exactly:
[
  {
    "title": "string",
    "estimatedHours": number,
    "impactScore": integer (1-10)
  }
]

Rules:
- 3 to 8 sub-tasks maximum
- Titles must be specific and actionable (not "Research" — use "Research X API authentication options")
- estimatedHours: realistic for a competent professional (not a beginner, not a hero)
- impactScore: how much this sub-task moves the needle on the overall deliverable (1=minor, 10=critical path)
- Today's date: ${new Date().toISOString().split('T')[0]}
`.trim();

    const user = `Client brief / feature request:\n"""\n${brief}\n"""`;

    const raw = await plugin.analyze({ system, user, profile });

    // Parse and validate
    let parsed;
    try {
        const clean = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
        const arr = JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0] || clean);
        if (!Array.isArray(arr)) throw new Error();
        parsed = arr.map(item => ({
            title: item.title || 'Untitled Task',
            estimatedHours: Math.max(0.25, parseFloat(item.estimatedHours) || 1),
            impactScore: Math.max(1, Math.min(10, parseInt(item.impactScore) || 5))
        }));
    } catch {
        throw new Error('Failed to parse WBS from AI response.');
    }

    return parsed;
}
```

---

## Phase 5: Settings Updates

### `src/views/Settings.svelte` (shared)

`Settings` remains one file used by both tiers. Add a **Workspace** section at the top that only shows in certain contexts:

- If `profile.tier === 'professional'`, show a **Default Project** dropdown (select which project new tasks fall into by default).
- The AI Provider, Skills, and Priority sections remain as-is for both tiers.
- The Priority Preset options are student-centric — hide them for pro users and replace with a short note that pro priority is computed from impact score vs estimated hours.

The `tier` field itself is **not user-editable in Settings** — it is set at account/subscription time and should be treated as read-only in the UI.

---

## Verification Checklist

### Phase 0 (Refactor)
- [ ] App loads and is visually identical after file moves
- [ ] All import paths resolve — no console errors
- [ ] Student assignment creation, detail, and deletion all work
- [ ] Calendar and task manager load correctly

### Phase 1 (Data Layer)
- [ ] Migration v3 runs on first load without errors
- [ ] Existing student assignments and tasks are intact after migration
- [ ] `profile.tier` is present and defaults to `'student'`
- [ ] `projects:index` exists in localStorage after migration

### Phase 2 (Routing)
- [ ] Student tier renders existing interface unchanged
- [ ] Manually setting `profile.tier = 'professional'` in localStorage and refreshing loads Pro views
- [ ] Settings loads for both tiers

### Phase 3 (Pro UI)
- [ ] Kanban board renders four columns
- [ ] Task status change persists on reload
- [ ] WBS preview renders before saving
- [ ] All generated tasks save under the correct `projectId`
- [ ] Blocker note setting status to `blocked` moves card to Blocked column

### Phase 4 (AI)
- [ ] `generateWBS` returns 3–8 tasks for a sample brief
- [ ] Malformed LLM responses throw a readable error (not a silent crash)
- [ ] `impactScore` appears on pro task detail view after WBS import

---

## What This Plan Does Not Include

The following are explicitly out of scope for this implementation phase:

- Payment / subscription gating — `tier` is set manually or via a future auth layer
- Multi-device sync
- Real drag-and-drop library integration (status dropdown is the fallback)
- Notifications or deadline reminders
- Export / reporting features
