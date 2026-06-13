import { STORAGE_KEYS } from './constants.js';
import { normalizeProfile, normalizeAssignment, normalizeTask } from './model.js';

const LATEST_SCHEMA_VERSION = 4;

/**
 * Runs pending schema migrations.
 * @param {Object} adapter - Storage adapter providing get/set operations (can be mocked for tests).
 */
export async function runMigrations(adapter) {
    let currentVersion = await adapter.get(STORAGE_KEYS.SCHEMA_VERSION) || 0;

    if (currentVersion < 1) {
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

    if (currentVersion < 3) {
        let profile = await adapter.get(STORAGE_KEYS.PROFILE) || {};
        if (!profile.tier) {
            profile.tier = 'student';
            await adapter.set(STORAGE_KEYS.PROFILE, profile);
        }

        let tIndex = await adapter.get(STORAGE_KEYS.INDEX_TASKS) || [];
        for (const id of tIndex) {
            let task = await adapter.get(`tasks:${id}`);
            if (task) {
                task = normalizeTask(task);
                await adapter.set(`tasks:${id}`, task);
            }
        }

        const existingIdx = await adapter.get(STORAGE_KEYS.INDEX_PROJECTS);
        if (!existingIdx) {
            await adapter.set(STORAGE_KEYS.INDEX_PROJECTS, []);
        }

        currentVersion = 3;
        await adapter.set(STORAGE_KEYS.SCHEMA_VERSION, currentVersion);
        console.log('[Migrations] Migrated to schema version 3');
    }

    if (currentVersion < 4) {
        let profile = await adapter.get(STORAGE_KEYS.PROFILE) || {};

        if (profile.tier && !profile.mode) {
            profile.mode = profile.tier;
            delete profile.tier;
        }
        if (!profile.mode) profile.mode = 'student';
        if (!profile.subscription) profile.subscription = 'free';

        await adapter.set(STORAGE_KEYS.PROFILE, profile);
        currentVersion = 4;
        await adapter.set(STORAGE_KEYS.SCHEMA_VERSION, currentVersion);
        console.log('[Migrations] Migrated to schema version 4');
    }

    return currentVersion;
}
