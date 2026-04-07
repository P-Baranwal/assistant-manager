import { STORAGE_KEYS } from './constants.js';
import { runMigrations } from './migrations.js';
import { normalizeProfile, normalizeAssignment } from './model.js';
import { uuid } from './utils/id.js';

// Internal fallback polyfill for localStorage
if (!window.storagePolyfill) {
    window.storagePolyfill = {
        async get(key) { 
            const v = localStorage.getItem(key); 
            return v ? JSON.parse(v) : null; 
        },
        async set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
        async delete(key) { localStorage.removeItem(key); }
    };
}

// Impure Storage Adapter
export const adapter = {
    get: async (key) => await window.storagePolyfill.get(key),
    set: async (key, val) => await window.storagePolyfill.set(key, val),
    delete: async (key) => await window.storagePolyfill.delete(key)
};

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
    
    async getIndex() { 
        return (await adapter.get(STORAGE_KEYS.INDEX_ASSIGNMENTS)) || []; 
    },
    async getAssignment(id) { 
        const a = await adapter.get(`assignments:${id}`); 
        return a ? normalizeAssignment(a) : null;
    },
    async saveAssignment(task) {
        const normTask = normalizeAssignment(task); // Ensure valid state on save
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
    }
};
