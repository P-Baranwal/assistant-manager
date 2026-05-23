export const TYPES = ['Essay', 'Coding', 'Math', 'Research', 'Other'];
export const STATUS = ['active', 'done', 'todo', 'in_progress', 'blocked'];
export const PRESETS = ['Deadline-first', 'Difficulty-first', 'Easiest-first', 'Balanced'];
export const PROVIDER_NAMES = ['ollama', 'anthropic', 'openai', 'gemini', 'groq'];

export const ENTITY_TYPES = ['assignment', 'task', 'project'];

export const TIERS = ['student', 'professional'];

export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done'];

export const STORAGE_KEYS = {
    SCHEMA_VERSION: 'app:schemaVersion',
    DEVICE_ID: 'app:deviceId',
    PROFILE: 'profile',
    INDEX_ASSIGNMENTS: 'assignments:index',
    INDEX_TASKS: 'tasks:index',
    INDEX_PROJECTS: 'projects:index'
};

export const DIFFICULTY = {
    MIN: 1,
    MAX: 10
};

export const PRIORITY = {
    MIN: 0,
    MAX: 100
};

export const IMPACT = {
    MIN: 1,
    MAX: 10
};
