# Parser module for Cqn.jl
# Contains all parsing, validation, and type resolution functionality

using Dates
using .Logger: @log_event

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

"""Coerce any AbstractVector implementation (e.g., JSON3.Array) to a plain Vector."""
_to_vector(x) = isa(x, AbstractVector) ? collect(x) : x

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

function parse_pt_type(parameters::AbstractVector)
  result = []

  for p in parameters
    t = getfield(p, :type)

    # Special case for SymbolicUtils.Symbolic
    if startswith(string(t), "SymbolicUtils.Symbolic{")
      push!(result, (field = p.field, type = "Symbolic", doc = p.doc))
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

    virtual = if group == "edge"
      try 
        QuantumSavory.ProtocolZoo.permits_virtual_edge(pt.type)
      catch e
        @warn "Error checking if protocol type $(pt.type) permits virtual edge" error=e
        false
      end
    else
      nothing
    end

    push!(result, Dict("type" => string(pt.type), "doc" => string(pt.doc), "group" => group, "parameters" => pts |> parse_pt_type, "virtual" => virtual))
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

    # isempty(slots) && continue # TODO: what to do with empty slots?

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

"""
Handle Function or Lambda parameter conversion
"""
function _handle_function_lambda_parameter!(kwargs::Dict{Symbol,Any}, name::Symbol, special_type::String, value, state=nothing)
  if isa(value, Function)
    kwargs[name] = value
    return true
  elseif isa(value, String)
    # Try to resolve by name first (works for both Function and Lambda cases),
    # then fall back to creating a lambda from code.
    resolved = resolve_function_reference(value)
    if resolved === nothing && special_type == "Lambda"
      try
        resolved = create_lambda(value)
        # Validate the lambda - try calling it with a test value if it's a filter
        if name == :filter || name == :chooseA || name == :chooseB
          msg = "Created lambda for parameter: $name"
          if state !== nothing
            @log_event state Logging.Info msg parameter_name=string(name) lambda_string=value
          else
            @info msg parameter_name=name lambda_string=value
          end
          
          # Warn about common mistakes
          if !occursin("return", value) && !occursin("=>", value)
            warning_msg = "Lambda function may not return a value (no 'return' statement or '=>' found). Functions like chooseA/chooseB must return an integer, filter must return a boolean."
            if state !== nothing
              @log_event state Logging.Warn warning_msg parameter_name=string(name) lambda_string=value
            else
              @warn warning_msg parameter_name=name lambda_string=value
            end
          end
        end
      catch e
        msg = "Failed to create lambda from string"
        if state !== nothing
          @log_event state Logging.Warn msg parameter_name=string(name) value=value error=string(e)
        else
          @warn msg parameter_name=name value=value error=e
        end
      end
    end
    if resolved !== nothing
      kwargs[name] = resolved
      return true
    else
      msg = "Could not resolve function/lambda parameter"
      if state !== nothing
        @log_event state Logging.Warn msg parameter_name=string(name) value=value special_type=special_type
      else
        @warn msg parameter_name=name value=value special_type=special_type
      end
      return false
    end
  else
    msg = "Function/Lambda parameter has unsupported value type; skipping"
    if state !== nothing
      @log_event state Logging.Warn msg parameter_name=string(name) value_type=string(typeof(value))
    else
      @warn msg parameter_name=name value_type=typeof(value)
    end
    return false
  end
end

"""
Handle Symbolic parameter conversion
"""
function _handle_symbolic_parameter!(kwargs::Dict{Symbol,Any}, name::Symbol, value)
  if isa(value, String)
    try
      # Use evaluate_symbolic_expression to get the actual symbolic object
      success, symbolic_value, error = Sandbox.evaluate_symbolic_expression(value)
      if success
        kwargs[name] = symbolic_value  # Pass the actual evaluated symbolic object
        return true
      else
        @warn "Failed to evaluate symbolic expression" parameter_name=name value=value error=error
      end
    catch e
      @warn "Failed to create symbolic expression from string" parameter_name=name value=value error=e
    end
  else
    @warn "Symbolic parameter has unsupported value type; skipping" parameter_name=name value_type=typeof(value)
  end
  return false
end

