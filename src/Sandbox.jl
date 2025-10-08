module Sandbox

using Latexify
using Base
using QuantumSavory
using QuantumSavory.ProtocolZoo
using ResumableFunctions
using ConcurrentSim

import Base: Meta

"""
Test Julia code in an isolated sandboxed environment.

Returns a tuple of (success::Bool, results::Dict, error::Union{Nothing, Exception})
"""
function test_code(code_string::String)
    # Create isolated module
    sandbox = Module()

    try
        # Parse and validate syntax first
        parsed = Meta.parse(code_string)

        # Get names that exist before evaluation (default functions)
        default_names_raw = names(sandbox, all=true)
        default_names = Set{Symbol}(default_names_raw)

        # Evaluate in sandbox
        Base.eval(sandbox, parsed)

        # Get names that exist after evaluation
        all_names_raw = names(sandbox, all=true)
        all_names = Set{Symbol}(all_names_raw)

        # Find newly created names by filtering
        created_names = Symbol[]
        for name in all_names_raw
            if !(name in default_names_raw)
                push!(created_names, name)
            end
        end

        # Separate functions from other values
        functions = String[]
        variables = Dict{String, Any}()

        for name in created_names
            name_str = string(name)
            # Skip internal Julia names
            if !startswith(name_str, "#") && !startswith(name_str, "@")
                value = getfield(sandbox, name)
                if value isa Function
                    push!(functions, name_str)
                else
                    variables[name_str] = value
                end
            end
        end

        results = Dict(
            :functions => functions,
            :variables => variables
        )

        return (true, results, nothing)

    catch e
        return (false, nothing, e)
    end
end


"""
Evaluate a symbolic expression in an isolated temporary module preloaded with
QuantumSavory-related namespaces. Returns a tuple of
(success::Bool, value::Any, error::Union{Nothing,Exception}).
If successful, `value` is the actual evaluated symbolic object.
"""
function evaluate_symbolic_expression(expr::String)
    # Create isolated module and load required namespaces
    tempmod = Module()

    try
        # Load the required packages into the temp module's scope
        Base.eval(tempmod, :(using QuantumSavory))
        Base.eval(tempmod, :(using QuantumSavory.ProtocolZoo))
        Base.eval(tempmod, :(using ResumableFunctions))
        Base.eval(tempmod, :(using ConcurrentSim))
        Base.eval(tempmod, :(using Latexify))

        # Parse incoming expression
        parsed = Meta.parse(expr)

        # Evaluate within the temporary module to resolve symbols like Z₁, Z₂, ⊗, √, etc
        value = Base.eval(tempmod, parsed)

        return true, value, nothing
    catch e
        return false, nothing, e
    end
end


"""
Test and validate a symbolic expression, returning both the evaluated value and LaTeX representation.
Uses `evaluate_symbolic_expression` internally for evaluation. Returns a tuple of
(success::Bool, results::Union{Dict,Nothing}, error::Union{Nothing,Exception}).
If successful, `results` is a Dict with keys `:value` (stringified value) and
`:latex` (LaTeX string from `Latexify.latexify`).
"""
function test_symbolic_expression(expr::String)
    success, value, error = evaluate_symbolic_expression(expr)
    if !success
        return false, nothing, error
    end

    # Convert to LaTeX string
    latex_str = String(Latexify.latexify(value))

    results = Dict(
        :value => string(value),
        :latex => latex_str,
    )

    return true, results, nothing
end

end
