"""Find a parser exception embedded in Julia's `:error`/`:incomplete` AST."""
function _function_source_parse_error(parsed)
    parsed isa Expr || return nothing
    if parsed.head in (:error, :incomplete)
        exception = findfirst(argument -> argument isa Exception, parsed.args)
        exception === nothing || return parsed.args[exception]
    end

    for argument in parsed.args
        exception = _function_source_parse_error(argument)
        exception === nothing || return exception
    end
    return nothing
end

"""Parse all expressions in a custom-function source as one scoped block."""
function _parse_function_source(source::AbstractString)
    parsed = Meta.parseall(String(source))
    parse_error = _function_source_parse_error(parsed)
    parse_error === nothing || throw(parse_error)

    if !(parsed isa Expr && parsed.head === :toplevel)
        return parsed
    end

    # `Meta.parseall` can nest `:toplevel` expressions when the source itself
    # contains multiple statements. Flatten only that outer parser structure;
    # any quoted or function-body expressions remain untouched.
    scoped_statements = Any[]
    function append_toplevel!(expression)
        if expression isa Expr && expression.head === :toplevel
            foreach(append_toplevel!, expression.args)
        else
            push!(scoped_statements, expression)
        end
    end
    append_toplevel!(parsed)
    return Expr(:block, scoped_statements...)
end

"""
Evaluate custom-function source and require the resulting value to satisfy the
`Function` contract used by QuantumSavory protocol parameters.

`transform` can wrap the parsed block in assignment-specific lexical context
before evaluation.
"""
function _evaluate_function_source(
    source::AbstractString;
    evaluation_module::Module=Module(),
    transform::Function=identity,
)
    parsed = _parse_function_source(source)
    value = Base.eval(evaluation_module, transform(parsed))

    if !(value isa Function)
        throw(ArgumentError(
            "Custom function source must evaluate to a Julia Function; " *
            "got $(typeof(value)). Try an expression such as `x -> x + 1`, " *
            "`<(1)`, or `f(x) = x + 1`.",
        ))
    end

    return value
end

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

"""
Lambda type - a subtype of Function for representing anonymous functions coming from the UI
"""
abstract type Lambda <: Function end

"""
Concrete implementation of Lambda that wraps a Julia function
"""
struct LambdaImpl <: Lambda
    func::Function
end

# Make LambdaImpl callable
function (f::LambdaImpl)(args...)
  try
    # The wrapped function is created with `Base.eval`, so invoke it in the
    # latest world. This matters when a freshly converted protocol parameter is
    # called before the surrounding task yields back to top-level evaluation.
    result = Base.invokelatest(f.func, args...)
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

"""Protocol-conversion context key containing the shared node-name lookup."""
const NODE_NAME_TO_INDEX_CONTEXT_KEY = :node_name_to_index

"""Build the shared one-based node-name lookup from validated node order."""
function _node_name_to_index(nodes)::Dict{String,Int}
    return Dict{String,Int}(
        string(node["name"]) => index for (index, node) in enumerate(nodes)
    )
end

"""Create the strictly typed `nodeid` lookup captured by a custom function."""
function _nodeid_resolver(node_name_to_index::Dict{String,Int})
    function nodeid(name::String)::Int
        return node_name_to_index[name]
    end

    return nodeid
end

"""Wrap parsed function code around the supplied lexical context bindings."""
function _function_context_expression(
    parsed,
    nodeid::Function,
    self_node_index::Union{Nothing,Int},
)
    if self_node_index === nothing
        return :(let nodeid = $(QuoteNode(nodeid))
            $parsed
        end)
    end

    return :(let nodeid = $(QuoteNode(nodeid)), self = $self_node_index
        $parsed
    end)
end

"""Wrap parsed function code in its supported lexical runtime context."""
function _contextual_function_expression(
    parsed,
    node_name_to_index::Dict{String,Int},
    self_node_index::Union{Nothing,Int},
)
    return _function_context_expression(
        parsed,
        _nodeid_resolver(node_name_to_index),
        self_node_index,
    )
end

"""
Create a Lambda from a string representation in a temporary module.

This evaluates code in the server process; the temporary module is not a
security boundary. `nodeid` is always bound lexically from the supplied map;
`self` is bound only when `self_node_index` identifies a node protocol.
"""
function create_lambda(
    lambda_string::String;
    node_name_to_index::Dict{String,Int}=Dict{String,Int}(),
    self_node_index::Union{Nothing,Int}=nothing,
)
    require_unsafe_code_evaluation()

    try
        value = _evaluate_function_source(
            lambda_string;
            transform=parsed -> _contextual_function_expression(
                parsed,
                node_name_to_index,
                self_node_index,
            ),
        )
        return LambdaImpl(value)
    catch e
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