"""
Handle regular parameter conversion
"""
function _handle_regular_parameter!(kwargs::Dict{Symbol,Any}, name::Symbol, ptype::String, value)
  ok, converted = _convert_parameter_value(ptype, value)
  if ok
    kwargs[name] = converted
    return true
  end
  
  # For complex types, try eval with value::type pattern
  eval_expr = "$(value)::$(ptype)"
  try
    @info "Attempting eval" parameter_name=name eval_expr=eval_expr
    kwargs[name] = eval(Meta.parse(eval_expr))
    @info "Eval successful" parameter_name=name
    return true
  catch eval_error
    @warn "Eval failed, skipping parameter" parameter_name=name eval_expr=eval_expr eval_error=eval_error
    # If eval fails, skip the parameter entirely - let constructor use default
  end
  return false
end

function _instantiate_protocol(prot_def, ctx::Dict{Symbol,Any}, state=nothing)
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

    # Skip empty strings for function/lambda parameters
    if isa(value, String) && isempty(strip(value))
      @warn "Parameter has empty value, skipping" parameter_name=name
      continue
    end

    # Apply keyword name mapping if it exists
    if haskey(keyword_mappings, original_name)
      name = Symbol(keyword_mappings[original_name])
    end

    # Convert value based on type
    p_raw_type = get(p, "type", nothing)
    ptype = p_raw_type === nothing ? "Any" : string(p_raw_type)

    # Determine the special parameter type (mutually exclusive)
    special_type = nothing
    
    if isa(p_raw_type, AbstractVector)
      for t in p_raw_type
        ts = string(t)
        if ts in ("Function", "Lambda", "Symbolic")
          special_type = ts
          break
        end
      end
    else
      if ptype in ("Function", "Lambda", "Symbolic")
        special_type = ptype
      end
    end

    # Try to convert the value, fall back gracefully if it fails
    try
      # Debug logging to see which branch is taken
      debug_msg = "Processing parameter: $name, type: $ptype, special_type: $special_type"
      if state !== nothing
        @log_event state Logging.Debug debug_msg
      else
        @debug debug_msg
      end
      
      if special_type == "Function" || special_type == "Lambda"
        _handle_function_lambda_parameter!(kwargs, name, special_type, value, state)
      elseif special_type == "Symbolic"
        _handle_symbolic_parameter!(kwargs, name, value)
      else
        _handle_regular_parameter!(kwargs, name, ptype, value)
      end
    catch e
      msg = "Failed to convert parameter"
      if state !== nothing
        @log_event state Logging.Warn msg parameter_name=string(name) parameter_type=ptype value=value error=string(e)
      else
        @warn msg parameter_name=name parameter_type=ptype value=value error=e
      end
      # Don't set the parameter - let the constructor use its default value
    end
  end

  # Instantiate with all keyword arguments
  @info "Instantiating protocol" protocol_type=T kwargs=kwargs
  # Convert kwargs dict to keyword arguments
  return T(; (k => v for (k, v) in kwargs)...)
end

function simulation_is_running_exception(simulation_name)
  return APIError("Simulation $simulation_name is running, cannot destroy it", 400)
end

function simulation_blocked_exception(simulation_name)
  return APIError("Simulation $simulation_name is expired; destroy it to recreate", 400)
end

function action_is_valid(simulation_name, destroy::Bool = true)
  if haskey(Cqn.STATE, simulation_name)
    state = Cqn.STATE[simulation_name]

    state.is_running && throw(simulation_is_running_exception(simulation_name))

    # If the state has been blocked (either timeout or auto-purged), prevent any modifying actions except destroy
    if (state.execution_time_exceeded || state.auto_purged) && !destroy
      throw(simulation_blocked_exception(simulation_name))
    end

    destroy || return true

    @warn "Simulation $simulation_name already exists, destroying it" simulation_name=simulation_name
    @log_event Cqn.STATE[simulation_name] Logging.Warn "Simulation $simulation_name already exists, destroying it" simulation_name=simulation_name

    Cqn.destroy_simulation(simulation_name)
  end

  return true
end

function parse_network_graph(data)
  g = build_graph(data)

  # Create registers array based on node slots data
  registers, slot_mapping, slot_reverse_mapping = create_registers_from_nodes(data)

  # Create the RegisterNet from the graph and registers
  net = create_register_net(g, registers)

  simulation_name = data["data"]["name"]
  action_is_valid(simulation_name)

  state = Cqn.State(
    name = simulation_name,
    payload = data,
    graph = g,
    network = net,
    slot_mapping = slot_mapping,
    slot_reverse_mapping = slot_reverse_mapping,
  )

  state.simulation_last_active_time = Dates.now()
  Cqn.STATE[simulation_name] = state

  return state
end
