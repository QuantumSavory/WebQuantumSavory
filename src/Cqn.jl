module Cqn

using Genie

using QuantumSavory
using QuantumSavory.ProtocolZoo
using InteractiveUtils
using REPL
import JSON
using Graphs
using ConcurrentSim
using Logging
using Base64

include("constructors.jl")
include("errors.jl")

const up = Genie.up
export up

@kwdef mutable struct State
  name::String
  payload::Union{Nothing, Dict} = nothing
  graph::Union{Nothing, SimpleGraph} = nothing
  network::Union{Nothing, RegisterNet} = nothing
  protocols_launched::Union{Nothing, Dict{String, Int}} = nothing
  simulation::Union{Nothing, Simulation} = nothing
  has_run::Bool = false
  slot_mapping::Union{Nothing, Dict{String, Any}} = nothing
  protocol_mapping::Union{Nothing, Dict{String, Any}} = nothing
end

const STATE = Dict{String, State}()

function main()
  Genie.genie(; context = @__MODULE__)
end

function get_background_constructor_parameters(background_type)
  QuantumSavory.constructor_metadata(background_type)
end

function get_background_types()
  background_types = QuantumSavory.available_background_types()
  [
    Dict(
      "type" => string(nameof(abt.type)),
      "doc" => string(abt.doc),
      "parameters" => get_background_constructor_parameters(abt.type)
    ) for abt in background_types
  ]
end

function get_slot_types()
  slot_types = QuantumSavory.available_slot_types()
  [Dict("type" => string(nameof(st.type)), "doc" => string(st.doc)) for st in slot_types]
end

function get_protocol_types()
  protocol_types = QuantumSavory.ProtocolZoo.available_protocol_types()

  result = []
  for pt in protocol_types
    pts = QuantumSavory.constructor_metadata(pt.type)

    nodes_count = pt.nodeargs
    if nodes_count == 1
      group = "node"
    elseif nodes_count == 2
      group = "edge"
    else
      group = "floating"
    end

    push!(result, Dict("type" => string(pt.type), "doc" => string(pt.doc), "group" => group, "parameters" => pts))
  end

  result
end

function extract_payload(payload = nothing, raw_payload = nothing)
  # If jsonpayload() returns nothing, try to get the raw payload and parse it
  if payload === nothing
    if isa(raw_payload, String)
      try
        payload = JSON.parse(raw_payload)
      catch parse_error
        throw(validation_error("Failed to parse JSON from raw payload", Dict{String, Any}("parse_error" => string(parse_error))))
      end
    else
      throw(validation_error("No valid JSON payload found", Dict{String, Any}("raw_payload_type" => string(typeof(raw_payload)))))
    end
  end

  payload
end

