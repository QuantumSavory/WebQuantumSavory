# Plan 04: Resolve actionable npm audit findings

## Goal

Reduce the frontend production and development vulnerability report using the smallest compatible dependency updates, with every residual finding documented.

## Evidence

- A clean `npm ci` currently reports four moderate and two high findings locally.
- The previous PR intentionally deferred dependency churn.

## Scope

- Capture a machine-readable baseline with `npm audit --json` and distinguish production from development-only paths.
- Update only direct dependencies or lockfile resolutions needed to remove actionable findings.
- Add this plan to `plans/followups/04-npm-audit.md` and record before/after counts in the PR.

## Implementation

1. Trace each advisory to its direct dependency and consult authoritative package release/security notes.
2. Prefer compatible patch/minor updates. Do not use `npm audit fix --force` or accept a major migration without a specific compatibility review.
3. Remove a dependency only if repository-wide usage analysis proves it unused.
4. Regenerate `package-lock.json` deterministically and keep package metadata synchronized.
5. If a finding has no safe compatible fix, leave it in place and document the exact dependency path and mitigation.

## Verification

- Run `npm ci`, production-only audit, and full audit; compare results to the baseline.
- Run `npm run build`.
- Run Playwright smoke tests headlessly with the backend available where required.
- Run Node/JSON syntax checks and `git diff --check`.

## Non-goals

- Do not combine bundle optimization or broad dependency modernization with the security update.
- Do not suppress audit failures without a documented reason.
