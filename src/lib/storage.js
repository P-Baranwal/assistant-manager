import { STORAGE_KEYS } from './constants.js';
import { runMigrations } from './migrations.js';
import { normalizeProfile, normalizeAssignment, normalizeTask, normalizeProject } from './model.js';
import { uuid } from './utils/id.js';
import { LocalAdapter } from './storage/local.adapter.js';
import { SupabaseAdapter } from './storage/supabase.adapter.js';
import { authStore, isOnline } from './stores.js';
import { enqueueMutation, processQueue } from './offlineQueue.js';

const localAdapter = new LocalAdapter();
const supabaseAdapter = new SupabaseAdapter();

let activeAdapter = localAdapter;
let offlineQueueProcessing = false;

// Listen to authState changes to dynamically swap adapters
authStore.subscribe(state => {
    if (state && state.user) {
        activeAdapter = supabaseAdapter;
    } else {
        activeAdapter = localAdapter;
    }
});

// Process offline queue when coming back online
isOnline.subscribe(async (online) => {
    if (online && !offlineQueueProcessing && activeAdapter === supabaseAdapter) {
        offlineQueueProcessing = true;
        try {
            const result = await processQueue(supabaseAdapter);
            if (result.processed > 0) {
                console.log(`Processed ${result.processed} offline mutations`);
            }
        } catch (err) {
            console.error('Failed to process offline queue:', err);
        } finally {
            offlineQueueProcessing = false;
        }
    }
});

// Export a proxy object so existing references to `adapter` route dynamically
// For cloud adapter, queue mutations when offline
export const adapter = new Proxy({}, {
    get(target, prop) {
        return (...args) => {
            // For write operations on cloud adapter when offline, queue instead
            if (activeAdapter === supabaseAdapter && !navigator.onLine && (prop === 'set' || prop === 'delete')) {
                const [key, value] = args;
                return enqueueMutation({ type: prop, key, value });
            }
            return activeAdapter[prop](...args);
        };
    }
});

