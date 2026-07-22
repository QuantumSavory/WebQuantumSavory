"""Restricted, parse-only validation for user-authored Julia expressions."""

const SOURCE_MAX_BYTES = 4_096
const SOURCE_IDENTIFIER_MAX_BYTES = 64
const SOURCE_STRING_MAX_BYTES = 1_024
const SOURCE_AST_MAX_NODES = 256
const SYMBOLIC_AST_MAX_NODES = 128
const SOURCE_AST_MAX_DEPTH = 32
const SOURCE_FUNCTION_MAX_ARGUMENTS = 8
const SOURCE_CALL_MAX_OPERANDS = 8
const SOURCE_LITERAL_MAX_ELEMENTS = 256
const SOURCE_RUNTIME_MAX_DEPTH = 8
const SOURCE_RUNTIME_MAX_ELEMENTS = 4_096
const SYMBOLIC_LATEX_MAX_BYTES = 16 * 1_024

const SOURCE_PROFILES = (
  :custom_function,
  :query_predicate,
  :numeric_expression,
  :symbolic_expression,
)

const SOURCE_PLACEMENTS = ("node", "edge", "floating", "variable", "query", "symbolic")

"""One authoritative lexical-context descriptor used by every source surface."""
struct SourceContextDescriptor
  binding::Symbol
  placements::Tuple{Vararg{String}}
  category::Symbol
  unit::Union{Nothing,String}
  description::String
  field::Union{Nothing,Symbol}
  payload_key::Union{Nothing,String}
  payload_label::Union{Nothing,String}
  positive::Bool
  maximum::Union{Nothing,Float64}
  payload_default::Union{Nothing,Float64}
  payload_nullable::Bool
  representative::Any
  script_label::String
end

const SOURCE_CONTEXT_DESCRIPTORS = (
  SourceContextDescriptor(
    :nodeid,
    ("node", "edge", "floating", "variable"),
    :resolver,
    nothing,
    "Return the one-based simulator node ID for an exact node name.",
    nothing,
    nothing,
    nothing,
    false,
    nothing,
    nothing,
    false,
    nothing,
    "node-name resolver",
  ),
  SourceContextDescriptor(
    :self,
    ("node", "variable"),
    :node,
    nothing,
    "The one-based simulator ID of the current node protocol.",
    :self,
    nothing,
    nothing,
    false,
    nothing,
    nothing,
    false,
    1,
    "current node ID",
  ),
  SourceContextDescriptor(
    :distance,
    ("edge", "variable"),
    :edge_physical,
    "m",
    "The resolved physical-edge distance in meters, or nothing on a virtual edge.",
    :distance_meters,
    "distanceMeters",
    "distance",
    false,
    nothing,
    nothing,
    true,
    1.0,
    "edge distance",
  ),
  SourceContextDescriptor(
    :delay,
    ("edge", "variable"),
    :edge_physical,
    "s",
    "The resolved propagation delay in seconds, or nothing on a virtual edge.",
    :delay_seconds,
    "propagationDelaySeconds",
    "propagation delay",
    false,
    nothing,
    0.0,
    false,
    2.0,
    "edge delay",
  ),
  SourceContextDescriptor(
    :refractive_index,
    ("edge", "variable"),
    :edge_physical,
    nothing,
    "The dimensionless edge refractive index, or nothing on a virtual edge.",
    :refractive_index,
    "refractiveIndex",
    "refractive index",
    true,
    nothing,
    nothing,
    true,
    1.5,
    "edge refractive index",
  ),
  SourceContextDescriptor(
    :loss,
    ("edge", "variable"),
    :edge_physical,
    "dB/km",
    "The resolved edge loss in dB/km, or nothing on a virtual edge.",
    :loss_db_per_km,
    "lossDbPerKm",
    "fiber loss",
    false,
    nothing,
    nothing,
    true,
    0.2,
    "edge fiber loss",
  ),
  SourceContextDescriptor(
    :transmissivity,
    ("edge", "variable"),
    :edge_physical,
    nothing,
    "The dimensionless edge transmissivity from zero through one, or nothing on a virtual edge.",
    :transmissivity,
    "transmissivity",
    "transmissivity",
    false,
    1.0,
    nothing,
    true,
    0.95,
    "edge transmissivity",
  ),
  SourceContextDescriptor(
    :node_a,
    ("edge", "variable"),
    :edge_endpoint,
    nothing,
    "The one-based simulator ID of the submitted edge source endpoint.",
    :node_a,
    nothing,
    nothing,
    false,
    nothing,
    nothing,
    false,
    1,
    "edge source node ID",
  ),
  SourceContextDescriptor(
    :node_b,
    ("edge", "variable"),
    :edge_endpoint,
    nothing,
    "The one-based simulator ID of the submitted edge target endpoint.",
    :node_b,
    nothing,
    nothing,
    false,
    nothing,
    nothing,
    false,
    2,
    "edge target node ID",
  ),
)

const EDGE_CONTEXT_DESCRIPTORS = Tuple(filter(
  descriptor -> descriptor.category === :edge_physical,
  SOURCE_CONTEXT_DESCRIPTORS,
))

const EDGE_ENDPOINT_CONTEXT_DESCRIPTORS = Tuple(filter(
  descriptor -> descriptor.category === :edge_endpoint,
  SOURCE_CONTEXT_DESCRIPTORS,
))

const _SOURCE_CONTEXT_BY_NAME = Dict(
  descriptor.binding => descriptor for descriptor in SOURCE_CONTEXT_DESCRIPTORS
)

