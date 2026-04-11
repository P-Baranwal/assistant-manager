import { writable, derived } from 'svelte/store';

export const view = writable('dashboard');         // 'dashboard', 'add', 'detail', 'settings'
export const profile = writable(null);             // user profile object
export const providerReachable = writable(false);  // AI status dot
export const activeDetailId = writable(null);      // detail view target
export const activeDraft = writable(null);         // add view draft

// We hold all loaded assignments and tasks in memory for reactivity
export const assignments = writable([]);
export const tasks = writable([]);

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
