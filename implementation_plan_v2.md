# Dual-Tier Architecture: Detailed Implementation Plan v2

This plan details the transition of the offline-first Assistant Manager app from a student-centric assignment manager to a dual-tier (Student / Professional) application.

---

## Design Decisions (Locked)

| Decision | Choice |
|---|---|
| Pro dashboard layout | Kanban board (To Do → In Progress → Blocked → Done) |
| Mode switching | None — subscription tier determines interface at load time (Simulated via Settings toggle) |
| Header | Two separate components: `StudentHeader.svelte`, `ProHeader.svelte` |
| Epics tier | Not included — data model is flat: Projects → Tasks only |
| Blocker field | `blockerNote: string` (plain text, avoids stale ID references) |
| WBS flow | AI generates sub-tasks as a preview; user edits before saving |

---

## Phase 0: Structural Refactor (No New Features) - [Completed]

Relocated existing files into the namespaced layout without changing any logic. The app remains fully functional.

### Current Directory Layout

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

---

## Phase 1: Data Model & Storage Layer

All changes here are additive and backward-compatible. Existing student data will survive untouched.

### 1.1 `src/lib/constants.js`

```javascript
// ADD to STORAGE_KEYS:
INDEX_PROJECTS: 'projects:index'

// ADD to ENTITY_TYPES:
'project'

// ADD new constant:
export const TIERS = ['student', 'professional'];

// ADD new constant:
export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done'];

// Union of all possible status strings to prevent normalization errors:
export const STATUS = ['active', 'done', 'todo', 'in_progress', 'blocked'];

// ADD new constant:
export const IMPACT = {
    MIN: 1,
    MAX: 10
};
```

### 1.2 `src/lib/model.js`

**Update `normalizeProfile`:**
```javascript
export function normalizeProfile(p) {
    if (!p) p = {};
    return {
        // ... existing fields ...
        skills: p.skills || "",
        priorityPreset: p.priorityPreset || "Balanced",
        customPriorityRule: p.customPriorityRule || "",
        provider: p.provider || "ollama",
        ollamaUrl: p.ollamaUrl || "http://localhost:11434",
        ollamaModel: p.ollamaModel || "qwen2.5-coder:7b",
        apiKey: p.apiKey || "",
        
        tier: TIERS.includes(p.tier) ? p.tier : 'student', // ADD THIS
        defaultProjectId: p.defaultProjectId || null        // ADD THIS
    };
}
```

**Update `normalizeTask`:**
```javascript
export function normalizeTask(t) {
    if (!t) t = {};
    const base = {
        id: t.id || null,
        entityType: 'task',
        title: t.title || "Untitled",
        description: t.description || "",
        status: STATUS.includes(t.status) ? t.status : "active",
        priorityReasoning: t.priorityReasoning || "",
        boost: normalizeBoost(t.boost),
        deadline: t.deadline || null,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),
        
        // Pro-specific fields
        projectId: t.projectId || null,
        actualHours: Math.max(0, parseFloat(t.actualHours) || 0),
        estimatedHours: Math.max(0, parseFloat(t.estimatedHours) || 1),
        impactScore: t.impactScore ? Math.max(IMPACT.MIN, Math.min(IMPACT.MAX, parseInt(t.impactScore))) : null,
        blockerNote: t.blockerNote || null
    };

    // Calculate priority dynamically for pro tasks using ROI metric
    if (base.impactScore !== null) {
        // ROI score normalized: (Impact / estimatedHours) * 10
        // Cap estimated hours floor at 0.5 to prevent divide-by-zero or massive inflation
        const hoursFloor = Math.max(base.estimatedHours, 0.5);
        base.priorityScore = Math.min(100, Math.max(0, Math.round((base.impactScore / hoursFloor) * 10)));
        base.priorityReasoning = `ROI Priority: ${base.impactScore} impact vs ${base.estimatedHours}h estimated effort.`;
    } else {
        base.priorityScore = Math.max(0, Math.min(100, parseInt(t.priorityScore) || 50));
    }

    return base;
}
```

**Add `normalizeProject`:**
```javascript
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

### 1.3 `src/lib/storage.js`

Add Project CRUD methods below the existing task methods:
```javascript
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

