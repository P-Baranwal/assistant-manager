import { STORAGE_KEYS } from './constants.js';
import { normalizeProfile, normalizeAssignment } from './model.js';

const LATEST_SCHEMA_VERSION = 2; // Increment this when introducing breaking migrations

/**
 * Runs pending schema migrations.
 * @param {Object} adapter - Storage adapter providing get/set operations (can be mocked for tests).
 */
export async function runMigrations(adapter) {
    let currentVersion = await adapter.get(STORAGE_KEYS.SCHEMA_VERSION) || 0;

    if (currentVersion < 1) {
        // v1: Normalize schema bounds
        let index = await adapter.get(STORAGE_KEYS.INDEX_ASSIGNMENTS) || [];
        for (const id of index) {
            let task = await adapter.get(`assignments:${id}`);
            if (task) {
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

    if (currentVersion < 2) {
        // v2: Introduce `entityType` backfill distinguishing assignments/tasks
        let index = await adapter.get(STORAGE_KEYS.INDEX_ASSIGNMENTS) || [];
        for (const id of index) {
            let task = await adapter.get(`assignments:${id}`);
            if (task) {
                task = normalizeAssignment(task);
                await adapter.set(`assignments:${id}`, task);
            }
        }
        currentVersion = 2;
        await adapter.set(STORAGE_KEYS.SCHEMA_VERSION, currentVersion);
        console.log(`[Migrations] Migrated to schema version ${currentVersion}`);
    }

    return currentVersion;
}
