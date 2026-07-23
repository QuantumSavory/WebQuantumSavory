# WebQuantumSavory backend guide

## Scope and project boundary

- This repository is the WebQuantumSavory application. The root is the Julia/Genie API package named `WebQuantumSavory`; `gui/` is a separate Vue/Vite package governed by `gui/AGENTS.md`.
- Frontend unit tests live in `gui/tests/unit/` and use Vitest, jsdom, and Vue Test Utils. Browser workflows live separately in `gui/tests/e2e/` and use Playwright.
- Use the root `Project.toml` for backend work, `test/Project.toml` for backend
  tests, and the isolated `mcp/Project.toml` only for the opt-in MCP sidecar.
  All manifests are local generated files and must not be committed.
- `../QuantumSavory.jl` is a separate reference checkout with its own `AGENTS.md`. Normal package resolution uses the GitHub `master` source declared in this repository's `Project.toml`, not that sibling directory. Do not edit the sibling unless a task explicitly spans both repositories.
- `_docs_/` and `_tests_/` contain historical examples and fixtures. The maintained automated suite is under `test/`; confirm behavior in current source and tests before trusting legacy material.

## Runtime and source map

- `bin/server` is the supported application launcher. It installs the locked GUI dependencies, rebuilds the Vite bundle, and then starts Genie. It is safe to invoke outside the repository directory.
- `bootstrap.jl` loads `WebQuantumSavory`, aliases it as `UserApp`, and calls `WebQuantumSavory.main()` so Genie loads configuration, initializers, and routes.
- `routes.jl` owns HTTP handlers, adjacent Swagger descriptions, the common safe route wrapper, the root UI route, and startup of the stale-simulation service.
- `src/WebQuantumSavory.jl` defines `State`, the process-global `STATE` dictionary, serialization, protocol launching, simulation control, log access, and resource cleanup.
- `src/simulation_service.jl` is the route-independent simulation boundary used
  by both existing HTTP routes and MCP reads. `src/collaboration_hub.jl`,
  `src/sidecar_supervisor.jl`, `src/mcp_config.jl`, and `src/mcp_adapters.jl`
  own the feature-neutral browser lease/revision protocol and the gated local
  sidecar process.
- `mcp/` is a separate Julia application environment using
  ModelContextProtocol.jl. It must not import WebQuantumSavory; it communicates
  only through loopback internal routes. Tool metadata and wire schemas live in
  `contracts/mcp/v1/tools.json`.
- Keep ModelContextProtocol.jl exactly pinned with the source-annotated
  single-session transport adapter. When upgrading it, re-diff the adapter
  against upstream and run `./ci/mcp-unit.sh` plus the MCP browser scenario.
- `src/parser.jl` discovers QuantumSavory metadata, validates request payloads, constructs graphs/registers/networks, converts parameters, and instantiates protocols.
- `src/script_export.jl` translates validated project payloads into standalone, pedagogical QuantumSavory Julia scripts without creating server-side simulation state.
- `src/tag_metadata.jl` owns runtime discovery of QuantumSavory tag converters and signatures, the allowlisted tag/query codec, live-register target resolution, entry serialization, and tag/message mutation helpers.
- `src/startup_warmup.jl` owns the synchronous, one-per-process non-test startup workload that exercises the latest bundled demo, simulator, protocol/state renderers, and GUI-default States Zoo preview before requests are accepted.
- `src/errors.jl` standardizes `APIError` responses. `evaluation_policy.jl` gates unsafe server-process evaluation, `source_allowlist.jl` is the parse-time allowlist guard applied before every user-source evaluation, `Logger.jl` captures per-simulation events, `Sandbox.jl` evaluates user expressions, `types.jl` implements lambda/symbolic adapters, and `services.jl` manages idle simulations.
- `config/env/` contains Genie settings for dev, test, and production. `public/index.html` and `public/assets/` are generated from `gui/` at launch.

## Simulation flow and invariants

- MCP is disabled unless `WEBQUANTUMSAVORY_ENABLE_MCP=true`. When enabled, both
  Genie and the sidecar must remain loopback-only, and the sidecar starts only
  after an explicit browser action. Do not introduce a main-package dependency
  on ModelContextProtocol.jl.
- Browser `projectData` remains the only mutable authoring model. Add design
  behavior to the neutral frontend `DesignCommandService`; never interpret or
  mutate design documents in Julia. GUI and MCP authoring paths must invoke the
  same registered handler before a tool is advertised.
