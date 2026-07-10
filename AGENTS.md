# WebQuantumSavory backend guide

## Scope and project boundary

- This repository is the WebQuantumSavory application. The root is the Julia/Genie API package named `Cqn`; `gui/` is a separate Vue/Vite package governed by `gui/AGENTS.md`.
- Use the root `Project.toml` for backend work and `test/Project.toml` for backend tests. Both manifests are local generated files and must not be committed.
- `../QuantumSavory.jl` is a separate reference checkout with its own `AGENTS.md`. Normal package resolution uses the GitHub `master` source declared in this repository's `Project.toml`, not that sibling directory. Do not edit the sibling unless a task explicitly spans both repositories.
- `_docs_/` and `_tests_/` contain historical examples and fixtures. The maintained automated suite is under `test/`; confirm behavior in current source and tests before trusting legacy material.

## Runtime and source map

- `bin/server` is the supported application launcher. It installs the locked GUI dependencies, rebuilds the Vite bundle, and then starts Genie. It is safe to invoke outside the repository directory.
- `bootstrap.jl` loads `Cqn`, aliases it as `UserApp`, and calls `Cqn.main()` so Genie loads configuration, initializers, and routes.
- `routes.jl` owns HTTP handlers, adjacent Swagger descriptions, the common safe route wrapper, the root UI route, and startup of the stale-simulation service.
- `src/Cqn.jl` defines `State`, the process-global `STATE` dictionary, serialization, protocol launching, simulation control, log access, and resource cleanup.
- `src/parser.jl` discovers QuantumSavory metadata, validates request payloads, constructs graphs/registers/networks, converts parameters, and instantiates protocols.
- `src/errors.jl` standardizes `APIError` responses. `evaluation_policy.jl` gates unsafe server-process evaluation, `Logger.jl` captures per-simulation events, `Sandbox.jl` evaluates user expressions, `types.jl` implements lambda/symbolic adapters, and `services.jl` manages idle simulations.
- `config/env/` contains Genie settings for dev, test, and production. `public/index.html` and `public/assets/` are generated from `gui/` at launch.

## Simulation flow and invariants

The normal lifecycle is:

1. `extract_payload` and `validate_payload`
2. `parse_network_graph`, which builds a `SimpleGraph`, QuantumSavory `RegisterNet`, slot mappings, and a named `State`
3. `prepare_simulation`, which obtains the ConcurrentSim time tracker and launches protocols
4. `run_simulation`, which advances the simulation with `ConcurrentSim.step`
5. state polling, pause/resume, result/log access, and eventual destruction

- Always validate a raw project payload before calling `parse_network_graph`; the parser expects the validation result containing `data` and `graph_info`.
- Preserve node ordering. External string node IDs are translated to Julia's 1-based register indices, and edge protocol contexts depend on that mapping.
- Protocol placement is part of the API contract: node protocols live under each node's `data.protocols`, edge protocols under each edge's `data.protocols`, and floating protocols under `net.protocols`.
- Protocol, background, and slot catalogs come from QuantumSavory metadata. Do not duplicate hard-coded catalogs in the API or GUI.
- `STATE` is in-memory and process-local. Restarts lose simulations, and tests which use fixed names or mutate state must run serially and clean up after themselves.
- `run_simulation` marks the state running and starts one sticky `@async` task; the task yields cooperatively between simulation steps. Pause responses wait for that task to acknowledge and exit. Keep the task reference, pause request, `is_running`, `simulation_paused`, timestamps, error flags, and serialized status fields consistent when changing lifecycle code.
- A run has a 10-minute wall-clock cap. Non-running states are blocked and stripped of heavy resources after 30 idle minutes, then retained for UI status. Blocking refreshes the activity timestamp, so the retained record is destroyed after a further 300 idle minutes. The service checks once per minute.
- Starting a new target clears previously captured simulation logs; resuming a paused target preserves them. `GET /logs/:name` purges returned logs by default, so tests and callers which need repeat reads must request otherwise.
- Do not remove `InteractiveUtils`, `REPL`, or `CairoMakie` from `src/Cqn.jl` as apparently unused imports. They activate QuantumSavory metadata and MIME-rendering extensions used by the API.
- `Sandbox` creates a fresh module but evaluates Julia code with `Base.eval`; this is namespace isolation, not a security boundary. Treat code, lambda, symbolic, and fallback parameter evaluation as unsafe for untrusted input.
- `WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` is the sole unsafe-evaluation override and accepts only `true` or `false`. Without it, evaluation is enabled only in `dev` and `test`; production and unknown environments deny it.

## API changes

- Register handlers through the local `route(...)` wrapper in `routes.jl`, not `Genie.Router.route` directly, so unexpected exceptions and `APIError`s keep the standard JSON shape.
- Keep each route's Swagger block beside and synchronized with its handler.
- Reuse `validation_error`, `not_found_error`, `bad_request_error`, and `server_error`; do not hand-roll incompatible error payloads.
- When a request or response changes, review all four contract surfaces: the backend implementation, the adjacent Swagger schema, `test/test_integration.jl`, and `gui/src/utils/ApiConnector.js` plus affected GUI models/composables.
- Keep serialized responses free of live QuantumSavory objects. Return stable IDs, primitive metadata, and explicitly rendered HTML/PNG data only where the existing endpoints require it.

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
(cd gui && npm ci && npm run build)
GENIE_ENV=test julia --project=. -e 'using Cqn; Cqn.main(); Cqn.up(async=false)'
(cd test && julia --project=. runtests.jl test_integration)
```

Run the server and integration command in separate terminals. Integration tests share global server state and fixed simulation names; do not parallelize them.

The checked-in CI entry points install their own project dependencies and can also be run locally:

```sh
./ci/backend-unit.sh
./ci/frontend-build.sh
./ci/backend-integration.sh
./ci/browser.sh
```

`ci/run-with-server.sh` provides bounded readiness polling, failure logs, and cleanup for the integration and browser entry points. GitHub Actions and Buildkite use Julia 1.12 and Node.js 24. Buildkite provisions Julia and the Playwright Chromium dependencies during each relevant job; its smaller host baseline is documented in `README.md`.

## Change discipline

- Prefer the smallest relevant check first, then broaden based on risk. Run backend unit tests for `src/` changes, integration tests for routes/contracts, and the GUI checks in `gui/AGENTS.md` for frontend-facing changes.
- GitHub Actions and Buildkite both run backend unit, frontend version/build, backend integration, and full headless Chromium checks through the shared `ci/` scripts.
- Do not commit root or test manifests, `node_modules`, logs, SQLite runtime files, Genie build/cache/session output, Playwright results, or generated Vite output under `public/`.
- Edit `gui/index.html`, `gui/public/`, or `gui/src/` for frontend changes; never edit generated `public/index.html`, `public/vite.svg`, or `public/assets/`.
- Keep unrelated cleanup out of behavioral changes, avoid broad formatting churn, and preserve user work already present in the tree.
