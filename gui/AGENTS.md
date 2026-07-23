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
- Keep the Export Script panel's warning concise while noting that UI
  automation can make generated source more boilerplate-heavy than a bespoke
  simulation.
- `src/components/tags/` contains the reusable metadata-driven tag/query constructor, Register/All slots target selector, structured results list, and the composed Tags & Queries tools panel. `TagBadgeSequence.vue` owns the shared editable/read-only wrapping badge sequence; `src/composables/useTagExplorer.js` owns catalog loading, abortable requests, mutation refreshes, and transient runtime state.
- `src/components/ui/` contains shared application primitives. Dialogs compose `AppDialog`, and common actions use `AppButton`; keep application-shell dependencies out of these reusable components.
- `src/components/ui/MarkdownContent.vue` owns shared safe read-only Markdown/KaTeX rendering and presentation. `MarkdownEditor.vue` composes it with the edit and clipboard-image lifecycle used by project descriptions and selected annotations; every editor instance must have unique accessible editor/help IDs.
- `src/utils/markdown.js` owns the configured safe Markdown/KaTeX renderer shared by descriptions and tooltips; `src/directives/markdownTooltip.js` wraps PrimeVue's directive while preserving its behavioral binding options and reactivity.
- `config/changelogContent.js` reads the repository `CHANGELOG.md` for the dedicated Vite/Vitest compile-time define; `src/utils/changelogContent.js` is the browser accessor. Keep System Information release notes build-time, read-only, and on the shared `MarkdownContent` pipeline without broadening Vite's development filesystem allowlist. Tests for the current release heading must derive it from the frontend build information or package lock rather than hard-coding a version; historical-entry assertions may name past releases.
- `src/utils/pngWatermark.js` is the sole browser compositing boundary for server-generated
  protocol, slot-state, and States Zoo PNGs. Route every new generated PNG surface through it
  and never expose unwatermarked bytes as a failure fallback.
- `src/utils/projectCodec.js` is the schema boundary for empty projects, stored-project decoding/encoding, backend payloads, script-export payloads, and summaries. `src/models/ProjectStore.js` owns local-storage persistence, while `src/composables/useProjectSession.js` owns named-project transitions and session cleanup.
- `src/composables/simulationLifecycle.js` defines the pure phase reducer and capability model. `src/composables/useSimulationController.js` owns backend simulation commands, state/log/aliveness polling, and lifecycle cleanup; consumers should use its phase and capability contracts rather than reconstructing status.
- `src/utils/logRecords.js` owns log severity, source, and simulator-group normalization plus record comparison semantics. `LogsPanel` owns only transient filter and disclosure state and presentation.
- `src/composables/usePanelLayout.js` is the owner for panel visibility, collapse state, flex layout, and their storage migrations. `src/composables/uiServices.js` exposes optional application UI services to reusable components.
- `src/utils/mapLayers.js` owns MapLibre edge/annotation source and layer IDs plus ordering predicates. `src/composables/useMaplibreMarker.js` owns shared Vue/MapLibre marker attachment, aria-label restoration, drag wiring, position access, and cleanup.
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
- A protocol parameter is a named-tag-type field only when its current runtime constructor metadata has `kind: "named_tag_type"`; never infer that semantic from a saved `type` snapshot or parse a Julia type string. Populate these fields from the cached `/tag_types` `named_tags` catalog, persist only fully qualified IDs, honor runtime `nullable`, and keep variable assignment unavailable until variables have an explicit compatible tag-type model. Nonnullable fields use the outer Default/Tag selector; nullable fields use Default/Nothing/Tag. Mount the named-tag autocomplete without its own Default only while Tag is selected.
- Build every editable protocol parameter, background parameter, and Variable from explicit input
  descriptors with `{ id, label, inputKind, wireType, enabled }`.
  The outer selector always begins with Default, including singleton, Function,
  Symbolic, Bool, intrinsic, and named-tag fields. `selectedType` stores the
  descriptor ID, while minimized payloads use `wireType`; unsupported
  descriptors remain visible and disabled.
