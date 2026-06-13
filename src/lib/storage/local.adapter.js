import { StorageAdapter } from './adapter.js';

/**
 * LocalAdapter implements StorageAdapter using localStorage.
 */
export class LocalAdapter extends StorageAdapter {
    /**
     * Retrieves and parses a JSON value from localStorage by key.
     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        const v = localStorage.getItem(key);
        if (v === null || v === undefined) {
            return null;
        }
        try {
            return JSON.parse(v);
        } catch (e) {
            console.warn(`LocalAdapter: Failed to parse JSON for key "${key}", returning raw value.`, e);
            return v;
        }
    }

    /**
     * Serializes and stores a value in localStorage.
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    /**
     * Removes a key from localStorage.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
        localStorage.removeItem(key);
    }

    /**
     * Returns all keys and values in localStorage.
     * @returns {Promise<Record<string, any>>}
     */
    async getAll() {
        const result = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                result[key] = await this.get(key);
            }
        }
        return result;
    }
}
