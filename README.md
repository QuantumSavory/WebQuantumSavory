# CQN (Quantum Network API)

A Julia-based web API for quantum network operations, built with the Genie web framework and QuantumSavory quantum computing library.

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

## API Documentation

### Swagger UI
Access the interactive API documentation at:
```
http://localhost:8000/docs
```

The Swagger UI provides:
- Complete endpoint documentation
- Request/response schemas
- Interactive testing interface
- Example payloads

