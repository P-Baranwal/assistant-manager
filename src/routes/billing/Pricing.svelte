<script>
    import { profile, view, authStore } from '$lib/stores';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';
    import { initializePaddle } from '@paddle/paddle-js';

    let paddleInstance = null;
    let paddleLoading = true;

    initializePaddle({
        token: import.meta.env.VITE_PADDLE_TOKEN,
        environment: import.meta.env.VITE_PADDLE_ENVIRONMENT || 'sandbox',
    }).then((instance) => {
        paddleInstance = instance;
        paddleLoading = false;
    }).catch((err) => {
        console.error('Paddle initialization failed:', err);
        paddleLoading = false;
    });

    const plans = [
        {
            id: 'free',
            name: 'Free',
            price: '$0',
            period: 'forever',
            description: 'Get started with basic task management.',
            features: [
                { text: '50 tasks / assignments', included: true },
                { text: '10 AI analyses / month', included: true },
                { text: 'Student mode', included: true },
                { text: 'JSON backup / restore', included: true },
                { text: 'BYOK (bring your own key)', included: true },
                { text: 'Professional mode', included: false },
                { text: 'WBS generator', included: false },
                { text: 'Calendar sync', included: false },
                { text: 'AI proxy (no BYOK needed)', included: false },
            ],
        },
        {
            id: 'student',
            name: 'Student',
            price: '$2',
            period: '/ month',
            description: 'For students who need more AI power and sync.',
            paddlePriceId: 'PADDLE_PRICE_STUDENT',
            features: [
                { text: 'Unlimited tasks / assignments', included: true },
                { text: '100 AI analyses / month', included: true },
                { text: 'Student mode', included: true },
                { text: 'JSON backup / restore', included: true },
                { text: 'BYOK (bring your own key)', included: true },
                { text: 'Calendar sync (iCal)', included: true },
                { text: 'AI proxy (no BYOK needed)', included: true },
                { text: 'Professional mode', included: false },
                { text: 'WBS generator', included: false },
            ],
            highlight: true,
        },
        {
            id: 'pro',
            name: 'Pro',
            price: '$5',
            period: '/ month',
            description: 'Full access to all features and both modes.',
            paddlePriceId: 'PADDLE_PRICE_PRO',
            features: [
                { text: 'Unlimited tasks / assignments', included: true },
                { text: 'Unlimited AI analyses', included: true },
                { text: 'Both Student & Professional modes', included: true },
                { text: 'WBS generator', included: true },
                { text: 'Calendar sync (iCal)', included: true },
                { text: 'JSON backup / restore', included: true },
                { text: 'BYOK (bring your own key)', included: true },
                { text: 'AI proxy (no BYOK needed)', included: true },
            ],
        },
    ];

    let loading = false;
    let error = '';

    async function handleChoosePlan(plan) {
        if (plan.id === 'free') {
            view.set('settings');
            return;
        }

        if ($authStore.isGuest) {
            view.set('auth');
            return;
        }

        if ($profile?.subscription === plan.id) {
            return;
        }

        if (!paddleInstance) {
            error = 'Payment system is still loading. Please try again.';
            return;
        }

        loading = true;
        error = '';

        try {
            paddleInstance.Checkout.open({
                items: [{ priceId: plan.paddlePriceId, quantity: 1 }],
                customer: {
                    email: $authStore.user?.email,
                },
                customData: {
                    supabase_user_id: $authStore.user?.id,
                },
                settings: {
                    displayMode: 'overlay',
                    theme: 'light',
                    successUrl: `${window.location.origin}?checkout=success`,
                },
            });
        } catch (err) {
            error = err.message || 'Failed to start checkout.';
        } finally {
            loading = false;
        }
    }
</script>

