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
import CairoMakie

# include("constructors.jl")
include("errors.jl")
include("types.jl")
include("Sandbox.jl")
include("Logger.jl")
using .Logger: @log_event

const up = Genie.up
export up
# Simple caches to avoid repeated scans/logs during type resolution
const _PROTOCOL_TYPES_CACHE = Ref(Dict{String, Any}())
const _NOISE_TYPES_CACHE = Ref(Dict{String, Any}())
const _SLOT_TYPES_CACHE = Ref(Dict{String, Any}())

function _ensure_protocol_types_cache!()
  if isempty(_PROTOCOL_TYPES_CACHE[])
    mapping = Dict{String, Any}()
    for pt in QuantumSavory.ProtocolZoo.available_protocol_types()
      mapping[lowercase(string(pt.type))] = pt.type
    end
    _PROTOCOL_TYPES_CACHE[] = mapping
  end
end

function _ensure_noise_types_cache!()
  if isempty(_NOISE_TYPES_CACHE[])
    mapping = Dict{String, Any}()
    for bt in QuantumSavory.available_background_types()
      mapping[lowercase(string(bt.type |> nameof))] = bt.type
    end
    _NOISE_TYPES_CACHE[] = mapping
  end
end

function _ensure_slot_types_cache!()
  if isempty(_SLOT_TYPES_CACHE[])
    mapping = Dict{String, Any}()
    for st in QuantumSavory.available_slot_types()
      mapping[lowercase(string(st.type |> nameof))] = st.type
    end
    _SLOT_TYPES_CACHE[] = mapping
  end
end

"""Convert a raw parameter value to a target primitive or simple Union type.

Supported target strings: "Int", "Int64", "Float64", "Float32", "Bool",
Union types that include Nothing and one of the above primitives or String.

Returns a Pair{Bool,Any} where first indicates success. On failure, returns
(false, nothing) and callers should skip setting the parameter.
"""
function _convert_parameter_value(ptype::AbstractString, value)
  # Normalize ptype string
  ts = String(ptype)

  # Direct primitives
  try
    if ts in ("Int", "Int64")
      if isa(value, Integer)
        return true => Int(value)
      elseif isa(value, AbstractFloat)
        if isinteger(value)
          return true => Int(trunc(value))
        else
          return false => nothing
        end
      else
        return true => parse(Int, string(value))
      end
    elseif ts in ("Float64", "Float32")
      if isa(value, Number)
        return true => Float64(value)
      else
        return true => parse(Float64, string(value))
      end
    elseif ts == "Bool"
      if isa(value, Bool)
        return true => value
      elseif isa(value, String)
        lv = lowercase(value)
        if lv in ("true", "1", "yes", "on")
          return true => true
        elseif lv in ("false", "0", "no", "off")
          return true => false
        else
          return false => nothing
        end
      elseif isa(value, Number)
        return true => (value != 0)
      else
        return false => nothing
      end
    end
  catch
    return false => nothing
  end

  # Union types with Nothing and a simple member
  try
    if occursin(r"Union\{.*Nothing.*\}", ts)
      if isa(value, String) && lowercase(value) == "nothing"
        return true => nothing
      end
      if occursin(r"Float\d+", ts)
        return true => parse(Float64, string(value))
      elseif occursin(r"Int\d*", ts)
        return true => parse(Int, string(value))
      elseif occursin(r"String", ts)
        return true => string(value)
      elseif occursin(r"Bool", ts)
        # Delegate to Bool path by recursion
        ok, v = _convert_parameter_value("Bool", value)
        return ok => v
      end
      # Unsupported union member: let caller handle
      return false => nothing
    end
  catch
    return false => nothing
  end

  # No conversion performed
  return false => nothing
end


@kwdef mutable struct State
  name::String
  payload::Union{Nothing, Dict} = nothing
  graph::Union{Nothing, SimpleGraph} = nothing
  network::Union{Nothing, RegisterNet} = nothing
  protocols_launched::Union{Nothing, Dict{String, Int}} = nothing
  simulation::Union{Nothing, Simulation} = nothing
  has_run::Bool = false
  slot_mapping::Union{Nothing, Dict{String, Any}} = nothing
  slot_reverse_mapping::Union{Nothing, IdDict{Any, String}} = nothing
  protocol_mapping::Union{Nothing, Dict{String, Any}} = nothing
  simulation_time::Union{Nothing, Float64} = nothing
  simulation_progress::Union{Nothing, Float64} = nothing
  log_events::Vector{Any} = Any[]
end

