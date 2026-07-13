# WebQuantumSavory GUI guide

## Scope and stack

- This file governs `gui/`. Repository-wide and Julia backend guidance is in `../AGENTS.md`.
- The frontend uses Vue 3's Composition API and `<script setup>`, plain ESM JavaScript, Vite 6, PrimeVue with the Aura theme, and MapLibre. Vitest with jsdom and Vue Test Utils covers unit/component behavior; Playwright covers browser workflows.
- `package.json` and the committed `package-lock.json` define this independent npm environment. Use `npm ci`; Vite 6 requires Node.js 18 or newer.
- No ESLint, formatter, or TypeScript build is configured. Avoid introducing repository-wide tooling for a localized change.

## Source map

- `index.html` is the editable HTML entry point. `src/main.js` loads global styles and plugins, initializes the shared API client, and mounts `App.vue`.
- `src/App.vue` is the composition root. It owns canonical reactive `projectData`, derives the minimized backend payload, wires composables, and coordinates menus, dialogs, panels, maps, logs, and result windows.
- `src/components/map/` contains the MapLibre map, node/edge/slot rendering, and entanglement overlays.
- `src/components/panels/` contains node/edge/protocol editors, the simulation runner, logs, Julia script export, and result views. Direct children of `src/components/` are project and confirmation dialogs.
- `src/components/ui/` contains shared application primitives. Dialogs compose `AppDialog`, and common actions use `AppButton`; keep application-shell dependencies out of these reusable components.
- `src/utils/projectCodec.js` is the schema boundary for empty projects, stored-project decoding/encoding, backend payloads, script-export payloads, and summaries. `src/models/ProjectStore.js` owns local-storage persistence, while `src/composables/useProjectSession.js` owns named-project transitions and session cleanup.
- `src/composables/simulationLifecycle.js` defines the pure phase reducer and capability model. `src/composables/useSimulationController.js` owns backend simulation commands, state/log/aliveness polling, and lifecycle cleanup; consumers should use its phase and capability contracts rather than reconstructing status.
- `src/composables/usePanelLayout.js` is the owner for panel visibility, collapse state, flex layout, and their storage migrations. `src/composables/uiServices.js` exposes optional application UI services to reusable components.
- `src/utils/legacyBridge.js` is the explicit compatibility boundary for retained `window.*` consumers. Do not add new global access outside that bridge.
- `src/models/` also contains the in-memory node, edge, slot, protocol, and variable objects. `src/utils/ApiConnector.js` is the singleton backend client and runtime metadata store; the remaining focused composables and utilities own import/export, node/edge operations, unsaved changes, results, layout generation, parameter compatibility, and rendering helpers.
- `src/demos/` contains importable example projects. `tests/e2e/` contains smoke tests and the serial full-workflow test.
- `tests/unit/` contains Vitest tests for codecs, storage/session invariants, API behavior, lifecycle reduction, controllers, composables, and shared Vue components. Tests use the jsdom environment and Vue Test Utils where mounting is required.
- `public/` inside this directory is source copied verbatim by Vite. The repository-root `../public/index.html`, `../public/vite.svg`, and `../public/assets/` are generated output.

## Data and lifecycle contracts

