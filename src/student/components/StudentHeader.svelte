<script>
    import { providerReachable, assignments, tasks, view, isOnline } from '$lib/stores';
    import { calculateUrgency } from '$lib/utils/date';
    
    // Stats computation
    $: total = $assignments.length + $tasks.length;
    $: activeItems = [...$assignments, ...$tasks].filter(t => t.status !== 'done');
    
    $: dueCount = activeItems.reduce((acc, t) => {
        const urg = calculateUrgency(t.deadline);
        return (urg === 'Due Today' || urg === 'Due Tomorrow' || urg === 'This Week') ? acc + 1 : acc;
    }, 0);
    
    $: overdueCount = activeItems.reduce((acc, t) => {
        const urg = calculateUrgency(t.deadline);
        return urg === 'Overdue' ? acc + 1 : acc;
    }, 0);

    $: completedCount = [...$assignments, ...$tasks].filter(t => t.status === 'done').length;
</script>

<header>
    <div class="stat-bar">
        <div class="stat-item"><span class="stat-value">{activeItems.length}</span><span class="stat-label">Active</span></div>
        <div class="stat-item"><span class="stat-value">{dueCount}</span><span class="stat-label">This Week</span></div>
        <div class="stat-item"><span class="stat-value" class:text-danger={overdueCount > 0}>{overdueCount}</span><span class="stat-label">Overdue</span></div>
        <div class="stat-item"><span class="stat-value">{completedCount}</span><span class="stat-label">Completed</span></div>
    </div>
    <div class="header-actions">
        {#if !$isOnline}
            <span class="offline-badge" title="You are offline. Changes will sync when you reconnect.">
                <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M24 8.98C20.93 5.9 16.69 4 12 4C9.09 4 6.37 4.76 4 6.11L2.55 4.66C5.39 2.88 8.59 1.84 12 1.84c4.97 0 9.52 2.03 12.8 5.3l-.8 1.84zM12 8.16c-2.57 0-4.92.9-6.82 2.4L3.73 9.09C6.18 7.21 9 6.16 12 6.16c3.53 0 6.77 1.38 9.14 3.66l-1.87 1.08C17.67 9.14 14.98 8.16 12 8.16zm0 4.33c-1.66 0-3.16.62-4.31 1.63l-1.68-1.68c1.59-1.32 3.63-2.12 5.83-2.12 2.47 0 4.73.89 6.49 2.38l-1.68 1.68c-1.17-1.03-2.71-1.63-4.45-1.63zm0 4.33c-.95 0-1.82.38-2.46 1l-1.68-1.68c1.07-.88 2.44-1.42 3.96-1.42s2.89.54 3.96 1.42l-1.68 1.68c-.64-.62-1.51-1-2.46-1zm0 4.33c-.69 0-1.31.28-1.77.73L12 19.78l1.77-1.77c-.46-.45-1.08-.73-1.77-.73z"/></svg>
                Offline
            </span>
        {/if}
        <span class="status-dot tooltip {$providerReachable ? 'green' : 'amber'}" title={$providerReachable ? 'AI Available' : 'AI Offline/Checking...'}></span>
        <button class="btn btn-ghost {$view === 'settings' ? 'active-nav' : ''}" on:click={() => view.set('settings')} title="Settings">
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
        </button>
        <button class="btn btn-ghost {$view === 'dashboard' ? 'active-nav' : ''}" on:click={() => view.set('dashboard')}>
            Dashboard
        </button>
        <button class="btn btn-ghost {$view === 'task-manager' ? 'active-nav' : ''}" on:click={() => view.set('task-manager')}>
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg> Tasks
        </button>
        <button class="btn btn-ghost {$view === 'calendar' ? 'active-nav' : ''}" on:click={() => view.set('calendar')}>
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg> Calendar
        </button>
        <button class="btn btn-primary" on:click={() => view.set('add')}>
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Add Assignment
        </button>
    </div>
</header>
