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

    let frequency = 'month';

    const plans = [
        {
            id: 'free',
            name: 'Free',
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
            description: 'For students who need more AI power and sync.',
            priceIds: {
                month: import.meta.env.VITE_PADDLE_PRICE_STUDENT_MONTHLY,
                year: import.meta.env.VITE_PADDLE_PRICE_STUDENT_YEARLY,
            },
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
            description: 'Full access to all features and both modes.',
            priceIds: {
                month: import.meta.env.VITE_PADDLE_PRICE_PRO_MONTHLY,
                year: import.meta.env.VITE_PADDLE_PRICE_PRO_YEARLY,
            },
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

    let priceMap = {};
    let priceLoading = true;
    let priceError = '';

    $: if (paddleInstance && !paddleLoading) {
        fetchPrices();
    }

    async function fetchPrices() {
        const items = [];
        for (const plan of plans) {
            if (plan.priceIds) {
                items.push({ priceId: plan.priceIds.month, quantity: 1 });
                items.push({ priceId: plan.priceIds.year, quantity: 1 });
            }
        }

        priceLoading = true;
        priceError = '';

        try {
            const res = await paddleInstance.PricePreview({ items });
            const map = {};
            res.data.details.lineItems.forEach(item => {
                map[item.price.id] = item.formattedTotals.total;
            });
            priceMap = map;
        } catch (err) {
            console.error('PricePreview failed:', err);
            priceError = 'Failed to load localized prices.';
        } finally {
            priceLoading = false;
        }
    }

    let loading = false;
    let error = '';

    async function handleChoosePlan(plan) {
        if (plan.id === 'free') {
            if ($authStore.isGuest) {
                view.set('auth');
            } else {
                view.set('dashboard');
            }
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
                items: [{ priceId: plan.priceIds[frequency], quantity: 1 }],
                customer: {
                    email: $authStore.user?.email,
                },
                customData: {
                    supabase_user_id: $authStore.user?.id,
                },
                settings: {
                    displayMode: 'overlay',
                    variant: 'one-page',
                    theme: 'light',
                    successUrl: `${window.location.origin}#welcome`,
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

        <div class="frequency-toggle">
            <button
                class="toggle-option"
                class:active={frequency === 'month'}
                on:click={() => frequency = 'month'}
            >
                Monthly
            </button>
            <button
                class="toggle-option"
                class:active={frequency === 'year'}
                on:click={() => frequency = 'year'}
            >
                Yearly
            </button>
        </div>
    </div>

    {#if error}
        <div class="alert alert-error">{error}</div>
    {/if}

    {#if priceError}
        <div class="alert alert-warning">{priceError}</div>
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
                    {#if plan.id === 'free'}
                        <span class="price-amount">$0</span>
                        <span class="price-period">forever</span>
                    {:else if priceMap[plan.priceIds[frequency]]}
                        <span class="price-amount">{priceMap[plan.priceIds[frequency]]}</span>
                        <span class="price-period">/{frequency}</span>
                    {:else}
                        <span class="price-amount price-loading">…</span>
                    {/if}
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
                        {#if $authStore.isGuest}
                            Sign Up Free
                        {:else}
                            Go to Dashboard
                        {/if}
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
        margin: 0 0 1rem;
    }
    .back-btn {
        font-size: 0.875rem;
    }
    .frequency-toggle {
        display: inline-flex;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 3px;
        gap: 2px;
    }
    .toggle-option {
        padding: 0.4rem 1rem;
        font-size: 0.8125rem;
        font-weight: 500;
        border: none;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.15s ease;
    }
    .toggle-option.active {
        background: var(--primary);
        color: #fff;
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
        min-height: 2.5rem;
    }
    .price-amount {
        font-size: 2rem;
        font-weight: 700;
    }
    .price-loading {
        font-size: 2rem;
        color: var(--muted);
    }
    .price-period {
        font-size: 0.875rem;
        color: var(--muted);
        text-transform: lowercase;
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
    .alert-warning {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.2);
        color: #f59e0b;
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
