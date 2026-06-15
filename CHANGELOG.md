# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.0.7]
### Added
- Productivity Analytics (Phase 7): comprehensive analytics dashboard with velocity tracking, time accuracy analysis, and data export.
- Analytics page accessible from both Student and Pro dashboards via navigation button.
- Velocity chart: bar chart showing tasks completed per week for the last 8 weeks.
- Time accuracy analysis: estimated vs actual hours by task type with variance percentages.
- Project breakdown: doughnut chart showing time distribution by project over the last 30 days.
- Streak tracking: consecutive days with at least one task completed.
- AI calibration drift: visual representation of how priority scores and difficulty estimates have evolved over time.
- Team analytics (Team tier): workload distribution, blocked tasks, and team velocity metrics.
- CSV export: download all tasks/assignments with all fields for external analysis.
- PDF report generation: monthly summary with completion rate, time accuracy, and project breakdown (Pro/Team feature).
- Chart.js integration for interactive charts and visualizations.
- Analytics styles added to global CSS for consistent theming.

### Changed
- StudentHeader and ProHeader now include Analytics navigation button with bar chart icon.
- App.svelte routes to Analytics component for both student and professional modes.
- Added `chart.js` and `svelte-chartjs` dependencies for charting capabilities.
### Added
- Smart AI Features (Phase 6): intelligent scheduling, risk alerts, natural language entry, weekly digest, and accuracy feedback.
- Smart Scheduling: "Plan My Week" button on both Student and Pro dashboards generates an AI-optimized weekly schedule based on active tasks, deadlines, priorities, and available hours.
- WeekPlan view component: displays day-by-day schedule with time blocks, slot icons (Morning/Afternoon/Evening), total hours, and overload indicators.
- `generateWeeklyPlan(profile, activeItems)` function in `src/lib/llm/client.js` — calls AI to create realistic Mon–Fri work plans.
- Deadline Risk Alerts: `RiskBanner` component shows dismissible overload warning when estimated hours for next 7 days exceed available capacity.
- Risk detection computed client-side using `availableHoursPerDay` profile setting (default 6h/day) and tasks due within 7 days.
- Natural Language Task Entry: `NaturalLanguageInput` component on both dashboards — type or paste natural language, AI extracts structured task data.
- `extractTaskFromText(text, profile)` function in `src/lib/llm/client.js` — parses natural language into `{ title, type, deadline, estimatedHours, weight, notes }`.
- NL input shows preview card with editable fields before saving, with Enter key to submit.
- Weekly Digest Email: Supabase Edge Function (`weekly-digest`) generates and sends personalized weekly digest emails via Resend.
- Digest function gathers top 5 priority tasks per user, generates AI summary, and sends formatted HTML email.
- Requires `RESEND_API_KEY` and `RESEND_FROM` env vars; needs Supabase cron trigger for scheduling.
- Accuracy Feedback Loop: completed tasks now show estimated vs actual hours comparison with variance percentage.
- Student Detail view: time accuracy section with variance indicator on completed assignments.
- ProDetail view: time accuracy section on completed tasks when both estimated and actual hours are logged.
- AI Insights section in Settings: shows accuracy patterns across completed tasks (average variance, breakdown by task type).
- Profile field `availableHoursPerDay` (default 6, range 1–16) for risk alerts and weekly plan generation.
- Profile field `weeklyDigestOptIn` (default true) for email digest opt-out.
- `weeklyPlan`, `riskAlertDismissed`, and `nlPreview` stores in `src/lib/stores.js`.
- `WeekPlan.svelte` view routed as `'week-plan'` in both Student and Pro modes.
- CSS styles for accuracy feedback, AI insights, risk banner, and NL input components.

### Changed
- `normalizeProfile` in `model.js` now includes `availableHoursPerDay` and `weeklyDigestOptIn` fields.
- Student Dashboard now shows RiskBanner and NaturalLanguageInput at top of active tab, plus "Plan My Week" button in tab bar.
- ProDashboard now shows RiskBanner, NaturalLanguageInput, and "Plan My Week" button in filter bar.
- App.svelte imports and routes the new `WeekPlan` component for `'week-plan'` view.

