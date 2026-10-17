<script>
    import { priorityList, completedList, view, activeDetailId } from '$lib/stores';
    import { calculateUrgency, parseDateLocal } from '$lib/utils/date';
    import RiskBanner from '../../components/RiskBanner.svelte';
    import NaturalLanguageInput from '../../components/NaturalLanguageInput.svelte';
    
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
        if(!diff) return 'var(--border-color)';
        if(diff < 4) return 'var(--diff-low)';
        if(diff < 7) return 'var(--diff-med)';
        return 'var(--diff-high)'; 
    }
    
    function mapScore(t) {
        return t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore || 0;
    }

    function getUrgencyColor(deadline) {
        const urg = calculateUrgency(deadline);
        if (urg === 'Overdue') return 'var(--danger)';
        if (urg === 'Due Today') return 'var(--warning)';
        if (urg === 'Due Tomorrow') return 'var(--diff-med)';
        if (urg === 'This Week') return 'var(--primary)';
        return 'var(--border-color)';
    }
    
    function openDetail(t) {
        activeDetailId.set({ id: t.id, type: t.entityType });
        view.set('detail');
    }
</script>

<RiskBanner />

<div class="tabs-header mb-4 flex justify-between items-center">
    <div class="tabs tabs-flush" role="tablist">
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
    <div class="flex gap-2 items-center">
        <button class="btn btn-sm" on:click={() => view.set('week-plan')} title="AI-generated weekly schedule">
            <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>
            Plan My Week
        </button>
        <button class="btn btn-sm" on:click={() => squished = !squished}>
            <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><path d="M4 18h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1zm0-5h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1s.45 1 1 1zM3 7c0 .55.45 1 1 1h16c.55 0 1-.45 1-1s-.45-1-1-1H4c-.55 0-1 .45-1 1z"/></svg>
            {squished ? 'Expand' : 'Squish'}
        </button>
    </div>
</div>