- Default clears the value and omits the constructor keyword. A fresh explicit
  literal, code, or tag mode is empty and may commit only after validation;
  explicit Bool means `false`, and Nothing/Wildcard are intrinsic. Function
  exposes Predefined Function and Custom Function directly with no nested
  Default, and named-tag autocomplete does not own constructor-default state.
  Switching modes clears both the old value and transient validation state.
- Persist numeric expressions only as
  `{ kind: "numeric_expression", source: "<Julia source>" }`, while preserving
  semantic variable/parameter type `Float64` or `Int64`. Keep preview results,
  validation errors, abort controllers, node maps, placement, and physical
  context outside project data. Expression Variable edits are draft-local and
  commit atomically only after complete validation.
- Use `parameter.error` as the shared submission blocker for dirty, blank,
  pending, disabled, missing-context, transport, backend, bounds, and code
  validation failures. Keep source/result/deferred/pending/request state local
  to the input; a linked Variable validates against the constructor parameter and
  must never write errors or preview state to the shared Variable. Preserve a
  recognized explicit `selectedType` even when its value is empty, and let the
  descriptor completeness validator reject it instead of normalizing it to
  Default. Repeater validation and generation must call the same constructor
  draft validator before cloning.
- Register the same strict tagged-value and descriptor-ID rules at the shared
  `DesignCommandService` boundary so GUI and MCP edits cannot diverge. MCP
  transports source data; it does not evaluate expressions or own preview
  state.
