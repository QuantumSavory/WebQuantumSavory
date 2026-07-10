using Genie.Router
using SwagUI
using SwaggerMarkdown
using Genie.Renderer.Json
using Pkg
using TOML

"""Safe route wrappers: use `sroute(args...) do ... end` or `@sroute args... do ... end`"""
function _derive_route_name(args...; kwargs...)
  if !isempty(args) && isa(args[1], AbstractString)
    return String(args[1])
  elseif haskey(kwargs, :path)
    return String(get(kwargs, :path, ""))
  else
    return "route"
  end
end

function route(f::Function, args...; name=nothing, kwargs...)
  Genie.Router.route(args...; kwargs...) do
    route_name = isnothing(name) ? _derive_route_name(args...; kwargs...) : name
    safe_route_handler(() -> f(), route_name)
  end
end

function bootstrap()
# don't indent everything 
unsafe_code_evaluation_enabled() # validate the operator override during startup

route("/") do
  Genie.Router.serve_static_file("index.html")
end

########################################################


@swagger """
/simulations:
  get:
    description: List all existing simulations with their current status.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                simulations:
                  type: array
                  items:
                    type: object
                    properties:
                      name:
                        type: string
                      status:
                        type: string
                        enum: ["created", "prepared", "complete", "unknown"]
"""
route("/simulations", method="GET") do
  sims = [
    Dict(
      :name => state.name,
      :status => WebQuantumSavory._determine_status(state)
    ) for (_, state) in WebQuantumSavory.STATE
  ]

  json(Dict(:success => true, :simulations => sims))
end

########################################################

@swagger """
/background_types:
  get:
    description: Get the available background types.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                background_types:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: The name of the background type
                      doc:
                        type: string
                        description: Documentation describing the background type
                      parameters:
                        type: array
                        description: List of parameters for the background type
                        items:
                          type: object
                          properties:
                            field:
                              type: string
                              description: The parameter field name
                            type:
                              type: string
                              description: The parameter data type
                            doc:
                              type: string
                              description: Documentation describing the parameter
"""
route("/background_types") do
  Dict(:background_types => get_background_types()) |> json
end

########################################################

@swagger """
/slot_types:
  get:
    description: Get the available slot types.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                slot_types:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: The name of the slot type
                      doc:
                        type: string
                        description: Documentation describing the slot type
"""
route("/slot_types") do
  Dict(:slot_types => get_slot_types()) |> json
end

########################################################

@swagger """
/protocol_types:
  get:
    description: Get the available protocol types.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                protocol_types:
                  type: array
                  items:
                    type: object
                    properties:
                      type:
                        type: string
                        description: The name of the protocol type
                      doc:
                        type: string
                        description: Documentation describing the protocol type
                      parameters:
                        type: array
                        description: List of constructor parameters for the protocol type
                        items:
                          type: object
                          properties:
                            field:
                              type: string
                              description: The parameter field name
                            type:
                              oneOf:
                                - type: string
                                - type: object
                                  properties:
                                    name:
                                      type: string
                                      description: The type name
                                    lb:
                                      type: string
                                      description: The lower bound type
                                    ub:
                                      type: string
                                      description: The upper bound type
                              description: "The parameter type (can be a string or complex type object)"
                            doc:
                              type: string
                              description: Documentation describing the parameter
"""
route("/protocol_types") do
  Dict(:protocol_types => get_protocol_types()) |> json
end

########################################################

