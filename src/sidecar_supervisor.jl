const SIDECAR_START_TIMEOUT_SECONDS = 15
const SIDECAR_STOP_TIMEOUT_SECONDS = 5
const SIDECAR_DIAGNOSTIC_LIMIT = 200
const SIDECAR_DIAGNOSTIC_BYTE_LIMIT = 16 * 1024

mutable struct SidecarGeneration
  id::UInt64
  capability::String
  port::Int
  process::Any
  input::Any
  output::Any
  error_output::Any
  drain_tasks::Vector{Task}
  resources_ready::Base.Event
  start_complete::Base.Event
  cleanup_lock::ReentrantLock
  cleanup_started::Bool
  cleanup_complete::Base.Event
  cleanup_resources::Function
end

function SidecarGeneration(
  id::UInt64,
  capability::String,
  port::Int,
  cleanup_resources::Function,
)
  return SidecarGeneration(
    id,
    capability,
    port,
    nothing,
    nothing,
    nothing,
    nothing,
    Task[],
    Base.Event(),
    Base.Event(),
    ReentrantLock(),
    false,
    Base.Event(),
    cleanup_resources,
  )
end

mutable struct SidecarSupervisor
  lock::ReentrantLock
  state::Symbol
  epoch::UInt64
  current::Union{Nothing,SidecarGeneration}
  stop_complete::Base.Event
  cleanup_pending::Bool
  cleanup_complete::Base.Event
  diagnostics::Vector{Dict{String,String}}
  ready::Bool
  port::Int
  last_error::Union{Nothing,String}
  session_initialized::Bool
  last_request_at::Union{Nothing,String}
end

function SidecarSupervisor()
  stop_complete = Base.Event()
  cleanup_complete = Base.Event()
  notify(stop_complete)
  notify(cleanup_complete)
  return SidecarSupervisor(
    ReentrantLock(),
    :stopped,
    UInt64(0),
    nothing,
    stop_complete,
    false,
    cleanup_complete,
    Dict{String,String}[],
    false,
    DEFAULT_MCP_PORT,
    nothing,
    false,
    nothing,
  )
end

const SIDECAR_SUPERVISOR = SidecarSupervisor()

function _sidecar_state_name(state::Symbol)
  state in (:stopped, :starting, :running, :stopping, :failed) || return "failed"
  return string(state)
end

function _sidecar_status_locked(supervisor::SidecarSupervisor)
  return Dict(
    "state" => _sidecar_state_name(supervisor.state),
    "endpoint" => supervisor.state == :running ?
      "http://127.0.0.1:$(supervisor.port)/mcp" : nothing,
    "port" => supervisor.port,
    "last_error" => supervisor.last_error,
    "session_initialized" => supervisor.session_initialized,
    "last_request_at" => supervisor.last_request_at,
    "diagnostics" => deepcopy(supervisor.diagnostics),
  )
end

function _sensitive_diagnostic_key(key)
  normalized = _normalized_sensitive_key(key)
  return _sensitive_activity_key(key) ||
    any(fragment -> occursin(fragment, normalized), ("raw", "request", "response"))
end

function _sanitize_diagnostic_text(value::AbstractString)
  text = String(value)
  normalized = _normalized_sensitive_key(text)
  if any(
    fragment -> occursin(fragment, normalized),
    (
      MCP_SENSITIVE_DETAIL_KEY_FRAGMENTS...,
      "rawbody",
      "rawmessage",
      "rawpayload",
      "rawrequest",
      "rawresponse",
      "requestbody",
      "requestpayload",
      "responsebody",
      "responsepayload",
      "httprequest",
      "httpresponse",
    ),
  ) ||
    occursin(r"(?i)\b(?:raw|request|response)\s*[:=]", text) ||
    occursin(r"(?i)\bbearer\s+\S+", text) ||
    occursin(r"(?i)-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----", text)
    return "[omitted sensitive diagnostic]"
  end
  return text
end