"""Resolved values captured lexically by source assigned to an edge."""
struct _EdgeFunctionContext
  distance_meters::Union{Nothing,Float64}
  delay_seconds::Union{Nothing,Float64}
  refractive_index::Union{Nothing,Float64}
  loss_db_per_km::Union{Nothing,Float64}
  transmissivity::Union{Nothing,Float64}
  node_a::Int
  node_b::Int
end

"""Build the shared one-based node-name lookup from validated node order."""
function _node_name_to_index(nodes)::Dict{String,Int}
  return Dict{String,Int}(
    (node isa AbstractString ? String(node) : string(node["name"])) => index
    for (index, node) in enumerate(nodes)
  )
end

"""Create the strictly typed `nodeid` resolver captured by evaluated source."""
_nodeid_resolver(node_name_to_index::Dict{String,Int}) =
  (name::String) -> node_name_to_index[name]

"""Return stable lexical values for validation before concrete assignment."""
function _representative_source_context(placement::AbstractString)
  placement = String(placement)
  placement in ("node", "edge", "floating", "variable") || throw(ArgumentError(
    "Source placement must be 'node', 'edge', 'floating', or 'variable'",
  ))

  representative_nodeid(::String)::Int = 1
  self_node_index = placement in ("node", "variable") ? 1 : nothing
  edge_context = placement in ("edge", "variable") ?
    _EdgeFunctionContext(
      (descriptor.representative for descriptor in EDGE_CONTEXT_DESCRIPTORS)...,
      (descriptor.representative for descriptor in EDGE_ENDPOINT_CONTEXT_DESCRIPTORS)...,
    ) : nothing
  return (; nodeid=representative_nodeid, self_node_index, edge_context)
end

const COMPARISON_CURRY_OPERATORS = (
  Symbol("=="),
  Symbol("!="),
  Symbol("<"),
  Symbol("<="),
  Symbol(">"),
  Symbol(">="),
  Symbol("≠"),
  Symbol("≤"),
  Symbol("≥"),
)

const _COMPARISON_OPERATOR_VALUES = Dict{Symbol,Any}(
  Symbol("==") => (==),
  Symbol("!=") => (!=),
  Symbol("<") => (<),
  Symbol("<=") => (<=),
  Symbol(">") => (>),
  Symbol(">=") => (>=),
  Symbol("≠") => (≠),
  Symbol("≤") => (≤),
  Symbol("≥") => (≥),
)

const ORDINARY_OPERATION_DEFINITIONS = (
  (name=Symbol("+"), value=(+), minimum_arity=1, maximum_arity=2, category="arithmetic"),
  (name=Symbol("-"), value=(-), minimum_arity=1, maximum_arity=2, category="arithmetic"),
  (name=Symbol("*"), value=(*), minimum_arity=2, maximum_arity=2, category="arithmetic"),
  (name=Symbol("/"), value=(/), minimum_arity=2, maximum_arity=2, category="arithmetic"),
  (name=Symbol("^"), value=(^), minimum_arity=2, maximum_arity=2, category="arithmetic"),
  (name=:div, value=div, minimum_arity=2, maximum_arity=2, category="arithmetic"),
  (name=:rem, value=rem, minimum_arity=2, maximum_arity=2, category="arithmetic"),
  (name=:mod, value=mod, minimum_arity=2, maximum_arity=2, category="arithmetic"),
  ((name=operator, value=_COMPARISON_OPERATOR_VALUES[operator], minimum_arity=2,
    maximum_arity=2, category="comparison") for operator in COMPARISON_CURRY_OPERATORS)...,
  (name=Symbol("!"), value=(!), minimum_arity=1, maximum_arity=1, category="boolean"),
  (name=:abs, value=abs, minimum_arity=1, maximum_arity=1, category="numeric"),
  (name=:min, value=min, minimum_arity=2, maximum_arity=SOURCE_CALL_MAX_OPERANDS, category="numeric"),
  (name=:max, value=max, minimum_arity=2, maximum_arity=SOURCE_CALL_MAX_OPERANDS, category="numeric"),
  (name=:minimum, value=minimum, minimum_arity=1, maximum_arity=1, category="collection"),
  (name=:maximum, value=maximum, minimum_arity=1, maximum_arity=1, category="collection"),
  (name=:sum, value=sum, minimum_arity=1, maximum_arity=1, category="collection"),
  (name=:clamp, value=clamp, minimum_arity=3, maximum_arity=3, category="numeric"),
  (name=:sqrt, value=sqrt, minimum_arity=1, maximum_arity=1, category="numeric"),
  (name=:round, value=round, minimum_arity=1, maximum_arity=1, category="numeric"),
  (name=:floor, value=floor, minimum_arity=1, maximum_arity=1, category="numeric"),
  (name=:ceil, value=ceil, minimum_arity=1, maximum_arity=1, category="numeric"),
  (name=:isfinite, value=isfinite, minimum_arity=1, maximum_arity=1, category="predicate"),
  (name=:isinf, value=isinf, minimum_arity=1, maximum_arity=1, category="predicate"),
  (name=:isnan, value=isnan, minimum_arity=1, maximum_arity=1, category="predicate"),
  (name=:isnothing, value=isnothing, minimum_arity=1, maximum_arity=1, category="predicate"),
  (name=:length, value=length, minimum_arity=1, maximum_arity=1, category="collection"),
  (name=:first, value=first, minimum_arity=1, maximum_arity=1, category="collection"),
  (name=:last, value=last, minimum_arity=1, maximum_arity=1, category="collection"),
  (name=:in, value=in, minimum_arity=2, maximum_arity=2, category="collection"),
  (name=:Int64, value=Int64, minimum_arity=1, maximum_arity=1, category="conversion"),
  (name=:Float64, value=Float64, minimum_arity=1, maximum_arity=1, category="conversion"),
)