- MCP simulation lifecycle mutations must relay through the existing browser
  simulation controller. Simulation reads and existing HTTP routes use
  `SimulationService`; neither the service nor the authoring domain may import
  MCP concerns.

The normal lifecycle is:

1. `extract_payload` and `validate_payload`
2. `parse_network_graph`, which builds a `SimpleGraph`, QuantumSavory `RegisterNet`, slot mappings, and a named `State`
3. `prepare_simulation`, which obtains the ConcurrentSim time tracker and launches protocols
4. `run_simulation`, which advances the simulation with `ConcurrentSim.step`
5. state polling, pause/resume, result/log access, and eventual destruction

- Always validate a raw project payload before calling `parse_network_graph`; the parser expects the validation result containing `data` and `graph_info`.
- Preserve node ordering. The payload array position is the user-visible, 1-based simulator node ID; durable external string IDs are translated through that order to Julia register indices, and edge protocol `nodeA`/`nodeB` roles follow the submitted source/target IDs under that mapping.
- Custom-function context is backend-owned and lexical. Build the node-name-to-1-based-index mapping once from the ordered validated nodes, reuse it while constructing registers and protocols, and derive physical payload validation, supported numeric-expression globals, representative values, runtime `let` bindings, and generated-script bindings from the one ordered edge-context descriptor definition; keep endpoint bindings separate. `nodeid(name::String)` is available to every custom Lambda and numeric expression, while `self` is bound for node protocols and slot backgrounds. Edge protocols additionally bind `distance` in meters, `delay` in seconds, dimensionless `refractive_index`, `loss` in dB/km, dimensionless zero-through-one `transmissivity`, and the source/target one-based IDs as `node_a`/`node_b`; the five physical values are `nothing` on virtual edges. The edge-distance binding is named `distance` (not `length`) so it does not shadow the `length` function, which stays callable in edge and variable sources. Manual transmissivity does not hide the resolved numeric `loss` from protocol code, matching the existing manual-delay context behavior. Runtime Lambda and numeric-expression variables remain raw and resolve against each assignment's lexical context. Duplicate node names intentionally use `Dict` last-name-wins semantics, and an unknown `nodeid` lookup fails with the ordinary Julia `KeyError` when the function runs.
- Keep Custom Function validation and runtime construction on the shared complete-source parser, context wrapper, and evaluator. The GUI sends the protocol placement to validation so representative `nodeid` and node-only `self` bindings cover eager curried expressions before a concrete assignment exists. Sources may contain curried expressions or named definitions, but their final value must satisfy QuantumSavory's `Function` contract; format user-facing Julia failures with `showerror` while retaining production redaction.
- Every user source (Custom Function, numeric expression, and Symbolic) passes the `source_allowlist.jl` guard between parsing and evaluation: it walks the parsed `Expr` and rejects any identifier outside a small allowlist or any dangerous syntactic form (`.`-qualification and property access, macros, interpolation, imports, `ccall`, `getfield`-family, and named-property destructuring). This is one defense-in-depth layer on top of the `evaluation_policy.jl` gate, not a security boundary — accepted source still runs native Julia. Keep the operation/constant allowlists explicit, but derive the guard's context-name allowlist from the same ordered edge-context descriptor catalog (`_ALL_NUMERIC_CONTEXT_BINDINGS`) so a new binding cannot be injected at runtime yet rejected by the guard. Symbolic source additionally admits QuantumSymbolics constructors and exported atoms/operators.
- Protocol placement is part of the API contract: node protocols live under each node's `data.protocols`, edge protocols under each edge's `data.protocols`, and floating protocols under `net.protocols`.
- Physical edges alone define the simulator's `SimpleGraph`. Reject duplicate unordered physical endpoint pairs; validate resolved nonnegative finite `data.distanceMeters`, `data.propagationDelaySeconds`, and `data.lossDbPerKm`, positive finite `data.refractiveIndex`, and finite zero-through-one `data.transmissivity`; do not recompute or cross-check frontend-resolved formulas. Pass the symmetric delay lookup as both `classical_delay` and `quantum_delay` to `RegisterNet`. Missing distance/index/loss/transmissivity remain `nothing` for legacy payloads, while missing legacy delay retains the established zero default. Virtual edges remain in validated edge metadata only so protocols whose catalog type permits virtual placement can still be constructed; reject other virtual-edge protocols.
- Tag-query custom predicates use the `query` `/test_code` placement, which intentionally injects neither `nodeid` nor `self` so validation matches the runtime query evaluator.
- Protocol, background, and slot catalogs come from QuantumSavory metadata. Do not duplicate hard-coded catalogs in the API or GUI.
- Identify protocol fields accepting named tag heads structurally from authoritative `QuantumSavory.constructor_metadata`: the only semantic forms are `Type{<:QuantumSavory.AbstractTag}` and that type unioned with `Nothing`. Preserve the ordinary parameter `type` wire value while advertising `kind: "named_tag_type"` and nullability; never infer this contract from saved/client type strings.
- Keep the protocol and background constructor typed-input pipeline explicit:
  `QuantumSavory.constructor_metadata` → backend Julia-type metadata → frontend
  input descriptors → minimized base Julia type plus tagged value. The Julia
  constructor member is authoritative; descriptor IDs such as
  `expression:Float64` are frontend choices, never Julia types on the wire.
