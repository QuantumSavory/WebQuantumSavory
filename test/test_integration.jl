@safetestset "Integration Tests" begin
  using HTTP
  using JSON
  using QuantumSavory
  using Test

  include("../src/WebQuantumSavory.jl")
  using .WebQuantumSavory

  # Test server configuration
  TEST_BASE_URL = "http://localhost:8000"
  TEST_SIMULATION_NAME = "test_integration_sim"

  # Check if server is available
  function is_server_available()
    try
      # Avoid exceptions on non-200 and rely on status code
      response = HTTP.get("$TEST_BASE_URL/status"; status_exception=false)
      return response.status == 200
    catch
      return false
    end
  end

  # Fail fast if server is not available
  if !is_server_available()
    @error "Server not available at $TEST_BASE_URL. Integration tests require a running server."
    @test false
    return
  end

  # Load test data - use payload3.json
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload3.json"))

  # Helper function to make HTTP requests
  function make_request(method, endpoint; body=nothing, query=nothing)
    url = "$TEST_BASE_URL$endpoint"
    headers = ["Content-Type" => "application/json"]

    if method == "GET"
      if query !== nothing
        query_str = HTTP.escapeuri(query)
        url = "$url?$query_str"
      end
      response = HTTP.get(url, headers; status_exception=false)
    elseif method == "POST"
      if body !== nothing
        response = HTTP.post(url, headers, JSON.json(body); status_exception=false)
      else
        response = HTTP.post(url, headers; status_exception=false)
      end
    end

    return response
  end

  # Helper function to parse JSON response
  function parse_response(response)
    try
      return JSON.parse(String(response.body))
    catch e
      return Dict("error" => "Failed to parse response", "status" => response.status, "parse_error" => string(e))
    end
  end

  function wait_for_state(predicate, simulation_name; timeout=15.0, poll_interval=0.05)
    deadline = time() + timeout
    last_state = nothing

    while time() < deadline
      response = make_request("GET", "/get_state", query=Dict("name" => simulation_name))
      if response.status == 200
        data = parse_response(response)
        last_state = data["state"]
        predicate(last_state) && return last_state
      end
      sleep(poll_interval)
    end

    error("Timed out waiting for simulation $simulation_name; last state: $last_state")
  end

  platform_info_response = make_request("GET", "/platform_info")
  platform_info = parse_response(platform_info_response)
  unsafe_evaluation_enabled = get(
    get(platform_info, "capabilities", Dict{String,Any}()),
    "unsafe_code_evaluation",
    false,
  )

  @testset "Server Status" begin
      response = make_request("GET", "/status")
      @test response.status == 200
      data = parse_response(response)
      @test data["status"] == "OK"
  end

  @testset "Root Endpoint" begin
      response = make_request("GET", "/")
      @test response.status == 200
      body = String(response.body)
      # Root now serves the app UI (public/index.html). Check for HTML markers.
      @test contains(lowercase(body), "<!doctype") || contains(lowercase(body), "<html") || contains(lowercase(body), "<head")
  end

  @testset "Platform Info" begin
      @test platform_info_response.status == 200
      @test haskey(platform_info, "versions")
      @test haskey(platform_info, "capabilities")
      @test unsafe_evaluation_enabled isa Bool
  end

  @testset "Background Types Endpoint" begin
      response = make_request("GET", "/background_types")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "background_types")
      @test isa(data["background_types"], Vector)
      @test !isempty(data["background_types"])
      @test all(haskey(bt, "type") for bt in data["background_types"])
      @test all(haskey(bt, "doc") for bt in data["background_types"])
      @test all(haskey(bt, "parameters") for bt in data["background_types"])
  end

  @testset "Slot Types Endpoint" begin
      response = make_request("GET", "/slot_types")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "slot_types")
      @test isa(data["slot_types"], Vector)
      @test !isempty(data["slot_types"])
      @test all(haskey(st, "type") for st in data["slot_types"])
      @test all(haskey(st, "doc") for st in data["slot_types"])
  end

  @testset "Known Functions Endpoint" begin
      response = make_request("GET", "/known_functions")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "known_functions")
      @test data["known_functions"] == WebQuantumSavory.known_functions()
  end

  @testset "Export Script Endpoint" begin
      export_payload = Dict(
        "name" => "Integration Export",
        "variables" => Any[],
        "simulationConfig" => Dict("time" => 1.5, "timeStep" => 0.25),
        "net" => Dict(
          "nodes" => [
            Dict(
              "id" => "left-node",
              "name" => "Left",
              "position" => [0.0, 0.0],
              "data" => Dict(
                "slots" => [Dict("id" => "left-slot", "type" => "Qubit", "backgroundNoise" => nothing)],
                "protocols" => Any[],
              ),
            ),
            Dict(
              "id" => "right-node",
              "name" => "Right",
              "position" => [1.0, 1.0],
              "data" => Dict(
                "slots" => [Dict("id" => "right-slot", "type" => "Qubit", "backgroundNoise" => nothing)],
                "protocols" => Any[],
              ),
            ),
          ],
          "edges" => [
            Dict(
              "id" => "connection",
              "source" => "left-node",
              "target" => "right-node",
              "data" => Dict("protocols" => Any[]),
            ),
          ],
          "protocols" => Any[],
        ),
      )

      response = make_request("POST", "/export_script"; body=export_payload)
      @test response.status == 200
      data = parse_response(response)
      @test data["success"] == true
      @test data["filename"] == "integration-export.jl"
      @test occursin("simulation_duration = 1.5", data["script"])
      @test occursin("Graphs.add_edge!(graph, 1, 2)", data["script"])
      @test occursin("CairoMakie.record", data["script"])
      @test occursin("MIME\"image/png\"", data["script"])

      simulations_response = make_request("GET", "/simulations")
      simulations = parse_response(simulations_response)["simulations"]
      @test all(simulation["name"] != "Integration Export" for simulation in simulations)

      invalid_payload = deepcopy(export_payload)
      invalid_payload["simulationConfig"]["timeStep"] = 0
      invalid_response = make_request("POST", "/export_script"; body=invalid_payload)
      @test invalid_response.status == 400
      invalid_data = parse_response(invalid_response)
      @test invalid_data["success"] == false
      @test invalid_data["error_code"] == "VALIDATION_ERROR"
      @test occursin("positive finite", invalid_data["error"])
  end

  @testset "Protocol Types Endpoint" begin
      response = make_request("GET", "/protocol_types")
      @test response.status == 200
      data = parse_response(response)
      @test haskey(data, "protocol_types")
      @test isa(data["protocol_types"], Vector)
      @test !isempty(data["protocol_types"])
      @test all(haskey(pt, "type") for pt in data["protocol_types"])
      @test all(haskey(pt, "doc") for pt in data["protocol_types"])
      @test all(haskey(pt, "group") for pt in data["protocol_types"])
      @test all(haskey(pt, "parameters") for pt in data["protocol_types"])
      @test all(haskey(pt, "virtual") for pt in data["protocol_types"])
      @test all(pt["group"] in ["node", "edge", "floating"] for pt in data["protocol_types"])

      protocol_types_by_name = Dict(pt["type"] => pt for pt in data["protocol_types"])
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

  @testset "States Zoo Endpoints" begin
      types_response = make_request("GET", "/states_zoo_types")
      @test types_response.status == 200
      types_data = parse_response(types_response)
      @test haskey(types_data, "states_zoo_types")
      @test [entry["id"] for entry in types_data["states_zoo_types"]] == [
        "BarrettKokBellPair",
        "BarrettKokBellPairW",
        "DepolarizedBellPair",
        "GenqoMultiplexedCascadedBellPairW",
        "GenqoUnheraldedSPDCBellPairW",
      ]
      @test all(haskey(entry, "display_name") for entry in types_data["states_zoo_types"])
      @test [entry["display_name"] for entry in types_data["states_zoo_types"]] == [
        "Barrett-Kok Bell Pair",
        "Barrett-Kok Bell Pair (weighted)",
        "Depolarized Bell Pair",
        "Genqo Multiplexed Cascaded Bell Pair (weighted)",
        "Genqo Unheralded SPDC Bell Pair (weighted)",
      ]
      @test [entry["weighted"] for entry in types_data["states_zoo_types"]] ==
        [false, true, false, true, true]
      @test all(haskey(entry, "parameters") for entry in types_data["states_zoo_types"])

      depolarized = only(filter(
        entry -> entry["id"] == "DepolarizedBellPair",
        types_data["states_zoo_types"],
      ))
      @test depolarized["parameters"] == [Dict(
        "name" => "p",
        "min" => 0,
        "max" => 1,
        "good" => 1,
      )]

      preview_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict("p" => 0.8),
        ),
      )
      @test preview_response.status == 200
      preview_data = parse_response(preview_response)
      @test preview_data["success"] == true
      @test haskey(preview_data, "png_base64")
      @test preview_data["trace"] ≈ 1
      png = WebQuantumSavory.base64decode(preview_data["png_base64"])
      @test length(png) > 8
      @test png[1:8] == UInt8[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

      weighted_preview_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      )
      @test weighted_preview_response.status == 200
      weighted_preview_data = parse_response(weighted_preview_response)
      @test weighted_preview_data["trace"] ≈ 0.5

      zero_trace_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 0, "ηᴮ" => 0, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      )
      @test zero_trace_response.status == 400
      zero_trace_data = parse_response(zero_trace_response)
      @test zero_trace_data["error_code"] == "VALIDATION_ERROR"
      @test occursin("finite, positive", zero_trace_data["error"])

      unknown_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict("state_type" => "NotAState", "parameters" => Dict()),
      )
      @test unknown_response.status == 400
      unknown_data = parse_response(unknown_response)
      @test unknown_data["success"] == false
      @test unknown_data["error_code"] == "VALIDATION_ERROR"

      invalid_response = make_request(
        "POST",
        "/states_zoo_preview";
        body=Dict(
          "state_type" => "DepolarizedBellPair",
          "parameters" => Dict("p" => 2),
        ),
      )
      @test invalid_response.status == 400
      invalid_data = parse_response(invalid_response)
      @test invalid_data["success"] == false
      @test invalid_data["error_code"] == "VALIDATION_ERROR"
  end

  @testset "Parse Network Graph - Success" begin
      # Use the test payload from the mock file
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      response = make_request("POST", "/parse_network_graph", body=payload)

      @test response.status == 200
      data = parse_response(response)

      # Check response structure
      @test haskey(data, "name")
      @test haskey(data, "status")
      @test haskey(data, "node_count")
      @test haskey(data, "edge_count")
      @test haskey(data, "protocols_launched")
      @test haskey(data, "message")

      # Check values
      @test data["name"] == TEST_SIMULATION_NAME
      @test data["status"] == WebQuantumSavory.STATUS_CREATED
      @test data["node_count"] == 2
      @test data["edge_count"] == 1
      @test data["protocols_launched"] === nothing
      @test data["message"] == WebQuantumSavory.STATUS_MESSAGE_CREATED
  end

  @testset "States Zoo Variable Protocol Resolution" begin
      simulation_name = "states_zoo_variable_integration"
      payload = deepcopy(test_payload)
      payload["name"] = simulation_name
      payload["variables"] = [Dict(
        "id" => "zoo_pair_state",
        "name" => "zoo pair state",
        "type" => "Symbolic",
        "value" => Dict(
          "kind" => "states_zoo",
          "state_type" => "BarrettKokBellPairW",
          "parameters" => Dict("ηᴬ" => 1, "ηᴮ" => 1, "Pᵈ" => 0, "ηᵈ" => 1, "𝒱" => 1),
        ),
      )]

      entangler = payload["net"]["edges"][1]["data"]["protocols"][1]
      pairstate = only(filter(parameter -> parameter["name"] == "pairstate", entangler["parameters"]))
      pairstate["value"] = Dict("kind" => "variable", "id" => "zoo_pair_state")

      try
        create_response = make_request("POST", "/parse_network_graph"; body=payload)
        @test create_response.status == 200

        prepare_response = make_request(
          "POST",
          "/prepare_simulation";
          body=Dict("name" => simulation_name),
        )
        @test prepare_response.status == 200
        prepare_data = parse_response(prepare_response)
        @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED
      finally
        make_request("POST", "/destroy_simulation"; body=Dict("name" => simulation_name))
      end
  end

  @testset "Parse Network Graph - Validation Errors" begin
      # Test missing name field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "name")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Missing required field: 'name' must be present"

      # Test missing net field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload, "net")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Missing required field: 'net' must be present"

      # Test missing nodes field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "nodes")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Missing required fields in 'net': 'nodes' and 'edges' must be present"

      # Test missing edges field
      invalid_payload = deepcopy(test_payload)
      delete!(invalid_payload["net"], "edges")

      response = make_request("POST", "/parse_network_graph", body=invalid_payload)
      @test response.status == 400
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Missing required fields in 'net': 'nodes' and 'edges' must be present"
  end

  @testset "Prepare Simulation - Success" begin
            # First create a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Then prepare the simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => TEST_SIMULATION_NAME))
      @test prepare_response.status == 200

      data = parse_response(prepare_response)
      @test haskey(data, "name")
      @test haskey(data, "status")
      @test haskey(data, "node_count")
      @test haskey(data, "edge_count")
      @test haskey(data, "protocols_launched")
      @test haskey(data, "message")

      @test data["name"] == TEST_SIMULATION_NAME
      @test data["status"] == WebQuantumSavory.STATUS_PREPARED
      @test data["node_count"] == 2
      @test data["edge_count"] == 1
      @test data["protocols_launched"] !== nothing
      @test data["message"] == WebQuantumSavory.STATUS_MESSAGE_PREPARED
  end

  @testset "Prepare Simulation - Error Cases" begin
      # Test preparing non-existent simulation
      response = make_request("POST", "/prepare_simulation", body=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Simulation not found"
  end

  @testset "Run Simulation - Success" begin
            # First create and prepare a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => TEST_SIMULATION_NAME))
      @test prepare_response.status == 200

      # Then run the simulation
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => TEST_SIMULATION_NAME, "time_units" => 5))
      @test run_response.status == 202

      data = parse_response(run_response)
      @test data["success"] == true
      @test data["status"] == "started"
      @test data["state"]["simulation"]["simulation_running"] == true

      final_state = wait_for_state(TEST_SIMULATION_NAME, timeout=10.0) do state
        state["simulation"]["simulation_running"] == false
      end
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_progress"] >= 5
  end

  @testset "Run Simulation - Error Cases" begin
      # Test running non-existent simulation
      response = make_request("POST", "/run_simulation", body=Dict("name" => "nonexistent_sim", "time_units" => 5))
      @test response.status == 404
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Simulation not found"

            # Test running unprepared simulation
      payload = deepcopy(test_payload)
      payload["name"] = "unprepared_sim"

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      run_response = make_request("POST", "/run_simulation", body=Dict("name" => "unprepared_sim", "time_units" => 5))
      @test run_response.status == 400
      data = parse_response(run_response)
      @test data["success"] == false
      @test data["error"] == "Simulation not prepared"
  end

  @testset "Get State - Success" begin
            # First create a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Then get the state
      state_response = make_request("GET", "/get_state", query=Dict("name" => TEST_SIMULATION_NAME))
      @test state_response.status == 200

      data = parse_response(state_response)
      @test data["success"] == true
      @test haskey(data, "state")

      state = data["state"]
      @test haskey(state, "name")
      @test haskey(state, "status")
      @test haskey(state, "node_count")
      @test haskey(state, "edge_count")
      @test haskey(state, "protocols_launched")
      @test haskey(state, "message")

      @test state["name"] == TEST_SIMULATION_NAME
      @test state["status"] == WebQuantumSavory.STATUS_CREATED
      @test state["node_count"] == 2
      @test state["edge_count"] == 1
      @test state["protocols_launched"] === nothing
      @test state["message"] == WebQuantumSavory.STATUS_MESSAGE_CREATED
  end

  @testset "Get State - Error Cases" begin
      # Test getting non-existent simulation state
      response = make_request("GET", "/get_state", query=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Simulation not found"
      @test haskey(data, "details")
      @test data["details"]["resource"] == "Simulation"
      @test data["details"]["identifier"] == "nonexistent_sim"
  end

  @testset "Destroy Simulation - Success" begin
    # First create a network
      payload = deepcopy(test_payload)
      payload["name"] = TEST_SIMULATION_NAME

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Then destroy the simulation
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => TEST_SIMULATION_NAME))
      @test destroy_response.status == 200
      data = parse_response(destroy_response)
      @test data["success"] == true
      @test contains(data["message"], "Simulation destroyed")

      # Verify it's actually destroyed by trying to get its state
      state_response = make_request("GET", "/get_state", query=Dict("name" => TEST_SIMULATION_NAME))
      @test state_response.status == 404
      state_data = parse_response(state_response)
      @test state_data["success"] == false
      @test state_data["error"] == "Simulation not found"
  end

  @testset "Destroy Simulation - Error Cases" begin
      # Test destroying non-existent simulation
      response = make_request("POST", "/destroy_simulation", body=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Simulation not found"
  end

  @testset "Complete Workflow" begin
      workflow_name = "workflow_test_sim"

        # 1. Create network
      payload = deepcopy(test_payload)
      payload["name"] = workflow_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200
      create_data = parse_response(create_response)
      @test create_data["status"] == WebQuantumSavory.STATUS_CREATED

      # 2. Prepare simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => workflow_name))
      @test prepare_response.status == 200
      prepare_data = parse_response(prepare_response)
      @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED

      # 3. Run simulation
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_name, "time_units" => 10))
      @test run_response.status == 202
      run_data = parse_response(run_response)
      @test run_data["success"] == true

      # 4. Wait for the real run transition and get final state
      final_state = wait_for_state(workflow_name, timeout=10.0) do state
        state["simulation"]["simulation_running"] == false
      end
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_progress"] >= 10

      # 5. Clean up
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => workflow_name))
      @test destroy_response.status == 200
      destroy_data = parse_response(destroy_response)
      @test destroy_data["success"] == true

      # Verify cleanup
      verify_response = make_request("GET", "/get_state", query=Dict("name" => workflow_name))
      @test verify_response.status == 404
  end

  @testset "API Documentation" begin
      # Test that the Swagger docs endpoint is accessible
      response = make_request("GET", "/docs")
      @test response.status == 200
      # The response should contain HTML content
      body = String(response.body)
      @test contains(body, "html") || contains(body, "swagger") || contains(body, "api")
  end

  @testset "Test Code Endpoint" begin
      # The same contract supports default-enabled test servers and explicit
      # disabled-policy integration runs.
      accepted_sources = (
        "<(1)",
        "f(x) = x + 1",
        "f(x) = x + 1\nf\n# trailing comment",
      )
      for source in accepted_sources
        response = make_request(
          "POST",
          "/test_code",
          body=Dict("code" => source, "placement" => "node"),
        )
        data = parse_response(response)
        if unsafe_evaluation_enabled
          @test response.status == 200
          @test data["success"] == true
          @test haskey(data, "results")
        else
          @test response.status == 403
          @test data["success"] == false
          @test data["error"] == "Unsafe Julia code evaluation is disabled"
          @test data["error_code"] == "UNSAFE_EVALUATION_DISABLED"
        end
      end

      # Validation error (missing field)
      response2 = make_request("POST", "/test_code", body=Dict("wrong" => "x=1"))
      @test response2.status == 400
      data2 = parse_response(response2)
      @test data2["success"] == false
      @test occursin("Missing required field 'code'", data2["error"])

      invalid_placement_response = make_request(
        "POST",
        "/test_code",
        body=Dict("code" => "x -> x", "placement" => "invalid"),
      )
      @test invalid_placement_response.status == 400
      invalid_placement_data = parse_response(invalid_placement_response)
      @test invalid_placement_data["success"] == false
      @test occursin("Field 'placement'", invalid_placement_data["error"])

      if unsafe_evaluation_enabled
        for (source, placement, expected_success) in (
          ("<(self)", "node", true),
          ("==(nodeid(\"Amherst\"))", "edge", true),
          ("<(self)", "edge", false),
        )
          contextual_response = make_request(
            "POST",
            "/test_code",
            body=Dict("code" => source, "placement" => placement),
          )
          @test contextual_response.status == 200
          contextual_data = parse_response(contextual_response)
          @test contextual_data["success"] == expected_success
        end

        invalid_response = make_request(
          "POST",
          "/test_code",
          body=Dict("code" => "invalid("),
        )
        @test invalid_response.status == 200
        invalid_data = parse_response(invalid_response)
        @test invalid_data["success"] == false
        @test invalid_data["error_code"] == "EVALUATION_FAILED"
        @test startswith(invalid_data["error"], "ParseError:")
        @test occursin("Expected `)` or `,`", invalid_data["error"])
        @test !occursin("Base.Meta.ParseError(", invalid_data["error"])
      end
  end

  @testset "Test Symbolic Expression Endpoint" begin
      # Success when enabled; stable policy denial otherwise.
      response = make_request("POST", "/test_symbolic_expression", body=Dict("expr" => "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"))
      data = parse_response(response)
      if unsafe_evaluation_enabled
        @test response.status == 200
        @test data["success"] == true
        @test haskey(data, "results")
        @test haskey(data["results"], "latex")
        @test haskey(data["results"], "value")
      else
        @test response.status == 403
        @test data["success"] == false
        @test data["error"] == "Unsafe Julia code evaluation is disabled"
        @test data["error_code"] == "UNSAFE_EVALUATION_DISABLED"
      end

      # Validation error (missing field)
      response2 = make_request("POST", "/test_symbolic_expression", body=Dict("wrong" => "..."))
      @test response2.status == 400
      data2 = parse_response(response2)
      @test data2["success"] == false
      @test occursin("Missing required field 'expr'", data2["error"])

      if unsafe_evaluation_enabled
        # Execution error (bad expression)
        response3 = make_request("POST", "/test_symbolic_expression", body=Dict("expr" => "(Z₁⊗Z₁+"))
        @test response3.status == 400 || response3.status == 200  # server wraps as 400 via handler; allow either in case of internal mapping
        data3 = parse_response(response3)
        @test data3["success"] == false
        @test data3["error_code"] == "EVALUATION_FAILED"
      end
  end

  @testset "Logs Endpoint - Success" begin
      # First create a simulation to have logs
      logs_test_name = "logs_test_sim"
      payload = deepcopy(test_payload)
      payload["name"] = logs_test_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      # Test getting logs with default purge=true
      logs_response = make_request("GET", "/logs/$logs_test_name")
      @test logs_response.status == 200
      logs_data = parse_response(logs_response)
      @test logs_data["success"] == true
      @test haskey(logs_data, "logs")
      @test haskey(logs_data, "count")
      @test isa(logs_data["logs"], Vector)
      @test isa(logs_data["count"], Int)
      @test logs_data["count"] == length(logs_data["logs"])

      # Test getting logs with purge=false
      logs_response_no_purge = make_request("GET", "/logs/$logs_test_name", query=Dict("purge" => "false"))
      @test logs_response_no_purge.status == 200
      logs_data_no_purge = parse_response(logs_response_no_purge)
      @test logs_data_no_purge["success"] == true
      @test haskey(logs_data_no_purge, "logs")
      @test haskey(logs_data_no_purge, "count")

      # Test getting logs with purge=true explicitly
      logs_response_purge = make_request("GET", "/logs/$logs_test_name", query=Dict("purge" => "true"))
      @test logs_response_purge.status == 200
      logs_data_purge = parse_response(logs_response_purge)
      @test logs_data_purge["success"] == true
      @test haskey(logs_data_purge, "logs")
      @test haskey(logs_data_purge, "count")

      # Test various purge parameter values
      purge_values = ["1", "yes", "on", "0", "no", "off"]
      for purge_val in purge_values
          purge_response = make_request("GET", "/logs/$logs_test_name", query=Dict("purge" => purge_val))
          @test purge_response.status == 200
          purge_data = parse_response(purge_response)
          @test purge_data["success"] == true
      end

      # Clean up
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => logs_test_name))
      @test destroy_response.status == 200
  end

  @testset "Logs Endpoint - Error Cases" begin
      # Test getting logs for non-existent simulation
      response = make_request("GET", "/logs/nonexistent_sim")
      @test response.status == 404
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Simulation not found"
      @test haskey(data, "details")
      @test data["details"]["resource"] == "Simulation"
      @test data["details"]["identifier"] == "nonexistent_sim"
  end

  @testset "Pause Simulation - Success" begin
      # First create and prepare a simulation
      pause_test_name = "pause_test_sim"
      payload = deepcopy(test_payload)
      payload["name"] = pause_test_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => pause_test_name))
      @test prepare_response.status == 200

      # Start a long run and observe actual progress before pausing it.
      target_time = 1000
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => pause_test_name, "time_units" => target_time))
      @test run_response.status == 202

      running_state = wait_for_state(pause_test_name, timeout=10.0) do state
        state["simulation"]["simulation_running"] == true &&
          state["simulation"]["simulation_progress"] > 0
      end
      @test running_state["simulation"]["simulation_paused"] == false

      # A second run cannot overlap the active task.
      duplicate_response = make_request("POST", "/run_simulation", body=Dict("name" => pause_test_name, "time_units" => target_time))
      @test duplicate_response.status == 400
      @test occursin("running", parse_response(duplicate_response)["error"])

      # Pause the simulation
      pause_response = make_request("POST", "/pause_simulation", body=Dict("name" => pause_test_name))
      @test pause_response.status == 200
      pause_data = parse_response(pause_response)
      @test pause_data["success"] == true
      @test pause_data["message"] == "Simulation paused"
      @test pause_data["state"]["simulation"]["simulation_running"] == false
      @test pause_data["state"]["simulation"]["simulation_paused"] == true

      # The serialized state remains paused after acknowledgement.
      state_response2 = make_request("GET", "/get_state", query=Dict("name" => pause_test_name))
      @test state_response2.status == 200
      state_data2 = parse_response(state_response2)
      @test state_data2["success"] == true
      @test state_data2["state"]["simulation"]["simulation_paused"] == true
      @test state_data2["state"]["simulation"]["simulation_running"] == false

      duplicate_pause = make_request("POST", "/pause_simulation", body=Dict("name" => pause_test_name))
      @test duplicate_pause.status == 400

      # An acknowledged pause has no active task, so stop/destroy is race-free.
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => pause_test_name))
      @test destroy_response.status == 200
  end

  @testset "Pause Simulation - Error Cases" begin
      # Test pausing non-existent simulation
      response = make_request("POST", "/pause_simulation", body=Dict("name" => "nonexistent_sim"))
      @test response.status == 404
      data = parse_response(response)
      @test data["success"] == false
      @test data["error"] == "Simulation not found"

      # Test pausing unprepared simulation
      unprepared_name = "unprepared_pause_test"
      payload = deepcopy(test_payload)
      payload["name"] = unprepared_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200

      pause_response = make_request("POST", "/pause_simulation", body=Dict("name" => unprepared_name))
      @test pause_response.status == 400
      pause_data = parse_response(pause_response)
      @test pause_data["success"] == false
      @test occursin("not running", pause_data["error"])

      # Clean up the unprepared state.
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => unprepared_name))
      @test destroy_response.status == 200
  end

  @testset "Complete Workflow with Pause" begin
      workflow_pause_name = "workflow_pause_test_sim"

      # 1. Create network
      payload = deepcopy(test_payload)
      payload["name"] = workflow_pause_name

      create_response = make_request("POST", "/parse_network_graph", body=payload)
      @test create_response.status == 200
      create_data = parse_response(create_response)
      @test create_data["status"] == WebQuantumSavory.STATUS_CREATED

      # 2. Prepare simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => workflow_pause_name))
      @test prepare_response.status == 200
      prepare_data = parse_response(prepare_response)
      @test prepare_data["status"] == WebQuantumSavory.STATUS_PREPARED

      # 3. Start simulation
      # Keep the run long enough that the cooperative task cannot finish
      # between observing progress and sending the pause request.
      target_time = 1000
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_pause_name, "time_units" => target_time))
      @test run_response.status == 202
      run_data = parse_response(run_response)
      @test run_data["success"] == true

      # 4. Observe real execution before requesting a pause.
      running_state = wait_for_state(workflow_pause_name, timeout=10.0) do state
        state["simulation"]["simulation_running"] == true &&
          state["simulation"]["simulation_progress"] > 0
      end
      @test running_state["simulation"]["simulation_paused"] == false

      # 5. Pause simulation
      pause_response = make_request("POST", "/pause_simulation", body=Dict("name" => workflow_pause_name))
      @test pause_response.status == 200
      pause_data = parse_response(pause_response)
      @test pause_data["success"] == true

      # 6. Check paused state
      state_response2 = make_request("GET", "/get_state", query=Dict("name" => workflow_pause_name))
      @test state_response2.status == 200
      state_data2 = parse_response(state_response2)
      @test state_data2["success"] == true
      @test state_data2["state"]["simulation"]["simulation_paused"] == true
      @test state_data2["state"]["simulation"]["simulation_running"] == false
      paused_progress = state_data2["state"]["simulation"]["simulation_progress"]
      @test state_data2["state"]["simulation"]["simulation_time"] == target_time

      # 7. Resume to the same cumulative target and wait for completion.
      resume_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_pause_name, "time_units" => target_time))
      @test resume_response.status == 202

      final_state = wait_for_state(workflow_pause_name, timeout=15.0) do state
        state["simulation"]["simulation_running"] == false &&
          state["simulation"]["simulation_paused"] == false
      end
      @test final_state["simulation"]["simulation_error"] === nothing
      @test final_state["simulation"]["simulation_time"] == target_time
      @test final_state["simulation"]["simulation_progress"] >= target_time
      @test final_state["simulation"]["simulation_progress"] >= paused_progress

      # 8. Clean up
      destroy_response = make_request("POST", "/destroy_simulation", body=Dict("name" => workflow_pause_name))
      @test destroy_response.status == 200
      destroy_data = parse_response(destroy_response)
      @test destroy_data["success"] == true

      # Verify cleanup
      verify_response = make_request("GET", "/get_state", query=Dict("name" => workflow_pause_name))
      @test verify_response.status == 404
  end

  # Cleanup after all tests
  @testset "Final Cleanup" begin
      # Clean up any remaining test simulations
      test_names = [TEST_SIMULATION_NAME, "unprepared_sim", "workflow_test_sim", "logs_test_sim", "pause_test_sim", "unprepared_pause_test", "workflow_pause_test_sim"]

      for name in test_names
        try
          state_response = make_request("GET", "/get_state", query=Dict("name" => name))
          if state_response.status == 200
            state = parse_response(state_response)["state"]["simulation"]
            if state["simulation_running"]
              make_request("POST", "/pause_simulation", body=Dict("name" => name))
            end
          end
        catch
          # Best-effort cleanup after a failed test.
        end
        
        try
          make_request("POST", "/destroy_simulation", body=Dict("name" => name))
        catch
          # Ignore errors during cleanup
        end
      end

      true
  end

end
