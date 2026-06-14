<script>
    import { view, profile, assignments, tasks, weeklyPlan } from '$lib/stores';
    import { generateWeeklyPlan } from '$lib/llm/client';
    import Spinner from '../../components/Spinner.svelte';

    let processing = false;
    let spinnerText = '';
    let errorMsg = '';

    $: activeItems = [...$assignments, ...$tasks].filter(i => i.status !== 'done');

    async function generatePlan() {
        processing = true;
        spinnerText = 'Generating your weekly plan...';
        errorMsg = '';
        try {
            const plan = await generateWeeklyPlan($profile, activeItems);
            weeklyPlan.set(plan);
        } catch (e) {
            errorMsg = e.message || 'Failed to generate plan.';
        }
        processing = false;
    }

    function getSlotIcon(slot) {
        if (!slot) return '⏰';
        const s = slot.toLowerCase();
        if (s.includes('morning')) return '🌅';
        if (s.includes('afternoon')) return '☀️';
        if (s.includes('evening')) return '🌙';
        return '⏰';
    }

    function totalWeekHours() {
        if (!$weeklyPlan) return 0;
        return $weeklyPlan.reduce((sum, d) => sum + (d.totalHours || 0), 0);
    }
</script>

<div class="animate-fade">
    <div class="flex justify-between items-center mb-4">
        <div>
            <h2>Week Plan</h2>
            <p class="text-sm text-muted">AI-generated schedule based on your active tasks</p>
        </div>
        <button class="btn" on:click={() => view.set('dashboard')}>← Back</button>
    </div>

    {#if !$weeklyPlan}
        {#if activeItems.length === 0}
            <div class="empty-state">
                <p class="text-muted">Add some active tasks first, then come back to plan your week.</p>
                <button class="btn btn-primary mt-4" on:click={() => view.set('add')}>Add Task</button>
            </div>
        {:else}
            <div class="card" style="text-align:center; padding: 3rem;">
                <h3 class="mb-2">Ready to plan your week?</h3>
                <p class="text-sm text-muted mb-4">AI will analyze your {activeItems.length} active tasks and create a realistic daily schedule.</p>
                <button class="btn btn-primary" on:click={generatePlan}>
                    <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>
                    Plan My Week
                </button>
            </div>
        {/if}
    {:else}
        <div class="plan-summary mb-4">
            <div class="plan-summary-stat">
                <span class="stat-value">{totalWeekHours().toFixed(1)}h</span>
                <span class="stat-label">Total Planned</span>
            </div>
            <div class="plan-summary-stat">
                <span class="stat-value">{$weeklyPlan.length}</span>
                <span class="stat-label">Days</span>
            </div>
            <div class="plan-summary-stat">
                <span class="stat-value">{($profile.availableHoursPerDay || 6)}h</span>
                <span class="stat-label">Available/Day</span>
            </div>
        </div>

        <div class="plan-grid">
            {#each $weeklyPlan as day, i}
                <div class="plan-day-card" style="animation-delay: {i * 0.05}s">
                    <div class="plan-day-header">
                        <div>
                            <strong>{day.day}</strong>
                            {#if day.date}
                                <span class="text-xs text-muted" style="margin-left: 0.5rem">{day.date}</span>
                            {/if}
                        </div>
                        <span class="plan-hours-badge" class:overloaded={day.totalHours > ($profile.availableHoursPerDay || 6)}>
                            {day.totalHours}h
                        </span>
                    </div>

                    {#if day.blocks && day.blocks.length > 0}
                        <div class="plan-blocks">
                            {#each day.blocks as block}
                                <div class="plan-block">
                                    <span class="plan-slot-icon">{getSlotIcon(block.slot)}</span>
                                    <div class="plan-block-info">
                                        <span class="plan-block-task">{block.task}</span>
                                        <span class="text-xs text-muted">{block.slot} · {block.hours}h</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-sm text-muted" style="padding: 0.75rem 0;">No tasks scheduled</p>
                    {/if}

                    {#if day.note}
                        <p class="plan-day-note text-xs text-muted">{day.note}</p>
                    {/if}
                </div>
            {/each}
        </div>

        <div class="mt-4 flex gap-2 justify-center">
            <button class="btn" on:click={() => weeklyPlan.set(null)}>Clear Plan</button>
            <button class="btn btn-primary" on:click={generatePlan} disabled={processing}>
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                Regenerate
            </button>
        </div>
    {/if}

    {#if errorMsg}
        <div class="text-sm mt-4" style="color: var(--danger); padding: 0.5rem; background: #fee2e2; border-radius:4px;">{errorMsg}</div>
    {/if}
</div>

<Spinner bind:show={processing} text={spinnerText} />

<style>
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .plan-summary {
        display: flex;
        gap: 1.5rem;
        padding: 1rem 1.25rem;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
    }
    .plan-summary-stat {
        display: flex;
        flex-direction: column;
    }
    .plan-summary-stat .stat-value {
        font-family: var(--font-display);
        font-size: 1.25rem;
        font-weight: 600;
    }
    .plan-summary-stat .stat-label {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .plan-grid {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .plan-day-card {
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 1rem 1.25rem;
        animation: slideUp 0.3s ease-out backwards;
    }
    @keyframes slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .plan-day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
    }
    .plan-hours-badge {
        background: var(--primary-surface);
        color: var(--primary);
        padding: 0.2rem 0.6rem;
        border-radius: 99px;
        font-size: 0.8125rem;
        font-weight: 600;
    }
    .plan-hours-badge.overloaded {
        background: rgba(239, 68, 68, 0.12);
        color: var(--danger);
    }
    .plan-blocks {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .plan-block {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.5rem 0.75rem;
        background: var(--bg-color);
        border-radius: 6px;
    }
    .plan-slot-icon {
        font-size: 1rem;
        flex-shrink: 0;
    }
    .plan-block-info {
        display: flex;
        flex-direction: column;
    }
    .plan-block-task {
        font-size: 0.875rem;
        font-weight: 500;
    }
    .plan-day-note {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px dashed var(--border-color);
        font-style: italic;
    }
</style>