function _sanitize_diagnostic_value(value)
  if value isa AbstractDict
    return Dict{String,Any}(
      string(key) => (
        _sensitive_diagnostic_key(key) ? "[omitted]" :
        _sanitize_diagnostic_value(nested)
      )
      for (key, nested) in value
    )
  elseif value isa AbstractVector
    return [_sanitize_diagnostic_value(item) for item in value]
  elseif value isa AbstractString
    return _sanitize_diagnostic_text(value)
  elseif value === nothing || value isa Number || value isa Bool
    return value
  end
  return _sanitize_diagnostic_text(string(value))
end

function _sanitize_sidecar_diagnostic_line(message::AbstractString)
  text = String(message)
  parsed = try
    JSON.parse(text)
  catch
    nothing
  end
  sanitized = parsed === nothing ?
    _sanitize_diagnostic_text(text) :
    JSON.json(_sanitize_diagnostic_value(parsed))
  return _truncate_utf8_bytes(sanitized, SIDECAR_DIAGNOSTIC_BYTE_LIMIT)
end

function _append_sidecar_diagnostic!(
  supervisor::SidecarSupervisor,
  stream::AbstractString,
  message::AbstractString,
)
  sanitized_message = _sanitize_sidecar_diagnostic_line(message)
  lock(supervisor.lock) do
    push!(
      supervisor.diagnostics,
      Dict(
        "timestamp" => _activity_timestamp(Dates.now()),
        "stream" => String(stream),
        "message" => sanitized_message,
      ),
    )
    length(supervisor.diagnostics) > SIDECAR_DIAGNOSTIC_LIMIT &&
      popfirst!(supervisor.diagnostics)
  end
end

function _drain_sidecar_pipe!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
  pipe::Pipe,
  stream::String,
)
  try
    for line in eachline(pipe)
      _append_sidecar_diagnostic!(supervisor, stream, line)
    end
  catch error
    process = generation.process
    if process !== nothing && !process_exited(process)
      _append_sidecar_diagnostic!(
        supervisor,
        stream,
        "Diagnostic pipe failed: $(sprint(showerror, error))",
      )
    end
  end
end

function _sidecar_project_path()
  return normpath(joinpath(@__DIR__, "..", "mcp"))
end

function _sidecar_command()
  return `$(Base.julia_cmd()) --startup-file=no --project=$(_sidecar_project_path()) $(_sidecar_project_path())/main.jl`
end

function _sidecar_capability()
  entropy = Vector{UInt8}(undef, 32)
  Base.Libc.getrandom!(entropy)
  return bytes2hex(entropy)
end

function _backend_bridge_url(configuration::MCPConfiguration)
  host = configuration.backend_host in ("::1", "0:0:0:0:0:0:0:1") ?
    "[$(configuration.backend_host)]" : configuration.backend_host
  return "http://$host:$(configuration.backend_port)/_mcp/internal"
end

function _spawn_sidecar_process()
  input = Pipe()
  output = Pipe()
  error_output = Pipe()
  process = run(
    pipeline(
      _sidecar_command();
      stdin=input,
      stdout=output,
      stderr=error_output,
    );
    wait=false,
  )
  close(input.out)
  close(output.in)
  close(error_output.in)
  return process, input, output, error_output
end

function sidecar_ready!(
  supervisor::SidecarSupervisor,
  capability::AbstractString,
  port::Integer,
)
  lock(supervisor.lock) do
    supervisor.state == :starting || return false
    generation = supervisor.current
    generation === nothing && return false
    capability == generation.capability || return false
    Int(port) == generation.port || return false
    supervisor.ready = true
    return true
  end
end

sidecar_ready!(capability::AbstractString, port::Integer) =
  sidecar_ready!(SIDECAR_SUPERVISOR, capability, port)

function _close_sidecar_pipes!(generation::SidecarGeneration)
  for pipe in (generation.input, generation.output, generation.error_output)
    pipe === nothing && continue
    try
      close(pipe)
    catch
    end
  end
end

function _await_sidecar_drains!(generation::SidecarGeneration)
  for task in copy(generation.drain_tasks)
    task === current_task() && continue
    timedwait(() -> istaskdone(task), 1; pollint=0.02)
  end
end

