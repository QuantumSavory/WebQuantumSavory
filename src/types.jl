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
    result = f.func(args...)
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

"""
Create a Lambda from a string representation in a temporary module.

This evaluates code in the server process; the temporary module is not a
security boundary.
"""
function create_lambda(lambda_string::String)
    require_unsafe_code_evaluation()

    # Create a temporary namespace for evaluation
    temp_module = Module()

    try
        parsed = Meta.parse(lambda_string)
        value = Base.eval(temp_module, parsed)

        # If expression evaluated directly to a function, use it
        if value isa Function
            return LambdaImpl(value)
        end

        # If the string defined a named function (e.g., `function foo(x) ... end`),
        # try to extract its name and fetch it from the temporary module.
        m = match(r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", lambda_string)
        if m !== nothing
            fname = Symbol(m.captures[1])
            if isdefined(temp_module, fname)
                fval = getfield(temp_module, fname)
                if fval isa Function
                    return LambdaImpl(fval)
                end
            end
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
