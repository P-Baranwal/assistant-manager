import { STORAGE_KEYS } from './constants.js';
import { runMigrations } from './migrations.js';
import { normalizeProfile, normalizeAssignment, normalizeTask, normalizeProject } from './model.js';
import { uuid } from './utils/id.js';
import { LocalAdapter } from './storage/local.adapter.js';
import { authStore, isOnline } from './stores.js';
import { enqueueMutation, processQueue } from './offlineQueue.js';
import { LOCAL_ONLY } from './runtime.js';

const localAdapter = new LocalAdapter();
let supabaseAdapter = null;
let cloudAdapterPromise = null;

async function getCloudAdapter() {
    if (LOCAL_ONLY) throw new Error('Cloud storage is disabled in local-only mode.');
    if (!cloudAdapterPromise) {
        cloudAdapterPromise = import('./storage/supabase.adapter.js').then(({ SupabaseAdapter }) => {
            supabaseAdapter = new SupabaseAdapter();
            return supabaseAdapter;
        });
    }
    return cloudAdapterPromise;
}

let activeAdapter = localAdapter;
let offlineQueueProcessing = false;

// Cloud mode is opt-in. Local-only mode never swaps adapters in response to
// auth state and therefore never initializes the Supabase adapter.
if (!LOCAL_ONLY) {
    authStore.subscribe(async state => {
        if (state?.user) {
            activeAdapter = await getCloudAdapter();
        } else {
            activeAdapter = localAdapter;
        }
    });
}

// Process offline queue when coming back online
if (!LOCAL_ONLY) isOnline.subscribe(async (online) => {
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
            if (!LOCAL_ONLY && activeAdapter === supabaseAdapter && typeof navigator !== 'undefined' && !navigator.onLine && (prop === 'set' || prop === 'delete')) {
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
        return this.getIndexFor(STORAGE_KEYS.INDEX_ASSIGNMENTS);
    },
    async getAssignment(id) { 
        const a = await adapter.get(`assignments:${id}`); 
        return a ? normalizeAssignment(a) : null;
    },
    async saveAssignment(task) {
        const normTask = normalizeAssignment({ ...task, id: task?.id || uuid() });
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
        return this.getIndexFor(STORAGE_KEYS.INDEX_TASKS);
    },
    async getTask(id) {
        const t = await adapter.get(`tasks:${id}`);
        return t ? normalizeTask(t) : null;
    },
    async saveTask(task) {
        const normTask = normalizeTask({ ...task, id: task?.id || uuid() });
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
        return this.getIndexFor(STORAGE_KEYS.INDEX_PROJECTS);
    },
    async getProject(id) {
        const p = await adapter.get(`projects:${id}`);
        return p ? normalizeProject(p) : null;
    },
    async saveProject(project) {
        const norm = normalizeProject({ ...project, id: project?.id || uuid() });
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
            _exportVersion: 2,
            _exportedAt: new Date().toISOString(),
            profile: normalizeProfile(await adapter.get(STORAGE_KEYS.PROFILE)),
            theme: await adapter.get('theme'),
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
        if (!data || !Number.isFinite(Number(data._exportVersion)) || Number(data._exportVersion) < 1) {
            throw new Error('Invalid export file: missing version marker.');
        }

        const collections = [
            { indexKey: STORAGE_KEYS.INDEX_ASSIGNMENTS, indexName: 'assignmentIndex', dataName: 'assignments', prefix: 'assignments:', normalize: normalizeAssignment },
            { indexKey: STORAGE_KEYS.INDEX_TASKS, indexName: 'taskIndex', dataName: 'tasks', prefix: 'tasks:', normalize: normalizeTask },
            { indexKey: STORAGE_KEYS.INDEX_PROJECTS, indexName: 'projectIndex', dataName: 'projects', prefix: 'projects:', normalize: normalizeProject }
        ];

        // Restore is a replacement operation. Remove every record referenced by
        // the current indexes before writing repaired indexes and records.
        for (const collection of collections) {
            const oldIndex = await this.getIndexFor(collection.indexKey);
            for (const id of oldIndex) await adapter.delete(`${collection.prefix}${id}`);
            if (LOCAL_ONLY) {
                const allLocalData = await localAdapter.getAll();
                for (const key of Object.keys(allLocalData)) {
                    if (key.startsWith(collection.prefix)) await adapter.delete(key);
                }
            }

            const rawMap = data[collection.dataName];
            const entries = Array.isArray(rawMap)
                ? rawMap.map((value, index) => [value?.id || index, value])
                : Object.entries(rawMap || {});
            const sourceIds = Array.isArray(data[collection.indexName])
                ? data[collection.indexName]
                : entries.map(([id]) => id);
            const recordsBySourceId = new Map(entries.map(([id, value]) => [String(id), value]));
            const restoredIds = [];

            for (const sourceId of sourceIds) {
                const raw = recordsBySourceId.get(String(sourceId));
                if (!raw || typeof raw !== 'object') continue;
                const record = collection.normalize({ ...raw, id: raw.id || sourceId || uuid() });
                const id = record.id || uuid();
                record.id = id;
                await adapter.set(`${collection.prefix}${id}`, record);
                restoredIds.push(id);
            }
            await adapter.set(collection.indexKey, [...new Set(restoredIds)]);
        }

        await adapter.set(STORAGE_KEYS.PROFILE, normalizeProfile(data.profile));
        if (data.theme) await adapter.set('theme', data.theme);
    },

    async getIndexFor(key) {
        const value = await adapter.get(key);
        return Array.isArray(value) ? value : [];
    },

    async migrateLocalToCloud() {
        const cloudAdapter = await getCloudAdapter();
        const localData = await localAdapter.getAll();
        
        let assignmentsMigrated = 0;
        let tasksMigrated = 0;
        let projectsMigrated = 0;

        // Migrate profile
        if (localData['profile']) {
            await cloudAdapter.set('profile', localData['profile']);
        }
        if (localData['theme']) {
            await cloudAdapter.set('theme', localData['theme']);
        }

        // Migrate assignments
        const assignmentsIndex = localData['assignments:index'] || [];
        for (const id of assignmentsIndex) {
            const assignment = localData[`assignments:${id}`];
            if (assignment) {
                await cloudAdapter.set(`assignments:${id}`, assignment);
                assignmentsMigrated++;
            }
        }

        // Migrate tasks
        const tasksIndex = localData['tasks:index'] || [];
        for (const id of tasksIndex) {
            const task = localData[`tasks:${id}`];
            if (task) {
                await cloudAdapter.set(`tasks:${id}`, task);
                tasksMigrated++;
            }
        }

        // Migrate projects
        const projectsIndex = localData['projects:index'] || [];
        for (const id of projectsIndex) {
            const project = localData[`projects:${id}`];
            if (project) {
                await cloudAdapter.set(`projects:${id}`, project);
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