- Numeric expression values have exactly
  `{ "kind": "numeric_expression", "source": "<Julia source>" }`. Accept the
  tag only for authoritative `Float64` and `Int64` constructor members and
  Variables of those semantic types. Keep schema version 1, map expression
  descriptor choices back to their base Julia type in minimized payloads, and
  never serialize preview values, failures, node maps, placement, or physical
  assignment context.
- GUI and MCP authoring must validate that same strict tag through the shared
  browser `DesignCommandService`; do not add an MCP-only expression type,
  evaluator, or permissive object codec.
- Fresh protocol and background parameters use `selectedType: "default"` and `value: null`;
  constructor `defaultValue` is documentation rather than draft state. Default
  omits the keyword so Julia applies the constructor default. Conservatively
  normalize legacy explicit scalars and existing tagged/custom choices without
  treating legacy numeric strings as expressions.
- States Zoo types are the exception to dynamic metadata discovery: the API exposes a single explicit registry keyed by stable public IDs. Its current keys are `BarrettKokBellPair`, `BarrettKokBellPairW`, `DepolarizedBellPair`, `GenqoMultiplexedCascadedBellPairW`, and `GenqoUnheraldedSPDCBellPairW`, which currently cover all five upstream States Zoo types. Each entry explicitly records whether it is weighted, and weighted display names end uniformly in ` (weighted)`. Adding a state requires an intentional registry update; never construct a type supplied directly by a client or broaden the registry implicitly from the `QuantumSavory.StatesZoo` module.
- A States Zoo variable is an ordinary `Symbolic` variable whose value is a structured recipe: `{ "kind": "states_zoo", "state_type": "<stable-id>", "parameters": { ... } }`. Weighted states also own a generated `Float64` trace companion identified by `statesZooTraceSourceId`. Preserve both through project serialization, minimized API payloads, and protocol-variable resolution while keeping them out of the frontend's ordinary Variables tab; the tagged recipe is data, not Julia source code.
- Construct tagged States Zoo recipes only through the shared whitelist validator. Require the exact parameter names advertised for that type, finite numeric values, and declared ranges, and do not route these recipes through `Base.eval` or the unsafe-evaluation policy. Resolve weighted recipes to normalized symbolic state objects while retaining the original density matrix's absolute trace as primitive response metadata; existing symbolic strings retain their current evaluation-policy behavior.
- Project descriptions are frontend-only Markdown stored as a top-level string in the full project JSON. Preserve them across save/import/export and legacy normalization, but never include them in minimized simulator API payloads.
- Map annotations are frontend-only top-level schema-v1 project data. Preserve their durable IDs, Markdown, canonical geographic bounds, six-digit colors, and optional areas stored as `{ "freeCorner": [longitude, latitude] }` through save/import/export and legacy normalization, but never include annotations in minimized simulator or script-export payloads, backend parsing, or network topology. Derive each area rectangle from that independent free corner instead of persisting attachment-edge geometry.
- CairoMakie preview rendering is process-local and must remain serialized by the dedicated lock. Keep construction and rendering inside the validated allowlist path, normalize weighted density matrices before plotting, and return the PNG bytes and original absolute trace using the documented API envelope rather than live QuantumSavory or Makie objects.
- `STATE` is in-memory and process-local. Restarts lose simulations, and tests which use fixed names or mutate state must run serially and clean up after themselves.
- Tags and tag queries are live-simulation metadata, not project data. Keep them out of project payloads and serialized state polling; tag routes require a retained `RegisterNet`, resolve external node and slot IDs through validated payload order, and become unavailable after destroy, block, or purge cleanup.
- Startup warmup uses the reserved `__webquantumsavory_startup_warmup__` state, validates that every intended renderer produced output, and must always destroy that state in `finally`. It derives the latest demo from the numeric filenames and the default States Zoo value from catalog order and `good` parameters; keep those assumptions synchronized when bundled demos or GUI defaults change. Automatic warmup is skipped in `test`, where unit tests invoke the throwing workload directly.
- `run_simulation` marks the state running and starts one sticky `@async` task; the task yields cooperatively between simulation steps. Pause responses wait for that task to acknowledge and exit. Keep the task reference, pause request, `is_running`, `simulation_paused`, timestamps, error flags, and serialized status fields consistent when changing lifecycle code.
- A run has a 10-minute wall-clock cap. Non-running states are blocked and stripped of heavy resources after 30 idle minutes, then retained for UI status. Blocking refreshes the activity timestamp, so the retained record is destroyed after a further 300 idle minutes. The service checks once per minute.
- Starting a new target clears previously captured simulation logs; resuming a paused target preserves them. `GET /logs/:name` purges returned logs by default, so tests and callers which need repeat reads must request otherwise.
- `Logger.CapturingLogger` preserves Julia's standard log-record `group` field in each structured event. Keep the simulator-group catalog behind `GET /simulation_log_groups` and derive it directly from exported `QuantumSavory.LOG_GROUPS`; never duplicate the upstream group vocabulary in this repository. `ResumableFunctions` may hygienically rename `_group` to `_group_N` before a nested logging macro expands, so keep the narrow Logger-owned recovery limited to reserved `_group`/`_group_<digits>` keys whose values are in that authoritative catalog, while retaining the original keyword in Raw JSON.
- Do not remove `InteractiveUtils`, `REPL`, or `CairoMakie` from `src/WebQuantumSavory.jl` as apparently unused imports. They activate QuantumSavory metadata and MIME-rendering extensions used by the API.
- `Sandbox` creates a fresh module but evaluates Julia code with `Base.eval`; this is namespace isolation, not a security boundary. Treat code, lambda, symbolic, and fallback parameter evaluation as unsafe for untrusted input.
- Numeric expressions share the complete-source parser, fresh-module
  evaluator, lexical assignment context, and unsafe-evaluation policy with
  Custom Functions. Validation casts through the authoritative `Float64` or
  `Int64` target, rejects non-finite floats and inexact/overflowing integers,
  and then applies field ranges. Do not silently replace an invalid expression
  with a constructor default.