<div class="pricing-container animate-fade">
    <div class="pricing-header">
        <button class="btn btn-ghost back-btn" on:click={() => view.set('dashboard')}>
            ← Back
        </button>
        <h2>Choose Your Plan</h2>
        <p class="pricing-subtitle">Start free, upgrade when you need more.</p>
    </div>

    {#if error}
        <div class="alert alert-error">{error}</div>
    {/if}

    <div class="plans-grid">
        {#each plans as plan}
            <div class="plan-card" class:highlight={plan.highlight} class:current={$profile?.subscription === plan.id}>
                {#if plan.highlight}
                    <div class="popular-badge">Most Popular</div>
                {/if}
                {#if $profile?.subscription === plan.id}
                    <div class="current-badge">Current Plan</div>
                {/if}

                <h3 class="plan-name">{plan.name}</h3>
                <div class="plan-price">
                    <span class="price-amount">{plan.price}</span>
                    <span class="price-period">{plan.period}</span>
                </div>
                <p class="plan-desc">{plan.description}</p>

                <ul class="feature-list">
                    {#each plan.features as feature}
                        <li class:excluded={!feature.included}>
                            <span class="feature-icon">{feature.included ? '✓' : '—'}</span>
                            {feature.text}
                        </li>
                    {/each}
                </ul>

                <button
                    class="btn plan-btn"
                    class:btn-primary={plan.highlight && $profile?.subscription !== plan.id}
                    class:btn-outline={!plan.highlight || $profile?.subscription === plan.id}
                    disabled={loading || $profile?.subscription === plan.id}
                    on:click={() => handleChoosePlan(plan)}
                >
                    {#if $profile?.subscription === plan.id}
                        Current Plan
                    {:else if plan.id === 'free'}
                        Downgrade to Free
                    {:else if $authStore.isGuest}
                        Sign Up to Subscribe
                    {:else}
                        Choose {plan.name}
                    {/if}
                </button>
            </div>
        {/each}
    </div>

    <div class="pricing-note">
        <p>All paid plans include a 7-day free trial. Cancel anytime from your account settings.</p>
    </div>
</div>

<style>
    .pricing-container {
        max-width: 960px;
        margin: 0 auto;
        padding: 1.5rem 1rem 3rem;
    }
    .pricing-header {
        text-align: center;
        margin-bottom: 2rem;
    }
    .pricing-header h2 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.5rem 0 0.25rem;
    }
    .pricing-subtitle {
        color: var(--muted);
        font-size: 0.9375rem;
        margin: 0;
    }
    .back-btn {
        font-size: 0.875rem;
    }
    .plans-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.25rem;
        margin-bottom: 2rem;
    }
    .plan-card {
        position: relative;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 1.75rem 1.5rem;
        display: flex;
        flex-direction: column;
    }
    .plan-card.highlight {
        border-color: var(--primary);
        box-shadow: 0 0 0 1px var(--primary);
    }
    .popular-badge, .current-badge {
        position: absolute;
        top: -0.625rem;
        left: 50%;
        transform: translateX(-50%);
        font-size: 0.6875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 0.2rem 0.75rem;
        border-radius: 999px;
        white-space: nowrap;
    }
    .popular-badge {
        background: var(--primary);
        color: #fff;
    }
    .current-badge {
        background: var(--success, #10b981);
        color: #fff;
    }
    .plan-name {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
    }
    .plan-price {
        display: flex;
        align-items: baseline;
        gap: 0.25rem;
        margin-bottom: 0.5rem;
    }
    .price-amount {
        font-size: 2rem;
        font-weight: 700;
    }
    .price-period {
        font-size: 0.875rem;
        color: var(--muted);
    }
    .plan-desc {
        font-size: 0.8125rem;
        color: var(--muted);
        margin: 0 0 1.25rem;
        line-height: 1.5;
    }
    .feature-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1.5rem;
        flex: 1;
    }
    .feature-list li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8125rem;
        padding: 0.35rem 0;
    }
    .feature-list li.excluded {
        color: var(--muted);
        opacity: 0.5;
    }
    .feature-icon {
        font-size: 0.75rem;
        width: 1rem;
        text-align: center;
        flex-shrink: 0;
    }
    .plan-btn {
        width: 100%;
        justify-content: center;
    }
    .pricing-note {
        text-align: center;
        font-size: 0.8125rem;
        color: var(--muted);
    }
    .pricing-note p { margin: 0; }
    .alert-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #ef4444;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.875rem;
        margin-bottom: 1.5rem;
        text-align: center;
    }
    .animate-fade {
        animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 700px) {
        .plans-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
