"""
A globally-defined, typed simulation variable.

`value` intentionally remains in its JSON-compatible form. Conversion is
performed for each protocol assignment so context-dependent values (for
example, predefined functions involving `self`) are resolved in the context of
the protocol that uses the variable.
"""
struct Variable
    id::String
    name::String
    type::String
    value::Any
end

"""A reference from a protocol parameter to a global [`Variable`](@ref)."""
struct VariableReference
    id::String
end

"""A persisted Julia numeric expression with an authoritative base numeric type."""
struct NumericExpression
    source::String
end

const NUMERIC_EXPRESSION_KIND = "numeric_expression"
const NUMERIC_EXPRESSION_TARGETS = ("Float64", "Int64")
const NUMERIC_EXPRESSION_PLACEMENTS = ("node", "edge", "floating", "variable")

"""Parse the exact persisted numeric-expression tag, if present."""
function _parse_numeric_expression(value; context::String="Value")
    _is_object_like(value) || return nothing
    get(value, "kind", nothing) == NUMERIC_EXPRESSION_KIND || return nothing

    fields = Set(string(key) for key in keys(value))
    expected = Set(("kind", "source"))
    fields == expected || throw(validation_error(
        "$context numeric expression must contain exactly 'kind' and 'source'",
        Dict{String,Any}(
            "expected_fields" => sort!(collect(expected)),
            "received_fields" => sort!(collect(fields)),
        ),
    ))

    source = get(value, "source", nothing)
    source isa AbstractString || throw(validation_error(
        "$context numeric expression field 'source' must be a string",
    ))
    isempty(strip(source)) && throw(validation_error(
        "$context numeric expression field 'source' must not be blank",
    ))
    return NumericExpression(String(source))
end

"""
Lambda type - a subtype of Function for representing anonymous functions coming from the UI
"""
abstract type Lambda <: Function end

"""
Concrete implementation of Lambda that wraps a Julia function
"""
struct LambdaImpl <: Lambda
    func::Function
    profile::Symbol
end

LambdaImpl(func::Function) = LambdaImpl(func, :custom_function)

# Make LambdaImpl callable
function (f::LambdaImpl)(args...)
  try
    require_unsafe_code_evaluation()
    element_count = Ref(0)
    for argument in args
      _validate_source_runtime_value(
        argument;
        query=f.profile === :query_predicate,
        element_count,
      )
    end
    # The wrapped function is created at the central `Core.eval` boundary, so
    # invoke it in the latest world when a protocol calls it immediately.
    result = Base.invokelatest(f.func, args...)
    if f.profile === :query_predicate
      result isa Bool || throw(ArgumentError(
        "Tag-query predicate results must be exactly Bool; got $(typeof(result))",
      ))
    else
      _validate_source_runtime_value(result; element_count=Ref(0))
    end
    # If the lambda returns nothing and we're expecting something, warn
    if result === nothing
      @warn "Lambda function returned nothing" args=args
    end
    return result
  catch e
    @error "Lambda function crashed" args=args error=e
    rethrow(e)
  end
end

function _query_runtime_datatype_allowed(value::DataType)
  isdefined(@__MODULE__, :_tag_catalog_snapshot) || return value in (Int64, Float64)
  catalog = _tag_catalog_snapshot()
  return value in values(catalog.allowed_by_id)
end

"""Reject custom objects before any allowlisted operation can dispatch on them."""
function _validate_source_runtime_value(
  value;
  query::Bool=false,
  depth::Int=0,
  element_count::Base.RefValue{Int}=Ref(0),
)
  depth <= SOURCE_RUNTIME_MAX_DEPTH || throw(ArgumentError(
    "Expression collection depth exceeds $SOURCE_RUNTIME_MAX_DEPTH",
  ))
  if depth > 0
    element_count[] += 1
    element_count[] <= SOURCE_RUNTIME_MAX_ELEMENTS || throw(ArgumentError(
      "Expression collections exceed $SOURCE_RUNTIME_MAX_ELEMENTS recursively checked elements",
    ))
  end

  if value === nothing || value isa Bool || value isa Int64 || value isa Float64
    return value
  elseif value isa String
    ncodeunits(value) <= SOURCE_STRING_MAX_BYTES || throw(ArgumentError(
      "Expression string exceeds $SOURCE_STRING_MAX_BYTES bytes",
    ))
    return value
  elseif query && value isa Symbol
    ncodeunits(string(value)) <= SOURCE_STRING_MAX_BYTES || throw(ArgumentError(
      "Query Symbol exceeds $SOURCE_STRING_MAX_BYTES bytes",
    ))
    return value
  elseif query && value isa DataType
    _query_runtime_datatype_allowed(value) || throw(ArgumentError(
      "Query DataType is not advertised by the tag catalog",
    ))
    return value
  elseif query && (value isa Integer || value isa AbstractFloat) &&
         isprimitivetype(typeof(value))
    return value
  elseif value isa Tuple || value isa Vector
    for item in value
      _validate_source_runtime_value(
        item;
        query,
        depth=depth + 1,
        element_count,
      )
    end
    return value
  end
  throw(ArgumentError(
    "Expression values must be admitted primitives, bounded strings, tuples, or ordinary vectors; got $(typeof(value))",
  ))
end

"""Protocol-conversion context key containing the shared node-name lookup."""
const NODE_NAME_TO_INDEX_CONTEXT_KEY = :node_name_to_index

"""Protocol-conversion context key containing resolved edge assignment values."""
const EDGE_FUNCTION_CONTEXT_KEY = :edge_function_context

