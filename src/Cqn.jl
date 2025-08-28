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
        return (Dict(
          "success" => false,
          "error" => "Failed to parse JSON from raw payload",
          "details" => Dict("parse_error" => string(parse_error))
        ))
      end
    else
      return (Dict(
        "success" => false,
        "error" => "No valid JSON payload found",
        "details" => Dict("raw_payload_type" => string(typeof(raw_payload)))
      ))
    end
  end

  payload
end

function validate_payload(payload)
  try
    # Validate top-level structure
    if !haskey(payload, "name")
      return (Dict(
        "success" => false,
        "error" => "Missing required field: 'name' must be present"
      ))
    end

    if !haskey(payload, "net")
      return (Dict(
        "success" => false,
        "error" => "Missing required field: 'net' must be present"
      ))
    end

    net = payload["net"]

    # Validate net structure
    if !haskey(net, "nodes") || !haskey(net, "edges")
      return (Dict(
        "success" => false,
        "error" => "Missing required fields in 'net': 'nodes' and 'edges' must be present"
      ))
    end

    nodes = net["nodes"]
    edges = net["edges"]

    # Validate that nodes and edges are arrays
    if !isa(nodes, Vector) && !startswith(string(typeof(nodes)), "JSON3.Array")
      return (Dict(
        "success" => false,
        "error" => "Field 'nodes' must be an array",
        "details" => Dict("nodes_type" => string(typeof(nodes)))
      ))
    end

    if !isa(edges, Vector) && !startswith(string(typeof(edges)), "JSON3.Array")
      return (Dict(
        "success" => false,
        "error" => "Field 'edges' must be an array",
        "details" => Dict("edges_type" => string(typeof(edges)))
      ))
    end

    # Validate each node structure
    node_ids = Set{String}()
    for (i, node) in enumerate(nodes)
      # Check required node fields
      if !haskey(node, "id")
        return (Dict(
          "success" => false,
          "error" => "Node $i missing required field: 'id'"
        ))
      end

      if !haskey(node, "name")
        return (Dict(
          "success" => false,
          "error" => "Node $i missing required field: 'name'"
        ))
      end

      if !haskey(node, "position")
        return (Dict(
          "success" => false,
          "error" => "Node $i missing required field: 'position'"
        ))
      end

      if !haskey(node, "data")
        return (Dict(
          "success" => false,
          "error" => "Node $i missing required field: 'data'"
        ))
      end

      # Check for duplicate node IDs
      node_id = string(node["id"])
      if node_id in node_ids
        return (Dict(
          "success" => false,
          "error" => "Duplicate node ID: '$node_id'"
        ))
      end
      push!(node_ids, node_id)
    end

    # Validate each edge structure
    edge_connections = []
    for (i, edge) in enumerate(edges)
      # Check required edge fields
      if !haskey(edge, "id")
        return (Dict(
          "success" => false,
          "error" => "Edge $i missing required field: 'id'"
        ))
      end

      if !haskey(edge, "source")
        return (Dict(
          "success" => false,
          "error" => "Edge $i missing required field: 'source'"
        ))
      end

      if !haskey(edge, "target")
        return (Dict(
          "success" => false,
          "error" => "Edge $i missing required field: 'target'"
        ))
      end

      # Validate source and target reference existing nodes
      source = string(edge["source"])
      target = string(edge["target"])

      if !(source in node_ids)
        return (Dict(
          "success" => false,
          "error" => "Edge $i references non-existent source node: '$source'"
        ))
      end

      if !(target in node_ids)
        return (Dict(
          "success" => false,
          "error" => "Edge $i references non-existent target node: '$target'"
        ))
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
    # Return error if JSON parsing fails
    return (Dict(
      "success" => false,
      "error" => "Unexpected error during parsing",
      "details" => Dict("exception" => string(e))
    ))
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

  for node in nodes
    node_data = node["data"]
    slots = get(node_data, "slots", [])

    isempty(slots) && continue # TODO: what to do with empty slots?

    # Create a Register with the number of slots
    register_size = length(slots)

    # Create the Register object
    register = Register(register_size)
    push!(registers, register)
  end

  registers
end

function create_register_net(graph, registers)
  # Create a network from the graph and the registers
  RegisterNet(graph, registers)
end

function get_network_time_tracker(network)
  # Get the time tracker from the network
  get_time_tracker(network)
end

