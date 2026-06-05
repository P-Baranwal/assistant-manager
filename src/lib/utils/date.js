/**
 * Parses a YYYY-MM-DD date string as local midnight.
 * Avoids the UTC-parsing bug where `new Date("2026-06-05")` becomes
 * Jun 4 in UTC-offset timezones.
 * Falls back to `new Date(dateStr)` for non-YYYY-MM-DD strings.
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseDateLocal(dateStr) {
    if (!dateStr) return new Date(NaN);
    const parts = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
        return new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
    }
    return new Date(dateStr);
}

/**
 * Calculates a friendly text-based urgency description.
 * @param {string} dateStr (YYYY-MM-DD or parseable timezone string)
 * @returns {string|null} Descriptive string like "Overdue" or "Due Today"
 */
export function calculateUrgency(dateStr) {
    if(!dateStr) return null;
    const target = parseDateLocal(dateStr);
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