const STATE = Dict{String, State}()

function main()
  Genie.genie(; context = @__MODULE__)
end

function get_background_constructor_parameters(background_type)
  QuantumSavory.constructor_metadata(background_type)
end
"""Coerce any AbstractVector implementation (e.g., JSON3.Array) to a plain Vector."""
_to_vector(x) = isa(x, AbstractVector) ? collect(x) : x


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

function parse_pt_type(parameters::AbstractVector)
  result = []

  for p in parameters
    t = getfield(p, :type)

    # Special case for SymbolicUtils.Symbolic
    if startswith(string(t), "SymbolicUtils.Symbolic{")
      push!(result, (field = p.field, type = "SymbolicUtils.Symbolic", doc = p.doc))
      continue
    end

    # Prefer metadata-driven union detection to avoid string parsing
    try
      if t isa Type && Base.isuniontype(t)
        utypes = Base.uniontypes(t)
        push!(result, (field = p.field, type = [string(ut) for ut in utypes], doc = p.doc))
        continue
      end
    catch
      # Fall back to string-based check only if metadata access fails
    end

    # Fallback: legacy string detection for unions if type metadata wasn't a Type
    try
      s = string(t)
      if startswith(s, "Union{")
        m = match(r"^Union\{(.*)\}$", s)
        if m !== nothing
          inner = m.captures[1]
          parts = split(inner, ",")
          push!(result, (field = p.field, type = [strip(pp) for pp in parts], doc = p.doc))
          continue
        end
      end
    catch
      # Ignore and fall through to pushing original param
    end

    # Non-union or unrecognized type format: pass through
    push!(result, p)
  end

  result
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

    push!(result, Dict("type" => string(pt.type), "doc" => string(pt.doc), "group" => group, "parameters" => pts |> parse_pt_type))
  end

  result
end

function extract_payload(payload = nothing, raw_payload = nothing)
  # Helper: parse media type parameters (e.g., "application/json; charset=utf-8")
  _is_json_mediatype(s) = try
    s === nothing && return false
    t = lowercase(String(s)) |> strip
    main = split(t, ";")[1] |> strip
    return (main == "application/json") || endswith(main, "+json") || (main == "text/json")
  catch
    false
  end

  # Header validation is best-effort: only warn if clearly incompatible, but do not hard fail
  # This keeps the function usable from tests and internal code paths without HTTP context
  try
    request_headers = Dict(lowercase(header) => String(value) for (header, value) in Genie.Requests.getheaders())
    if haskey(request_headers, "content-type")
      ct = request_headers["content-type"]
      if !_is_json_mediatype(ct)
        @warn "Unsupported Content-Type for JSON payload" content_type=ct
      end
    end
    if haskey(request_headers, "accept")
      acc = lowercase(request_headers["accept"]) |> strip
      # Accept if it contains json, +json, or */*
      acceptable = occursin("application/json", acc) || occursin("+json", acc) || occursin("*/*", acc)
      if !acceptable
        @warn "Client Accept header may not support JSON" accept=acc
      end
    end
  catch
    # Ignore header errors entirely
  end

  # Prefer already-parsed payload if provided
  if payload !== nothing
    return payload
  end

  # Otherwise parse raw payload if available
  if isa(raw_payload, String)
    try
      return JSON.parse(raw_payload)
    catch parse_error
      throw(validation_error("Failed to parse JSON from raw payload", Dict{String, Any}("parse_error" => string(parse_error))))
    end
  end

  throw(validation_error("No valid JSON payload found", Dict{String, Any}("raw_payload_type" => string(typeof(raw_payload)))))
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

    # Validate that nodes and edges are arrays, accepting any AbstractVector
    if !isa(nodes, AbstractVector)
      throw(validation_error("Field 'nodes' must be an array", Dict{String, Any}("nodes_type" => string(typeof(nodes)))))
    end

    if !isa(edges, AbstractVector)
      throw(validation_error("Field 'edges' must be an array", Dict{String, Any}("edges_type" => string(typeof(edges)))))
    end

    # Normalize to plain Vectors to avoid type cracks downstream
    nodes = _to_vector(nodes)
    edges = _to_vector(edges)

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
  slot_reverse = IdDict{Any, String}()

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

      # Instantiate background noise (supports string or object with parameters)
      noise_def = get(slot_data, "backgroundNoise", nothing)
      if noise_def !== nothing
        # Only treat explicit string "default" as no-noise; avoid String(x) on non-strings
        if isa(noise_def, AbstractString)
          if String(noise_def) != "default"
            nb = _instantiate_noise(noise_def)
            nb === nothing || push!(background_noise, nb)
          end
        else
          nb = _instantiate_noise(noise_def)
          nb === nothing || push!(background_noise, nb)
        end
      end
    end

    reprs = [QuantumOpticsRepr() for _ in 1:length(traits)]
    register = Register(traits, reprs, background_noise)
    push!(registers, register)

    # Map slot IDs to actual slot objects
    for (slot_idx, slot_data) in enumerate(slots)
      slot_id = slot_data["id"]
      slot_obj = register[slot_idx]
      slot_mapping[slot_id] = slot_obj
      slot_reverse[slot_obj] = slot_id
    end
  end

  (registers, slot_mapping, slot_reverse)
