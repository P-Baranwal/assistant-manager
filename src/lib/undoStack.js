import { writable, get } from 'svelte/store';

/**
 * Simple single-level undo stack for destructive actions.
 * Each entry: { label: string, restore: async () => void }
 * Only keeps the most recent undoable action.
 */
function createUndoStore() {
    const { subscribe, set, update } = writable(null);

    let dismissTimer = null;

    function push(label, restoreFn) {
        // Clear any existing timer
        if (dismissTimer) clearTimeout(dismissTimer);
        
        set({ label, restore: restoreFn });
        
        // Auto-dismiss after 8 seconds
        dismissTimer = setTimeout(() => {
            set(null);
        }, 8000);
    }

    async function undo() {
        const current = get({ subscribe });
        if (current && current.restore) {
            await current.restore();
        }
        if (dismissTimer) clearTimeout(dismissTimer);
        set(null);
    }

    function dismiss() {
        if (dismissTimer) clearTimeout(dismissTimer);
        set(null);
    }

    return {
        subscribe,
        push,
        undo,
        dismiss
    };
}

export const undoStack = createUndoStore();