- Preserve the UI/backend lifecycle: parse the network, prepare protocols, run and poll or pause, then destroy the simulation.
- `ApiConnector` prefixes backend simulation names with the persistent eight-character `user_uuid`. Keep that namespacing consistent for every endpoint which addresses a simulation.
- Development API calls default to `http://localhost:8000`; production builds default to the browser origin. `VITE_API_BASE_URL` overrides both when a separate API host is intentional.
- Runtime API metadata supplies available background, slot, and protocol types. Protocols are grouped as `node`, `edge`, or `floating`; do not replace this with a frontend-only catalog.
- Derive protocol-variable compatibility from runtime parameter metadata and keep alias rules centralized in `src/utils/parameterTypes.js`. Opening a variable picker must not create a reference until the user explicitly selects one; keep missing or newly incompatible saved references visible so users can replace or unlink them.
- In memory, edges reference `Node` instances. Serialized projects use source and target node IDs. A project-schema change must update serialization, deserialization, import validation, demos, backend payload minimization, and relevant tests together.
- A node's position in `net.nodes` is its user-visible, 1-based simulator ID; its string `Node.id` and object identity are durable. Reorder the array in place, preserve selection/map/edge references, and re-normalize each edge so its source is the lower-index endpoint.
- Keep `description` as a top-level string in every full project serialization, normalize missing legacy descriptions to an empty string, validate its type on import, and explicitly strip it from minimized backend payloads.
- Layout generators must build replacement nodes and edges transactionally, reject generated coordinates outside longitude/latitude bounds before mutation, allocate fresh IDs for every cloned nested slot and protocol, and normalize every generated edge against the final node array before mutating the network. The repeater-chain helper creates one empty direct virtual endpoint edge by default; keep its dialog default and utility fallback aligned, and never copy a physical template's protocols onto that virtual edge.
- Star layouts retain the center, replace the isolated peripheral template, preserve its visual Web Mercator radius and first position, and suffix clones from `-1`. Graph layouts replace both isolated edge endpoints: grids name nodes `-x-y` with 1-based coordinates and use only visually orthogonal Web Mercator neighbor edges, while all-to-all layouts name nodes `-1` onward and place the selected edge's endpoints first on a deterministic counterclockwise Web Mercator circle.
- MapLibre takes marker elements out of Vue's normal DOM tree. Keep `BaseMap`'s marker-component render order stable and decoupled from simulator node order; changing that render order can make Vue move MapLibre-owned elements and abort other reactive updates.
- `App.vue` strips UI-only and read-only slot/protocol fields before sending data to the API. Do not submit saved UI state directly to the backend.
- Projects, the user UUID, panel state, and view preferences use established `localStorage` keys. Preserve keys and migration/rebuild behavior so existing projects remain readable.
- All durable project documents pass through the schema-v1 codec. Preserve schema-v0 decoding, normalize at the codec boundary without mutating imported input, and keep project-name trimming consistent across save, load, import, and storage operations.
- Switching, importing, resetting, or deleting a project must stop both polling loops, reset simulation state, close stale result windows, and remove obsolete entanglement overlays.
- Derive editing locks from lifecycle capabilities. Network and protocol editing is locked as soon as Parse produces lifecycle state and remains locked through Prepare and every later non-empty phase; do not infer this from accumulated simulation time or a legacy status object.
- Keep the Runner's Play control visible but disabled with an explanatory tooltip while the network is empty; replace it with Pause or Resume only while a simulation is running or paused.
- Existing `window.projectData`, `window.showEntangledSlots`, `window.hideSlotState`, and result-window bridges connect older map/panel code. Do not remove them without migrating all consumers.

## Component conventions

- Use tree-shakeable components from the official `@lucide/vue` package for every first-party UI icon. Choose icons for the action's meaning rather than copying the shape of a legacy glyph; do not add PrimeIcons, icon-font class strings, hand-drawn control SVGs, or Unicode symbols such as `+`, `×`, and `⋮` as icons.
- PrimeVue menu models store imported components in `lucideIcon` and render them through the `itemicon` slot with `LucideMenuIcon.vue`; customize other PrimeVue icon slots, including DataTable `sorticon`, instead of accepting non-Lucide defaults. Avoid replacing a third-party control's clean native artwork through manual DOM mounting or alignment CSS; MapLibre navigation intentionally keeps its default controls.
- Brand marks, genuine simulation/data geometry, and documented third-party defaults may keep their purpose-built artwork. Other slot status controls, loading indicators, and disclosure affordances are UI icons and must use Lucide.
- Keep `App.vue` focused on composition and orchestration. Put reusable domain behavior in a focused composable, model, or utility rather than expanding the root component further.
- Express application colors, spacing, radii, focus rings, and control dimensions through the semantic `--app-*` tokens in `src/css/style.css`. Keep PrimeVue's light Aura preset aligned with the same brand primary palette, and add a semantic token instead of scattering a new raw color through components.
- Reuse and extend `components/ui/` for application-wide dialog and button behavior. Shared primitives must remain independently mountable, explicitly declare their contracts, and avoid querying application-shell selectors.
- Declare component props and emitted events explicitly. Preserve object identity where map markers, selected items, and edge endpoint references depend on it.
- Keep the custom-function and Symbolic editor lifecycle in the shared typed-value components: protocol parameters start compact, newly selected variables start open, only successful validation collapses to static source or the rendered symbolic result, and clicking that result reopens editing. Failed validation must remain editable, and transient open/closed state must not be added to serialized parameters or variables.
- Keep States Zoo definitions in the shared `projectData.variables` array as `Symbolic` variables with tagged recipe values, while filtering them out of the ordinary Variables panel. Protocol pickers must continue to see the unified collection so a Zoo state remains assignable to compatible symbolic parameters.
- A weighted States Zoo variable owns one generated `Float64` companion: give it the deterministic ID `${state variable id}_tr`, persist its owner in `statesZooTraceSourceId`, name it `${state name}_tr`, and keep its value synchronized with the original density matrix's absolute trace as the state type or parameters change. Keep both the generated state and trace variables out of the ordinary Variables panel while retaining them in the shared collection for protocol assignment, persistence, and export, and preserve `statesZooTraceSourceId` in minimized API payloads so script export can compute both bindings together instead of embedding the cached trace. Never adopt or overwrite an unrelated variable on an ID or name collision. Remove an unreferenced owned companion when its state becomes unweighted or is deleted; block either transition while the companion is referenced. Show the companion name and value beside the weighted state with a note that this trace usually represents the success probability for heralding the state, for example during heralded entanglement generation.
- States Zoo previews are automatic: request one for a newly added or loaded row, debounce parameter and type changes by 500 ms, and reset parameters to catalog-provided `good` values when the type changes. Track a generation per row and abort obsolete requests so only the newest response can change the image, error, or busy state.
- While a States Zoo preview is pending, retain the last successful image beneath an accessible `aria-busy` overlay. Keep preview failures retryable and inline without clearing that image, and clear every pending debounce timer and abort controller when a row is deleted or the panel unmounts.
- Clean up MapLibre layers/sources/markers, DOM listeners, timers, polling, and window registrations on unmount or project changes.
- Keep the compact-viewport warning as a full-screen native dialog for viewports at or below 900px wide or 600px high. Its dismissal is intentionally in-memory for the current app mount; continue observing viewport changes and remove the media-query listener on unmount.
- Match the surrounding mixed legacy formatting in touched code; do not reformat unrelated files.
- Keep CSS changes in the existing source stylesheets or component styles. Do not patch the minified CSS emitted under `../public/assets/`.
- Prefer durable IDs, roles, or stable classes in Playwright selectors. The main workflow is intentionally serial and shares a browser page and saved project state across its cases.
- Keep log-level count badges in the Logs tab label rather than the enclosing bottom-panel header, and preserve each nonzero badge's level-specific color, accessible label, and tooltip.
- The Export Script tab is a viewer for backend-generated Julia, not a second implementation of project-to-QuantumSavory translation. Send the cleaned simulation payload plus `simulationConfig`, fetch when the tab is opened or explicitly refreshed, highlight the returned text as read-only Julia, and download exactly that text with the backend-provided safe `.jl` filename.
- Keep the bottom Tools panel anchored at its fixed bottom-left position and resize it only from its top and right boundaries. Persist validated expanded dimensions in `bottomPanel_size`, clamp them to the viewport and visible right sidebar, retain them while the panel is collapsed, and keep collapse/expand and resize controls keyboard-operable. Leave pointer resize borders visually unadorned at rest and on hover, using cursor changes as their affordance while retaining focus-visible keyboard feedback.
- Render project descriptions with the shared `markdown-it` and `@vscode/markdown-it-katex` stack. Leave raw HTML disabled, retain markdown-it's built-in safe data-image allowlist, and keep KaTeX untrusted with finite expansion and sizing limits; do not replace this path with handwritten Markdown, math, or HTML parsing. Clipboard image pastes must use that same PNG/JPEG/GIF/WebP allowlist, insert at the active textarea selection, and leave ordinary text paste behavior native.

