# WebQuantumSavory GUI guide

## Scope and stack

- This file governs `gui/`. Repository-wide and Julia backend guidance is in `../AGENTS.md`.
- The frontend uses Vue 3's Composition API and `<script setup>`, plain ESM JavaScript, Vite 6, PrimeVue with the Aura theme, MapLibre, and Playwright.
- `package.json` and the committed `package-lock.json` define this independent npm environment. Use `npm ci`; Vite 6 requires Node.js 18 or newer.
- No ESLint, formatter, TypeScript build, or frontend unit-test runner is configured. Avoid introducing repository-wide tooling for a localized change.

## Source map

- `index.html` is the editable HTML entry point. `src/main.js` loads global styles and plugins, initializes the shared API client, and mounts `App.vue`.
- `src/App.vue` is the composition root. It owns canonical reactive `projectData`, derives the minimized backend payload, wires composables, and coordinates menus, dialogs, panels, maps, logs, and result windows.
- `src/components/map/` contains the MapLibre map, node/edge/slot rendering, and entanglement overlays.
- `src/components/panels/` contains node/edge/protocol editors, the simulation runner, logs, and result views. Direct children of `src/components/` are project and confirmation dialogs.
- `src/composables/` separates project management, import/export, simulation control, polling, panel layout, unsaved-change handling, and result-window state.
- `src/models/` contains the in-memory node, edge, slot, and protocol objects plus the local-storage `ProjectStore`.
- `src/utils/ApiConnector.js` is the singleton backend client and runtime metadata store. Other utilities contain project validation/serialization, backend log conversion, and map/window helpers.
- `src/demos/` contains importable example projects. `tests/e2e/` contains smoke tests and the serial full-workflow test.
- `public/` inside this directory is source copied verbatim by Vite. The repository-root `../public/index.html`, `../public/vite.svg`, and `../public/assets/` are generated output.

## Data and lifecycle contracts

- Preserve the UI/backend lifecycle: parse the network, prepare protocols, run and poll or pause, then destroy the simulation.
- `ApiConnector` prefixes backend simulation names with the persistent eight-character `user_uuid`. Keep that namespacing consistent for every endpoint which addresses a simulation.
- Development API calls default to `http://localhost:8000`; production builds default to the browser origin. `VITE_API_BASE_URL` overrides both when a separate API host is intentional.
- Runtime API metadata supplies available background, slot, and protocol types. Protocols are grouped as `node`, `edge`, or `floating`; do not replace this with a frontend-only catalog.
- In memory, edges reference `Node` instances. Serialized projects use source and target node IDs. A project-schema change must update serialization, deserialization, import validation, demos, backend payload minimization, and relevant tests together.
- A node's position in `net.nodes` is its user-visible, 1-based simulator ID; its string `Node.id` and object identity are durable. Reorder the array in place, preserve selection/map/edge references, and re-normalize each edge so its source is the lower-index endpoint.
- MapLibre takes marker elements out of Vue's normal DOM tree. Keep `BaseMap`'s marker-component render order stable and decoupled from simulator node order; changing that render order can make Vue move MapLibre-owned elements and abort other reactive updates.
- `App.vue` strips UI-only and read-only slot/protocol fields before sending data to the API. Do not submit saved UI state directly to the backend.
- Projects, the user UUID, panel state, and view preferences use established `localStorage` keys. Preserve keys and migration/rebuild behavior so existing projects remain readable.
- Switching, importing, resetting, or deleting a project must stop both polling loops, reset simulation state, close stale result windows, and remove obsolete entanglement overlays.
- Existing `window.projectData`, `window.showEntangledSlots`, `window.hideSlotState`, and result-window bridges connect older map/panel code. Do not remove them without migrating all consumers.

## Component conventions

- Keep `App.vue` focused on composition and orchestration. Put reusable domain behavior in a focused composable, model, or utility rather than expanding the root component further.
- Declare component props and emitted events explicitly. Preserve object identity where map markers, selected items, and edge endpoint references depend on it.
- Clean up MapLibre layers/sources/markers, DOM listeners, timers, polling, and window registrations on unmount or project changes.
- Match the surrounding mixed legacy formatting in touched code; do not reformat unrelated files.
- Keep CSS changes in the existing source stylesheets or component styles. Do not patch the minified CSS emitted under `../public/assets/`.
- Prefer durable IDs, roles, or stable classes in Playwright selectors. The main workflow is intentionally serial and shares a browser page and saved project state across its cases.

## Commands and verification

Run frontend commands from `gui/`:

```sh
npm ci
npm run dev
npm run build
npx playwright install chromium
npm test
npm run test:headed
```

- `npm run dev` starts Vite at `http://localhost:5173`; it does not start the backend.
- `npm run build` synchronizes `package.json`'s version from the root `Project.toml`, cleans the generated asset directory, and writes the production bundle to `../public/`.
- `npm test` and `npm run test:headless` run all Playwright specs headlessly in Chromium. Playwright starts Vite but expects the backend to already be available at `http://localhost:8000`.
- `npm run test:headed` runs the Chromium suite with a visible browser for local debugging. On a host without an attached display, run it under Xvfb: `xvfb-run -a npm run test:headed`.
- CI provisions Node.js 24 and uses the repository-root `ci/browser.sh` entry point. GitHub Actions and Buildkite install Chromium's Linux packages during the browser job; Buildkite's remaining host requirements are described in `../README.md`.

Minimum checks:

- Frontend source, styles, or build changes: `npm run build`.
- UI behavior or API-flow changes: build, then the relevant Chromium Playwright specs with the backend running.
- Backend/frontend contract changes: backend integration tests plus the affected Playwright workflow.

## Generated files

- Never edit or commit `../public/index.html`, `../public/vite.svg`, or `../public/assets/`; the server launcher regenerates them on every start.
- Never commit `node_modules/`, `test-results/`, or `playwright-report/`.
- Keep `package-lock.json` committed and synchronized with dependency changes. Use `npm install` only when intentionally updating dependencies or the lockfile, then return to `npm ci` for verification.
- Treat `gui/public/` as editable static source and repository-root `public/` as a mixed directory: Vite output is ignored, while unrelated backend static files remain tracked.
