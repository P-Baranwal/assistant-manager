import { TYPES, STATUS, PRESETS, PROVIDER_NAMES, DIFFICULTY, PRIORITY } from './constants.js';

export function normalizeProfile(p) {
    if (!p) p = {};
    return {
        skills: p.skills || "",
        priorityPreset: PRESETS.includes(p.priorityPreset) ? p.priorityPreset : "Balanced",
        customPriorityRule: p.customPriorityRule || "",
        provider: PROVIDER_NAMES.includes(p.provider) ? p.provider : "ollama",
        ollamaUrl: p.ollamaUrl || "http://localhost:11434",
        ollamaModel: p.ollamaModel || "qwen2.5:14b",
        apiKey: p.apiKey || ""
    };
}

export function normalizeAssignment(a) {
    if (!a) a = {};
    return {
        id: a.id || null, // Will be enforced by storage if missing, but should be present.
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
        timeReasoning: a.timeReasoning || "",
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