const _ORDINARY_OPERATION_BY_NAME = Dict(
  definition.name => definition for definition in ORDINARY_OPERATION_DEFINITIONS
)

const SOURCE_CONSTANT_DEFINITIONS = (
  (name=:nothing, value=nothing, description="Julia's absence value."),
  (name=:π, value=π, description="Julia's circle constant."),
  (name=:Inf, value=Inf, description="Positive Float64 infinity."),
  (name=:NaN, value=NaN, description="The Float64 not-a-number value."),
)

const _SOURCE_CONSTANT_BY_NAME = Dict(
  definition.name => definition for definition in SOURCE_CONSTANT_DEFINITIONS
)

const _FORBIDDEN_SOURCE_NAMES = Set{Symbol}((
  :Base, :Core, :Main, :eval, :include, :ccall, :llvmcall,
  :getfield, :setfield!, :getglobal, :setglobal!, :getproperty, :setproperty!,
  :parentmodule, :names, :methods, :which, :applicable, :invoke, :invokelatest,
  :fieldnames, :propertynames, :module, :baremodule, :using, :import, :export,
  :global, :local, :const, :macro, :quote, :task, :schedule, :open, :read, :write,
  :download, :run, :pipeline, :Cmd, :ENV, :ARGS, :stdin, :stdout, :stderr,
))

function _symbolic_root_type()
  isdefined(QuantumSavory, :SymQObj) || return nothing
  return getfield(QuantumSavory, :SymQObj)
end

function _is_symbolic_value(value)
  root = _symbolic_root_type()
  root === nothing && return false
  return try
    value isa root
  catch
    false
  end
end

function _is_symbolic_type_value(value)
  root = _symbolic_root_type()
  root === nothing && return false
  return try
    value isa Type && value <: root
  catch
    false
  end
end

function _symbolic_atom_definitions()
  atoms = NamedTuple[]
  reserved = union(
    Set(keys(_ORDINARY_OPERATION_BY_NAME)),
    Set(keys(_SOURCE_CONSTANT_BY_NAME)),
    Set(keys(_SOURCE_CONTEXT_BY_NAME)),
    _FORBIDDEN_SOURCE_NAMES,
  )
  for name in names(QuantumSavory; all=false, imported=false)
    name in reserved && continue
    ncodeunits(string(name)) <= SOURCE_IDENTIFIER_MAX_BYTES || continue
    isdefined(QuantumSavory, name) || continue
    value = getfield(QuantumSavory, name)
    _is_symbolic_value(value) || continue
    push!(atoms, (name=name, value=value, type=string(typeof(value))))
  end
  sort!(atoms; by=definition -> string(definition.name))
  return Tuple(atoms)
end

function _symbolic_constructor_field_allowed(field_type)
  field_type === Any && return false
  field_type isa TypeVar && return false
  field_type in (Bool, Int64, Float64, String, Number, Real) && return true
  _is_symbolic_type_value(field_type) && return true
  return false
end

function _is_symbolic_metadata_field(name::Symbol, field_type)
  name === :metadata || return false
  return occursin("Metadata", string(field_type))
end

function _symbolic_constructor_definitions()
  constructors = NamedTuple[]
  root = _symbolic_root_type()
  root === nothing && return ()
  reserved = union(
    Set(keys(_ORDINARY_OPERATION_BY_NAME)),
    Set(keys(_SOURCE_CONSTANT_BY_NAME)),
    Set(keys(_SOURCE_CONTEXT_BY_NAME)),
    _FORBIDDEN_SOURCE_NAMES,
  )
  for name in names(QuantumSavory; all=false, imported=false)
    name in reserved && continue
    isdefined(QuantumSavory, name) || continue
    constructor = getfield(QuantumSavory, name)
    constructor isa DataType || continue
    isconcretetype(constructor) || continue
    _is_symbolic_type_value(constructor) || continue
    occursin("StatesZoo", string(parentmodule(constructor))) && continue

    fields = collect(zip(fieldnames(constructor), fieldtypes(constructor)))
    user_fields = filter(fields) do (field_name, field_type)
      !_is_symbolic_metadata_field(field_name, field_type)
    end
    all(field -> _symbolic_constructor_field_allowed(last(field)), user_fields) || continue
    arity = length(user_fields)
    arity <= SOURCE_CALL_MAX_OPERANDS || continue
    matching_methods = filter(collect(methods(constructor))) do method
      method.isva && return false
      signature = Base.unwrap_unionall(method.sig)
      signature isa DataType || return false
      length(signature.parameters) == arity + 1 || return false
      isempty(Base.kwarg_decl(method)) || return false
      return all(_symbolic_constructor_field_allowed, signature.parameters[2:end])
    end
    length(matching_methods) == 1 || continue
    push!(constructors, (
      name=name,
      value=constructor,
      minimum_arity=arity,
      maximum_arity=arity,
      result_type=string(constructor),
    ))
  end
  sort!(constructors; by=definition -> string(definition.name))
  return Tuple(constructors)
end

const SYMBOLIC_ATOM_DEFINITIONS = _symbolic_atom_definitions()
const SYMBOLIC_CONSTRUCTOR_DEFINITIONS = _symbolic_constructor_definitions()
const _SYMBOLIC_ATOM_BY_NAME = Dict(
  definition.name => definition for definition in SYMBOLIC_ATOM_DEFINITIONS
)
const _SYMBOLIC_CONSTRUCTOR_BY_NAME = Dict(
  definition.name => definition for definition in SYMBOLIC_CONSTRUCTOR_DEFINITIONS
)

