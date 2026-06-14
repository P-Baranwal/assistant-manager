<script>
    import { view, profile, currentTeam, teamMembers, projects } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { teamService } from '$lib/teams';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';
    import ConfirmModal from '../../components/ConfirmModal.svelte';

    let loading = true;
    let processing = false;
    let errorMsg = '';
    let successMsg = '';

    // Create team state
    let newTeamName = '';

    // Invite state
    let inviteEmail = '';
    let inviteRole = 'member';
    let pendingInvites = [];

    // Edit team skills
    let editingSkills = false;
    let skillsDraft = '';

    let confirmConfig = { show: false, title: '', message: '', onConfirm: null };

    $: myRole = $currentTeam?.memberRole;
    $: isOwner = myRole === 'owner';
    $: isAdmin = myRole === 'owner' || myRole === 'admin';

    onMount();

    async function onMount() {
        loading = true;
        try {
            await loadTeam();
        } catch (err) {
            console.error('Failed to load team:', err);
        }
        loading = false;
    }

    async function loadTeam() {
        const teams = await teamService.getMyTeams();
        if (teams.length > 0) {
            currentTeam.set(teams[0]);
            const members = await teamService.getTeamMembers(teams[0].id);
            teamMembers.set(members);
            pendingInvites = await teamService.getPendingInvites(teams[0].id);
        } else {
            currentTeam.set(null);
            teamMembers.set([]);
            pendingInvites = [];
        }
    }

    async function createTeam() {
        if (!newTeamName.trim()) return;
        processing = true;
        errorMsg = '';
        successMsg = '';
        try {
            await teamService.createTeam(newTeamName.trim());
            newTeamName = '';
            successMsg = 'Team created!';
            await loadTeam();
        } catch (err) {
            errorMsg = err.message;
        }
        processing = false;
    }

    async function sendInvite() {
        if (!inviteEmail.trim() || !$currentTeam) return;
        processing = true;
        errorMsg = '';
        successMsg = '';
        try {
            await teamService.inviteMember($currentTeam.id, inviteEmail.trim(), inviteRole);
            inviteEmail = '';
            pendingInvites = await teamService.getPendingInvites($currentTeam.id);
            successMsg = 'Invitation sent!';
        } catch (err) {
            errorMsg = err.message;
        }
        processing = false;
    }

    async function cancelInvite(inviteId) {
        try {
            await teamService.cancelInvite(inviteId);
            pendingInvites = await teamService.getPendingInvites($currentTeam.id);
        } catch (err) {
            errorMsg = err.message;
        }
    }

    function confirmRemoveMember(member) {
        confirmConfig = {
            show: true,
            title: 'Remove Member',
            message: `Remove ${member.displayName} from the team? Their personal tasks remain, but shared task assignments will be cleared.`,
            onConfirm: async () => {
                confirmConfig.show = false;
                try {
                    await teamService.removeMember($currentTeam.id, member.userId);
                    successMsg = `${member.displayName} removed from the team.`;
                    await loadTeam();
                } catch (err) {
                    errorMsg = err.message;
                }
            }
        };
    }

    function confirmLeaveTeam() {
        confirmConfig = {
            show: true,
            title: 'Leave Team',
            message: 'Are you sure you want to leave this team? You will lose access to shared projects.',
            onConfirm: async () => {
                confirmConfig.show = false;
                try {
                    await teamService.leaveTeam($currentTeam.id);
                    currentTeam.set(null);
                    teamMembers.set([]);
                    successMsg = 'You left the team.';
                } catch (err) {
                    errorMsg = err.message;
                }
            }
        };
    }

    function startEditSkills() {
        skillsDraft = $currentTeam?.teamSkillsProfile || '';
        editingSkills = true;
    }

    async function saveSkills() {
        try {
            await teamService.updateTeamSkills($currentTeam.id, skillsDraft);
            currentTeam.update(t => ({ ...t, teamSkillsProfile: skillsDraft }));
            editingSkills = false;
            successMsg = 'Team skills profile updated.';
        } catch (err) {
            errorMsg = err.message;
        }
    }

    async function changeRole(member, newRole) {
        try {
            await teamService.updateMemberRole($currentTeam.id, member.userId, newRole);
            successMsg = `${member.displayName} is now ${newRole}.`;
            await loadTeam();
        } catch (err) {
            errorMsg = err.message;
        }
    }

    function goBack() {
        view.set('settings');
    }
