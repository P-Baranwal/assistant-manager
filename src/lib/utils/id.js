/**
 * Generates a standard UUID fallback or cryptographically safe UUID.
 * @returns {string} Unique identifier
 */
export const uuid = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
