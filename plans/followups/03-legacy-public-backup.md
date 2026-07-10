# Plan 03: Remove the legacy public backup scaffold

## Goal

Delete the unreferenced `public/_BAK/` Genie starter assets while preserving current backend static files and generated GUI behavior.

## Evidence

- `public/_BAK/` contains starter error pages, images, fonts, CSS, and JavaScript retained as a backup.
- Repository searches and the active root route do not reference `_BAK` paths.
- Current Vite output is generated separately from `gui/`; `public/robots.txt` and `public/.gitkeep` are unrelated and must remain.

## Scope

- Prove the backup directory is unreachable from source/configuration, then remove only `public/_BAK/`.
- Update documentation only if a live reference is found.
- Add this plan to `plans/followups/03-legacy-public-backup.md`.

## Implementation

1. Search routes, Genie configuration, docs, and tests for `_BAK` and the starter filenames.
2. Delete the tracked backup tree.
3. Confirm the Vite cleaner and build still preserve non-generated files in `public/`.

## Verification

- Run `npm run build` and confirm `public/index.html` and assets are regenerated.
- Start the server and verify `/status`, `/`, and one generated asset return 200.
- Confirm `public/robots.txt` remains tracked and no `_BAK` file remains tracked.
- Run `git diff --check`.

## Non-goals

- Do not remove `public/robots.txt`, `public/.gitkeep`, `_docs_/`, or `_tests_/`.
- Do not redesign error handling or add replacement static pages without evidence they are needed.
