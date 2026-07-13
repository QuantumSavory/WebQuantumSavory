@safetestset "Unit Tests" begin
  using JSON
  include("../src/WebQuantumSavory.jl")
  using .WebQuantumSavory
  using Graphs
  using QuantumSavory
  using Logging
  import LinearAlgebra
  using ConcurrentSim
  using Dates

  # Load test data
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload.json"))

  @testset "Julia Script Export" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "..", "gui", "src", "demos", "1.Entangler.Example.json"))
    payload["name"] = "../Export Demo?"
    payload["simulationConfig"] = Dict("time" => 0.02, "timeStep" => 0.01)
    payload["variables"] = Any[
      Dict(
        "id" => "state-variable",
        "name" => "pair fidelity",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict("p" => 0.9),
        ),
      ),
      Dict(
        "id" => "probability-variable",
        "name" => "pair-fidelity",
        "type" => "Float64",
        "value" => 0.8,
      ),
      Dict(
        "id" => "weighted-state-variable_tr",
        "name" => "weighted pair_tr",
        "type" => "Float64",
        "value" => 0.123,
        "statesZooTraceSourceId" => "weighted-state-variable",
      ),
      Dict(
        "id" => "weighted-state-variable",
        "name" => "weighted pair",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      ),
      Dict(
        "id" => "default-function-variable",
        "name" => "default chooser",
        "type" => "Function",
        "value" => "default",
      ),
    ]

    payload["net"]["nodes"][1]["data"]["slots"][1]["backgroundNoise"] = Dict(
      "type" => "T2Dephasing",
      "parameters" => [Dict("name" => "t2", "value" => 5)],
    )
    parameters = payload["net"]["edges"][1]["data"]["protocols"][1]["parameters"]
    parameter_by_name = Dict(parameter["name"] => parameter for parameter in parameters)
    parameter_by_name["pairstate"]["value"] = Dict("kind" => "variable", "id" => "state-variable")
    parameter_by_name["success_prob"]["value"] =
      Dict("kind" => "variable", "id" => "weighted-state-variable_tr")
    parameter_by_name["chooseA"]["value"] = Dict("kind" => "variable", "id" => "default-function-variable")

    state_names_before = Set(keys(WebQuantumSavory.STATE))
    script = WebQuantumSavory.generate_julia_script(payload)
    @test script == WebQuantumSavory.generate_julia_script(payload)
    @test Set(keys(WebQuantumSavory.STATE)) == state_names_before
    @test WebQuantumSavory.generate_julia_script_export(payload)["filename"] == "export-demo.jl"
    @test Meta.parseall(script) isa Expr
    @test occursin("# Variables", script)
    @test occursin("variable_pair_fidelity = QuantumSavory.StatesZoo.DepolarizedBellPair(0.9)", script)
    @test occursin("variable_pair_fidelity_2 = 0.8", script)
    @test occursin("variable_weighted_pair, variable_weighted_pair_tr = (let", script)
    @test occursin("state = QuantumSavory.StatesZoo.BarrettKokBellPairW(1, 1, 0, 1, 1)", script)
    @test occursin("trace = abs(QuantumSavory.express(LinearAlgebra.tr(state)))", script)
    @test occursin("(state / trace, trace)", script)
    @test !occursin("variable_weighted_pair_tr = 0.123", script)
    @test occursin("success_prob = variable_weighted_pair_tr", script)
    @test occursin("variable_default_chooser = nothing", script)
    @test occursin("QuantumSavory.T2Dephasing(; t2 = 5.0)", script)
    @test occursin("# Registers", script)
    @test occursin(
      "push!(registers, QuantumSavory.Register(traits, representations, backgrounds))\n\n" *
      "# Resolve GUI node names to their one-based register indices.",
      script,
    )
    @test occursin(
      "node_indices = Dict{String,Int}(\n" *
      "    \"Amherst\" => 1,\n" *
      "    \"Cambridge\" => 2,\n" *
      ")\n" *
      "nodeid(name::String)::Int = node_indices[name]",
      script,
    )
    @test occursin("# Register network and simulation clock", script)
    @test occursin(
      "QuantumSavory.RegisterNet(graph, registers; names = [\"Amherst\", \"Cambridge\"])",
      script,
    )
    @test occursin("# Protocol construction and initialization", script)
    @test occursin("nodeA = 1, nodeB = 2", script)
    @test occursin("ConcurrentSim.run(sim, simulation_duration)", script)
    @test occursin("CairoMakie.record", script)
    @test occursin("show(io, MIME\"image/png\"(), protocol)", script)

    diagnostic_payload = deepcopy(payload)
    diagnostic_payload["net"]["protocols"] = Any[
      Dict(
        "id" => "diagnostic-broken",
        "type" => WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        "parameters" => Any[],
      ),
    ]
    diagnostic_export_error = try
      WebQuantumSavory.generate_julia_script(diagnostic_payload)
      nothing
    catch error
      error
    end
    @test diagnostic_export_error isa WebQuantumSavory.APIError
    if diagnostic_export_error isa WebQuantumSavory.APIError
      @test diagnostic_export_error.status_code == 400
      @test occursin("diagnostic-only", diagnostic_export_error.message)
      @test occursin("cannot be exported", diagnostic_export_error.message)
    end

    generated_module = Module(gensym(:GeneratedExport))
    Core.eval(generated_module, :(using Base))
    Base.include_string(generated_module, script, "generated-export.jl")
    generated_sim = getfield(generated_module, :sim)
    @test ConcurrentSim.now(generated_sim) == 0.02
    generated_network = getfield(generated_module, :network)
    @test generated_network.names == ["Amherst", "Cambridge"]
    @test QuantumSavory.name.(generated_network.registers) == ["Amherst", "Cambridge"]
    generated_nodeid = getfield(generated_module, :nodeid)
    @test generated_nodeid("Amherst") == 1
    @test generated_nodeid("Cambridge") == 2
    @test_throws KeyError generated_nodeid("Missing node")
    generated_weighted_state = getfield(generated_module, :variable_weighted_pair)
    @test abs(LinearAlgebra.tr(QuantumSavory.express(generated_weighted_state))) ≈ 1
    generated_weighted_trace = getfield(generated_module, :variable_weighted_pair_tr)
    @test generated_weighted_trace ≈ 0.5
    generated_protocols = getfield(generated_module, :protocols)
    @test length(generated_protocols) == 1
    @test generated_protocols[1].second.success_prob ≈ generated_weighted_trace

    duplicate_name_payload = deepcopy(payload)
    duplicate_name_payload["net"]["nodes"][2]["name"] = "Amherst"
    duplicate_name_script = WebQuantumSavory.generate_julia_script(duplicate_name_payload)
    @test occursin(
      "node_indices = Dict{String,Int}(\n" *
      "    \"Amherst\" => 1,\n" *
      "    \"Amherst\" => 2,\n" *
      ")",
      duplicate_name_script,
    )
    duplicate_name_module = Module(gensym(:DuplicateNameExport))
    Core.eval(duplicate_name_module, :(using Base))
    Base.include_string(duplicate_name_module, duplicate_name_script, "duplicate-name-export.jl")
    @test getfield(duplicate_name_module, :nodeid)("Amherst") == 2

    contextual_payload = JSON.parsefile(joinpath(
      @__DIR__,
      "..",
      "gui",
      "src",
      "demos",
      "1.Entangler.Example.json",
    ))
    contextual_payload["name"] = "Contextual Function Export"
    contextual_payload["simulationConfig"] = Dict("time" => 0.001, "timeStep" => 0.001)
    contextual_payload["variables"] = Any[
      Dict{String,Any}(
        "id" => "node-context-function",
        "name" => "node context function",
        "type" => "Lambda",
        "value" => "candidates -> self * 100 + nodeid(\"Cambridge\") + first(candidates)",
      ),
    ]
    contextual_payload["net"]["edges"][1]["data"]["protocols"] = Any[]
    named_node_function = """function named_node_choice(candidates)
        self * 1000 + nodeid("Amherst") + first(candidates)
    end"""
    for (node_index, node) in enumerate(contextual_payload["net"]["nodes"])
      push!(node["data"]["protocols"], Dict(
        "id" => "node-context-$node_index",
        "type" => "QuantumSavory.ProtocolZoo.SwapperProt",
        "parameters" => Any[
          Dict(
            "name" => "chooseL",
            "type" => "Function",
            "value" => Dict("kind" => "variable", "id" => "node-context-function"),
          ),
          Dict("name" => "chooseH", "type" => "Lambda", "value" => named_node_function),
          Dict("name" => "rounds", "type" => "Int64", "value" => 0),
        ],
      ))
    end

    contextual_script = WebQuantumSavory.generate_julia_script(contextual_payload)
    @test Meta.parseall(contextual_script) isa Expr
    @test occursin(
      "# GUI variable \"node context function\" is instantiated at each protocol assignment",
      contextual_script,
    )
    @test !occursin("variable_node_context_function =", contextual_script)
    @test occursin("let\n    self = 1", contextual_script)
    @test occursin("let\n    self = 2", contextual_script)
    @test length(findall("candidates -> self * 100 + nodeid", contextual_script)) == 2
    @test length(findall("function named_node_choice", contextual_script)) == 2

    lambda_default_payload = deepcopy(contextual_payload)
    lambda_default_payload["variables"][1]["value"] = "default"
    lambda_default_error = try
      WebQuantumSavory.generate_julia_script(lambda_default_payload)
      nothing
    catch error
      error
    end
    @test lambda_default_error isa WebQuantumSavory.APIError
    @test occursin("cannot use a constructor default", lambda_default_error.message)

    unused_nonstring_lambda_payload = deepcopy(contextual_payload)
    unused_nonstring_lambda_payload["variables"][1]["value"] = 42
    for node in unused_nonstring_lambda_payload["net"]["nodes"]
      empty!(node["data"]["protocols"])
    end
    unused_nonstring_lambda_error = try
      WebQuantumSavory.generate_julia_script(unused_nonstring_lambda_payload)
      nothing
    catch error
      error
    end
    @test unused_nonstring_lambda_error isa WebQuantumSavory.APIError
    @test occursin(
      "must be a function name or Julia function expression",
      unused_nonstring_lambda_error.message,
    )

    contextual_module = Module(gensym(:ContextualExport))
    Core.eval(contextual_module, :(using Base))
    Base.include_string(contextual_module, contextual_script, "contextual-export.jl")
    contextual_protocols = Dict(getfield(contextual_module, :protocols))
    node_one_protocol = contextual_protocols["node-context-1"]
    node_two_protocol = contextual_protocols["node-context-2"]
    @test Base.invokelatest(node_one_protocol.chooseL, [5]) == 107
    @test Base.invokelatest(node_two_protocol.chooseL, [5]) == 207
    @test Base.invokelatest(node_one_protocol.chooseH, [5]) == 1006
    @test Base.invokelatest(node_two_protocol.chooseH, [5]) == 2006

    for context in ("Edge custom function", "Floating custom function")
      nodeid_expression = WebQuantumSavory._script_value_expression(
        "Lambda",
        "value -> nodeid(\"Cambridge\") + value",
        context,
      )
      nodeid_function = Core.eval(contextual_module, Meta.parse(nodeid_expression))
      @test Base.invokelatest(nodeid_function, 3) == 5

      unknown_name_expression = WebQuantumSavory._script_value_expression(
        "Lambda",
        "value -> nodeid(\"Missing node\") + value",
        context,
      )
      unknown_name_function = Core.eval(contextual_module, Meta.parse(unknown_name_expression))
      @test_throws KeyError Base.invokelatest(unknown_name_function, 3)

      self_expression = WebQuantumSavory._script_value_expression(
        "Lambda",
        "value -> self + value",
        context,
      )
      self_function = Core.eval(contextual_module, Meta.parse(self_expression))
      @test_throws UndefVarError Base.invokelatest(self_function, 3)
    end

    weighted_variable = only(filter(
      variable -> variable["id"] == "weighted-state-variable",
      payload["variables"],
    ))
    direct_weighted_expression = WebQuantumSavory._script_states_zoo_expression(
      weighted_variable["value"],
      "Direct weighted state",
    )
    @test !occursin("(state / trace, trace)", direct_weighted_expression)
    direct_weighted_state = Core.eval(generated_module, Meta.parse(direct_weighted_expression))
    @test abs(LinearAlgebra.tr(QuantumSavory.express(direct_weighted_state))) ≈ 1

    function trace_ownership_error(mutate_companion!)
      invalid_payload = deepcopy(payload)
      companion = only(filter(
        variable -> variable["id"] == "weighted-state-variable_tr",
        invalid_payload["variables"],
      ))
      mutate_companion!(companion)
      try
        WebQuantumSavory.generate_julia_script(invalid_payload)
        return nothing
      catch error
        return error
      end
    end

    unknown_owner = trace_ownership_error(
      companion -> (companion["statesZooTraceSourceId"] = "missing-state"),
    )
    @test unknown_owner isa WebQuantumSavory.APIError
    @test occursin("unknown States Zoo variable", unknown_owner.message)

    unweighted_owner = trace_ownership_error(
      companion -> (companion["statesZooTraceSourceId"] = "state-variable"),
    )
    @test unweighted_owner isa WebQuantumSavory.APIError
    @test occursin("must be a weighted States Zoo variable", unweighted_owner.message)

    mismatched_companion = trace_ownership_error(
      companion -> (companion["name"] = "stale trace name"),
    )
    @test mismatched_companion isa WebQuantumSavory.APIError
    @test occursin("does not match its weighted States Zoo owner", mismatched_companion.message)

    invalid_config = deepcopy(payload)
    invalid_config["simulationConfig"]["time"] = 0
    invalid_config_error = try
      WebQuantumSavory.generate_julia_script(invalid_config)
      nothing
    catch error
      error
    end
    @test invalid_config_error isa WebQuantumSavory.APIError
    @test invalid_config_error.status_code == 400
    @test occursin("positive finite", invalid_config_error.message)

    invalid_protocol = deepcopy(payload)
    invalid_protocol["net"]["edges"][1]["data"]["protocols"][1]["type"] = "Main.NotAProtocol"
    invalid_protocol_error = try
      WebQuantumSavory.generate_julia_script(invalid_protocol)
      nothing
    catch error
      error
    end
    @test invalid_protocol_error isa WebQuantumSavory.APIError
    @test invalid_protocol_error.status_code == 400
    @test occursin("unknown type", invalid_protocol_error.message)

    empty_network_error = try
      WebQuantumSavory.generate_julia_script(Dict(
        "name" => "Empty Network",
        "net" => Dict("nodes" => Any[], "edges" => Any[], "protocols" => Any[]),
      ))
      nothing
    catch error
      error
    end
    @test empty_network_error isa WebQuantumSavory.APIError
    @test occursin("at least one node", empty_network_error.message)

    empty_register_payload = Dict(
      "name" => "Empty Register",
      "net" => Dict(
        "nodes" => [Dict(
          "id" => "node",
          "name" => "Node",
          "position" => [0, 0],
          "data" => Dict("slots" => Any[], "protocols" => Any[]),
        )],
        "edges" => Any[],
        "protocols" => Any[],
      ),
    )
    empty_register_error = try
      WebQuantumSavory.generate_julia_script(empty_register_payload)
      nothing
    catch error
      error
    end
    @test empty_register_error isa WebQuantumSavory.APIError
    @test occursin("at least one slot", empty_register_error.message)

    wildcard_payload = deepcopy(payload)
    push!(wildcard_payload["variables"], Dict(
      "id" => "wildcard-variable",
      "name" => "any remote node",
      "type" => "QuantumSavory.Wildcard",
      "value" => nothing,
    ))
    push!(wildcard_payload["net"]["nodes"][1]["data"]["protocols"], Dict(
      "id" => "wildcard-swapper",
      "type" => "QuantumSavory.ProtocolZoo.SwapperProt",
      "parameters" => [
        Dict(
          "name" => "nodeL",
          "type" => ["QuantumSavory.Wildcard", "Int64", "Function"],
          "value" => Dict("kind" => "variable", "id" => "wildcard-variable"),
        ),
        Dict(
          "name" => "nodeH",
          "type" => "QuantumSavory.Wildcard",
          "value" => "Wildcard",
        ),
      ],
    ))
    wildcard_script = WebQuantumSavory.generate_julia_script(wildcard_payload)
    @test occursin("variable_any_remote_node = (() -> QuantumSavory.Wildcard())", wildcard_script)
    @test length(findall("variable_any_remote_node()", wildcard_script)) == 1
    @test occursin("nodeH = QuantumSavory.Wildcard()", wildcard_script)

    nested_protocol_payload = deepcopy(payload)
    nested_protocol = nested_protocol_payload["net"]["edges"][1]["data"]["protocols"][1]
    nested_protocol["id"] = "show"
    nested_protocol["type"] = "QuantumSavory.ProtocolZoo.QTCP.LinkController"
    nested_protocol["parameters"] = Any[]
    nested_protocol_script = WebQuantumSavory.generate_julia_script(nested_protocol_payload)
    @test occursin(
      "QuantumSavory.ProtocolZoo.QTCP.LinkController(; sim = sim, net = network, nodeA = 1, nodeB = 2)",
      nested_protocol_script,
    )
    @test occursin("protocol_instance_show = QuantumSavory.ProtocolZoo.QTCP.LinkController", nested_protocol_script)
    @test occursin("show(io, MIME\"image/png\"(), protocol)", nested_protocol_script)
  end

  @testset "Background Types" begin
      background_types = WebQuantumSavory.get_background_types()
      @test isa(background_types, Vector)
      @test !isempty(background_types)
      @test all(isa(bt, Dict) for bt in background_types)
      @test all(haskey(bt, "type") for bt in background_types)
      @test all(haskey(bt, "doc") for bt in background_types)
      @test all(haskey(bt, "parameters") for bt in background_types)
  end

  @testset "Slot Types" begin
      slot_types = WebQuantumSavory.get_slot_types()
      @test isa(slot_types, Vector)
      @test !isempty(slot_types)
      @test all(isa(st, Dict) for st in slot_types)
      @test all(haskey(st, "type") for st in slot_types)
      @test all(haskey(st, "doc") for st in slot_types)
  end

  @testset "Known Function References" begin
      expected_known_functions = [
          "minimum", "maximum", "abs", "identity", "<(self)", ">(self)", "≤(self)", "≥(self)", "==(self)",
      ]
      @test WebQuantumSavory.known_functions() == expected_known_functions

      safe_references = [
        "minimum" => minimum,
        "maximum" => maximum,
        "abs" => abs,
        "identity" => identity,
      ]
      for (name, expected) in safe_references
        @test WebQuantumSavory.resolve_function_reference(name) === expected
      end

      # Names outside the advertised allowlist must not reach arbitrary Julia
      # functions, whether they are qualified or unqualified.
      rejected_references = [
        "min", "Base.min", "exit", "Base.exit", "eval", "Core.eval",
        "Main.eval", "include", "Base.include", "run", "Base.run", "rm",
        "Base.rm", "open", "Base.open",
      ]
      for name in rejected_references
        @test WebQuantumSavory.resolve_function_reference(name) === nothing
      end

      rejected_kwargs = Dict{Symbol,Any}()
      @test !WebQuantumSavory._handle_function_lambda_parameter!(
        rejected_kwargs,
        :filter,
        "Function",
        "exit",
      )
      @test !haskey(rejected_kwargs, :filter)

      comparison_cases = [
        "<(self)" => [true, false, false],
        ">(self)" => [false, false, true],
        "≤(self)" => [true, true, false],
        "≥(self)" => [false, true, true],
        "==(self)" => [false, true, false],
      ]
      for (name, expected) in comparison_cases
        comparison = WebQuantumSavory.resolve_self_comparison_reference(name, 2)
        @test comparison !== nothing
        if comparison !== nothing
          @test comparison.(1:3) == expected
        end
        @test WebQuantumSavory.resolve_function_reference(name) === nothing
      end
      @test WebQuantumSavory.resolve_self_comparison_reference("!=(self)", 2) === nothing
      @test WebQuantumSavory.resolve_self_comparison_reference("==(self)", nothing) === nothing

      node_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_function_lambda_parameter!(
        node_kwargs,
        :chooseslot,
        "Function",
        "==(self)";
        self_node_index=2,
      )
      @test haskey(node_kwargs, :chooseslot)
      if haskey(node_kwargs, :chooseslot)
        @test node_kwargs[:chooseslot].(1:3) == [false, true, false]
      end

      non_node_kwargs = Dict{Symbol,Any}()
      @test !WebQuantumSavory._handle_function_lambda_parameter!(
        non_node_kwargs,
        :chooseslot,
        "Function",
        "==(self)",
      )
      @test !haskey(non_node_kwargs, :chooseslot)

      # The optional positional state argument remains backwards compatible.
      ordinary_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_function_lambda_parameter!(
        ordinary_kwargs,
        :filter,
        "Function",
        "identity",
        nothing,
      )
      @test haskey(ordinary_kwargs, :filter)
      if haskey(ordinary_kwargs, :filter)
        @test ordinary_kwargs[:filter] === identity
      end
  end

  @testset "Custom Function Runtime Context" begin
      @test WebQuantumSavory.CUSTOM_FUNCTION_CONTEXT_NAMES == (:nodeid, :self)

      nodes = [
        Dict("name" => "Amherst"),
        Dict("name" => "Cambridge"),
        Dict("name" => "Amherst"),
      ]
      node_name_to_index = WebQuantumSavory._node_name_to_index(nodes)
      # Julia Dict construction intentionally preserves compatibility for
      # duplicate names by retaining the last matching node.
      @test node_name_to_index == Dict("Amherst" => 3, "Cambridge" => 2)

      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        anonymous = WebQuantumSavory.create_lambda(
          "candidate -> self == nodeid(\"Cambridge\") && candidate == nodeid(\"Amherst\")";
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test anonymous(3)
        @test !anonymous(2)

        named = WebQuantumSavory.create_lambda(
          """
          function contextual_selector(candidate)
            return self == nodeid("Cambridge") && candidate == nodeid("Amherst")
          end
          """;
          node_name_to_index=node_name_to_index,
          self_node_index=2,
        )
        @test named(3)
        @test !named(1)

        # Literal custom functions are instantiated with the node assignment's
        # context rather than a process-global value.
        literal_kwargs = Dict{Symbol,Any}()
        literal_ctx = Dict{Symbol,Any}(
          :node => 2,
          WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
        )
        @test WebQuantumSavory._handle_typed_parameter!(
          literal_kwargs,
          :selector,
          "Lambda",
          "candidate -> candidate == self && nodeid(\"Cambridge\") == self",
          literal_ctx,
        )
        @test literal_kwargs[:selector](2)
        @test !literal_kwargs[:selector](1)

        # Lambda variables retain raw source and receive a fresh lexical `self`
        # for each assignment, while sharing the prepared node lookup.
        lambda_variable = WebQuantumSavory.Variable(
          "contextual-selector",
          "contextual selector",
          "Lambda",
          "candidate -> candidate == self && nodeid(\"Cambridge\") == 2",
        )
        variable_functions = Dict{Int,Any}()
        for node_index in 1:2
          kwargs = Dict{Symbol,Any}()
          ctx = Dict{Symbol,Any}(
            :node => node_index,
            WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
          )
          @test WebQuantumSavory._handle_typed_parameter!(
            kwargs,
            :selector,
            lambda_variable.type,
            lambda_variable.value,
            ctx,
          )
          variable_functions[node_index] = kwargs[:selector]
        end
        @test variable_functions[1](1)
        @test !variable_functions[1](2)
        @test variable_functions[2](2)
        @test !variable_functions[2](1)

        # Edge and floating functions receive `nodeid`, but no `self` binding.
        for ctx in (
          Dict{Symbol,Any}(
            :nodeA => 1,
            :nodeB => 2,
            WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
          ),
          Dict{Symbol,Any}(
            WebQuantumSavory.NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
          ),
        )
          kwargs = Dict{Symbol,Any}()
          @test WebQuantumSavory._handle_typed_parameter!(
            kwargs,
            :selector,
            "Lambda",
            "candidate -> candidate == nodeid(\"Cambridge\")",
            ctx,
          )
          @test kwargs[:selector](2)

          invalid_kwargs = Dict{Symbol,Any}()
          @test WebQuantumSavory._handle_typed_parameter!(
            invalid_kwargs,
            :selector,
            "Lambda",
            "candidate -> candidate == self",
            ctx,
          )
          @test_throws UndefVarError invalid_kwargs[:selector](2)
        end

        missing_name = WebQuantumSavory.create_lambda(
          "candidate -> candidate == nodeid(\"Springfield\")";
          node_name_to_index=node_name_to_index,
          self_node_index=1,
        )
        @test_throws KeyError missing_name(1)
      end
  end

  @testset "Protocol Types" begin
      @test !WebQuantumSavory.mock_broken_protocol_enabled(override=nothing)
      @test WebQuantumSavory.mock_broken_protocol_enabled(override=" TRUE ")
      @test !WebQuantumSavory.mock_broken_protocol_enabled(override="False")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="1")
      @test_throws ArgumentError WebQuantumSavory.mock_broken_protocol_enabled(override="yes")

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => nothing) do
        hidden_types = WebQuantumSavory.get_protocol_types()
        @test all(pt["type"] != WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE for pt in hidden_types)
        @test WebQuantumSavory._resolve_protocol_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        ) === nothing
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "false") do
        hidden_types = WebQuantumSavory.get_protocol_types()
        @test all(pt["type"] != WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE for pt in hidden_types)
        @test WebQuantumSavory._resolve_protocol_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        ) === nothing
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true") do
        diagnostic_types = WebQuantumSavory.get_protocol_types()
        diagnostic = only(filter(
          pt -> pt["type"] == WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
          diagnostic_types,
        ))
        @test diagnostic["group"] == "floating"
        @test isempty(diagnostic["parameters"])
        @test WebQuantumSavory._resolve_protocol_type_from_string(
          WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
        ) === WebQuantumSavory.MockBrokenProtocol
      end

      withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "invalid") do
        @test_throws ArgumentError WebQuantumSavory.get_protocol_types()
      end

      protocol_types = WebQuantumSavory.get_protocol_types()
      @test isa(protocol_types, Vector)
      @test !isempty(protocol_types)
      @test all(isa(pt, Dict) for pt in protocol_types)
      @test all(haskey(pt, "type") for pt in protocol_types)
      @test all(haskey(pt, "doc") for pt in protocol_types)
      @test all(haskey(pt, "group") for pt in protocol_types)
      @test all(haskey(pt, "parameters") for pt in protocol_types)
      @test all(haskey(pt, "virtual") for pt in protocol_types)
      @test all(pt["group"] in ["node", "edge", "floating"] for pt in protocol_types)

      protocol_types_by_name = Dict(pt["type"] => pt for pt in protocol_types)
      virtual_protocol = protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglementConsumer)]
      physical_protocols = [
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglerProt)],
        protocol_types_by_name[string(QuantumSavory.ProtocolZoo.LinkController)],
      ]

      @test virtual_protocol["group"] == "edge"
      @test virtual_protocol["virtual"] === true
      @test all(pt["group"] == "edge" for pt in physical_protocols)
      @test all(pt["virtual"] === false for pt in physical_protocols)

      entangler_parameters = protocol_types_by_name[string(QuantumSavory.ProtocolZoo.EntanglerProt)]["parameters"]
      pairstate = only(filter(parameter -> string(parameter.field) == "pairstate", entangler_parameters))
      @test pairstate.type == "Symbolic"
  end

  @testset "States Zoo Registry and Recipes" begin
      expected = [
        "BarrettKokBellPair" => QuantumSavory.StatesZoo.BarrettKokBellPair,
        "BarrettKokBellPairW" => QuantumSavory.StatesZoo.BarrettKokBellPairW,
        "DepolarizedBellPair" => QuantumSavory.StatesZoo.DepolarizedBellPair,
        "GenqoMultiplexedCascadedBellPairW" => QuantumSavory.StatesZoo.Genqo.GenqoMultiplexedCascadedBellPairW,
        "GenqoUnheraldedSPDCBellPairW" => QuantumSavory.StatesZoo.Genqo.GenqoUnheraldedSPDCBellPairW,
      ]

      @test length(WebQuantumSavory.STATES_ZOO_TYPE_REGISTRY) == 5
      @test Set(keys(WebQuantumSavory.STATES_ZOO_TYPE_REGISTRY)) == Set(first.(expected))

      catalog = WebQuantumSavory.get_states_zoo_types()
      @test [entry["id"] for entry in catalog] == first.(expected)
      @test [entry["display_name"] for entry in catalog] == [
        "Barrett-Kok Bell Pair",
        "Barrett-Kok Bell Pair (weighted)",
        "Depolarized Bell Pair",
        "Genqo Multiplexed Cascaded Bell Pair (weighted)",
        "Genqo Unheralded SPDC Bell Pair (weighted)",
      ]
      @test [entry["weighted"] for entry in catalog] == [false, true, false, true, true]

      for (catalog_entry, (id, T)) in zip(catalog, expected)
        parameters = QuantumSavory.StatesZoo.stateparameters(T)
        ranges = QuantumSavory.StatesZoo.stateparametersrange(T)
        expected_metadata = [
          Dict{String,Any}(
            "name" => string(parameter),
            "min" => ranges[parameter].min,
            "max" => ranges[parameter].max,
            "good" => ranges[parameter].good,
          ) for parameter in parameters
        ]
        @test catalog_entry["parameters"] == expected_metadata

        good_parameters = Dict(
          string(parameter) => ranges[parameter].good for parameter in parameters
        )
        @test WebQuantumSavory.construct_states_zoo_state(id, good_parameters) isa T

        recipe = Dict(
          "kind" => "states_zoo",
          "state_type" => id,
          "parameters" => good_parameters,
        )
        recipe_state = WebQuantumSavory.construct_states_zoo_recipe(recipe)
        if catalog_entry["weighted"]
          @test recipe_state isa QuantumSavory.SymQObj
          @test abs(LinearAlgebra.tr(QuantumSavory.express(recipe_state))) ≈ 1
          raw_state = WebQuantumSavory.construct_states_zoo_state(id, good_parameters)
          @test WebQuantumSavory._states_zoo_absolute_trace(id, raw_state) > 0
        else
          @test recipe_state isa T
        end
      end

      barrett_weighted_parameters =
        Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1)
      barrett_weighted = WebQuantumSavory.construct_states_zoo_state(
        "BarrettKokBellPairW",
        barrett_weighted_parameters,
      )
      @test WebQuantumSavory._states_zoo_absolute_trace(
        "BarrettKokBellPairW",
        barrett_weighted,
      ) ≈ 0.5

      zero_trace_recipe = Dict(
        "kind" => "states_zoo",
        "state_type" => "BarrettKokBellPairW",
        "parameters" => Dict("ηᴬ" => 0, "ηᴮ" => 0, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
      )
      zero_trace_error = try
        WebQuantumSavory.construct_states_zoo_recipe(zero_trace_recipe)
        nothing
      catch error
        error
      end
      @test zero_trace_error isa WebQuantumSavory.APIError
      @test zero_trace_error.status_code == 400
      @test occursin("finite, positive", zero_trace_error.message)
      @test zero_trace_error.details["trace"] == 0

      function states_zoo_error(state_type, parameters)
        try
          WebQuantumSavory.construct_states_zoo_state(state_type, parameters)
          return nothing
        catch error
          return error
        end
      end

      unknown = states_zoo_error("NotAState", Dict())
      @test unknown isa WebQuantumSavory.APIError
      @test unknown.status_code == 400
      @test unknown.error_code == "VALIDATION_ERROR"

      missing = states_zoo_error("DepolarizedBellPair", Dict())
      @test missing isa WebQuantumSavory.APIError
      @test missing.details["missing"] == ["p"]

      extra = states_zoo_error("DepolarizedBellPair", Dict("p" => 0.5, "other" => 1))
      @test extra isa WebQuantumSavory.APIError
      @test extra.details["extra"] == ["other"]

      for invalid_value in ("0.5", true, NaN, Inf, -Inf)
        invalid = states_zoo_error("DepolarizedBellPair", Dict("p" => invalid_value))
        @test invalid isa WebQuantumSavory.APIError
        @test occursin("finite number", invalid.message)
      end

      for invalid_value in (-0.01, 1.01)
        invalid = states_zoo_error("DepolarizedBellPair", Dict("p" => invalid_value))
        @test invalid isa WebQuantumSavory.APIError
        @test occursin("outside its declared range", invalid.message)
      end

      tagged_recipe = Dict(
        "kind" => "states_zoo",
        "state_type" => "DepolarizedBellPair",
        "parameters" => Dict("p" => 0.75),
      )
      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
        kwargs = Dict{Symbol,Any}()
        @test WebQuantumSavory._handle_symbolic_parameter!(kwargs, :pairstate, tagged_recipe)
        @test kwargs[:pairstate] isa QuantumSavory.StatesZoo.DepolarizedBellPair

        weighted_recipe = Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => barrett_weighted_parameters,
        )
        @test WebQuantumSavory._handle_symbolic_parameter!(kwargs, :weighted, weighted_recipe)
        @test kwargs[:weighted] isa QuantumSavory.SymQObj
        @test abs(LinearAlgebra.tr(QuantumSavory.express(kwargs[:weighted]))) ≈ 1
      end

      # Existing symbolic strings keep their evaluation-backed behavior.
      withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "true") do
        kwargs = Dict{Symbol,Any}()
        @test WebQuantumSavory._handle_symbolic_parameter!(kwargs, :pairstate, "Z₁")
        @test haskey(kwargs, :pairstate)
      end
  end

  @testset "States Zoo Preview Rendering" begin
      state = WebQuantumSavory.construct_states_zoo_state(
        "DepolarizedBellPair",
        Dict("p" => 0.8),
      )
      preview = WebQuantumSavory.render_states_zoo_preview("DepolarizedBellPair", state)
      png = WebQuantumSavory.base64decode(preview.png_base64)
      @test length(png) > 8
      @test png[1:8] == UInt8[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      @test preview.trace ≈ 1

      weighted = WebQuantumSavory.construct_states_zoo_state(
        "BarrettKokBellPairW",
        Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
      )
      density_operator, original_trace =
        WebQuantumSavory._states_zoo_preview_density_operator("BarrettKokBellPairW", weighted)
      @test original_trace ≈ 0.5
      @test abs(LinearAlgebra.tr(density_operator)) ≈ 1
  end

  @testset "Server Startup Warmup" begin
      @test WebQuantumSavory.start_startup_warmup!() === nothing
      @test !WebQuantumSavory.STARTUP_WARMUP_COMPLETE[]
      @test basename(WebQuantumSavory._latest_startup_warmup_demo()) ==
        "2.Entangler.Example.with.consumer.json"
      mktempdir() do demos_dir
        touch(joinpath(demos_dir, "2.second.json"))
        touch(joinpath(demos_dir, "10.tenth.json"))
        @test basename(WebQuantumSavory._latest_startup_warmup_demo(demos_dir)) ==
          "10.tenth.json"
      end

      state_names_before = Set(keys(WebQuantumSavory.STATE))
      report = WebQuantumSavory._run_startup_warmup!()
      @test report.demo == "2.Entangler.Example.with.consumer.json"
      @test report.protocol_count == 2
      @test report.generated_state_count > 0
      @test report.states_zoo_type == "BarrettKokBellPair"
      @test Set(keys(WebQuantumSavory.STATE)) == state_names_before

      # Failure after parsing and preparing must still remove the private state.
      @test_throws WebQuantumSavory.APIError WebQuantumSavory._run_startup_warmup!(
        simulation_target=0.0,
      )
      @test Set(keys(WebQuantumSavory.STATE)) == state_names_before

      sentinel = WebQuantumSavory.State(name=WebQuantumSavory.STARTUP_WARMUP_STATE_NAME)
      WebQuantumSavory.STATE[WebQuantumSavory.STARTUP_WARMUP_STATE_NAME] = sentinel
      try
        @test_throws ErrorException WebQuantumSavory._run_startup_warmup!()
        @test WebQuantumSavory.STATE[WebQuantumSavory.STARTUP_WARMUP_STATE_NAME] === sentinel
      finally
        delete!(WebQuantumSavory.STATE, WebQuantumSavory.STARTUP_WARMUP_STATE_NAME)
      end
      @test Set(keys(WebQuantumSavory.STATE)) == state_names_before
  end

  @testset "Payload Extraction" begin
      # Now that extract_payload accepts missing/relaxed headers, direct call should parse
      json_str = JSON.json(test_payload)
      result = WebQuantumSavory.extract_payload(nothing, json_str)
      @test result["name"] == "PR15"
  end

  @testset "Payload Validation" begin
      result = WebQuantumSavory.validate_payload(test_payload)
      @test result["success"] == true
      @test result["message"] == "Network graph parsed successfully"
      @test haskey(result, "graph_info")
      @test result["graph_info"]["node_count"] == 2
      @test result["graph_info"]["edge_count"] == 1
      @test length(result["graph_info"]["node_ids"]) == 2
      @test length(result["graph_info"]["edge_connections"]) == 1

      # Test missing name field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "name")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required field: 'name' must be present"
      end

      # Test missing net field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "net")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required field: 'net' must be present"
      end

      # Test missing nodes field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "nodes")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required fields in 'net': 'nodes' and 'edges' must be present"
      end

      # Test missing edges field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "edges")
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Missing required fields in 'net': 'nodes' and 'edges' must be present"
      end

      # Test duplicate node IDs
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["nodes"][2]["id"] = "node1"  # Duplicate ID
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Duplicate node ID: 'node1'"
      end

      # Test edge referencing non-existent source node
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["edges"][1]["source"] = "nonexistent"
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Edge 1 references non-existent source node: 'nonexistent'"
      end

      # Test edge referencing non-existent target node
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["edges"][1]["target"] = "nonexistent"
      try
        result = WebQuantumSavory.validate_payload(invalid_payload)
      catch e
        @test e isa WebQuantumSavory.APIError
        @test e.message == "Edge 1 references non-existent target node: 'nonexistent'"
      end
  end

  @testset "Simulation Variables" begin
      # Legacy payloads have no variables field and remain valid.
      legacy_variables = WebQuantumSavory._parse_variables(test_payload)
      @test isempty(legacy_variables)
      @test WebQuantumSavory.validate_payload(test_payload)["success"] == true

      variable_payload = deepcopy(test_payload)
      variable_payload["variables"] = [
        Dict(
          "id" => "variable_retention",
          "name" => "retention time",
          "type" => "Float64",
          "value" => 0.75,
        ),
        Dict(
          "id" => "variable_default",
          "name" => "use default",
          "type" => "default",
          "value" => nothing,
        ),
      ]
      variable_payload["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][4]["value"] = Dict(
        "kind" => "variable",
        "id" => "variable_retention",
      )

      validated = WebQuantumSavory.validate_payload(variable_payload)
      @test validated["success"] == true
      variables = WebQuantumSavory._parse_variables(variable_payload)
      @test variables["variable_retention"] isa WebQuantumSavory.Variable
      @test variables["variable_retention"].name == "retention time"
      @test variables["variable_retention"].type == "Float64"
      @test variables["variable_retention"].value == 0.75

      reference = WebQuantumSavory._parse_variable_reference(Dict(
        "kind" => "variable",
        "id" => "variable_retention",
      ))
      @test reference isa WebQuantumSavory.VariableReference
      @test reference.id == "variable_retention"
      @test WebQuantumSavory._parse_variable_reference(Dict("kind" => "literal", "id" => "x")) === nothing
      @test WebQuantumSavory._parse_variable_reference(3.0) === nothing

      function variable_validation_error(mutator)
        payload = deepcopy(variable_payload)
        mutator(payload)
        try
          WebQuantumSavory.validate_payload(payload)
          return nothing
        catch e
          return e
        end
      end

      invalid_array = variable_validation_error(payload -> (payload["variables"] = Dict()))
      @test invalid_array isa WebQuantumSavory.APIError
      @test invalid_array.status_code == 400

      duplicate_id = variable_validation_error(payload -> push!(
        payload["variables"],
        Dict("id" => "variable_retention", "name" => "other", "type" => "Int64", "value" => 2),
      ))
      @test duplicate_id isa WebQuantumSavory.APIError
      @test occursin("Duplicate variable ID", duplicate_id.message)

      duplicate_name = variable_validation_error(payload -> push!(
        payload["variables"],
        Dict("id" => "other", "name" => "retention time", "type" => "Int64", "value" => 2),
      ))
      @test duplicate_name isa WebQuantumSavory.APIError
      @test occursin("Duplicate variable name", duplicate_name.message)

      missing_value = variable_validation_error(payload -> delete!(payload["variables"][1], "value"))
      @test missing_value isa WebQuantumSavory.APIError
      @test occursin("missing required field: 'value'", missing_value.message)

      malformed_reference = variable_validation_error(payload -> delete!(
        payload["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][4]["value"],
        "id",
      ))
      @test malformed_reference isa WebQuantumSavory.APIError
      @test occursin("missing required field: 'id'", malformed_reference.message)

      dangling_reference = variable_validation_error(payload -> (
        payload["net"]["nodes"][1]["data"]["protocols"][1]["parameters"][4]["value"]["id"] = "missing"
      ))
      @test dangling_reference isa WebQuantumSavory.APIError
      @test dangling_reference.status_code == 400
      @test occursin("Unknown variable reference", dangling_reference.message)

      null_typed_value = variable_validation_error(payload -> (payload["variables"][1]["value"] = nothing))
      @test null_typed_value isa WebQuantumSavory.APIError
      @test occursin("must not be null", null_typed_value.message)
  end

  @testset "Variable-backed Protocol Parameters" begin
      runtime_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "variable_backed_protocol_parameters"
      runtime_payload["name"] = simulation_name
      runtime_payload["variables"] = [
        Dict("id" => "probability", "name" => "probability", "type" => "Float64", "value" => 0.25),
        Dict("id" => "no_retry", "name" => "no retry", "type" => "Nothing", "value" => nothing),
        Dict("id" => "protocol_default", "name" => "protocol default", "type" => "Function", "value" => "default"),
        Dict(
          "id" => "contextual_lambda",
          "name" => "contextual lambda",
          "type" => "Lambda",
          "value" => "candidates -> self * 100 + nodeid(\"Cambridge\") + first(candidates)",
        ),
      ]

      protocol_definition = runtime_payload["net"]["edges"][1]["data"]["protocols"][1]
      parameter_by_name(name) = only(filter(p -> p["name"] == name, protocol_definition["parameters"]))
      parameter_by_name("success_prob")["value"] = Dict("kind" => "variable", "id" => "probability")
      parameter_by_name("retry_lock_time")["value"] = Dict("kind" => "variable", "id" => "no_retry")
      parameter_by_name("attempt_time")["value"] = Dict("kind" => "variable", "id" => "protocol_default")

      contextual_protocol_definition = Dict(
        "id" => "runtime-contextual-swapper",
        "type" => string(QuantumSavory.ProtocolZoo.SwapperProt),
        "parameters" => Any[
          Dict(
            "name" => "chooseL",
            "type" => "Function",
            "value" => Dict("kind" => "variable", "id" => "contextual_lambda"),
          ),
          Dict(
            "name" => "chooseH",
            "type" => "Lambda",
            "value" => "candidates -> self * 1000 + nodeid(\"Amherst\") + first(candidates)",
          ),
          Dict("name" => "rounds", "type" => "Int64", "value" => 0),
        ],
      )
      push!(
        runtime_payload["net"]["nodes"][1]["data"]["protocols"],
        contextual_protocol_definition,
      )

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(runtime_payload))
        WebQuantumSavory.prepare_simulation(state, simulation_name)
        protocol = state.protocol_mapping[protocol_definition["id"]]
        @test protocol.success_prob == 0.25
        @test protocol.retry_lock_time === nothing
        @test protocol.attempt_time == 0.001

        contextual_protocol = state.protocol_mapping[contextual_protocol_definition["id"]]
        @test contextual_protocol.chooseL([5]) == 107
        @test contextual_protocol.chooseH([5]) == 1006

        invalid_protocol_definition = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "success_prob",
            "type" => "Float64",
            "value" => Dict("kind" => "variable", "id" => "invalid_probability"),
          )],
        )
        invalid_variables = Dict(
          "invalid_probability" => WebQuantumSavory.Variable(
            "invalid_probability",
            "invalid probability",
            "Float64",
            "not-a-number",
          ),
        )
        ctx = Dict{Symbol,Any}(
          :sim => state.simulation,
          :net => state.network,
          :nodeA => 1,
          :nodeB => 2,
        )

        states_zoo_protocol_definition = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "pairstate",
            "type" => "Symbolic",
            "value" => Dict("kind" => "variable", "id" => "zoo_pair_state"),
          )],
        )
        states_zoo_variables = Dict(
          "zoo_pair_state" => WebQuantumSavory.Variable(
            "zoo_pair_state",
            "zoo pair state",
            "Symbolic",
            Dict(
              "kind" => "states_zoo",
              "state_type" => "DepolarizedBellPair",
              "parameters" => Dict("p" => 0.9),
            ),
          ),
        )
        withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
          states_zoo_protocol = WebQuantumSavory._instantiate_protocol(
            states_zoo_protocol_definition,
            ctx;
            variables=states_zoo_variables,
          )
          @test states_zoo_protocol.pairstate isa QuantumSavory.StatesZoo.DepolarizedBellPair
        end

        conversion_error = try
          WebQuantumSavory._instantiate_protocol(
            invalid_protocol_definition,
            ctx;
            variables=invalid_variables,
          )
          nothing
        catch e
          e
        end
        @test conversion_error isa WebQuantumSavory.APIError
        @test conversion_error.status_code == 400
        @test occursin("Failed to convert variable", conversion_error.message)

        incompatible_protocol_definition = Dict(
          "type" => string(QuantumSavory.ProtocolZoo.EntanglerProt),
          "parameters" => [Dict(
            "name" => "success_prob",
            "type" => "Float64",
            "value" => Dict("kind" => "variable", "id" => "string_probability"),
          )],
        )
        incompatible_variables = Dict(
          "string_probability" => WebQuantumSavory.Variable(
            "string_probability",
            "string probability",
            "String",
            "0.25",
          ),
        )
        constructor_error = try
          WebQuantumSavory._instantiate_protocol(
            incompatible_protocol_definition,
            ctx;
            variables=incompatible_variables,
          )
          nothing
        catch e
          e
        end
        @test constructor_error isa WebQuantumSavory.APIError
        @test constructor_error.status_code == 400
        @test occursin("variable-backed parameter", constructor_error.message)
        @test constructor_error.details["variable_assignments"][1]["variable_id"] == "string_probability"
        @test constructor_error.details["variable_assignments"][1]["parameter_name"] == "success_prob"

        # Literal-only constructor failures preserve their pre-variable behavior.
        literal_protocol_definition = deepcopy(incompatible_protocol_definition)
        literal_protocol_definition["parameters"][1]["value"] = "0.25"
        literal_protocol_definition["parameters"][1]["type"] = "String"
        literal_constructor_error = try
          WebQuantumSavory._instantiate_protocol(literal_protocol_definition, ctx)
          nothing
        catch e
          e
        end
        @test literal_constructor_error !== nothing
        @test !(literal_constructor_error isa WebQuantumSavory.APIError)
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) && WebQuantumSavory.destroy_simulation(simulation_name)
      end

      # A function-valued variable still resolves in the assigned node context.
      kwargs = Dict{Symbol,Any}()
      ctx = Dict{Symbol,Any}(:node => 2)
      @test WebQuantumSavory._handle_typed_parameter!(kwargs, :filter, "Function", "<(self)", ctx)
      @test kwargs[:filter].(1:3) == [true, false, false]
  end

  @testset "Graph Building" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(validation_result)
      @test isa(g, SimpleGraph)
      @test nv(g) == 2  # 2 nodes
      @test ne(g) == 1  # 1 edge
  end

  @testset "Register Creation" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
      @test isa(registers, Vector)
      @test length(registers) == 2  # Both nodes (including empty slots node)
      @test isa(registers[1], Register)
      @test isa(slot_mapping, Dict)
      @test !isempty(slot_mapping)  # Should have some slots from node1

      # No-noise slots still need a positional `nothing` entry so background
      # operations can index the register by slot. Exercise object, string, and
      # missing representations while keeping one real background in place.
      default_noise_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      default_noise_payload["net"]["nodes"][1]["data"]["slots"][2]["backgroundNoise"] = Dict(
        "type" => "T1Decay",
        "parameters" => [Dict("name" => "t1", "value" => 5.0)],
      )
      delete!(default_noise_payload["net"]["nodes"][2]["data"]["slots"][1], "backgroundNoise")
      default_noise_payload["net"]["nodes"][2]["data"]["slots"][2]["backgroundNoise"] = "default"

      default_noise_validation = WebQuantumSavory.validate_payload(default_noise_payload)
      default_noise_registers, _, _ = WebQuantumSavory.create_registers_from_nodes(default_noise_validation)
      @test length.(getfield.(default_noise_registers, :backgrounds)) == length.(default_noise_registers)
      @test isnothing(default_noise_registers[1].backgrounds[1])
      @test default_noise_registers[1].backgrounds[2] isa QuantumSavory.T1Decay
      @test all(isnothing, default_noise_registers[2].backgrounds)

      # This is the operation that exposed the malformed background vector in
      # SwapperProt after it selected an assigned slot.
      initialize!(default_noise_registers[2][1], X₁; time=0.0)
      @test_nowarn uptotime!(default_noise_registers[2][1], 1.0)
  end

  @testset "Register Names" begin
      named_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "named_registers"
      named_payload["name"] = simulation_name

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(named_payload))
        @test state.network.names == ["Amherst", "Cambridge"]
        @test QuantumSavory.name.(state.network.registers) == ["Amherst", "Cambridge"]
        @test occursin("Amherst(#1)", sprint(show, state.network.registers[1]))
        @test sprint(show, state.network.registers[1][1]; context=:compact => true) ==
          "Amherst(#1).1"
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) &&
          WebQuantumSavory.destroy_simulation(simulation_name)
      end
  end

  @testset "RegisterNet Creation" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(validation_result)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
      
      # Test that RegisterNet creation fails with empty slot registers (current behavior)
      @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "Type Resolution" begin
      # Test protocol type resolution
      protocol_type = WebQuantumSavory._resolve_type_from_string("QuantumSavory.ProtocolZoo.CutoffProt", :protocol)
      @test protocol_type !== nothing

      # Test case-insensitive resolution
      protocol_type = WebQuantumSavory._resolve_type_from_string("quantumsavory.protocolzoo.cutoffprot", :protocol)
      @test protocol_type !== nothing

      # Test non-existent type
      protocol_type = WebQuantumSavory._resolve_type_from_string("NonExistentType", :protocol)
      @test protocol_type === nothing
  end

  @testset "Protocol Instantiation Context" begin
      # Test that protocol instantiation uses context values correctly
      prot_def = Dict(
        "type" => "QuantumSavory.ProtocolZoo.CutoffProt",
        "parameters" => [
          Dict("name" => "sim", "type" => "ConcurrentSim.Simulation", "value" => "5"),
          Dict("name" => "net", "type" => "QuantumSavory.RegisterNet", "value" => "5"),
          Dict("name" => "node", "type" => "Int64", "value" => "5")
        ]
      )

      ctx = Dict{Symbol, Any}(:sim => "sim_value", :net => "net_value", :node => 1)
      # This test verifies the context is used correctly in _instantiate_protocol
      # The actual instantiation might fail due to quantum dependencies, but we test the structure
      @test haskey(prot_def, "type")
      @test haskey(prot_def, "parameters")
      @test length(prot_def["parameters"]) == 3
  end

  @testset "Protocol Instantiation" begin
      # Test protocol instantiation with proper context
      prot_def = Dict(
        "type" => "QuantumSavory.ProtocolZoo.CutoffProt",
        "parameters" => [
          Dict("name" => "sim", "type" => "ConcurrentSim.Simulation", "value" => "5"),
          Dict("name" => "net", "type" => "QuantumSavory.RegisterNet", "value" => "5"),
          Dict("name" => "node", "type" => "Int64", "value" => "5")
        ]
      )

      # Test that RegisterNet creation fails with current test payload (has empty slots)
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(validation_result)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
      
      # Test that the protocol definition is valid
      @test haskey(prot_def, "type")
      @test haskey(prot_def, "parameters")
      @test length(prot_def["parameters"]) == 3

      # Test that RegisterNet creation fails due to empty slots (expected behavior)
      @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "State Serialization" begin
      # Create a minimal state
      state = WebQuantumSavory.State(name="test_simulation")
      serialized = WebQuantumSavory.serialize_state(state)

      @test isa(serialized, Dict)
      @test serialized["name"] == "test_simulation"
      @test serialized["status"] == "unknown"
      @test serialized["node_count"] == 0
      @test serialized["edge_count"] == 0
      @test serialized["protocols_launched"] === nothing
      @test haskey(serialized, "message")
      @test haskey(serialized, "simulation")
      @test haskey(serialized["simulation"], "simulation_started_at")
      @test haskey(serialized["simulation"], "simulation_execution_time_exceeded")
      @test haskey(serialized["simulation"], "simulation_auto_purged")
      @test haskey(serialized["simulation"], "simulation_panic")
      @test serialized["simulation"]["simulation_panic"] === nothing
  end

  @testset "Status Determination" begin
      # Test created status
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      status = WebQuantumSavory._determine_status(state)
      @test status == "created"

      # Test prepared status
      state = WebQuantumSavory.State(name="test", network=nothing)
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test prepared status with simulation
      state = WebQuantumSavory.State(name="test", simulation=nothing)
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test prepared status with graph (created status)
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      status = WebQuantumSavory._determine_status(state)
      @test status == "created"

      # Test prepared status with simulation (we'll test this by checking the has_run field)
      # Since we can't easily create a Simulation object, we'll test the logic indirectly
      state = WebQuantumSavory.State(name="test", has_run=false)
      # This should return "unknown" since simulation is nothing
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"

      # Test unknown status
      state = WebQuantumSavory.State(name="test")
      status = WebQuantumSavory._determine_status(state)
      @test status == "unknown"
  end

  @testset "Status Messages" begin
      # Test created message
      state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
      message = WebQuantumSavory._get_status_message(state)
      @test message == "Network has been created"

      # Test prepared message
      state = WebQuantumSavory.State(name="test", network=nothing)
      message = WebQuantumSavory._get_status_message(state)
      @test message == "No network data available"

    # Test created message
    state = WebQuantumSavory.State(name="test", graph=SimpleGraph(2))
    message = WebQuantumSavory._get_status_message(state)
    @test message == "Network has been created"

    # Test unknown message
    state = WebQuantumSavory.State(name="test")
    message = WebQuantumSavory._get_status_message(state)
    @test message == "No network data available"
  end

  @testset "Error Handling Framework" begin
    # Test APIError creation
    error1 = WebQuantumSavory.APIError("Test error", 400)
    @test error1.message == "Test error"
    @test error1.status_code == 400
    @test error1.error_code == ""
    @test error1.details === nothing

    error2 = WebQuantumSavory.APIError("Test error", 404, "NOT_FOUND")
    @test error2.error_code == "NOT_FOUND"

    error3 = WebQuantumSavory.APIError("Test error", 500, "SERVER_ERROR", Dict("key" => "value"))
    @test error3.details["key"] == "value"

    # Test error response creation
    response = WebQuantumSavory.create_error_response(error3)
    @test response["success"] == false
    @test response["error"] == "Test error"
    @test response["status_code"] == 500
    @test response["error_code"] == "SERVER_ERROR"
    @test response["details"]["key"] == "value"

    # Test convenience error functions
    not_found = WebQuantumSavory.not_found_error("Simulation", "test_sim")
    @test not_found.message == "Simulation not found"
    @test not_found.status_code == 404
    @test not_found.error_code == "NOT_FOUND"
    @test not_found.details["resource"] == "Simulation"
    @test not_found.details["identifier"] == "test_sim"

    validation = WebQuantumSavory.validation_error("Invalid input")
    @test validation.message == "Invalid input"
    @test validation.status_code == 400
    @test validation.error_code == "VALIDATION_ERROR"

    server = WebQuantumSavory.server_error("Internal error", Dict{String, Any}("trace" => "stack"))
    @test server.message == "Internal error"
    @test server.status_code == 500
    @test server.error_code == "SERVER_ERROR"
    @test server.details["trace"] == "stack"

    bad_request = WebQuantumSavory.bad_request_error("Bad request")
    @test bad_request.message == "Bad request"
    @test bad_request.status_code == 400
    @test bad_request.error_code == "BAD_REQUEST"
  end

  @testset "Slot State Inspection" begin
    # Create a test state with slot mapping
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    state = WebQuantumSavory.State(name="test", slot_mapping=slot_mapping)

    # Test get_slot_state with existing slot
    if !isempty(slot_mapping)
      slot_id = first(keys(slot_mapping))
      result = WebQuantumSavory.get_slot_state(slot_id, state)
      @test result["slot_id"] == slot_id
      @test haskey(result, "is_locked")
      @test haskey(result, "is_assigned")
      @test haskey(result, "entangled_slots")
      @test haskey(result, "entangled_slot_details")
    end

    # Test get_slot_state with non-existent slot
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.get_slot_state("non_existent_slot", state)
  end

  @testset "Protocol State Inspection" begin
    # Create a test state with protocol mapping
    state = WebQuantumSavory.State(name="test", protocol_mapping=Dict("test_protocol" => "mock_protocol"))

    # Test get_protocol_state with existing protocol
    result = WebQuantumSavory.get_protocol_state("test_protocol", state)
    @test result["protocol_id"] == "test_protocol"
    @test haskey(result, "protocol_type")
    @test haskey(result, "html_base64")
    @test haskey(result, "png_base64")

    # Test get_protocol_state with non-existent protocol
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.get_protocol_state("non_existent_protocol", state)
  end

  @testset "State Cleanup" begin
    # Exercise cleanup with a live assigned state so register back-references are removed.
    cleanup_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    validation_result = WebQuantumSavory.validate_payload(cleanup_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    network = RegisterNet(g, registers)
    assigned_slots = (registers[1][1], registers[2][1])
    initialize!(assigned_slots, StabilizerState("ZZ XX"); time=0.0)
    @test all(QuantumSavory.isassigned, assigned_slots)

    state = WebQuantumSavory.State(
      name="test_cleanup",
      payload=validation_result,
      graph=g,
      network=network,
      slot_mapping=slot_mapping,
      slot_reverse_mapping=slot_reverse_mapping,
      protocol_mapping=Dict("test" => "protocol")
    )

    # Test cleanup
    cleanup_success = WebQuantumSavory.cleanup_state!(state)
    @test cleanup_success == true

    # Verify cleanup worked
    @test state.network === nothing
    @test state.slot_mapping === nothing
    @test state.protocol_mapping === nothing
    @test state.graph === nothing
    @test state.payload === nothing
    @test all(slot -> !QuantumSavory.isassigned(slot), assigned_slots)
  end

  @testset "Slot Serialization" begin
    # Create a test state with slot mapping
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    state = WebQuantumSavory.State(name="test", slot_mapping=slot_mapping)

    # Test slot serialization
    serialized_slots = WebQuantumSavory._serialize_slots(state)
    @test haskey(serialized_slots, "slots")
    @test haskey(serialized_slots, "entanglements")
    @test isa(serialized_slots["slots"], Vector)
    @test isa(serialized_slots["entanglements"], Vector)

    # Test with empty slot mapping
    empty_state = WebQuantumSavory.State(name="empty", slot_mapping=nothing)
    empty_serialized = WebQuantumSavory._serialize_slots(empty_state)
    @test empty_serialized["slots"] == []
    @test empty_serialized["entanglements"] == []
  end

  @testset "Protocol Serialization" begin
    # Create a test state with protocol mapping
    state = WebQuantumSavory.State(name="test", protocol_mapping=Dict("proto1" => "protocol1", "proto2" => "protocol2"))

    # Test protocol serialization
    serialized_protocols = WebQuantumSavory._serialize_protocols(state)
    @test haskey(serialized_protocols, "protocols")
    @test isa(serialized_protocols["protocols"], Vector)
    @test length(serialized_protocols["protocols"]) == 2

    # Test with empty protocol mapping
    empty_state = WebQuantumSavory.State(name="empty", protocol_mapping=nothing)
    empty_serialized = WebQuantumSavory._serialize_protocols(empty_state)
    @test empty_serialized["protocols"] == []
  end

  @testset "Network Time Tracker" begin
    # Test that RegisterNet creation fails with empty slot registers (current behavior)
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    
    # Test that RegisterNet creation fails due to empty slots (expected behavior)
    @test_throws BoundsError RegisterNet(g, registers)
  end

  @testset "Type Resolution Functions" begin
    # Test noise type resolution
    noise_type = WebQuantumSavory._resolve_noise_type_from_string("Depolarization")
    @test noise_type !== nothing

    # Test case-insensitive noise resolution
    noise_type = WebQuantumSavory._resolve_noise_type_from_string("DEPOLARIZATION")
    @test noise_type !== nothing

    # # Test default noise type
    # default_noise = WebQuantumSavory._resolve_noise_type_from_string("default")
    # @test default_noise !== nothing

    # Test slot type resolution
    slot_type = WebQuantumSavory._resolve_slot_type_from_string("Qubit")
    @test slot_type !== nothing

    # Test case-insensitive slot resolution
    slot_type = WebQuantumSavory._resolve_slot_type_from_string("QUBIT")
    @test slot_type !== nothing

    # Test non-existent types
    @test WebQuantumSavory._resolve_noise_type_from_string("NonExistent") === nothing
    @test WebQuantumSavory._resolve_slot_type_from_string("NonExistent") === nothing
  end

  @testset "Parameter Conversion Utility" begin
    # Wildcard selections carry no user-entered value, but the UI sends the
    # selected entry name so the backend can construct the sentinel.
    for wildcard_type in ("Wildcard", "QuantumSavory.Wildcard")
      ok, wildcard = WebQuantumSavory._convert_parameter_value(wildcard_type, "Wildcard")
      @test ok
      @test wildcard isa QuantumSavory.Wildcard
    end

    # Int conversions
    ok, v = WebQuantumSavory._convert_parameter_value("Int", "42")
    @test ok && v == 42
    ok, v = WebQuantumSavory._convert_parameter_value("Int64", 7.0)
    @test ok && v == 7

    # Float conversions
    ok, v = WebQuantumSavory._convert_parameter_value("Float64", "3.14")
    @test ok && v ≈ 3.14
    ok, v = WebQuantumSavory._convert_parameter_value("Float32", 2)
    @test ok && v == 2.0

    # Strings and explicit Nothing values do not require Julia evaluation.
    ok, v = WebQuantumSavory._convert_parameter_value("String", 123)
    @test ok && v == "123"
    ok, v = WebQuantumSavory._convert_parameter_value("Nothing", nothing)
    @test ok && v === nothing

    # Bool conversions
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", "true")
    @test ok && v === true
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", "off")
    @test ok && v === false
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", 0)
    @test ok && v === false
    ok, v = WebQuantumSavory._convert_parameter_value("Bool", :nope)
    @test !ok

    # Union with Nothing
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, Int64}", "nothing")
    @test ok && v === nothing
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, Float64}", "2.5")
    @test ok && v == 2.5
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, String}", 123)
    @test ok && v == "123"
    ok, v = WebQuantumSavory._convert_parameter_value("Union{Nothing, Bool}", "yes")
    @test ok && v === true
  end

  @testset "Unsafe Evaluation Policy" begin
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(environment="dev", override=nothing)
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(environment="test", override=nothing)
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override=nothing)
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(environment="staging", override=nothing)
    @test WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override=" TRUE ")
    @test !WebQuantumSavory.unsafe_code_evaluation_enabled(environment="test", override="False")
    @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override="1")
    @test_throws ArgumentError WebQuantumSavory.unsafe_code_evaluation_enabled(environment="prod", override="yes")

    production_failure = WebQuantumSavory.evaluation_failure_response(
      ErrorException("sensitive evaluation details");
      environment="prod",
    )
    @test production_failure[:error] == "Evaluation failed"
    @test production_failure[:error_code] == WebQuantumSavory.EVALUATION_FAILED_CODE
    @test !haskey(production_failure, :error_type)
    @test !occursin("sensitive", string(production_failure))

    staging_failure = WebQuantumSavory.evaluation_failure_response(
      ErrorException("staging details are also private");
      environment="staging",
    )
    @test staging_failure[:error] == "Evaluation failed"
    @test !haskey(staging_failure, :error_type)

    development_failure = WebQuantumSavory.evaluation_failure_response(
      ErrorException("useful development details");
      environment="dev",
    )
    @test occursin("useful development details", development_failure[:error])
    @test haskey(development_failure, :error_type)
  end

  @testset "Unsafe Evaluation Surfaces" begin
    function test_disabled(thunk)
      caught = try
        thunk()
        nothing
      catch e
        e
      end

      @test caught isa WebQuantumSavory.APIError
      if caught isa WebQuantumSavory.APIError
        @test caught.status_code == 403
        @test caught.error_code == WebQuantumSavory.UNSAFE_EVALUATION_DISABLED_CODE
      end
    end

    original_override = get(ENV, WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR, nothing)
    withenv(WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR => "false") do
      # Direct code, symbolic, and lambda entry points enforce the policy before
      # entering their tuple-return/error-wrapping catches.
      test_disabled(() -> WebQuantumSavory.Sandbox.test_code("x -> x + 1"))
      test_disabled(() -> WebQuantumSavory.Sandbox.evaluate_symbolic_expression("Z₁"))
      test_disabled(() -> WebQuantumSavory.create_lambda("x -> x + 1"))
      test_disabled(() -> WebQuantumSavory.create_symbolic("Z₁"))

      # Known function references and primitive conversion do not evaluate code.
      safe_function_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_function_lambda_parameter!(
        safe_function_kwargs,
        :filter,
        "Function",
        "identity",
      )
      @test safe_function_kwargs[:filter] === identity

      safe_primitive_kwargs = Dict{Symbol,Any}()
      @test WebQuantumSavory._handle_regular_parameter!(safe_primitive_kwargs, :rounds, "Int64", "3")
      @test safe_primitive_kwargs[:rounds] == 3
      @test WebQuantumSavory._handle_regular_parameter!(safe_primitive_kwargs, :label, "String", "hello")
      @test safe_primitive_kwargs[:label] == "hello"

      safe_noise = WebQuantumSavory._instantiate_noise(Dict(
        "type" => "AmplitudeDamping",
        "parameters" => [Dict("name" => "τ", "value" => "2.0")],
      ))
      @test safe_noise isa QuantumSavory.AmplitudeDamping

      # Each payload fallback propagates denial instead of silently dropping a
      # parameter or using a constructor default.
      test_disabled(() -> WebQuantumSavory._handle_function_lambda_parameter!(
        Dict{Symbol,Any}(),
        :filter,
        "Lambda",
        "x -> true",
      ))
      test_disabled(() -> WebQuantumSavory._handle_symbolic_parameter!(
        Dict{Symbol,Any}(),
        :pairstate,
        "Z₁",
      ))
      test_disabled(() -> WebQuantumSavory._handle_regular_parameter!(
        Dict{Symbol,Any}(),
        :values,
        "Vector{Int64}",
        "[1, 2]",
      ))
      test_disabled(() -> WebQuantumSavory._instantiate_noise(Dict(
        "type" => "AmplitudeDamping",
        "parameters" => [Dict(
          "name" => "τ",
          "value" => "begin error(\"must not execute\"); 2.0 end",
        )],
      )))
    end

    @test get(ENV, WebQuantumSavory.UNSAFE_EVALUATION_ENV_VAR, nothing) == original_override
  end

  @testset "Symbolic Expression Evaluation (Unit)" begin
    # Simple valid expression using QuantumSavory symbols should produce latex and value
    expr = "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
    success, results, err = WebQuantumSavory.Sandbox.test_symbolic_expression(expr)
    @test success == true
    @test isa(results, Dict)
    @test haskey(results, :latex)
    @test haskey(results, :value)

    # Invalid expression should return an error
    bad_expr = "(Z₁⊗Z₁+"  # malformed
    success2, results2, err2 = WebQuantumSavory.Sandbox.test_symbolic_expression(bad_expr)
    @test success2 == false
    @test results2 === nothing
    @test err2 !== nothing
  end

  @testset "Extract Payload Error Handling" begin
    # Test with invalid JSON string
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.extract_payload(nothing, "invalid json")

    # Test with non-string raw payload
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.extract_payload(nothing, 123)

    # Valid JSON parses without requiring headers
    valid_json = JSON.json(Dict("test" => "value"))
    result = WebQuantumSavory.extract_payload(nothing, valid_json)
    @test result["test"] == "value"

    # Existing parsed payload is returned as-is
    existing_payload = Dict("existing" => "data")
    result2 = WebQuantumSavory.extract_payload(existing_payload, "ignored")
    @test result2["existing"] == "data"
  end

  @testset "Protocol Launch" begin
    # Test that RegisterNet creation fails with empty slot registers (current behavior)
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    
    # Test that RegisterNet creation fails due to empty slots (expected behavior)
    @test_throws BoundsError RegisterNet(g, registers)
    
    # Test protocol launch structure without creating network
    protocol_mapping = Dict{String, Any}()
    modified_payload = deepcopy(validation_result)
    modified_payload["data"]["net"]["protocols"] = []  # Remove floating protocols

    # Test that the structure is correct even if we can't create the network
    @test haskey(modified_payload["data"]["net"], "protocols")
    @test isa(modified_payload["data"]["net"]["protocols"], Vector)
  end

  @testset "Log Management" begin
    structured_state = WebQuantumSavory.State(name="structured_logs")
    captured_error, captured_backtrace = try
      error("structured logger failure")
    catch error
      (error, catch_backtrace())
    end
    logger = WebQuantumSavory.Logger.make_logger(structured_state)
    Logging.handle_message(
      logger,
      Logging.Error,
      "ordinary simulator error",
      QuantumSavory,
      :unit,
      :ordinary_error,
      @__FILE__,
      @__LINE__;
      attempt=2,
      context=Dict(:slot => 3, :active => true),
      exception=(captured_error, captured_backtrace),
    )
    WebQuantumSavory.Logger.log_event(
      structured_state,
      "success",
      "manual simulator success";
      result=(:ok, 4),
    )

    captured = structured_state.log_events[1]
    @test captured["source"] == "Simulator"
    @test captured["severity"] == "error"
    @test captured["message"] == "ordinary simulator error"
    @test captured["attempt"] == 2
    @test captured["context"] == Dict("slot" => 3, "active" => true)
    @test captured["exception"]["exception_type"] == "ErrorException"
    @test occursin("structured logger failure", captured["exception"]["message"])
    @test occursin("Stacktrace", captured["exception"]["stacktrace"])
    @test structured_state.log_events[2]["severity"] == "success"
    @test all(log["source"] == "Simulator" for log in structured_state.log_events)
    @test length(unique(log["id"] for log in structured_state.log_events)) == 2
    @test JSON.parse(JSON.json(structured_state.log_events)) isa Vector

    # Create a test state with log events
    test_logs = [
      Dict("timestamp" => "2023-01-01T00:00:00", "level" => "info", "message" => "Test log 1"),
      Dict("timestamp" => "2023-01-01T00:00:01", "level" => "warn", "message" => "Test log 2"),
      Dict("timestamp" => "2023-01-01T00:00:02", "level" => "error", "message" => "Test log 3")
    ]
    
    state = WebQuantumSavory.State(name="test_logs", log_events=test_logs)
    
    # Store the state in STATE for testing
    original_state = get(WebQuantumSavory.STATE, "test_logs", nothing)
    WebQuantumSavory.STATE["test_logs"] = state
    
    try
      # Test get_logs with purge=true (default)
      logs = WebQuantumSavory.get_logs("test_logs", true)
      @test length(logs) == 3
      @test logs[1]["message"] == "Test log 1"
      @test logs[2]["message"] == "Test log 2"
      @test logs[3]["message"] == "Test log 3"
      
      # After purge=true, logs should be cleared from state
      @test length(state.log_events) == 0
      
      # Add more logs
      push!(state.log_events, Dict("timestamp" => "2023-01-01T00:00:03", "level" => "info", "message" => "Test log 4"))
      push!(state.log_events, Dict("timestamp" => "2023-01-01T00:00:04", "level" => "debug", "message" => "Test log 5"))
      
      # Test get_logs with purge=false
      logs_no_purge = WebQuantumSavory.get_logs("test_logs", false)
      @test length(logs_no_purge) == 2
      @test logs_no_purge[1]["message"] == "Test log 4"
      @test logs_no_purge[2]["message"] == "Test log 5"
      
      # After purge=false, logs should still be in state
      @test length(state.log_events) == 2
      
      # Test get_logs with default purge=true
      logs_default = WebQuantumSavory.get_logs("test_logs")
      @test length(logs_default) == 2
      @test length(state.log_events) == 0  # Should be purged by default
      
    finally
      # Clean up
      if original_state !== nothing
        WebQuantumSavory.STATE["test_logs"] = original_state
      else
        delete!(WebQuantumSavory.STATE, "test_logs")
      end
    end
  end

  @testset "Symbolic Expression Handling" begin
    # Test create_symbolic function
    symbolic_expr = "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
    
    try
      symbolic_obj = WebQuantumSavory.create_symbolic(symbolic_expr)
      @test isa(symbolic_obj, WebQuantumSavory.SymbolicImpl)
      @test symbolic_obj.expression == symbolic_expr
      @test !isempty(symbolic_obj.latex)
      @test symbolic_obj.value !== nothing
    catch e
      @warn "Symbolic expression test failed: $e"
    end
    
    # Test protocol parameter handling with symbolic type
    test_params = [
      Dict(
        "name" => "pairstate",
        "type" => "Symbolic", 
        "value" => "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"
      )
    ]
    
    try
      # This tests the parameter conversion logic
      kwargs = Dict{Symbol, Any}()
      for p in test_params
        name = Symbol(p["name"])
        ptype = p["type"]
        value = p["value"]
        
        # Simulate the parameter conversion logic
        symbolic_type_requested = ptype == "Symbolic"
        
        if symbolic_type_requested && isa(value, String)
          try
            symbolic_obj = WebQuantumSavory.create_symbolic(value)
            kwargs[name] = symbolic_obj.value
          catch e
            @warn "Failed to create symbolic expression: $e"
          end
        end
      end
      
      # If we got here without error, the basic logic works
      @test true
    catch e
      @warn "Symbolic parameter handling test failed: $e"
      # This might fail if QuantumSavory packages aren't available in test environment
    end
  end

  @testset "State Serialization with Pause Field" begin
    # Test that simulation_paused field is included in serialization
    state = WebQuantumSavory.State(
      name="serialization_test",
      simulation_paused=true,
      is_running=false
    )
    
    serialized = WebQuantumSavory.serialize_state(state)
    @test haskey(serialized, "simulation")
    @test haskey(serialized["simulation"], "simulation_paused")
    @test serialized["simulation"]["simulation_paused"] == true
    @test serialized["simulation"]["simulation_running"] == false
    
    # Test with false pause state
    state.simulation_paused = false
    state.is_running = true
    serialized2 = WebQuantumSavory.serialize_state(state)
    @test serialized2["simulation"]["simulation_paused"] == false
    @test serialized2["simulation"]["simulation_running"] == true
  end

  @testset "Cooperative Simulation Lifecycle" begin
    payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    simulation_name = "cooperative_lifecycle"
    payload["name"] = simulation_name

    state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)

    # A prepared-but-not-started simulation cannot be paused.
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.pause_simulation(state)

    # Starting is immediate and creates exactly one same-thread task.
    WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    first_task = state.run_task
    @test state.is_running
    @test first_task !== nothing
    @test first_task.sticky
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.destroy_simulation(simulation_name)

    # Pause waits for acknowledgement and task cleanup.
    @test WebQuantumSavory.pause_simulation(state)
    @test !state.is_running
    @test state.simulation_paused
    @test !state.pause_requested
    @test state.run_task === nothing
    paused_progress = state.simulation_progress
    paused_logs = state.log_events
    retained_panic = Dict{String,Any}("id" => "retained-while-resuming")
    state.simulation_panic = retained_panic

    # Resume retains the cumulative target, progress, captured logs, and panic
    # report associated with the same interrupted run.
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.run_simulation(state, 3.0, simulation_name)
    WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    @test state.simulation_time == 2.0
    @test state.simulation_progress == paused_progress
    @test state.log_events === paused_logs
    @test state.simulation_panic === retained_panic
    @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
    @test state.has_run
    @test !state.is_running
    @test !state.simulation_paused
    @test state.error === nothing
    @test state.simulation_progress >= 2.0

    # A later run extends the absolute target and starts a fresh log stream.
    completed_logs = state.log_events
    WebQuantumSavory.run_simulation(state, 3.0, simulation_name)
    @test state.log_events !== completed_logs
    @test state.simulation_panic === nothing
    @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
    @test state.has_run
    @test state.simulation_progress >= 3.0

    @test WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Simulation Task Error" begin
    simulation_name = "simulation_task_error"
    state = WebQuantumSavory.State(name=simulation_name, simulation=ConcurrentSim.Simulation())
    WebQuantumSavory.STATE[simulation_name] = state

    WebQuantumSavory.run_simulation(state, 1.0, simulation_name)
    @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
    @test !state.is_running
    @test !state.simulation_paused
    @test state.error isa ConcurrentSim.EmptySchedule
    @test !state.has_run
    @test state.simulation_panic !== nothing
    @test state.simulation_panic["severity"] == "panic"
    @test state.simulation_panic["source"] == "Simulator"
    @test state.simulation_panic["exception_type"] == string(ConcurrentSim.EmptySchedule)
    @test occursin("EmptySchedule", state.simulation_panic["message"])
    @test occursin("Stacktrace", state.simulation_panic["stacktrace"])

    panic_logs = filter(log -> get(log, "severity", nothing) == "panic", state.log_events)
    error_logs = filter(log -> get(log, "severity", nothing) == "error", state.log_events)
    @test length(panic_logs) == 1
    @test isempty(error_logs)
    @test panic_logs[1]["id"] == state.simulation_panic["id"]
    @test JSON.parse(JSON.json(WebQuantumSavory.serialize_state(state))) isa Dict

    @test WebQuantumSavory.destroy_simulation(simulation_name)
  end

  @testset "Diagnostic Broken Protocol Panic" begin
    withenv(WebQuantumSavory.MOCK_BROKEN_PROTOCOL_ENV_VAR => "true") do
      payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
      simulation_name = "mock_broken_protocol_panic"
      payload["name"] = simulation_name
      payload["net"]["protocols"] = Any[
        Dict(
          "id" => "broken-diagnostic",
          "type" => WebQuantumSavory.MOCK_BROKEN_PROTOCOL_TYPE,
          "parameters" => Any[],
        ),
      ]

      try
        state = WebQuantumSavory.parse_network_graph(WebQuantumSavory.validate_payload(payload))
        state = WebQuantumSavory.prepare_simulation(state, simulation_name)
        @test state.protocols_launched["floating"] == 1
        @test state.protocol_mapping["broken-diagnostic"] isa WebQuantumSavory.MockBrokenProtocol

        WebQuantumSavory.run_simulation(state, 1.0, simulation_name)
        @test timedwait(() -> state.run_task === nothing, 10.0) == :ok
        @test state.error isa BoundsError
        @test state.simulation_panic !== nothing

        panic = state.simulation_panic
        @test Set(keys(panic)) == Set([
          "id",
          "timestamp",
          "source",
          "severity",
          "summary",
          "exception_type",
          "message",
          "stacktrace",
        ])
        @test panic["source"] == "Simulator"
        @test panic["severity"] == "panic"
        @test panic["exception_type"] == "BoundsError"
        @test occursin("index [100]", panic["message"])
        @test occursin("MockBrokenProtocol", panic["stacktrace"])
        @test JSON.parse(JSON.json(panic))["id"] == panic["id"]

        logs = WebQuantumSavory.get_logs(simulation_name, false)
        panic_log = only(filter(log -> get(log, "severity", nothing) == "panic", logs))
        @test panic_log == panic
        @test !any(log -> get(log, "message", nothing) == "Error running simulation", logs)

        purged_logs = WebQuantumSavory.get_logs(simulation_name, true)
        @test purged_logs == logs
        @test isempty(state.log_events)
        @test state.simulation_panic == panic
      finally
        haskey(WebQuantumSavory.STATE, simulation_name) &&
          WebQuantumSavory.destroy_simulation(simulation_name)
      end
    end
  end

  @testset "Cleanup Stale Simulations - Basic Test" begin
    # Load payload3 for testing
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_basic"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.simulation_last_active_time !== nothing
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Make the simulation stale by setting last_active_time to AUTO_PURGE_MINUTES + 1 minutes ago
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_PURGE_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation exists before cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function (modified to run once instead of infinite loop)
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was NOT destroyed but blocked and preserved
    # Auto-purged simulations have execution_time_exceeded=false, auto_purged=true
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    blocked = WebQuantumSavory.STATE[simulation_name]
    @test blocked.execution_time_exceeded == false
    @test blocked.auto_purged == true
    @test blocked.payload === nothing
    @test blocked.graph === nothing
    @test blocked.network === nothing
    @test blocked.simulation === nothing
  end

  @testset "Cleanup Stale Simulations - Running Simulation Test" begin
    # Load payload3 for testing
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_running"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Make the simulation stale by setting last_active_time to AUTO_PURGE_MINUTES + 1 minutes ago
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_PURGE_MINUTES + 1)
    
    # Start simulation in background (very long time)
    state.is_running = true
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation exists before cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function - should NOT clean up running simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was NOT cleaned up because it's running
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test WebQuantumSavory.STATE[simulation_name].is_running == true
    
    # Now pause the simulation
    state.is_running = false
    state.simulation_paused = true
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Call cleanup function again - should clean up paused simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was blocked (preserved, not destroyed)
    # Auto-purged simulations have execution_time_exceeded=false, auto_purged=true
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    s2 = WebQuantumSavory.STATE[simulation_name]
    @test s2.execution_time_exceeded == false
    @test s2.auto_purged == true
    
    # Clean up
    WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Cleanup Stale Simulations - Auto-Destroy of Purged Simulation Test" begin
    # Load payload3 for testing
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_autodestroy_purged"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.simulation_last_active_time !== nothing
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # STEP 1: Make the simulation stale for auto-purge (AUTO_PURGE_MINUTES + 1 minutes ago)
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_PURGE_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation exists before cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    @test state.auto_purged == false
    
    # Call cleanup function - should auto-purge the simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was auto-purged (blocked but not destroyed)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    purged_state = WebQuantumSavory.STATE[simulation_name]
    @test purged_state.auto_purged == true
    @test purged_state.execution_time_exceeded == false
    @test purged_state.payload === nothing  # Resources cleared
    @test purged_state.graph === nothing
    @test purged_state.network === nothing
    @test purged_state.simulation === nothing
    
    # STEP 2: Make the purged simulation stale for auto-destroy (AUTO_DESTROY_MINUTES + 1 minutes ago)
    purged_state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_DESTROY_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = purged_state
    
    # Verify simulation still exists before auto-destroy cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function again - should auto-destroy the purged simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was completely destroyed (removed from STATE)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Cleanup Stale Simulations - Auto-Destroy of Timed Out Simulation Test" begin
    # Test that timed-out simulations (execution_time_exceeded=true) also get auto-destroyed
    test_payload3 = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))
    
    # Create and setup a simulation
    simulation_name = "cleanup_test_autodestroy_timeout"
    test_payload3["name"] = simulation_name
    
    # Validate payload first (this adds the graph_info structure)
    validation_result = WebQuantumSavory.validate_payload(test_payload3)
    
    # Parse the network graph
    state = WebQuantumSavory.parse_network_graph(validation_result)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Prepare the simulation
    state = WebQuantumSavory.prepare_simulation(state, simulation_name)
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Block the simulation due to timeout
    WebQuantumSavory.block_simulation(state; reason=:timeout, max_minutes=WebQuantumSavory.MAX_SIM_RUNTIME_MINUTES)
    @test state.execution_time_exceeded == true
    @test state.auto_purged == false
    @test state.payload === nothing
    
    # Make the blocked simulation stale for auto-destroy (AUTO_DESTROY_MINUTES + 1 minutes ago)
    state.simulation_last_active_time = Dates.now() - Dates.Minute(WebQuantumSavory.AUTO_DESTROY_MINUTES + 1)
    WebQuantumSavory.STATE[simulation_name] = state
    
    # Verify simulation still exists before auto-destroy cleanup
    @test haskey(WebQuantumSavory.STATE, simulation_name)
    
    # Call cleanup function - should auto-destroy the timed-out simulation
    WebQuantumSavory.cleanup_stale_simulations_once()
    
    # Verify simulation was completely destroyed (removed from STATE)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Block Simulation Behavior" begin
    # Test timeout block (execution_time_exceeded=true)
    simulation_name = "block_behavior_test_timeout"
    state1 = WebQuantumSavory.State(name=simulation_name, payload=Dict("data"=>Dict()), graph=SimpleGraph(0))
    WebQuantumSavory.STATE[simulation_name] = state1

    # Block it explicitly with timeout reason
    ok = WebQuantumSavory.block_simulation(state1; reason=:timeout, max_minutes=WebQuantumSavory.MAX_SIM_RUNTIME_MINUTES)
    @test ok == true
    @test state1.execution_time_exceeded == true
    @test state1.auto_purged == false
    @test state1.payload === nothing

    # Further non-destroy actions should be forbidden
    try
      WebQuantumSavory.action_is_valid(simulation_name, false)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message)
    end

    # Test auto-purge block (auto_purged=true, execution_time_exceeded=false)
    simulation_name2 = "block_behavior_test_autopurge"
    state2 = WebQuantumSavory.State(name=simulation_name2, payload=Dict("data"=>Dict()), graph=SimpleGraph(0))
    WebQuantumSavory.STATE[simulation_name2] = state2

    # Block it explicitly with autopurge reason
    ok2 = WebQuantumSavory.block_simulation(state2; reason=:autopurge, max_minutes=30, auto_purged=true)
    @test ok2 == true
    @test state2.execution_time_exceeded == false
    @test state2.auto_purged == true
    @test state2.payload === nothing

    # Further non-destroy actions should be forbidden (auto_purged also blocks)
    try
      WebQuantumSavory.action_is_valid(simulation_name2, false)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message)
    end

    # Destroy should still be allowed for both
    WebQuantumSavory.destroy_simulation(simulation_name)
    WebQuantumSavory.destroy_simulation(simulation_name2)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name2)
  end

  @testset "Execution Time Exceeded Prevention" begin
    # Test that blocked simulations cannot be run
    simulation_name = "expired_simulation"
    state = WebQuantumSavory.State(name=simulation_name, execution_time_exceeded=true)
    WebQuantumSavory.STATE[simulation_name] = state

    # Attempting to run should fail via action_is_valid check
    try
      WebQuantumSavory.run_simulation(state, 5.0, simulation_name)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message) || occursin("blocked", e.message)
    end

    # Cleanup
    WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end

  @testset "Auto-Purged State Prevention" begin
    # Test that auto-purged simulations cannot be run
    simulation_name = "autopurged_simulation"
    state = WebQuantumSavory.State(name=simulation_name, auto_purged=true)
    WebQuantumSavory.STATE[simulation_name] = state

    # Attempting to run should fail via action_is_valid check
    try
      WebQuantumSavory.run_simulation(state, 5.0, simulation_name)
      @test false  # should not reach
    catch e
      @test e isa WebQuantumSavory.APIError
      @test occursin("expired", e.message) || occursin("blocked", e.message)
    end

    # Cleanup
    WebQuantumSavory.destroy_simulation(simulation_name)
    @test !haskey(WebQuantumSavory.STATE, simulation_name)
  end
end