- Tag definitions, signatures, previews, listings, and query results are runtime-only API metadata. Do not persist them in project JSON or poll them in the background; fetch on Tags & Queries activation, target changes, explicit refresh, and successful mutation, and clear transient targets/results on project changes or simulation reset.
- Derive protocol/background-variable compatibility from runtime parameter metadata and keep alias rules centralized in `src/utils/parameterTypes.js`. Opening a variable picker must not create a reference until the user explicitly selects one; keep missing or newly incompatible saved references visible so users can replace or unlink them.
- In memory, edges reference `Node` instances. Serialized projects use source and target node IDs. A project-schema change must update serialization, deserialization, import validation, demos, backend payload minimization, and relevant tests together.
- Schema-v1 physical project data consists of `net.physicalConfig.refractiveIndex` (default `1.468`) and `net.physicalConfig.lossDbPerKm` (default `0.2`) plus, on physical edges only, ordered `data.curvePoints` and nullable `data.physicalOverrides`. Curve points have durable IDs, map positions, and `smooth`/`sharp` types; overrides contain nullable distance, refractive-index, delay, loss, and transmissivity fields. Persist overrides rather than derived values; minimized simulator/export payloads emit resolved `data.distanceMeters`, `data.propagationDelaySeconds`, `data.refractiveIndex`, `data.lossDbPerKm`, and `data.transmissivity`, while virtual-edge protocol metadata carries none of those physical fields.
- Keep physical descriptors, unit metadata, defaults, validation, formatting, override/resolved field lists, and explicit propagation/transmissivity formulas in `src/utils/physicalParameters.js`. Use `src/utils/edgeGeometry.js` only as the geometry adapter for sampled GeoJSON LineStrings, geodesic length, midpoint, and projection, delegating quantity resolution to the physical-parameter module. Finalize every physical route by geodesically densifying each endpoint/Bézier guide leg to at most 100 km, transiently unwrapping adjacent antimeridian longitudes, and deriving drawing, distance, and midpoint from that one LineString. Curve mode controls handle visibility and editing only; stored handles always shape the finalized physical route. Keep virtual and temporary links as projected two-point straight lines. Do not leak `bezier-js` objects into Vue state or project documents, and never treat projected Cartesian Bézier length as physical distance.
- Keep durable node and curve-point coordinates in the one canonical Web Mercator world defined by `src/utils/mapCoordinates.js`. MapLibre marker longitudes may differ by multiples of 360 on displayed world copies; remove only the drag-start display offset, render node drags through ephemeral edge-position overrides, and let the shared edge-geometry validator reject and roll back any move that leaves the supported world or produces a nonfinite/nonconvergent route before a design command commits.
- A node's position in `net.nodes` is its user-visible, 1-based simulator ID; its string `Node.id` and object identity are durable. Reorder the array in place, preserve selection/map/edge references, and re-normalize each edge so its source is the lower-index endpoint.
- Keep `description` as a top-level string in every full project serialization, normalize missing legacy descriptions to an empty string, validate its type on import, and explicitly strip it from minimized backend payloads.
- Keep `annotations` as a top-level array in schema-v1 project serialization, normalize missing legacy annotations to `[]`, validate and clone them without mutating imports, and explicitly strip them from simulator and script-export payloads. Annotation records contain a durable unique ID, Markdown string, canonical geographic bounds, six-digit background/border colors, and an optional area stored only as `{ "freeCorner": [longitude, latitude] }`; attachment edges and derived area bounds are not persisted.
- Use `src/utils/annotationGeometry.js` as the sole annotation geometry and validation adapter. Keep strict validation and cloning at codec/import boundaries; interactive rendering and drag helpers must canonicalize world-wrapped coordinates or fail soft. Annotation map interactions mutate the selected object in place from pure helper results, enforce the shared minimum visible size, choose an attached area's edge from the free corner's displacement normalized to the annotation dimensions, always share a positive edge segment rather than one corner, expand across the full edge when the selection extends beyond the annotation along the tangent axis, and retain the independent free corner when the annotation moves or resizes.
- Layout generators must build replacement nodes and edges transactionally, reject generated coordinates outside longitude/latitude bounds before mutation, allocate fresh IDs for every cloned nested slot and protocol, and normalize every generated edge against the final node array before mutating the network. The repeater-chain helper creates one empty direct virtual endpoint edge by default; keep its dialog default and utility fallback aligned, and never copy a physical template's protocols onto that virtual edge.
- New and generated physical links start straight. Generated clones clear route, distance, delay, and transmissivity overrides while retaining only template material overrides (`refractiveIndex` and `lossDbPerKm`). Virtual links stay straight and expose no physical controls, curve handles, or badges. Reject a second physical link for the same unordered endpoint pair because the backend graph cannot represent it.
- Repeater protocol replacement is always opt-in. Seed each enabled constructor from the first matching selected template protocol or from runtime protocol metadata, then allocate a fresh ID and independent parameter graph for every destination. Remove only the targeted protocol type and preserve every unrelated protocol; tracker replacement covers the generated repeaters and both endpoints. Assign an edge protocol to virtual chain edges only when its runtime definition has `virtual === true`, and keep the direct endpoint virtual edge empty.
- Keep generated repeaters as one contiguous, increasing simulator-ID block at the template position without reordering either endpoint or unrelated nodes. Generated SwapperProt predicates must resolve endpoints and binary-tree boundaries through safely escaped node names rather than assuming endpoint order.
- Star layouts retain the center, replace the isolated peripheral template, preserve its visual Web Mercator radius and first position, and suffix clones from `-1`. Graph layouts replace both isolated edge endpoints: grids name nodes `-x-y` with 1-based coordinates and use only visually orthogonal Web Mercator neighbor edges, while all-to-all layouts name nodes `-1` onward and place the selected edge's endpoints first on a deterministic counterclockwise Web Mercator circle.
- MapLibre takes marker elements out of Vue's normal DOM tree. Keep `BaseMap`'s marker-component render order stable and decoupled from simulator node order; changing that render order can make Vue move MapLibre-owned elements and abort other reactive updates.
- `App.vue` strips UI-only and read-only slot/protocol fields before sending data to the API. Do not submit saved UI state directly to the backend.
- Store the global Qubit and Qumode representation defaults as `qubitRepresentation` and `qumodeRepresentation` in `simulationConfig`. Keep option allowlists, legacy `QuantumOpticsRepr` defaults, storage normalization, simulator payloads, and script-export payloads centralized through `src/utils/representations.js` and `projectCodec.js`; do not revive the unused per-slot `representationType` field.
- `src/domain/design/DesignCommandService.js` is the transport-neutral
  authoring boundary. GUI controls and the optional MCP bridge must dispatch
  its registered operations; keep editing semantics out of Vue presentation
  and out of `src/features/mcp/`.
