using Genie.Router
using SwagUI
using SwaggerMarkdown
using Genie.Renderer.Json

route("/") do
  Dict(:status => "OK") |> json
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
                  enum: ["created", "prepared", "running", "unknown"]
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
"""
route("/parse_network_graph", method="POST") do
  payload = extract_payload(Genie.Requests.jsonpayload(), Genie.Requests.rawpayload())

  # Check if extract_payload returned an error response
  if haskey(payload, "success") && !payload["success"]
    return json(payload)
  end

  validation_result = validate_payload(payload)

  if haskey(validation_result, "success") && !validation_result["success"]
    return json(validation_result)
  end

  @show validation_result

  g = build_graph(validation_result)

  # Create registers array based on node slots data
  registers, slot_mapping = create_registers_from_nodes(validation_result)

  @show g, registers

  # Create the RegisterNet from the graph and registers
  net = create_register_net(g, registers)

  state = Cqn.State(
    name = validation_result["data"]["name"],
    payload = validation_result,
    graph = g,
    network = net,
    slot_mapping = slot_mapping,
  )

  Cqn.STATE[payload["name"]] = state

  json(Cqn.serialize_state(state))
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
                  enum: ["created", "prepared", "running", "unknown"]
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
"""
route("/prepare_simulation", method="POST") do
  simulation_name = Genie.Requests.jsonpayload()["name"]

  if !haskey(Cqn.STATE, simulation_name)
    return json(Dict(:success => false, :error => "Simulation not found", :details => Dict(:name => simulation_name)), status=404)
  end

  state = Cqn.STATE[simulation_name]

  if state.network === nothing
    return json(Dict(:success => false, :error => "Network not found"))
  end

  # Get the time tracker from the network
  sim = get_network_time_tracker(state.network)

  # Launch protocols from payload over nodes, edges, and floating
  launch_counts = launch_protocols(state.payload, state.network, sim)

  state.simulation = sim
  state.protocols_launched = launch_counts

  Cqn.STATE[simulation_name] = state

  json(Cqn.serialize_state(state))
end

########################################################

@swagger """
/run_simulation:
  post:
    description: Run the simulation
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
                description: Number of time units to run the simulation for
    responses:
      '200':
        description: Simulation run successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                  example: true
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
  simulation_name = Genie.Requests.jsonpayload()["name"]
  time_units_raw = Genie.Requests.jsonpayload()["time_units"]

  # Handle time_units parameter with proper type conversion
  time_units = 10  # default value
  if time_units_raw !== nothing
    try
      if isa(time_units_raw, String)
        time_units = parse(Int, time_units_raw)
      elseif isa(time_units_raw, Number)
        time_units = Int(time_units_raw)
      else
        return json(Dict(:success => false, :error => "Invalid time_units type", :details => Dict(:received_type => string(typeof(time_units_raw)), :expected_type => "number or string")))
      end
    catch parse_error
      return json(Dict(:success => false, :error => "Failed to parse time_units", :details => Dict(:value => string(time_units_raw), :parse_error => string(parse_error))))
    end
  end

  if !haskey(Cqn.STATE, simulation_name)
    return json(Dict(:success => false, :error => "Simulation not found", :details => Dict(:name => simulation_name)), status=404)
  end

  state = Cqn.STATE[simulation_name]

  if state.simulation === nothing
    return json(Dict(:success => false, :error => "Simulation not found"))
  end

  run(state.simulation, time_units)

  # Mark that the simulation has been run
  state.has_run = true
  Cqn.STATE[simulation_name] = state

  json(Dict(:success => true))
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

  if !haskey(Cqn.STATE, simulation_name)
    return json(Dict(:success => false, :error => "Simulation not found", :details => Dict(:name => simulation_name)), status=404)
  end

  state = Cqn.STATE[simulation_name]
  json(Dict(:success => true, :state => Cqn.serialize_state(state)))
end

########################################################

@swagger """
/slots/{slot_id}/state:
  get:
    description: Get the state and entangled slots for a specific slot by ID.
    parameters:
      - name: slot_id
        in: path
        required: true
        schema:
          type: string
        description: The ID of the slot to inspect
      - name: name
        in: query
        required: true
        schema:
          type: string
        description: The name of the simulation containing the slot
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
                state:
                  type: object
                  description: The quantum state of the slot
                entangled_slots:
                  type: array
                  items:
                    type: string
                  description: List of slot IDs that are entangled with this slot
                is_locked:
                  type: boolean
                  description: Whether the slot is locked
                is_assigned:
                  type: boolean
                  description: Whether the slot has an assigned state
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
route("/slots/:slot_id/state", method="GET") do
  slot_id = string(params(:slot_id))
  simulation_name = string(params(:name))

  if !haskey(Cqn.STATE, simulation_name)
    return json(Dict(:success => false, :error => "Simulation not found", :details => Dict(:name => simulation_name)), status=404)
  end

  state = Cqn.STATE[simulation_name]
  result = Cqn.get_slot_state(slot_id, state)

  if haskey(result, "error")
    return json(Dict(:success => false, :error => result["error"]), status=404)
  end

  json(Dict(:success => true, result...))
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
  simulation_name = Genie.Requests.jsonpayload()["name"]

  if !haskey(Cqn.STATE, simulation_name)
    return json(Dict(:success => false, :error => "Simulation not found", :details => Dict(:name => simulation_name)), status=404)
  end

  delete!(Cqn.STATE, simulation_name)
  json(Dict(:success => true, :message => "Simulation destroyed"))
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

info = Dict{String, Any}()
info["title"] = "CQN API"
info["version"] = "1.0.0"
openApi = OpenAPI("3.0.0", info)
swagger_document = build(openApi)

route("/docs") do
    render_swagger(swagger_document)
end

########################################################

