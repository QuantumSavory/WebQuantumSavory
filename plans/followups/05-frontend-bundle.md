# Plan 05: Reduce the oversized frontend bundle

## Goal

Materially improve the production bundle shape and initial-load cost without changing GUI behavior or adding a complex build framework.

## Evidence

- The current Vite build emits a roughly 3 MB JavaScript entry chunk and triggers the 500 kB chunk warning.
- Heavy candidates include map rendering, syntax highlighting, mathematical rendering, JSON viewing, and UI libraries.

## Scope

- Measure the bundle before changing it, identify actual module contributors, and apply the smallest maintainable lazy-loading or dependency cleanup that improves initial delivery.
- Add this plan to `plans/followups/05-frontend-bundle.md` and report before/after raw and gzip sizes.

## Implementation

1. Produce a reproducible baseline from Vite/Rollup output; use a temporary analyzer only if it does not become a runtime dependency.
2. Verify usage of large direct dependencies and remove only those proven unused.
3. Prefer dynamic imports for genuinely optional UI such as result/code/math viewers. Use manual chunks only where it improves caching and does not merely hide the warning.
4. Preserve current component contracts, loading states, styles, and production API-base behavior.
5. Keep configuration legible and avoid an arbitrary web of vendor chunk rules.

## Verification

- Run `npm ci` and `npm run build`; capture entry/chunk and gzip sizes before and after.
- Confirm the main entry no longer triggers the oversized-entry warning, or explain a remaining irreducible map/application core.
- Run Playwright smoke and the applicable workflow steps for every lazily loaded feature touched.
- Run `git diff --check` and confirm generated `public/` output remains ignored.

## Non-goals

- Do not rewrite the component architecture or replace major UI/map libraries.
- Do not optimize only for the warning threshold without a measurable loading/caching benefit.
