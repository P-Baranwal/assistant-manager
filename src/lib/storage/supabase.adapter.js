import { StorageAdapter } from './adapter.js';
import { supabase } from '../supabase.js';

// Helpers to map between JS camelCase and Postgres snake_case for top-level columns
function camelToSnake(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const n = {};
    for (const k of Object.keys(obj)) {
        const snakeK = k.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        n[snakeK] = obj[k];
    }
    return n;
}

export function snakeToCamel(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const n = {};
    for (const k of Object.keys(obj)) {
        const camelK = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        n[camelK] = obj[k];
    }
    return n;
}

export class SupabaseAdapter extends StorageAdapter {
    async getUserId() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            throw new Error('SupabaseAdapter: No authenticated user session.');
        }
        return user.id;
    }

    async get(key) {
        try {
            // Local-only device ID key
            if (key === 'app:deviceId') {
                return localStorage.getItem('app:deviceId');
            }

            const userId = await this.getUserId();

            if (key === 'theme') {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('theme')
                    .eq('id', userId)
                    .single();
                if (error || !data) return 'system';
                return data.theme || 'system';
            }

            if (key === 'profile') {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();
                if (error) {
                    // Profile might not exist yet; return null to trigger initialization
                    return null;
                }
                const profile = snakeToCamel(data);
                // Decrypt API key via RPC if present
                try {
                    const { data: decryptedKey } = await supabase.rpc('get_api_key');
                    profile.apiKey = decryptedKey || '';
                } catch {
                    profile.apiKey = '';
                }
                // Remove the encrypted blob from the client-side object
                delete profile.apiKeyEncrypted;
                return profile;
            }

            if (key === 'assignments:index') {
                const { data, error } = await supabase
                    .from('assignments')
                    .select('id')
                    .eq('user_id', userId);
                if (error || !data) return [];
                return data.map(item => item.id);
            }

            // Tasks index: include tasks from shared projects (RLS handles access)
            if (key === 'tasks:index') {
                const { data, error } = await supabase
                    .from('tasks')
                    .select('id');
                if (error || !data) return [];
                return data.map(item => item.id);
            }

            // Projects index: include shared projects (RLS handles access)
            if (key === 'projects:index') {
                const { data, error } = await supabase
                    .from('projects')
                    .select('id');
                if (error || !data) return [];
                return data.map(item => item.id);
            }

            if (key.startsWith('assignments:')) {
                const id = key.split(':')[1];
                const { data, error } = await supabase
                    .from('assignments')
                    .select('*')
                    .eq('id', id)
                    .eq('user_id', userId)
                    .single();
                if (error || !data) return null;
                return snakeToCamel(data);
            }

            if (key.startsWith('tasks:')) {
                const id = key.split(':')[1];
                const { data, error } = await supabase
                    .from('tasks')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error || !data) return null;
                return snakeToCamel(data);
            }

            if (key.startsWith('projects:')) {
                const id = key.split(':')[1];
                const { data, error } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error || !data) return null;
                return snakeToCamel(data);
            }

            return null;
        } catch (e) {
            console.error(`SupabaseAdapter get error for key "${key}":`, e);
            return null;
        }
    }

    async set(key, value) {
        try {
            if (key === 'app:deviceId') {
                localStorage.setItem('app:deviceId', value);
                return;
            }

            const userId = await this.getUserId();

            if (key === 'theme') {
                await supabase
                    .from('profiles')
                    .update({ theme: value })
                    .eq('id', userId);
                return;
            }

            if (key === 'profile') {
                const rawProfile = camelToSnake(value);
                rawProfile.id = userId;
                const plainApiKey = rawProfile.api_key || '';
                delete rawProfile.api_key;
                delete rawProfile.api_key_encrypted;
                // Billing fields are managed by Stripe webhooks, not the client
                delete rawProfile.subscription;
                delete rawProfile.subscription_status;
                delete rawProfile.stripe_subscription_id;
                delete rawProfile.stripe_customer_id;
                delete rawProfile.current_period_end;
                const { error } = await supabase
                    .from('profiles')
                    .upsert(rawProfile);
                if (error) throw error;
                if (plainApiKey) {
                    await supabase.rpc('save_api_key', { plain_key: plainApiKey });
                }
                return;
            }

            // Indexes are computed dynamically from relational tables
            if (key === 'assignments:index' || key === 'tasks:index' || key === 'projects:index') {
                return;
            }

            if (key.startsWith('assignments:')) {
                const rawVal = camelToSnake(value);
                rawVal.user_id = userId;
                const { error } = await supabase
                    .from('assignments')
                    .upsert(rawVal);
                if (error) throw error;
                return;
            }

            if (key.startsWith('tasks:')) {
                const rawVal = camelToSnake(value);
                if (!rawVal.user_id) rawVal.user_id = userId;
                const { error } = await supabase
                    .from('tasks')
                    .upsert(rawVal);
                if (error) throw error;
                return;
            }

            if (key.startsWith('projects:')) {
                const rawVal = camelToSnake(value);
                if (!rawVal.user_id) rawVal.user_id = userId;
                const { error } = await supabase
                    .from('projects')
                    .upsert(rawVal);
                if (error) throw error;
                return;
            }
        } catch (e) {
            console.error(`SupabaseAdapter set error for key "${key}":`, e);
            throw e;
        }
    }

    async delete(key) {
        try {
            const userId = await this.getUserId();

            if (key.startsWith('assignments:')) {
                const id = key.split(':')[1];
                const { error } = await supabase
                    .from('assignments')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', userId);
                if (error) throw error;
                return;
            }

            if (key.startsWith('tasks:')) {
                const id = key.split(':')[1];
                const { error } = await supabase
                    .from('tasks')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
                return;
            }

            if (key.startsWith('projects:')) {
                const id = key.split(':')[1];
                const { error } = await supabase
                    .from('projects')
                    .delete()
                    .eq('id', id);
                if (error) throw error;
                return;
            }
        } catch (e) {
            console.error(`SupabaseAdapter delete error for key "${key}":`, e);
            throw e;
        }
    }

    async getAll() {
        try {
            const userId = await this.getUserId();
            const result = {};

            // Fetch profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            if (profile) {
                result['profile'] = snakeToCamel(profile);
                result['theme'] = profile.theme || 'system';
            }

            // Fetch assignments
            const { data: assignments } = await supabase
                .from('assignments')
                .select('*')
                .eq('user_id', userId);
            if (assignments) {
                result['assignments:index'] = assignments.map(a => a.id);
                assignments.forEach(a => {
                    result[`assignments:${a.id}`] = snakeToCamel(a);
                });
            }

            // Fetch tasks (RLS handles access — includes shared project tasks)
            const { data: tasks } = await supabase
                .from('tasks')
                .select('*');
            if (tasks) {
                result['tasks:index'] = tasks.map(t => t.id);
                tasks.forEach(t => {
                    result[`tasks:${t.id}`] = snakeToCamel(t);
                });
            }

            // Fetch projects (RLS handles access — includes shared projects)
            const { data: projects } = await supabase
                .from('projects')
                .select('*');
            if (projects) {
                result['projects:index'] = projects.map(p => p.id);
                projects.forEach(p => {
                    result[`projects:${p.id}`] = snakeToCamel(p);
                });
            }

            result['app:deviceId'] = localStorage.getItem('app:deviceId');

            return result;
        } catch (e) {
            console.error('SupabaseAdapter getAll error:', e);
            return {};
        }
    }
}