- Treat `design.update.value.physicalConfig` as a validated, nonempty partial
  update over the descriptor-backed global physical fields. Keep the MCP
  schema synchronized and reject unknown, nonfinite, or out-of-range fields.
- `src/features/mcp/` owns only capability-gated control, browser binding,
  canonical snapshot synchronization, activity presentation, and relaying
  lifecycle actions through the existing simulation controller. It must not
  mutate `projectData` or call simulation API endpoints directly.
- Projects, the user UUID, panel state, and view preferences use established `localStorage` keys. Preserve keys and migration/rebuild behavior so existing projects remain readable.
- All durable project documents pass through the schema-v1 codec. Preserve schema-v0 decoding, normalize at the codec boundary without mutating imported input, and keep project-name trimming consistent across save, load, import, and storage operations.
- Switching, importing, resetting, or deleting a project must stop both polling loops, reset simulation state, close stale result windows, and remove obsolete entanglement overlays.
- Enable the Tags & Queries tools only while the backend retains a live parsed `RegisterNet`: parsed, prepared, running, paused, completed, and recoverable-error phases are eligible, while empty/reset, execution-timeout, blocked, and purged states must disable and clear the tool.
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
- Keep the custom-function and Symbolic editor lifecycle in the shared typed-value components: protocol parameters start compact, newly selected variables start open, only successful validation collapses to static source or the rendered symbolic result, and clicking that result reopens editing. Failed validation must remain editable, with a warning whose tooltip contains the backend diagnostic; transient open/closed state must not be added to serialized parameters or variables.
- Keep protocol and background constructor parameters in the shared metadata-backed constructor form, with thin catalog adapters for their `name` and `field` identities. Use it in ordinary slots, protocol editors, Layout Tools, and node add-many/batch drafts; union selection, validation, variable binding, metadata documentation, and contextual `self`/`nodeid` behavior must not be reimplemented in those dialogs. Installed backgrounds receive their concrete node context. Layout templates validate direct expressions with representative node context, defer linked expressions, and revalidate every cloned background against its newly created node before committing the transaction.
- Keep custom-function contextual-keyword help centralized in `src/utils/customFunctionContext.js` and render its compact, viewport-safe helper popup from the Nodes list and the shared custom-function editor so protocol and Variables-tab Lambdas stay aligned. `nodeid("Node name")` is available for every protocol placement and `self` only for node protocols. Edge protocols also receive `distance` (meters), `delay` (seconds), dimensionless `refractive_index`, `loss` (dB/km), zero-through-one dimensionless `transmissivity`, and one-based source/target `node_a`/`node_b`; virtual-edge physical values are `nothing`. The edge-distance binding is named `distance` (not `length`), so the `length` function stays callable. Manual transmissivity keeps numeric loss available in protocol context. These are backend-provided lexical bindings, so never serialize contextual values or node-name maps in stored project data.
- Reuse that context catalog and source lifecycle for numeric expressions.
  Context-free Variable expressions show a validation result; contextual
  Variables defer without a value and show “Evaluated when assigned.” Direct
  template/layout expressions show the representative result plus
  “Representative result; evaluated again when assigned”; linked templates
  suppress that representative value while retaining the deferred status.
  Ordinary installed protocols and backgrounds build one concrete preview context from
  canonical project state and pass it explicitly; invalidate or abort stale
  previews whenever source, target, placement, node ordering/names, endpoints,
  or physical-edge values change. Edge context binds the physical distance as
  `distance` (not `length`), so the `length` function stays callable in every
  placement.
- Variable dependency detection is backend-owned Julia lowering and may expand
  macros only while unsafe evaluation is enabled. Generated-script export is
  parse-only and must not lower, macro-expand, or execute numeric source in the
  server.