function _cleanup_sidecar_resources!(
  generation::SidecarGeneration;
  terminate::Bool=false,
)
  input = generation.input
  if input !== nothing
    try
      close(input)
    catch
    end
  end

  process = generation.process
  process === nothing && return _close_sidecar_pipes!(generation)
  if terminate && !process_exited(process)
    try
      kill(process)
    catch
    end
  end
  timedwait(() -> process_exited(process), SIDECAR_STOP_TIMEOUT_SECONDS; pollint=0.05)
  if !process_exited(process)
    try
      kill(process)
    catch
    end
    timedwait(() -> process_exited(process), 1; pollint=0.05)
  end
  if !process_exited(process)
    try
      kill(process, Base.SIGKILL)
    catch
    end
  end
  try
    wait(process)
  catch
  end
  _close_sidecar_pipes!(generation)
  _await_sidecar_drains!(generation)
  return nothing
end

function _cleanup_sidecar_generation!(
  generation::SidecarGeneration;
  terminate::Bool=false,
)
  owns_cleanup = lock(generation.cleanup_lock) do
    generation.cleanup_started && return false
    generation.cleanup_started = true
    return true
  end
  if !owns_cleanup
    wait(generation.cleanup_complete)
    return nothing
  end

  try
    generation.cleanup_resources(generation; terminate)
  finally
    notify(generation.cleanup_complete)
  end
  return nothing
end

function _begin_sidecar_failure!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
  expected_state::Symbol,
  message::String,
)
  return lock(supervisor.lock) do
    supervisor.current === generation || return nothing
    supervisor.state == expected_state || return nothing
    supervisor.epoch += UInt64(1)
    cleanup_token = supervisor.epoch
    cleanup_complete = Base.Event()
    supervisor.state = :failed
    supervisor.current = nothing
    supervisor.cleanup_pending = true
    supervisor.cleanup_complete = cleanup_complete
    supervisor.last_error = message
    supervisor.ready = false
    supervisor.session_initialized = false
    supervisor.last_request_at = nothing
    return cleanup_token, cleanup_complete
  end
end

function _complete_sidecar_failure!(
  supervisor::SidecarSupervisor,
  cleanup_token::UInt64,
  cleanup_complete::Base.Event,
)
  lock(supervisor.lock) do
    if supervisor.epoch == cleanup_token && supervisor.state == :failed
      supervisor.cleanup_pending = false
    end
  end
  notify(cleanup_complete)
  return nothing
end

function _monitor_sidecar_exit!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
)
  process = generation.process
  try
    wait(process)
  catch
  end
  message = "The MCP sidecar exited unexpectedly (code $(process.exitcode))."
  failure = _begin_sidecar_failure!(supervisor, generation, :running, message)
  failure === nothing && return

  cleanup_token, cleanup_complete = failure
  try
    stop_collaboration!()
    _cleanup_sidecar_generation!(generation)
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "failed";
      summary="The MCP sidecar exited unexpectedly",
      status="error",
      details=Dict("exit_code" => process.exitcode),
    )
  finally
    _complete_sidecar_failure!(supervisor, cleanup_token, cleanup_complete)
  end
end

function _start_sidecar_tasks!(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
)
  return Task[
    (@async _drain_sidecar_pipe!(
      supervisor,
      generation,
      generation.output,
      "stdout",
    )),
    (@async _drain_sidecar_pipe!(
      supervisor,
      generation,
      generation.error_output,
      "stderr",
    )),
    (@async _monitor_sidecar_exit!(supervisor, generation)),
  ]
end

function _write_sidecar_startup!(
  generation::SidecarGeneration,
  startup::AbstractDict,
)
  write(generation.input, JSON.json(startup), '\n')
  flush(generation.input)
  return nothing
end

function _wait_for_sidecar_ready(
  supervisor::SidecarSupervisor,
  generation::SidecarGeneration,
)
  ready_result = timedwait(
    () -> lock(supervisor.lock) do
      supervisor.current === generation || return true
      supervisor.state == :starting || return true
      supervisor.ready || process_exited(generation.process)
    end,
    SIDECAR_START_TIMEOUT_SECONDS;
    pollint=0.05,
  )
  state = lock(supervisor.lock) do
    (
      active=supervisor.current === generation && supervisor.state == :starting,
      ready=supervisor.ready,
    )
  end
  state.active || return :cancelled
  ready_result == :timed_out && throw(
    ErrorException("Timed out waiting for the MCP listener to become ready"),
  )
  state.ready || throw(
    ErrorException("The MCP listener exited before reporting ready"),
  )
  return :ready
