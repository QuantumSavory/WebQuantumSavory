using Base 
import Base: Meta

function test_code_eval()
    code_string = "function add(a, b)\nreturn a + b\nend"
    sandbox = Module()
    
    # Parse and validate syntax first
    parsed = Meta.parse(code_string)

    # Get names that exist before evaluation (default functions)
    default_names_raw = names(sandbox, all=true)

    # Evaluate in sandbox
    eval_result = Base.eval(sandbox, parsed)
    @info "Eval result" eval_result=eval_result

    # Get names that exist after evaluation
    all_names = names(sandbox, all=true)
    @info "All names" all_names=all_names

    # Find newly created names by filtering
    created_names = Symbol[]
    for name in all_names
        if !(name in default_names_raw)
            push!(created_names, name)
        end
    end

    # @info "Created names" created_names=created_names

    # Separate functions from other values
    functions = String[]
    variables = Dict{String, Any}()

    for name in created_names
        name_str = string(name)
        # @info "Name" name=name name_str=name_str
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
    @show results

    return (true, results, nothing)
end

test_code_eval()
