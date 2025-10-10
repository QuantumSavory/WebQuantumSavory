module Logger

using Logging
using LoggingExtras
using Dates
using QuantumSavory

export make_logger, MIN_LEVEL, MAX_LEVEL, log_event, @log_event

const MIN_LEVEL = Logging.Debug
const MAX_LEVEL = Logging.Warn

ultimateparent(mod) = mod === parentmodule(mod) ? mod : ultimateparent(parentmodule(mod))

# Custom logger that captures logs into state while also displaying them
struct CapturingLogger <: Logging.AbstractLogger
  console::Logging.ConsoleLogger
  state::Any
end

Logging.min_enabled_level(logger::CapturingLogger) = MIN_LEVEL

function Logging.shouldlog(logger::CapturingLogger, level, _module, group, id)
  # Filter for QuantumSavory logs in the specified level range
  return MIN_LEVEL <= level <= MAX_LEVEL && ultimateparent(_module) === QuantumSavory
end

Logging.catch_exceptions(logger::CapturingLogger) = false

function Logging.handle_message(logger::CapturingLogger, level, message, _module, group, id, filepath, line; kwargs...)
  # Capture the log event
  try
    push!(logger.state.log_events, Dict(
      :timestamp => Dates.format(Dates.now(), dateformat"yyyy-mm-ddTHH:MM:SS.sssZ"),
      :level => level,
      :message => string(message),
      :module => string(_module),
      :group => group,
      :id => id,
    ))
  catch e
    # best-effort collection; ignore failures
    println(stderr, "❌ LOGGER ERROR: Failed to push log event: ", e)
  end
  
  # Also pass through to console logger for display
  Logging.handle_message(logger.console, level, message, _module, group, id, filepath, line; kwargs...)
end

function make_logger(state)
  return CapturingLogger(Logging.ConsoleLogger(stderr, MIN_LEVEL), state)
end

"""Append a structured log event to the state's log_events with a timestamp.

Parameters:
- state: Cqn.State holding the log_events array
- level: a Logging level (e.g., Logging.Info)
- message: a String describing the event
- Keyword args are included as extra fields on the event
""" 
function log_event(state, level, message; module_name = nothing, kwargs...)
  try
    event = Dict(
      :timestamp => Dates.format(Dates.now(), dateformat"yyyy-mm-ddTHH:MM:SS.sssZ"),
      :level => level,
      :message => message,
    )
    if module_name !== nothing
      event[:module] = String(module_name)
    end
    for (k, v) in kwargs
      event[Symbol(k)] = v
    end
    push!(state.log_events, event)
  catch
    # best-effort only
  end
  return state
end

"""Macro to log an event, capturing the caller's module name automatically.

Usage: @log_event state Logging.Info "message" key1=value1 key2=value2
"""
macro log_event(state, level, message, args...)
  local _esc_args = map(arg -> esc(arg), Tuple(args))
  return :(Logger.log_event($(esc(state)), $(esc(level)), $(esc(message)); module_name = string($__module__), $(_esc_args...)))
end

end