- Numeric-expression validation has four modes. Concrete node, edge, and
  floating fields evaluate once in their actual lexical context. Templates
  evaluate once with stable representative placement values and return both a
  representative value and `deferred=true`. Context-free Variables lower once
  and evaluate that same lowered form; context-dependent Variables detect
  resolved assignment-module `GlobalRef`s and defer without executing the body
  or casting it. Only this unsafe Variables path may lower or macro-expand
  source. Reject lowering errors even when a contextual reference is present.
- Edge context binds the physical distance as `distance`, so the `length`
  function stays the collection function in every placement. Variables
  conservatively treat unqualified context bindings (such as `distance`) as
  assignment-dependent. Runtime evaluation uses the actual lexical context as
  authority and must not reintroduce static source-name scans.
- `WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` is the sole unsafe-evaluation override and accepts only `true` or `false`. Without it, evaluation is enabled only in `dev` and `test`; production and unknown environments deny it.

## API changes

- Register handlers through the local `route(...)` wrapper in `routes.jl`, not `Genie.Router.route` directly, so unexpected exceptions and `APIError`s keep the standard JSON shape.
- Keep each route's Swagger block beside and synchronized with its handler.
- Reuse `validation_error`, `not_found_error`, `bad_request_error`, and `server_error`; do not hand-roll incompatible error payloads.
- When a request or response changes, review all four contract surfaces: the backend implementation, the adjacent Swagger schema, `test/test_integration.jl`, and `gui/src/utils/ApiConnector.js` plus affected GUI models/composables.
- Keep `POST /export_script` and the normal parser aligned for node ordering, register names, registers, background noise, variables, and node/edge/floating protocol construction. Source generation must remain deterministic and side-effect free: validate input, but do not create `STATE` entries or evaluate user-provided Julia while exporting.
- Route every exporter-owned helper, macro, type, and constructor through the centralized script-import registry. Collect candidates from resolved Julia bindings before rendering, retain public `QuantumSavory` reexports for transitive implementation types, group and sort explicit imports by source module, and assign collision aliases independently of discovery or rendering order. Preserve the broad `using` statements for user-authored symbolic and custom-function source; fresh-module tests must execute both that raw context and representative root, nested, and unexported generated bindings.
- Generated scripts add only physical edges to their graph, hardcode the validated physical delay lookup, and pass one callable to both channel-delay keywords. They still construct permitted protocols attached to virtual edges.
- Preserve runtime/export parity for custom-function context without adding stored-project fields. Generated scripts define the deterministic node-name map and global `nodeid` helper before Variables, registers, and backgrounds; bind only referenced node-only `self` and edge-only physical/endpoint values lexically around custom functions; emit context-free Variables once as ordinary globals; and instantiate context-dependent Variables at each protocol or background assignment. Keep exported user-source wrappers assumption-driven and concise: syntax-check source in the server, but do not add generated result-type, finiteness, or bounds checks.
- Preserve runtime/export parity for numeric expressions with the same lexical
  `nodeid`, node-only `self`, and edge-only physical/endpoint bindings. Direct
  and Variable-backed context-dependent expressions are evaluated with each
  concrete protocol or background assignment. Context-free expressions,
  including those that use global `nodeid`, are emitted once without
  assignment-local `let` scaffolding.
  Export must validate the strict tag and complete syntax only; never lower,
  macro-expand, or evaluate user source in the WebQuantumSavory server.
