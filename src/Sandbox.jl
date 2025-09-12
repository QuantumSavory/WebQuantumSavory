module Sandbox

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

end
