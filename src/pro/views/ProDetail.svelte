<script>
    import { view, activeDetailId, profile, tasks, projects, currentTeam, teamMembers } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { undoStack } from '$lib/undoStack';
    import { teamService } from '$lib/teams';
    import Spinner from '../../components/Spinner.svelte';
    import ConfirmModal from '../../components/ConfirmModal.svelte';

    let detail = null;
    let loading = true;
    let processing = false;
    let spinnerText = '';
    let errorMsg = '';
    let confirmConfig = { show: false, title: '', message: '', onConfirm: null };

    // Comments
    let comments = [];
    let commentsLoading = false;
    let newComment = '';

    $: if ($activeDetailId) {
        loadDetail($activeDetailId.id);
    }

    $: isSharedProject = detail?.projectId && $projects.find(p => p.id === detail.projectId)?.visibility === 'shared';
    $: hasTeam = !!$currentTeam;

    async function loadDetail(id) {
        loading = true;
        const res = await storage.getTask(id);
        if (res) {
            detail = res;
            if (isSharedProject || hasTeam) {
                await loadComments();
            }
        }
        loading = false;
    }

    async function loadComments() {
        if (!detail) return;
        commentsLoading = true;
        try {
            comments = await teamService.getComments(detail.id);
        } catch (err) {
            console.warn('Failed to load comments:', err);
        }
        commentsLoading = false;
    }

    async function submitComment() {
        if (!newComment.trim() || !detail) return;
        try {
            await teamService.addComment(detail.id, newComment.trim());
            newComment = '';
            await loadComments();
        } catch (err) {
            errorMsg = err.message;
        }
    }

    async function deleteComment(commentId) {
        try {
            await teamService.deleteComment(commentId);
            comments = comments.filter(c => c.id !== commentId);
        } catch (err) {
            errorMsg = err.message;
        }
    }

    async function assignTask(userId) {
        if (!detail) return;
        try {
            await teamService.assignTask(detail.id, userId || null);
            detail.assignedTo = userId || null;
        } catch (err) {
            errorMsg = err.message;
        }
    }

    function getProjectName(projectId) {
        if (!projectId) return 'Inbox (No Project)';
        const p = $projects.find(pr => pr.id === projectId);
        return p ? p.title : 'Unknown Project';
    }

    function getVariance() {
        if (!detail.estimatedHours || !detail.actualHours) return null;
        const diff = detail.actualHours - detail.estimatedHours;
        if (diff === 0) return { text: 'On track', color: 'var(--success)' };
        if (diff > 0) return { text: `${diff.toFixed(1)}h over estimate`, color: 'var(--danger)' };
        return { text: `${Math.abs(diff).toFixed(1)}h under estimate`, color: 'var(--success)' };
    }

    function getProgress() {
        if (!detail.estimatedHours) return 0;
        return Math.min(100, (detail.actualHours / detail.estimatedHours) * 100);
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    async function commitUpdate() {
        if (!detail) return;
        detail.updatedAt = new Date().toISOString();
        await storage.saveTask(detail);
        await refreshTasks();
    }

    async function refreshTasks() {
        const tIndex = await storage.getTaskIndex();
        const tPromises = tIndex.map(id => storage.getTask(id));
        const allTasks = (await Promise.all(tPromises)).filter(Boolean);
        tasks.set(allTasks);
    }

    async function handleStatusChange() {
        if (detail.status !== 'blocked') {
            detail.blockerNote = null;
        }
        await commitUpdate();
    }

    async function handleBlockerChange() {
        if (detail.blockerNote && detail.blockerNote.trim()) {
            detail.status = 'blocked';
        } else {
            detail.blockerNote = null;
            if (detail.status === 'blocked') {
                detail.status = 'todo';
            }
        }
        await commitUpdate();
    }

    async function handleFieldSave() {
        await commitUpdate();
    }

    async function handleProjectReassign(e) {
        detail.projectId = e.target.value || null;
        await commitUpdate();
    }

    function markDone() {
        confirmConfig = {
            show: true,
            title: "Mark Done",
            message: "Are you sure you want to mark this task complete?",
            onConfirm: async () => {
                const snapshot = JSON.parse(JSON.stringify(detail));
                detail.status = 'done';
                detail.blockerNote = null;
                await commitUpdate();
                view.set('dashboard');
                confirmConfig.show = false;

                undoStack.push(`Marked "${snapshot.title}" done`, async () => {
                    await storage.saveTask(snapshot);
                    await refreshTasks();
                });
            }
        };
    }

    function deleteItem() {
        confirmConfig = {
            show: true,
            title: "Delete Task",
            message: "This action can be undone for a few seconds after.",
            onConfirm: async () => {
                const snapshot = JSON.parse(JSON.stringify(detail));
                await storage.deleteTask(detail.id);
                await refreshTasks();
                view.set('dashboard');
                confirmConfig.show = false;

                undoStack.push(`Deleted "${snapshot.title}"`, async () => {
                    await storage.saveTask(snapshot);
                    await refreshTasks();
                });
            }
        };
    }
</script>

{#if loading || !detail}
    <div class="text-center p-8 text-muted">Loading detail...</div>
{:else}
    <div class="animate-fade">
        <div class="flex justify-between items-center mb-4">
            <button class="btn" on:click={() => view.set('dashboard')}>← Back</button>
            <div class="flex gap-2">
                {#if detail.status !== 'done'}
                    <button class="btn btn-primary" on:click={markDone}>Mark Done</button>
                {/if}
                <button class="btn btn-danger" on:click={deleteItem}>Delete</button>
            </div>
        </div>

        <div class="card">
            <!-- Title & Project -->
            <div class="flex justify-between items-start">
                <h2 style="margin:0">{detail.title}</h2>
                <div class="flex gap-2 items-center">
                    {#if isSharedProject}
                        <span class="tag tag-shared">Shared</span>
                    {/if}
                    <span class="tag tag-gray">{getProjectName(detail.projectId)}</span>
                </div>
            </div>

            <!-- Status Selector -->
            <div class="form-group mt-4">
                <label class="form-label" for="pro-status">Status</label>
                <select id="pro-status" class="input" bind:value={detail.status} on:change={handleStatusChange}>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                </select>
            </div>

            <!-- Assigned To (team only) -->
            {#if hasTeam && isSharedProject}
                <div class="form-group">
                    <label class="form-label" for="pro-assignee">Assigned To</label>
                    <select id="pro-assignee" class="input" value={detail.assignedTo || ''} on:change={(e) => assignTask(e.target.value || null)}>
                        <option value="">Unassigned</option>
                        {#each $teamMembers as member}
                            <option value={member.userId}>{member.displayName}</option>
                        {/each}
                    </select>
                </div>
            {/if}

            <!-- Pro Metrics Grid -->
            <div class="detail-meta-grid">
                <!-- Impact Score -->
                <div class="detail-card">
                    <label class="form-label" for="pro-impact">Impact Score</label>
                    <div class="flex items-center gap-2">
                        <input id="pro-impact" type="range" min="1" max="10" bind:value={detail.impactScore} on:change={handleFieldSave}
                               style="flex:1">
                        <span style="font-weight:600; font-size:1.125rem; color:var(--primary)">{detail.impactScore || '—'}</span>
                    </div>
                    <p class="text-xs text-muted mt-1">1 = minor task, 10 = critical path</p>
                </div>

                <!-- Estimated Hours -->
                <div class="detail-card">
                    <label class="form-label" for="pro-est">Estimated Hours</label>
                    <input id="pro-est" type="number" class="input" bind:value={detail.estimatedHours} min="0.25" step="0.25" on:change={handleFieldSave}>
                </div>

                <!-- Actual Hours -->
                <div class="detail-card">
                    <label class="form-label" for="pro-actual">Actual Hours</label>
                    <input id="pro-actual" type="number" class="input" bind:value={detail.actualHours} min="0" step="0.25" on:change={handleFieldSave}>
                    {#if detail.actualHours > 0}
                        <div class="progress-bar mt-2">
                            <div class="progress-fill" style="width:{getProgress()}%; background:{getProgress() > 100 ? 'var(--danger)' : 'var(--primary)'}"></div>
                        </div>
                        {#if getVariance()}
                            <p class="text-xs mt-1" style="color:{getVariance().color}">{getVariance().text}</p>
                        {/if}
                    {/if}
                </div>

                <!-- Priority (computed) -->
                <div class="detail-card">
                    <strong>Priority Score</strong>
                    <p style="font-size:1.25rem; font-weight:600; color:var(--primary); margin-top:0.25rem">{detail.priorityScore}</p>
                    <p class="text-xs text-muted">{detail.priorityReasoning}</p>
                </div>
            </div>

            <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">

            <!-- Blocker Note -->
            <div class="form-group">
                <label class="form-label" for="pro-blocker">Blocker Note</label>
                <textarea id="pro-blocker" class="textarea" bind:value={detail.blockerNote} on:blur={handleBlockerChange}
                          placeholder="Describe what's blocking this task... (sets status to Blocked)"
                          style="min-height:80px"></textarea>
                {#if detail.status === 'blocked'}
                    <p class="text-xs mt-1" style="color:var(--danger)">🚫 This task is blocked. Clear the note to unblock.</p>
                {/if}
            </div>

            <!-- Description -->
            {#if detail.description}
                <div class="form-group">
                    <label class="form-label">Description</label>
                    <p class="text-sm" style="white-space: pre-wrap;">{detail.description}</p>
                </div>
            {/if}

            <!-- Accuracy Feedback (completed tasks only) -->
            {#if detail.status === 'done' && detail.estimatedHours > 0 && detail.actualHours > 0}
                {@const variance = ((detail.actualHours - detail.estimatedHours) / detail.estimatedHours * 100)}
                <div class="accuracy-feedback mt-4">
                    <h3 style="font-size: 1rem; margin-bottom: 0.5rem;">Time Accuracy</h3>
                    <div class="accuracy-comparison">
                        <div class="accuracy-stat">
                            <span class="accuracy-label">Estimated</span>
                            <span class="accuracy-value">{detail.estimatedHours}h</span>
                        </div>
                        <div class="accuracy-arrow">→</div>
                        <div class="accuracy-stat">
                            <span class="accuracy-label">Actual</span>
                            <span class="accuracy-value">{detail.actualHours}h</span>
                        </div>
                        <div class="accuracy-stat">
                            <span class="accuracy-label">Variance</span>
                            <span class="accuracy-value" style="color: {variance > 10 ? 'var(--danger)' : variance < -10 ? 'var(--success)' : 'var(--text-muted)'}">
                                {variance > 0 ? '+' : ''}{variance.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <p class="text-xs text-muted mt-2">You estimated {detail.estimatedHours}h, took {detail.actualHours}h ({variance > 0 ? '+' : ''}{variance.toFixed(0)}%)</p>
                </div>
            {/if}

            <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">

            <!-- Re-assign Project -->
            <div class="form-group">
                <label class="form-label" for="pro-project">Assign to Project</label>
                <select id="pro-project" class="input" value={detail.projectId || ''} on:change={handleProjectReassign}>
                    <option value="">Inbox (No Project)</option>
                    {#each $projects as proj}
                        <option value={proj.id}>{proj.title}{proj.visibility === 'shared' ? ' (Shared)' : ''}</option>
                    {/each}
                </select>
            </div>

            <!-- Comments Section -->
            {#if hasTeam}
                <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">

                <div class="comments-section">
                    <h3 style="font-size:1rem; margin-bottom:0.75rem">Comments</h3>

                    {#if commentsLoading}
                        <p class="text-sm text-muted">Loading comments...</p>
                    {:else if comments.length === 0}
                        <p class="text-sm text-muted mb-3">No comments yet.</p>
                    {:else}
                        <div class="comments-list">
                            {#each comments as comment}
                                <div class="comment-item">
                                    <div class="comment-header">
                                        <span class="assignee-badge comment-avatar">{comment.authorName.charAt(0).toUpperCase()}</span>
                                        <div>
                                            <span class="text-sm" style="font-weight:500">{comment.authorName}</span>
                                            <span class="text-xs text-light">{timeAgo(comment.createdAt)}</span>
                                        </div>
                                        {#if comment.userId === $profile?.id}
                                            <button class="btn btn-sm comment-delete" on:click={() => deleteComment(comment.id)} title="Delete comment">✕</button>
                                        {/if}
                                    </div>
                                    <p class="text-sm comment-body">{comment.body}</p>
                                </div>
                            {/each}
                        </div>
                    {/if}

                    <div class="comment-form mt-3">
                        <textarea class="textarea" bind:value={newComment}
                                  placeholder="Add a comment... Use @name to mention"
                                  style="min-height:60px"></textarea>
                        <button class="btn btn-primary btn-sm mt-2" on:click={submitComment} disabled={!newComment.trim()}>Post Comment</button>
                    </div>
                </div>
            {/if}

            {#if errorMsg}
                <div class="text-sm mt-4" style="color: var(--danger); padding: 0.5rem; background: #fee2e2; border-radius:4px;">{errorMsg}</div>
            {/if}
        </div>
    </div>
{/if}

<Spinner bind:show={processing} text={spinnerText} />
<ConfirmModal bind:show={confirmConfig.show} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .progress-bar {
        height: 6px;
        background: var(--border-color);
        border-radius: 3px;
        overflow: hidden;
    }
    .progress-fill {
        height: 100%;
        transition: width 0.3s ease;
    }
    .tag-shared {
        background: rgba(var(--primary-rgb, 79, 70, 229), 0.15);
        color: var(--primary);
        padding: 0.25rem 0.625rem;
        border-radius: 99px;
        font-size: 0.75rem;
        font-weight: 500;
    }
    .assignee-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--primary);
        color: white;
        font-size: 0.625rem;
        font-weight: 600;
        flex-shrink: 0;
    }
    .comments-list {
        max-height: 400px;
        overflow-y: auto;
    }
    .comment-item {
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    .comment-item:last-child {
        border-bottom: none;
    }
    .comment-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.375rem;
    }
    .comment-avatar {
        width: 28px;
        height: 28px;
        font-size: 0.75rem;
    }
    .comment-body {
        white-space: pre-wrap;
        margin-left: 2.25rem;
        color: var(--text-main);
    }
    .comment-delete {
        margin-left: auto;
        padding: 0.125rem 0.375rem;
        font-size: 0.75rem;
        color: var(--text-light);
        background: none;
        border: none;
        cursor: pointer;
    }
    .comment-delete:hover {
        color: var(--danger);
    }
    .btn-sm {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
    }
</style>
