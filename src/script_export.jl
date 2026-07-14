const _SCRIPT_RESERVED_IDENTIFIERS = Set([
  "Base",
  "CairoMakie",
  "ConcurrentSim",
  "Core",
  "Graphs",
  "InteractiveUtils",
  "Main",
  "QuantumSavory",
  "REPL",
  "ResumableFunctions",
  "animation_filename",
  "animation_step",
  "backgrounds",
  "figure",
  "frame_times",
  "graph",
  "network",
  "network_axis",
  "network_observable",
  "node_indices",
  "nodeid",
  "protocol_output_directory",
  "protocols",
  "registers",
  "representations",
  "sim",
  "simulation_duration",
  "traits",
])

const _JULIA_KEYWORDS = Set([
  "abstract", "baremodule", "begin", "break", "catch", "const", "continue", "do",
  "else", "elseif", "end", "export", "false", "finally", "for",
  "function", "global", "if", "import", "in", "isa", "let", "local",
  "macro", "missing", "module", "mutable", "nothing", "primitive",
  "quote", "return", "struct", "true", "try", "type", "using",
  "where", "while",
])

"""Return a single-line representation suitable for generated comments."""
function _script_comment(value)
  replace(strip(string(value)), r"[\x00-\x1f\x7f]+" => " ")
end

