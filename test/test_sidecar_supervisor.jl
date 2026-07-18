const WQS = Main.WebQuantumSavory

mutable struct FakeSidecarProcess
  exitcode::Int
end

Base.wait(::FakeSidecarProcess) = nothing

mutable struct StartupExitProcess
  exitcode::Int
  exited::Bool
  exit_requested::Channel{Nothing}
end

function Base.wait(process::StartupExitProcess)
  take!(process.exit_requested)
  process.exited = true
  return nothing
end

const TEST_MCP_CONFIGURATION = WQS.MCPConfiguration(
  true,
  18_001,
  "127.0.0.1",
  8_000,
)

@testset "Sidecar diagnostics and capabilities do not expose secrets" begin
  supervisor = WQS.SidecarSupervisor()
  WQS._append_sidecar_diagnostic!(
    supervisor,
    "stderr",
    """
    {"message":"Processing message","raw_message":"raw-canary","request_body":"request-canary","session_id":"session-canary","password":"password-canary","safe":"retained"}
    """,
  )
  WQS._append_sidecar_diagnostic!(
    supervisor,
    "stderr",
    "authorization=Bearer authorization-canary",
  )
  WQS._append_sidecar_diagnostic!(
    supervisor,
    "stderr",
    repeat("🔒", WQS.SIDECAR_DIAGNOSTIC_BYTE_LIMIT),
  )
  unstructured_sensitive_lines = (
    "raw_body=raw-body-canary",
    "request_body=request-body-canary",
    "body = \\\"{\\\\\\\"capability\\\\\\\":\\\\\\\"escaped-capability-canary\\\\\\\"}\\\"",
    "HTTP.Request body={\"api_key\":\"api-key-canary\"}",
  )
  @test all(unstructured_sensitive_lines) do line
    WQS._sanitize_sidecar_diagnostic_line(line) ==
      "[omitted sensitive diagnostic]"
  end

  diagnostics = WQS.sidecar_status(supervisor)["diagnostics"]
  @test occursin("retained", diagnostics[1]["message"])
  @test !occursin("canary", join(getindex.(diagnostics, "message")))
  @test diagnostics[2]["message"] == "[omitted sensitive diagnostic]"
  @test all(
    diagnostic -> ncodeunits(diagnostic["message"]) <=
      WQS.SIDECAR_DIAGNOSTIC_BYTE_LIMIT,
    diagnostics,
  )

  first_capability = WQS._sidecar_capability()
  second_capability = WQS._sidecar_capability()
  @test occursin(r"^[0-9a-f]{64}$", first_capability)
  @test first_capability != second_capability
end

function fake_sidecar_start!(
  supervisor;
  spawn_process,
  cleanup_resources,
  start_tasks=(_, _) -> Task[],
  wait_for_ready=(current, generation) -> begin
    WQS.sidecar_ready!(current, generation.capability, generation.port)
    return :ready
  end,
  process_has_exited=_ -> false,
)
  return WQS.start_sidecar!(
    supervisor;
    configuration=TEST_MCP_CONFIGURATION,
    spawn_process,
    start_tasks,
    write_startup=(_, _) -> nothing,
    wait_for_ready,
    process_has_exited,
    cleanup_resources,
  )
end

function supervisor_lock_is_available(supervisor)
  acquired = Channel{Nothing}(1)
  task = Threads.@spawn lock(supervisor.lock) do
    put!(acquired, nothing)
  end
  result = timedwait(() -> isready(acquired), 1; pollint=0.01)
  result == :ok && wait(task)
  return result == :ok
end

