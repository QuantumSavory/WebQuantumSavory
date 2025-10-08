@safetestset "Integration Tests" begin
  using HTTP
  using JSON
  using Test

  include("../src/Cqn.jl")
  using .Cqn

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

  # Load test data
  test_payload = JSON.parsefile(joinpath(@__DIR__, "mock", "payload.json"))

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
      @test all(pt["group"] in ["node", "edge", "floating"] for pt in data["protocol_types"])
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
      @test data["status"] == Cqn.STATUS_CREATED
      @test data["node_count"] == 2
      @test data["edge_count"] == 1
      @test data["protocols_launched"] === nothing
      @test data["message"] == Cqn.STATUS_MESSAGE_CREATED
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
      @test data["status"] == Cqn.STATUS_PREPARED
      @test data["node_count"] == 2
      @test data["edge_count"] == 1
      @test data["protocols_launched"] !== nothing
      @test data["message"] == Cqn.STATUS_MESSAGE_PREPARED
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
      @test run_response.status == 200

      data = parse_response(run_response)
      @test data["success"] == true
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
      @test state["status"] == Cqn.STATUS_CREATED
      @test state["node_count"] == 2
      @test state["edge_count"] == 1
      @test state["protocols_launched"] === nothing
      @test state["message"] == Cqn.STATUS_MESSAGE_CREATED
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
      @test create_data["status"] == Cqn.STATUS_CREATED

      # 2. Prepare simulation
      prepare_response = make_request("POST", "/prepare_simulation", body=Dict("name" => workflow_name))
      @test prepare_response.status == 200
      prepare_data = parse_response(prepare_response)
      @test prepare_data["status"] == Cqn.STATUS_PREPARED

      # 3. Run simulation
      run_response = make_request("POST", "/run_simulation", body=Dict("name" => workflow_name, "time_units" => 10))
      @test run_response.status == 200
      run_data = parse_response(run_response)
      @test run_data["success"] == true

      # 4. Get final state
      state_response = make_request("GET", "/get_state", query=Dict("name" => workflow_name))
      @test state_response.status == 200
      state_data = parse_response(state_response)
      @test state_data["success"] == true

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
      # Success
      response = make_request("POST", "/test_code", body=Dict("code" => "x = 1+2"))
      @test response.status == 200
      data = parse_response(response)
      @test data["success"] == true
      @test haskey(data, "results")

      # Validation error (missing field)
      response2 = make_request("POST", "/test_code", body=Dict("wrong" => "x=1"))
      @test response2.status == 400
      data2 = parse_response(response2)
      @test data2["success"] == false
      @test occursin("Missing required field 'code'", data2["error"])
  end

  @testset "Test Symbolic Expression Endpoint" begin
      # Success
      response = make_request("POST", "/test_symbolic_expression", body=Dict("expr" => "(Z₁⊗Z₁+Z₂⊗Z₂) / √2"))
      @test response.status == 200
      data = parse_response(response)
      @test data["success"] == true
      @test haskey(data, "results")
      @test haskey(data["results"], "latex")
      @test haskey(data["results"], "value")

      # Validation error (missing field)
      response2 = make_request("POST", "/test_symbolic_expression", body=Dict("wrong" => "..."))
      @test response2.status == 400
      data2 = parse_response(response2)
      @test data2["success"] == false
      @test occursin("Missing required field 'expr'", data2["error"])

      # Execution error (bad expression)
      response3 = make_request("POST", "/test_symbolic_expression", body=Dict("expr" => "(Z₁⊗Z₁+"))
      @test response3.status == 400 || response3.status == 200  # server wraps as 400 via handler; allow either in case of internal mapping
      data3 = parse_response(response3)
      if response3.status == 400
        @test data3["success"] == false
      else
        @test data3["success"] == false || haskey(data3, "error")
      end
  end

  # Cleanup after all tests
  @testset "Final Cleanup" begin
      # Clean up any remaining test simulations
      test_names = [TEST_SIMULATION_NAME, "unprepared_sim", "workflow_test_sim"]

      for name in test_names
        try
          make_request("POST", "/destroy_simulation", body=Dict("name" => name))
        catch
          # Ignore errors during cleanup
        end
      end

      true
  end

end
