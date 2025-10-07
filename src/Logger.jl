module Logger

using Logging
using LoggingExtras
using Dates

export make_logger, MIN_LEVEL, MAX_LEVEL, log_event, @log_event

const MIN_LEVEL = Logging.Debug
const MAX_LEVEL = Logging.Warn

ultimateparent(mod) = mod === parentmodule(mod) ? mod : ultimateparent(parentmodule(mod))

function make_logger(state)
  return EarlyFilteredLogger(Logging.ConsoleLogger(stderr, MIN_LEVEL)) do args
    # Filter for QuantumSavory logs in the specified level range
    if MIN_LEVEL <= args.level <= MAX_LEVEL && ultimateparent(args._module) === QuantumSavory
      # Collect the log event
      try
        push!(state.log_events, Dict(
          :timestamp => Dates.format(Dates.now(), dateformat"yyyy-mm-ddTHH:MM:SS.s ssZ"),
          :level => args.level,
          :message => args.message,
          :module => string(args._module),
          :group => get(args.kwargs, :group, nothing),
          :id => get(args.kwargs, :id, nothing),
        ))
      catch
        # best-effort collection; ignore failures
      end
      return true
    end
    return false
  end
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


