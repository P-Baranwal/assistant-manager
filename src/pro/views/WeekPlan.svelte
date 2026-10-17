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
            <div class="card plan-cta">
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
                <div class="plan-day-card" style="--delay: {i * 0.05}s">
                    <div class="plan-day-header">
                        <div>
                            <strong>{day.day}</strong>
                            {#if day.date}
                                <span class="day-date text-xs text-muted">{day.date}</span>
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
                        <p class="day-empty text-sm text-muted">No tasks scheduled</p>
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
        <div class="form-error text-sm mt-4">{errorMsg}</div>
    {/if}
</div>

<Spinner bind:show={processing} text={spinnerText} />

<style>
    .plan-summary {
        display: flex;
        gap: var(--space-6);
        padding: var(--space-4) var(--space-5);
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xs);
    }
    .plan-summary-stat {
        display: flex;
        flex-direction: column;
    }
    .plan-summary-stat .stat-value {
        font-family: var(--font-display);
        font-size: var(--fs-xl);
        font-weight: 600;
    }
    .plan-summary-stat .stat-label {
        font-size: var(--fs-xs);
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .plan-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    .plan-day-card {
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-4) var(--space-5);
        box-shadow: var(--shadow-xs);
        animation: slideUp 0.3s var(--ease) backwards;
        animation-delay: var(--delay, 0s);
    }
    @keyframes slideUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .plan-day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3);
        padding-bottom: var(--space-2);
        border-bottom: 1px solid var(--border-color);
    }
    .plan-hours-badge {
        background: var(--primary-surface);
        color: var(--primary);
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-full);
        font-size: var(--fs-sm);
        font-weight: 600;
    }
    .plan-hours-badge.overloaded {
        background: var(--danger-surface);
        color: var(--danger);
    }
    .plan-blocks {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    .plan-block {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--space-3);
        background: var(--bg-subtle);
        border-radius: var(--radius-sm);
    }
    .plan-slot-icon {
        font-size: var(--fs-md);
        flex-shrink: 0;
    }
    .plan-block-info {
        display: flex;
        flex-direction: column;
    }
    .plan-block-task {
        font-size: var(--fs-base);
        font-weight: 500;
    }
    .plan-day-note {
        margin-top: var(--space-2);
        padding-top: var(--space-2);
        border-top: 1px dashed var(--border-color);
        font-style: italic;
    }
    .plan-cta {
        text-align: center;
        padding: var(--space-12);
    }
    .day-date {
        margin-left: var(--space-2);
    }
    .day-empty {
        padding: var(--space-3) 0;
    }
</style>
