<script>
    import { providerReachable, projects, tasks, blockedTasks, highRoiTasks, view, isOnline, currentTeam, notifications, unreadNotifications } from '$lib/stores';
    import { calculateUrgency } from '$lib/utils/date';
    import { teamService } from '$lib/teams';

    // Stats
    $: activeProjects = $projects.filter(p => p.status === 'active').length;

    $: activeTasks = $tasks.filter(t => t.status !== 'done');
    $: weekTasks = activeTasks.reduce((acc, t) => {
        const urg = calculateUrgency(t.deadline);
        return (urg === 'Due Today' || urg === 'Due Tomorrow' || urg === 'This Week') ? acc + 1 : acc;
    }, 0);

    $: blocked = $blockedTasks.length;
    $: roiCount = $highRoiTasks.length;
    $: hasTeam = !!$currentTeam;

    let showNotifications = false;

    async function toggleNotifications() {
        showNotifications = !showNotifications;
        if (showNotifications) {
            await loadNotifications();
        }
    }

    async function loadNotifications() {
        try {
            const notifs = await teamService.getNotifications();
            notifications.set(notifs);
        } catch (err) {
            console.warn('Failed to load notifications:', err);
        }
    }

    async function markAllRead() {
        try {
            await teamService.markAllNotificationsRead();
            notifications.update(current => current.map(n => ({ ...n, read_at: new Date().toISOString() })));
        } catch (err) {
            console.warn('Failed to mark notifications read:', err);
        }
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

    function closeNotifications() {
        showNotifications = false;
    }
</script>

<header>
    <div class="stat-bar">
        <div class="stat-item"><span class="stat-value">{activeProjects}</span><span class="stat-label">Projects</span></div>
        <div class="stat-item"><span class="stat-value">{weekTasks}</span><span class="stat-label">This Week</span></div>
        <div class="stat-item"><span class="stat-value" class:text-danger={blocked > 0}>{blocked}</span><span class="stat-label">Blocked</span></div>
        <div class="stat-item"><span class="stat-value">{roiCount}</span><span class="stat-label">High ROI</span></div>
        {#if hasTeam}
            <div class="stat-item"><span class="stat-value">{$currentTeam.name}</span><span class="stat-label">Team</span></div>
        {/if}
    </div>
    <div class="header-actions">
        {#if !$isOnline}
            <span class="offline-badge" title="You are offline. Changes will sync when you reconnect.">
                <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M24 8.98C20.93 5.9 16.69 4 12 4C9.09 4 6.37 4.76 4 6.11L2.55 4.66C5.39 2.88 8.59 1.84 12 1.84c4.97 0 9.52 2.03 12.8 5.3l-.8 1.84zM12 8.16c-2.57 0-4.92.9-6.82 2.4L3.73 9.09C6.18 7.21 9 6.16 12 6.16c3.53 0 6.77 1.38 9.14 3.66l-1.87 1.08C17.67 9.14 14.98 8.16 12 8.16zm0 4.33c-1.66 0-3.16.62-4.31 1.63l-1.68-1.68c1.59-1.32 3.63-2.12 5.83-2.12 2.47 0 4.73.89 6.49 2.38l-1.68 1.68c-1.17-1.03-2.71-1.63-4.45-1.63zm0 4.33c-.95 0-1.82.38-2.46 1l-1.68-1.68c1.07-.88 2.44-1.42 3.96-1.42s2.89.54 3.96 1.42l-1.68 1.68c-.64-.62-1.51-1-2.46-1zm0 4.33c-.69 0-1.31.28-1.77.73L12 19.78l1.77-1.77c-.46-.45-1.08-.73-1.77-.73z"/></svg>
                Offline
            </span>
        {/if}
        {#if hasTeam}
            <div class="notification-wrapper">
                <button class="btn btn-ghost notification-bell" on:click={toggleNotifications} title="Notifications">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:20px;height:20px"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                    {#if $unreadNotifications > 0}
                        <span class="notif-badge">{$unreadNotifications}</span>
                    {/if}
                </button>
                {#if showNotifications}
                    <div class="notification-dropdown">
                        <div class="notif-header">
                            <strong>Notifications</strong>
                            {#if $unreadNotifications > 0}
                                <button class="btn btn-sm" on:click={markAllRead}>Mark all read</button>
                            {/if}
                        </div>
                        {#if $notifications.length === 0}
                            <p class="text-sm text-muted" style="padding:1rem; text-align:center">No notifications</p>
                        {:else}
                            {#each $notifications.slice(0, 20) as notif}
                                <div class="notif-item" class:unread={!notif.read_at}>
                                    <div class="text-sm" style="font-weight:500">{notif.title}</div>
                                    {#if notif.body}
                                        <div class="text-xs text-muted">{notif.body}</div>
                                    {/if}
                                    <div class="text-xs text-light">{timeAgo(notif.created_at)}</div>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
        <span class="status-dot tooltip {$providerReachable ? 'green' : 'amber'}" title={$providerReachable ? 'AI Available' : 'AI Offline/Checking...'}></span>
        <button class="btn btn-ghost {$view === 'settings' ? 'active-nav' : ''}" on:click={() => view.set('settings')} title="Settings">
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
        </button>
        <button class="btn btn-ghost {$view === 'dashboard' ? 'active-nav' : ''}" on:click={() => view.set('dashboard')}>
            Dashboard
        </button>
        <button class="btn btn-ghost {$view === 'analytics' ? 'active-nav' : ''}" on:click={() => view.set('analytics')}>
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg> Analytics
        </button>
        <button class="btn btn-primary" on:click={() => view.set('add')}>
            <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> New Project / WBS
        </button>
    </div>
</header>

<style>
    .notification-wrapper {
        position: relative;
    }
    .notification-bell {
        position: relative;
    }
    .notif-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        background: var(--danger);
        color: white;
        font-size: 0.5625rem;
        min-width: 16px;
        height: 16px;
        border-radius: 99px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        padding: 0 4px;
    }
    .notification-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        width: 320px;
        max-height: 400px;
        overflow-y: auto;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        box-shadow: var(--shadow-md);
        z-index: 100;
        margin-top: 0.5rem;
    }
    .notif-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color);
    }
    .notif-item {
        padding: 0.625rem 1rem;
        border-bottom: 1px solid var(--border-color);
    }
    .notif-item:last-child {
        border-bottom: none;
    }
    .notif-item.unread {
        background: var(--primary-surface);
    }
    .btn-sm {
        padding: 0.25rem 0.5rem;
        font-size: 0.6875rem;
    }
</style>
