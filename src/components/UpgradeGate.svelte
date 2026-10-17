<script>
    import { profile, view, authStore } from '$lib/stores';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';

    export let feature = '';
    export let requiredTier = 'pro';

    async function handleUpgrade() {
        if ($authStore.isGuest) {
            view.set('auth');
            return;
        }
        view.set('pricing');
    }
</script>

<div class="upgrade-gate animate-fade">
    <div class="gate-icon" aria-hidden="true">🔒</div>
    <h3 class="gate-title">{feature}</h3>
    <p class="gate-desc">
        {#if $authStore.isGuest}
            Sign up to unlock {feature}.
        {:else}
            Upgrade to <strong>{SUBSCRIPTION_LABELS[requiredTier]}</strong> to unlock {feature}.
        {/if}
    </p>
    <button class="btn btn-primary" on:click={handleUpgrade}>
        {$authStore.isGuest ? 'Sign Up Free' : 'View Plans'}
    </button>
</div>

<style>
    .upgrade-gate {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: var(--space-8) var(--space-6);
        background: var(--surface-color);
        border: 1px dashed var(--border-strong);
        border-radius: var(--radius-lg);
        gap: var(--space-3);
    }
    .gate-icon {
        font-size: var(--fs-2xl);
        line-height: 1;
        opacity: 0.7;
    }
    .gate-title {
        font-size: var(--fs-lg);
        font-weight: 600;
        margin: 0;
    }
    .gate-desc {
        font-size: var(--fs-base);
        color: var(--text-muted);
        margin: 0;
        max-width: 320px;
    }
</style>
