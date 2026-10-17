<script>
    import { onMount } from 'svelte';
    import { profile, view, authStore } from '$lib/stores';
    import { SUBSCRIPTION_LABELS } from '$lib/constants';
    import { initializePaddle } from '@paddle/paddle-js';
    import { LOCAL_ONLY } from '$lib/runtime';

    let paddleInstance = null;
    let paddleLoading = true;

    onMount(() => {
        if (LOCAL_ONLY) {
            paddleLoading = false;
            return;
        }
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
        padding: var(--space-6) var(--space-4) var(--space-12);
    }
    .pricing-header {
        text-align: center;
        margin-bottom: var(--space-8);
    }
    .pricing-header h2 {
        font-family: var(--font-display);
        font-size: var(--fs-2xl);
        font-weight: 700;
        margin: var(--space-2) 0 var(--space-1);
        color: var(--text-main);
        letter-spacing: -0.025em;
    }
    .pricing-subtitle {
        color: var(--text-muted);
        font-size: var(--fs-md);
        margin: 0 0 var(--space-4);
    }
    .back-btn {
        font-size: var(--fs-base);
    }
    .frequency-toggle {
        display: inline-flex;
        background: var(--surface-2);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: var(--space-1);
        gap: var(--space-1);
    }
    .toggle-option {
        padding: var(--space-2) var(--space-4);
        font-size: var(--fs-sm);
        font-weight: 500;
        border: none;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: var(--transition-fast);
    }
    .toggle-option:hover {
        color: var(--text-main);
    }
    .toggle-option.active {
        background: var(--primary);
        color: var(--text-on-primary);
    }
    .plans-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-5);
        margin-bottom: var(--space-8);
    }
    .plan-card {
        position: relative;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-6) var(--space-5);
        display: flex;
        flex-direction: column;
        transition: var(--transition);
    }
    .plan-card:hover {
        box-shadow: var(--shadow-md);
    }
    .plan-card.highlight {
        border-color: var(--primary);
        box-shadow: var(--shadow-md), 0 0 0 1px var(--primary);
    }
    .popular-badge, .current-badge {
        position: absolute;
        top: -0.625rem;
        left: 50%;
        transform: translateX(-50%);
        font-size: var(--fs-xs);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-full);
        white-space: nowrap;
    }
    .popular-badge {
        background: var(--primary);
        color: var(--text-on-primary);
    }
    .current-badge {
        background: var(--success);
        color: var(--text-on-primary);
    }
    .plan-name {
        font-family: var(--font-display);
        font-size: var(--fs-lg);
        font-weight: 600;
        margin: 0 0 var(--space-2);
        color: var(--text-main);
    }
    .plan-price {
        display: flex;
        align-items: baseline;
        gap: var(--space-1);
        margin-bottom: var(--space-2);
        min-height: var(--space-10);
    }
    .price-amount {
        font-family: var(--font-display);
        font-size: var(--fs-2xl);
        font-weight: 700;
        color: var(--text-main);
    }
    .price-loading {
        font-size: var(--fs-2xl);
        color: var(--text-muted);
    }
    .price-period {
        font-size: var(--fs-base);
        color: var(--text-muted);
        text-transform: lowercase;
    }
    .plan-desc {
        font-size: var(--fs-sm);
        color: var(--text-muted);
        margin: 0 0 var(--space-5);
        line-height: 1.5;
    }
    .feature-list {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--space-6);
        flex: 1;
    }
    .feature-list li {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--fs-sm);
        padding: var(--space-1) 0;
        color: var(--text-main);
    }
    .feature-list li.excluded {
        color: var(--text-muted);
        opacity: 0.6;
    }
    .feature-icon {
        font-size: var(--fs-xs);
        width: 1rem;
        text-align: center;
        flex-shrink: 0;
        color: var(--success);
    }
    .feature-list li.excluded .feature-icon {
        color: var(--text-light);
    }
    .plan-btn {
        width: 100%;
        justify-content: center;
    }
    .pricing-note {
        text-align: center;
        font-size: var(--fs-sm);
        color: var(--text-muted);
    }
    .pricing-note p { margin: 0; }
    .alert {
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius);
        font-size: var(--fs-base);
        margin-bottom: var(--space-6);
        text-align: center;
    }
    .alert-error {
        background: var(--danger-surface);
        border: 1px solid var(--danger);
        color: var(--danger);
    }
    .alert-warning {
        background: var(--warning-surface);
        border: 1px solid var(--warning);
        color: var(--warning);
    }
    @media (max-width: 700px) {
        .plans-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
