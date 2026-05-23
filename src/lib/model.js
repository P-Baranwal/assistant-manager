import { TYPES, STATUS, PRESETS, PROVIDER_NAMES, DIFFICULTY, PRIORITY, ENTITY_TYPES, TIERS, IMPACT } from './constants.js';

export function normalizeProfile(p) {
    if (!p) p = {};
    return {
        skills: p.skills || "",
        priorityPreset: PRESETS.includes(p.priorityPreset) ? p.priorityPreset : "Balanced",
        customPriorityRule: p.customPriorityRule || "",
        provider: PROVIDER_NAMES.includes(p.provider) ? p.provider : "ollama",
        ollamaUrl: p.ollamaUrl || "http://localhost:11434",
        ollamaModel: p.ollamaModel || "qwen2.5-coder:7b",
        apiKey: p.apiKey || "",
        tier: TIERS.includes(p.tier) ? p.tier : 'student',
        defaultProjectId: p.defaultProjectId || null
    };
}

export function normalizeAssignment(a) {
    if (!a) a = {};
    return {
        id: a.id || null, // Will be enforced by storage if missing, but should be present.
        entityType: 'assignment',
        title: a.title || "Untitled",
        type: TYPES.includes(a.type) ? a.type : "Other",
        deadline: a.deadline || null, // YYYY-MM-DD
        status: STATUS.includes(a.status) ? a.status : "active",
        createdAt: a.createdAt || new Date().toISOString(),
        updatedAt: a.updatedAt || new Date().toISOString(),
        analyzedAt: a.analyzedAt || new Date().toISOString(),
        
        // AI fields
        difficulty: Math.max(DIFFICULTY.MIN, Math.min(DIFFICULTY.MAX, parseInt(a.difficulty) || 5)),
        difficultyReasoning: a.difficultyReasoning || "",
        estimatedHours: Math.max(0, parseFloat(a.estimatedHours) || 1),
        estimatedHoursReasoning: a.estimatedHoursReasoning || a.timeReasoning || "",
        priorityScore: Math.max(PRIORITY.MIN, Math.min(PRIORITY.MAX, parseInt(a.priorityScore) || 50)),
        priorityReasoning: a.priorityReasoning || "",
        
        // Boost object
        boost: normalizeBoost(a.boost),
        
        // Checklist
        checklist: Array.isArray(a.checklist) ? a.checklist.map(normalizeChecklistItem) : [],
        rawContent: a.rawContent || ""
    };
}

function normalizeBoost(b) {
    if (!b) return { active: false, reason: null, boostedPriorityScore: null };
    return {
        active: !!b.active,
        reason: b.reason || null,
        boostedPriorityScore: b.boostedPriorityScore !== undefined && b.boostedPriorityScore !== null ? parseInt(b.boostedPriorityScore) : null
    };
}

function normalizeChecklistItem(c) {
    return {
        id: c.id,
        text: typeof c === 'string' ? c : (c.text || ""),
        done: !!c.done
    };
}

export function normalizeTask(t) {
    if (!t) t = {};
    const base = {
        id: t.id || null,
        entityType: 'task',
        title: t.title || "Untitled",
        description: t.description || "",
        status: STATUS.includes(t.status) ? t.status : "active",
        priorityReasoning: t.priorityReasoning || "",
        boost: normalizeBoost(t.boost),
        deadline: t.deadline || null,
        createdAt: t.createdAt || new Date().toISOString(),
        updatedAt: t.updatedAt || new Date().toISOString(),

        // Pro fields — safe defaults mean existing student tasks are unaffected
        projectId: t.projectId || null,
        actualHours: Math.max(0, parseFloat(t.actualHours) || 0),
        estimatedHours: Math.max(0, parseFloat(t.estimatedHours) || 1),
        impactScore: t.impactScore
            ? Math.max(IMPACT.MIN, Math.min(IMPACT.MAX, parseInt(t.impactScore)))
            : null,
        blockerNote: t.blockerNote || null
    };

    // Calculate priority dynamically for pro tasks using ROI metric
    if (base.impactScore !== null) {
        const hoursFloor = Math.max(base.estimatedHours, 0.5);
        base.priorityScore = Math.min(PRIORITY.MAX, Math.max(PRIORITY.MIN, Math.round((base.impactScore / hoursFloor) * 10)));
        base.priorityReasoning = `ROI Priority: ${base.impactScore} impact vs ${base.estimatedHours}h estimated effort.`;
    } else {
        base.priorityScore = Math.max(PRIORITY.MIN, Math.min(PRIORITY.MAX, parseInt(t.priorityScore) || 50));
    }

    return base;
}

export function normalizeProject(p) {
    if (!p) p = {};
    return {
        id: p.id || null,
        entityType: 'project',
        title: p.title || 'Untitled Project',
        clientContext: p.clientContext || '',
        status: ['active', 'done'].includes(p.status) ? p.status : 'active',
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString()
    };
}
