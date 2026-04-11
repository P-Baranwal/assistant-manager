<script>
    import { priorityList, completedList, view, activeDetailId } from '$lib/stores';
    import { calculateUrgency } from '$lib/utils/date';
    
    let currentTab = 'active'; // 'active' or 'completed'
    
    // Shared type styles
    const typeColors = {
        'Essay': {bg: 'var(--bg-essay)', text: 'var(--text-essay)'},
        'Coding': {bg: 'var(--bg-coding)', text: 'var(--text-coding)'},
        'Math': {bg: 'var(--bg-math)', text: 'var(--text-math)'},
        'Research': {bg: 'var(--bg-research)', text: 'var(--text-research)'},
        'Other': {bg: 'var(--bg-other)', text: 'var(--text-other)'}
    };

    function getDiffColor(diff) {
        if(!diff) return '#e2e8f0';
        if(diff < 4) return '#4ade80';
        if(diff < 7) return '#fbbf24';
        return '#ef4444'; 
    }
    
    function mapScore(t) {
        return t.boost?.active ? t.boost.boostedPriorityScore : t.priorityScore || 0;
    }
    
    function openDetail(t) {
        activeDetailId.set({ id: t.id, type: t.entityType });
        view.set('detail');
    }
</script>

<div class="tabs mb-4" role="tablist">
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
                
                <div class="card card-hover" 
                     role="button" tabindex="0"
                     on:click={() => openDetail(t)}
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(t)}
                     style="animation-delay: {i*0.05}s; cursor: pointer;">
                    <div class="card-header">
                        <div>
                            <div class="text-xs text-muted mb-1">
                                #{i+1} &middot; Score: {mapScore(t)} 
                                {#if t.boost?.active}
                                    <svg class="svg-icon" viewBox="0 0 24 24" style="vertical-align: text-bottom; fill: var(--primary); width:14px;"><path d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19ZM5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5ZM21.61 2.39C21.61 2.39 16.66 .269 9 5.36C5.79 7.5 3.39 10.71 2 14.53L5.53 16.06L7.33 18.15L8.2 21.05C8.84 21.32 9.54 21.46 10.25 21.46C11.53 21.46 12.75 21 13.75 20.25CL21.5 13C22 10.5 22 8.5 21.61 2.39Z"/></svg> (Boosted)
                                {/if}
                            </div>
                            <h3 class="card-title">{t.title}</h3>
                        </div>
                        <div class="score-pill" style="{t.entityType === 'task' ? 'background:var(--border-color); color:var(--text-muted);' : `background:${diffColor}`}">{t.entityType === 'task' ? 'T' : (t.difficulty||'?')}</div>
                    </div>
                    <div class="card-meta">
                        {#if t.entityType === 'task'}
                            <span class="tag tag-gray">Task</span>
                        {:else}
                            <span class="tag" style="background:{tagStyle.bg};color:{tagStyle.text}">{t.type}</span>
                        {/if}
                        {#if urg}
                            <span class="tag {urg==='Overdue'?'tag-danger':'tag-warning'}">{urg}</span>
                        {/if}
                        <span class="text-xs text-muted ml-auto">{t.estimatedHours ? t.estimatedHours+'h est.' : ''}</span>
                    </div>
                    {#if totalCount > 0}
                    <div class="checklist-progress bg">
                        <div class="checklist-progress-bg">
                            <div class="checklist-progress-fill" style="width:{pct}%"></div>
                        </div>
                        <div class="text-xs text-muted mt-1">{doneCount}/{totalCount} tasks completed</div>
                    </div>
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
        <div class="card-list">
            {#each $completedList as t}
                <div class="card card-hover" 
                     role="button" tabindex="0"
                     on:click={() => openDetail(t)}
                     on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail(t)}
                     style="opacity: 0.7; cursor: pointer;">
                    <div class="card-header">
                        <div class="flex items-center gap-2">
                            {#if t.entityType === 'task'}
                                <span class="tag tag-gray" style="zoom: 0.8">Task</span>
                            {/if}
                            <h3 class="card-title text-muted" style="text-decoration:line-through">{t.title}</h3>
                        </div>
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
</style>