</script>

<div class="animate-fade">
    <div class="flex justify-between items-center mb-4">
        <button class="btn" on:click={goBack}>← Back to Settings</button>
    </div>

    <h2 class="mb-4">Team Management</h2>

    {#if loading}
        <div class="text-center p-8 text-muted">Loading team data...</div>
    {:else if !$currentTeam}
        <!-- No Team Yet: Create or Join -->
        <div class="card mb-4">
            <div class="card-title mb-4">Create a Team</div>
            <p class="text-sm text-muted mb-3">Create a team to collaborate on shared projects with your teammates.</p>
            <div class="flex gap-2">
                <input type="text" class="input" bind:value={newTeamName} placeholder="Team name (e.g. CS201 Study Group)" style="flex:1">
                <button class="btn btn-primary" on:click={createTeam} disabled={!newTeamName.trim() || processing}>
                    {processing ? 'Creating...' : 'Create Team'}
                </button>
            </div>
        </div>

        {#if errorMsg}
            <div class="text-sm mb-4" style="color:var(--danger)">{errorMsg}</div>
        {/if}
    {:else}
        <!-- Team Info -->
        <div class="card mb-4">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="card-title">{$currentTeam.name}</div>
                    <p class="text-xs text-muted mt-1">{$teamMembers.length} member{$teamMembers.length !== 1 ? 's' : ''} · Your role: <span class="role-badge role-{$currentTeam.memberRole}">{$currentTeam.memberRole}</span></p>
                </div>
                {#if !isOwner}
                    <button class="btn btn-sm" style="color:var(--danger)" on:click={confirmLeaveTeam}>Leave Team</button>
                {/if}
            </div>
        </div>

        <!-- Members -->
        <div class="card mb-4">
            <div class="card-title mb-4">Members</div>
            {#each $teamMembers as member}
                <div class="member-row">
                    <div class="member-info">
                        <span class="assignee-badge">{member.displayName.charAt(0).toUpperCase()}</span>
                        <div>
                            <div class="text-sm" style="font-weight:500">{member.displayName}</div>
                            <div class="text-xs text-muted">{member.userId === $profile?.id ? '(you)' : ''}</div>
                        </div>
                    </div>
                    <div class="member-actions">
                        <span class="role-badge role-{member.role}">{member.role}</span>
                        {#if isOwner && member.userId !== $profile?.id}
                            <select class="input" style="width:auto; padding:0.125rem 0.375rem; font-size:0.75rem"
                                    value={member.role}
                                    on:change={(e) => changeRole(member, e.target.value)}>
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                            </select>
                            <button class="btn btn-sm" style="color:var(--danger); padding:0.125rem 0.5rem; font-size:0.75rem"
                                    on:click={() => confirmRemoveMember(member)}>Remove</button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <!-- Invite Members -->
        {#if isAdmin}
            <div class="card mb-4">
                <div class="card-title mb-3">Invite Members</div>
                <p class="text-xs text-muted mb-3">Invite teammates by email. They'll need to have a Clerify account to accept.</p>
                <div class="flex gap-2 mb-3">
                    <input type="email" class="input" bind:value={inviteEmail} placeholder="teammate@email.com" style="flex:1">
                    <select class="input" bind:value={inviteRole} style="width:auto">
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button class="btn btn-primary" on:click={sendInvite} disabled={!inviteEmail.trim() || processing}>
                        {processing ? 'Sending...' : 'Invite'}
                    </button>
                </div>

                {#if pendingInvites.length > 0}
                    <div class="text-sm" style="font-weight:500; margin-bottom:0.5rem">Pending Invitations</div>
                    {#each pendingInvites as invite}
                        <div class="member-row" style="padding:0.5rem 0">
                            <div class="text-sm">{invite.email} <span class="text-xs text-muted">({invite.role})</span></div>
                            <button class="btn btn-sm" style="color:var(--danger); padding:0.125rem 0.5rem; font-size:0.75rem"
                                    on:click={() => cancelInvite(invite.id)}>Cancel</button>
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}

        <!-- Team Skills Profile -->
        <div class="card mb-4">
            <div class="card-title mb-3">Team Skills Profile</div>
            <p class="text-xs text-muted mb-3">Define your team's collective skills. When AI scores tasks for shared projects, it uses this instead of individual profiles.</p>
            {#if editingSkills}
                <textarea class="textarea" bind:value={skillsDraft}
                          placeholder="e.g., Team is strong in Python and React, weak in backend DevOps and database design..."
                          style="min-height:100px"></textarea>
                <div class="flex gap-2 mt-2">
                    <button class="btn btn-primary btn-sm" on:click={saveSkills}>Save</button>
                    <button class="btn btn-sm" on:click={() => editingSkills = false}>Cancel</button>
                </div>
            {:else}
                <p class="text-sm" style="white-space:pre-wrap">{($currentTeam.teamSkillsProfile || 'No skills profile set.')}</p>
                {#if isAdmin}
                    <button class="btn btn-sm mt-2" on:click={startEditSkills}>Edit Skills Profile</button>
                {/if}
            {/if}
        </div>

        <!-- Shared Projects -->
        <div class="card mb-4">
            <div class="card-title mb-3">Shared Projects</div>
            <p class="text-xs text-muted mb-3">Projects shared with this team appear for all members in the Pro Dashboard.</p>
            {#if $projects.filter(p => p.teamId === $currentTeam?.id).length === 0}
                <p class="text-sm text-muted">No shared projects yet. Share a project from the Pro Dashboard.</p>
            {:else}
                {#each $projects.filter(p => p.teamId === $currentTeam?.id) as proj}
                    <div class="member-row" style="padding:0.5rem 0">
                        <span class="text-sm">{proj.title}</span>
                        {#if isOwner}
                            <button class="btn btn-sm" style="color:var(--danger); padding:0.125rem 0.5rem; font-size:0.75rem"
                                    on:click={async () => { await teamService.unshareProject(proj.id); await storage.saveProject(proj); successMsg = 'Project unshared.'; }}>Unshare</button>
                        {/if}
                    </div>
                {/each}
            {/if}
        </div>

        <!-- Danger Zone (Owner only) -->
        {#if isOwner}
            <div class="card mb-4" style="border-color:var(--danger)">
                <div class="card-title mb-3" style="color:var(--danger)">Danger Zone</div>
                <button class="btn btn-danger btn-sm" on:click={() => {
                    confirmConfig = {
                        show: true,
                        title: 'Delete Team',
                        message: 'This will permanently delete the team and remove all members. Shared projects will become private. This cannot be undone.',
                        onConfirm: async () => {
                            confirmConfig.show = false;
                            try {
                                await teamService.deleteTeam($currentTeam.id);
                                currentTeam.set(null);
                                teamMembers.set([]);
                                successMsg = 'Team deleted.';
                            } catch (err) {
                                errorMsg = err.message;
                            }
                        }
                    };
                }}>Delete Team</button>
            </div>
        {/if}
    {/if}

    {#if successMsg}
        <div class="text-sm mb-4" style="color:var(--success); font-weight:500">{successMsg}</div>
    {/if}
    {#if errorMsg}
        <div class="text-sm mb-4" style="color:var(--danger)">{errorMsg}</div>
    {/if}
</div>

<ConfirmModal bind:show={confirmConfig.show} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .member-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    .member-row:last-child {
        border-bottom: none;
    }
    .member-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .member-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .assignee-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--primary);
        color: white;
        font-size: 0.8125rem;
        font-weight: 600;
        flex-shrink: 0;
    }
    .role-badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .role-owner {
        background: rgba(var(--primary-rgb, 79, 70, 229), 0.15);
        color: var(--primary);
    }
    .role-admin {
        background: rgba(16, 185, 129, 0.15);
        color: var(--success);
    }
    .role-member {
        background: var(--bg-other, #f3f4f6);
        color: var(--text-muted);
    }
    .btn-sm {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
    }
</style>