const SYMBOLIC_OPERATION_DEFINITIONS = (
  (name=:√, value=sqrt, minimum_arity=1, maximum_arity=1, category="numeric"),
  (name=:conj, value=conj, minimum_arity=1, maximum_arity=1, category="symbolic"),
  (name=:transpose, value=transpose, minimum_arity=1, maximum_arity=1, category="symbolic"),
  (name=:adjoint, value=adjoint, minimum_arity=1, maximum_arity=1, category="symbolic"),
  (name=:projector, value=QuantumSavory.projector, minimum_arity=1, maximum_arity=1, category="symbolic"),
  (name=:⊗, value=getfield(QuantumSavory, :⊗), minimum_arity=2, maximum_arity=2, category="symbolic"),
)

const _SYMBOLIC_OPERATION_BY_NAME = Dict(
  definition.name => definition for definition in SYMBOLIC_OPERATION_DEFINITIONS
)

"""The exact parsed source subtree plus validation facts; this is not an IR."""
struct ValidatedExpression
  source::String
  parsed::Expr
  expression::Any
  profile::Symbol
  root_form::Symbol
  function_name::Union{Nothing,Symbol}
  arguments::Vector{Symbol}
  referenced_contexts::Vector{Symbol}
  referenced_capabilities::Vector{Symbol}
  node_count::Int
  max_depth::Int
end

mutable struct _SourceValidationState
  profile::Symbol
  placement::String
  arguments::Set{Symbol}
  function_name::Union{Nothing,Symbol}
  referenced_contexts::Set{Symbol}
  referenced_capabilities::Set{Symbol}
  node_count::Int
  max_depth::Int
  node_limit::Int
end

function _source_validation_error(message::AbstractString; details=Dict{String,Any}())
  throw(validation_error(String(message), Dict{String,Any}(details)))
end

function _complete_source_parse_error(parsed)
  parsed isa Expr || return nothing
  if parsed.head in (:error, :incomplete)
    exception = findfirst(argument -> argument isa Exception, parsed.args)
    exception === nothing || return parsed.args[exception]
    return ErrorException(isempty(parsed.args) ? "Julia parsing failed" : string(first(parsed.args)))
  end
  for argument in parsed.args
    exception = _complete_source_parse_error(argument)
    exception === nothing || return exception
  end
  return nothing
end

function _single_non_line_expression(expression, context::AbstractString)
  expression isa Expr && expression.head in (:toplevel, :block) || return expression
  expressions = filter(argument -> !(argument isa LineNumberNode), expression.args)
  length(expressions) == 1 || _source_validation_error(
    "$context must contain exactly one expression";
    details=Dict("expression_count" => length(expressions)),
  )
  return only(expressions)
end

function _semantic_root(expression)
  current = expression
  while current isa Expr && current.head in (:toplevel, :block)
    next = _single_non_line_expression(current, "Julia source")
    next === current && break
    current = next
  end
  return current
end

function _parse_validated_source(source::AbstractString)
  normalized = String(source)
  ncodeunits(normalized) <= SOURCE_MAX_BYTES || _source_validation_error(
    "Julia source exceeds the 4,096-byte limit";
    details=Dict("limit" => SOURCE_MAX_BYTES, "received" => ncodeunits(normalized)),
  )
  isempty(strip(normalized)) && _source_validation_error("Julia source must not be blank")

  parsed = try
    Meta.parseall(normalized)
  catch error
    _source_validation_error(
      "Julia source is not valid syntax";
      details=Dict("parse_error" => sprint(showerror, error)),
    )
  end
  parsed isa Expr || _source_validation_error("Julia source did not produce a parsed expression")
  parse_error = _complete_source_parse_error(parsed)
  parse_error === nothing || _source_validation_error(
    "Julia source is not valid syntax";
    details=Dict("parse_error" => sprint(showerror, parse_error)),
  )
  parsed.head === :toplevel || _source_validation_error("Julia source has an unsupported parser root")
  expression = _single_non_line_expression(parsed, "Julia source")
  return normalized, parsed, expression
end

function _touch!(state::_SourceValidationState, expression, depth::Int)
  expression isa LineNumberNode && return
  state.node_count += 1
  state.max_depth = max(state.max_depth, depth)
  state.node_count <= state.node_limit || _source_validation_error(
    "Julia source exceeds the AST node limit";
    details=Dict("limit" => state.node_limit),
  )
  depth <= SOURCE_AST_MAX_DEPTH || _source_validation_error(
    "Julia source exceeds the AST depth limit";
    details=Dict("limit" => SOURCE_AST_MAX_DEPTH),
  )
end

function _validate_identifier(name::Symbol, context::AbstractString)
  text = string(name)
  ncodeunits(text) <= SOURCE_IDENTIFIER_MAX_BYTES || _source_validation_error(
    "$context exceeds the 64-byte identifier limit";
    details=Dict("identifier" => text, "limit" => SOURCE_IDENTIFIER_MAX_BYTES),
  )
  Base.isidentifier(text) || _source_validation_error(
    "$context must be a plain Julia identifier";
    details=Dict("identifier" => text),
  )
  startswith(text, "#") && _source_validation_error("$context is reserved")
  endswith(text, "!") && _source_validation_error("$context must not be a mutating name")
  return name
end

