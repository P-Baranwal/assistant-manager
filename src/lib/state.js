/**
 * Core application state containing active routing, active profile, and global metadata flags.
 * Used exclusively for holding domain state.
 */
export const state = {
    view: 'dashboard',         // 'dashboard', 'add', 'detail', 'settings'
    profile: null,             // Populated on startup from storage
    ollamaReachable: false,
    activeDraft: null,         // Object shape loaded during "Add Assignment"
    activeDetailId: null       // Used when viewing an assignment
};

// Safe simple setters (optional, though direct mutation usually works fine in plain JS if scoped carefully)
export function setProfileState(p) {
    state.profile = p;
}

export function setView(viewName) {
    state.view = viewName;
}

export function setOllamaReachable(isReachable) {
    state.ollamaReachable = isReachable;
}

export function setActiveDetailId(id) {
    state.activeDetailId = id;
}

export function setActiveDraft(draft) {
    state.activeDraft = draft;
}