{#if currentTab === 'active'}
    <NaturalLanguageInput />
    {#if $priorityList.length === 0}
        <div class="empty-state">
            <svg class="svg-icon empty-icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H6v-2h4V7h2v4h4v2h-4v4z"/></svg>
            <h3 class="m-0">No active assignments</h3>
            <p class="mt-2 text-sm">Add your first assignment to get started.</p>
            <button class="btn btn-primary mt-4" on:click={() => view.set('add')}>Add Assignment</button>
        </div>
    {:else}
        <div class="card-list">
            {#each $priorityList as t, i}
                {@const diffColor = getDiffColor(t.difficulty)}
                {@const doneCount = t.checklist ? t.checklist.filter(c=>c.done).length : 0}
                {@const totalCount = t.checklist ? t.checklist.length : 0}
                {@const pct = totalCount ? (doneCount/totalCount)*100 : 0}
                {@const urgDesc = calculateUrgency(t.deadline)}
                {@const urg = urgDesc === 'This Week' ? null : urgDesc}
                
                <div class="card card-hover {squished ? 'compact-card' : ''}" 
                     role="button" tabindex="0"
                     on:click={() => openDetail(t)}
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(t)}
                     style="--delay: {i*0.05}s; --card-opacity: {mapScore(t) < 30 ? 0.75 : 1}; --accent: {getUrgencyColor(t.deadline)};">
                    {#if squished}
                        <div class="flex items-center justify-between gap-4 w-full">
                            <h3 class="card-title text-sm m-0 truncate">{t.title}</h3>
                            <div class="flex items-center gap-3 shrink-0">
                                <span class="text-sm text-muted fw-medium">{formatDate(t.deadline) || 'No date'}</span>
                                <div class="score-ring" style="--ring-color: {t.entityType === 'task' ? 'var(--text-light)' : diffColor};">{t.entityType === 'task' ? 'T' : (t.difficulty||'?')}</div>
                            </div>
                        </div>
                    {:else}
                        <div class="card-top-row">
                            <span class="text-xs text-muted">
                                #{i+1} &middot; Score: {mapScore(t)} 
                                {#if t.boost?.active}
                                    <svg class="svg-icon boost-icon" viewBox="0 0 24 24"><path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 .269 9 5.36C5.79 7.5 3.39 10.71 2 14.53L5.53 16.06L7.33 18.15L8.2 21.05C8.84 21.32 9.54 21.46 10.25 21.46C11.53 21.46 12.75 21 13.75 20.25CL21.5 13C22 10.5 22 8.5 21.61 2.39Z"/></svg> <span class="text-primary fw-medium">Boosted</span>
                                {/if}
                            </span>
                        </div>
                        
                        <h3 class="card-title mt-1">{t.title}</h3>
                        
                        <div class="card-bottom-row mt-2 flex justify-between items-center gap-4">
                            <div class="card-meta-compact flex flex-wrap items-center gap-2">
                                {#if t.entityType === 'task'}
                                    <span class="tag tag-gray">Task</span>
                                {:else}
                                    <span class="tag tag-{(t.type || 'other').toLowerCase()}">{t.type}</span>
                                {/if}
                                {#if urg}
                                    <span class="tag {urg==='Overdue'?'tag-danger':'tag-warning'}">{urg}</span>
                                {/if}
                                {#if t.estimatedHours}
                                    <span class="text-xs text-muted">{t.estimatedHours}h est.</span>
                                {/if}
                            </div>
                            
                            <div class="score-ring" style="--ring-color: {t.entityType === 'task' ? 'var(--text-light)' : diffColor};" title="Difficulty">
                                {t.entityType === 'task' ? 'T' : (t.difficulty||'?')}
                            </div>
                        </div>
                        
                        {#if totalCount > 0}
                            <div class="checklist-progress mt-2">
                                <div class="checklist-progress-bg">
                                    <div class="checklist-progress-fill" style="--pct: {pct}%"></div>
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
                        <svg class="svg-icon check-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    </div>
                    <div class="completed-title">{t.title}</div>
                    {#if t.entityType === 'task'}
                        <span class="tag tag-gray">Task</span>
                    {/if}
                    <div class="completed-meta ml-auto flex items-center gap-2">
                        {#if t.deadline}
                            <span>Due {formatDate(t.deadline)}</span>
                        {/if}
                        {#if t.difficulty && t.entityType !== 'task'}
                            <span class="tag tag-gray">Diff: {t.difficulty}</span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
{/if}

<style>
    .tabs-header {
        border-bottom: 1px solid var(--border-color);
    }
    .tabs-flush {
        border-bottom: none;
        margin-bottom: 0;
    }
    .card-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
    }
    .card {
        animation-delay: var(--delay, 0s);
        opacity: var(--card-opacity, 1);
        border-left: 4px solid var(--accent, var(--border-color));
    }
    .card-hover {
        transition: transform var(--transition), box-shadow var(--transition);
    }
    .card-hover:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
    }
    .compact-card {
        padding: var(--space-3) var(--space-5) !important;
        margin-bottom: var(--space-1) !important;
        flex-direction: row !important;
    }
    .truncate {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .shrink-0 {
        flex-shrink: 0;
    }
    .fw-medium {
        font-weight: 500;
    }
    .text-primary {
        color: var(--primary);
    }
    .icon-sm {
        width: 14px;
        height: 14px;
    }
    .empty-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto var(--space-4);
    }
    .boost-icon {
        width: 12px;
        height: 12px;
        margin-left: 2px;
        vertical-align: text-bottom;
        fill: var(--primary);
    }
    .check-icon {
        width: 18px;
        height: 18px;
    }
    .score-ring {
        border-color: var(--ring-color, var(--border-color));
        color: var(--ring-color, var(--text-muted));
    }
    .checklist-progress-fill {
        width: var(--pct, 0%);
    }
</style>
