export const routes = {};

/**
 * Registers an async handler for a given action route.
 * @param {string} actionPath - The string matching the action segment (e.g. "view", "detail:done")
 * @param {Function} handler - Async function(payload, targetElement, event)
 */
export function registerRouter(actionPath, handler) {
    if (routes[actionPath]) {
        console.warn(`[Actions] Overriding existing route handler for: ${actionPath}`);
    }
    routes[actionPath] = handler;
}

/**
 * Parses and dispatches an action encoded in a string.
 * We split safely on the first colon ONLY.
 */
export async function dispatch(composedActionStr, targetElement, event) {
    if (!composedActionStr) return;
    
    // Safely parse `action:payload`
    const colonIdx = composedActionStr.indexOf(':');
    let actionPath, payload;
    
    if (colonIdx === -1) {
        actionPath = composedActionStr;
        payload = null;
    } else {
        actionPath = composedActionStr.slice(0, colonIdx);
        payload = composedActionStr.slice(colonIdx + 1);
    }
    
    // Some routes might encode namespace vs action explicitly in the id/name or map directly perfectly
    // Allow trying exact match first (if they registered "detail:open" explicitly instead of "detail" with "open" payload).
    let handler = routes[composedActionStr]; 
    if (!handler) {
        handler = routes[actionPath];
    }
    
    if (!handler) {
        console.warn(`[Actions] Unknown action dispatched: ${actionPath}`, { composedActionStr, targetElement });
        return;
    }
    
    try {
        await handler(payload, targetElement, event);
    } catch(err) {
        console.error(`[Actions] Route ${actionPath} threw an error:`, err);
    }
}

/**
 * Attach global delegators once.
 */
export function initGlobalDelegators() {
    document.body.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if(!btn) return;
        await dispatch(btn.dataset.action, btn, e);
    });

    document.body.addEventListener('change', async (e) => {
        const target = e.target.closest('[data-action]');
        if(!target) return;
        await dispatch(target.dataset.action, target, e);
    });
}