function validate_payload(payload)
  try
    # Validate top-level structure
    if !haskey(payload, "name")
      throw(validation_error("Missing required field: 'name' must be present"))
    end

    if !haskey(payload, "net")
      throw(validation_error("Missing required field: 'net' must be present"))
    end

    net = payload["net"]

    # Validate net structure
    if !haskey(net, "nodes") || !haskey(net, "edges")
      throw(validation_error("Missing required fields in 'net': 'nodes' and 'edges' must be present"))
    end

    nodes = net["nodes"]
    edges = net["edges"]

    # Validate that nodes and edges are arrays
    if !isa(nodes, Vector) && !startswith(string(typeof(nodes)), "JSON3.Array")
      throw(validation_error("Field 'nodes' must be an array", Dict{String, Any}("nodes_type" => string(typeof(nodes)))))
    end

    if !isa(edges, Vector) && !startswith(string(typeof(edges)), "JSON3.Array")
      throw(validation_error("Field 'edges' must be an array", Dict{String, Any}("edges_type" => string(typeof(edges)))))
    end

    # Validate each node structure
    node_ids = Set{String}()
    for (i, node) in enumerate(nodes)
      # Check required node fields
      if !haskey(node, "id")
        throw(validation_error("Node $i missing required field: 'id'"))
      end

      if !haskey(node, "name")
        throw(validation_error("Node $i missing required field: 'name'"))
      end

      if !haskey(node, "position")
        throw(validation_error("Node $i missing required field: 'position'"))
      end

      if !haskey(node, "data")
        throw(validation_error("Node $i missing required field: 'data'"))
      end

      # Check for duplicate node IDs
      node_id = string(node["id"])
      if node_id in node_ids
        throw(validation_error("Duplicate node ID: '$node_id'"))
      end
      push!(node_ids, node_id)
    end

    # Validate each edge structure
    edge_connections = []
    for (i, edge) in enumerate(edges)
      # Check required edge fields
      if !haskey(edge, "id")
        throw(validation_error("Edge $i missing required field: 'id'"))
      end

      if !haskey(edge, "source")
        throw(validation_error("Edge $i missing required field: 'source'"))
      end

      if !haskey(edge, "target")
        throw(validation_error("Edge $i missing required field: 'target'"))
      end

      # Validate source and target reference existing nodes
      source = string(edge["source"])
      target = string(edge["target"])

      if !(source in node_ids)
        throw(validation_error("Edge $i references non-existent source node: '$source'"))
      end

      if !(target in node_ids)
        throw(validation_error("Edge $i references non-existent target node: '$target'"))
      end

      push!(edge_connections, Dict("source" => source, "target" => target))
    end

    # Prepare success response with graph info
    response = Dict(
      "success" => true,
      "message" => "Network graph parsed successfully",
      "data" => payload,
      "graph_info" => Dict(
        "node_count" => length(nodes),
        "edge_count" => length(edges),
        "node_ids" => collect(node_ids),
        "edge_connections" => edge_connections,
        "nodes" => nodes,
        "edges" => edges
      )
    )

    return response

  catch e
    # Re-throw validation errors, wrap unexpected errors
    if isa(e, APIError)
      rethrow(e)
    else
      throw(server_error("Unexpected error during parsing", Dict{String, Any}("exception" => string(e))))
    end
  end
end

function build_graph(data)
  # Extract nodes and edges from payload
  nodes = data["graph_info"]["nodes"]
  edges = data["graph_info"]["edges"]

  # Map external node ids (e.g., "node1") to 1..N indices
  id_to_idx = Dict(String(n["id"]) => i for (i, n) in enumerate(nodes))

  g = SimpleGraph(length(nodes))
  for edge in edges
    add_edge!(g, id_to_idx[edge["source"]], id_to_idx[edge["target"]])
  end

  g
end

function create_registers_from_nodes(data)
  # Extract nodes from the validation result
  nodes = data["graph_info"]["nodes"]

  # Create array of Register objects based on slots data
  registers = []
  slot_mapping = Dict{String, Any}()

  for node in nodes
    node_data = node["data"]
    slots = get(node_data, "slots", [])

    isempty(slots) && continue # TODO: what to do with empty slots?

    # Parse traits (Qubit/Qumode) and background noise for each slot
    traits = []
    background_noise = QuantumSavory.AbstractBackground[]

    for slot_data in slots
      # Parse slot type dynamically
      slot_type_str = slot_data["type"]
      slot_type = _resolve_type_from_string(slot_type_str, :slot)
      if slot_type === nothing
        error("Unknown slot type: $slot_type_str")
      end
      push!(traits, slot_type())

      # Parse background noise type and instantiate with lastOperationTime
      noise_type_str = slot_data["backgroundNoise"]
      last_op_time = slot_data["lastOperationTime"]

      noise_type = _resolve_type_from_string(noise_type_str, :noise)
      if noise_type === nothing
        error("Unknown background noise type: $noise_type_str")
      end
      push!(background_noise, noise_type(last_op_time))
    end

    # Create the Register object with traits and background noise
    register = Register(traits, background_noise)
    push!(registers, register)

    # Map slot IDs to actual slot objects
    for (slot_idx, slot_data) in enumerate(slots)
      slot_id = slot_data["id"]
      slot_mapping[slot_id] = register[slot_idx]
    end
  end

  (registers, slot_mapping)