export const storage = {
    /**
     * Initializes storage, ensuring device UUID and managing schema migrations.
     */
    async init() {
        let deviceId = await adapter.get(STORAGE_KEYS.DEVICE_ID);
        if (!deviceId) {
            deviceId = uuid();
            await adapter.set(STORAGE_KEYS.DEVICE_ID, deviceId);
        }
        await runMigrations(adapter);
    },

    async getProfile() {
        try {
            const p = await adapter.get(STORAGE_KEYS.PROFILE);
            return normalizeProfile(p);
        } catch(e) { 
            console.error("Storage error:", e); 
            return normalizeProfile(null); 
        }
    },
    async setProfile(p) { 
        await adapter.set(STORAGE_KEYS.PROFILE, normalizeProfile(p)); 
    },

    async getTheme() {
        return (await adapter.get('theme')) || 'system';
    },
    async setTheme(themeVal) {
        await adapter.set('theme', themeVal);
    },
    
    // ── Assignment CRUD ──
    async getIndex() { 
        return (await adapter.get(STORAGE_KEYS.INDEX_ASSIGNMENTS)) || []; 
    },
    async getAssignment(id) { 
        const a = await adapter.get(`assignments:${id}`); 
        return a ? normalizeAssignment(a) : null;
    },
    async saveAssignment(task) {
        const normTask = normalizeAssignment(task);
        await adapter.set(`assignments:${normTask.id}`, normTask);
        let idx = await this.getIndex();
        if (!idx.includes(normTask.id)) {
            idx.push(normTask.id);
            await adapter.set(STORAGE_KEYS.INDEX_ASSIGNMENTS, idx);
        }
    },
    async deleteAssignment(id) {
        await adapter.delete(`assignments:${id}`);
        let idx = await this.getIndex();
        idx = idx.filter(x => x !== id);
        await adapter.set(STORAGE_KEYS.INDEX_ASSIGNMENTS, idx);
    },
    
    // ── Task CRUD ──
    async getTaskIndex() {
        return (await adapter.get(STORAGE_KEYS.INDEX_TASKS)) || [];
    },
    async getTask(id) {
        const t = await adapter.get(`tasks:${id}`);
        return t ? normalizeTask(t) : null;
    },
    async saveTask(task) {
        const normTask = normalizeTask(task);
        await adapter.set(`tasks:${normTask.id}`, normTask);
        let idx = await this.getTaskIndex();
        if (!idx.includes(normTask.id)) {
            idx.push(normTask.id);
            await adapter.set(STORAGE_KEYS.INDEX_TASKS, idx);
        }
    },
    async deleteTask(id) {
        await adapter.delete(`tasks:${id}`);
        let idx = await this.getTaskIndex();
        idx = idx.filter(x => x !== id);
        await adapter.set(STORAGE_KEYS.INDEX_TASKS, idx);
    },

    // ── Project CRUD ──
    async getProjectIndex() {
        return (await adapter.get(STORAGE_KEYS.INDEX_PROJECTS)) || [];
    },
    async getProject(id) {
        const p = await adapter.get(`projects:${id}`);
        return p ? normalizeProject(p) : null;
    },
    async saveProject(project) {
        const norm = normalizeProject(project);
        await adapter.set(`projects:${norm.id}`, norm);
        let idx = await this.getProjectIndex();
        if (!idx.includes(norm.id)) {
            idx.push(norm.id);
            await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, idx);
        }
    },
    async deleteProject(id) {
        await adapter.delete(`projects:${id}`);
        let idx = await this.getProjectIndex();
        idx = idx.filter(x => x !== id);
        await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, idx);
    },

    // ── Export / Import ──
    async exportAll() {
        const data = {
            _exportVersion: 1,
            _exportedAt: new Date().toISOString(),
            profile: await adapter.get(STORAGE_KEYS.PROFILE),
            assignments: {},
            tasks: {},
            projects: {},
            assignmentIndex: await this.getIndex(),
            taskIndex: await this.getTaskIndex(),
            projectIndex: await this.getProjectIndex()
        };

        for (const id of data.assignmentIndex) {
            data.assignments[id] = await adapter.get(`assignments:${id}`);
        }
        for (const id of data.taskIndex) {
            data.tasks[id] = await adapter.get(`tasks:${id}`);
        }
        for (const id of data.projectIndex) {
            data.projects[id] = await adapter.get(`projects:${id}`);
        }

        return data;
    },

    async importAll(data) {
        if (!data || !data._exportVersion) {
            throw new Error('Invalid export file: missing version marker.');
        }

        // Import profile
        if (data.profile) {
            await adapter.set(STORAGE_KEYS.PROFILE, normalizeProfile(data.profile));
        }

        // Import assignments
        if (data.assignmentIndex && Array.isArray(data.assignmentIndex)) {
            await adapter.set(STORAGE_KEYS.INDEX_ASSIGNMENTS, data.assignmentIndex);
            for (const id of data.assignmentIndex) {
                if (data.assignments && data.assignments[id]) {
                    await adapter.set(`assignments:${id}`, normalizeAssignment(data.assignments[id]));
                }
            }
        }

        // Import tasks
        if (data.taskIndex && Array.isArray(data.taskIndex)) {
            await adapter.set(STORAGE_KEYS.INDEX_TASKS, data.taskIndex);
            for (const id of data.taskIndex) {
                if (data.tasks && data.tasks[id]) {
                    await adapter.set(`tasks:${id}`, normalizeTask(data.tasks[id]));
                }
            }
        }

        // Import projects
        if (data.projectIndex && Array.isArray(data.projectIndex)) {
            await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, data.projectIndex);
            for (const id of data.projectIndex) {
                if (data.projects && data.projects[id]) {
                    await adapter.set(`projects:${id}`, normalizeProject(data.projects[id]));
                }
            }
        }
    },

    async migrateLocalToCloud() {
        const localData = await localAdapter.getAll();
        
        let assignmentsMigrated = 0;
        let tasksMigrated = 0;
        let projectsMigrated = 0;

        // Migrate profile
        if (localData['profile']) {
            await supabaseAdapter.set('profile', localData['profile']);
        }
        if (localData['theme']) {
            await supabaseAdapter.set('theme', localData['theme']);
        }

        // Migrate assignments
        const assignmentsIndex = localData['assignments:index'] || [];
        for (const id of assignmentsIndex) {
            const assignment = localData[`assignments:${id}`];
            if (assignment) {
                await supabaseAdapter.set(`assignments:${id}`, assignment);
                assignmentsMigrated++;
            }
        }

        // Migrate tasks
        const tasksIndex = localData['tasks:index'] || [];
        for (const id of tasksIndex) {
            const task = localData[`tasks:${id}`];
            if (task) {
                await supabaseAdapter.set(`tasks:${id}`, task);
                tasksMigrated++;
            }
        }

        // Migrate projects
        const projectsIndex = localData['projects:index'] || [];
        for (const id of projectsIndex) {
            const project = localData[`projects:${id}`];
            if (project) {
                await supabaseAdapter.set(`projects:${id}`, project);
                projectsMigrated++;
            }
        }

        // Clear local storage data (except deviceId)
        for (const key of Object.keys(localData)) {
            if (key !== 'app:deviceId') {
                await localAdapter.delete(key);
            }
        }

        return {
            assignmentsCount: assignmentsMigrated,
            tasksCount: tasksMigrated,
            projectsCount: projectsMigrated
        };
    }
};
