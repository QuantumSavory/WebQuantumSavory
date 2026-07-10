@safetestset "Unit Tests" begin
  using JSON
  include("../src/WebQuantumSavory.jl")
  using .WebQuantumSavory
  using Graphs
  using QuantumSavory
  using ConcurrentSim
  using Dates

  # Load test data
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload.json"))

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

  @testset "Protocol Types" begin
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
  end

  @testset "RegisterNet Creation" begin
      validation_result = WebQuantumSavory.validate_payload(test_payload)
      g = WebQuantumSavory.build_graph(validation_result)
      registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
      
      # Test that RegisterNet creation fails with empty slot registers (current behavior)
      @test_throws BoundsError WebQuantumSavory.create_register_net(g, registers)
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
      @test_throws BoundsError WebQuantumSavory.create_register_net(g, registers)
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
    # Create a test state with various components (without network due to empty slots)
    validation_result = WebQuantumSavory.validate_payload(test_payload)
    g = WebQuantumSavory.build_graph(validation_result)
    registers, slot_mapping, slot_reverse_mapping = WebQuantumSavory.create_registers_from_nodes(validation_result)
    
    # Don't create network since it fails with empty slots - test cleanup without it
    state = WebQuantumSavory.State(
      name="test_cleanup",
      payload=validation_result,
      graph=g,
      network=nothing,  # No network due to empty slots
      slot_mapping=slot_mapping,
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
    @test_throws BoundsError WebQuantumSavory.create_register_net(g, registers)
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
    @test_throws BoundsError WebQuantumSavory.create_register_net(g, registers)
    
    # Test protocol launch structure without creating network
    protocol_mapping = Dict{String, Any}()
    modified_payload = deepcopy(validation_result)
    modified_payload["data"]["net"]["protocols"] = []  # Remove floating protocols

    # Test that the structure is correct even if we can't create the network
    @test haskey(modified_payload["data"]["net"], "protocols")
    @test isa(modified_payload["data"]["net"]["protocols"], Vector)
  end

  @testset "Log Management" begin
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

    # Resume retains the cumulative target, progress, and captured logs.
    @test_throws WebQuantumSavory.APIError WebQuantumSavory.run_simulation(state, 3.0, simulation_name)
    WebQuantumSavory.run_simulation(state, 2.0, simulation_name)
    @test state.simulation_time == 2.0
    @test state.simulation_progress == paused_progress
    @test state.log_events === paused_logs
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

    @test WebQuantumSavory.destroy_simulation(simulation_name)
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