function _all_capability_names()
  return union(
    Set(keys(_ORDINARY_OPERATION_BY_NAME)),
    Set(keys(_SYMBOLIC_OPERATION_BY_NAME)),
    Set(keys(_SOURCE_CONSTANT_BY_NAME)),
    Set(keys(_SOURCE_CONTEXT_BY_NAME)),
    Set(keys(_SYMBOLIC_ATOM_BY_NAME)),
    Set(keys(_SYMBOLIC_CONSTRUCTOR_BY_NAME)),
    _FORBIDDEN_SOURCE_NAMES,
  )
end

function _validate_function_arguments(raw_arguments, profile::Symbol)
  arguments = if raw_arguments isa Symbol
    Symbol[raw_arguments]
  elseif raw_arguments isa Expr && raw_arguments.head === :tuple
    Symbol[argument for argument in raw_arguments.args if argument isa Symbol]
  else
    Symbol[]
  end
  expected_count = raw_arguments isa Expr && raw_arguments.head === :tuple ?
    length(raw_arguments.args) : raw_arguments isa Symbol ? 1 : -1
  expected_count == length(arguments) || _source_validation_error(
    "Function arguments must be plain, untyped positional symbols",
  )
  length(arguments) <= SOURCE_FUNCTION_MAX_ARGUMENTS || _source_validation_error(
    "Custom Functions accept at most eight arguments";
    details=Dict("limit" => SOURCE_FUNCTION_MAX_ARGUMENTS),
  )
  profile === :query_predicate && length(arguments) != 1 && _source_validation_error(
    "Tag-query predicates must accept exactly one argument",
  )
  length(unique(arguments)) == length(arguments) || _source_validation_error(
    "Function arguments must be unique",
  )
  reserved = _all_capability_names()
  for argument in arguments
    _validate_identifier(argument, "Function argument")
    argument in reserved && _source_validation_error(
      "Function argument '$(argument)' collides with a restricted-language capability",
    )
  end
  return arguments
end

function _operation_definition(state::_SourceValidationState, name::Symbol)
  if state.profile === :symbolic_expression && haskey(_SYMBOLIC_OPERATION_BY_NAME, name)
    return _SYMBOLIC_OPERATION_BY_NAME[name]
  end
  return get(_ORDINARY_OPERATION_BY_NAME, name, nothing)
end

function _record_context!(state::_SourceValidationState, name::Symbol)
  descriptor = _SOURCE_CONTEXT_BY_NAME[name]
  state.placement in descriptor.placements || _source_validation_error(
    "Context identifier '$name' is not available for $(state.placement) source";
    details=Dict("identifier" => string(name), "placement" => state.placement),
  )
  push!(state.referenced_contexts, name)
end

function _record_capability!(state::_SourceValidationState, name::Symbol)
  push!(state.referenced_capabilities, name)
end

function _validate_symbol!(state::_SourceValidationState, name::Symbol)
  ncodeunits(string(name)) <= SOURCE_IDENTIFIER_MAX_BYTES || _source_validation_error(
    "Identifier exceeds the 64-byte limit";
    details=Dict("identifier" => string(name)),
  )
  name in state.arguments && return
  state.function_name === name && _source_validation_error(
    "A short-form function cannot reference or call itself",
  )
  if haskey(_SOURCE_CONTEXT_BY_NAME, name)
    _SOURCE_CONTEXT_BY_NAME[name].category === :resolver && _source_validation_error(
      "Context resolver '$name' may only be used as a direct call",
    )
    _record_context!(state, name)
    return
  end
  if haskey(_SOURCE_CONSTANT_BY_NAME, name)
    _record_capability!(state, name)
    return
  end
  if state.profile === :symbolic_expression && haskey(_SYMBOLIC_ATOM_BY_NAME, name)
    _record_capability!(state, name)
    return
  end
  name in _FORBIDDEN_SOURCE_NAMES && _source_validation_error(
    "Identifier '$name' is forbidden in restricted Julia source",
  )
  if haskey(_ORDINARY_OPERATION_BY_NAME, name) ||
     haskey(_SYMBOLIC_OPERATION_BY_NAME, name) ||
     haskey(_SYMBOLIC_CONSTRUCTOR_BY_NAME, name)
    _source_validation_error("Capability '$name' may only be used as a direct call")
  end
  _source_validation_error(
    "Identifier '$name' is not available in restricted Julia source";
    details=Dict("identifier" => string(name)),
  )
end

function _validate_literal!(state::_SourceValidationState, value)
  if value isa Bool || value isa Int64 || value isa Float64
    return
  elseif value isa String
    ncodeunits(value) <= SOURCE_STRING_MAX_BYTES || _source_validation_error(
      "String literal exceeds the 1,024-byte limit";
      details=Dict("limit" => SOURCE_STRING_MAX_BYTES),
    )
    return
  elseif value isa QuoteNode && value.value isa Symbol
    state.profile === :query_predicate || _source_validation_error(
      "Symbol literals are available only in tag-query predicates",
    )
    ncodeunits(string(value.value)) <= SOURCE_STRING_MAX_BYTES || _source_validation_error(
      "Symbol literal exceeds the 1,024-byte limit";
      details=Dict("limit" => SOURCE_STRING_MAX_BYTES),
    )
    return
  end
  _source_validation_error(
    "Literal type $(typeof(value)) is not allowed in restricted Julia source",
  )
end

