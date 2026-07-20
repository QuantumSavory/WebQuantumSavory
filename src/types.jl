"""Find a parser exception embedded in Julia's `:error`/`:incomplete` AST."""
function _complete_source_parse_error(parsed)
    parsed isa Expr || return nothing
    if parsed.head in (:error, :incomplete)
        exception = findfirst(argument -> argument isa Exception, parsed.args)
        exception === nothing || return parsed.args[exception]
    end

    for argument in parsed.args
        exception = _complete_source_parse_error(argument)
        exception === nothing || return exception
    end
    return nothing
end

"""Parse every statement in Julia source and return one scoped expression."""
function _parse_complete_source(source::AbstractString)
    parsed = Meta.parseall(String(source))
    parse_error = _complete_source_parse_error(parsed)
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

const _function_source_parse_error = _complete_source_parse_error
const _parse_function_source = _parse_complete_source

"""
Evaluate complete Julia source in a fresh-module-compatible scope.

`transform` may wrap the parsed block in assignment-specific lexical context.
Callers remain responsible for enforcing their result contract.
"""
function _evaluate_complete_source(
    source::AbstractString;
    evaluation_module::Module=Module(),
    transform::Function=identity,
)
    parsed = _parse_complete_source(source)
    return Base.eval(evaluation_module, transform(parsed))
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
    value = _evaluate_complete_source(
        source;
        evaluation_module,
        transform,
    )

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

"""Protocol-conversion context key containing resolved edge assignment values."""
const EDGE_FUNCTION_CONTEXT_KEY = :edge_function_context

"""Resolved values captured lexically by custom functions assigned to an edge."""
struct _EdgeFunctionContext
    distance_meters::Union{Nothing,Float64}
    delay_seconds::Union{Nothing,Float64}
    refractive_index::Union{Nothing,Float64}
    node_a::Int
    node_b::Int
end

const _ALL_NUMERIC_CONTEXT_BINDINGS = Set((
    :nodeid,
    :self,
    :length,
    :delay,
    :refractive_index,
    :node_a,
    :node_b,
))

"""Return identifiers introduced by one binding pattern."""
function _source_binding_names(pattern)
    if pattern isa Symbol
        return Set((pattern,))
    elseif !(pattern isa Expr)
        return Set{Symbol}()
    elseif pattern.head in (:(::), :kw, :...)
        return _source_binding_names(first(pattern.args))
    elseif pattern.head in (:tuple, :parameters, :vect)
        names = Set{Symbol}()
        foreach(argument -> union!(names, _source_binding_names(argument)), pattern.args)
        return names
    elseif pattern.head === :call
        return _source_binding_names(first(pattern.args))
    elseif pattern.head === :where
        return _source_binding_names(first(pattern.args))
    end
    return Set{Symbol}()
end

function _source_function_signature(signature)
    unwrapped = signature
    while unwrapped isa Expr && unwrapped.head in (:(::), :where)
        unwrapped = first(unwrapped.args)
    end
    if unwrapped isa Symbol
        return Set((unwrapped,)), Set{Symbol}()
    elseif unwrapped isa Expr && unwrapped.head === :call
        name = _source_binding_names(first(unwrapped.args))
        arguments = Set{Symbol}()
        for argument in unwrapped.args[2:end]
            union!(arguments, _source_binding_names(argument))
        end
        return name, arguments
    end
    return Set{Symbol}(), Set{Symbol}()
end

"""
Collect supported context identifiers that are free in parsed Julia source.

The traversal follows the lexical constructs used by numeric inputs and avoids
qualified property names, quoted syntax, comments, arguments, and ordinary
local shadowing. It intentionally treats unqualified `length` as contextual;
users can spell the collection function as `Base.length`.
"""
function _free_numeric_context_bindings(parsed)
    references = Set{Symbol}()

    function visit(expression, bound::Set{Symbol})
        if expression isa Symbol
            expression in _ALL_NUMERIC_CONTEXT_BINDINGS &&
                !(expression in bound) &&
                push!(references, expression)
            return
        elseif expression isa QuoteNode || expression isa LineNumberNode ||
               !(expression isa Expr)
            return
        end

        head = expression.head
        head in (:quote, :inert) && return

        if head in (:block, :toplevel)
            block_bound = copy(bound)
            for statement in expression.args
                if statement isa Expr && statement.head === :(=)
                    lhs, rhs = statement.args
                    if lhs isa Expr && lhs.head === :call
                        function_names, arguments = _source_function_signature(lhs)
                        union!(block_bound, function_names)
                        visit(rhs, union(block_bound, arguments))
                    else
                        visit(rhs, block_bound)
                        union!(block_bound, _source_binding_names(lhs))
                    end
                elseif statement isa Expr && statement.head === :function
                    signature, body = statement.args
                    function_names, arguments = _source_function_signature(signature)
                    union!(block_bound, function_names)
                    visit(body, union(block_bound, arguments))
                elseif statement isa Expr && statement.head in (:local, :global, :const)
                    for declaration in statement.args
                        if declaration isa Expr && declaration.head === :(=)
                            visit(last(declaration.args), block_bound)
                        end
                        union!(block_bound, _source_binding_names(declaration))
                    end
                else
                    visit(statement, block_bound)
                end
            end
            return
        elseif head === :let
            let_bound = copy(bound)
            for binding in expression.args[1:end-1]
                if binding isa Expr && binding.head === :(=)
                    visit(last(binding.args), let_bound)
                    union!(let_bound, _source_binding_names(first(binding.args)))
                else
                    union!(let_bound, _source_binding_names(binding))
                end
            end
            visit(last(expression.args), let_bound)
            return
        elseif head === :function
            signature, body = expression.args
            function_names, arguments = _source_function_signature(signature)
            visit(body, union(bound, function_names, arguments))
            return
        elseif head === :->
            arguments, body = expression.args
            visit(body, union(bound, _source_binding_names(arguments)))
            return
        elseif head === :(=)
            lhs, rhs = expression.args
            if lhs isa Expr && lhs.head === :call
                function_names, arguments = _source_function_signature(lhs)
                visit(rhs, union(bound, function_names, arguments))
            else
                visit(rhs, bound)
            end
            return
        elseif head in (:for, :generator)
            loop_bound = copy(bound)
            iterator = first(expression.args)
            iterator_specs = iterator isa Expr && iterator.head === :block ?
                iterator.args : (iterator,)
            for specification in iterator_specs
                if specification isa Expr && specification.head in (:(=), :in)
                    visit(last(specification.args), loop_bound)
                    union!(loop_bound, _source_binding_names(first(specification.args)))
                else
                    visit(specification, loop_bound)
                end
            end
            foreach(argument -> visit(argument, loop_bound), expression.args[2:end])
            return
        elseif head === :comprehension
            foreach(argument -> visit(argument, bound), expression.args)
            return
        elseif head === :.
            isempty(expression.args) || visit(first(expression.args), bound)
            return
        elseif head === :macrocall
            foreach(argument -> visit(argument, bound), expression.args[3:end])
            return
        end

        foreach(argument -> visit(argument, bound), expression.args)
    end

    visit(parsed, Set{Symbol}())
    return references
