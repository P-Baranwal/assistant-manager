<script>
    import { providerReachable, assignments, tasks, view } from '$lib/stores';
    import { calculateUrgency } from '$lib/utils/date';
    
    // Stats computation
    let total = $derived($assignments.length + $tasks.length);
    let activeItems = $derived([...$assignments, ...$tasks].filter(t => t.status !== 'done'));
    
    let dueCount = $derived(activeItems.reduce((acc, t) => {
        const urg = calculateUrgency(t.deadline);
        return (urg === 'Due Today' || urg === 'Due Tomorrow' || urg === 'This Week') ? acc + 1 : acc;
    }, 0));
    
    let overdueCount = $derived(activeItems.reduce((acc, t) => {
        const urg = calculateUrgency(t.deadline);
        return urg === 'Overdue' ? acc + 1 : acc;
    }, 0));

    let completedCount = $derived([...$assignments, ...$tasks].filter(t => t.status === 'done').length);
</script>

<header>
    <div class="stat-bar">
        <div class="stat-item"><span class="stat-value">{activeItems.length}</span><span class="stat-label">Active</span></div>
        <div class="stat-item"><span class="stat-value">{dueCount}</span><span class="stat-label">This Week</span></div>
        <div class="stat-item"><span class="stat-value">{overdueCount}</span><span class="stat-label">Overdue</span></div>
        <div class="stat-item"><span class="stat-value">{completedCount}</span><span class="stat-label">Completed</span></div>
    </div>
    <div class="header-actions">
        <span class="status-dot tooltip {$providerReachable ? 'green' : 'amber'}" title={$providerReachable ? 'AI Available' : 'AI Offline/Checking...'}></span>
        <button class="btn {$view === 'settings' ? 'active-nav' : ''}" onclick={() => $view = 'settings'} title="Settings">
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
        </button>
        <button class="btn btn-primary" onclick={() => $view = 'add'}>
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> Add
        </button>
    </div>
</header>
