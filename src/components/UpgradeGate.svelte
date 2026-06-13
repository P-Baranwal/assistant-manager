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
    <div class="gate-icon">🔒</div>
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
        padding: 2rem 1.5rem;
        background: var(--bg-card);
        border: 1px dashed var(--border-color);
        border-radius: 12px;
        gap: 0.75rem;
    }
    .gate-icon {
        font-size: 2rem;
        opacity: 0.6;
    }
    .gate-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
    }
    .gate-desc {
        font-size: 0.875rem;
        color: var(--muted);
        margin: 0;
        max-width: 320px;
    }
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