end

function create_register_net(graph, registers)
  # Create a network from the graph and the registers
  RegisterNet(graph, registers)
end

function get_network_time_tracker(network)
  # Get the time tracker from the network
  get_time_tracker(network)
end

function _resolve_protocol_type_from_string(type_str::AbstractString, input_lower::AbstractString)
  # Get available protocol types for whitelist
  available_types = QuantumSavory.ProtocolZoo.available_protocol_types()

  # Find matching type (case-insensitive)
  for pt in available_types
    type_name = string(pt.type)
    if lowercase(type_name) == input_lower
      return pt.type
    end
  end

  @warn "Protocol type not found in whitelist" type_str=type_str
  return nothing
end

function _resolve_noise_type_from_string(type_str::AbstractString, input_lower::AbstractString)
  # Get available noise types for whitelist
  background_types = QuantumSavory.available_background_types()

  if input_lower == "default"
    @warn "Using default noise type" type_str=type_str
    return background_types[1].type
  end

  for bt in background_types
    type_name = string(bt.type |> nameof)
    if lowercase(type_name) == input_lower
      return bt.type
    end
  end

  @warn "Noise type not found in whitelist" type_str=type_str
  return nothing
end

function _resolve_slot_type_from_string(type_str::AbstractString, input_lower::AbstractString)
  # Get available slot types for whitelist
  slot_types = QuantumSavory.available_slot_types()
  for st in slot_types
    type_name = string(st.type |> nameof)
    if lowercase(type_name) == input_lower
      return st.type
    end
  end

  @warn "Slot type not found in whitelist" type_str=type_str
  return nothing
end

function _resolve_type_from_string(type_str::AbstractString, type_group::Symbol)
  # Convert input to lowercase for case-insensitive comparison
  input_lower = lowercase(type_str)

  if type_group == :protocol
    return _resolve_protocol_type_from_string(type_str, input_lower)
  elseif type_group == :noise
    return _resolve_noise_type_from_string(type_str, input_lower)
  elseif type_group == :slot
    return _resolve_slot_type_from_string(type_str, input_lower)
  end
end


