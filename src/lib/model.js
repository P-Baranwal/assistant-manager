import { TYPES, STATUS, PRESETS, DIFFICULTY, PRIORITY, TIERS, IMPACT, SUBSCRIPTION_TIERS } from './constants.js';
import { LOCAL_ONLY } from './runtime.js';
import { uuid } from './utils/id.js';

function stringOr(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberOr(value, fallback, min = -Infinity, max = Infinity) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function integerOr(value, fallback, min = -Infinity, max = Infinity) {
    return Math.round(numberOr(value, fallback, min, max));
}

export function normalizeProfile(p) {
    if (!p) p = {};
    return {
        skills: stringOr(p.skills, ""),
        priorityPreset: PRESETS.includes(p.priorityPreset) ? p.priorityPreset : "Balanced",
        customPriorityRule: stringOr(p.customPriorityRule, ""),
        apiKey: stringOr(p.apiKey, ""),
        mode: TIERS.includes(p.mode) ? p.mode : (p.tier === 'professional' ? 'professional' : 'student'),
        subscription: SUBSCRIPTION_TIERS.includes(p.subscription) ? p.subscription : 'free',
        defaultProjectId: p.defaultProjectId || null,
        useProxy: LOCAL_ONLY ? false : !!p.useProxy,
        teamId: p.teamId || null,
        availableHoursPerDay: integerOr(p.availableHoursPerDay, 6, 1, 16),
        weeklyDigestOptIn: p.weeklyDigestOptIn !== undefined ? !!p.weeklyDigestOptIn : true,
        calendarFeedToken: p.calendarFeedToken || null
    };
}

export function normalizeAssignment(a) {
    if (!a) a = {};
    return {
        id: a.id || null, // Storage assigns an ID when this is a new record.
        entityType: 'assignment',
        title: stringOr(a.title, "Untitled"),
        type: TYPES.includes(a.type) ? a.type : "Other",
        deadline: typeof a.deadline === 'string' && a.deadline.trim() ? a.deadline.trim() : null, // YYYY-MM-DD
        status: STATUS.includes(a.status) ? a.status : "active",
        createdAt: a.createdAt || new Date().toISOString(),
        updatedAt: a.updatedAt || new Date().toISOString(),
        analyzedAt: a.analyzedAt || new Date().toISOString(),
        
        // AI fields
        difficulty: integerOr(a.difficulty, 5, DIFFICULTY.MIN, DIFFICULTY.MAX),
        difficultyReasoning: stringOr(a.difficultyReasoning, ""),
        estimatedHours: numberOr(a.estimatedHours, 1, 0),
        estimatedHoursReasoning: stringOr(a.estimatedHoursReasoning, stringOr(a.timeReasoning, "")),
        priorityScore: integerOr(a.priorityScore, 50, PRIORITY.MIN, PRIORITY.MAX),
        priorityReasoning: stringOr(a.priorityReasoning, ""),
        
        // Boost object
        boost: normalizeBoost(a.boost),
        
        // Checklist
        checklist: Array.isArray(a.checklist) ? a.checklist.map(normalizeChecklistItem) : [],
        rawContent: stringOr(a.rawContent, "")
    };
}

function normalizeBoost(b) {
    if (!b) return { active: false, reason: null, boostedPriorityScore: null };
    return {
        active: !!b.active,
        reason: b.reason || null,
        boostedPriorityScore: b.boostedPriorityScore !== undefined && b.boostedPriorityScore !== null
            ? integerOr(b.boostedPriorityScore, 0, PRIORITY.MIN, PRIORITY.MAX)
            : null
    };
}

function normalizeChecklistItem(c) {
    const isString = typeof c === 'string';
    return {
        id: isString ? uuid() : (c?.id || uuid()),
        text: stringOr(isString ? c : c?.text, ""),
        done: isString ? false : !!c?.done
    };
}

export function normalizeTask(t) {
    if (!t) t = {};
    const base = {
        id: t.id || null,
        entityType: 'task',
        title: stringOr(t.title, "Untitled"),
        description: stringOr(t.description, ""),
        status: STATUS.includes(t.status) ? t.status : "active",
        priorityReasoning: stringOr(t.priorityReasoning, ""),
        boost: normalizeBoost(t.boost),
        deadline: t.deadline || null,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),

        // Pro fields — safe defaults mean existing student tasks are unaffected
        projectId: t.projectId || null,
        actualHours: numberOr(t.actualHours, 0, 0),
        estimatedHours: numberOr(t.estimatedHours, 1, 0),
        impactScore: t.impactScore !== undefined && t.impactScore !== null && t.impactScore !== ''
            ? integerOr(t.impactScore, IMPACT.MIN, IMPACT.MIN, IMPACT.MAX)
            : null,
        blockerNote: stringOr(t.blockerNote, null),

        // Collaboration fields
        assignedTo: t.assignedTo || null,
        userId: t.userId || null
    };

    // Calculate priority dynamically for pro tasks using ROI metric
    if (base.impactScore !== null) {
        const hoursFloor = Math.max(base.estimatedHours, 0.5);
        base.priorityScore = Math.min(PRIORITY.MAX, Math.max(PRIORITY.MIN, Math.round((base.impactScore / hoursFloor) * 10)));
        base.priorityReasoning = `ROI Priority: ${base.impactScore} impact vs ${base.estimatedHours}h estimated effort.`;
    } else {
        base.priorityScore = integerOr(t.priorityScore, 50, PRIORITY.MIN, PRIORITY.MAX);
    }

    return base;
}

export function normalizeProject(p) {
    if (!p) p = {};
    return {
        id: p.id || null,
        entityType: 'project',
        title: stringOr(p.title, 'Untitled Project'),
        clientContext: stringOr(p.clientContext, ''),
        status: ['active', 'done'].includes(p.status) ? p.status : 'active',
        teamId: p.teamId || null,
        visibility: ['private', 'shared'].includes(p.visibility) ? p.visibility : 'private',
        userId: p.userId || null,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString()
    };
}
