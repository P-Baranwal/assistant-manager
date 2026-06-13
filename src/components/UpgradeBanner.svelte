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
        gap: 0.75rem;
        padding: 0.625rem 1rem;
        margin: 0.5rem auto;
        max-width: 1200px;
        background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.12), rgba(var(--primary-rgb), 0.04));
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 0.8125rem;
    }
    .banner-text {
        color: var(--muted);
    }
    .btn-sm {
        padding: 0.25rem 0.75rem;
        font-size: 0.75rem;
    }
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
</style>
