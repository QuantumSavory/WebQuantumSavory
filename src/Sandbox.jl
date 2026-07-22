module Sandbox

using Latexify
using QuantumSavory
using ..WebQuantumSavory: APIError,
                          COMPARISON_CURRY_OPERATORS,
                          EDGE_CONTEXT_DESCRIPTORS,
                          EDGE_ENDPOINT_CONTEXT_DESCRIPTORS,
                          NUMERIC_EXPRESSION_PLACEMENTS,
                          NUMERIC_EXPRESSION_TARGETS,
                          SYMBOLIC_LATEX_MAX_BYTES,
                          ValidatedExpression,
                          _EdgeFunctionContext,
                          _cast_numeric_expression_result,
                          _node_name_to_index,
                          _nodeid_resolver,
                          _numeric_expression_result_string,
                          _representative_source_context,
                          _source_capability_value,
                          require_unsafe_code_evaluation,
                          validate_source_expression

const _NONBINDING_CAPABILITIES = Set{Symbol}((:&&, :||, :ternary))

function _source_context_bindings(
    nodeid::Union{Nothing,Function},
    self_node_index::Union{Nothing,Int},
    edge_context::Union{Nothing,_EdgeFunctionContext},
)
    bindings = Dict{Symbol,Any}()
    nodeid === nothing || (bindings[:nodeid] = nodeid)
    self_node_index === nothing || (bindings[:self] = self_node_index)
    if edge_context !== nothing
        for descriptor in (EDGE_CONTEXT_DESCRIPTORS..., EDGE_ENDPOINT_CONTEXT_DESCRIPTORS...)
            bindings[descriptor.binding] = getfield(edge_context, descriptor.field)
        end
    end
    return bindings
end

"""
The sole server-process boundary for evaluating validated user source.

The validated expression subtree is embedded unchanged in a server-owned
lexical wrapper. The fresh module receives no imports or user-controlled global
bindings, and `Core.eval` is called exactly once.
"""
function _evaluate_validated_expression(
    validated::ValidatedExpression;
    context::Dict{Symbol,Any}=Dict{Symbol,Any}(),
)
    require_unsafe_code_evaluation()
    evaluation_module = Module(gensym(:WQSRestricted), false, false)
    function_name = validated.function_name
    function_name === nothing || !isdefined(evaluation_module, function_name) ||
        error("Fresh restricted module unexpectedly contains '$function_name'")

    assignments = Any[]
    for capability in validated.referenced_capabilities
        capability in _NONBINDING_CAPABILITIES && continue
        value = _source_capability_value(validated, capability)
        push!(assignments, Expr(:(=), capability, QuoteNode(value)))
    end
    for name in validated.referenced_contexts
        haskey(context, name) || throw(ArgumentError(
            "Validated source requires missing context binding '$name'",
        ))
        push!(assignments, Expr(:(=), name, QuoteNode(context[name])))
    end

    wrapper = Expr(:let, Expr(:block, assignments...), validated.expression)
    value = Core.eval(evaluation_module, wrapper)
    function_name === nothing || !isdefined(evaluation_module, function_name) ||
        error("Restricted short-form definition escaped its lexical scope")
    return value
end

function _function_result(value)
    value isa Function || throw(ArgumentError(
        "Custom Function source must evaluate to a Julia Function; got $(typeof(value))",
    ))
    return value
end

function _symbolic_result(value)
    root = QuantumSavory.SymQObj
    value isa root || throw(ArgumentError(
        "Symbolic source must evaluate to an authoritative QuantumSavory SymQObj; got $(typeof(value))",
    ))
    return value
end