function _instantiate_protocol(prot_def, ctx::Dict{Symbol,Any})
  # Handle both Dict{String,Any} and JSON3.Object types
  tstr = get(prot_def, "type", nothing)
  tstr === nothing && return nothing
  T = _resolve_type_from_string(String(tstr), :protocol)
  T === nothing && return nothing

  params = Vector{Any}(get(prot_def, "parameters", Any[]))

  # Keyword name mappings for exceptions
  keyword_mappings = Dict(
    "log" => "_log"
  )

  # Build keyword arguments from all parameters
  kwargs = Dict{Symbol, Any}()

  # Add sim, net, and node(s) as keyword arguments
  kwargs[:sim] = ctx[:sim]
  kwargs[:net] = ctx[:net]

  if haskey(ctx, :node)
    kwargs[:node] = ctx[:node]
  elseif haskey(ctx, :nodeA) && haskey(ctx, :nodeB)
    kwargs[:nodeA] = ctx[:nodeA]
    kwargs[:nodeB] = ctx[:nodeB]
  end

  # Add remaining parameters as keyword arguments
  for p in params
    original_name = String(p["name"])
    name = Symbol(original_name)
    value = get(p, "value", nothing)

    # Skip sim, net, node parameters as they're already handled above
    if name in [:sim, :net, :node, :nodeA, :nodeB]
      continue
    end

    # Skip parameters without values
    if value === nothing
      @warn "Parameter has no value, skipping" parameter_name=name
      continue
    end

    # Apply keyword name mapping if it exists
    if haskey(keyword_mappings, original_name)
      name = Symbol(keyword_mappings[original_name])
    end

    # Convert value based on type
    ptype = string(p["type"])

    # Try to convert the value, fall back gracefully if it fails
    try
      if ptype in ("Int", "Int64") && value !== nothing
        try
          kwargs[name] = parse(Int, string(value))
        catch
          @warn "Cannot convert to Int, skipping parameter" parameter_name=name value=value
        end
      elseif ptype in ("Float64", "Float32") && value !== nothing
        try
          kwargs[name] = parse(Float64, string(value))
        catch
          @warn "Cannot convert to Float64, skipping parameter" parameter_name=name value=value
        end
      elseif ptype in ("Bool",) && value !== nothing
        # Handle Bool conversion from various types
        if isa(value, Bool)
          kwargs[name] = value
        elseif isa(value, String)
          lower_val = lowercase(value)
          if lower_val in ("true", "1", "yes", "on")
            kwargs[name] = true
          elseif lower_val in ("false", "0", "no", "off")
            kwargs[name] = false
          else
            @warn "Invalid Bool value, skipping parameter" parameter_name=name value=value
            # Skip this parameter - don't add to kwargs
          end
        elseif isa(value, Number)
          kwargs[name] = value != 0
        else
          @warn "Cannot convert to Bool, skipping parameter" parameter_name=name value=value value_type=typeof(value)
          # Skip this parameter - don't add to kwargs
        end
      elseif occursin(r"Union\{.*Nothing.*\}", ptype) && value !== nothing
        # Handle Union types that include Nothing (optional parameters)
        if isa(value, String) && lowercase(value) == "nothing"
          kwargs[name] = nothing
        elseif occursin(r"Float\d+", ptype)
          try
            kwargs[name] = parse(Float64, string(value))
          catch
            @warn "Cannot convert Union Float64, skipping parameter" parameter_name=name value=value
          end
        elseif occursin(r"Int\d*", ptype)
          try
            kwargs[name] = parse(Int, string(value))
          catch
            @warn "Cannot convert Union Int, skipping parameter" parameter_name=name value=value
          end
        elseif occursin(r"String", ptype)
          kwargs[name] = string(value)
        else
          @warn "Cannot convert Union type, skipping parameter" parameter_name=name parameter_type=ptype value=value
        end
      else
        # For complex types, try eval with value::type pattern
        eval_expr = "$(value)::$(ptype)"
        try
          @info "Attempting eval" parameter_name=name eval_expr=eval_expr
          kwargs[name] = eval(Meta.parse(eval_expr))
          @info "Eval successful" parameter_name=name
        catch eval_error
          @warn "Eval failed, skipping parameter" parameter_name=name eval_expr=eval_expr eval_error=eval_error
          # If eval fails, skip the parameter entirely - let constructor use default
          # Don't add to kwargs
        end
      end
    catch e
      @warn "Failed to convert parameter" parameter_name=name parameter_type=ptype value=value error=e
      # Don't set the parameter - let the constructor use its default value
    end
  end

  # Instantiate with all keyword arguments
  @info "Instantiating protocol" protocol_type=T kwargs=kwargs
  # Convert kwargs dict to keyword arguments
  return T(; (k => v for (k, v) in kwargs)...)
end

function get_protocol_state(protocol_id::String, state::State)
  # Check if protocol exists in mapping
  if state.protocol_mapping === nothing || !haskey(state.protocol_mapping, protocol_id)
    throw(not_found_error("Protocol", protocol_id))
  end

  protocol = state.protocol_mapping[protocol_id]

  # Get HTML and PNG representations as base64
  html_base64 = nothing
  png_base64 = nothing

  # Generate HTML representation
  try
    html_buffer = IOBuffer()
    show(html_buffer, MIME"text/html"(), protocol)
    html_content = String(take!(html_buffer))
    html_base64 = base64encode(html_content)
  catch e
    @warn "Failed to render HTML for protocol $protocol_id: $e"
  end

  # Generate PNG representation
  try
    png_buffer = IOBuffer()
    show(png_buffer, MIME"image/png"(), protocol)
    png_content = take!(png_buffer)
    png_base64 = base64encode(png_content)
  catch e
    @warn "Failed to render PNG for protocol $protocol_id: $e"
  end

  Dict(
    "protocol_id" => protocol_id,
    "protocol_type" => string(typeof(protocol)),
    "html_base64" => html_base64,
    "png_base64" => png_base64
  )