@swagger """
/parse_network_graph:
  post:
    description: Parse a network graph JSON payload and return the parsed object
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required:
              - name
              - net
            properties:
              name:
                type: string
                description: Name of the network
              net:
                type: object
                required:
                  - nodes
                  - edges
                properties:
                  nodes:
                    type: array
                    items:
                      type: object
                      required:
                        - id
                        - name
                        - position
                        - data
                      properties:
                        id:
                          type: string
                          description: Unique identifier for the node
                        name:
                          type: string
                          description: Display name for the node
                        position:
                          type: array
                          items:
                            type: number
                          minItems: 2
                          maxItems: 2
                          description: "[longitude, latitude] coordinates"
                        data:
                          type: object
                          properties:
                            type:
                              type: string
                              description: "Type of node (e.g., city, City)"
                            slots:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                  type:
                                    type: string
                                  backgroundNoise:
                                    type: string
                                  lastOperationTime:
                                    type: number
                                  assignment:
                                    type: boolean
                                  isLocked:
                                    type: boolean
                                  representationType:
                                    type: string
                            protocols:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                  type:
                                    type: string
                                  parameters:
                                    type: array
                                    items:
                                      type: object
                                      properties:
                                        name:
                                          type: string
                                        type:
                                          type: string
                                        value:
                                          oneOf:
                                            - type: string
                                            - type: number
                                            - type: boolean
                  edges:
                    type: array
                    items:
                      type: object
                      required:
                        - id
                        - source
                        - target
                      properties:
                        id:
                          type: string
                          description: Unique identifier for the edge
                        source:
                          type: string
                          description: Source node ID
                        target:
                          type: string
                          description: Target node ID
                        data:
                          type: object
                          properties:
                            type:
                              type: string
                              description: Type of connection
                            protocols:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Protocol identifier
                                  type:
                                    type: string
                                    description: Protocol type name
                                  parameters:
                                    type: array
                                    items:
                                      type: object
                                      properties:
                                        name:
                                          type: string
                                          description: Parameter name
                                        type:
                                          type: string
                                          description: Parameter type
                                        value:
                                          oneOf:
                                            - type: string
                                            - type: number
                                            - type: boolean
                                          description: Parameter value
                  protocols:
                    type: array
                    description: Array of floating protocols that operate at the network level
                    items:
                      type: object
                      properties:
                        id:
                          type: string
                          description: Protocol identifier
                        type:
                          type: string
                          description: Protocol type name
                        parameters:
                          type: array
                          items:
                            type: object
                            properties:
                              name:
                                type: string
                                description: Parameter name
                              type:
                                type: string
                                description: Parameter type
                              value:
                                oneOf:
                                  - type: string
                                  - type: number
                                  - type: boolean
                                description: Parameter value
    responses:
      '200':
        description: Network created and stored; returns serializable state information
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  description: Name of the simulation
                status:
                  type: string
                  description: Current status of the simulation
                  enum: ["created", "prepared", "complete", "unknown"]
                node_count:
                  type: integer
                  description: Number of nodes in the network
                edge_count:
                  type: integer
                  description: Number of edges in the network
                protocols_launched:
                  type: object
                  description: Count of launched protocols by category
                  additionalProperties:
                    type: integer
                  nullable: true
                slots:
                  type: object
                  description: Information about quantum slots and their entanglements
                  properties:
                    slots:
                      type: array
                      items:
                        type: object
                        properties:
                          slot_id:
                            type: string
                            description: Unique identifier for the slot
                          state_type:
                            type: string
                            nullable: true
                            description: Type of quantum state in the slot
                          is_locked:
                            type: boolean
                            description: Whether the slot is locked
                          is_assigned:
                            type: boolean
                            description: Whether the slot has an assigned state
                          entangled_slots:
                            type: array
                            items:
                              type: string
                            description: List of slot IDs that are entangled with this slot
                    entanglements:
                      type: array
                      items:
                        type: array
                        items:
                          type: string
                        description: Pairs of entangled slot IDs
                protocols:
                  type: object
                  description: Information about launched protocols
                  properties:
                    protocols:
                      type: array
                      items:
                        type: object
                        properties:
                          protocol_id:
                            type: string
                            description: Unique identifier for the protocol
                          protocol_type:
                            type: string
                            description: Type of the protocol
                simulation:
                  type: object
                  description: Simulation execution information
                  properties:
                    simulation_time:
                      type: number
                      nullable: true
                      description: Total time units for the simulation
                    simulation_progress:
                      type: number
                      nullable: true
                      description: Current simulation time progress
                    simulation_running:
                      type: string
                      enum: ["running", "complete", "not_started"]
                      description: Current simulation execution status
                    simulation_paused:
                      type: boolean
                      description: Whether the simulation is currently paused
                message:
                  type: string
                  description: Human-readable status message
      '400':
        description: Invalid JSON payload or missing required fields
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the validation failure
                details:
                  type: object
                  description: Additional error details
      '403':
        description: Payload requires unsafe Julia evaluation, which is disabled (UNSAFE_EVALUATION_DISABLED)
"""
route("/parse_network_graph", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  validation_result = validate_payload(payload)
  state = try
    WebQuantumSavory.parse_network_graph(validation_result)
  catch ex
    isa(ex, APIError) && rethrow(ex)
    throw(validation_error("Invalid graph - data can not be correctly parsed. Details: $ex"))
  end

  json(WebQuantumSavory.serialize_state(state))
end

########################################################

@swagger """
/prepare_simulation:
  post:
    description: Prepare the simulation for running
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
                description: Name of the simulation
    responses:
      '200':
        description: Simulation prepared and stored; returns serializable state information
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                  description: Name of the simulation
                status:
                  type: string
                  description: Current status of the simulation
                  enum: ["created", "prepared", "complete", "unknown"]
                node_count:
                  type: integer
                  description: Number of nodes in the network
                edge_count:
                  type: integer
                  description: Number of edges in the network
                protocols_launched:
                  type: object
                  description: Count of launched protocols by category
                  additionalProperties:
                    type: integer
                  nullable: true
                slots:
                  type: object
                  description: Information about quantum slots and their entanglements
                  properties:
                    slots:
                      type: array
                      items:
                        type: object
                        properties:
                          slot_id:
                            type: string
                            description: Unique identifier for the slot
                          state_type:
                            type: string
                            nullable: true
                            description: Type of quantum state in the slot
                          is_locked:
                            type: boolean
                            description: Whether the slot is locked
                          is_assigned:
                            type: boolean
                            description: Whether the slot has an assigned state
                          entangled_slots:
                            type: array
                            items:
                              type: string
                            description: List of slot IDs that are entangled with this slot
                    entanglements:
                      type: array
                      items:
                        type: array
                        items:
                          type: string
                        description: Pairs of entangled slot IDs
                protocols:
                  type: object
                  description: Information about launched protocols
                  properties:
                    protocols:
                      type: array
                      items:
                        type: object
                        properties:
                          protocol_id:
                            type: string
                            description: Unique identifier for the protocol
                          protocol_type:
                            type: string
                            description: Type of the protocol
                simulation:
                  type: object
                  description: Simulation execution information
                  properties:
                    simulation_time:
                      type: number
                      nullable: true
                      description: Total time units for the simulation
                    simulation_progress:
                      type: number
                      nullable: true
                      description: Current simulation time progress
                    simulation_running:
                      type: string
                      enum: ["running", "complete", "not_started"]
                      description: Current simulation execution status
                    simulation_paused:
                      type: boolean
                      description: Whether the simulation is currently paused
                message:
                  type: string
                  description: Human-readable status message
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the validation failure
                details:
                  type: object
                  description: Additional error details
      '403':
        description: Protocol parameters require unsafe Julia evaluation, which is disabled (UNSAFE_EVALUATION_DISABLED)
"""
route("/prepare_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  state = WebQuantumSavory.STATE[simulation_name]

  if state.network === nothing
    throw(validation_error("Network not found in simulation $simulation_name"))
  end

  # Prepare the simulation, logging unexpected errors to the simulation's log stream
  try
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
  catch e
    isa(e, APIError) && rethrow(e)

    # Log a human-readable message into the simulation logs for frontend display
    @log_event state Logging.Error "Error preparing simulation $simulation_name: $(e)" error_type=string(typeof(e))

    # Rethrow so that safe_route_handler can still produce a proper HTTP error response
    throw(validation_error("Error preparing simulation $simulation_name: $(e)", Dict("error" => string(e))))
  end

  json(WebQuantumSavory.serialize_state(state))
end

########################################################

function _parse_time_input(time_units_raw)
  # Handle time_units parameter with proper type conversion
  time_units = 10.0  # default value
  if time_units_raw !== nothing
    try
      if isa(time_units_raw, String)
        time_units = parse(Float64, time_units_raw)
      elseif isa(time_units_raw, Number)
        time_units = Float64(time_units_raw)
      else
        throw(validation_error("time_units must be a number or string", Dict("received_type" => string(typeof(time_units_raw)))))
      end
    catch e
      if isa(e, APIError)
        rethrow(e)
      else
        throw(validation_error("Invalid time_units value: $(time_units_raw)", Dict("error" => string(e))))
      end
    end
  end

  time_units
end

@swagger """
/run_simulation:
  post:
    description: Start or resume a simulation in a cooperative background task
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
                description: Name of the simulation
              time_units:
                type: number
                description: Absolute cumulative simulation-time target
    responses:
      '202':
        description: Simulation run accepted
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                status:
                  type: string
                  example: started
                state:
                  type: object
                  description: State immediately after accepting the run
      '400':
        description: Simulation is unprepared, already running, or has an invalid target
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/run_simulation", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  simulation_name = payload["name"]
  time_units = _parse_time_input(payload["time_units"])

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  state = WebQuantumSavory.STATE[simulation_name]

  if state.simulation === nothing
    throw(validation_error("Simulation not prepared"))
  end

  try
    WebQuantumSavory.run_simulation(state, time_units, simulation_name)
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      @error stacktrace(catch_backtrace())
      @show e
      throw(server_error("Error running simulation: $e", Dict("error" => string(e))))
    end
  end

  json(
    Dict(:success => true, :status => "started", :state => WebQuantumSavory.serialize_state(state));
    status=202,
  )
end

########################################################

@swagger """
/get_state:
  get:
    description: Get the state of the simulation
    parameters:
      - name: name
        in: query
        required: true
        schema:
          type: string
    responses:
      '200':
        description: Returns the current simulation state
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                state:
                  type: object
                  description: Complete simulation state information
                  properties:
                    name:
                      type: string
                      description: Name of the simulation
                    status:
                      type: string
                      description: Current status of the simulation
                      enum: ["created", "prepared", "complete", "unknown"]
                    node_count:
                      type: integer
                      description: Number of nodes in the network
                    edge_count:
                      type: integer
                      description: Number of edges in the network
                    protocols_launched:
                      type: object
                      description: Count of launched protocols by category
                      additionalProperties:
                        type: integer
                      nullable: true
                    slots:
                      type: object
                      description: Information about quantum slots and their entanglements
                      properties:
                        slots:
                          type: array
                          items:
                            type: object
                            properties:
                              slot_id:
                                type: string
                                description: Unique identifier for the slot
                              state_type:
                                type: string
                                nullable: true
                                description: Type of quantum state in the slot
                              is_locked:
                                type: boolean
                                description: Whether the slot is locked
                              is_assigned:
                                type: boolean
                                description: Whether the slot has an assigned state
                              entangled_slots:
                                type: array
                                items:
                                  type: string
                                description: List of slot IDs that are entangled with this slot
                        entanglements:
                          type: array
                          items:
                            type: array
                            items:
                              type: string
                            description: Pairs of entangled slot IDs
                    protocols:
                      type: object
                      description: Information about launched protocols
                      properties:
                        protocols:
                          type: array
                          items:
                            type: object
                            properties:
                              protocol_id:
                                type: string
                                description: Unique identifier for the protocol
                              protocol_type:
                                type: string
                                description: Type of the protocol
                    simulation:
                      type: object
                      description: Simulation execution information
                      properties:
                        simulation_time:
                          type: number
                          nullable: true
                          description: Total time units for the simulation
                        simulation_progress:
                          type: number
                          nullable: true
                          description: Current simulation time progress
                        simulation_running:
                          type: string
                          enum: ["running", "complete", "not_started"]
                          description: Current simulation execution status
                    message:
                      type: string
                      description: Human-readable status message
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/get_state", method="GET") do
  simulation_name = Genie.Requests.getpayload()[:name]

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  state = WebQuantumSavory.STATE[simulation_name]
  json(Dict(:success => true, :state => WebQuantumSavory.serialize_state(state)))
end

########################################################

@swagger """
/slots/{name}/{slot_id}:
  get:
    description: Get the state and entangled slots for a specific slot by ID.
    parameters:
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the simulation containing the slot
      - name: slot_id
        in: path
        required: true
        schema:
          type: string
        description: The ID of the slot to inspect
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                slot_id:
                  type: string
                  description: The ID of the inspected slot
                state_type:
                  type: string
                  nullable: true
                  description: Type of quantum state in the slot
                is_locked:
                  type: boolean
                  description: Whether the slot is locked
                is_assigned:
                  type: boolean
                  description: Whether the slot has an assigned state
                access_time:
                  type: number
                  nullable: true
                  description: Last access time for the slot
                entangled_slots:
                  type: array
                  items:
                    type: string
                  description: List of slot IDs that are entangled with this slot
                entangled_slot_details:
                  type: array
                  items:
                    type: object
                    properties:
                      slot_id:
                        type: string
                        nullable: true
                        description: ID of the entangled slot
                      parent_reg_index:
                        type: integer
                        description: Index of the parent register
                      slot_index:
                        type: integer
                        description: Index of the slot within the register
                      parent_reg:
                        type: string
                        description: Type of the parent register
                  description: Detailed information about entangled slots
                html_base64:
                  type: string
                  nullable: true
                  description: HTML representation of the slot state encoded as base64
                png_base64:
                  type: string
                  nullable: true
                  description: PNG representation of the slot state encoded as base64
      '404':
        description: Simulation or slot not found
        content:

          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/slots/:name/:slot_id", method="GET") do
  slot_id = string(params(:slot_id))
  simulation_name = string(params(:name))

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  state = WebQuantumSavory.STATE[simulation_name]
  result = WebQuantumSavory.get_slot_state(slot_id, state)

  json(Dict(:success => true, result...))
end

########################################################

@swagger """
/pause_simulation:
  post:
    description: Pause a running simulation
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
                description: Name of the simulation to pause
    responses:
      '200':
        description: Simulation paused successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: Simulation paused
                state:
                  type: object
                  description: State after the run task acknowledges the pause
      '400':
        description: Simulation is not running
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/pause_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  try
    state = WebQuantumSavory.STATE[simulation_name]
    WebQuantumSavory.pause_simulation(state)

    json(Dict(
      :success => true,
      :message => "Simulation paused",
      :state => WebQuantumSavory.serialize_state(state),
    ))
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      @error stacktrace(catch_backtrace())
      @show e
      throw(server_error("Error pausing simulation: $e", Dict("error" => string(e))))
    end
  end
end

########################################################

@swagger """
/destroy_simulation:
  post:
    description: Destroy the simulation
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
    responses:
      '200':
        description: Simulation destroyed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: Simulation destroyed
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/destroy_simulation", method="POST") do
  simulation_name = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())["name"]

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  if WebQuantumSavory.destroy_simulation(simulation_name)
    json(Dict(:success => true, :message => "Simulation destroyed and resources cleaned up"))
  else
    json(Dict(:success => true, :message => "Simulation destroyed (cleanup had warnings)", :warning => "Some resources may not have been fully cleaned up"))
  end
end

########################################################

@swagger """
/protocols/{name}/{protocol_id}:
  get:
    description: Get the state and visual representation for a specific protocol by ID.
    parameters:
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the simulation containing the protocol
      - name: protocol_id
        in: path
        required: true
        schema:
          type: string
        description: The ID of the protocol to inspect
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                protocol_id:
                  type: string
                  description: The ID of the inspected protocol
                protocol_type:
                  type: string
                  description: The type of the protocol
                html_base64:
                  type: string
                  description: HTML representation of the protocol encoded as base64
                png_base64:
                  type: string
                  description: PNG representation of the protocol encoded as base64
      '404':
        description: Simulation or protocol not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/protocols/:name/:protocol_id", method="GET") do
  protocol_id = string(params(:protocol_id))
  simulation_name = string(params(:name))

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  state = WebQuantumSavory.STATE[simulation_name]
  result = WebQuantumSavory.get_protocol_state(protocol_id, state)

  json(Dict(:success => true, result...))
end

########################################################

@swagger """
/status:
  get:
    description: Get the status of the server.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                status:
                  type: string
"""
route("/status") do
  Dict(:status => "OK") |> json
end

########################################################

@swagger """
/known_functions:
  get:
    summary: List known Julia functions usable as argument values
    description: Returns the whitelist of supported Julia functions that can be referenced in request payloads as argument values.
    responses:
      '200':
        description: Successful response with the list of known functions
        content:
          application/json:
            schema:
              type: object
              properties:
                known_functions:
                  type: array
                  items:
                    type: string
                  description: Array of function names
            examples:
              default:
                summary: Example response
                value:
                  known_functions: ["minimum", "maximum", "abs", "identity", "<(self)", ">(self)", "≤(self)", "≥(self)", "==(self)"]
"""
route("/known_functions") do
  Dict(:known_functions => WebQuantumSavory.known_functions()) |> json
end

########################################################

@swagger """
/test_code:
  post:
    summary: Test Julia code in a fresh module
    description: |
      Execute Julia code in the server process and return the results. The
      fresh module isolates names but is not a security sandbox. This endpoint
      is available only when unsafe code evaluation is enabled.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              code:
                type: string
                description: Julia code to execute
                example: "function add(a, b)\nreturn a + b\nend"
            required:
              - code
    responses:
      '200':
        description: Code executed successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                message:
                  type: string
                  example: "Code executed successfully"
                results:
                  type: object
                  description: Functions and variables defined in the code
                  properties:
                    functions:
                      type: array
                      items:
                        type: string
                      description: Names of functions created
                      example: ["add", "multiply"]
                    variables:
                      type: object
                      description: Variables and constants defined
                      example: {"PI": 3.14159}
      '400':
        description: Code execution failed
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Detailed error message
                  example: "UndefVarError: `unknown_function` not defined"
                error_type:
                  type: string
                  description: Type of error that occurred
                  example: "UndefVarError"
      '403':
        description: Unsafe Julia code evaluation is disabled
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  example: Unsafe Julia code evaluation is disabled
                error_code:
                  type: string
                  example: UNSAFE_EVALUATION_DISABLED
"""
route("/test_code", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  if !haskey(payload, "code")
    throw(validation_error("Missing required field 'code'", Dict("required_field" => "code")))
  end

  code_string = payload["code"]
  require_unsafe_code_evaluation()

  # Evaluate in a fresh namespace; Sandbox also enforces the policy for direct callers.
  success, results, error = Sandbox.test_code(code_string)

  if success
    json(Dict(
      :success => true,
      :message => "Code executed successfully",
      :results => results
    ))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

@swagger """
/test_symbolic_expression:
  post:
    summary: Evaluate a symbolic expression and return its LaTeX form
    description: |
      Parses and evaluates a symbolic expression in the server process, in a
      fresh module with QuantumSavory preloaded. The module is not a security
      sandbox. This endpoint is available only when unsafe code evaluation is
      enabled.
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              expr:
                type: string
                description: Symbolic expression to evaluate
                example: "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
            required:
              - expr
    responses:
      '200':
        description: Expression evaluated successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
                results:
                  type: object
                  description: Evaluation results
                  properties:
                    value:
                      type: string
                      description: Stringified result of the evaluated expression
                    latex:
                      type: string
                      description: LaTeX representation of the evaluated expression
      '400':
        description: Evaluation failed
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Detailed error message
                error_type:
                  type: string
                  description: Type of error that occurred
      '403':
        description: Unsafe Julia code evaluation is disabled
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  example: Unsafe Julia code evaluation is disabled
                error_code:
                  type: string
                  example: UNSAFE_EVALUATION_DISABLED
"""
route("/test_symbolic_expression", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  if !haskey(payload, "expr")
    throw(validation_error("Missing required field 'expr'", Dict("required_field" => "expr")))
  end

  expr = payload["expr"]
  require_unsafe_code_evaluation()

  success, results, error = Sandbox.test_symbolic_expression(expr)

  if success
    json(Dict(:success => true, :results => results, :message => "Expression evaluated successfully"))
  else
    json(evaluation_failure_response(error))
  end
end

########################################################

@swagger """
/platform_info:
  get:
    description: Get platform and application version information.
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                versions:
                  type: object
                  properties:
                    julia:
                      type: string
                      description: Julia version string
                      example: "1.10.4"
                    quantumsavory:
                      type: string
                      nullable: true
                      description: Installed QuantumSavory version or null if not found
                      example: "0.3.1"
                    app:
                      type: string
                      nullable: true
                      description: Application version from Project.toml
                      example: "1.0.0"
                capabilities:
                  type: object
                  properties:
                    unsafe_code_evaluation:
                      type: boolean
                      description: Whether raw Julia code and symbolic evaluation are enabled
"""
route("/platform_info") do
  julia_version = string(VERSION)

  quantumsavory_version = try
    deps = Pkg.dependencies()
    found = nothing
    for (_, pkg) in deps
      if pkg.name == "QuantumSavory"
        found = string(pkg.version)
        break
      end
    end

    found
  catch
    nothing
  end

  app_version = try
    proj = TOML.parsefile(joinpath(@__DIR__, "Project.toml"))
    get(proj, "version", nothing)
  catch
    nothing
  end

  json(
    Dict(
      :versions => Dict(
        :julia => julia_version,
        :quantumsavory => quantumsavory_version,
        :app => app_version,
      ),
      :capabilities => Dict(
        :unsafe_code_evaluation => unsafe_code_evaluation_enabled(),
      ),
    )
  )
end

########################################################

@swagger """
/logs/{name}:
  get:
    description: Get and optionally purge log events from a simulation
    parameters:
      - name: name
        in: path
        required: true
        schema:
          type: string
        description: The name of the simulation
      - name: purge
        in: query
        required: false
        schema:
          type: boolean
          default: true
        description: Whether to purge the logs after reading them
    responses:
      '200':
        description: OK
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                logs:
                  type: array
                  items:
                    type: object
                    properties:
                      level:
                        type: string
                        description: Log level (Debug, Info, Warn, Error)
                      message:
                        type: string
                        description: Log message
                      module:
                        type: string
                        description: Module that generated the log
                      group:
                        type: string
                        nullable: true
                        description: Optional group identifier
                      id:
                        type: string
                        nullable: true
                        description: Optional ID identifier
                count:
                  type: integer
                  description: Number of log events returned
      '404':
        description: Simulation not found
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: false
                error:
                  type: string
                  description: Error message describing the issue
"""
route("/logs/:name", method="GET") do
  simulation_name = string(params(:name))


  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  purge_raw = Genie.Requests.getpayload(:purge, "true")
  purge = purge_raw isa Bool ? purge_raw : (lowercase(string(purge_raw)) in ("true", "1", "yes", "on"))

  logs = WebQuantumSavory.get_logs(simulation_name, purge)

  json(Dict(
    :success => true,
    :logs => logs,
    :count => length(logs)
  ))
end

########################################################

@swagger """
/dev/manipulate_state:
  post:
    summary: Dev-only endpoint to manipulate simulation state for testing
    description: Allows modification of simulation state fields for testing purposes. Only available in dev environment.
    tags:
      - Dev
    requestBody:
      content:
        application/json:
          schema:
            type: object
            required:
              - name
            properties:
              name:
                type: string
                description: Name of the simulation
              is_running:
                type: boolean
                description: Set simulation running state
              simulation_paused:
                type: boolean
                description: Set simulation paused state
              has_run:
                type: boolean
                description: Set whether simulation has run
              simulation_progress:
                type: number
                description: Set simulation progress
              simulation_started_at:
                type: string
                nullable: true
                description: Set simulation start time
              simulation_last_active_time:
                type: string
                description: Set last active time
    responses:
      '200':
        description: State updated successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                message:
                  type: string
                name:
                  type: string
      '400':
        description: Validation error
      '404':
        description: Simulation not found
      '500':
        description: Internal server error or not in dev mode
"""
# Dev/test-only endpoint for test support
route("/dev/manipulate_state", method="POST") do
  if !(Genie.Configuration.isdev() || Genie.Configuration.istest())
    throw(server_error("This endpoint is only available in dev or test environment"))
  end

  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())
  
  if !haskey(payload, "name")
    throw(validation_error("Missing required field: 'name'"))
  end

  simulation_name = payload["name"]

  if !haskey(WebQuantumSavory.STATE, simulation_name)
    throw(not_found_error("Simulation", simulation_name))
  end

  state = WebQuantumSavory.STATE[simulation_name]

  # Allow manipulation of various fields
  if haskey(payload, "is_running")
    state.is_running = payload["is_running"]
  end

  if haskey(payload, "simulation_paused")
    state.simulation_paused = payload["simulation_paused"]
  end

  if haskey(payload, "has_run")
    state.has_run = payload["has_run"]
  end

  if haskey(payload, "simulation_progress")
    state.simulation_progress = payload["simulation_progress"]
  end

  if haskey(payload, "simulation_started_at")
    if payload["simulation_started_at"] === nothing
      state.simulation_started_at = nothing
    else
      # Assume it's a timestamp string or DateTime
      state.simulation_started_at = payload["simulation_started_at"]
    end
  end

  if haskey(payload, "simulation_last_active_time")
    state.simulation_last_active_time = payload["simulation_last_active_time"]
  end

  json(Dict(:success => true, :message => "State updated", :name => simulation_name))
end

########################################################

info = Dict{String,Any}()
info["title"] = "WebQuantumSavory API"
info["version"] = "1.5.0"
openApi = OpenAPI("3.0.0", info)
swagger_document = build(openApi)

route("/docs") do
  render_swagger(swagger_document)
end

########################################################

try 
  @async WebQuantumSavory.cleanup_stale_simulations() |> errormonitor
catch e
  @error "Error starting cleanup_stale_simulations" error=e
end

########################################################

end # bootstrap()

bootstrap()
