# Stripe → Paddle Billing Migration Plan

## Overview

Replace all Stripe billing infrastructure with Paddle Billing. Key differences from Stripe:
- Checkout = client-side overlay (`Paddle.Checkout.open()`), no server round-trip
- Subscription management = REST API calls from edge functions, no hosted portal
- Webhooks = HMAC-SHA256 signatures (not Stripe's scheme)

## Key Decisions

1. **Vendor-agnostic DB columns**: `stripe_customer_id` → `billing_customer_id`, `stripe_subscription_id` → `billing_subscription_id`
2. **Custom management UI**: Cancel/change-plan via edge functions calling Paddle REST API
3. **Paddle Billing** (not Classic): overlay checkout + REST API

---

## Implementation Order

### Step 1: Create shared Paddle utility
**File**: `supabase/functions/_shared/paddle-api.js`

Two exports:
- `paddleFetch(endpoint, options, apiKey)` — wraps `fetch()` with Bearer auth headers for Paddle REST API
- `verifyPaddleWebhook(body, signatureHeader, secret)` — HMAC-SHA256 verification via `crypto.subtle`

### Step 2: Create paddle-webhook edge function
**File**: `supabase/functions/paddle-webhook/index.ts`

Events handled:
- `subscription.created` → UPSERT profiles (`billing_customer_id`, `billing_subscription_id`, `subscription`, `subscription_status`, `current_period_end`)
- `subscription.updated` → UPDATE subscription fields (matched on `billing_subscription_id`)
- `subscription.canceled` → SET `subscription='free'`, `subscription_status='canceled'`, `billing_subscription_id=null`

Tier mapping from env: `PADDLE_PRICE_STUDENT/PRO/TEAM` → `student/pro/team`

### Step 3: Create manage-subscription edge function
**File**: `supabase/functions/manage-subscription/index.ts`

Actions via request body:
- `{ action: 'cancel' }` → PATCH Paddle API to schedule cancellation
- `{ action: 'change_plan', newPlanId: 'pri_xxx' }` → PATCH Paddle API to schedule plan change

Requires `PADDLE_API_KEY` env var.

### Step 4: Create DB migration
**File**: `supabase/migrations/00006_rename_billing_columns.sql`

```sql
ALTER TABLE public.profiles RENAME COLUMN stripe_customer_id TO billing_customer_id;
ALTER TABLE public.profiles RENAME COLUMN stripe_subscription_id TO billing_subscription_id;
```

### Step 5: Update package.json
- Remove `@stripe/stripe-js`
- Add `@paddle/paddle-js`

### Step 6: Update env files
Replace `VITE_STRIPE_PUBLISHABLE_KEY` with:
- `VITE_PADDLE_TOKEN`
- `VITE_PADDLE_ENVIRONMENT`

### Step 7: Update Pricing.svelte
- Replace `stripePriceId` → `paddlePriceId` in plan definitions
- Replace `handleChoosePlan()` — use `initializePaddle()` + `paddle.Checkout.open()` instead of server fetch
- Remove `create-checkout-session` fetch call

### Step 8: Update Settings.svelte
- Replace `openPortal()` with `manageSubscription(action, newPlanId?)` — POSTs to `manage-subscription` edge function
- Replace "Manage Subscription" link with "Cancel Subscription" + "Change Plan" buttons
- Add ConfirmModal wrapper for cancellation

### Step 9: Update supabase.adapter.js
Rename stripped columns from `stripe_customer_id`/`stripe_subscription_id` to `billing_customer_id`/`billing_subscription_id`

### Step 10: Delete old Stripe edge functions
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/create-checkout-session/index.ts`
- `supabase/functions/create-portal-session/index.ts`

### Step 11: Set Supabase secrets
New: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_STUDENT`, `PADDLE_PRICE_PRO`, `PADDLE_PRICE_TEAM`
Remove: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`

### Step 12: Deploy
`npx supabase functions deploy`

---

## Files NOT changed (vendor-agnostic)

- `src/lib/constants.js` — tier names and limits unchanged
- `src/lib/model.js` — normalizeProfile uses tier names
- `src/App.svelte` — checks `p.subscription === 'team'`
- `src/components/UpgradeBanner.svelte`, `UpgradeGate.svelte`
- `supabase/functions/ai-proxy/index.ts` — reads `subscription` field
- `supabase/functions/weekly-digest/index.ts` — filters by `subscription`

---

## Verification

1. Checkout → Paddle overlay → Complete test payment → DB has `billing_customer_id`, `subscription='student'`
2. Webhook → Trigger Paddle sandbox events → DB updates correctly
3. Cancel → Settings → Cancel → Confirm → `subscription='free'`, status='canceled'
4. Change plan → Settings → Change Plan → Pricing → Choose → webhook updates tier
5. Rate limiting → Free tier → 11th AI call → 429 from ai-proxy
6. Zero Stripe remnants: `grep -ri "stripe\|stripe" src/ supabase/`
7. DB columns: `billing_customer_id` and `billing_subscription_id` exist; old stripe columns gone
