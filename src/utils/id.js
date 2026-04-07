/**
 * Generates a standard UUID fallback or cryptographically safe UUID.
 * @returns {string} Unique identifier
 */
export const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
