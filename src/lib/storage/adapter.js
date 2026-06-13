/**
 * StorageAdapter defines the interface for storage access.
 * Since this is a JavaScript codebase, it serves as a base class that throws errors for unimplemented methods.
 */
export class StorageAdapter {
    /**
     * Retrieves a value by key.
     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        throw new Error("Method 'get(key)' must be implemented.");
    }

    /**
     * Sets/updates a value for a key.
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
        throw new Error("Method 'set(key, value)' must be implemented.");
    }

    /**
     * Deletes a key from storage.
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
        throw new Error("Method 'delete(key)' must be implemented.");
    }

    /**
     * Returns all keys and values in this storage.
     * @returns {Promise<Record<string, any>>}
     */
    async getAll() {
        throw new Error("Method 'getAll()' must be implemented.");
    }
}