end

function start_sidecar!(
  supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR;
  configuration::MCPConfiguration=mcp_configuration(),
  spawn_process::Function=_spawn_sidecar_process,
  start_tasks::Function=_start_sidecar_tasks!,
  write_startup::Function=_write_sidecar_startup!,
  wait_for_ready::Function=_wait_for_sidecar_ready,
  process_has_exited::Function=process_exited,
  cleanup_resources::Function=_cleanup_sidecar_resources!,
  capability_source::Function=_sidecar_capability,
)
  configuration.enabled || throw(
    _mcp_error("MCP_DISABLED", "The local MCP feature is disabled.", status=404),
  )

  generation = nothing
  while true
    decision = lock(supervisor.lock) do
      if supervisor.cleanup_pending
        return (:wait_then_start, supervisor.cleanup_complete)
      elseif supervisor.state == :stopping
        return (:wait_then_start, supervisor.stop_complete)
      elseif supervisor.state == :starting
        current = supervisor.current
        current === nothing && error("A starting sidecar has no generation")
        return (:wait_then_return, current.start_complete)
      elseif supervisor.state == :running
        return (:return, _sidecar_status_locked(supervisor))
      end

      supervisor.epoch += UInt64(1)
      current = SidecarGeneration(
        supervisor.epoch,
        capability_source(),
        configuration.port,
        cleanup_resources,
      )
      supervisor.state = :starting
      supervisor.current = current
      supervisor.port = configuration.port
      supervisor.ready = false
      supervisor.last_error = nothing
      supervisor.session_initialized = false
      supervisor.last_request_at = nothing
      return (:start, current)
    end

    action, value = decision
    action == :return && return value
    if action == :wait_then_return
      wait(value)
      return sidecar_status(supervisor)
    elseif action == :wait_then_start
      wait(value)
      continue
    end
    generation = value
    break
  end

  try
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "starting";
      summary="Starting local MCP listener",
      status="pending",
    )

    try
      process, input, output, error_output = spawn_process()
      generation.process = process
      generation.input = input
      generation.output = output
      generation.error_output = error_output
      append!(generation.drain_tasks, start_tasks(supervisor, generation))
    finally
      notify(generation.resources_ready)
    end

    active = lock(supervisor.lock) do
      supervisor.current === generation && supervisor.state == :starting
    end
    if !active
      _cleanup_sidecar_generation!(generation; terminate=true)
      return sidecar_status(supervisor)
    end

    startup = Dict(
      "port" => configuration.port,
      "bridge_url" => _backend_bridge_url(configuration),
      "contract_version" => MCP_CONTRACT_VERSION,
      "capability" => generation.capability,
    )
    write_startup(generation, startup)
    wait_for_ready(supervisor, generation) == :cancelled && begin
      _cleanup_sidecar_generation!(generation; terminate=true)
      return sidecar_status(supervisor)
    end

    promotion = lock(supervisor.lock) do
      if supervisor.current !== generation || supervisor.state != :starting
        :cancelled
      elseif process_has_exited(generation.process)
        :exited
      else
        supervisor.state = :running
        :promoted
      end
    end
    if promotion == :exited
      throw(ErrorException("The MCP listener exited before startup completed"))
    elseif promotion == :cancelled
      _cleanup_sidecar_generation!(generation; terminate=true)
      return sidecar_status(supervisor)
    end

    lock(collaboration_hub().lock) do
      collaboration_hub().accepting = true
    end
    still_running = lock(supervisor.lock) do
      supervisor.current === generation && supervisor.state == :running
    end
    if !still_running
      lock(collaboration_hub().lock) do
        collaboration_hub().accepting = false
      end
      return sidecar_status(supervisor)
    end

    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "running";
      summary="MCP listener available at http://127.0.0.1:$(configuration.port)/mcp",
      status="success",
    )
    return sidecar_status(supervisor)
  catch error
    notify(generation.resources_ready)
    try
      _cleanup_sidecar_generation!(generation; terminate=true)
    catch cleanup_error
      _append_sidecar_diagnostic!(
        supervisor,
        "supervisor",
        "Sidecar cleanup failed: $(sprint(showerror, cleanup_error))",
      )
    end

    message = sprint(showerror, error)
    failure = _begin_sidecar_failure!(
      supervisor,
      generation,
      :starting,
      message,
    )
    if failure === nothing
      return sidecar_status(supervisor)
    end

    cleanup_token, cleanup_complete = failure
    try
      stop_collaboration!()
      record_mcp_activity!(
        collaboration_hub(),
        "server",
        "failed";
        summary="MCP listener failed to start",
        status="error",
        details=Dict("error" => message),
      )
    finally
      _complete_sidecar_failure!(supervisor, cleanup_token, cleanup_complete)
    end
    throw(_mcp_error("INTERNAL_ERROR", "The MCP listener failed to start.", status=500))
  finally
    notify(generation.resources_ready)
    notify(generation.start_complete)
  end
