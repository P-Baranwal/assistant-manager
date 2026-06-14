<script>
    import { tasks, projects, unassignedTasks, highRoiTasks, view, activeDetailId, currentTeam, teamMembers, teamActivity } from '$lib/stores';
    import { storage } from '$lib/storage';
    import { undoStack } from '$lib/undoStack';
    import { teamService } from '$lib/teams';
    import RiskBanner from '../../components/RiskBanner.svelte';
    import NaturalLanguageInput from '../../components/NaturalLanguageInput.svelte';

    let projectFilter = 'all'; // 'all' | 'mine' | 'team'
    let showActivity = false;

    $: filteredProjects = (() => {
        if (projectFilter === 'team') return $projects.filter(p => p.visibility === 'shared');
        if (projectFilter === 'mine') return $projects.filter(p => p.visibility !== 'shared');
        return $projects;
    })();

    $: filteredProjectIds = new Set(filteredProjects.map(p => p.id));
    $: filteredTasks = $tasks.filter(t => {
        if (projectFilter === 'all') return true;
        if (!t.projectId) return projectFilter === 'mine';
        return filteredProjectIds.has(t.projectId);
    });

    $: todoTasks = filteredTasks.filter(t => t.status === 'todo');
    $: inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress');
    $: blockedTasksList = filteredTasks.filter(t => t.status === 'blocked');
    $: doneTasks = filteredTasks.filter(t => t.status === 'done').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 10);

    $: inboxTasks = filteredTasks.filter(t => !t.projectId && t.status !== 'done');
    $: hasTeam = !!$currentTeam;

    let showDone = false;
    let showRoi = true;

    function getProjectName(projectId) {
        if (!projectId) return 'Inbox';
        const p = $projects.find(pr => pr.id === projectId);
        return p ? p.title : 'Unknown';
    }

    function getAssigneeName(userId) {
        if (!userId) return null;
        const member = $teamMembers.find(m => m.userId === userId);
        return member?.displayName || null;
    }

    function getRoi(t) {
        if (!t.impactScore || !t.estimatedHours) return null;
        return (t.impactScore / Math.max(t.estimatedHours, 0.5)).toFixed(1);
    }

    async function changeStatus(task, newStatus) {
        const snapshot = JSON.parse(JSON.stringify(task));
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();

        if (newStatus === 'blocked' && !task.blockerNote) {
            task.blockerNote = 'Blocked';
        } else if (newStatus !== 'blocked') {
            task.blockerNote = null;
        }

        await storage.saveTask(task);
        await refreshTasks();

        if (newStatus === 'done') {
            undoStack.push(`Marked "${snapshot.title}" done`, async () => {
                await storage.saveTask(snapshot);
                await refreshTasks();
            });
        }
    }

    async function refreshTasks() {
        const tIndex = await storage.getTaskIndex();
        const tPromises = tIndex.map(id => storage.getTask(id));
        const allTasks = (await Promise.all(tPromises)).filter(Boolean);
        tasks.set(allTasks);
    }

    function openDetail(task) {
        activeDetailId.set({ id: task.id, type: 'task' });
        view.set('detail');
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
</script>

<div class="animate-fade">
    <RiskBanner />

    <!-- Project Filter + Activity Toggle -->
    <div class="filter-bar mb-4">
        <div class="flex gap-2 items-center">
            <button class="filter-btn" class:active={projectFilter === 'all'} on:click={() => projectFilter = 'all'}>All Projects</button>
            <button class="filter-btn" class:active={projectFilter === 'mine'} on:click={() => projectFilter = 'mine'}>My Projects</button>
            {#if hasTeam}
                <button class="filter-btn" class:active={projectFilter === 'team'} on:click={() => projectFilter = 'team'}>Team Projects</button>
            {/if}
        </div>
        <div class="flex gap-2 items-center">
            <button class="btn btn-ghost btn-sm" on:click={() => view.set('week-plan')} title="AI-generated weekly schedule">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>
                Plan My Week
            </button>
            {#if hasTeam}
                <button class="btn btn-ghost btn-sm" on:click={() => showActivity = !showActivity}>
                    {showActivity ? 'Hide Activity' : 'Activity Feed'}
                </button>
            {/if}
        </div>
    </div>

    <!-- Quick Task Entry -->
    <NaturalLanguageInput />

    <!-- Activity Feed Panel -->
    {#if showActivity && hasTeam}
        <div class="activity-panel mb-4">
            <h3 class="section-title">Recent Activity</h3>
            {#if $teamActivity.length === 0}
                <p class="text-sm text-muted">No recent activity.</p>
            {:else}
                {#each $teamActivity.slice(0, 20) as item}
                    <div class="activity-item">
                        <span class="activity-user">{item.userName}</span>
                        <span class="text-muted">
                            {#if item.action === 'task.created'}created "{item.entityTitle}"
                            {:else if item.action === 'task.moved'}moved "{item.entityTitle}"
                            {:else if item.action === 'task.updated'}updated "{item.entityTitle}"
                            {:else if item.action === 'task.deleted'}deleted "{item.entityTitle}"
                            {:else}{item.action} "{item.entityTitle}"
                            {/if}
                        </span>
                        <span class="text-xs text-light">{timeAgo(item.createdAt)}</span>
                    </div>
                {/each}
            {/if}
        </div>
    {/if}

    <!-- Inbox Section -->
    {#if inboxTasks.length > 0}
        <div class="inbox-section mb-4">
            <h3 class="section-title">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z"/></svg>
                Inbox <span class="text-muted text-sm">({inboxTasks.length} unassigned)</span>
            </h3>
            <div class="inbox-cards">
                {#each inboxTasks as task}
                    <div class="kanban-card" on:click={() => openDetail(task)}>
                        <div class="kanban-card-title">{task.title}</div>
                        <div class="kanban-card-meta">
                            <span class="tag tag-gray">Inbox</span>
                            {#if task.impactScore}
                                <span class="text-xs text-muted">Impact: {task.impactScore}</span>
                            {/if}
                            {#if task.assignedTo && getAssigneeName(task.assignedTo)}
                                <span class="assignee-badge" title={getAssigneeName(task.assignedTo)}>
                                    {getAssigneeName(task.assignedTo).charAt(0).toUpperCase()}
                                </span>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}

    <div class="pro-layout">
        <!-- Kanban Board -->
        <div class="kanban-board">
            <!-- To Do -->
            <div class="kanban-column">
                <div class="kanban-column-header">
                    To Do <span class="kanban-column-count">{todoTasks.length}</span>
                </div>
                {#each todoTasks as task (task.id)}
                    <div class="kanban-card" on:click={() => openDetail(task)}>
                        <div class="kanban-card-title">{task.title}</div>
                        <div class="kanban-card-meta">
                            <span class="tag tag-gray">{getProjectName(task.projectId)}</span>
                            {#if task.estimatedHours}
                                <span class="text-xs text-muted">{task.estimatedHours}h</span>
                            {/if}
                            {#if task.impactScore}
                                <span class="text-xs" style="color:var(--primary)">⚡{task.impactScore}</span>
                            {/if}
                            {#if task.assignedTo && getAssigneeName(task.assignedTo)}
                                <span class="assignee-badge" title={getAssigneeName(task.assignedTo)}>
                                    {getAssigneeName(task.assignedTo).charAt(0).toUpperCase()}
                                </span>
                            {/if}
                        </div>
                        <select class="status-select input" value={task.status}
                                on:click|stopPropagation
                                on:change={(e) => changeStatus(task, e.target.value)}>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                        </select>
                    </div>
                {/each}
                {#if todoTasks.length === 0}
                    <p class="text-sm text-muted" style="text-align:center; padding:1rem;">No tasks</p>
                {/if}
            </div>

            <!-- In Progress -->
            <div class="kanban-column">
                <div class="kanban-column-header">
                    In Progress <span class="kanban-column-count">{inProgressTasks.length}</span>
                </div>
                {#each inProgressTasks as task (task.id)}
                    <div class="kanban-card" style="border-left: 3px solid var(--primary);">
                        <div class="kanban-card-title" on:click={() => openDetail(task)}>{task.title}</div>
                        <div class="kanban-card-meta">
                            <span class="tag tag-gray">{getProjectName(task.projectId)}</span>
                            {#if task.estimatedHours}
                                <span class="text-xs text-muted">{task.estimatedHours}h</span>
                            {/if}
                            {#if task.assignedTo && getAssigneeName(task.assignedTo)}
                                <span class="assignee-badge" title={getAssigneeName(task.assignedTo)}>
                                    {getAssigneeName(task.assignedTo).charAt(0).toUpperCase()}
                                </span>
                            {/if}
                        </div>
                        <select class="status-select input" value={task.status}
                                on:click|stopPropagation
                                on:change={(e) => changeStatus(task, e.target.value)}>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                        </select>
                    </div>
                {/each}
                {#if inProgressTasks.length === 0}
                    <p class="text-sm text-muted" style="text-align:center; padding:1rem;">No tasks</p>
                {/if}
            </div>

            <!-- Blocked -->
            <div class="kanban-column">
                <div class="kanban-column-header">
                    Blocked <span class="kanban-column-count">{blockedTasksList.length}</span>
                </div>
                {#each blockedTasksList as task (task.id)}
                    <div class="kanban-card" style="border-left: 3px solid var(--danger);">
                        <div class="kanban-card-title" on:click={() => openDetail(task)}>{task.title}</div>
                        <div class="kanban-card-meta">
                            <span class="tag tag-gray">{getProjectName(task.projectId)}</span>
                            {#if task.blockerNote}
                                <span class="text-xs" style="color:var(--danger)">🚫 {task.blockerNote}</span>
                            {/if}
                        </div>
                        <select class="status-select input" value={task.status}
                                on:click|stopPropagation
                                on:change={(e) => changeStatus(task, e.target.value)}>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="blocked">Blocked</option>
                            <option value="done">Done</option>
                        </select>
                    </div>
                {/each}
                {#if blockedTasksList.length === 0}
                    <p class="text-sm text-muted" style="text-align:center; padding:1rem;">No blockers 🎉</p>
                {/if}
            </div>

            <!-- Done (collapsible) -->
            <div class="kanban-column">
                <div class="kanban-column-header">
                    Done
                    <button class="btn text-xs" style="padding:0.25rem 0.5rem" on:click={() => showDone = !showDone}>
                        {showDone ? 'Hide' : `Show (${doneTasks.length})`}
                    </button>
                </div>
                {#if showDone}
                    {#each doneTasks as task (task.id)}
                        <div class="kanban-card" style="opacity:0.7">
                            <div class="kanban-card-title" on:click={() => openDetail(task)}>{task.title}</div>
                            <div class="kanban-card-meta">
                                <span class="tag tag-gray">{getProjectName(task.projectId)}</span>
                                {#if task.actualHours}
                                    <span class="text-xs text-muted">{task.actualHours}h actual</span>
                                {/if}
                                {#if task.assignedTo && getAssigneeName(task.assignedTo)}
                                    <span class="assignee-badge" title={getAssigneeName(task.assignedTo)}>
                                        {getAssigneeName(task.assignedTo).charAt(0).toUpperCase()}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- High ROI Sidebar -->
        {#if $highRoiTasks.length > 0}
            <div class="roi-sidebar">
                <div class="roi-sidebar-header" on:click={() => showRoi = !showRoi}>
                    <strong>⚡ High ROI</strong>
                    <span class="text-xs text-muted">{showRoi ? '▼' : '▶'}</span>
                </div>
                {#if showRoi}
                    {#each $highRoiTasks as task}
                        <div class="roi-card" on:click={() => openDetail(task)}>
                            <div class="text-sm" style="font-weight:500">{task.title}</div>
                            <div class="flex gap-2 items-center mt-1">
                                <span class="text-xs" style="color:var(--primary)">ROI {getRoi(task)}</span>
                                <span class="text-xs text-muted">{task.estimatedHours}h · Impact {task.impactScore}</span>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        {/if}
    </div>

    {#if filteredTasks.filter(t => t.status !== 'done').length === 0}
        <div class="empty-state">
            <p>No active tasks yet.</p>
            <button class="btn btn-primary mt-4" on:click={() => view.set('add')}>Create Your First Project</button>
        </div>
    {/if}
</div>

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .filter-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .filter-btn {
        padding: 0.375rem 0.875rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        background: var(--surface-color);
        color: var(--text-muted);
        font-size: 0.8125rem;
        cursor: pointer;
        transition: all 0.15s;
    }
    .filter-btn:hover {
        border-color: var(--text-muted);
        color: var(--text-main);
    }
    .filter-btn.active {
        background: var(--primary);
        color: var(--text-on-primary);
        border-color: var(--primary);
    }
    .btn-sm {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
    }
    .activity-panel {
        padding: 1rem;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        max-height: 320px;
        overflow-y: auto;
    }
    .activity-item {
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-color);
        font-size: 0.8125rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
        align-items: baseline;
    }
    .activity-item:last-child {
        border-bottom: none;
    }
    .activity-user {
        font-weight: 600;
        color: var(--primary);
    }
    .section-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1rem;
        margin-bottom: 0.75rem;
    }
    .inbox-cards {
        display: flex;
        gap: 0.75rem;
        overflow-x: auto;
        padding-bottom: 0.5rem;
    }
    .inbox-cards .kanban-card {
        min-width: 220px;
        flex-shrink: 0;
    }
    .inbox-section {
        padding: 1rem;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
    }
    .pro-layout {
        display: flex;
        gap: 1.25rem;
        align-items: flex-start;
    }
    .kanban-board {
        display: flex;
        gap: 1rem;
        flex: 1;
        overflow-x: auto;
        align-items: flex-start;
    }
    .kanban-column {
        flex: 1;
        min-width: 220px;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 1rem;
    }
    .kanban-column-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        font-weight: 600;
        font-size: 0.9375rem;
    }
    .kanban-column-count {
        background: var(--border-color);
        font-size: 0.75rem;
        padding: 0.125rem 0.5rem;
        border-radius: 99px;
        color: var(--text-muted);
    }
    .kanban-card {
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 0.875rem;
        margin-bottom: 0.625rem;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .kanban-card:hover {
        border-color: var(--text-muted);
        box-shadow: var(--shadow-sm);
        transform: translateY(-1px);
    }
    .kanban-card-title {
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.375rem;
    }
    .kanban-card-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
        align-items: center;
    }
    .status-select {
        width: 100%;
        margin-top: 0.5rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.8125rem;
    }
    .assignee-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--primary);
        color: white;
        font-size: 0.625rem;
        font-weight: 600;
        flex-shrink: 0;
    }
    .roi-sidebar {
        width: 260px;
        flex-shrink: 0;
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 1rem;
    }
    .roi-sidebar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        margin-bottom: 0.75rem;
    }
    .roi-card {
        padding: 0.625rem;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        transition: background 0.15s;
    }
    .roi-card:last-child {
        border-bottom: none;
    }
    .roi-card:hover {
        background: var(--surface-color);
    }
    @media (max-width: 900px) {
        .pro-layout {
            flex-direction: column;
        }
        .roi-sidebar {
            width: 100%;
        }
    }
</style>
