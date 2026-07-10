# Plan 02: Make Playwright execution modes truthful

## Goal

Make the default and `test:headless` commands genuinely headless while keeping an explicit, reliable headed command for local debugging.

## Evidence

- `gui/playwright.config.js` forces `launchOptions.headless = false` globally.
- `test:headless` currently invokes the same forced-headed configuration.
- Headless hosts therefore need Xvfb even for commands labeled headless.

## Scope

- Normalize the npm scripts and Playwright defaults without changing test coverage or browser selection unexpectedly.
- Update `gui/README.md` and `gui/AGENTS.md` to describe the real commands.
- Add this plan to `plans/followups/02-playwright-modes.md`.

## Implementation

1. Make the checked-in default configuration headless.
2. Keep `npm test` and `test:headless` scoped to Chromium, matching the current primary suite.
3. Make `test:headed` opt into headed Chromium explicitly; retain the existing viewport/window sizing only where it is meaningful.
4. Remove documentation that requires Xvfb for ordinary headless runs; document Xvfb as an option for headed runs on displayless machines.

## Verification

- Run the two smoke specs with the default command and confirm no display server is required.
- Run the same smoke specs with `test:headless`.
- Run the headed smoke command under Xvfb.
- Run `npm run build`, JSON/Node syntax checks, and `git diff --check`.
- Record the known pause/resume full-suite failure without changing it in this PR.

## Non-goals

- Do not repair simulation pause/resume behavior here.
- Do not add more browsers or change the serial workflow structure.
