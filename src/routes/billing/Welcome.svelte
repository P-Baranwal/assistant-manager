<script>
    import { view, profile } from '$lib/stores';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';
</script>

<div class="welcome-container animate-fade">
    <div class="welcome-card">
        <div class="welcome-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        </div>
        <h2>Welcome to Clerify!</h2>
        <p class="welcome-message">
            Your subscription is being set up. You'll get full access to all your plan's features as soon as the payment processes — this usually takes just a few moments.
        </p>
        {#if $profile?.subscription && $profile.subscription !== 'free'}
            <div class="plan-badge">
                You're on the <strong>{SUBSCRIPTION_LABELS[$profile.subscription] || $profile.subscription}</strong> plan.
            </div>
        {/if}
        <p class="welcome-sub">
            Thank you for upgrading. Let's get you back to work.
        </p>
        <button class="btn btn-primary" on:click={() => view.set('dashboard')}>
            Go to Dashboard
        </button>
    </div>
</div>

<style>
    .welcome-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 2rem 1rem;
        min-height: calc(100vh - 200px);
    }
    .welcome-card {
        text-align: center;
        max-width: 420px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 2.5rem 2rem;
    }
    .welcome-icon {
        color: var(--primary);
        margin-bottom: 1.25rem;
    }
    .welcome-card h2 {
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0 0 0.75rem;
    }
    .welcome-message {
        color: var(--muted);
        font-size: 0.9375rem;
        line-height: 1.6;
        margin: 0 0 1rem;
    }
    .plan-badge {
        display: inline-block;
        background: rgba(var(--primary-rgb), 0.1);
        border: 1px solid rgba(var(--primary-rgb), 0.15);
        color: var(--primary);
        padding: 0.4rem 1rem;
        border-radius: 6px;
        font-size: 0.875rem;
        margin-bottom: 1rem;
    }
    .welcome-sub {
        color: var(--muted);
        font-size: 0.8125rem;
        margin: 0 0 1.5rem;
    }
    .btn-primary {
        padding: 0.6rem 2rem;
        font-size: 0.9375rem;
    }
    .animate-fade {
        animation: fadeIn 0.5s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