end

function get_slot_state(slot_id::String, state::State)
  # Check if slot exists in mapping
  if state.slot_mapping === nothing || !haskey(state.slot_mapping, slot_id)
    throw(not_found_error("Slot", slot_id))
  end

  slot = state.slot_mapping[slot_id]

  # Get the state of the slot
  slot_state = QuantumSavory.stateof(slot)

  # Get entangled slots with detailed information
  entangled_slots = []
  entangled_slot_details = []

  if !isnothing(slot_state)
    entangled_slot_refs = QuantumSavory.slots(slot_state)
    for slot_ref in entangled_slot_refs
      # Find the slot ID for this slot reference
      parent_reg = QuantumSavory.parent(slot_ref)
      slot_idx = QuantumSavory.parentindex(slot_ref)

      # Find the slot ID by searching through the mapping
      slot_id_found = nothing
      for (id, mapped_slot) in state.slot_mapping
        if mapped_slot === slot_ref
          slot_id_found = id
          push!(entangled_slots, id)
          break
        end
      end

      # Add detailed information about the entangled slot
      push!(entangled_slot_details, Dict(
        "slot_id" => slot_id_found,
        "parent_reg_index" => QuantumSavory.parentindex(parent_reg),
        "slot_index" => slot_idx,
        "parent_reg" => string(typeof(parent_reg))
      ))
    end
  end

  # Get HTML and PNG representations as base64
  html_base64 = nothing
  png_base64 = nothing

  if !isnothing(slot_state)
    # Generate HTML representation
    try
      html_buffer = IOBuffer()
      show(html_buffer, MIME"text/html"(), slot_state)
      html_content = String(take!(html_buffer))
      html_base64 = base64encode(html_content)
    catch e
      @warn "Failed to render HTML state for slot $slot_id: $e"
    end

    # Generate PNG representation
    try
      png_buffer = IOBuffer()
      show(png_buffer, MIME"image/png"(), slot_state)
      png_content = take!(png_buffer)
      png_base64 = base64encode(png_content)
    catch e
      @warn "Failed to render PNG state for slot $slot_id: $e"
    end
  end

  # Get access times if available
  access_time = nothing
  if state.network !== nothing
    # Find the register and slot index for this slot
    for (reg_idx, reg) in enumerate(state.network.registers)
      for slot_idx in 1:nsubsystems(reg)
        reg_slot = reg[slot_idx]
        if reg_slot === slot
          access_time = reg.accesstimes[slot_idx]
          break
        end
      end
    end
  end

  Dict(
    "slot_id" => slot_id,
    "state_type" => slot_state !== nothing ? string(typeof(slot_state)) : nothing,
    "is_locked" => QuantumSavory.islocked(slot),
    "is_assigned" => QuantumSavory.isassigned(slot),
    "access_time" => access_time,
    "entangled_slots" => entangled_slots,
    "entangled_slot_details" => entangled_slot_details,
    "html_base64" => html_base64,
    "png_base64" => png_base64
  )
end

function serialize_state(state::State)
  Dict(
    "name" => state.name,
    "status" => _determine_status(state),
    "node_count" => state.graph !== nothing ? nv(state.graph) : 0,
    "edge_count" => state.graph !== nothing ? ne(state.graph) : 0,
    "protocols_launched" => state.protocols_launched,
    "slots" => _serialize_slots(state),
    "protocols" => _serialize_protocols(state),
    "message" => _get_status_message(state)
  )
end