- Direct numeric expressions show their source and actual cast result. Linked
  expression Variables show the source and their concrete assignment result
  below the variable picker. Keep saved source visible when unsafe evaluation
  is disabled, but disable validation/execution and leave numeric literals
  available. Variable reference discovery covers protocol and background
  parameters on both installed and template slots, so deletion remains blocked
  until every assignment is unlinked.
- Build tag/query forms from the `/tag_types` catalog rather than hard-coded tag shapes. Commit the progressive identity combobox only on Enter or an autocomplete choice; treat a leading `:` as a Symbol head, resolve DataType heads only through unique catalog matches, reveal named fields together, and narrow general-field choices by compatible signature prefixes. Allow only last-field backtracking for general tags, require a complete signature before submission, filter DataType signatures by `allowed_data_type_ids`, and keep query Exact, Wildcard, preset Predicate, and policy-gated shared custom Function modes in the same badge flow.
- Use the shared tag badge sequence for editable constructors and read-only results. Keep the identity badge first, field name/value/type labels together, established type and query-mode colors intact, and every badge documented with a Markdown tooltip; editable badges use white fills with colored borders while read-only badges use soft fills. Keep collapsed results to badges and actions, placing rendered text, string tag/slot IDs, time, message source, and buffer depth behind disclosure when available.
- In Tags & Queries, Register targets always show a Slot selector whose first choice is All slots; that choice maps to the register wire target, while a concrete slot maps to the slot wire target. Message Buffer remains node-scoped with no slot selector. Hide attachment construction for Register → All slots, show it for a selected slot or Message Buffer, keep queries non-consuming for either register scope, and stack construction above results in both tabs.
- Send the existing `node`/`edge`/`floating` protocol category only with transient Custom Function validation requests so eager curried expressions receive representative context without adding placement data to projects or simulator payloads. Variables use the transient `variable` validation placement, which exposes the node-and-edge superset because their eventual assignments are deferred.
- Keep States Zoo definitions in the shared `projectData.variables` array as `Symbolic` variables with tagged recipe values, while filtering them out of the ordinary Variables panel. Protocol pickers must continue to see the unified collection so a Zoo state remains assignable to compatible symbolic parameters.
- A weighted States Zoo variable owns one generated `Float64` companion: give it the deterministic ID `${state variable id}_tr`, persist its owner in `statesZooTraceSourceId`, name it `${state name}_tr`, and keep its value synchronized with the original density matrix's absolute trace as the state type or parameters change. Keep both the generated state and trace variables out of the ordinary Variables panel while retaining them in the shared collection for protocol assignment, persistence, and export, and preserve `statesZooTraceSourceId` in minimized API payloads so script export can compute both bindings together instead of embedding the cached trace. Never adopt or overwrite an unrelated variable on an ID or name collision. Remove an unreferenced owned companion when its state becomes unweighted or is deleted; block either transition while the companion is referenced. Show the companion name and value beside the weighted state with a note that this trace usually represents the success probability for heralding the state, for example during heralded entanglement generation.
- States Zoo previews are automatic: request one for a newly added or loaded row, debounce parameter and type changes by 500 ms, and reset parameters to catalog-provided `good` values when the type changes. Track a generation per row and abort obsolete requests so only the newest response can change the image, error, or busy state.
- While a States Zoo preview is pending, retain the last successful image beneath an accessible `aria-busy` overlay. Keep preview failures retryable and inline without clearing that image, and clear every pending debounce timer and abort controller when a row is deleted or the panel unmounts.
- Clean up MapLibre layers/sources/markers, DOM listeners, timers, polling, and window registrations on unmount or project changes.
- Render global and per-edge quantities through the reusable descriptor/unit-driven `QuantityField` presentation and generic cascaded `quantity-field` classes, using only semantic `--app-*` CSS tokens; do not add loss- or transmissivity-specific styling. Physical badges are session-only, default on, ignore pointer input, remain limited to distance above delay, and use the Turf half-length point. A manual delay hides distance and reports distance/refractive index as `n/a` without deleting dormant overrides, but does not affect transmissivity. A manual transmissivity reports loss as `n/a` without deleting its global/per-edge value; reset restores automatic `10^(-(lossDbPerKm * distanceMeters / 1000) / 10)` calculation. Physical resolution retains dormant numeric material/link values for backend context. Curve handles appear only for a selected, unlocked physical edge while curve mode is active; new handles are smooth and clicks cycle smooth → sharp → delete.
- Map annotations remain editable in every simulation phase because they are frontend-only. Use the shared map-layer helpers to keep each area below its annotation, annotations in project order, and all annotation geometry above the basemap but before every edge layer. Render areas through the existing rectangle layer and their free corners through the existing resize-handle component, retaining their semantic `--app-*` token styling instead of adding parallel area-specific CSS. Keep HTML-marker stacking on the `--app-z-map-*` tokens, with the transparent Markdown overlay below handles and nodes; clean up all annotation layers, sources, markers, map listeners, and pointer listeners on removal, project changes, and unmount.
- Keep the compact-viewport warning as a full-screen native dialog for viewports at or below 900px wide or 600px high. Its dismissal is intentionally in-memory for the current app mount; continue observing viewport changes and remove the media-query listener on unmount.
- Match the surrounding mixed legacy formatting in touched code; do not reformat unrelated files.
- Keep CSS changes in the existing source stylesheets or component styles. Do not patch the minified CSS emitted under `../public/assets/`.
- Prefer durable IDs, roles, or stable classes in Playwright selectors. The main workflow is intentionally serial and shares a browser page and saved project state across its cases.
- Keep log-level count badges in the Logs tab label rather than the enclosing bottom-panel header, and preserve each nonzero badge's level-specific color, accessible label, and tooltip. Keep severity and normalized App/Web API/Simulator source filters local to the Logs panel. Populate Simulator group choices from the backend `simulation_log_groups` catalog, preserve each record's `group` in Raw JSON and search, and apply group toggles only to grouped Simulator records so ungrouped WebQuantumSavory panic and lifecycle events remain controlled by severity and source.
- The Export Script tab is a viewer for backend-generated Julia, not a second implementation of project-to-QuantumSavory translation. Send the cleaned simulation payload plus `simulationConfig`, fetch when the tab is opened or explicitly refreshed, highlight the returned text as read-only Julia, and download exactly that text with the backend-provided safe `.jl` filename.
- Keep the bottom Tools panel anchored at its fixed bottom-left position and resize it only from its top and right boundaries. Persist validated expanded dimensions in `bottomPanel_size`, clamp them to the viewport and visible right sidebar, retain them while the panel is collapsed, and keep collapse/expand and resize controls keyboard-operable. Leave pointer resize borders visually unadorned at rest and on hover, using cursor changes as their affordance while retaining focus-visible keyboard feedback.
- Keep the simulation sidebar anchored at its fixed right offset and resize it only from its left boundary. Persist its validated width in `rightSidebar_width`, preserve its minimum width, reserve the main panel's minimum width when the viewport can fit both, preserve the sidebar width while hidden, and keep both pointer and keyboard resizing available. Drive the sidebar and its external collapse control from the shared `--app-shell-sidebar-width` token so shell geometry stays synchronized.
- Render project descriptions, the embedded repository changelog, and all PrimeVue `v-tooltip` values with the shared `markdown-it` and `@vscode/markdown-it-katex` stack. Leave raw HTML disabled, retain markdown-it's built-in safe data-image allowlist, and keep KaTeX untrusted with finite expansion and sizing limits; do not replace this path with handwritten Markdown, math, or HTML parsing. Preserve tooltip placement/focus modifiers plus delay, class, disabled, auto-hide, sizing, ID, and pass-through options; express backend diagnostics as Markdown code blocks and leave native `title` attributes as plain browser text. Clipboard image pastes must use that same PNG/JPEG/GIF/WebP allowlist, insert at the active textarea selection, and leave ordinary text paste behavior native.

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