@testset "Sidecar supervisor serializes concurrent lifecycle calls" begin
  supervisor = WQS.SidecarSupervisor()
  spawn_started = Channel{Nothing}(1)
  allow_spawn = Channel{Nothing}(1)
  cleanup_started = Channel{Nothing}(1)
  allow_cleanup = Channel{Nothing}(1)
  spawn_count = Ref(0)
  cleanup_ids = UInt64[]
  hook_lock_checks = Bool[]

  spawn_process = function ()
    spawn_count[] += 1
    push!(hook_lock_checks, supervisor_lock_is_available(supervisor))
    put!(spawn_started, nothing)
    take!(allow_spawn)
    return FakeSidecarProcess(0), nothing, nothing, nothing
  end
  cleanup_resources = function (generation; terminate=false)
    push!(hook_lock_checks, supervisor_lock_is_available(supervisor))
    push!(cleanup_ids, generation.id)
    put!(cleanup_started, nothing)
    take!(allow_cleanup)
    return nothing
  end

  first_start = Threads.@spawn fake_sidecar_start!(
    supervisor;
    spawn_process,
    cleanup_resources,
  )
  take!(spawn_started)
  second_start = Threads.@spawn fake_sidecar_start!(
    supervisor;
    spawn_process,
    cleanup_resources,
  )
  yield()
  @test spawn_count[] == 1

  put!(allow_spawn, nothing)
  @test fetch(first_start)["state"] == "running"
  @test fetch(second_start)["state"] == "running"
  @test spawn_count[] == 1

  capability = lock(supervisor.lock) do
    supervisor.current.capability
  end
  @test WQS.verify_sidecar_capability!(supervisor, capability)
  @test WQS.start_sidecar!(
    supervisor;
    configuration=TEST_MCP_CONFIGURATION,
  )["state"] == "running"
  @test spawn_count[] == 1

  first_stop = Threads.@spawn WQS.stop_sidecar!(supervisor)
  take!(cleanup_started)
  second_stop = Threads.@spawn WQS.stop_sidecar!(supervisor)
  @test timedwait(
    () -> WQS.sidecar_status(supervisor)["state"] == "stopping",
    1;
    pollint=0.01,
  ) == :ok
  @test_throws Exception WQS.verify_sidecar_capability!(supervisor, capability)
  @test length(cleanup_ids) == 1

  put!(allow_cleanup, nothing)
  @test fetch(first_stop)["state"] == "stopped"
  @test fetch(second_stop)["state"] == "stopped"
  @test WQS.stop_sidecar!(supervisor)["state"] == "stopped"
  @test length(cleanup_ids) == 1
  @test all(hook_lock_checks)
end

@testset "Exited startup generation cannot be promoted" begin
  supervisor = WQS.SidecarSupervisor()
  exit_requested = Channel{Nothing}(1)
  monitor_finished = Channel{Nothing}(1)
  process = StartupExitProcess(23, false, exit_requested)
  cleanup_ids = UInt64[]

  start_tasks = function (current, generation)
    monitor = @async begin
      WQS._monitor_sidecar_exit!(current, generation)
      put!(monitor_finished, nothing)
    end
    return Task[monitor]
  end
  wait_for_ready = function (current, generation)
    WQS.sidecar_ready!(current, generation.capability, generation.port)
    put!(exit_requested, nothing)
    @test timedwait(
      () -> isready(monitor_finished),
      1;
      pollint=0.01,
    ) == :ok
    return :ready
  end
  cleanup_resources = function (generation; terminate=false)
    push!(cleanup_ids, generation.id)
    return nothing
  end

  start_error = try
    fake_sidecar_start!(
      supervisor;
      spawn_process=() -> (process, nothing, nothing, nothing),
      start_tasks,
      wait_for_ready,
      process_has_exited=current -> current.exited,
      cleanup_resources,
    )
    nothing
  catch error
    error
  end

  @test start_error isa WQS.APIError
  @test start_error.error_code == "INTERNAL_ERROR"
  @test process.exited
  @test WQS.sidecar_status(supervisor)["state"] == "failed"
  @test lock(supervisor.lock) do
    supervisor.current === nothing && !supervisor.cleanup_pending
  end
  @test length(cleanup_ids) == 1
end