function _validate_call!(
  state::_SourceValidationState,
  expression::Expr,
  depth::Int,
)
  isempty(expression.args) && _source_validation_error("A call must have a callee")
  callee = first(expression.args)
  callee isa Symbol || _source_validation_error(
    "Calls require a plain allowlisted function name",
  )
  ncodeunits(string(callee)) <= SOURCE_IDENTIFIER_MAX_BYTES || _source_validation_error(
    "Call name exceeds the 64-byte identifier limit",
  )
  callee in state.arguments && _source_validation_error("Function arguments cannot be called")
  state.function_name === callee && _source_validation_error(
    "A short-form function cannot reference or call itself",
  )

  operands = expression.args[2:end]
  length(operands) <= SOURCE_CALL_MAX_OPERANDS || _source_validation_error(
    "Calls accept at most eight operands";
    details=Dict("limit" => SOURCE_CALL_MAX_OPERANDS),
  )
  if callee in COMPARISON_CURRY_OPERATORS && length(operands) == 1
    _source_validation_error("Comparison currying is allowed only at the function root")
  end
  if callee === :nodeid
    haskey(_SOURCE_CONTEXT_BY_NAME, :nodeid) || error("Missing nodeid context descriptor")
    state.placement in _SOURCE_CONTEXT_BY_NAME[:nodeid].placements || _source_validation_error(
      "nodeid is not available for $(state.placement) source",
    )
    length(operands) == 1 && only(operands) isa String || _source_validation_error(
      "nodeid requires exactly one string literal",
    )
    _record_context!(state, :nodeid)
    _validate_ordinary!(state, only(operands), depth + 1)
    return
  end

  definition = _operation_definition(state, callee)
  if definition === nothing && state.profile === :symbolic_expression
    definition = get(_SYMBOLIC_CONSTRUCTOR_BY_NAME, callee, nothing)
  end
  definition === nothing && _source_validation_error(
    "Call to '$callee' is not allowlisted for $(state.profile) source";
    details=Dict("callee" => string(callee)),
  )
  definition.minimum_arity <= length(operands) <= definition.maximum_arity ||
    _source_validation_error(
      "Call to '$callee' has an invalid number of operands";
      details=Dict(
        "minimum" => definition.minimum_arity,
        "maximum" => definition.maximum_arity,
        "received" => length(operands),
      ),
    )
  _record_capability!(state, callee)
  for operand in operands
    _validate_ordinary!(state, operand, depth + 1)
  end
end

function _validate_comparison!(state::_SourceValidationState, expression::Expr, depth::Int)
  length(expression.args) >= 3 && isodd(length(expression.args)) ||
    _source_validation_error("A chained comparison has an invalid shape")
  operand_count = (length(expression.args) + 1) ÷ 2
  operand_count <= SOURCE_CALL_MAX_OPERANDS || _source_validation_error(
    "A chained comparison accepts at most eight operands",
  )
  for (index, argument) in enumerate(expression.args)
    if iseven(index)
      argument isa Symbol && argument in COMPARISON_CURRY_OPERATORS ||
        _source_validation_error("Chained comparisons use only allowlisted comparison operators")
      _record_capability!(state, argument)
    else
      _validate_ordinary!(state, argument, depth + 1)
    end
  end
end

function _validate_ordinary!(state::_SourceValidationState, expression, depth::Int=1)
  expression isa LineNumberNode && return
  _touch!(state, expression, depth)
  if expression isa Symbol
    _validate_symbol!(state, expression)
    return
  elseif !(expression isa Expr)
    _validate_literal!(state, expression)
    return
  end

  head = expression.head
  if head in (:toplevel, :block)
    child = _single_non_line_expression(expression, "Expression block")
    _validate_ordinary!(state, child, depth + 1)
  elseif head === :call
    _validate_call!(state, expression, depth)
  elseif head === :comparison
    _validate_comparison!(state, expression, depth)
  elseif head in (:&&, :||)
    length(expression.args) == 2 || _source_validation_error("Boolean syntax has an invalid shape")
    _record_capability!(state, head)
    foreach(argument -> _validate_ordinary!(state, argument, depth + 1), expression.args)
  elseif head === :if
    length(expression.args) == 3 || _source_validation_error("Ternary syntax has an invalid shape")
    any(argument -> argument isa Expr && argument.head in (:block, :toplevel), expression.args) &&
      _source_validation_error("Only ternary conditionals are allowed; statement-form if is forbidden")
    _record_capability!(state, :ternary)
    foreach(argument -> _validate_ordinary!(state, argument, depth + 1), expression.args)
  elseif head in (:tuple, :vect)
    length(expression.args) <= SOURCE_LITERAL_MAX_ELEMENTS || _source_validation_error(
      "Tuple and vector literals accept at most 256 elements";
      details=Dict("limit" => SOURCE_LITERAL_MAX_ELEMENTS),
    )
    foreach(argument -> _validate_ordinary!(state, argument, depth + 1), expression.args)
  elseif head in (:->, :(=), :function)
    _source_validation_error("Nested functions and assignments are forbidden")
  else
    _source_validation_error(
      "Julia syntax '$head' is not allowed by the restricted expression language";
      details=Dict("syntax" => string(head)),
    )
  end
end

function _touch_root_wrappers!(state::_SourceValidationState, expression, semantic)
  current = expression
  depth = 1
  while current !== semantic
    _touch!(state, current, depth)
    current = _single_non_line_expression(current, "Expression block")
    depth += 1
  end
  return depth
end

