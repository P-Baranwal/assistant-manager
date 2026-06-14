import { writable, derived } from 'svelte/store';

export const view = writable('dashboard');         // 'dashboard', 'add', 'detail', 'settings'
export const profile = writable(null);             // user profile object
export const providerReachable = writable(false);  // AI status dot
export const activeDetailId = writable(null);      // detail view target
export const activeDraft = writable(null);         // add view draft
export const authStore = writable({ user: null, session: null, isGuest: true });

// PWA: Online/Offline state
export const isOnline = writable(typeof navigator !== 'undefined' ? navigator.onLine : true);

// PWA: Install prompt state
export const deferredPrompt = writable(null);
export const canInstall = writable(false);
export const showInstallBanner = writable(false);
export const showIOSInstructions = writable(false);

// Theme defaults to 'system' and will be loaded asynchronously during initialization
export const theme = writable('system');

// We hold all loaded assignments and tasks in memory for reactivity
export const assignments = writable([]);
export const tasks = writable([]);

// Pro: Projects store
export const projects = writable([]);

// Simple mapping function to determine combined priority score
const mapScore = (t) => t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore;

// Derived: combined sorted priority list (assignments + tasks)
export const priorityList = derived(
  [assignments, tasks],
  ([$assignments, $tasks]) => {
    return [...$assignments, ...$tasks]
      .filter(i => i.status !== 'done')
      .sort((a, b) => mapScore(b) - mapScore(a));
  }
);

// Derived: completed items list
export const completedList = derived(
  [assignments, tasks],
  ([$assignments, $tasks]) => {
    return [...$assignments, ...$tasks]
      .filter(i => i.status === 'done')
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
);

// ── Pro-specific derived stores ──

// Tasks grouped by projectId (only non-done tasks)
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

// Tasks with no project (inbox / orphans)
export const unassignedTasks = derived(
  tasks,
  ($tasks) => $tasks.filter(t => !t.projectId && t.status !== 'done')
);

// Tasks flagged as blocked
export const blockedTasks = derived(
  tasks,
  ($tasks) => $tasks.filter(t => t.status === 'blocked')
);

// High ROI tasks (high impact, low estimated hours) — top 5
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

// ── Collaboration / Team stores ──

export const currentTeam = writable(null);       // { id, name, memberRole, teamSkillsProfile }
export const teamMembers = writable([]);         // [{ userId, displayName, role, joinedAt }]
export const teamActivity = writable([]);        // [{ id, action, entityTitle, userName, createdAt, ... }]
export const notifications = writable([]);       // [{ id, title, body, read_at, ... }]

export const unreadNotifications = derived(
  notifications,
  ($notifications) => $notifications.filter(n => !n.read_at).length
);

// Derived: shared projects (projects with visibility='shared' visible to user)
export const sharedProjects = derived(
  projects,
  ($projects) => $projects.filter(p => p.visibility === 'shared')
);

// Derived: my private projects
export const privateProjects = derived(
  projects,
  ($projects) => $projects.filter(p => p.visibility !== 'shared')
);

// ── Phase 6: Smart AI Features stores ──

export const weeklyPlan = writable(null);          // Array of day objects from generateWeeklyPlan()
export const riskAlertDismissed = writable(false);  // Whether user dismissed today's risk banner
export const nlPreview = writable(null);           // Natural language extraction preview object
