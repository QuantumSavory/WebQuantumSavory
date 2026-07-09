# AI Agent Guidelines for CQN API

This document provides essential information for AI agents working on the CQN (Quantum Network API) codebase.

## Project Overview

CQN is a Julia-based web API for quantum network operations, built with:
- **Genie** web framework
- **QuantumSavory** quantum computing library
- **ConcurrentSim** for simulation management

## Key Architecture Components

### Core Modules (`src/`)
- **`Cqn.jl`** - Main module with State struct, simulation functions, and global STATE dict
- **`parser.jl`** - Network graph parsing, validation, and protocol instantiation
- **`services.jl`** - Background cleanup services for stale simulations
- **`Logger.jl`** - Logging utilities
- **`Sandbox.jl`** - Code evaluation sandbox
- **`errors.jl`** - Custom error types and handling
- **`types.jl`** - Type definitions
- **`mocks.jl`** - Mock data and testing utilities

### State Management
- Global state stored in `Cqn.STATE::Dict{String, State}`
- Each simulation has a unique name as the key
- State includes: network graph, protocols, simulation status, timestamps

### Simulation Lifecycle
1. **Parse Network** (`parse_network_graph`) - Creates State from JSON payload
2. **Prepare Simulation** (`prepare_simulation`) - Launches protocols
3. **Run Simulation** (`run_simulation`) - Executes simulation
4. **Monitor/Pause** (`pause_simulation`) - Control running simulations
5. **Cleanup** (`destroy_simulation`) - Remove simulation

## Testing Framework

### Running Tests
```bash
# Unit tests (no server required)
cd test/
julia --project runtests.jl test_unit

# Integration tests (requires running server)
cd test/
julia --project runtests.jl test_integration
```

Notes for agents:
- When constructing a state from JSON in tests or scripts, always do:

  ```julia
  validation_result = Cqn.validate_payload(raw_payload)
  state = Cqn.parse_network_graph(validation_result)
  ```

- Unit tests exercise cleanup using `Cqn.cleanup_stale_simulations_once()` to avoid infinite loops.

### Test Structure
- **Unit Tests** (`test_unit.jl`) - Direct function calls, no HTTP
- **Integration Tests** (`test_integration.jl`) - HTTP API testing
- **Test Data** (`mock/`) - Sample payloads for testing

### Test Payloads
- `payload.json` - Basic 2-node network
- `payload2.json` - More complex network with protocols
- `payload3.json` - Entangler example with consumer protocols

## Development Workflow

### Starting the Server
```bash
# Option 1: Using script
./bin/server

# Option 2: Direct Julia
julia --project=. -e 'using Cqn; Cqn.up()'
```

### Project Dependencies
```bash
# Install dependencies
julia --project=. -e 'using Pkg; Pkg.instantiate()'

# Test dependencies
cd test/
julia --project=. -e 'using Pkg; Pkg.instantiate()'
```

## Key Features & Recent Additions

### Simulation Last Active Time
- **Field**: `simulation_last_active_time::Union{Nothing, DateTime}`
- **Purpose**: Track when simulation was last accessed
- **Updated on**: `parse_network_graph`, `prepare_simulation`, `run_simulation`, `pause_simulation`
- **Cleanup**: Background task destroys simulations inactive >30 minutes

### Background Cleanup Service
- **Function**: `cleanup_stale_simulations()` in `services.jl`
- **Frequency**: Every 60 seconds
- **Threshold**: 30 minutes of inactivity
- **Protection**: Skips running simulations (`is_running == true`)
- **Test Helper**: `cleanup_stale_simulations_once()` for unit testing
 - **Startup**: launched from `routes.jl` inside `bootstrap()`
 - **Log Event**: before deletion, logs via

   ```julia
   @log_event state Logging.Info "Stopping simulation $simulation_name after $CLEANUP_THRESHOLD minutes of inactivity"
   ```

## API Endpoints

### Core Simulation
- `POST /parse_network_graph` - Create network from JSON
- `POST /prepare_simulation` - Launch protocols
- `POST /run_simulation` - Run simulation
- `POST /pause_simulation` - Pause running simulation
- `POST /destroy_simulation` - Remove simulation
- `GET /get_state` - Get simulation status

### Information
- `GET /background_types` - Available noise models
- `GET /slot_types` - Quantum slot types
- `GET /protocol_types` - Protocol definitions
- `GET /simulations` - List all simulations
- `GET /logs/:name` - Get simulation logs

### Development
- `POST /test_code` - Sandboxed code evaluation
- `POST /test_symbolic_expression` - Symbolic math evaluation
- `GET /docs` - Swagger documentation

## Common Patterns

### Error Handling
```julia
try
    # operation
catch e
    if isa(e, APIError)
        rethrow(e)
    else
        throw(server_error("Description", Dict("error" => string(e))))
    end
end
```

### State Validation
```julia
if !haskey(Cqn.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
end
```

### Payload Processing
```julia
# Always validate before parsing
validation_result = Cqn.validate_payload(raw_payload)
state = Cqn.parse_network_graph(validation_result)
```

## Code Style Guidelines

### Julia Conventions
- Use `@kwdef` for structs with default values
- Prefer `Union{Nothing, Type}` for optional fields
- Use descriptive variable names
- Include docstrings for public functions

### Error Types
- `APIError` - Custom API errors with status codes
- `validation_error()` - Input validation failures
- `not_found_error()` - Resource not found
- `server_error()` - Internal server errors

### Logging
- Use `@log_event` macro for simulation events
- Include relevant context in log messages
- Use appropriate log levels (Info, Error, etc.)

## Debugging Tips

### Common Issues
1. **Missing `graph_info`** - Always call `validate_payload()` before `parse_network_graph()`
2. **State not found** - Check if simulation exists in `Cqn.STATE`
3. **Protocol errors** - Verify protocol parameters and types
4. **Simulation not running** - Check `is_running` and `simulation_paused` flags

### Useful Commands
```julia
# Check global state
keys(Cqn.STATE)

# Inspect simulation state
state = Cqn.STATE["simulation_name"]
state.is_running
state.simulation_last_active_time

# Test cleanup manually
Cqn.cleanup_stale_simulations_once()
```

## File Locations

- **Main code**: `src/`
- **Tests**: `test/`
- **Routes**: `routes.jl`
- **Configuration**: `config/`
- **Documentation**: `README.md`, `_docs_/`
- **Binaries**: `bin/`

## Dependencies

### Core
- Genie (web framework)
- QuantumSavory (quantum computing)
- ConcurrentSim (simulation)
- Graphs (network graphs)
- JSON (data serialization)

### Development
- SafeTestsets (testing)
- TestSetExtensions (testing)
- LoggingExtras (logging)

Remember: Always run tests after making changes, and ensure the server starts successfully before committing code.
