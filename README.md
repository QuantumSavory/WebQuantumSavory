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

3. **Start the Julia REPL**:
   ```bash
   ./bin/repl
   ```

## Running the Server

### Option 1: Using the provided script
```bash
./bin/server
```

### Option 2: From Julia REPL
```julia
using Genie
Genie.loadapp()
Genie.up()
```

The server will start on `http://localhost:8000` by default.

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
- **`GET /status`** - Server health check
- **`GET /docs`** - Interactive Swagger UI
- **`GET /`** - Basic root endpoint (OK status)

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