end

"""Build the shared one-based node-name lookup from validated node order."""
function _node_name_to_index(nodes)::Dict{String,Int}
    return Dict{String,Int}(
        (node isa AbstractString ? String(node) : string(node["name"])) => index
        for (index, node) in enumerate(nodes)
    )
end

"""Create the strictly typed `nodeid` lookup captured by a custom function."""
function _nodeid_resolver(node_name_to_index::Dict{String,Int})
    function nodeid(name::String)::Int
        return node_name_to_index[name]
    end

    return nodeid
end

"""Wrap parsed Julia source around the supplied lexical context bindings."""
function _source_context_expression(
    parsed,
    nodeid::Union{Nothing,Function},
    self_node_index::Union{Nothing,Int},
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
    if nodeid === nothing && edge_context === nothing && self_node_index === nothing
        return parsed
    elseif nodeid === nothing
        throw(ArgumentError("Numeric-expression context values require a nodeid resolver"))
    elseif edge_context === nothing && self_node_index === nothing
        return :(let nodeid = $(QuoteNode(nodeid))
            $parsed
        end)
    elseif edge_context === nothing
        return :(let nodeid = $(QuoteNode(nodeid)), self = $self_node_index
            $parsed
        end)
    elseif self_node_index === nothing
        return :(let
            nodeid = $(QuoteNode(nodeid))
            length = $(edge_context.distance_meters)
            delay = $(edge_context.delay_seconds)
            refractive_index = $(edge_context.refractive_index)
            node_a = $(edge_context.node_a)
            node_b = $(edge_context.node_b)
            $parsed
        end)
    end

    return :(let
        nodeid = $(QuoteNode(nodeid))
        self = $self_node_index
        length = $(edge_context.distance_meters)
        delay = $(edge_context.delay_seconds)
        refractive_index = $(edge_context.refractive_index)
        node_a = $(edge_context.node_a)
        node_b = $(edge_context.node_b)
        $parsed
    end)
end

const _function_context_expression = _source_context_expression

"""Wrap parsed function code in its supported lexical runtime context."""
function _contextual_function_expression(
    parsed,
    node_name_to_index::Dict{String,Int},
    self_node_index::Union{Nothing,Int},
    edge_context::Union{Nothing,_EdgeFunctionContext},
)
    return _source_context_expression(
        parsed,
        _nodeid_resolver(node_name_to_index),
        self_node_index,
        edge_context,
    )
end

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
    if cast_value isa AbstractFloat && !isfinite(cast_value)
        throw(ArgumentError("Numeric expression must evaluate to a finite Float64"))
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
    require_unsafe_code_evaluation()
    parsed = _parse_complete_source(source)
    allowed_bindings = node_name_to_index === nothing ?
        Set{Symbol}() : Set((:nodeid,))
    self_node_index === nothing || push!(allowed_bindings, :self)
    edge_context === nothing || union!(
        allowed_bindings,
        (:length, :delay, :refractive_index, :node_a, :node_b),
    )
    unavailable = setdiff(
        _free_numeric_context_bindings(parsed),
        allowed_bindings,
    )
    isempty(unavailable) || throw(UndefVarError(first(sort!(collect(unavailable)))))

    transform = if node_name_to_index === nothing
        identity
    else
        parsed -> _source_context_expression(
            parsed,
            _nodeid_resolver(node_name_to_index),
            self_node_index,
            edge_context,
        )
    end
    value = Base.eval(Module(), transform(parsed))
    return _cast_numeric_expression_result(
        value,
        target_type;
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
    require_unsafe_code_evaluation()

    try
        value = _evaluate_function_source(
            lambda_string;
            transform=parsed -> _contextual_function_expression(
                parsed,
                node_name_to_index,
                self_node_index,
                edge_context,
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