function _serialize_slots(state::State)
  if state.slot_mapping === nothing
    return Dict("slots" => [], "entanglements" => [])
  end

  slots_info = []
  entanglements = []

  for (slot_id, slot) in state.slot_mapping
    # Get slot state and entangled slots
    slot_state = QuantumSavory.stateof(slot)
    entangled_slot_ids = []

    if !isnothing(slot_state)
      entangled_slot_refs = QuantumSavory.slots(slot_state)
      for slot_ref in entangled_slot_refs
        # Find the slot ID for this slot reference
        for (id, mapped_slot) in state.slot_mapping
          if mapped_slot === slot_ref
            push!(entangled_slot_ids, id)
            break
          end
        end
      end
    end

    # Add slot information (avoid serializing complex quantum objects)
    push!(slots_info, Dict(
      "slot_id" => slot_id,
      "state_type" => slot_state !== nothing ? string(typeof(slot_state)) : nothing,
      "is_locked" => QuantumSavory.islocked(slot),
      "is_assigned" => QuantumSavory.isassigned(slot),
      "entangled_slots" => entangled_slot_ids
    ))

    # Add entanglement information (only add each entanglement once)
    for entangled_id in entangled_slot_ids
      entanglement_pair = sort([slot_id, entangled_id])
      if entanglement_pair ∉ entanglements
        push!(entanglements, entanglement_pair)
      end
    end
  end

  Dict(
    "slots" => slots_info,
    "entanglements" => entanglements
  )
end

function _serialize_protocols(state::State)
  if state.protocol_mapping === nothing
    return Dict("protocols" => [])
  end

  protocols_info = []

  for (protocol_id, protocol) in state.protocol_mapping
    # Add protocol information (avoid serializing complex quantum objects)
    push!(protocols_info, Dict(
      "protocol_id" => protocol_id,
      "protocol_type" => string(typeof(protocol))
    ))
  end

  Dict(
    "protocols" => protocols_info
  )
end

function _determine_status(state::State)
  if state.simulation !== nothing
    # Check if simulation has been run
    if state.has_run
      return "complete"
    else
      return "prepared"
    end
  elseif state.graph !== nothing || state.network !== nothing
    # Graph (and possibly network) exist, but no simulation yet
    return "created"
  else
    return "unknown"
  end
end

function _get_status_message(state::State)
  if state.simulation !== nothing
    # Check if simulation has been run
    if state.has_run
      return "Simulation has run"
    else
      return "Simulation is prepared and ready to run"
    end
  elseif state.graph !== nothing || state.network !== nothing
    return "Network has been created"
  else
    return "No network data available"
  end
end

function cleanup_state!(state::State)
  """Clean up quantum resources associated with a simulation state"""
  try
    # Clean up quantum objects in the network
    if state.network !== nothing
      @info "Cleaning up quantum network" state_name=state.name

      # Clear quantum states in all slots
      for (reg_idx, reg) in enumerate(state.network.registers)
        for slot_idx in 1:nsubsystems(reg)
          slot = reg[slot_idx]
          try
            if QuantumSavory.isassigned(slot)
              # Clear the quantum state
              QuantumSavory.clear!(slot)
            end
            # Unlock the slot if it's locked
            if QuantumSavory.islocked(slot)
              QuantumSavory.unlock!(slot)
            end
          catch e
            @warn "Failed to cleanup slot" reg_idx=reg_idx slot_idx=slot_idx error=e
          end
        end
      end

      # Clear the network reference
      state.network = nothing
    end

    # Clean up simulation
    if state.simulation !== nothing
      @info "Cleaning up simulation" state_name=state.name
      # Note: ConcurrentSim doesn't have explicit cleanup, but we clear the reference
      state.simulation = nothing
    end

    # Clear mappings
    if state.slot_mapping !== nothing
      @info "Clearing slot mapping" state_name=state.name slot_count=length(state.slot_mapping)
      state.slot_mapping = nothing
    end

    if state.protocol_mapping !== nothing
      @info "Clearing protocol mapping" state_name=state.name protocol_count=length(state.protocol_mapping)
      state.protocol_mapping = nothing
    end

    # Clear graph
    if state.graph !== nothing
      @info "Clearing graph" state_name=state.name
      state.graph = nothing
    end

    # Clear payload (it can be large)
    if state.payload !== nothing
      @info "Clearing payload" state_name=state.name
      state.payload = nothing
    end

    @info "Successfully cleaned up state" state_name=state.name
    return true

  catch e
    @error "Failed to cleanup state" state_name=state.name error=e
    return false
  end
end

