# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**知析 (Zhixi)** — a Chrome extension (Manifest V3) that analyzes Zhihu creator income, engagement and content lifecycle. Built with React 18 + TypeScript + Vite via `@crxjs/vite-plugin`. All data is collected by calling Zhihu's internal creator APIs with the user's session cookie and stored locally in IndexedDB via Dexie. Nothing is sent to a third-party server.

## Common Commands

```bash
yarn dev             # Vite dev server with HMR (load dist/ as unpacked extension)
yarn build           # Production build → dist/
yarn test            # Vitest (watch mode)
yarn test:coverage   # Coverage report (thresholds: lines 80 / functions 60 / branches 75 / statements 80)
yarn lint            # ESLint on src/
yarn lint:fix        # ESLint autofix
yarn type-check      # tsc --noEmit
yarn format          # Prettier write

yarn build:firefox   # Build Firefox MV3 package into dist-firefox/
yarn lint:firefox    # web-ext lint on the Firefox package
yarn run:firefox     # Temporarily install into Firefox Developer Edition
yarn package:firefox # Produce the .zip for AMO upload (web-ext-artifacts/)
```

Run a single test file or test name:

```bash
yarn test path/to/file.test.ts
yarn test -t "test name substring"
```

Husky runs `lint-staged` on commit (`eslint --fix` + `prettier --write` on staged `*.ts*`). Do not use `--no-verify`; fix the underlying issue instead.

Path alias: `@/` → `src/` (configured in both `tsconfig.json` and `vite.config.ts`).

## Architecture

Chrome + Firefox MV3 extension with three runtime surfaces that communicate via `chrome.runtime.sendMessage`:

1. **Service worker / event page** (`src/background/service-worker.ts`) — the only place that calls Zhihu APIs. Holds the single source of truth for collection status (`isCollecting`, `progress`, logs), runs auto-sync on `chrome.alarms`, and persists data to IndexedDB. All API calls go through `src/api/fetch-proxy.ts` which uses `credentials: 'include'` (cookie auth works because `host_permissions` includes `https://www.zhihu.com/*`). On Firefox this runs as an event page rather than a true service worker — see "Firefox build" below.
2. **Dashboard SPA** (`src/dashboard/`) — the main UI, built as a standalone HTML entry (`src/dashboard/index.html`) by Vite's `rollupOptions.input`. Reads from IndexedDB directly for rendering; mutations (sync, fetch) are dispatched as messages to the service worker.
3. **Popup** (`src/popup/`) — small status widget surfaced by `action.default_popup`.

### Firefox build

