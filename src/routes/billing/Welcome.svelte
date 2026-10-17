<script>
    import { view, profile } from '$lib/stores';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';
</script>

<div class="welcome-container animate-fade">
    <div class="welcome-card">
        <div class="welcome-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
        <button class="btn btn-primary btn-lg" on:click={() => view.set('dashboard')}>
            Go to Dashboard
        </button>
    </div>
</div>

<style>
    .welcome-container {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--space-8) var(--space-4);
        min-height: calc(100vh - 200px);
    }
    .welcome-card {
        text-align: center;
        max-width: 420px;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-10) var(--space-8);
        box-shadow: var(--shadow-md);
    }
    .welcome-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 88px;
        height: 88px;
        border-radius: var(--radius-full);
        background: var(--primary-surface);
        color: var(--primary);
        margin-bottom: var(--space-5);
    }
    .welcome-card h2 {
        font-family: var(--font-display);
        font-size: var(--fs-2xl);
        font-weight: 700;
        margin: 0 0 var(--space-3);
        color: var(--text-main);
    }
    .welcome-message {
        color: var(--text-muted);
        font-size: var(--fs-md);
        line-height: 1.6;
        margin: 0 0 var(--space-4);
    }
    .plan-badge {
        display: inline-block;
        background: var(--primary-surface);
        border: 1px solid rgba(var(--primary-rgb), 0.15);
        color: var(--primary);
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-full);
        font-size: var(--fs-base);
        margin-bottom: var(--space-4);
    }
    .welcome-sub {
        color: var(--text-muted);
        font-size: var(--fs-sm);
        margin: 0 0 var(--space-6);
    }
</style>
