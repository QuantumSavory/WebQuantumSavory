using Genie.Router
using SwagUI
using SwaggerMarkdown
using Genie.Renderer.Json
using InteractiveUtils
using QuantumSavory
using QuantumSavory.ProtocolZoo


route("/") do
  "OK"
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
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - nodes
              - edges
            properties:
              nodes:
                type: array
                description: Array of network nodes
                items:
                  type: object
                  properties:
                    id:
                      type: string
                      description: Unique identifier for the node
                    name:
                      type: string
                      description: Display name for the node
                    position:
                      type: array
                      description: Geographic coordinates [longitude, latitude]
                      items:
                        type: number
                    data:
                      type: object
                      properties:
                        type:
                          type: string
                          description: Type of the node (e.g., "City")
                        slots:
                          type: array
                          description: Array of quantum slots in the node
                          items:
                            type: object
                            properties:
                              id:
                                type: string
                                description: Unique identifier for the slot
                              type:
                                type: string
                                description: Type of quantum system (e.g., "qubit", "mubit")
                              backgroundNoise:
                                type: string
                                description: Background noise model for the slot
                              lastOperationTime:
                                type: number
                                description: Timestamp of last operation
                              assignment:
                                type: boolean
                                description: Whether the slot is assigned
                              isLocked:
                                type: boolean
                                description: Whether the slot is locked
                              representationType:
                                type: string
                                description: Type of representation
              edges:
                type: array
                description: Array of network connections
                items:
                  type: object
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
    responses:
      '200':
        description: Network graph successfully parsed
        content:
          application/json:
            schema:
              type: object
              description: The parsed network graph object
              additionalProperties: true
      '400':
        description: Invalid JSON payload
        content:
          application/json:
            schema:
              type: object
              properties:
                error:
                  type: string
                  description: Error message describing the parsing failure
"""

route("/parse_network_graph", method="POST") do
  try
    # Get the request body as JSON
    payload = Genie.Requests.jsonpayload()

    # Debug: log the payload type and content
    println("Payload type: ", typeof(payload))
    println("Payload: ", payload)

    # If jsonpayload() returns nothing, try to get the raw payload and parse it
    if payload === nothing
      raw_payload = Genie.Requests.rawpayload()
      println("Raw payload type: ", typeof(raw_payload))
      println("Raw payload: ", raw_payload)

      if isa(raw_payload, String)
        try
          payload = JSON.parse(raw_payload)
          println("Successfully parsed raw payload")
        catch parse_error
          return json(Dict(:error => "Failed to parse JSON from raw payload: $(parse_error)"))
        end
      else
        return json(Dict(:error => "No valid JSON payload found"))
      end
    end

    # Validate required fields
    if !haskey(payload, "nodes") || !haskey(payload, "edges")
      return json(Dict(:error => "Missing required fields: 'nodes' and 'edges' must be present"))
    end

    # Validate that nodes and edges are arrays (handle both Vector and JSON3.Array types)
    nodes_is_array = isa(payload["nodes"], Vector) || startswith(string(typeof(payload["nodes"])), "JSON3.Array")
    edges_is_array = isa(payload["edges"], Vector) || startswith(string(typeof(payload["edges"])), "JSON3.Array")

    if !nodes_is_array || !edges_is_array
      return json(Dict(:error => "Both 'nodes' and 'edges' must be arrays. Got: nodes=$(typeof(payload["nodes"])), edges=$(typeof(payload["edges"]))"))
    end

    # Return the parsed payload directly
    return json(payload)

  catch e
    # Return error if JSON parsing fails
    return json(Dict(:error => "Invalid JSON payload: $(e)"))
  end
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

function get_background_constructor_parameters(background_type)
  QuantumSavory.constructor_metadata(background_type)
end

function get_background_types()
  background_types = QuantumSavory.available_background_types()
  [
    Dict(
      :type => string(nameof(abt.type)),
      :doc => string(abt.doc),
      :parameters => get_background_constructor_parameters(abt.type)
    ) for abt in background_types
  ]
end

function get_slot_types()
  slot_types = QuantumSavory.available_slot_types()
  [Dict(:type => string(nameof(st.type)), :doc => string(st.doc)) for st in slot_types]
end

function get_protocol_types()
  protocol_types = QuantumSavory.ProtocolZoo.available_protocol_types()

  result = []
  for pt in protocol_types
    push!(result, Dict(:type => string(pt.type), :doc => string(pt.doc), :parameters => QuantumSavory.constructor_metadata(pt.type)))
  end

  result
end
