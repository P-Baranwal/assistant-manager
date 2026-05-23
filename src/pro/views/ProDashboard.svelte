<script>
    import { tasks, projects, unassignedTasks, highRoiTasks, view, activeDetailId } from '$lib/stores';
    import { storage } from '$lib/storage';

    // Kanban columns from all tasks
    $: todoTasks = $tasks.filter(t => t.status === 'todo');
    $: inProgressTasks = $tasks.filter(t => t.status === 'in_progress');
    $: blockedTasksList = $tasks.filter(t => t.status === 'blocked');
    $: doneTasks = $tasks.filter(t => t.status === 'done').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 10);

    let showDone = false;
    let showRoi = true;

    function getProjectName(projectId) {
        if (!projectId) return 'Inbox';
        const p = $projects.find(pr => pr.id === projectId);
        return p ? p.title : 'Unknown';
    }

    function getRoi(t) {
        if (!t.impactScore || !t.estimatedHours) return null;
        return (t.impactScore / Math.max(t.estimatedHours, 0.5)).toFixed(1);
    }

    async function changeStatus(task, newStatus) {
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();

        // Blocker logic
        if (newStatus === 'blocked' && !task.blockerNote) {
            task.blockerNote = 'Blocked';
        } else if (newStatus !== 'blocked') {
            task.blockerNote = null;
        }

        await storage.saveTask(task);
        await refreshTasks();
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
</script>

<div class="animate-fade">
    <!-- Inbox Section -->
    {#if $unassignedTasks.length > 0}
        <div class="inbox-section mb-4">
            <h3 class="section-title">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px;height:18px"><path d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z"/></svg>
                Inbox <span class="text-muted text-sm">({$unassignedTasks.length} unassigned)</span>
            </h3>
            <div class="inbox-cards">
                {#each $unassignedTasks as task}
                    <div class="kanban-card" on:click={() => openDetail(task)}>
                        <div class="kanban-card-title">{task.title}</div>
                        <div class="kanban-card-meta">
                            <span class="tag tag-gray">Inbox</span>
                            {#if task.impactScore}
                                <span class="text-xs text-muted">Impact: {task.impactScore}</span>
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

    {#if $tasks.filter(t => t.status !== 'done').length === 0}
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