function _resolve_type_from_string(type_str::AbstractString)
  # Get available protocol types for whitelist
  available_types = QuantumSavory.ProtocolZoo.available_protocol_types()

  # Convert input to lowercase for case-insensitive comparison
  input_lower = lowercase(type_str)

  # Find matching type (case-insensitive)
  for pt in available_types
    type_name = string(pt.type)
    if lowercase(type_name) == input_lower
      return pt.type
    end
  end

  # Also check background types and slot types
  background_types = QuantumSavory.available_background_types()
  for bt in background_types
    type_name = string(bt.type)
    if lowercase(type_name) == input_lower
      return bt.type
    end
  end

  slot_types = QuantumSavory.available_slot_types()
  for st in slot_types
    type_name = string(st.type)
    if lowercase(type_name) == input_lower
      return st.type
    end
  end

  # Type not found in whitelist
  @warn "Type not found in whitelist" requested_type=type_str
  return nothing
end

function _build_args_for_protocol(param_defs::Vector, ctx::Dict{Symbol,Any})
  args = Any[]
  for p in param_defs
    name = Symbol(String(p["name"]))  # parameter name - handle JSON3.Object
    ptype = string(p["type"]) # declared type (string) - handle JSON3.Object
    # Prefer contextual values for well-known names
    if name === :sim && haskey(ctx, :sim)
      push!(args, ctx[:sim])
      continue
    elseif name === :net && haskey(ctx, :net)
      push!(args, ctx[:net])
      continue
    elseif name === :node && haskey(ctx, :node)
      push!(args, ctx[:node])
      continue
    elseif name === :nodeA && haskey(ctx, :nodeA)
      push!(args, ctx[:nodeA])
      continue
    elseif name === :nodeB && haskey(ctx, :nodeB)
      push!(args, ctx[:nodeB])
      continue
    end

    # fallback: attempt to coerce "value" into a Julia value
    val = haskey(p, "value") ? p["value"] : nothing
    # Coerce based on simple ptype hints
    if ptype in ("Int", "Int64") && val !== nothing
      push!(args, parse(Int, string(val)))
    elseif ptype in ("Float64", "Float32") && val !== nothing
      push!(args, parse(Float64, string(val)))
    elseif ptype in ("Bool",) && val !== nothing
      # Handle boolean conversion more robustly
      if isa(val, Bool)
        push!(args, val)
      elseif isa(val, String)
        lower_val = lowercase(val)
        if lower_val in ("true", "1", "yes", "on")
          push!(args, true)
        elseif lower_val in ("false", "0", "no", "off")
          push!(args, false)
        else
          @warn "Could not parse boolean value" value=val parameter_name=name
          push!(args, val) # fallback to original value
        end
      elseif isa(val, Number)
        push!(args, val != 0)
      else
        @warn "Unexpected type for boolean parameter" value=val value_type=typeof(val) parameter_name=name
        push!(args, val) # fallback to original value
      end
    else
      push!(args, val)
    end
  end
  return args
end

function _instantiate_protocol(prot_def, ctx::Dict{Symbol,Any})
  # Handle both Dict{String,Any} and JSON3.Object types
  tstr = get(prot_def, "type", nothing)
  tstr === nothing && return nothing
  T = _resolve_type_from_string(String(tstr))
  T === nothing && return nothing

  params = Vector{Any}(get(prot_def, "parameters", Any[]))
  args = _build_args_for_protocol(params, ctx)
  try
    return T(args...)
  catch
    return nothing
  end
end

function serialize_state(state::State)
  Dict(
    "name" => state.name,
    "status" => _determine_status(state),
    "node_count" => state.graph !== nothing ? nv(state.graph) : 0,
    "edge_count" => state.graph !== nothing ? ne(state.graph) : 0,
    "protocols_launched" => state.protocols_launched,
    "message" => _get_status_message(state)
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
  elseif state.network !== nothing
    return "prepared"
  elseif state.graph !== nothing
    return "created"
  else
    return "unknown"
  end
end

function _get_status_message(state::State)
  if state.simulation !== nothing
    # Check if simulation has been run
    if state.has_run
      return "Simulation has completed"
    else
      return "Simulation is prepared and ready to run"
    end
  elseif state.network !== nothing
    return "Simulation is prepared and ready to run"
  elseif state.graph !== nothing
    return "Network has been created"
  else
    return "No network data available"
  end
end

function launch_protocols(data, net, sim)
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
    end
  end

  # Edge-attached protocols: per-edge under edge["data"]["protocols"]
  # Build id->index mapping once
  id_to_idx = Dict(String(n["id"]) => i for (i, n) in enumerate(nodes))
  edges = data["graph_info"]["edges"]
  for edge in edges
    edge_data = get(edge, "data", Dict{String,Any}())
    edge_prots = Vector{Any}(get(edge_data, "protocols", Any[]))
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
    if prot === nothing
      @warn "Failed to instantiate floating protocol" protocol_def=prot_def
      continue
    end
    @info "Launching floating protocol" protocol_type=typeof(prot)
    @process prot()
    launched["floating"] += 1
  end

  @info "Protocol launch summary" launched=launched
  return launched
end

include("mocks.jl")

end
