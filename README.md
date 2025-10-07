# CQN (Quantum Network API)

A Julia-based web API for quantum network operations, built with the Genie web framework and QuantumSavory quantum computing library. This API provides endpoints for creating, preparing, and running quantum network simulations.

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd cqn
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

## UI Access

The user interface is available at `http://localhost:8000`.

## API Overview

### Core Simulation Workflow

1. **Create Network** (`POST /parse_network_graph`) - Upload network graph definition
2. **Prepare Simulation** (`POST /prepare_simulation`) - Launch protocols and setup network
3. **Run Simulation** (`POST /run_simulation`) - Execute simulation for specified time units
4. **Monitor State** (`GET /get_state`) - Check simulation status and progress
5. **Cleanup** (`POST /destroy_simulation`) - Remove simulation and free resources

### Information Endpoints

- **`GET /background_types`** - Available background noise models
- **`GET /slot_types`** - Available quantum slot types
- **`GET /protocol_types`** - Available protocol types with parameters
- **`GET /protocols/:name/:protocol_id`** - Details for a protocol instance in a simulation
- **`GET /slots/:name/:slot_id`** - Details for a slot in a simulation
- **`GET /simulations`** - List existing simulations with `name` and `status`
- **`GET /known_functions`** - List of supported Julia functions usable as argument values
- **`POST /test_code`** - Test Julia code in a sandboxed environment
- **`GET /platform_info`** - Versions: Julia, QuantumSavory (if installed), and app version
- **`GET /logs/:name`** - Fetch log events for a simulation; supports `purge` query (default `true`). Example: `/logs/my-sim?purge=false`
- **`GET /status`** - Server health check
- **`GET /docs`** - Interactive Swagger UI

### Simulation States

- **`created`** - Network parsed and stored
- **`prepared`** - Protocols launched, ready to run
- **`complete`** - Simulation executed and finished

## Getting Started

The best way to explore the API is through the interactive Swagger documentation at `/docs`. It provides:
- Complete endpoint documentation
- Request/response schemas
- Interactive testing interface
- Example payloads and responses

## Running Tests

This project includes unit tests and integration tests.

- Unit tests validate core logic and helpers without requiring a running server.
- Integration tests exercise the HTTP API and require the server to be running at `http://localhost:8000`.

### Run Unit Tests

```bash
cd test
julia --project runtests.jl test_unit
```

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
