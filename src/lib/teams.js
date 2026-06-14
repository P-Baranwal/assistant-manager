import { supabase } from './supabase.js';
import { uuid } from './utils/id.js';

function getTeamSnake(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const n = {};
    for (const k of Object.keys(obj)) {
        if (k === 'teamSkillsProfile') {
            n.team_skills_profile = obj[k];
        } else {
            n[k] = obj[k];
        }
    }
    return n;
}

function camelTeam(row) {
    if (!row) return row;
    const n = { ...row };
    if (n.team_skills_profile !== undefined) {
        n.teamSkillsProfile = n.team_skills_profile;
        delete n.team_skills_profile;
    }
    return n;
}

export const teamService = {
    async createTeam(name) {
        const { data: { user } } = await supabase.auth.getUser();
        const teamId = uuid();
        const { error } = await supabase.from('teams').insert({
            id: teamId,
            name,
            owner_id: user.id
        });
        if (error) throw error;

        await supabase.from('team_members').insert({
            team_id: teamId,
            user_id: user.id,
            role: 'owner'
        });

        return teamId;
    },

    async getMyTeams() {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('team_members')
            .select('team_id, role, teams(*)')
            .eq('user_id', user.id);
        if (error) throw error;
        return (data || []).map(tm => ({
            ...camelTeam(tm.teams),
            memberRole: tm.role
        }));
    },

    async getTeamById(teamId) {
        const { data, error } = await supabase
            .from('teams')
            .select('*')
            .eq('id', teamId)
            .single();
        if (error) throw error;
        return camelTeam(data);
    },

    async getTeamMembers(teamId) {
        const { data, error } = await supabase
            .from('team_members')
            .select('role, joined_at, user_id, profiles!inner(display_name)')
            .eq('team_id', teamId);
        if (error) throw error;
        return (data || []).map(m => ({
            userId: m.user_id,
            displayName: m.profiles?.display_name || 'Unknown',
            role: m.role,
            joinedAt: m.joined_at
        }));
    },

    async inviteMember(teamId, email, role = 'member') {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('team_invites').upsert({
            team_id: teamId,
            email,
            role,
            invited_by: user.id
        }, { onConflict: 'team_id,email' });
        if (error) throw error;
    },

    async getPendingInvites(teamId) {
        const { data, error } = await supabase
            .from('team_invites')
            .select('*')
            .eq('team_id', teamId)
            .is('accepted_at', null)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getMyPendingInvites() {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('team_invites')
            .select('*, teams!inner(name)')
            .eq('email', user.email)
            .is('accepted_at', null);
        if (error) throw error;
        return (data || []).map(inv => ({
            id: inv.id,
            teamId: inv.team_id,
            teamName: inv.teams?.name || 'Unknown Team',
            role: inv.role,
            createdAt: inv.created_at
        }));
    },

    async acceptInvite(inviteId) {
        const { data: invite, error: fetchErr } = await supabase
            .from('team_invites')
            .select('*')
            .eq('id', inviteId)
            .single();
        if (fetchErr || !invite) throw new Error('Invite not found');

        const { data: { user } } = await supabase.auth.getUser();

        const { error: insertErr } = await supabase.from('team_members').insert({
            team_id: invite.team_id,
            user_id: user.id,
            role: invite.role
        });
        if (insertErr) throw insertErr;

        await supabase
            .from('team_invites')
            .update({ accepted_at: new Date().toISOString() })
            .eq('id', inviteId);

        return invite.team_id;
    },

    async declineInvite(inviteId) {
        await supabase.from('team_invites').delete().eq('id', inviteId);
    },

    async cancelInvite(inviteId) {
        await supabase.from('team_invites').delete().eq('id', inviteId);
    },

    async removeMember(teamId, userId) {
        const { error } = await supabase.from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('user_id', userId);
        if (error) throw error;

        await supabase.from('tasks')
            .update({ assigned_to: null })
            .eq('assigned_to', userId)
            .in('project_id',
                (await supabase.from('projects').select('id').eq('team_id', teamId)).data?.map(p => p.id) || []
            );
    },

    async leaveTeam(teamId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('user_id', user.id);
        if (error) throw error;
    },

    async shareProject(projectId, teamId) {
        const { error } = await supabase.from('projects')
            .update({ team_id: teamId, visibility: 'shared' })
            .eq('id', projectId);
        if (error) throw error;
    },

    async unshareProject(projectId) {
        const { error } = await supabase.from('projects')
            .update({ team_id: null, visibility: 'private' })
            .eq('id', projectId);
        if (error) throw error;
    },

    async assignTask(taskId, userId) {
        const { error } = await supabase.from('tasks')
            .update({ assigned_to: userId })
            .eq('id', taskId);
        if (error) throw error;
    },

    async getComments(taskId) {
        const { data, error } = await supabase
            .from('task_comments')
            .select('*, profiles!inner(display_name)')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return (data || []).map(c => ({
            id: c.id,
            taskId: c.task_id,
            userId: c.user_id,
            parentId: c.parent_id,
            body: c.body,
            authorName: c.profiles?.display_name || 'Unknown',
            createdAt: c.created_at,
            updatedAt: c.updated_at
        }));
    },

    async addComment(taskId, body) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('task_comments').insert({
            task_id: taskId,
            user_id: user.id,
            body
        }).select().single();
        if (error) throw error;
        return data;
    },

    async deleteComment(commentId) {
        const { error } = await supabase.from('task_comments')
            .delete()
            .eq('id', commentId);
        if (error) throw error;
    },

    async getActivity(teamId, limit = 50) {
        const { data, error } = await supabase
            .from('activity_log')
            .select('*, profiles(display_name)')
            .eq('team_id', teamId)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data || []).map(a => ({
            id: a.id,
            teamId: a.team_id,
            userId: a.user_id,
            userName: a.profiles?.display_name || 'Someone',
            action: a.action,
            entityType: a.entity_type,
            entityId: a.entity_id,
            entityTitle: a.entity_title,
            metadata: a.metadata,
            createdAt: a.created_at
        }));
    },

    async getNotifications() {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data || [];
    },

    async markNotificationRead(notifId) {
        await supabase.from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', notifId);
    },

    async markAllNotificationsRead() {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .is('read_at', null);
    },

    async updateTeamSkills(teamId, skills) {
        const { error } = await supabase.from('teams')
            .update(getTeamSnake({ teamSkillsProfile: skills }))
            .eq('id', teamId);
        if (error) throw error;
    },

    async updateMemberRole(teamId, userId, newRole) {
        const { error } = await supabase.from('team_members')
            .update({ role: newRole })
            .eq('team_id', teamId)
            .eq('user_id', userId);
        if (error) throw error;
    },

    async deleteTeam(teamId) {
        const { error } = await supabase.from('teams')
            .delete()
            .eq('id', teamId);
        if (error) throw error;
    }
};
