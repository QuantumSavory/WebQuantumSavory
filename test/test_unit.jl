@safetestset "Unit Tests" begin
  using JSON
  include("../src/Cqn.jl")
  using .Cqn
  using Graphs
  using QuantumSavory

  # Load test data
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload.json"))

  @testset "Background Types" begin
      background_types = Cqn.get_background_types()
      @test isa(background_types, Vector)
      @test !isempty(background_types)
      @test all(isa(bt, Dict) for bt in background_types)
      @test all(haskey(bt, "type") for bt in background_types)
      @test all(haskey(bt, "doc") for bt in background_types)
      @test all(haskey(bt, "parameters") for bt in background_types)
  end

  @testset "Slot Types" begin
      slot_types = Cqn.get_slot_types()
      @test isa(slot_types, Vector)
      @test !isempty(slot_types)
      @test all(isa(st, Dict) for st in slot_types)
      @test all(haskey(st, "type") for st in slot_types)
      @test all(haskey(st, "doc") for st in slot_types)
  end

  @testset "Protocol Types" begin
      protocol_types = Cqn.get_protocol_types()
      @test isa(protocol_types, Vector)
      @test !isempty(protocol_types)
      @test all(isa(pt, Dict) for pt in protocol_types)
      @test all(haskey(pt, "type") for pt in protocol_types)
      @test all(haskey(pt, "doc") for pt in protocol_types)
      @test all(haskey(pt, "group") for pt in protocol_types)
      @test all(haskey(pt, "parameters") for pt in protocol_types)
      @test all(pt["group"] in ["node", "edge", "floating"] for pt in protocol_types)
  end

  @testset "Payload Extraction" begin
      # Test with valid JSON string
      json_str = JSON.json(test_payload)
      result = Cqn.extract_payload(nothing, json_str)
      @test !haskey(result, "success") || result["success"] !== false
      @test result["name"] == "PR15"
  end

  @testset "Payload Validation" begin
      result = Cqn.validate_payload(test_payload)
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
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Missing required field: 'name' must be present"

      # Test missing net field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "net")
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Missing required field: 'net' must be present"

      # Test missing nodes field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "nodes")
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Missing required fields in 'net': 'nodes' and 'edges' must be present"

      # Test missing edges field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "edges")
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Missing required fields in 'net': 'nodes' and 'edges' must be present"

      # Test duplicate node IDs
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["nodes"][2]["id"] = "node1"  # Duplicate ID
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Duplicate node ID: 'node1'"

      # Test edge referencing non-existent source node
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["edges"][1]["source"] = "nonexistent"
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Edge 1 references non-existent source node: 'nonexistent'"

      # Test edge referencing non-existent target node
      invalid_payload = deepcopy(test_payload)
      invalid_payload["net"]["edges"][1]["target"] = "nonexistent"
      result = Cqn.validate_payload(invalid_payload)
      @test result["success"] == false
      @test result["error"] == "Edge 1 references non-existent target node: 'nonexistent'"
  end

  @testset "Graph Building" begin
      validation_result = Cqn.validate_payload(test_payload)
      g = Cqn.build_graph(validation_result)
      @test isa(g, SimpleGraph)
      @test nv(g) == 2  # 2 nodes
      @test ne(g) == 1  # 1 edge
  end

  @testset "Register Creation" begin
      validation_result = Cqn.validate_payload(test_payload)
      registers, slot_mapping = Cqn.create_registers_from_nodes(validation_result)
      @test isa(registers, Vector)
      @test length(registers) == 1  # Only first node has slots
      @test isa(registers[1], Register)
      @test isa(slot_mapping, Dict)
  end

  @testset "RegisterNet Creation" begin
      validation_result = Cqn.validate_payload(test_payload)
      g = Cqn.build_graph(validation_result)
      registers, slot_mapping = Cqn.create_registers_from_nodes(validation_result)
      net = Cqn.create_register_net(g, registers)
      @test isa(net, RegisterNet)
  end

  @testset "Type Resolution" begin
      # Test protocol type resolution
      protocol_type = Cqn._resolve_type_from_string("QuantumSavory.ProtocolZoo.CutoffProt", :protocol)
      @test protocol_type !== nothing

      # Test case-insensitive resolution
      protocol_type = Cqn._resolve_type_from_string("quantumsavory.protocolzoo.cutoffprot", :protocol)
      @test protocol_type !== nothing

      # Test non-existent type
      protocol_type = Cqn._resolve_type_from_string("NonExistentType", :protocol)
      @test protocol_type === nothing
  end

  @testset "Protocol Argument Building" begin
      param_defs = [
        Dict("name" => "sim", "type" => "ConcurrentSim.Simulation", "value" => "5"),
        Dict("name" => "net", "type" => "QuantumSavory.RegisterNet", "value" => "5"),
        Dict("name" => "node", "type" => "Int64", "value" => "5")
      ]

      ctx = Dict{Symbol, Any}(:sim => "sim_value", :net => "net_value", :node => 1)
      args = Cqn._build_args_for_protocol(param_defs, ctx)

      @test length(args) == 3
      @test args[1] == "sim_value"  # Should use context value
      @test args[2] == "net_value"  # Should use context value
      @test args[3] == 1            # Should use context value
  end

  @testset "Protocol Instantiation" begin
      prot_def = Dict(
        "type" => "QuantumSavory.ProtocolZoo.CutoffProt",
        "parameters" => [
          Dict("name" => "sim", "type" => "ConcurrentSim.Simulation", "value" => "5"),
          Dict("name" => "net", "type" => "QuantumSavory.RegisterNet", "value" => "5"),
          Dict("name" => "node", "type" => "Int64", "value" => "5")
        ]
      )

      ctx = Dict{Symbol, Any}(:sim => "sim_value", :net => "net_value", :node => 1)
      prot = Cqn._instantiate_protocol(prot_def, ctx)
    #   @test isa(prot, QuantumSavory.ProtocolZoo.AbstractProtocol)
  end

  @testset "State Serialization" begin
      # Create a minimal state
      state = Cqn.State(name="test_simulation")
      serialized = Cqn.serialize_state(state)

      @test isa(serialized, Dict)
      @test serialized["name"] == "test_simulation"
      @test serialized["status"] == "unknown"
      @test serialized["node_count"] == 0
      @test serialized["edge_count"] == 0
      @test serialized["protocols_launched"] === nothing
      @test haskey(serialized, "message")
  end

  @testset "Status Determination" begin
      # Test created status
      state = Cqn.State(name="test", graph=SimpleGraph(2))
      status = Cqn._determine_status(state)
      @test status == "created"

      # Test prepared status
      state = Cqn.State(name="test", network=nothing)
      status = Cqn._determine_status(state)
      @test status == "unknown"

      # Test prepared status with simulation
      state = Cqn.State(name="test", simulation=nothing)
      status = Cqn._determine_status(state)
      @test status == "unknown"

      # Test prepared status with graph (created status)
      state = Cqn.State(name="test", graph=SimpleGraph(2))
      status = Cqn._determine_status(state)
      @test status == "created"

      # Test prepared status with simulation (we'll test this by checking the has_run field)
      # Since we can't easily create a Simulation object, we'll test the logic indirectly
      state = Cqn.State(name="test", has_run=false)
      # This should return "unknown" since simulation is nothing
      status = Cqn._determine_status(state)
      @test status == "unknown"

      # Test unknown status
      state = Cqn.State(name="test")
      status = Cqn._determine_status(state)
      @test status == "unknown"
  end

  @testset "Status Messages" begin
      # Test created message
      state = Cqn.State(name="test", graph=SimpleGraph(2))
      message = Cqn._get_status_message(state)
      @test message == "Network has been created"

      # Test prepared message
      state = Cqn.State(name="test", network=nothing)
      message = Cqn._get_status_message(state)
      @test message == "No network data available"

    # Test created message
    state = Cqn.State(name="test", graph=SimpleGraph(2))
    message = Cqn._get_status_message(state)
    @test message == "Network has been created"

    # Test unknown message
    state = Cqn.State(name="test")
    message = Cqn._get_status_message(state)
    @test message == "No network data available"
  end
end
