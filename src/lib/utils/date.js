/**
 * Calculates a friendly text-based urgency description.
 * @param {string} dateStr (YYYY-MM-DD or parseable timezone string)
 * @returns {string|null} Descriptive string like "Overdue" or "Due Today"
 */
export function calculateUrgency(dateStr) {
    if(!dateStr) return null;
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);
    const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));
    
    if(diffDays < 0) return 'Overdue';
    if(diffDays === 0) return 'Due Today';
    if(diffDays === 1) return 'Due Tomorrow';
    if(diffDays <= 7 && diffDays > 1) return 'This Week';
    return null;
}