function launch_protocols(data, net, sim, protocol_mapping = Dict{String, Any}())
  launched = Dict("nodes" => 0, "edges" => 0, "floating" => 0)

  # Node-attached protocols: per-node under node["data"]["protocols"]
  nodes = data["graph_info"]["nodes"]
  for (idx, node) in enumerate(nodes)
    node_data = get(node, "data", Dict{String,Any}())
    node_prots = Vector{Any}(get(node_data, "protocols", Any[]))
    @info "Processing node protocols" node_idx=idx node_name=node["name"] protocol_count=length(node_prots)

    for prot_def in node_prots
      ctx = Dict{Symbol,Any}(:sim => sim, :net => net, :node => idx)
      prot = _instantiate_protocol(prot_def, ctx)
      prot === nothing && continue
      @process prot()
      launched["nodes"] += 1

      # Store protocol instance in mapping if it has an ID
      if haskey(prot_def, "id")
        protocol_id = string(prot_def["id"])
        protocol_mapping[protocol_id] = prot
      end

      @info "Successfully launched node protocol" node_idx=idx protocol_type=typeof(prot)
    end
  end

  # Edge-attached protocols: per-edge under edge["data"]["protocols"]
  # Build id->index mapping once
  id_to_idx = Dict(String(n["id"]) => i for (i, n) in enumerate(nodes))
  edges = data["graph_info"]["edges"]
  @info "Processing edge protocols" edge_count=length(edges)
  for edge in edges
    edge_data = get(edge, "data", Dict{String,Any}())
    edge_prots = Vector{Any}(get(edge_data, "protocols", Any[]))
    @info "Edge protocols found" edge_id=edge["id"] protocol_count=length(edge_prots)
    isempty(edge_prots) && continue

    # Resolve node indices from edge endpoints
    src_id = String(edge["source"])
    dst_id = String(edge["target"])
    nodeA_idx = get(id_to_idx, src_id, 0)
    nodeB_idx = get(id_to_idx, dst_id, 0)
    (nodeA_idx > 0 && nodeB_idx > 0) || continue

    for prot_def in edge_prots
      ctx = Dict{Symbol,Any}(:sim => sim, :net => net, :nodeA => nodeA_idx, :nodeB => nodeB_idx)
      prot = _instantiate_protocol(prot_def, ctx)
      prot === nothing && continue
      @process prot()
      launched["edges"] += 1

      # Store protocol instance in mapping if it has an ID
      if haskey(prot_def, "id")
        protocol_id = string(prot_def["id"])
        protocol_mapping[protocol_id] = prot
      end

      @info "Successfully launched edge protocol" edge_id=edge["id"] protocol_type=typeof(prot)
    end
  end

  # Floating protocols: net-level under payload["net"]["protocols"] as array
  net_payload = data["data"]["net"]
  floating_prots = Any[]
  if haskey(net_payload, "protocols") && isa(net_payload["protocols"], Vector)
    floating_prots = Vector{Any}(net_payload["protocols"])
  end

  @info "Processing floating protocols" protocol_count=length(floating_prots)

  for prot_def in floating_prots
    ctx = Dict{Symbol,Any}(:sim => sim, :net => net)
    prot = _instantiate_protocol(prot_def, ctx)
    prot === nothing && continue
    @info "Launching floating protocol" protocol_type=typeof(prot)
    @process prot()
    launched["floating"] += 1

    # Store protocol metadata in mapping if it has an ID
    if haskey(prot_def, "id")
      protocol_id = string(prot_def["id"])
      protocol_mapping[protocol_id] = Dict(
        "type" => string(typeof(prot)),
        "definition" => prot_def
      )
    end

    @info "Successfully launched floating protocol" protocol_type=typeof(prot)
  end

  @info "Protocol launch summary" launched=launched
  return launched
end

function destroy_simulation(simulation_name)
  state = STATE[simulation_name]

    # Perform cleanup before deletion
    cleanup_success = cleanup_state!(state)

    # Remove from global state
    delete!(STATE, simulation_name)

  return cleanup_success
end

include("mocks.jl")

end
