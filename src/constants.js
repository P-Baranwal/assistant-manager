export const TYPES = ['Essay', 'Coding', 'Math', 'Research', 'Other'];
export const STATUS = ['active', 'done'];
export const PRESETS = ['Deadline-first', 'Difficulty-first', 'Easiest-first', 'Balanced'];
export const PROVIDER_NAMES = ['ollama', 'anthropic', 'openai'];

export const STORAGE_KEYS = {
    SCHEMA_VERSION: 'app:schemaVersion',
    DEVICE_ID: 'app:deviceId',
    PROFILE: 'profile',
    INDEX_ASSIGNMENTS: 'assignments:index',
};

export const DIFFICULTY = {
    MIN: 1,
    MAX: 10
};

export const PRIORITY = {
    MIN: 0,
    MAX: 100
};