function _script_literal(value, context::String)
  if value === nothing
    return "nothing"
  elseif value isa Bool
    return value ? "true" : "false"
  elseif value isa Integer
    return string(value)
  elseif value isa AbstractFloat
    isfinite(value) || throw(validation_error(
      "$context must be finite",
      Dict{String,Any}("value" => string(value)),
    ))
    return repr(value)
  elseif value isa AbstractString
    return repr(String(value))
  elseif value isa AbstractVector
    return "[" * join((_script_literal(item, context) for item in value), ", ") * "]"
  end

  throw(validation_error(
    "$context cannot be represented as Julia source",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_raw_expression(value, context::String)
  if !(value isa AbstractString)
    return _script_literal(value, context)
  end

  source = strip(String(value))
  isempty(source) && throw(validation_error("$context must not be blank"))
  try
    Meta.parse(source; raise=true)
  catch error
    throw(validation_error(
      "$context is not valid Julia syntax",
      Dict{String,Any}("parse_error" => sprint(showerror, error)),
    ))
  end
  return "(" * source * ")"
end

function _script_declared_types(raw_type)
  raw_type isa AbstractVector ? string.(collect(raw_type)) : [string(raw_type === nothing ? "Any" : raw_type)]
end

function _script_declared_type(raw_type)
  types = _script_declared_types(raw_type)
  length(types) == 1 ? only(types) : "Union{" * join(types, ", ") * "}"
end

function _script_special_type(raw_type)
  for type_name in _script_declared_types(raw_type)
    if type_name in ("Function", "Lambda")
      return type_name
    elseif type_name == "Symbolic" ||
           startswith(type_name, "SymbolicUtils.Symbolic{") ||
           type_name == "QuantumSymbolics.SymQObj" ||
           startswith(type_name, "QuantumSymbolics.SymQObj{")
      return "Symbolic"
    end
  end
  return nothing
end

function _script_self_function(value, node_index, context::String)
  source = strip(String(value))
  for (reference, _) in SELF_COMPARISON_OPERATORS
    if source == reference
      node_index === nothing && throw(validation_error(
        "$context uses '$reference', which is only valid for a node protocol",
      ))
      return replace(reference, "self" => string(node_index))
    end
  end
  return nothing
end

function _script_custom_function_expression(source::AbstractString, node_index, context::String)
  _script_raw_expression(source, context)

  named_function = match(r"function\s+([A-Za-z_][A-Za-z0-9_!]*)\s*\(", source)
  result = if named_function === nothing
    "(" * source * ")"
  else
    function_name = only(named_function.captures)
    source * "\n" * function_name
  end

  indented = replace(result, "\n" => "\n    ")
  self_binding = node_index === nothing ? "" : "    self = $node_index\n"
  return "(let\n" * self_binding * "    $indented\nend)"
end

function _script_function_expression(value, special_type::String, node_index, context::String)
  value isa AbstractString || throw(validation_error(
    "$context must be a function name or Julia function expression",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
  source = strip(String(value))

  source == "default" && return nothing
  resolve_function_reference(source) !== nothing && return source

  self_function = _script_self_function(source, node_index, context)
  self_function !== nothing && return self_function

  special_type == "Lambda" || throw(validation_error(
    "$context is not an allowlisted function reference",
    Dict{String,Any}("value" => source),
  ))
  return _script_custom_function_expression(source, node_index, context)
end

function _script_validate_deferred_lambda(value, context::String)
  # `node_index = nothing` would reject node-only `self` before a deferred
  # Lambda has an assignment; validate in a representative node context, then
  # discard this expression and rebuild it with the actual assignment context.
  _script_function_expression(value, "Lambda", 1, context)
  return nothing
end

function _script_states_zoo_expression(recipe, context::String; return_trace::Bool=false)
  # Constructing the allowlisted symbolic value validates exact keys, ranges,
  # and the constructor without evaluating user-provided Julia source.
  construct_states_zoo_recipe(recipe)
  state_type = String(recipe["state_type"])
  _, entry = _states_zoo_entry(state_type)
  parameter_names = QuantumSavory.StatesZoo.stateparameters(entry.type)
  arguments = [
    _script_literal(recipe["parameters"][string(name)], "$context parameter '$(name)'")
    for name in parameter_names
  ]
  constructor = string(entry.type)
  expression = "$constructor(" * join(arguments, ", ") * ")"
  entry.weighted || return expression
  result = return_trace ? "(state / trace, trace)" : "state / trace"
  return "(let\n" *
    "    state = $expression\n" *
    "    trace = abs(QuantumSavory.express(LinearAlgebra.tr(state)))\n" *
    "    $result\n" *
    "end)"
end

function _script_symbolic_expression(value, context::String)
  if _states_zoo_object_like(value) && get(value, "kind", nothing) == "states_zoo"
    return _script_states_zoo_expression(value, context)
  elseif value isa AbstractString
    return _script_raw_expression(value, context)
  end
  throw(validation_error(
    "$context must be Julia symbolic source or a States Zoo recipe",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_regular_expression(raw_type, value, context::String)
  if any(type_name in ("Wildcard", "QuantumSavory.Wildcard") for type_name in _script_declared_types(raw_type))
    return "QuantumSavory.Wildcard()"
  end
  declared_type = _script_declared_type(raw_type)
  converted, converted_value = _convert_parameter_value(declared_type, value)
  converted && return _script_literal(converted_value, context)

  # The normal parser's final fallback interprets complex values as Julia. The
  # exporter preserves that local-script capability but only parses the source;
  # it never evaluates it in the web-server process.
  if value isa AbstractString || value isa Number || value isa AbstractVector
    return _script_raw_expression(value, context)
  end
  throw(validation_error(
    "$context with declared type '$declared_type' cannot be translated",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_value_expression(raw_type, value, context::String; node_index=nothing)
  special_type = _script_special_type(raw_type)
  if special_type in ("Function", "Lambda")
    return _script_function_expression(value, special_type, node_index, context)
  elseif special_type == "Symbolic"
    return _script_symbolic_expression(value, context)
  end
  return _script_regular_expression(raw_type, value, context)
end

function _script_weighted_states_zoo_recipe(variable::Variable)
  _script_special_type(variable.type) == "Symbolic" || return nothing
  recipe = variable.value
  _states_zoo_object_like(recipe) || return nothing
  get(recipe, "kind", nothing) == "states_zoo" || return nothing
  state_type = get(recipe, "state_type", nothing)
  state_type isa AbstractString || return nothing
  _, entry = _states_zoo_entry(state_type)
  return entry.weighted ? recipe : nothing
end

function _script_states_zoo_trace_owner(
  companion::Variable,
  raw_companion,
  variables::Dict{String,Variable},
)
  haskey(raw_companion, "statesZooTraceSourceId") || return nothing
  context = "Generated trace variable '$(_script_comment(companion.name))'"
  raw_owner = raw_companion["statesZooTraceSourceId"]
  raw_owner isa AbstractString || throw(validation_error(
    "$context field 'statesZooTraceSourceId' must be a string",
  ))
  owner_id = strip(String(raw_owner))
  isempty(owner_id) && throw(validation_error(
    "$context field 'statesZooTraceSourceId' must not be blank",
  ))
  source = get(variables, owner_id, nothing)
  source === nothing && throw(validation_error(
    "$context references an unknown States Zoo variable '$owner_id'",
  ))
  _script_weighted_states_zoo_recipe(source) !== nothing || throw(validation_error(
    "$context owner '$owner_id' must be a weighted States Zoo variable",
  ))

  expected_id = "$(source.id)_tr"
  expected_name = "$(source.name)_tr"
  if companion.id != expected_id || companion.name != expected_name || companion.type != "Float64"
    throw(validation_error(
      "$context does not match its weighted States Zoo owner",
      Dict{String,Any}(
        "expected_id" => expected_id,
        "expected_name" => expected_name,
        "expected_type" => "Float64",
      ),
    ))
  end
  return source
end

function _script_identifier(raw_value, used::Set{String}, fallback::String)
  raw = string(raw_value)
  identifier = replace(raw, r"[^A-Za-z0-9_]" => "_")
  identifier = replace(identifier, r"_+" => "_")
  identifier = strip(identifier, '_')
  if isempty(identifier)
    identifier = fallback
  elseif !isletter(first(identifier)) && first(identifier) != '_'
    identifier = "$(fallback)_$identifier"
  end
  identifier in _JULIA_KEYWORDS && (identifier = "$(fallback)_$identifier")

  candidate = identifier
  suffix = 2
  while candidate in used
    candidate = "$(identifier)_$(suffix)"
    suffix += 1
  end
  push!(used, candidate)
  return candidate
end

function _script_filename(project_name)
  basename = string(project_name)
  basename = lowercase(replace(basename, r"[^A-Za-z0-9._-]+" => "-"))
  basename = strip(basename, ['.', '-', '_'])
  isempty(basename) && (basename = "quantumsavory-simulation")
  return first(basename, min(length(basename), 100)) * ".jl"
end

function _script_simulation_config(payload)
  config = get(payload, "simulationConfig", Dict{String,Any}())
  _is_object_like(config) || throw(validation_error(
    "Field 'simulationConfig' must be an object",
    Dict{String,Any}("received_type" => string(typeof(config))),
  ))

  duration = get(config, "time", 1.0)
  time_step = get(config, "timeStep", 0.1)
  for (name, value) in (("time", duration), ("timeStep", time_step))
    (value isa Real && !(value isa Bool) && isfinite(value) && value > 0) ||
      throw(validation_error(
        "simulationConfig.$name must be a positive finite number",
        Dict{String,Any}("value" => value),
      ))
  end
  return Float64(duration), Float64(time_step)
end

function _script_noise_expression(noise_definition, context::String)
  noise_definition === nothing && return "nothing"
  if noise_definition isa AbstractString
    String(noise_definition) == "default" && return "nothing"
    type_name = String(noise_definition)
    parameters = Any[]
  elseif _is_object_like(noise_definition)
    type_name = _required_nonempty_string(noise_definition, "type", context)
    type_name == "default" && return "nothing"
    parameters = get(noise_definition, "parameters", Any[])
    parameters isa AbstractVector || throw(validation_error("$context parameters must be an array"))
  else
    throw(validation_error(
      "$context must be a background-noise object, string, or null",
      Dict{String,Any}("received_type" => string(typeof(noise_definition))),
    ))
  end

  noise_type = _resolve_type_from_string(type_name, :noise)
  noise_type === nothing && throw(validation_error("$context has unknown type '$type_name'"))
  metadata = Dict(string(parameter.field) => parameter.type for parameter in QuantumSavory.constructor_metadata(noise_type))
  keywords = String[]
  for parameter in parameters
    _is_object_like(parameter) || throw(validation_error("$context parameter must be an object"))
    name = haskey(parameter, "name") ? String(parameter["name"]) : String(get(parameter, "field", ""))
    isempty(name) && throw(validation_error("$context parameter is missing its name"))
    haskey(metadata, name) || throw(validation_error("$context has unknown parameter '$name'"))
    value = get(parameter, "value", nothing)
    value === nothing && continue
    expression = _script_regular_expression(metadata[name], value, "$context parameter '$name'")
    push!(keywords, "$name = $expression")
  end
  constructor = string(noise_type)
  return isempty(keywords) ? "$constructor()" : "$constructor(; " * join(keywords, ", ") * ")"
end

function _script_variable_bindings(payload, lines::Vector{String}, used::Set{String})
  variables = _parse_variables(payload)
  bindings = Dict{String,NamedTuple}()
  raw_variables = get(payload, "variables", Any[])

  if isempty(raw_variables)
    push!(lines, "# This project does not define simulation-wide variables.")
    return bindings
  end

  ordered_variables = [
    (
      index=index,
      raw=raw_variable,
      variable=variables[String(raw_variable["id"])],
    ) for (index, raw_variable) in enumerate(raw_variables)
  ]
  # Allocate every binding before emitting assignments. A generated trace
  # companion can precede its weighted state in imported payloads, but both
  # names must still participate in deterministic collision resolution.
  for item in ordered_variables
    variable = item.variable
    special_type = _script_special_type(variable.type)
    binding = _script_identifier(
      "variable_$(variable.name)",
      used,
      "variable_$(item.index)",
    )
    uses_default = lowercase(variable.type) == "default" || (
      variable.type == "Function" &&
      variable.value isa AbstractString &&
      lowercase(strip(String(variable.value))) == "default"
    )
    self_dependent = special_type in ("Function", "Lambda") && any(
      first(pair) == strip(string(variable.value)) for pair in SELF_COMPARISON_OPERATORS
    )
    per_assignment = special_type == "Lambda" || self_dependent
    fresh_wildcard = variable.type in ("Wildcard", "QuantumSavory.Wildcard")
    bindings[variable.id] = (
      name=binding,
      variable=variable,
      per_assignment=per_assignment,
      fresh_wildcard=fresh_wildcard,
      uses_default=uses_default,
    )
  end

  trace_companions = Dict{String,String}()
  for item in ordered_variables
    source = _script_states_zoo_trace_owner(
      item.variable,
      item.raw,
      variables,
    )
    source === nothing || (trace_companions[source.id] = item.variable.id)
  end
  paired_trace_ids = Set(values(trace_companions))

  for item in ordered_variables
    variable = item.variable
    variable.id in paired_trace_ids && continue
    binding = bindings[variable.id]

    if haskey(trace_companions, variable.id)
      companion_id = trace_companions[variable.id]
      companion_binding = bindings[companion_id]
      expression = _script_states_zoo_expression(
        variable.value,
        "Variable '$(_script_comment(variable.name))'";
        return_trace=true,
      )
      push!(
        lines,
        "$(binding.name), $(companion_binding.name) = $expression" *
        "  # GUI variable IDs: $(_script_comment(variable.id)), $(_script_comment(companion_id))",
      )
      continue
    end

    if binding.uses_default
      push!(
        lines,
        "$(binding.name) = nothing" *
        "  # GUI variable \"$(_script_comment(variable.name))\": constructor default",
      )
      continue
    end

    if binding.per_assignment
      if _script_special_type(variable.type) == "Lambda"
        _script_validate_deferred_lambda(
          variable.value,
          "Variable '$(_script_comment(variable.name))'",
        )
      end
      push!(
        lines,
        "# GUI variable \"$(_script_comment(variable.name))\" is instantiated at each protocol assignment" *
        "  # GUI variable ID: $(_script_comment(variable.id))",
      )
      continue
    end

    expression = if binding.fresh_wildcard
      "(() -> QuantumSavory.Wildcard())"
    else
      _script_value_expression(variable.type, variable.value, "Variable '$(_script_comment(variable.name))'")
    end
    expression === nothing && throw(validation_error("Variable '$(_script_comment(variable.name))' cannot use a constructor default here"))
    push!(
      lines,
      "$(binding.name) = $expression  # GUI variable ID: $(_script_comment(variable.id))",
    )
  end
  return bindings
end

function _script_protocol_parameter_expression(parameter, variable_bindings, context::String; node_index=nothing)
  name = _required_nonempty_string(parameter, "name", "$context parameter")
  value = get(parameter, "value", nothing)
  value === nothing && return name, nothing
  value isa AbstractString && isempty(strip(String(value))) && return name, nothing

  reference = _parse_variable_reference(value; context="$context parameter '$name'")
  if reference !== nothing
    binding = get(variable_bindings, reference.id, nothing)
    binding === nothing && throw(validation_error("$context parameter '$name' references an unknown variable"))
    binding.uses_default && return name, nothing
    binding.fresh_wildcard && return name, "$(binding.name)()"
    if binding.per_assignment
      expression = _script_value_expression(
        binding.variable.type,
        binding.variable.value,
        "Variable '$(_script_comment(binding.variable.name))' assigned to $context parameter '$name'";
        node_index=node_index,
      )
      expression === nothing && throw(validation_error(
        "Variable '$(_script_comment(binding.variable.name))' cannot use a constructor default here",
      ))
      return name, expression
    end
    return name, binding.name
  end

  expression = _script_value_expression(get(parameter, "type", nothing), value, "$context parameter '$name'"; node_index=node_index)
  return name, expression
end

function _script_protocol!(
  lines::Vector{String},
  protocol_definition,
  variable_bindings,
  used::Set{String},
  protocol_entries::Vector{Pair{String,String}},
  context::String;
  node_index=nothing,
  node_a=nothing,
  node_b=nothing,
)
  _is_object_like(protocol_definition) || throw(validation_error("$context must be an object"))
  raw_type = _required_nonempty_string(protocol_definition, "type", context)
  protocol_type = _resolve_type_from_string(raw_type, :protocol)
  protocol_type === nothing && throw(validation_error("$context has unknown type '$raw_type'"))
  parameters = get(protocol_definition, "parameters", Any[])
  parameters isa AbstractVector || throw(validation_error("$context parameters must be an array"))

  keywords = ["sim = sim", "net = network"]
  if node_index !== nothing
    push!(keywords, "node = $node_index")
  elseif node_a !== nothing && node_b !== nothing
    push!(keywords, "nodeA = $node_a", "nodeB = $node_b")
  end

  for parameter in parameters
    _is_object_like(parameter) || throw(validation_error("$context parameter must be an object"))
    name, expression = _script_protocol_parameter_expression(
      parameter,
      variable_bindings,
      context;
      node_index=node_index,
    )
    name in ("sim", "net", "node", "nodeA", "nodeB") && continue
    expression === nothing && continue
    keyword = name == "log" ? "_log" : name
    Base.isidentifier(keyword) || throw(validation_error("$context parameter '$name' is not a valid Julia keyword"))
    push!(keywords, "$keyword = $expression")
  end

  protocol_id = string(get(protocol_definition, "id", context))
  binding = _script_identifier(
    "protocol_instance_$protocol_id",
    used,
    "protocol_instance_$(length(protocol_entries) + 1)",
  )
  constructor = string(protocol_type)
  push!(lines, "# $(_script_comment(context)); GUI protocol ID: $(_script_comment(protocol_id))")
  push!(lines, "$binding = $constructor(; " * join(keywords, ", ") * ")")
  push!(lines, "@process $binding()")
  push!(lines, "")
  push!(protocol_entries, protocol_id => binding)
  return nothing
end

"""
Generate a deterministic, standalone Julia script for one validated GUI project.

The function parses user-provided Julia expressions for syntax but never
evaluates them and never creates or mutates a server-side simulation.
"""
function generate_julia_script(payload)
  _is_object_like(payload) || throw(validation_error("Export payload must be an object"))
  validation = validate_payload(payload)
  data = validation["data"]
  reject_mock_broken_protocol_export(data)
  nodes = validation["graph_info"]["nodes"]
  edges = validation["graph_info"]["edges"]
  isempty(nodes) && throw(validation_error(
    "A runnable QuantumSavory script requires at least one node",
  ))
  duration, time_step = _script_simulation_config(data)
  filename = _script_filename(data["name"])
  output_stem = first(filename, length(filename) - 3)

  lines = String[
    "# This file was generated by WebQuantumSavory as pedagogical onboarding.",
    "# The GUI simulator does not execute this file, and some GUI-only features may not translate.",
    "# For the full power of QuantumSavory.jl, use its programmatic interface and write custom simulations.",
    "# Review any exported symbolic or lambda expressions before running this file.",
    "#",
    "# In a Julia environment, install the dependencies once with:",
    "# import Pkg; Pkg.add([\"QuantumSavory\", \"Graphs\", \"ConcurrentSim\", \"ResumableFunctions\", \"CairoMakie\"])",
    "",
    "using QuantumSavory",
    "using QuantumSavory.ProtocolZoo",
    "using QuantumSavory.StatesZoo",
    "using Graphs",
    "using ConcurrentSim",
    "using ResumableFunctions",
    "using CairoMakie",
    "using LinearAlgebra",
    "import InteractiveUtils, REPL",
    "",
    "CairoMakie.activate!()",
    "",
    "# -----------------------------------------------------------------------------",
    "# Simulation settings",
    "# -----------------------------------------------------------------------------",
    "simulation_duration = $(_script_literal(duration, "simulation duration"))",
    "animation_step = $(_script_literal(time_step, "animation step"))",
    "animation_filename = $(_script_literal(output_stem * ".mp4", "animation filename"))",
    "protocol_output_directory = $(_script_literal(output_stem * "-protocols", "protocol output directory"))",
    "",
    "# -----------------------------------------------------------------------------",
    "# Variables",
    "# -----------------------------------------------------------------------------",
  ]

  used = copy(_SCRIPT_RESERVED_IDENTIFIERS)
  variable_bindings = _script_variable_bindings(data, lines, used)

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Registers",
    "# -----------------------------------------------------------------------------",
    "registers = QuantumSavory.Register[]",
  ])
  for (node_index, node) in enumerate(nodes)
    node_data = node["data"]
    _is_object_like(node_data) || throw(validation_error("Node $node_index data must be an object"))
    node_name = _script_comment(node["name"])
    node_id = _script_comment(node["id"])
    push!(lines, "")
    push!(lines, "# Node $node_index: $node_name (GUI ID: $node_id)")
    slots = get(node_data, "slots", Any[])
    slots isa AbstractVector || throw(validation_error("Node $node_index slots must be an array"))
    isempty(slots) && throw(validation_error(
      "Node $node_index requires at least one slot for a runnable QuantumSavory register",
    ))
    trait_expressions = String[]
    background_expressions = String[]
    for (slot_index, slot) in enumerate(slots)
      _is_object_like(slot) || throw(validation_error("Node $node_index slot $slot_index must be an object"))
      slot_type_name = _required_nonempty_string(slot, "type", "Node $node_index slot $slot_index")
      slot_type = _resolve_type_from_string(slot_type_name, :slot)
      slot_type === nothing && throw(validation_error("Node $node_index slot $slot_index has unknown type '$slot_type_name'"))
      push!(trait_expressions, "$(string(slot_type))()")
      push!(background_expressions, _script_noise_expression(
        get(slot, "backgroundNoise", nothing),
        "Node $node_index slot $slot_index background noise",
      ))
    end
    traits = isempty(trait_expressions) ? "Any[]" : "[" * join(trait_expressions, ", ") * "]"
    representations = isempty(trait_expressions) ? "Any[]" : "[" * join(fill("QuantumSavory.QuantumOpticsRepr()", length(trait_expressions)), ", ") * "]"
    backgrounds = isempty(background_expressions) ? "Any[]" : "[" * join(background_expressions, ", ") * "]"
    push!(lines, "traits = $traits")
    push!(lines, "representations = $representations")
    push!(lines, "backgrounds = $backgrounds")
    push!(lines, "push!(registers, QuantumSavory.Register(traits, representations, backgrounds))")
  end

  append!(lines, [
    "",
    "# Resolve GUI node names to their one-based register indices.",
    "node_indices = Dict{String,Int}(",
  ])
  for (node_index, node) in enumerate(nodes)
    node_name = _script_literal(node["name"], "node name")
    push!(
      lines,
      "    $node_name => $node_index,",
    )
  end
  append!(lines, [
    ")",
    "nodeid(name::String)::Int = node_indices[name]",
  ])

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Register network and simulation clock",
    "# -----------------------------------------------------------------------------",
    "graph = Graphs.SimpleGraph(length(registers))",
  ])
  id_to_index = Dict(String(node["id"]) => index for (index, node) in enumerate(nodes))
  for edge in edges
    source = get(id_to_index, String(edge["source"]), nothing)
    target = get(id_to_index, String(edge["target"]), nothing)
    (source !== nothing && target !== nothing) || throw(validation_error("Edge references an unknown node"))
    push!(lines, "Graphs.add_edge!(graph, $source, $target)")
  end
  append!(lines, [
    "network = QuantumSavory.RegisterNet(graph, registers; names = $(_script_literal(_register_names(nodes), "register names")))",
    "sim = QuantumSavory.get_time_tracker(network)",
    "",
    "# -----------------------------------------------------------------------------",
    "# Protocol construction and initialization",
    "# -----------------------------------------------------------------------------",
  ])

  protocol_entries = Pair{String,String}[]
  for (node_index, node) in enumerate(nodes)
    node_data = node["data"]
    _is_object_like(node_data) || throw(validation_error("Node $node_index data must be an object"))
    protocols = get(node_data, "protocols", Any[])
    protocols isa AbstractVector || throw(validation_error("Node $node_index protocols must be an array"))
    for (protocol_index, protocol) in enumerate(protocols)
      _script_protocol!(
        lines, protocol, variable_bindings, used, protocol_entries,
        "Node $node_index protocol $protocol_index";
        node_index=node_index,
      )
    end
  end
  for (edge_index, edge) in enumerate(edges)
    edge_data = get(edge, "data", Dict{String,Any}())
    _is_object_like(edge_data) || throw(validation_error("Edge $edge_index data must be an object"))
    protocols = get(edge_data, "protocols", Any[])
    protocols isa AbstractVector || throw(validation_error("Edge $edge_index protocols must be an array"))
    source = id_to_index[String(edge["source"])]
    target = id_to_index[String(edge["target"])]
    for (protocol_index, protocol) in enumerate(protocols)
      _script_protocol!(
        lines, protocol, variable_bindings, used, protocol_entries,
        "Edge $edge_index protocol $protocol_index";
        node_a=source,
        node_b=target,
      )
    end
  end
  floating_protocols = get(data["net"], "protocols", Any[])
  floating_protocols isa AbstractVector || throw(validation_error("Floating protocols must be an array"))
  for (protocol_index, protocol) in enumerate(floating_protocols)
    _script_protocol!(
      lines, protocol, variable_bindings, used, protocol_entries,
      "Floating protocol $protocol_index",
    )
  end

  if isempty(protocol_entries)
    push!(lines, "# This project does not configure any protocols.")
    push!(lines, "protocols = Pair{String,Any}[]")
  else
    push!(lines, "protocols = Pair{String,Any}[")
    for (protocol_id, binding) in protocol_entries
      push!(lines, "    $(_script_literal(protocol_id, "protocol ID")) => $binding,")
    end
    push!(lines, "]")
  end

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Run the simulation for a fixed amount of time (active by default)",
    "# -----------------------------------------------------------------------------",
    "# Choose only one execution recipe. Comment this line before enabling either",
    "# optional recipe below; a ConcurrentSim simulation cannot be rewound.",
    "ConcurrentSim.run(sim, simulation_duration)",
    "",
    "# -----------------------------------------------------------------------------",
    "# Optional: animate the network while the simulation executes",
    "# Remove the #= and =# delimiters, and comment out the fixed run above.",
    "# -----------------------------------------------------------------------------",
    "#=",
    "figure = CairoMakie.Figure(size = (700, 500))",
    "_, network_axis, _, network_observable = QuantumSavory.registernetplot_axis(figure[1, 1], network)",
    "frame_times = collect(0:animation_step:simulation_duration)",
    "last(frame_times) < simulation_duration && push!(frame_times, simulation_duration)",
    "CairoMakie.record(figure, animation_filename, frame_times; framerate = 10) do time",
    "    ConcurrentSim.run(sim, time)",
    "    notify(network_observable)",
    "    network_axis.title = \"t=\$(round(time; digits = 3))\"",
    "end",
    "=#",
    "",
    "# -----------------------------------------------------------------------------",
    "# Optional: save each protocol's state as a PNG using its show method",
    "# Remove the #= and =# delimiters, and comment out the fixed run above.",
    "# -----------------------------------------------------------------------------",
    "#=",
    "ConcurrentSim.run(sim, simulation_duration)",
    "mkpath(protocol_output_directory)",
    "for (index, (protocol_id, protocol)) in enumerate(protocols)",
    "    safe_id = replace(protocol_id, r\"[^A-Za-z0-9._-]+\" => \"-\")",
    "    output_path = joinpath(protocol_output_directory, \"\$(index)-\$(safe_id).png\")",
    "    try",
    "        open(output_path, \"w\") do io",
    "            show(io, MIME\"image/png\"(), protocol)",
    "        end",
    "    catch error",
    "        isfile(output_path) && rm(output_path; force = true)",
    "        @warn \"This protocol does not provide a PNG visualization\" protocol_id exception = (error, catch_backtrace())",
    "    end",
    "end",
    "=#",
    "",
  ])

  script = join(lines, "\n")
  try
    Meta.parseall(script)
  catch error
    throw(server_error(
      "Generated Julia script failed internal syntax validation",
      Dict{String,Any}("parse_error" => sprint(showerror, error)),
    ))
  end
  return script
end

function generate_julia_script_export(payload)
  script = generate_julia_script(payload)
  Dict{String,Any}(
    "success" => true,
    "script" => script,
    "filename" => _script_filename(payload["name"]),
  )
end