## Commands and verification

Run frontend commands from `gui/`:

```sh
npm ci
npm run dev
npm run test:unit
npm run test:unit:watch
npm run build
npx playwright install chromium
npm test
npm run test:headed
```

- `npm run dev` starts Vite at `http://localhost:5173`; it does not start the backend.
- `npm run test:unit` runs the Vitest suite once in jsdom; `npm run test:unit:watch` keeps it active for local iteration.
- `npm run build` synchronizes `package.json`'s version from the root `Project.toml`, cleans the generated asset directory, and writes the production bundle to `../public/`.
- `npm test` and `npm run test:headless` run all Playwright specs headlessly in Chromium. Playwright starts Vite but expects the backend to already be available at `http://localhost:8000`.
- `npm run test:headed` runs the Chromium suite with a visible browser for local debugging. On a host without an attached display, run it under Xvfb: `xvfb-run -a npm run test:headed`.
- CI provisions Node.js 24. The repository-root `ci/frontend-build.sh` installs dependencies, runs `npm run test:unit`, and then runs the production build; backend integration and `ci/browser.sh` reuse that entry point. GitHub Actions and Buildkite install Chromium's Linux packages during the browser job; Buildkite's remaining host requirements are described in `../README.md`.

Minimum checks:

- Composables, utilities, codecs, storage/session logic, lifecycle logic, or shared `components/ui/` changes: `npm run test:unit` plus the relevant focused Vitest files while iterating.
- Frontend source, styles, or build changes: `npm run build`; run `npm run test:unit` as well when shared behavior is affected.
- Icon changes: run `tests/e2e/lucide-icons.spec.js` in Chromium in addition to the build.
- UI behavior or API-flow changes: build, then the relevant Chromium Playwright specs with the backend running.
- Backend/frontend contract changes: backend integration tests plus the affected Playwright workflow.

## Generated files

- Never edit or commit `../public/index.html`, `../public/vite.svg`, or `../public/assets/`; the server launcher regenerates them on every start.
- Never commit `node_modules/`, `test-results/`, or `playwright-report/`.
- Keep `package-lock.json` committed and synchronized with dependency changes. Use `npm install` only when intentionally updating dependencies or the lockfile, then return to `npm ci` for verification.
- Treat `gui/public/` as editable static source and repository-root `public/` as a mixed directory: Vite output is ignored, while unrelated backend static files remain tracked.
