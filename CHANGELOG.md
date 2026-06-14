# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- AI Proxy Layer (Phase 3): Supabase Edge Function (`ai-proxy`) that proxies LLM requests with JWT auth, subscription checks, and usage tracking.
- Proxy supports Groq, Anthropic, OpenAI, and Google Gemini providers via server-side API keys.
- Monthly usage enforcement: 429 response with upgrade prompt when limit exceeded.
- Client-side proxy provider (`src/lib/llm/providers/proxy.js`) with same interface as direct providers.
- Settings UI toggle: "Use Clerify AI (included in plan)" vs "Use my own API key (BYOK)".
- Free users see locked proxy option with upgrade CTA; Student/Pro/Team can toggle freely.
- `use_proxy` column on `profiles` table (migration `00003`).
- `feature` parameter passed through AI calls (`priority_score`, `re_analyze`, `wbs_generate`) for usage logging.

### Changed
- `client.js` now routes through proxy when `profile.useProxy` is true, otherwise uses direct provider.
- `normalizeProfile` in `model.js` includes `useProxy` field.
- AI error messages in Add view now display the actual error text (useful for limit messages).
- Billing & Tier Enforcement (Phase 2): Stripe integration with checkout, portal, and webhook support.
- Supabase Edge Functions for `create-checkout-session`, `create-portal-session`, and `stripe-webhook`.
- Pricing page with Free / Student ($2/mo) / Pro ($5/mo) tier comparison.
- `UpgradeGate` and `UpgradeBanner` components for feature gating.
- `billing.js` utility module for tier limit checks (`canCreateItem`, `canUseAI`, `canAccessFeature`).
- `ai_usage` table and `log_ai_usage` / `get_monthly_usage` RPCs for usage tracking.
- `SUBSCRIPTION_TIERS`, `SUBSCRIPTION_LIMITS`, and `SUBSCRIPTION_LABELS` constants.
- Billing section in Settings with plan display, manage subscription, and upgrade CTA.
- Professional mode gated behind Pro/Team subscription for free users.

### Changed
- Renamed `profile.tier` → `profile.mode` across codebase to separate UI mode from billing subscription.
- Added `profile.subscription` field (values: `free`, `student`, `pro`, `team`).
- SupabaseAdapter now excludes billing-managed fields from client writes.
- `normalizeProfile` in `model.js` updated for `mode` + `subscription` fields.
- Client migration v4 handles `tier` → `mode` rename and initializes `subscription: 'free'`.
- Data Management section description now reflects cloud storage for signed-in users.

## [0.0.1]
### Added
- Svelte 5 and Vite 8 integration for the UI layer migration.
- Comprehensive `svelte-migration-plan.md` outlining a 5-phase roadmap.
- Vite configuration (`vite.config.js`) with support for Svelte and `$lib` path aliases.
- New Svelte entry points: `src/main.js` and `src/App.svelte`.
- ES Module architecture (no-build setup) via `src/` modularization (Legacy).

### Changed
- Reorganized `src/` directory, moving core logic (storage, model, migrations) into `src/lib/`.
- Updated `package.json` with build scripts and modern dev dependencies.
- Refined LLM prompting for more detailed analysis.
- Transitioned from a "no-build" ES module setup to a Vite-powered build pipeline.