end

function create_register_net(graph, registers)
  # Create a network from the graph and the registers
  RegisterNet(graph, registers)
end

function get_network_time_tracker(network)
  # Get the time tracker from the network
  get_time_tracker(network)
end

function _resolve_protocol_type_from_string(type_str::AbstractString)
  input_lower = lowercase(type_str)
  _ensure_protocol_types_cache!()
  T = get(_PROTOCOL_TYPES_CACHE[], input_lower, nothing)
  if T === nothing
    @warn "Protocol type not found in whitelist" type_str=type_str
  end
  return T
end

# Instantiate a background noise from either a String name or an object
function _instantiate_noise(noise_def)
  # String form: "Depolarization" or any available background type name
  if isa(noise_def, AbstractString)
    if String(noise_def) == "default"
      return nothing # this now means no noise
    end

    T = _resolve_type_from_string(String(noise_def), :noise)
    T === nothing && error("Unknown background noise type: $(noise_def)")
    return T()
  end

  # Object form: { type: String, parameters: [ { name, value } ] }
  if isa(noise_def, Dict) || startswith(string(typeof(noise_def)), "JSON3.Object")
    tstr = get(noise_def, "type", nothing)
    tstr === nothing && error("Noise object missing 'type'")
    
    # Handle "default" type as no noise
    if String(tstr) == "default"
      return nothing
    end
    
    T = _resolve_type_from_string(String(tstr), :noise)
    T === nothing && error("Unknown background noise type: $(tstr)")

    # Fetch constructor metadata to know parameter expected types
    md = QuantumSavory.constructor_metadata(T)
    # Build map from field name -> type string
    param_types = Dict{String, String}()
    for p in md
      fname = String(p.field)
      ftype = string(p.type)
      param_types[fname] = ftype
    end

    raw_params = Vector{Any}(get(noise_def, "parameters", Any[]))
    kwargs = Dict{Symbol, Any}()

    for p in raw_params
      # Each p is expected to be an object with name and value
      original_name = String(get(p, "name", ""))
      isempty(original_name) && continue
      name = Symbol(original_name)
      value = get(p, "value", nothing)
      if value === nothing
        @warn "Noise parameter has no value, skipping" parameter_name=name
        continue
      end

      ptype = get(param_types, original_name, "Any")

      # Convert value using shared utility; if unsupported, try eval as last resort
      ok, converted = _convert_parameter_value(ptype, value)
      if ok
        kwargs[name] = converted
        continue
      end

      # For complex types, try eval with value::type
      eval_expr = "$(value)::$(ptype)"
      try
        @info "Attempting eval for noise parameter" parameter_name=name eval_expr=eval_expr
        kwargs[name] = eval(Meta.parse(eval_expr))
      catch eval_error
        @warn "Eval failed for noise parameter, skipping" parameter_name=name eval_expr=eval_expr eval_error=eval_error
      end
    end

    # Instantiate noise with keyword arguments; fall back to no-arg if empty
    if isempty(kwargs)
      return T()
    else
      return T(; (k => v for (k, v) in kwargs)...)
    end
  end

  error("Unsupported backgroundNoise definition (expected object or nothing): $(typeof(noise_def))")
end

function _resolve_noise_type_from_string(type_str::AbstractString)
  input_lower = lowercase(type_str)
  _ensure_noise_types_cache!()

  if input_lower == "default"
    return nothing # this now means no noise

    # Choose first available background type deterministically
    # for (_, T) in _NOISE_TYPES_CACHE[]
    #   return T
    # end
  end

  T = get(_NOISE_TYPES_CACHE[], input_lower, nothing)
  if T === nothing
    @warn "Noise type not found in whitelist" type_str=type_str
  end
  return T
end