function _placement_context(
    placement::AbstractString;
    nodeid::Union{Nothing,Function}=nothing,
    self_node_index::Union{Nothing,Int}=nothing,
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
    placement = String(placement)
    if placement == "query"
        return Dict{Symbol,Any}()
    end
    return _source_context_bindings(nodeid, self_node_index, edge_context)
end

"""Evaluate one Custom Function using concrete assignment context."""
function evaluate_function_expression(
    source::AbstractString;
    placement::AbstractString="floating",
    nodeid::Union{Nothing,Function}=nothing,
    self_node_index::Union{Nothing,Int}=nothing,
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
    require_unsafe_code_evaluation()
    validated = validate_source_expression(
        source;
        profile=:custom_function,
        placement,
    )
    value = _evaluate_validated_expression(
        validated;
        context=_placement_context(
            placement;
            nodeid,
            self_node_index,
            edge_context,
        ),
    )
    return _function_result(value), validated
end

"""Evaluate one custom tag-query predicate without protocol context."""
function evaluate_query_expression(source::AbstractString)
    require_unsafe_code_evaluation()
    validated = validate_source_expression(
        source;
        profile=:query_predicate,
        placement="query",
    )
    value = _evaluate_validated_expression(validated)
    return _function_result(value), validated
end

"""
Validate and evaluate one function-valued source using representative context.

Validation failures are raised as `VALIDATION_ERROR`; only failures after the
validated subtree reaches `Core.eval` are returned as evaluation failures.
"""
function test_code(code_string::String; placement::Union{Nothing,String}=nothing)
    require_unsafe_code_evaluation()
    effective_placement = placement === nothing ? "floating" : String(placement)
    effective_placement in ("node", "edge", "floating", "variable", "query") ||
        throw(ArgumentError(
            "Custom Function placement must be 'node', 'edge', 'floating', 'variable', or 'query'",
        ))
    profile = effective_placement == "query" ? :query_predicate : :custom_function
    validated = validate_source_expression(
        code_string;
        profile,
        placement=effective_placement,
    )

    try
        context = if effective_placement == "query"
            Dict{Symbol,Any}()
        else
            representative = _representative_source_context(effective_placement)
            _source_context_bindings(
                representative.nodeid,
                representative.self_node_index,
                representative.edge_context,
            )
        end
        _function_result(_evaluate_validated_expression(validated; context))
        results = Dict{Symbol,Any}(
            :root_form => string(validated.root_form),
            :arity => length(validated.arguments),
            :required_context => string.(validated.referenced_contexts),
        )
        validated.function_name === nothing ||
            (results[:function_name] = string(validated.function_name))
        return true, results, nothing
    catch error
        error isa APIError && rethrow()
        return false, nothing, error
    end
end

function _numeric_context(
    placement::AbstractString,
    context,
)
    if context === nothing
        representative = _representative_source_context(placement)
        return _source_context_bindings(
            representative.nodeid,
            representative.self_node_index,
            representative.edge_context,
        )
    end
    if hasproperty(context, :node_names)
        nodeid = _nodeid_resolver(_node_name_to_index(context.node_names))
        return _source_context_bindings(
            nodeid,
            hasproperty(context, :self) ? context.self : nothing,
            hasproperty(context, :edge_context) ? context.edge_context : nothing,
        )
    end
    if hasproperty(context, :nodeid)
        return _source_context_bindings(
            context.nodeid,
            context.self_node_index,
            context.edge_context,
        )
    end
    throw(ArgumentError("Numeric-expression context has an unsupported shape"))
end

"""Evaluate and cast numeric source in one concrete lexical context."""
function evaluate_numeric_expression(
    expression::AbstractString,
    target_type::AbstractString;
    placement::AbstractString,
    context=nothing,
    minimum=nothing,
    maximum=nothing,
)
    require_unsafe_code_evaluation()
    target_type = String(target_type)
    placement = String(placement)
    target_type in NUMERIC_EXPRESSION_TARGETS || throw(ArgumentError(
        "Numeric expression target type must be 'Float64' or 'Int64'",
    ))
    placement in NUMERIC_EXPRESSION_PLACEMENTS || throw(ArgumentError(
        "Numeric expression placement must be 'node', 'edge', 'floating', or 'variable'",
    ))
    validated = validate_source_expression(
        expression;
        profile=:numeric_expression,
        placement,
    )
    placement == "variable" && !isempty(validated.referenced_contexts) &&
        throw(ArgumentError("A contextual Variable requires a concrete assignment"))
    value = _evaluate_validated_expression(
        validated;
        context=_numeric_context(placement, context),
    )
    return _cast_numeric_expression_result(
        value,
        target_type;
        minimum,
        maximum,
    )
end

"""Validate or evaluate one typed Julia numeric expression."""
function test_numeric_expression(
    expression::AbstractString,
    target_type::AbstractString,
    placement::AbstractString;
    context=nothing,
)
    require_unsafe_code_evaluation()
    target_type = String(target_type)
    placement = String(placement)
    target_type in NUMERIC_EXPRESSION_TARGETS || throw(ArgumentError(
        "Numeric expression target type must be 'Float64' or 'Int64'",
    ))
    placement in NUMERIC_EXPRESSION_PLACEMENTS || throw(ArgumentError(
        "Numeric expression placement must be 'node', 'edge', 'floating', or 'variable'",
    ))
    validated = validate_source_expression(
        expression;
        profile=:numeric_expression,
        placement,
    )
    results = Dict{Symbol,Any}(:target_type => target_type)
    if placement == "variable" && !isempty(validated.referenced_contexts)
        results[:deferred] = true
        results[:required_context] = string.(validated.referenced_contexts)
        return true, results, nothing
    end

    try
        value = _evaluate_validated_expression(
            validated;
            context=_numeric_context(placement, context),
        )
        cast_value = _cast_numeric_expression_result(value, target_type)
        results[:deferred] = context === nothing && placement != "variable"
        results[:value] = _numeric_expression_result_string(cast_value)
        results[:required_context] = string.(validated.referenced_contexts)
        return true, results, nothing
    catch error
        error isa APIError && rethrow()
        return false, nothing, error
    end
end

"""Evaluate validated Symbolic source and return its authoritative object."""
function evaluate_symbolic_expression(expr::String)
    require_unsafe_code_evaluation()
    validated = validate_source_expression(
        expr;
        profile=:symbolic_expression,
        placement="symbolic",
    )
    try
        value = _symbolic_result(_evaluate_validated_expression(validated))
        return true, value, nothing
    catch error
        error isa APIError && rethrow()
        return false, nothing, error
    end
end

"""Validate Symbolic source and return its rendered value and bounded LaTeX."""
function test_symbolic_expression(expr::String)
    success, value, error = evaluate_symbolic_expression(expr)
    success || return false, nothing, error
    try
        latex = String(Latexify.latexify(value))
        ncodeunits(latex) <= SYMBOLIC_LATEX_MAX_BYTES || throw(ArgumentError(
            "Symbolic LaTeX output exceeds $(SYMBOLIC_LATEX_MAX_BYTES) bytes",
        ))
        return true, Dict(:value => string(value), :latex => latex), nothing
    catch render_error
        return false, nothing, render_error
    end
end

end
