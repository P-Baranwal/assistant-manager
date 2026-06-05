<script>
    import { priorityList, completedList, view, activeDetailId } from '$lib/stores';
    import { calculateUrgency, parseDateLocal } from '$lib/utils/date';
    
    let currentTab = 'active'; // 'active' or 'completed'
    let squished = false;
    
    // Shared type styles
    const typeColors = {
        'Essay': {bg: 'var(--bg-essay)', text: 'var(--text-essay)'},
        'Coding': {bg: 'var(--bg-coding)', text: 'var(--text-coding)'},
        'Math': {bg: 'var(--bg-math)', text: 'var(--text-math)'},
        'Research': {bg: 'var(--bg-research)', text: 'var(--text-research)'},
        'Other': {bg: 'var(--bg-other)', text: 'var(--text-other)'}
    };

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = parseDateLocal(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getDiffColor(diff) {
        if(!diff) return '#e2e8f0';
        if(diff < 4) return '#4ade80';
        if(diff < 7) return '#fbbf24';
        return '#ef4444'; 
    }
    
    function mapScore(t) {
        return t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore || 0;
    }

    function getUrgencyColor(deadline) {
        const urg = calculateUrgency(deadline);
        if (urg === 'Overdue') return 'var(--danger)';
        if (urg === 'Due Today') return '#f97316';
        if (urg === 'Due Tomorrow') return 'var(--diff-med)';
        if (urg === 'This Week') return 'var(--primary)';
        return 'var(--border-color)';
    }
    
    function openDetail(t) {
        activeDetailId.set({ id: t.id, type: t.entityType });
        view.set('detail');
    }
</script>

<div class="tabs-container mb-4" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color);">
    <div class="tabs" role="tablist" style="border-bottom: none; margin-bottom: 0;">
        <div class="tab {currentTab === 'active' ? 'active' : ''}" 
             role="tab" tabindex="0" aria-selected={currentTab === 'active'}
             on:click={() => currentTab = 'active'}
             on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (currentTab = 'active')}>
            Active ({$priorityList.length})
        </div>
        <div class="tab {currentTab === 'completed' ? 'active' : ''}" 
             role="tab" tabindex="0" aria-selected={currentTab === 'completed'}
             on:click={() => currentTab = 'completed'}
             on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && (currentTab = 'completed')}>
            Completed ({$completedList.length})
        </div>
    </div>
    <button class="btn" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; margin-bottom: 0.5rem;" on:click={() => squished = !squished}>
        <svg class="svg-icon" style="width:14px;height:14px;" viewBox="0 0 24 24"><path d="M4 18h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1zm0-5h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1zM3 7c0 .55.45 1 1 1h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1z"/></svg>
        {squished ? 'Expand' : 'Squish'}
    </button>
</div>

