module Sandbox

using Latexify
using Base
using QuantumSavory
using QuantumSavory.ProtocolZoo
using ResumableFunctions
using ConcurrentSim
using ..WebQuantumSavory: NUMERIC_EXPRESSION_PLACEMENTS,
                          NUMERIC_EXPRESSION_TARGETS,
                          _ALL_NUMERIC_CONTEXT_BINDINGS,
                          _EdgeFunctionContext,
                          _cast_numeric_expression_result,
                          _evaluate_complete_source,
                          _evaluate_function_source,
                          _free_numeric_context_bindings,
                          _function_context_expression,
                          _node_name_to_index,
                          _nodeid_resolver,
                          _numeric_expression_result_string,
                          _parse_complete_source,
                          _source_context_expression,
                          require_unsafe_code_evaluation

import Base: Meta

function _undefined_function_global(expression, evaluation_module::Module)
    if expression isa GlobalRef
        if expression.mod === evaluation_module &&
           !isdefined(evaluation_module, expression.name)
            return expression.name
        end
    elseif expression isa Expr
        for argument in expression.args
            undefined_name = _undefined_function_global(argument, evaluation_module)
            undefined_name === nothing || return undefined_name
        end
    end

    return nothing
end

"""Reject globals that a query predicate would fail to resolve when invoked."""
function _validate_query_function_globals(
    function_value::Function,
    evaluation_module::Module,
)
    for method in methods(function_value)
        method.module === evaluation_module || continue
        code_info = Base.uncompressed_ast(method)
        for statement in code_info.code
            undefined_name = _undefined_function_global(statement, evaluation_module)
            undefined_name === nothing || throw(UndefVarError(undefined_name))
        end
    end

    return function_value
end

"""
Test Julia custom-function code in a fresh module.

This executes code in the server process. A fresh module isolates names; it is
not a security sandbox. `placement` supplies representative lexical context;
omitting it uses the edge/floating context where `nodeid` is available and
`self` and edge-assignment values are not. The `variable` placement supplies
both node and edge bindings because a variable's assignments are deferred. The
`query` placement validates tag-query predicates without injecting protocol
context, matching their runtime evaluation path.

Returns a tuple of (success::Bool, results::Dict, error::Union{Nothing, Exception})
"""
function test_code(code_string::String; placement::Union{Nothing,String}=nothing)
    require_unsafe_code_evaluation()

    # Create isolated module
    sandbox = Module()

    try
        # Get names that exist before evaluation (default functions)
        default_names = @invokelatest names(sandbox, all=true)

        # Use the same complete-source parser and Function contract as runtime
        # Lambda creation. Protocol validation has no concrete assignment yet,
        # so contextual names use stable representative values while preserving
        # placement availability. Query validation uses no context wrapper.
        effective_placement = placement === nothing ? "floating" : placement
        effective_placement in ("node", "edge", "floating", "variable", "query") ||
          throw(ArgumentError(
            "Custom function placement must be 'node', 'edge', 'floating', 'variable', or 'query'",
        ))
        if effective_placement == "query"
            function_value = _evaluate_function_source(
                code_string;
                evaluation_module=sandbox,
            )
            _validate_query_function_globals(function_value, sandbox)
        else
            function validation_nodeid(name::String)::Int
                return 1
            end
            self_node_index = effective_placement in ("node", "variable") ? 1 : nothing
            edge_context = if effective_placement in ("edge", "variable")
                _EdgeFunctionContext(1.0, 2.0, 1.5, 1, 2)
            else
                nothing
            end
            transform = parsed -> _function_context_expression(
                parsed,
                validation_nodeid,
                self_node_index,
                edge_context,
            )
            _evaluate_function_source(
                code_string;
                evaluation_module=sandbox,
                transform=transform,
            )
        end

        # Get names that exist after evaluation
        all_names = @invokelatest names(sandbox, all=true)

        @info "All names" all_names=all_names

        # Find newly created names by filtering
        created_names = Symbol[]
        for name in all_names
            if !(name in default_names)
                push!(created_names, name)
            end
        end

        # @info "Created names" created_names=created_names

        # Separate functions from other values
        functions = String[]
        variables = Dict{String, Any}()

        for name in created_names
            name_str = string(name)
            @info "Name" name=name name_str=name_str
            # Skip internal Julia names
            if !startswith(name_str, "#") && !startswith(name_str, "@")
                # Julia 1.12 tightened world-age checks for bindings created by
                # the immediately preceding eval.
                value = Base.invokelatest(getfield, sandbox, name)
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

function _numeric_placement_bindings(placement::String)
    placement == "node" && return Set((:nodeid, :self))
    placement == "edge" && return Set((
        :nodeid,
        :length,
        :delay,
        :refractive_index,
        :node_a,
        :node_b,
    ))
    placement == "floating" && return Set((:nodeid,))
    placement == "variable" && return copy(_ALL_NUMERIC_CONTEXT_BINDINGS)
    return Set{Symbol}()
end

"""
Validate or evaluate one typed Julia numeric expression.

Template protocol validation omits `context` and is always deferred. Variable
validation also omits context, but evaluates context-free source immediately;
free references to the supported assignment bindings are syntax-checked and
reported as deferred. Concrete node, edge, and floating contexts evaluate in a
fresh module with the same lexical bindings used by runtime construction.
"""
function test_numeric_expression(
    expression::AbstractString,
    target_type::AbstractString,
    placement::AbstractString;
    context=nothing,
)
    require_unsafe_code_evaluation()

    try
        expression = String(expression)
        target_type = String(target_type)
        placement = String(placement)
        target_type in NUMERIC_EXPRESSION_TARGETS || throw(ArgumentError(
            "Numeric expression target type must be 'Float64' or 'Int64'",
        ))
        placement in NUMERIC_EXPRESSION_PLACEMENTS || throw(ArgumentError(
            "Numeric expression placement must be 'node', 'edge', 'floating', or 'variable'",
        ))

        parsed = _parse_complete_source(expression)
        references = _free_numeric_context_bindings(parsed)
        unavailable = setdiff(references, _numeric_placement_bindings(placement))
        isempty(unavailable) || throw(UndefVarError(first(sort!(collect(unavailable)))))

        deferred = context === nothing && (
            placement != "variable" || !isempty(references)
        )
        results = Dict{Symbol,Any}(
            :deferred => deferred,
            :target_type => target_type,
        )
        deferred && return true, results, nothing

        transform = identity
        if context !== nothing
            node_name_to_index = _node_name_to_index(context.node_names)
            nodeid = _nodeid_resolver(node_name_to_index)
            self_node_index = placement == "node" ? context.self : nothing
            edge_context = placement == "edge" ? context.edge_context : nothing
            transform = parsed_source -> _source_context_expression(
                parsed_source,
                nodeid,
                self_node_index,
                edge_context,
            )
        end

        value = _evaluate_complete_source(
            expression;
            evaluation_module=Module(),
            transform,
        )
        cast_value = _cast_numeric_expression_result(value, target_type)
        results[:value] = _numeric_expression_result_string(cast_value)
        return true, results, nothing
    catch error
        return false, nothing, error
    end
end


"""
Evaluate a symbolic expression in a temporary module preloaded with
QuantumSavory-related namespaces. This is namespace isolation, not a security
sandbox. Returns a tuple of
(success::Bool, value::Any, error::Union{Nothing,Exception}).
If successful, `value` is the actual evaluated symbolic object.
"""
function evaluate_symbolic_expression(expr::String)
    require_unsafe_code_evaluation()

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