Increment `LATEST_SCHEMA_VERSION` to `3`. Implement:
```javascript
if (currentVersion < 3) {
    // Backfill profile tier
    let profile = await adapter.get(STORAGE_KEYS.PROFILE) || {};
    if (!profile.tier) {
        profile.tier = 'student';
        await adapter.set(STORAGE_KEYS.PROFILE, profile);
    }

    // Backfill pro fields on existing tasks
    let tIndex = await adapter.get(STORAGE_KEYS.INDEX_TASKS) || [];
    for (const id of tIndex) {
        let task = await adapter.get(`tasks:${id}`);
        if (task) {
            task = normalizeTask(task);
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

Add pro-specific stores:
```javascript
export const projects = writable([]);

// Tasks grouped by projectId
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

// Tasks with no project (inbox/orphans)
export const unassignedTasks = derived(
    tasks,
    ($tasks) => $tasks.filter(t => !t.projectId && t.status !== 'done')
);

// Tasks flagged as blocked
export const blockedTasks = derived(
    tasks,
    ($tasks) => $tasks.filter(t => t.status === 'blocked')
);

// High ROI tasks (high impact, low estimated hours) sorted descending by ROI
export const highRoiTasks = derived(
    tasks,
    ($tasks) => $tasks
        .filter(t => t.impactScore !== null && t.estimatedHours && t.status !== 'done')
        .sort((a, b) => {
            const roiA = a.impactScore / Math.max(a.estimatedHours, 0.5);
            const roiB = b.impactScore / Math.max(b.estimatedHours, 0.5);
            return roiB - roiA;
        })
        .slice(0, 5)
);
```

---

## Phase 2: App Routing & Settings

### 2.1 `src/App.svelte`

Load projects on mount and route dynamically based on `$profile.tier`:
```javascript
// onMount updates:
const pIndex = await storage.getProjectIndex();
const pPromises = pIndex.map(id => storage.getProject(id));
const allProjects = (await Promise.all(pPromises)).filter(Boolean);
projects.set(allProjects);
```

Update router in Svelte markup:
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

### 2.2 `src/student/views/Settings.svelte`

- Add a **Subscription / Interface Mode** dropdown/radio group:
  - Binds to `p.tier`. Options: `"student"` (labeled `"Student Mode"`) and `"professional"` (labeled `"Professional Mode"`).
- Add conditional fields:
  ```svelte
  {#if p.tier === 'professional'}
      <div class="form-group">
          <label class="form-label" for="default-project">Default Project</label>
          <select id="default-project" class="input" bind:value={p.defaultProjectId}>
              <option value={null}>None (Send to Inbox)</option>
              {#each $projects as proj}
                  <option value={proj.id}>{proj.title}</option>
              {/each}
          </select>
      </div>
  {/if}
  ```
- Conditionally hide student priority presets:
  ```svelte
  {#if p.tier !== 'professional'}
      <!-- Standard baseline sorting presets -->
  {:else}
      <div class="detail-card text-sm mb-4">
          <strong>Sorting Directive</strong>
          <p class="text-muted mt-1">Professional sorting uses dynamic ROI algorithm. Tasks are sorted based on Impact / Effort.</p>
      </div>
  {/if}
  ```

---

## Phase 3: Professional UI Components

### 3.1 `src/pro/components/ProHeader.svelte`

A clean, stat-driven header bar for professionals:
- Stats displayed:
  - **Active Projects** (number of projects in `projects` store)
  - **Tasks This Week** (number of active tasks due within 7 days)
  - **Blocked Tasks** (from `blockedTasks` store)
  - **High ROI Tasks** (from `highRoiTasks` store)
- Action buttons:
  - AI connection status indicator dot (green/amber).
  - Settings icon button -> routes to `settings`.
  - Dashboard navigation link -> routes to `dashboard`.
  - **Add Project / WBS** (button-primary) -> routes to `add`.

### 3.2 `src/pro/views/ProDashboard.svelte`

- **Kanban Board Container**:
  - Horizontal list of columns:
    - **To Do** (`status === 'todo'`)
    - **In Progress** (`status === 'in_progress'`)
    - **Blocked** (`status === 'blocked'`)
    - **Done** (`status === 'done'`)
  - Columns scroll vertically, layout wraps nicely on smaller viewports.
- **Inbox Section**:
  - Renders above the Kanban board for `unassignedTasks`. Allows easy viewing of tasks not linked to projects.
- **Collapsible ROI Sidebar**:
  - Highlights top 5 tasks from `highRoiTasks`.
- **Fallbacks & Actions**:
  - Tasks rendered as cards. Each card displays: Title, Project Name, Est. Hours, Impact Score, Blocker indicator (if status `'blocked'`).
  - Card includes a compact selector dropdown to transition status immediately.

### 3.3 `src/pro/views/ProAdd.svelte`

Form for starting project tasks via AI:
- **Project Selection**:
  - Select existing project or choose inline **"+ Create New Project"** text field.
- **Prompt Area**:
  - Textarea to paste client briefs.
- **WBS Preview Grid**:
  - Renders a preview list of generated subtasks with input boxes for `title`, `estimatedHours`, and `impactScore`.
  - Buttons to **Delete Row** and **Add New Row** to customize the AI-suggested plan before committing.
- **Save Flow**:
  - Decomposes final list, assigns `projectId` (or creates a project if new project inline title is entered), sets `status: 'todo'`, and batch writes tasks via `storage.saveTask`.

### 3.4 `src/pro/views/ProDetail.svelte`

Detailed inspector view for a task:
- Status dropdown selector (`todo`, `in_progress`, `blocked`, `done`).
- Blocker Note textarea (automatically sets status to `'blocked'` on submit if populated).
- Actual Hours number input. Displays variance indicator against Est. Hours (e.g. `2.5h / 2h` with visual progress bar).
- Impact Score input slider (1-10) showing computed Priority Score in real time.
- Parent Project field: selector dropdown to re-assign task to a different project.

---

## Phase 4: AI Engine WBS Generator

### 4.1 `src/lib/llm/client.js`

Implement `generateWBS(brief, profile)`:
```javascript
export async function generateWBS(brief, profile) {
    const providerName = profile.provider || 'ollama';
    const plugin = providers[providerName];
    if (!plugin) throw new Error(`Unknown provider: ${providerName}`);

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
- Titles must be specific, granular, and actionable (e.g. "Research and configure OAuth2 auth endpoints" instead of "Research Auth")
- estimatedHours: realistic for a competent professional developer
- impactScore: how much this sub-task moves the needle on the core value (1=minor, 10=critical path)
`.trim();

    const user = `Client brief / feature request:\n"""\n${brief}\n"""`;

    const raw = await plugin.analyze({ system, user, profile });

    // Parse and clean
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

## Phase 5: Styling & Layout Customizations

### `style.css`

Append CSS classes to manage the Kanban and WBS previews:
```css
/* Pro Mode Styles */
.kanban-board {
    display: flex;
    gap: 1.25rem;
    overflow-x: auto;
    padding: 1rem 0;
    align-items: flex-start;
}
.kanban-column {
    flex: 1;
    min-width: 280px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    padding: 1.25rem;
}
.kanban-column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-weight: 600;
}
.kanban-column-count {
    background: var(--border-color);
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 99px;
    color: var(--text-muted);
}
.kanban-card {
    background: var(--surface-color);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    padding: 1rem;
    margin-bottom: 0.75rem;
    cursor: pointer;
    transition: var(--transition);
}
.kanban-card:hover {
    border-color: var(--text-muted);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
}
.status-select {
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.25rem;
    font-size: 0.8125rem;
}
.wbs-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    background: var(--surface-color);
    border-radius: var(--radius);
    overflow: hidden;
}
.wbs-table th, .wbs-table td {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-color);
    text-align: left;
}
.wbs-table th {
    background: var(--bg-color);
    font-weight: 600;
}
```

---

## Verification Checklist

### Automated Tests
- Run `npm run build` and ensure compilation has no errors.
- Confirm Svelte components render cleanly with no exceptions.

### Manual Verification
- [ ] Profile tier toggling in Settings works seamlessly, loading appropriate headers and layout components.
- [ ] Database migration backfills default pro attributes onto existing student tasks.
- [ ] Dynamic ROI calculation for priority works instantly when changing Est. Hours or Impact score.
- [ ] Project CRUD correctly modifies the list and indices.
- [ ] WBS AI generator processes user briefs, populates editable preview rows, and saves under the selected project.
- [ ] Column updates on the Kanban board persist instantly and survive reload.
- [ ] Entering a blocker note successfully switches task status to `'blocked'`. Removing the blocker note restores status to `'todo'`.
- [ ] Top 5 ROI tasks are accurately surfaced in the collapsible sidebar.