@testset "Stop cancels startup before admitting a new generation" begin
  supervisor = WQS.SidecarSupervisor()
  first_spawn_started = Channel{Nothing}(1)
  allow_first_spawn = Channel{Nothing}(1)
  spawn_count = Ref(0)
  cleanup_ids = UInt64[]

  spawn_process = function ()
    spawn_count[] += 1
    spawn_count[] == 1 && put!(first_spawn_started, nothing)
    spawn_count[] == 1 && take!(allow_first_spawn)
    return FakeSidecarProcess(0), nothing, nothing, nothing
  end
  cleanup_resources = function (generation; terminate=false)
    push!(cleanup_ids, generation.id)
    return nothing
  end

  first_start = Threads.@spawn fake_sidecar_start!(
    supervisor;
    spawn_process,
    cleanup_resources,
  )
  take!(first_spawn_started)
  stop_task = Threads.@spawn WQS.stop_sidecar!(supervisor)
  @test timedwait(
    () -> WQS.sidecar_status(supervisor)["state"] == "stopping",
    1;
    pollint=0.01,
  ) == :ok

  replacement_start = Threads.@spawn fake_sidecar_start!(
    supervisor;
    spawn_process,
    cleanup_resources,
  )
  yield()
  @test spawn_count[] == 1

  put!(allow_first_spawn, nothing)
  fetch(first_start)
  @test fetch(stop_task)["state"] == "stopped"
  @test fetch(replacement_start)["state"] == "running"
  @test spawn_count[] == 2
  @test length(cleanup_ids) == 1

  replacement_id = lock(supervisor.lock) do
    supervisor.current.id
  end
  @test replacement_id ∉ cleanup_ids
  @test WQS.stop_sidecar!(supervisor)["state"] == "stopped"
  @test length(unique(cleanup_ids)) == 2
end

@testset "Unexpected exit revokes admission before cleanup" begin
  supervisor = WQS.SidecarSupervisor()
  spawn_count = Ref(0)
  cleanup_started = Channel{Nothing}(1)
  allow_cleanup = Channel{Nothing}(1)
  first_generation_id = Ref{UInt64}(0)
  cleanup_ids = UInt64[]

  spawn_process = function ()
    spawn_count[] += 1
    return FakeSidecarProcess(17), nothing, nothing, nothing
  end
  cleanup_resources = function (generation; terminate=false)
    push!(cleanup_ids, generation.id)
    if generation.id == first_generation_id[]
      put!(cleanup_started, nothing)
      take!(allow_cleanup)
    end
    return nothing
  end

  @test fake_sidecar_start!(
    supervisor;
    spawn_process,
    cleanup_resources,
  )["state"] == "running"
  generation = lock(supervisor.lock) do
    supervisor.current
  end
  first_generation_id[] = generation.id
  old_capability = generation.capability
  @test WQS.note_sidecar_session_initialized!(supervisor)

  monitor = Threads.@spawn WQS._monitor_sidecar_exit!(supervisor, generation)
  take!(cleanup_started)
  @test WQS.sidecar_status(supervisor)["state"] == "failed"
  @test !WQS.sidecar_status(supervisor)["session_initialized"]
  @test lock(supervisor.lock) do
    supervisor.current === nothing && supervisor.cleanup_pending
  end
  @test_throws Exception WQS.verify_sidecar_capability!(
    supervisor,
    old_capability,
  )

  replacement_start = Threads.@spawn fake_sidecar_start!(
    supervisor;
    spawn_process,
    cleanup_resources,
  )
  yield()
  @test spawn_count[] == 1

  put!(allow_cleanup, nothing)
  fetch(monitor)
  @test fetch(replacement_start)["state"] == "running"
  @test spawn_count[] == 2
  @test_throws Exception WQS.verify_sidecar_capability!(
    supervisor,
    old_capability,
  )

  new_generation = lock(supervisor.lock) do
    supervisor.current
  end
  @test new_generation.id != generation.id
  @test new_generation.id ∉ cleanup_ids
  @test WQS.stop_sidecar!(supervisor)["state"] == "stopped"
  @test length(unique(cleanup_ids)) == 2
end
