# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- ES Module architecture (no-build setup) via `src/` modularization.
- Clean JSON schema extraction and normalized outputs.
- Schema versioning support and migration pipeline.
- Provider plugin interface (`validate` and `healthCheck`).
- Strict action routing replacing monolithic global handlers.
- More LLM providers (Groq and Gemini).
- Added `estimatedHoursReasoning` parameter to assignment analysis.

### Changed
- Refined LLM prompting for more detailed analysis.

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