function _validate_function_root!(
  state::_SourceValidationState,
  expression,
)
  root = _semantic_root(expression)
  root_depth = _touch_root_wrappers!(state, expression, root)
  _touch!(state, root, root_depth)

  if root isa Expr && root.head === :->
    length(root.args) == 2 || _source_validation_error("Anonymous lambdas require one body expression")
    arguments = _validate_function_arguments(root.args[1], state.profile)
    state.arguments = Set(arguments)
    body = _single_non_line_expression(root.args[2], "Anonymous lambda body")
    _validate_ordinary!(state, body, root_depth + 1)
    return :anonymous_lambda, nothing, arguments
  elseif root isa Expr && root.head === :(=)
    length(root.args) == 2 || _source_validation_error("Short-form definitions have an invalid shape")
    signature = root.args[1]
    signature isa Expr && signature.head === :call && !isempty(signature.args) ||
      _source_validation_error("Only short-form `f(args...) = expression` definitions are allowed")
    function_name = first(signature.args)
    function_name isa Symbol || _source_validation_error("Function names must be plain identifiers")
    _validate_identifier(function_name, "Function name")
    function_name in _all_capability_names() && _source_validation_error(
      "Function name '$function_name' collides with a restricted-language capability",
    )
    arguments = _validate_function_arguments(Expr(:tuple, signature.args[2:end]...), state.profile)
    function_name in arguments && _source_validation_error("Function name and arguments must be unique")
    state.function_name = function_name
    state.arguments = Set(arguments)
    body = _single_non_line_expression(root.args[2], "Short-form function body")
    _validate_ordinary!(state, body, root_depth + 1)
    return :short_form_definition, function_name, arguments
  elseif root isa Expr && root.head === :call && !isempty(root.args) &&
         first(root.args) isa Symbol && first(root.args) in COMPARISON_CURRY_OPERATORS
    length(root.args) == 2 || _source_validation_error(
      "Comparison currying requires exactly one operand",
    )
    operator = first(root.args)
    _record_capability!(state, operator)
    _validate_ordinary!(state, root.args[2], root_depth + 1)
    return :comparison_curry, nothing, Symbol[:candidate]
  end
  _source_validation_error(
    "Function source must be an anonymous lambda, short-form definition, or root comparison curry",
  )
end

"""Parse and validate one exact source expression without evaluating it."""
function validate_source_expression(
  source::AbstractString;
  profile::Symbol,
  placement::AbstractString=profile === :query_predicate ? "query" :
    profile === :symbolic_expression ? "symbolic" : "floating",
)
  profile in SOURCE_PROFILES || throw(ArgumentError("Unknown source-validation profile: $profile"))
  placement = String(placement)
  placement in SOURCE_PLACEMENTS || throw(ArgumentError("Unknown source placement: $placement"))
  profile === :query_predicate && placement != "query" && throw(ArgumentError(
    "Tag-query source must use query placement",
  ))
  profile === :symbolic_expression && placement != "symbolic" && throw(ArgumentError(
    "Symbolic source must use symbolic placement",
  ))

  normalized, parsed, expression = _parse_validated_source(source)
  state = _SourceValidationState(
    profile,
    placement,
    Set{Symbol}(),
    nothing,
    Set{Symbol}(),
    Set{Symbol}(),
    0,
    0,
    profile === :symbolic_expression ? SYMBOLIC_AST_MAX_NODES : SOURCE_AST_MAX_NODES,
  )

  root_form = :expression
  function_name = nothing
  arguments = Symbol[]
  if profile in (:custom_function, :query_predicate)
    root_form, function_name, arguments = _validate_function_root!(state, expression)
  else
    _validate_ordinary!(state, expression)
  end

  context_order = Dict(
    descriptor.binding => index for (index, descriptor) in enumerate(SOURCE_CONTEXT_DESCRIPTORS)
  )
  required_context = sort!(collect(state.referenced_contexts); by=name -> context_order[name])
  capabilities = sort!(collect(state.referenced_capabilities); by=string)
  return ValidatedExpression(
    normalized,
    parsed,
    expression,
    profile,
    root_form,
    function_name,
    arguments,
    required_context,
    capabilities,
    state.node_count,
    state.max_depth,
  )
end

function _parse_complete_source(source::AbstractString)
  _, _, expression = _parse_validated_source(source)
  return expression
end

function _source_capability_value(validated::ValidatedExpression, name::Symbol)
  haskey(_SOURCE_CONSTANT_BY_NAME, name) && return _SOURCE_CONSTANT_BY_NAME[name].value
  if validated.profile === :symbolic_expression
    haskey(_SYMBOLIC_ATOM_BY_NAME, name) && return _SYMBOLIC_ATOM_BY_NAME[name].value
    haskey(_SYMBOLIC_CONSTRUCTOR_BY_NAME, name) && return _SYMBOLIC_CONSTRUCTOR_BY_NAME[name].value
    haskey(_SYMBOLIC_OPERATION_BY_NAME, name) && return _SYMBOLIC_OPERATION_BY_NAME[name].value
  end
  haskey(_ORDINARY_OPERATION_BY_NAME, name) && return _ORDINARY_OPERATION_BY_NAME[name].value
  name in (:&&, :||, :ternary) && return nothing
  error("Validated source references an unknown capability: $name")
end

function _source_context_wire(descriptor::SourceContextDescriptor)
  return Dict{String,Any}(
    "name" => string(descriptor.binding),
    "syntax" => descriptor.binding === :nodeid ?
      "nodeid(\"Node name\")" : string(descriptor.binding),
    "placements" => collect(descriptor.placements),
    "unit" => descriptor.unit,
    "description" => descriptor.description,
    "nullable_on_virtual_edge" => descriptor.category === :edge_physical,
  )
end