function _resolve_slot_type_from_string(type_str::AbstractString)
  input_lower = lowercase(type_str)
  _ensure_slot_types_cache!()
  T = get(_SLOT_TYPES_CACHE[], input_lower, nothing)
  if T === nothing
    @warn "Slot type not found in whitelist" type_str=type_str
  end
  return T
end

function _resolve_type_from_string(type_str::AbstractString, type_group::Symbol)
  # Reduce log noise; warn only on misses at leaf resolvers
  return if type_group == :protocol
    _resolve_protocol_type_from_string(type_str)
  elseif type_group == :noise
    _resolve_noise_type_from_string(type_str)
  elseif type_group == :slot
    _resolve_slot_type_from_string(type_str)
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
    p_raw_type = get(p, "type", nothing)
    ptype = p_raw_type === nothing ? "Any" : string(p_raw_type)

    # Normalize union representation possibly coming as an array from metadata
    function_type_requested = false
    lambda_type_requested = false
    if isa(p_raw_type, AbstractVector)
      for t in p_raw_type
        ts = string(t)
        function_type_requested |= ts == "Function"
        lambda_type_requested |= ts == "Lambda"
      end
    else
      function_type_requested = ptype == "Function"
      lambda_type_requested = ptype == "Lambda"
    end

    # Try to convert the value, fall back gracefully if it fails
    try
      # Handle function-like parameters first
      if function_type_requested || lambda_type_requested
        if isa(value, Function)
          kwargs[name] = value
          continue
        elseif isa(value, String)
          # Try to resolve by name first (works for both Function and Lambda cases),
          # then fall back to creating a lambda from code.
          resolved = resolve_function_reference(value)
          if resolved === nothing && lambda_type_requested
            try
              resolved = create_lambda(value)
            catch e
              @warn "Failed to create lambda from string" parameter_name=name value=value error=e
            end
          end
          if resolved === nothing && function_type_requested
            @warn "Could not resolve function by name" parameter_name=name value=value
          elseif resolved === nothing && lambda_type_requested
            @warn "Could not create lambda from value" parameter_name=name value=value
          else
            kwargs[name] = resolved
            continue
          end
        else
          @warn "Function/Lambda parameter has unsupported value type; skipping" parameter_name=name value_type=typeof(value)
          continue
        end

      else
        ok, converted = _convert_parameter_value(ptype, value)
        if ok
          kwargs[name] = converted
          continue
        end
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
    # Ensure reverse mapping exists locally
    local_reverse = state.slot_reverse_mapping === nothing ? IdDict{Any,String}() : state.slot_reverse_mapping
    if state.slot_reverse_mapping === nothing && state.slot_mapping !== nothing
      for (id, mapped_slot) in state.slot_mapping
        local_reverse[mapped_slot] = id
      end
      state.slot_reverse_mapping = local_reverse
    end

    for slot_ref in entangled_slot_refs
      # Find the slot ID via reverse mapping
      slot_id_found = get(local_reverse, slot_ref, nothing)
      if slot_id_found !== nothing
        push!(entangled_slots, slot_id_found)
      end

      # Add detailed information about the entangled slot
      parent_reg = QuantumSavory.parent(slot_ref)
      slot_idx = QuantumSavory.parentindex(slot_ref)
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
    "message" => _get_status_message(state), 
    "simulation" => Dict(
      "simulation_time" => state.simulation_time,
      "simulation_progress" => state.simulation_time !== nothing ? QuantumSavory.now(state.simulation) : nothing,
      "simulation_running" => simulation_status(state)
    )
  )
end

function _serialize_slots(state::State)
  if state.slot_mapping === nothing
    return Dict("slots" => [], "entanglements" => [])
  end

  slots_info = []
  entanglements = []

  # Build or reuse reverse mapping for O(1) lookups
  local_reverse = state.slot_reverse_mapping === nothing ? IdDict{Any,String}() : state.slot_reverse_mapping
  if state.slot_reverse_mapping === nothing
    for (sid, s) in state.slot_mapping
      local_reverse[s] = sid
    end
    state.slot_reverse_mapping = local_reverse
  end

  for (slot_id, slot) in state.slot_mapping
    # Get slot state and entangled slots
    slot_state = QuantumSavory.stateof(slot)
    entangled_slot_ids = []

    if !isnothing(slot_state)
      entangled_slot_refs = QuantumSavory.slots(slot_state)
      for slot_ref in entangled_slot_refs
        id_found = get(local_reverse, slot_ref, nothing)
        id_found === nothing || push!(entangled_slot_ids, id_found)
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

