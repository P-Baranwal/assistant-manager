import { STORAGE_KEYS } from './constants.js';
import { normalizeProfile, normalizeAssignment } from './model.js';

const LATEST_SCHEMA_VERSION = 1; // Increment this when introducing breaking migrations

/**
 * Runs pending schema migrations.
 * @param {Object} adapter - Storage adapter providing get/set operations (can be mocked for tests).
 */
export async function runMigrations(adapter) {
    let currentVersion = await adapter.get(STORAGE_KEYS.SCHEMA_VERSION) || 0;

    if (currentVersion < 1) {
        // Example Migration to v1: 
        // Migrate assignments (ensure they exist and normalize schema bounds like boost and status)
        let index = await adapter.get(STORAGE_KEYS.INDEX_ASSIGNMENTS) || [];
        for (const id of index) {
            let task = await adapter.get(`assignments:${id}`);
            if (task) {
                // normalizeAssignment guarantees the strict shape
                task = normalizeAssignment(task);
                await adapter.set(`assignments:${id}`, task);
            }
        }
        
        let profile = await adapter.get(STORAGE_KEYS.PROFILE) || {};
        profile = normalizeProfile(profile);
        await adapter.set(STORAGE_KEYS.PROFILE, profile);
        
        currentVersion = 1;
        await adapter.set(STORAGE_KEYS.SCHEMA_VERSION, currentVersion);
        console.log(`[Migrations] Migrated to schema version ${currentVersion}`);
    }

    // Future version migrations can follow:
    // if (currentVersion < 2) { ... currentVersion = 2; ... }

    return currentVersion;
}