- Exported scripts are standalone QuantumSavory onboarding material, not WebQuantumSavory runtime clients. Keep the fixed-duration path executable by default and the animation and protocol-PNG examples clearly separated so a script does not accidentally advance one simulation through multiple recipes.
- Export weighted States Zoo variables and their owned trace companions with one tuple-returning `let` block: construct the raw state once, compute its absolute trace once, and bind the normalized state and trace together. Never embed the companion's cached GUI value in the generated Julia.
- Keep serialized responses free of live QuantumSavory objects. Return stable IDs, primitive metadata, and explicitly rendered HTML/PNG data only where the existing endpoints require it.
- Keep the global Qubit/Qumode representation defaults in `simulationConfig` aligned across `src/representations.jl`, register construction, script export, Swagger, and the GUI codec. Treat representation names as an allowlisted wire format, retain `QuantumOpticsRepr` for legacy payloads, and keep `GabsRepr` pinned to `QuantumSavory.Gabs.QuadBlockBasis` unless a separate basis choice is intentionally added.
- Keep the tag catalog and codec metadata-driven. Discover named converters and general `Symbol`/`DataType` signatures from `methods(Tag)`, use fully qualified type IDs internally, accept only catalog-advertised primitive/type values, serialize `Int128` tag IDs as strings, and route custom query predicates through the shared complete-source evaluator and unsafe-evaluation policy.
- Keep protocol named-tag resolution narrower than general tag tooling. `/tag_types` exposes only concrete `AbstractTag` converter types as `named_tags`, while safe converters outside that hierarchy remain eligible for compatible general `DataType` signatures and `allowed_data_types`. Runtime construction and script export must resolve exact fully qualified IDs from the named `AbstractTag` catalog without evaluation, honor `Nothing` only for nullable fields, reject variable references, and use constructor metadata rather than client parameter metadata.

## Setup and commands

From the repository root:

```sh
julia --project=. -e 'using Pkg; Pkg.instantiate()'
julia --project=test -e 'using Pkg; Pkg.instantiate()'
./bin/server
```

The server launcher requires Node.js 18 or newer and npm. It runs `npm ci` and `npm run build` in `gui/` on every start, then serves the generated UI and API at `http://127.0.0.1:8000` by default.

The backend test runner is working-directory-sensitive. Run targeted unit tests from `test/`:

```sh
(cd test && julia --project=. runtests.jl test_unit)
```

Running `runtests.jl` without a test name also includes integration tests. Those require a separate test-mode server on port 8000 and a built UI:

```sh
(cd gui && npm ci && npm run test:unit && npm run build)
GENIE_ENV=test julia --project=. -e 'using WebQuantumSavory; WebQuantumSavory.main(); WebQuantumSavory.up(async=false)'
(cd test && julia --project=. runtests.jl test_integration)
```

