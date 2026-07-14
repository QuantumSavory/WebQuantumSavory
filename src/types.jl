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

"""Wrap parsed function code in its supported lexical runtime context."""
function _contextual_function_expression(
    parsed,
    node_name_to_index::Dict{String,Int},
    self_node_index::Union{Nothing,Int},
)
    nodeid = _nodeid_resolver(node_name_to_index)

    if self_node_index === nothing
        return :(let nodeid = $(QuoteNode(nodeid))
            $parsed
        end)
    end

    return :(let nodeid = $(QuoteNode(nodeid)), self = $self_node_index
        $parsed
    end)
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

    # Create a temporary namespace for evaluation
    temp_module = Module()

    try
        parsed = Meta.parse(lambda_string)
        # `:toplevel` expressions bypass surrounding lexical scope during
        # evaluation. Preserve multi-statement sources as a scoped block so
        # every statement captures the contextual bindings below.
        if parsed isa Expr && parsed.head === :toplevel
            parsed = Expr(:block, parsed.args...)
        end
        contextual_expression = _contextual_function_expression(
            parsed,
            node_name_to_index,
            self_node_index,
        )
        value = Base.eval(temp_module, contextual_expression)

        # If expression evaluated directly to a function, use it
        if value isa Function
            return LambdaImpl(value)
        end

        error("String does not evaluate to a function: '$lambda_string'")
    catch e
        error("Failed to create lambda from string '$lambda_string': $e")
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
