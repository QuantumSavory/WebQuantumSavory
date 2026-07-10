# CQN (Quantum Network API)

A Julia-based web API for quantum network operations, built with the Genie web framework and QuantumSavory quantum computing library. This API provides endpoints for creating, preparing, and running quantum network simulations.

## Installation

Prerequisites are Julia, Node.js 18 or newer, and npm.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd WebQuantumSavory
   ```

2. **Install Julia dependencies**:
   ```bash
   julia --project=. -e 'using Pkg; Pkg.instantiate()'
   ```

## Running the Server

### Option 1: Using the provided script
```bash
./bin/server
```

The server will start on `http://localhost:8000` by default.
The launcher runs `npm ci` and rebuilds the GUI before starting Genie, so the generated
files under `public/` do not need to be checked into Git.

## UI Access

The user interface is available at `http://localhost:8000`.

For the bundled UI, API requests default to the current browser origin in production, which keeps the
frontend aligned with the Genie server automatically. If you need to point the built UI at a different
API host, set `VITE_API_BASE_URL` when running `npm run build`.

## API Overview

### Core Simulation Workflow

1. **Create Network** (`POST /parse_network_graph`) - Upload network graph definition
2. **Prepare Simulation** (`POST /prepare_simulation`) - Launch protocols and setup network
3. **Run Simulation** (`POST /run_simulation`) - Start a cooperative run to an absolute simulation-time target
4. **Monitor State** (`GET /get_state`) - Check simulation status and progress
5. **Cleanup** (`POST /destroy_simulation`) - Remove simulation and free resources

### Simulation Control

- **Pause Simulation** (`POST /pause_simulation`) - Pause a running simulation
  - Requires simulation to be currently running
  - Returns only after the run task stops at a simulation-step boundary
  - Returns error if simulation is not running

`POST /run_simulation` returns HTTP 202 after marking the simulation as running; use
`GET /get_state` to monitor completion or errors. `time_units` is the absolute cumulative target,
not a duration added by the API. To resume a paused simulation, call `/run_simulation` again with
the target already reported in `simulation_time`.

The simulation state includes a `simulation_paused` boolean field that indicates an acknowledged
pause. When it is `true`, `simulation_running` is `false` and the execution task has stopped, so the
simulation can be resumed or safely destroyed.

#### Example: Pausing a Simulation

```bash
# Start a simulation
curl -X POST http://localhost:8000/run_simulation \
  -H "Content-Type: application/json" \
  -d '{"name": "my-simulation", "time_units": 100}'

# Pause the simulation
curl -X POST http://localhost:8000/pause_simulation \
  -H "Content-Type: application/json" \
  -d '{"name": "my-simulation"}'

# Check simulation state
curl http://localhost:8000/get_state?name=my-simulation
```

The state response will show `simulation_paused: true` and `simulation_running: false` when the simulation has been paused.

### Information Endpoints

- **`GET /background_types`** - Available background noise models
- **`GET /slot_types`** - Available quantum slot types
- **`GET /protocol_types`** - Available protocol types with parameters
- **`GET /protocols/:name/:protocol_id`** - Details for a protocol instance in a simulation
- **`GET /slots/:name/:slot_id`** - Details for a slot in a simulation
- **`GET /simulations`** - List existing simulations with `name` and `status`
- **`GET /known_functions`** - List of supported Julia functions usable as argument values
- **`POST /test_code`** - Test Julia code when unsafe evaluation is enabled
- **`POST /test_symbolic_expression`** - Evaluate a symbolic expression and return LaTeX when unsafe evaluation is enabled
- **`GET /platform_info`** - Versions and server capabilities, including `unsafe_code_evaluation`
- **`GET /logs/:name`** - Fetch log events for a simulation; supports `purge` query (default `true`). Example: `/logs/my-sim?purge=false`
- **`GET /status`** - Server health check
- **`GET /docs`** - Interactive Swagger UI

