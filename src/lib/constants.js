export const TYPES = ['Essay', 'Coding', 'Math', 'Research', 'Other'];
export const STATUS = ['active', 'done', 'todo', 'in_progress', 'blocked'];
export const PRESETS = ['Deadline-first', 'Difficulty-first', 'Easiest-first', 'Balanced'];
export const PROVIDER_NAMES = ['ollama', 'anthropic', 'openai', 'gemini', 'groq'];

export const ENTITY_TYPES = ['assignment', 'task', 'project'];

export const TIERS = ['student', 'professional'];

export const SUBSCRIPTION_TIERS = ['free', 'student', 'pro', 'team'];

export const SUBSCRIPTION_LIMITS = {
    free:    { maxItems: 50,  aiMonthlyLimit: 10,  modes: ['student'], wbsGenerator: false, aiProxy: false },
    student: { maxItems: -1,  aiMonthlyLimit: 100, modes: ['student'], wbsGenerator: false, aiProxy: true  },
    pro:     { maxItems: -1,  aiMonthlyLimit: -1,  modes: ['student', 'professional'], wbsGenerator: true,  aiProxy: true  },
    team:    { maxItems: -1,  aiMonthlyLimit: -1,  modes: ['student', 'professional'], wbsGenerator: true,  aiProxy: true  },
};

export const SUBSCRIPTION_LABELS = {
    free:    'Free',
    student: 'Student ($2/mo)',
    pro:     'Pro ($5/mo)',
    team:    'Team ($10/seat/mo)',
};

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