{#if currentTab === 'active'}
    {#if $priorityList.length === 0}
        <div class="empty-state">
            <svg class="svg-icon" style="width:48px;height:48px;margin:0 auto 1rem;" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H6v-2h4V7h2v4h4v2h-4v4z"/></svg>
            <h3>No active assignments</h3>
            <p class="mt-2 text-sm">Add your first assignment to get started.</p>
            <button class="btn btn-primary mt-4" on:click={() => view.set('add')}>Add Assignment</button>
        </div>
    {:else}
        <div class="card-list">
            {#each $priorityList as t, i}
                {@const diffColor = getDiffColor(t.difficulty)}
                {@const tagStyle = typeColors[t.type] || typeColors['Other']}
                {@const doneCount = t.checklist ? t.checklist.filter(c=>c.done).length : 0}
                {@const totalCount = t.checklist ? t.checklist.length : 0}
                {@const pct = totalCount ? (doneCount/totalCount)*100 : 0}
                {@const urgDesc = calculateUrgency(t.deadline)}
                {@const urg = urgDesc === 'This Week' ? null : urgDesc}
                
                <div class="card card-hover {squished ? 'compact-card' : ''}" 
                     role="button" tabindex="0"
                     on:click={() => openDetail(t)}
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(t)}
                     style="animation-delay: {i*0.05}s; cursor: pointer; opacity: {mapScore(t) < 30 ? 0.75 : 1}; border-left: 4px solid {getUrgencyColor(t.deadline)};">
                    {#if squished}
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; width: 100%;">
                            <h3 class="card-title text-sm" style="margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{t.title}</h3>
                            <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
                                <span style="font-size: 0.85rem; font-weight: 500;" class="text-muted">{formatDate(t.deadline) || 'No date'}</span>
                                <div class="score-ring" style="{t.entityType === 'task' ? 'border-color: var(--text-light); color: var(--text-muted);' : `border-color: ${diffColor}; color: ${diffColor};`}">{t.entityType === 'task' ? 'T' : (t.difficulty||'?')}</div>
                            </div>
                        </div>
                    {:else}
                        <div class="card-top-row">
                            <span class="text-xs text-muted">
                                #{i+1} &middot; Score: {mapScore(t)} 
                                {#if t.boost?.active}
                                    <svg class="svg-icon" viewBox="0 0 24 24" style="vertical-align: text-bottom; fill: var(--primary); width:12px; height:12px; margin-left: 2px;"><path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 .269 9 5.36C5.79 7.5 3.39 10.71 2 14.53L5.53 16.06L7.33 18.15L8.2 21.05C8.84 21.32 9.54 21.46 10.25 21.46C11.53 21.46 12.75 21 13.75 20.25CL21.5 13C22 10.5 22 8.5 21.61 2.39Z"/></svg> <span style="color: var(--primary); font-weight: 500;">Boosted</span>
                                {/if}
                            </span>
                        </div>
                        
                        <h3 class="card-title mt-1" style="font-size: 1.125rem; font-weight: 600; color: var(--text-main);">{t.title}</h3>
                        
                        <div class="card-bottom-row mt-2" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                            <div class="card-meta-compact" style="display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center;">
                                {#if t.entityType === 'task'}
                                    <span class="tag tag-gray">Task</span>
                                {:else}
                                    <span class="tag" style="background:{tagStyle.bg};color:{tagStyle.text}">{t.type}</span>
                                {/if}
                                {#if urg}
                                    <span class="tag {urg==='Overdue'?'tag-danger':'tag-warning'}">{urg}</span>
                                {/if}
                                {#if t.estimatedHours}
                                    <span class="text-xs text-muted">{t.estimatedHours}h est.</span>
                                {/if}
                            </div>
                            
                            <div class="score-ring" style="{t.entityType === 'task' ? 'border-color: var(--text-light); color: var(--text-muted);' : `border-color: ${diffColor}; color: ${diffColor};`}" title="Difficulty">
                                {t.entityType === 'task' ? 'T' : (t.difficulty||'?')}
                            </div>
                        </div>
                        
                        {#if totalCount > 0}
                            <div class="checklist-progress mt-2">
                                <div class="checklist-progress-bg">
                                    <div class="checklist-progress-fill" style="width:{pct}%"></div>
                                </div>
                                <div class="text-xs text-muted mt-1">{doneCount}/{totalCount} tasks completed</div>
                            </div>
                        {/if}
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
{/if}

{#if currentTab === 'completed'}
    {#if $completedList.length === 0}
        <div class="empty-state">
            <h3 class="text-muted">No completed items yet</h3>
        </div>
    {:else}
        <div class="completed-list">
            {#each $completedList as t}
                <div class="completed-row" 
                     role="button" tabindex="0"
                     on:click={() => openDetail(t)}
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(t)}>
                    <div class="completed-check">
                        <svg class="svg-icon" viewBox="0 0 24 24" style="color: var(--success); width: 18px; height: 18px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    </div>
                    <div class="completed-title">{t.title}</div>
                    {#if t.entityType === 'task'}
                        <span class="tag tag-gray" style="font-size: 0.7rem; padding: 0.1rem 0.4rem; margin-right: 0.5rem;">Task</span>
                    {/if}
                    <div class="completed-meta ml-auto">
                        {#if t.deadline}
                            <span style="margin-right: 0.5rem;">Due {formatDate(t.deadline)}</span>
                        {/if}
                        {#if t.difficulty && t.entityType !== 'task'}
                            <span class="tag tag-gray" style="zoom: 0.8">Diff: {t.difficulty}</span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
{/if}

<style>
    .card-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .card-hover {
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
    }
    .card-hover:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .card {
        animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) backwards;
    }
    @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .compact-card {
        padding: 0.75rem 1.25rem !important;
        margin-bottom: 0.25rem !important;
        flex-direction: row !important;
    }
</style>
