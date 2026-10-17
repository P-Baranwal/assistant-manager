<script>
    import { profile, view, authStore } from '$lib/stores';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';

    export let message = '';
    export let requiredTier = 'pro';

    function handleUpgrade() {
        if ($authStore.isGuest) {
            view.set('auth');
            return;
        }
        view.set('pricing');
    }
</script>

<div class="upgrade-banner animate-fade">
    <span class="banner-text">
        {message || `Upgrade to ${SUBSCRIPTION_LABELS[requiredTier]} to unlock more features.`}
    </span>
    <button class="btn btn-sm btn-primary" on:click={handleUpgrade}>
        {$authStore.isGuest ? 'Sign Up' : 'Upgrade'}
    </button>
</div>

<style>
    .upgrade-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        margin: var(--space-2) auto;
        max-width: 1200px;
        background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.12), rgba(var(--primary-rgb), 0.04));
        border: 1px solid var(--primary-border);
        border-radius: var(--radius);
        font-size: var(--fs-sm);
    }
    .banner-text {
        color: var(--text-muted);
    }
</style>