end

function stop_sidecar!(supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR)
  stop_claim = nothing
  while true
    decision = lock(supervisor.lock) do
      if supervisor.cleanup_pending
        return (:wait_then_stop, supervisor.cleanup_complete)
      elseif supervisor.state == :stopping
        return (:wait_then_return, supervisor.stop_complete)
      elseif supervisor.state == :stopped
        return (:return, _sidecar_status_locked(supervisor))
      end

      previous_state = supervisor.state
      generation = supervisor.current
      supervisor.epoch += UInt64(1)
      stop_token = supervisor.epoch
      stop_complete = Base.Event()
      supervisor.state = :stopping
      supervisor.current = nothing
      supervisor.stop_complete = stop_complete
      supervisor.ready = false
      supervisor.session_initialized = false
      supervisor.last_request_at = nothing
      return (
        :stop,
        (previous_state, generation, stop_token, stop_complete),
      )
    end

    action, value = decision
    action == :return && return value
    if action == :wait_then_return
      wait(value)
      return sidecar_status(supervisor)
    elseif action == :wait_then_stop
      wait(value)
      continue
    end
    stop_claim = value
    break
  end
  previous_state, generation, stop_token, stop_complete = stop_claim

  try
    stop_collaboration!()
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "stopping";
      summary="Stopping local MCP listener",
      status="pending",
    )
    if generation !== nothing
      wait(generation.resources_ready)
      _cleanup_sidecar_generation!(
        generation;
        terminate=previous_state == :starting,
      )
      wait(generation.start_complete)
    end
    record_mcp_activity!(
      collaboration_hub(),
      "server",
      "stopped";
      summary="Local MCP listener stopped",
      status="success",
    )
  finally
    lock(supervisor.lock) do
      if supervisor.epoch == stop_token && supervisor.state == :stopping
        supervisor.state = :stopped
        supervisor.current = nothing
        supervisor.ready = false
        supervisor.session_initialized = false
        supervisor.last_request_at = nothing
      end
    end
    notify(stop_complete)
  end
  return sidecar_status(supervisor)
end

function sidecar_status(supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR)
  lock(supervisor.lock) do
    return _sidecar_status_locked(supervisor)
  end
end

function note_sidecar_session_initialized!(
  supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR,
)
  lock(supervisor.lock) do
    supervisor.state == :running || return false
    supervisor.session_initialized = true
    return true
  end
end

function note_sidecar_request!(supervisor::SidecarSupervisor=SIDECAR_SUPERVISOR)
  lock(supervisor.lock) do
    supervisor.state == :running || return false
    supervisor.last_request_at = _activity_timestamp(Dates.now())
    return true
  end
end

function verify_sidecar_capability!(
  supervisor::SidecarSupervisor,
  provided::AbstractString,
)
  valid = lock(supervisor.lock) do
    generation = supervisor.current
    supervisor.state == :running &&
      generation !== nothing &&
      provided == generation.capability
  end
  valid || throw(_mcp_error("INTERNAL_ERROR", "Invalid sidecar capability.", status=403))
  return true
end

verify_sidecar_capability!(provided::AbstractString) =
  verify_sidecar_capability!(SIDECAR_SUPERVISOR, provided)

atexit() do
  try
    stop_sidecar!()
  catch
  end
end
