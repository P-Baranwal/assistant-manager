import { supabase } from './supabase.js';
import { tasks, projects, teamActivity, notifications } from './stores.js';
import { snakeToCamel } from './storage/supabase.adapter.js';

let channel = null;

function handleTaskChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;

    tasks.update(current => {
        if (eventType === 'DELETE') {
            return current.filter(t => t.id !== oldRow.id);
        }

        const converted = snakeToCamel(newRow);
        const idx = current.findIndex(t => t.id === converted.id);

        if (idx >= 0) {
            const updated = [...current];
            updated[idx] = converted;
            return updated;
        }

        return [...current, converted];
    });
}

function handleProjectChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;

    projects.update(current => {
        if (eventType === 'DELETE') {
            return current.filter(p => p.id !== oldRow.id);
        }

        const converted = snakeToCamel(newRow);
        const idx = current.findIndex(p => p.id === converted.id);

        if (idx >= 0) {
            const updated = [...current];
            updated[idx] = converted;
            return updated;
        }

        return [...current, converted];
    });
}

function handleActivityChange(payload) {
    if (payload.eventType !== 'INSERT') return;

    const row = payload.new;
    teamActivity.update(current => [{
        id: row.id,
        teamId: row.team_id,
        userId: row.user_id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        entityTitle: row.entity_title,
        metadata: row.metadata,
        createdAt: row.created_at
    }, ...current].slice(0, 50));
}

function handleNotificationChange(payload) {
    if (payload.eventType !== 'INSERT') return;

    const row = payload.new;
    notifications.update(current => [row, ...current]);
}

export async function subscribeToTeam(teamId) {
    unsubscribe();

    const userId = (await supabase.auth.getUser()).data.user?.id;

    channel = supabase
        .channel(`team:${teamId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tasks' },
            handleTaskChange
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'projects' },
            handleProjectChange
        )
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `team_id=eq.${teamId}` },
            handleActivityChange
        );

    if (userId) {
        channel.on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            handleNotificationChange
        );
    }

    channel.subscribe();
}

export function unsubscribe() {
    if (channel) {
        supabase.removeChannel(channel);
        channel = null;
    }
}