function _operation_wire(definition)
  name = string(definition.name)
  operator_names = Set((
    "+", "-", "*", "/", "^", "==", "!=", "<", "<=", ">", ">=",
    "≠", "≤", "≥", "!", "⊗",
  ))
  syntax = if name in operator_names
    name
  elseif definition.minimum_arity == definition.maximum_arity == 1
    "$name(value)"
  elseif definition.minimum_arity == definition.maximum_arity
    "$name(" * join(("value$index" for index in 1:definition.minimum_arity), ", ") * ")"
  else
    "$name(value1, value2, …)"
  end
  return Dict{String,Any}(
    "name" => name,
    "syntax" => syntax,
    "minimum_arity" => definition.minimum_arity,
    "maximum_arity" => definition.maximum_arity,
    "category" => definition.category,
  )
end

"""JSON-safe help metadata generated entirely from the validator catalogs."""
function source_language_catalog()
  return Dict{String,Any}(
    "schema_version" => 1,
    "unsafe_evaluation" => unsafe_code_evaluation_enabled(),
    "function_forms" => [
      Dict("id" => "anonymous_lambda", "example" => "x -> x + 1", "description" => "Zero through eight plain positional arguments; query predicates require exactly one."),
      Dict("id" => "short_form_definition", "example" => "f(x) = x + 1", "description" => "One local, nonrecursive short-form method with a single expression body."),
      Dict("id" => "comparison_curry", "example" => "==(2)", "description" => "Root-only one-operand comparison currying using Julia Fix2 direction."),
    ],
    "comparison_currying" => Dict{String,Any}(
      "operators" => string.(COMPARISON_CURRY_OPERATORS),
      "direction" => "operator(value) means candidate -> operator(candidate, value); for example, >(distance) tests candidate > distance.",
      "root_only" => true,
      "examples" => ["==(2)", "<=(self)"],
    ),
    "operations" => Dict{String,Any}(
      "ordinary" => _operation_wire.(ORDINARY_OPERATION_DEFINITIONS),
      "boolean_syntax" => ["&&", "||", "?:"],
      "symbolic" => _operation_wire.(SYMBOLIC_OPERATION_DEFINITIONS),
    ),
    "constants" => [
      Dict("name" => string(definition.name), "description" => definition.description)
      for definition in SOURCE_CONSTANT_DEFINITIONS
    ],
    "contexts" => Dict(
      placement => [
        _source_context_wire(descriptor) for descriptor in SOURCE_CONTEXT_DESCRIPTORS
        if placement in descriptor.placements
      ] for placement in ("node", "edge", "floating", "variable", "query", "symbolic")
    ),
    "non_finite_float64" => Dict{String,Any}(
      "constants" => ["Inf", "NaN"],
      "functions" => ["isfinite", "isinf", "isnan"],
      "description" => "Unconstrained Float64 expressions and Custom Functions may contain Inf and NaN. Int64 conversion and existing finite or bounded fields reject them. NaN follows IEEE comparison behavior, including NaN != NaN.",
    ),
    "limits" => Dict{String,Any}(
      "source_bytes" => SOURCE_MAX_BYTES,
      "identifier_bytes" => SOURCE_IDENTIFIER_MAX_BYTES,
      "string_bytes" => SOURCE_STRING_MAX_BYTES,
      "ast_nodes" => SOURCE_AST_MAX_NODES,
      "symbolic_ast_nodes" => SYMBOLIC_AST_MAX_NODES,
      "ast_depth" => SOURCE_AST_MAX_DEPTH,
      "function_arguments" => SOURCE_FUNCTION_MAX_ARGUMENTS,
      "call_operands" => SOURCE_CALL_MAX_OPERANDS,
      "literal_elements" => SOURCE_LITERAL_MAX_ELEMENTS,
      "runtime_collection_depth" => SOURCE_RUNTIME_MAX_DEPTH,
      "runtime_collection_elements" => SOURCE_RUNTIME_MAX_ELEMENTS,
      "symbolic_latex_bytes" => SYMBOLIC_LATEX_MAX_BYTES,
    ),
    "result_contracts" => Dict{String,Any}(
      "custom_function" => "Inputs and results must stay within the admitted primitive, string, tuple, and ordinary-vector domain.",
      "query_predicate" => "Exactly one admitted tag value is accepted and the result must be exactly Bool.",
      "numeric_expression" => "The result must cast exactly to the authoritative Float64 or Int64 target and satisfy existing field metadata.",
      "symbolic_expression" => "The final result must be an authoritative QuantumSavory SymQObj.",
    ),
    "forbidden_syntax" => [
      "assignments outside one approved short-form function root",
      "multiple expressions, long-form functions, nested functions, recursion, defaults, keywords, annotations, varargs, destructuring, and where clauses",
      "loops, comprehensions, generators, ranges, macros, interpolation, commands, properties, qualification, indexing, broadcasting, splats, and computed calls",
      "imports, mutation, tasks, I/O, processes, networking, eval, include, ccall, and namespace reflection",
    ],
    "symbolic" => Dict{String,Any}(
      "atoms" => [Dict("name" => string(definition.name), "type" => definition.type) for definition in SYMBOLIC_ATOM_DEFINITIONS],
      "constructors" => [
        Dict("name" => string(definition.name), "arity" => definition.minimum_arity, "result_type" => definition.result_type)
        for definition in SYMBOLIC_CONSTRUCTOR_DEFINITIONS
      ],
      "states_zoo" => "States Zoo recipes use their separate structured, non-eval path.",
    ),
    "virtual_edge_note" => "Physical edge context values may be nothing on virtual edges.",
    "advanced_guidance" => "For Julia beyond this restricted language, export the project script, review it, and edit and run it locally.",
    "security_note" => "The whitelist reduces risk but is not a security boundary: accepted expressions still execute native Julia and cannot be safely interrupted in-process.",
  )
end