const STATUS_COMPLETE = "complete"
const STATUS_PREPARED = "prepared"
const STATUS_CREATED = "created"
const STATUS_UNKNOWN = "unknown"
const STATUS_RUNNING = "running"
const STATUS_NOT_STARTED = "not_started"

function _determine_status(state::State)
  if state.simulation !== nothing
    # Check if simulation has been run
    if state.has_run
      return STATUS_COMPLETE
    else
      return STATUS_PREPARED
    end
  elseif state.graph !== nothing || state.network !== nothing
    # Graph (and possibly network) exist, but no simulation yet
    return STATUS_CREATED
  else
    return STATUS_UNKNOWN
  end
end

function simulation_status(state::State)
  if state.simulation_time === nothing
    return STATUS_NOT_STARTED
  end
  if state.simulation_time - QuantumSavory.now(state.simulation) > 0
    return STATUS_RUNNING
  end

  return STATUS_COMPLETE
end

const STATUS_MESSAGE_COMPLETE = "Simulation has run"
const STATUS_MESSAGE_PREPARED = "Simulation is prepared and ready to run"
const STATUS_MESSAGE_CREATED = "Network has been created"
const STATUS_MESSAGE_UNKNOWN = "No network data available"

# Single source of truth for status -> message mapping
const STATUS_TO_MESSAGE = Dict(
  STATUS_COMPLETE => STATUS_MESSAGE_COMPLETE,
  STATUS_PREPARED => STATUS_MESSAGE_PREPARED,
  STATUS_CREATED => STATUS_MESSAGE_CREATED,
  STATUS_UNKNOWN => STATUS_MESSAGE_UNKNOWN,
)

function _get_status_message(state::State)
  status = _determine_status(state)
  return get(STATUS_TO_MESSAGE, status, STATUS_MESSAGE_UNKNOWN)
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

    if state.slot_reverse_mapping !== nothing
      @info "Clearing slot reverse mapping" state_name=state.name slot_count=length(state.slot_reverse_mapping)
      state.slot_reverse_mapping = nothing
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

    # Store protocol instance in mapping if it has an ID (consistent with nodes/edges)
    if haskey(prot_def, "id")
      protocol_id = string(prot_def["id"])
      protocol_mapping[protocol_id] = prot
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

function known_functions()
  [string(f) for f in [min, maximum, abs, identity]]
end

function parse_network_graph(data)
  g = build_graph(data)

  # Create registers array based on node slots data
  registers, slot_mapping, slot_reverse_mapping = create_registers_from_nodes(data)

  # Create the RegisterNet from the graph and registers
  net = create_register_net(g, registers)

  simulation_name = data["data"]["name"]
  if haskey(Cqn.STATE, simulation_name)
    @warn "Simulation already exists, destroying it" simulation_name=simulation_name
    Cqn.destroy_simulation(simulation_name)
  end

  state = Cqn.State(
    name = simulation_name,
    payload = data,
    graph = g,
    network = net,
    slot_mapping = slot_mapping,
    slot_reverse_mapping = slot_reverse_mapping,
  )

  Cqn.STATE[simulation_name] = state

  return state
end

function prepare_simulation(state::State, simulation_name::String)
  # Get the time tracker from the network
  sim = get_network_time_tracker(state.network)

  # Initialize protocol mapping
  protocol_mapping = Dict{String, Any}()

  # Launch protocols from payload over nodes, edges, and floating
  launch_counts = launch_protocols(state.payload, state.network, sim, protocol_mapping)

  state.simulation = sim
  state.protocols_launched = launch_counts
  state.protocol_mapping = protocol_mapping

  Cqn.STATE[simulation_name] = state

  return state
end

function run_simulation(state::State, simulation_name::String, time_units::Float64)
  state.simulation_time = time_units
  @log_event state Logging.Info "Simulation started" simulation_name=simulation_name time_units=time_units
  
  # Start the simulation asynchronously with logging
  @async begin
    Logging.with_logger(Logger.make_logger(state)) do
      run(state.simulation, time_units) |> errormonitor
    end
  end
  
  @info "Simulation running" simulation_name=simulation_name

  return state
end

function get_logs(simulation_name::String, purge::Bool = true) 
  state = STATE[simulation_name]
  logs = copy(state.log_events)
  
  if purge
    # Rebind to the tail to drop only the copied prefix; preserves concurrently appended logs
    local n = length(logs)
    if n > 0
      state.log_events = state.log_events[(n+1):end]
    end
  end
  
  return logs
end

include("mocks.jl")

end