### Simulation States

- **`created`** - Network parsed and stored
- **`prepared`** - Protocols launched, ready to run
- **`complete`** - Simulation executed and finished

### Simulation Status Fields

When monitoring simulation state via `GET /get_state`, the response includes a `simulation` object with:
- `simulation_running` - Boolean indicating if simulation is actively running
- `simulation_paused` - Boolean indicating if simulation was paused by user request
- `simulation_time` - Total time units for the simulation
- `simulation_progress` - Current simulation time progress
- `simulation_error` - Error message if simulation failed

## Getting Started

The best way to explore the API is through the interactive Swagger documentation at `/docs`. It provides:
- Complete endpoint documentation
- Request/response schemas
- Interactive testing interface
- Example payloads and responses

### Symbolic Expression Evaluation

`POST /test_code`, `POST /test_symbolic_expression`, lambda and symbolic
protocol parameters, and fallback conversion of complex parameters all execute
Julia code in the API server process. A fresh module isolates names, but does
not restrict filesystem, process, network, memory, or CPU access. Do not enable
these features for untrusted users.

Unsafe evaluation is enabled by default only in Genie's `dev` and `test`
environments. It is disabled in `prod` and unrecognized environments. Operators
can override either default with one environment variable:

```bash
WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true ./bin/server
```

The value is parsed strictly: only `true` or `false` are accepted, ignoring case
and surrounding whitespace. Keep the variable unset or set it to `false` in
production unless the deployment intentionally trusts every API caller and
simulation payload. When disabled, evaluation requests return HTTP 403 with
`error_code: "UNSAFE_EVALUATION_DISABLED"`. Evaluation exceptions are included
only in `dev` and `test` responses, even when evaluation is explicitly enabled
in another environment.

When enabled, use `POST /test_symbolic_expression` to evaluate a symbolic
expression in a fresh module with QuantumSavory preloaded and get its LaTeX
representation.

Example request body:

```json
{ "expr": "(Z₁⊗Z₁+Z₂⊗Z₂) / √2" }
```

Successful response:

```json
{ "success": true, "results": { "latex": "... LaTeX string ...", "value": "..." } }
```

On error, you'll receive:

```json
{ "success": false, "error": "<message>", "error_code": "EVALUATION_FAILED" }
```

## Running Tests

This project includes unit tests and integration tests.

- Unit tests validate core logic and helpers without requiring a running server.
- Integration tests exercise the HTTP API and require the server to be running at `http://localhost:8000`.

### Run Unit Tests

```bash
cd test
julia --project runtests.jl test_unit
```

Notes:
- Unit tests include deterministic checks for the background cleanup via `cleanup_stale_simulations_once()`.
- When creating states from payloads in tests, always call `Cqn.validate_payload(payload)` before `Cqn.parse_network_graph(...)`.

### Run Integration Tests

1. Start the server (in a separate terminal):
   ```bash
   ./bin/server
   ```

2. In another terminal, run:
   ```bash
   cd test
   julia --project runtests.jl test_integration
   ```

## Automatic Cleanup of Inactive Simulations

The system includes a background task that releases resources held by inactive simulations and eventually removes their retained status records.

- Service function: `Cqn.cleanup_stale_simulations()` (in `src/services.jl`)
- Frequency: every 60 seconds
- After 30 minutes: block the simulation and release heavy resources while retaining status for the UI
- After another 300 minutes without activity: destroy the retained simulation record
- Skips cleanup when `state.is_running == true`
- Startup: launched from `routes.jl` inside `bootstrap()` via

  ```julia
  @async Cqn.cleanup_stale_simulations() |> errormonitor
  ```

- Logging: both automatic blocking and destruction add an event to the simulation's captured log before releasing its state.

You can trigger a single cleanup pass manually (useful in tests) via `Cqn.cleanup_stale_simulations_once()`.
Running simulations also have a separate 10-minute wall-clock execution limit.