Run the server and integration command in separate terminals. Integration tests share global server state and fixed simulation names; do not parallelize them.

The checked-in CI entry points install their own project dependencies and can also be run locally:

```sh
./ci/backend-unit.sh
./ci/mcp-unit.sh
./ci/frontend-build.sh
./ci/backend-integration.sh
./ci/browser.sh
```

`ci/frontend-build.sh` installs the locked frontend dependencies, runs the Vitest unit suite, and then creates the production build. The backend-integration and browser entry points reuse it, so GitHub Actions and Buildkite enforce the same unit-test-and-build sequence.

`ci/run-with-server.sh` provides bounded readiness polling, failure logs, and
cleanup for the MCP, integration, and browser entry points. GitHub Actions and
Buildkite use Julia 1.12 and Node.js 24. Buildkite provisions Julia, Node.js,
and the Playwright Chromium dependencies during each relevant job; its smaller
host baseline is documented in `README.md`. Its three server-backed jobs use
distinct backend ports so they can run in parallel, while separate per-job
concurrency groups keep overlapping builds from contending for a job's fixed
backend, sidecar, or Vite ports.

## Change discipline

- Base frontend work that adds or changes UI controls on the Lucide icon migration, and use the `@lucide/vue` conventions documented in `gui/AGENTS.md`; do not reintroduce PrimeIcons, icon-font classes, or plain Unicode control glyphs in follow-up branches. Preserve documented library-native exceptions such as MapLibre navigation controls.
- Follow the frontend ownership boundaries in `gui/`: `projectCodec.js` for project schemas and payloads, `ProjectStore` plus `useProjectSession` for persistence and session transitions, `simulationLifecycle.js` plus `useSimulationController.js` for lifecycle state and polling, `usePanelLayout.js` for panel state, `uiServices.js` and `components/ui/` for shared UI behavior, `components/tags/` for progressive tag/query construction and the shared editable/read-only badge sequence, and `legacyBridge.js` for retained `window.*` compatibility. Use the semantic `--app-*` CSS tokens for shared styling.
- Keep all PrimeVue `v-tooltip` content on the GUI's shared `src/utils/markdown.js` renderer and `src/directives/markdownTooltip.js` wrapper, with raw HTML disabled and backend diagnostics represented as Markdown code blocks. Native `title` attributes remain plain browser text and must not be migrated implicitly.
- Preserve the Tags & Queries target contract in the GUI: Register defaults to All slots and may narrow to one slot, Message Buffer remains node-scoped, and only selected Register slots or message buffers expose attachment construction. Map those choices to the existing register, slot, and message-buffer API targets without adding GUI destination-slot state or changing backend compatibility for external clients.
- Frontend codec, session, lifecycle, composable, utility, or shared UI changes require `npm run test:unit` in `gui/` in addition to the broader checks appropriate to the behavior.
- Keep strict annotation validation at codec/import boundaries and interactive geometry in `gui/src/utils/annotationGeometry.js`; world-wrapped pointer coordinates must be canonicalized or fail soft rather than throwing from rendering and drag handlers. Choose an attached area's edge from the free corner's displacement normalized to the annotation dimensions, ensure every nondegenerate area shares a positive edge segment, and expand that overlap to the full edge when the selection extends beyond the annotation along the tangent axis. Keep map layer IDs/order in `gui/src/utils/mapLayers.js`, marker ownership in `useMaplibreMarker`, and marker stacking in the shared `--app-z-map-*` tokens. Reuse the existing rectangle-layer and resize-handle styling; map components must preserve selected annotation object identity and release layers, sources, markers, and listeners during project transitions and unmount.
- Prefer the smallest relevant check first, then broaden based on risk. Run backend unit tests for `src/` changes, integration tests for routes/contracts, and the GUI checks in `gui/AGENTS.md` for frontend-facing changes.
- GitHub Actions and Buildkite both run backend unit, MCP unit/transport,
  frontend unit/version/build, backend integration, and full headless Chromium
  checks through the shared `ci/` scripts.
- Do not commit root or test manifests, `node_modules`, logs, SQLite runtime files, Genie build/cache/session output, Playwright results, or generated Vite output under `public/`.
- Edit `gui/index.html`, `gui/public/`, or `gui/src/` for frontend changes; never edit generated `public/index.html`, `public/vite.svg`, or `public/assets/`.
- Keep unrelated cleanup out of behavioral changes, avoid broad formatting churn, and preserve user work already present in the tree.