`yarn build:firefox` produces `dist-firefox/` on top of the Chrome output by running `scripts/build-firefox.mjs`, which re-bundles the service worker from source via esbuild (single-file IIFE, required because Firefox 115 ESR doesn't support `background.type: "module"`) and rewrites the manifest (`background.scripts` + `browser_specific_settings.gecko`). Host permissions on Firefox are **optional** — `src/shared/host-permissions.ts` wraps `chrome.permissions.contains/request` and both popup + dashboard gate their UI behind a user-gesture authorization flow. Full release checklist: `docs/firefox-release.md`.

**Typed messages.** Every message between surfaces has a request + response interface in `src/shared/message-types.ts`. When adding a new message, update that file first — service worker's dispatcher narrows on `action` and the UI hooks rely on the response types.

### Data model and storage

`src/db/database.ts` defines the Dexie schema as `ZhihuAnalysisDB` with versioned migrations (currently at v11). Core tables:

- `incomeRecords` — one row per `(userId, contentId, recordDate)`. Daily snapshot of `currentIncome / currentRead / currentInteraction` plus cumulative totals. This is the canonical revenue table.
- `contentDaily` — per-content daily engagement metrics (`pv`, `show`, `upvote`, `comment`, `like`, `collect`, `share`, `play`). Populated on demand by "fetch content daily" actions.
- `realtimeAggr` — user-level daily aggregates across all content (has richer fields than `contentDaily`: `reaction`, `rePin`, `new_*` deltas).
- `syncedDates` — marks which `(userId, date)` tuples have been fetched, so reverse-chronological backfills can short-circuit.
- `mlModels`, `incomeGoals`, `panelLayout`, `tourState`, `savedAccounts` — user state / persisted artifacts.

Always add **new tables or field changes via a new `version(N)` block**. Do not mutate existing version blocks — Dexie will not re-run migrations on an already-upgraded DB.

Store modules (`src/db/*-store.ts`) are the only layer that touches tables. Components should not `import { db }` directly for queries that have a store helper; read through the store so tests can mock it.

Currency is stored as integer fen (分) throughout the DB and API layer. Display conversion happens via the `useCurrency()` context (`src/dashboard/contexts/CurrencyContext.tsx`) — never hard-code `/100` or "元" in components.

### API layer

`src/api/` wraps Zhihu's internal creator endpoints. One file per endpoint family:

- `zhihu-income.ts` — `/api/v4/creators/analysis/income/all` (paginated per day)
- `zhihu-content-daily.ts` — `/api/v4/creators/analysis/realtime/content/daily` (per single content, date range)
- `zhihu-realtime.ts` — `/api/v4/creators/analysis/realtime/member/aggr`
- `zhihu-creations.ts` — `/api/v4/creators/creations/v2/all` (full content list for unmonetized detection)

Each file exports a `fetchX` function that returns raw API types (defined in `src/shared/api-types.ts`) and a `parseXResponse` that maps to domain types (`src/shared/types.ts`). Keep these two layers separated — tests mock at the `fetchWithRetry` boundary.

Rate limiting: use `randomDelay(REQUEST_INTERVAL_MIN, REQUEST_INTERVAL_MAX)` between sequential requests to avoid triggering Zhihu anti-scrape. Backfills iterate newest-first and short-circuit on already-synced dates.

### Dashboard architecture

The dashboard uses a **panel registry** pattern. `src/dashboard/panel-registry.ts` is the single list of all analysis panels. Each entry declares `{ key, label, tab, defaultOrder, defaultVisible, render(ctx) }`. Adding a new panel means:

1. Create the component in `src/dashboard/components/`
2. Register it in `panel-registry.ts` (lazy-imported via `React.lazy`)
3. Update the `getDefaultTabs()` list if it belongs in a new tab

The `DashboardContext` passed to each `render` function contains already-filtered records, date ranges, and callbacks. Panels should not refetch — consume the context. `Dashboard.tsx` orchestrates: loads data once, computes derived state via `useMemo`, and hands the context down.

The user's customized layout (visibility + order of tabs and panels) is persisted in the `panelLayout` table. `getDefaultTabs()` is only used for first-time users; existing users keep their saved layout across updates. **Label changes in `getDefaultTabs()` do not propagate to existing users** — if you rename a tab, users who already have a saved layout will keep the old label until they reset.

Lifetime of content detail pages is different: `ContentDetailPage.tsx` is rendered directly (not via registry) and has its own nested Tabs. The "内容诊断" tab hosts the elasticity-based attribution analysis and related diagnostics (`IncomeAttributionChart`, `ContentFunnelAnalysis`, `EngagementEfficiencyChart`, `PeakAndRhythmAnalysis`, `RPMTrendChart`).

### Statistics & ML

`src/shared/stats.ts` is a self-contained stats library — Pearson/Spearman correlation, multiple linear regression (NNLS), ridge regression, elasticity (log-log) analysis, quantile regression, EMA, Holt forecasting, exponential/power-law decay fits, efficiency frontier, z-score anomalies, and `simpleMovingAverage`. Always check this file before hand-rolling math — chances are it already exists.

**NNLS multicollinearity caveat**: `multipleLinearRegression` + `contributionPercentages` will zero out highly correlated features (e.g. PV vs upvotes). For attribution UIs that must show non-zero contributions for every feature, prefer `elasticityAnalysis` (independent per-feature log-log regression) — see `IncomeAttributionChart.tsx` for the pattern.

`src/shared/ml-models.ts` + `ml-features.ts` implement the ensemble prediction model (Random Forest via `ml-random-forest` + Ridge + MLP via `@tensorflow/tfjs`). Trained models are persisted to the `mlModels` table as JSON.

Formula explanations in the UI use the `FormulaBlock` component from `FormulaHelp.tsx`. If you add analysis that the user may not intuitively understand, document the formula via `FormulaBlock` rather than a tooltip.

### Onboarding tour

`src/dashboard/tour/` configures a `driver.js`-based guided tour that walks users through every tab and key panel. Tour steps reference DOM anchors by ID (e.g. `#tour-detail-stats`) — when you remove or rename a panel, grep for its tour anchor and update `tour-config.ts` so the tour doesn't break.

### Demo mode

Many components accept a `demoMode` prop. When true, they render synthetic data from inline generators instead of querying IndexedDB so the onboarding tour can demonstrate features before the user has synced any real data. Any new component that shows analysis must honor `demoMode` if it's reachable during the tour.

## Conventions specific to this project

- **Integer fen for money.** The raw API and DB use `fen` (分). The UI converts via `useCurrency()` which also handles the 盐粒/元 toggle.
- **Store modules, not `db.table.where(...)` in components.** Keep IndexedDB queries in `src/db/*-store.ts` so they're mockable.
- **Lazy-load panels.** Dashboard panels are `React.lazy` imported to keep the initial chunk small — the build already complains about size. New heavy components (charts, ML) should follow the same pattern.
- **Date strings are ISO `YYYY-MM-DD`.** `src/shared/date-utils.ts` has the helpers; don't parse dates inline.
- **Commit messages**: no `Co-Authored-By` lines (enforced by user's global rules).
- **Prefer extending `stats.ts` over local math.** Hand-rolled statistics tend to diverge from the rest of the codebase; add to `stats.ts` with a docstring.

## Testing

Tests live under `tests/` mirroring `src/` structure. `tests/setup/chrome-mock.ts` provides `chrome.*` API stubs for service worker and message-bus tests. IndexedDB is provided by `fake-indexeddb` so Dexie stores can be exercised in unit tests without a browser.

Coverage thresholds are enforced: lines 80 / functions 60 / branches 75 / statements 80. New modules that drop coverage below these will fail `yarn test:coverage`.

## Docs

Design specs and implementation plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`. When building a non-trivial feature, look here first — many components reference their spec by date in the header.
