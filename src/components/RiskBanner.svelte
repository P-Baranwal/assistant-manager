<script>
    import { profile, assignments, tasks, riskAlertDismissed } from '$lib/stores';
    import { parseDateLocal } from '$lib/utils/date';

    $: activeItems = [...$assignments, ...$tasks].filter(i => i.status !== 'done' && i.deadline);

    $: riskData = (() => {
        const availablePerDay = $profile?.availableHoursPerDay || 6;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const sevenDaysOut = new Date(now);
        sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

        let totalHours = 0;
        let taskCount = 0;

        for (const item of activeItems) {
            const deadline = parseDateLocal(item.deadline);
            deadline.setHours(0, 0, 0, 0);
            if (deadline >= now && deadline <= sevenDaysOut) {
                totalHours += item.estimatedHours || 1;
                taskCount++;
            }
        }

        const availableHours = availablePerDay * 7;
        const overloaded = totalHours > availableHours;
        const ratio = availableHours > 0 ? totalHours / availableHours : 0;

        return { totalHours, taskCount, availableHours, overloaded, ratio };
    })();

    $: showBanner = riskData.overloaded && !$riskAlertDismissed && riskData.taskCount > 0;

    function dismiss() {
        riskAlertDismissed.set(true);
        // Reset at midnight by storing the date
        try { localStorage.setItem('riskAlertDismissedDate', new Date().toISOString().split('T')[0]); } catch {}
    }

    // Check if we should re-enable after day change
    import { onMount } from 'svelte';
    onMount(() => {
        try {
            const savedDate = localStorage.getItem('riskAlertDismissedDate');
            const today = new Date().toISOString().split('T')[0];
            if (savedDate && savedDate !== today) {
                riskAlertDismissed.set(false);
            }
        } catch {}
    });
</script>

{#if showBanner}
    <div class="risk-banner animate-fade" role="alert">
        <div class="risk-banner-content">
            <div class="risk-banner-icon">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
            </div>
            <div class="risk-banner-text">
                <strong>Overload Alert:</strong> You have ~{riskData.totalHours.toFixed(1)}h of work due in the next 7 days
                ({riskData.taskCount} tasks), but only ~{riskData.availableHours}h available.
                {#if riskData.ratio > 1.5}
                    Consider rescheduling or deprioritizing some tasks urgently.
                {:else}
                    Consider rescheduling or deprioritizing some tasks.
                {/if}
            </div>
            <button class="risk-banner-dismiss" on:click={dismiss} title="Dismiss until tomorrow" aria-label="Dismiss overload alert">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
            </button>
        </div>
    </div>
{/if}

<style>
    .risk-banner {
        background: linear-gradient(135deg, var(--warning-surface), var(--danger-surface));
        border: 1px solid var(--border-color);
        border-left: 3px solid var(--diff-high);
        padding: var(--space-3) var(--space-4);
        margin: var(--space-3) auto;
        max-width: 1200px;
        border-radius: var(--radius);
    }
    .risk-banner-content {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
    }
    .risk-banner-icon {
        color: var(--diff-high);
        flex-shrink: 0;
        margin-top: var(--space-1);
    }
    .risk-banner-icon .svg-icon {
        width: 20px;
        height: 20px;
    }
    .risk-banner-text {
        flex: 1;
        font-size: var(--fs-base);
        color: var(--text-main);
        line-height: 1.5;
    }
    .risk-banner-dismiss {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: var(--space-1);
        border-radius: var(--radius-xs);
        flex-shrink: 0;
        transition: var(--transition-fast);
    }
    .risk-banner-dismiss:hover {
        background: var(--surface-2);
        color: var(--text-main);
    }
    .risk-banner-dismiss:focus-visible {
        outline: none;
        box-shadow: var(--ring);
    }
</style>
