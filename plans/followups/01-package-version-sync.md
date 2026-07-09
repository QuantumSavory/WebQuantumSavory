# Plan 01: Synchronize frontend version metadata

## Goal

Keep the application version in `Project.toml`, `gui/package.json`, and both root-package version fields in `gui/package-lock.json` synchronized by the existing build-time script.

## Evidence

- `Project.toml` and `gui/package.json` currently report `1.4.13`.
- `gui/package-lock.json` still reports `1.4.6` at the document root and at `packages[""]`.
- `gui/scripts/sync-version.js` exits as soon as `package.json` is current, so it never inspects the lockfile.

## Scope

- Refactor `sync-version.js` just enough to update all three npm metadata fields from `Project.toml`.
- Preserve dependency resolutions and integrity hashes; this is metadata synchronization, not a dependency update.
- Add this plan to `plans/followups/01-package-version-sync.md` in the PR.

## Implementation

1. Parse and validate the root project version once.
2. Read both npm JSON files, update only version metadata that differs, and write only changed files with the existing two-space formatting and trailing newline.
3. Remove the early exit that prevents lockfile synchronization; keep logging concise and make repeated runs idempotent.
4. Fail clearly if either JSON document lacks the expected root package structure.

## Verification

- Run the sync script twice and confirm the second run leaves the worktree unchanged.
- Assert all four version reads agree: `Project.toml`, `package.json`, lockfile root, and lockfile `packages[""]`.
- Run `npm ci` and `npm run build` from `gui/`.
- Run Node syntax checks and `git diff --check`.

## Non-goals

- Do not update package versions or dependency ranges.
- Do not introduce a release framework or new npm dependency.