## [0.0.5]
### Added
- Collaboration (Phase 5): Team tier with shared projects, comments, activity feed, and real-time sync.
- New Supabase migration (`00004_collaboration_schema.sql`): teams, team_members, team_invites, task_comments, activity_log, notifications tables with RLS policies and triggers.
- Team service layer (`src/lib/teams.js`) with CRUD for teams, members, invites, shared projects, comments, activity, and notifications.
- Real-time sync module (`src/lib/realtime.js`) using Supabase Realtime for shared tasks, projects, activity, and notifications.
- Team management UI (`src/pro/views/TeamSettings.svelte`): create team, invite members by email, manage roles, shared skills profile, danger zone.
- Kanban project filter bar: toggle between All Projects, My Projects, and Team Projects.
- Activity feed panel in ProDashboard: shows recent task movements, creations, and updates for team shared projects.
- Assignee avatars on Kanban cards: circular initials badges for tasks with `assigned_to`.
- Comments section on ProDetail: threaded comment list with author avatars, timestamps, and @mention support.
- Task assignment dropdown on ProDetail for shared projects: assign tasks to team members.
- Share-with-team toggle on ProAdd: new projects can be shared with the team on creation.
- Notification bell in ProHeader: shows unread count badge and dropdown with recent notifications.
- Team invitation acceptance/decline in Settings: pending team invites card with Accept/Decline buttons.
- Team Management card in Settings for Team tier users.
- Notification styles, activity panel styles, assignee badge styles, and team role badges in `style.css`.

### Changed
- `SupabaseAdapter` now relies on RLS policies for project/task access control instead of client-side `user_id` filtering, enabling shared project visibility across team members.
- `SupabaseAdapter` preserves original `user_id` on task/project updates to maintain ownership for shared resources.
- `normalizeProfile` now includes `teamId` field.
- `normalizeTask` now includes `assignedTo` and `userId` fields.
- `normalizeProject` now includes `teamId`, `visibility`, and `userId` fields.
- `SUBSCRIPTION_LIMITS` now includes `sharedProjects` flag (true only for Team tier).
- `stores.js` exports new stores: `currentTeam`, `teamMembers`, `teamActivity`, `notifications`, `unreadNotifications`, `sharedProjects`, `privateProjects`.
- `constants.js` exports `TEAM_ROLES` array.
- `App.svelte` loads team data and subscribes to real-time when profile subscription is 'team'.
- `App.svelte` routes to `team-settings` view.
- `ProDashboard` supports project filtering, activity feed, and assignee avatars.
- `ProDetail` includes comments section and task assignment for shared projects.
- `ProAdd` includes share-with-team toggle when user has a team.
- `ProHeader` includes notification bell with unread badge and dropdown.
- `Settings` includes team management card and pending team invitations.

## [0.0.4]
### Added
- Progressive Web App (Phase 4): Full PWA support for mobile and desktop users.
- PWA manifest (`public/manifest.json`) with app icons at all required sizes (72-512px).
- Service worker via `vite-plugin-pwa` with Workbox caching strategies.
- Cache-first for static assets, network-first for Supabase API calls.
- Offline state detection via `isOnline` Svelte store (`online`/`offline` events).
- Subtle offline indicator badge in header when disconnected from network.
- IndexedDB-based offline write queue for mutations when offline.
- Automatic queue flush when connectivity is restored (last-write-wins for V1).
- "Add to Home Screen" install prompt after 3+ visits (Android/Chrome).
- iOS Safari manual install instruction banner (Share → Add to Home Screen).
- Install banner component with dismiss functionality (persists dismissal).
- PWA meta tags in `index.html` (theme-color, apple-mobile-web-app, viewport-fit).
- Background sync for offline mutations when user reconnects.

### Changed
- Renamed `index.html` title from "Assignment Manager" to "Clerify".
- Updated `vite.config.js` with VitePWA plugin configuration.
- `stores.js` now includes PWA-related stores (`isOnline`, `deferredPrompt`, `canInstall`, `showInstallBanner`, `showIOSInstructions`).
- `main.js` initializes PWA features on app load.
- `storage.js` now queues mutations to IndexedDB when offline and flushes on reconnect.
- StudentHeader and ProHeader components show offline badge when `!$isOnline`.
- Added `offline-badge` CSS class with pulse animation for offline indicator.

### Fixed
- App can now be installed as a PWA on mobile devices for native-like experience.
- Data persists and syncs when users go offline and reconnect.
- Clear visual feedback when app is in offline mode.

## [0.0.3]
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

## [0.0.2]
### Added
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