"""Return the one authoritative numeric target represented by a Julia type."""
function _numeric_expression_target(raw_type)
    members = try
        Base.uniontypes(raw_type)
    catch
        Any[raw_type]
    end
    targets = unique(filter(
        target -> target in NUMERIC_EXPRESSION_TARGETS,
        string.(members),
    ))
    return length(targets) == 1 ? only(targets) : nothing
end

function _cast_numeric_expression_result(
    value,
    target_type::AbstractString;
    minimum=nothing,
    maximum=nothing,
)
    target = String(target_type)
    target in NUMERIC_EXPRESSION_TARGETS || throw(ArgumentError(
        "Numeric expression target type must be 'Float64' or 'Int64'",
    ))
    value isa Real && !(value isa Bool) || throw(ArgumentError(
        "Numeric expression must evaluate to a real number; got $(typeof(value))",
    ))

    cast_value = target == "Float64" ? Float64(value) : Int64(value)
    if (minimum !== nothing || maximum !== nothing) &&
       cast_value isa AbstractFloat && !isfinite(cast_value)
        throw(ArgumentError(
            "A metadata-bounded numeric expression must evaluate to a finite Float64",
        ))
    end
    if minimum !== nothing && cast_value < minimum
        throw(ArgumentError("Numeric expression result must be at least $minimum"))
    end
    if maximum !== nothing && cast_value > maximum
        throw(ArgumentError("Numeric expression result must be at most $maximum"))
    end
    return cast_value
end

"""Evaluate and cast numeric source in the assignment's fresh lexical context."""
function _evaluate_numeric_expression_source(
    source::AbstractString,
    target_type::AbstractString;
    node_name_to_index::Union{Nothing,Dict{String,Int}}=nothing,
    self_node_index::Union{Nothing,Int}=nothing,
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
    minimum=nothing,
    maximum=nothing,
)
    placement = edge_context !== nothing ? "edge" :
        self_node_index !== nothing ? "node" : "floating"
    context = (
        nodeid=node_name_to_index === nothing ? nothing :
            _nodeid_resolver(node_name_to_index),
        self_node_index,
        edge_context,
    )
    return Sandbox.evaluate_numeric_expression(
        source,
        target_type;
        placement,
        context,
        minimum,
        maximum,
    )
end

"""Serialize a cast numeric result without JSON number precision loss."""
_numeric_expression_result_string(value::Union{Float64,Int64}) = repr(value)

"""
Create a Lambda from a string representation in a temporary module.

This evaluates code in the server process; the temporary module is not a
security boundary. `nodeid` is always bound lexically from the supplied map;
`self` is bound only when `self_node_index` identifies a node protocol. An
`edge_context` adds the resolved physical properties and endpoint IDs for one
edge assignment.
"""
function create_lambda(
    lambda_string::String;
    node_name_to_index::Dict{String,Int}=Dict{String,Int}(),
    self_node_index::Union{Nothing,Int}=nothing,
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
    try
        placement = edge_context !== nothing ? "edge" :
            self_node_index !== nothing ? "node" : "floating"
        value, _ = Sandbox.evaluate_function_expression(
            lambda_string;
            placement,
            nodeid=_nodeid_resolver(node_name_to_index),
            self_node_index,
            edge_context,
        )
        return LambdaImpl(value)
    catch e
        e isa APIError && rethrow(e)
        detail = sprint(showerror, e)
        error("Failed to create lambda from string '$lambda_string': $detail")
    end
end

"""
Symbolic type - represents symbolic mathematical expressions
"""
abstract type Symbolic end

"""
Concrete implementation of Symbolic that wraps a validated symbolic expression
"""
struct SymbolicImpl <: Symbolic
    expression::String
    value::Any
    latex::String
end

"""
Create a Symbolic from a string expression using Sandbox.test_symbolic_expression for validation
"""
function create_symbolic(expression_string::String)
    try
        success, results, error = Sandbox.test_symbolic_expression(expression_string)
        
        if !success
            error_msg = "Failed to validate symbolic expression '$expression_string': $error"
            @warn error_msg
            throw(ArgumentError(error_msg))
        end
        
        return SymbolicImpl(
            expression_string,
            results[:value],
            results[:latex]
        )
    catch e
        @error "Segmentation fault or critical error in symbolic evaluation" expression=expression_string error=e
        rethrow(e)
    end
end

const SAFE_FUNCTION_REFERENCES = (
    "minimum" => minimum,
    "maximum" => maximum,
    "abs" => abs,
    "identity" => identity,
)

const SELF_COMPARISON_OPERATORS = (
    "<(self)" => (<),
    ">(self)" => (>),
    "≤(self)" => (≤),
    "≥(self)" => (≥),
    "==(self)" => (==),
)

"""
Resolve a function from the explicit protocol-builder allowlist.

Returns the corresponding `Function`, or `nothing` when `name` is not an
allowlisted function. Module-qualified and arbitrary Julia function names are
not supported.
"""
function resolve_function_reference(name::AbstractString)
    normalized_name = strip(String(name))
    for (reference_name, function_reference) in SAFE_FUNCTION_REFERENCES
        normalized_name == reference_name && return function_reference
    end
    return nothing
end

"""
Resolve one of the protocol-builder comparison functions that uses `self`.

`self` is the Julia-native (one-based) index of the node on which the
node-attached protocol parameter applies. These functions are unavailable when
`self_node_index` is `nothing`, including for edge and floating protocols.
"""
function resolve_self_comparison_reference(name::AbstractString, self_node_index=nothing)
    self_node_index === nothing && return nothing

    normalized_name = strip(String(name))
    for (reference_name, comparison_operator) in SELF_COMPARISON_OPERATORS
        normalized_name == reference_name && return comparison_operator(self_node_index)
    end
    return nothing
end
