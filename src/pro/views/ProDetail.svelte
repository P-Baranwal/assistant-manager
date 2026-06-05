<script>
    import { view, activeDetailId, profile, tasks, projects } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { undoStack } from '$lib/undoStack';
    import Spinner from '../../components/Spinner.svelte';
    import ConfirmModal from '../../components/ConfirmModal.svelte';

    let detail = null;
    let loading = true;
    let processing = false;
    let spinnerText = '';
    let errorMsg = '';
    let confirmConfig = { show: false, title: '', message: '', onConfirm: null };

    $: if ($activeDetailId) {
        loadDetail($activeDetailId.id);
    }

    async function loadDetail(id) {
        loading = true;
        const res = await storage.getTask(id);
        if (res) detail = res;
        loading = false;
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
        // Blocker logic: clearing blocked status clears the note
        if (detail.status !== 'blocked') {
            detail.blockerNote = null;
        }
        await commitUpdate();
    }

    async function handleBlockerChange() {
        // If blocker note is set, auto-set status to blocked
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
                <span class="tag tag-gray">{getProjectName(detail.projectId)}</span>
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

            <hr style="border:0; border-top:1px solid var(--border-color); margin: 1.5rem 0;">

            <!-- Re-assign Project -->
            <div class="form-group">
                <label class="form-label" for="pro-project">Assign to Project</label>
                <select id="pro-project" class="input" value={detail.projectId || ''} on:change={handleProjectReassign}>
                    <option value="">Inbox (No Project)</option>
                    {#each $projects as proj}
                        <option value={proj.id}>{proj.title}</option>
                    {/each}
                </select>
            </div>

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
</style>
