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
(f::LambdaImpl)(args...) = f.func(args...)

"""
Create a Lambda from a string representation using a temporary module for safety
"""
function create_lambda(lambda_string::String)
    # Create a temporary module for safe evaluation
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
    success, results, error = Sandbox.test_symbolic_expression(expression_string)
    
    if !success
        throw(ArgumentError("Failed to validate symbolic expression '$expression_string': $error"))
    end
    
    return SymbolicImpl(
        expression_string,
        results[:value],
        results[:latex]
    )
end

"""
Resolve a function reference by name, supporting dotted module paths like `Base.max`.
Returns the `Function` if found, otherwise `nothing`.
"""
function resolve_function_reference(name::AbstractString)
    s = strip(String(name))

    # Basic guardrails: do not allow parentheses to avoid accidental calls
    if occursin("(", s) || occursin(")", s)
        return nothing
    end

    # Candidate root modules to search when an unqualified name is provided
    candidate_modules = (
        Base,
        Core,
        Main,
        @__MODULE__,
    )

    parts = split(s, ".")

    # Helper to walk a dotted path starting from a module
    function walk_from(mod::Module, syms::Vector{SubString{String}})
        obj = mod
        for p in syms
            sym = Symbol(p)
            if obj isa Module
                if isdefined(obj, sym)
                    obj = getfield(obj, sym)
                else
                    return nothing
                end
            else
                # Only allow getfield on modules in this resolver
                return nothing
            end
        end
        return obj isa Function ? obj : nothing
    end

    if length(parts) == 1
        # Unqualified name: search candidate modules in order
        sym = Symbol(parts[1])
        for mod in candidate_modules
            if isdefined(mod, sym)
                obj = getfield(mod, sym)
                if obj isa Function
                    return obj
                end
            end
        end
        return nothing
    else
        # Qualified path: the first part must be a known root module
        root_name = Symbol(first(parts))
        root_mod = nothing
        for mod in candidate_modules
            if nameof(mod) == root_name
                root_mod = mod
                break
            end
        end
        root_mod === nothing && return nothing
        return walk_from(root_mod, parts[2:end])
    end
end
