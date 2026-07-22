const UNSAFE_EVALUATION_ENV_VAR = "WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION"
const UNSAFE_EVALUATION_DISABLED_CODE = "UNSAFE_EVALUATION_DISABLED"
const EVALUATION_FAILED_CODE = "EVALUATION_FAILED"

"""Parse the unsafe-evaluation override, accepting only `true` or `false`."""
function _parse_unsafe_evaluation_override(value::AbstractString)
  normalized = lowercase(strip(value))
  normalized == "true" && return true
  normalized == "false" && return false

  throw(ArgumentError("$UNSAFE_EVALUATION_ENV_VAR must be 'true' or 'false'"))
end

"""Return whether server-process Julia evaluation is explicitly enabled."""
function unsafe_code_evaluation_enabled(;
  environment::AbstractString=Genie.Configuration.env(),
  override::Union{Nothing,AbstractString}=get(ENV, UNSAFE_EVALUATION_ENV_VAR, nothing),
)
  # Keep the environment keyword for callers which report/redact by Genie
  # environment, but never infer permission from it.
  environment
  override === nothing && return false
  return _parse_unsafe_evaluation_override(override)
end

function unsafe_evaluation_disabled_error()
  APIError(
    "Unsafe Julia code evaluation is disabled",
    403,
    UNSAFE_EVALUATION_DISABLED_CODE,
    Dict{String,Any}("configuration_variable" => UNSAFE_EVALUATION_ENV_VAR),
  )
end

"""Reject an operation that would evaluate user-controlled Julia code."""
function require_unsafe_code_evaluation()
  unsafe_code_evaluation_enabled() || throw(unsafe_evaluation_disabled_error())
  nothing
end

"""Expose evaluation exception details only in development and test."""
function evaluation_failure_response(error; environment::AbstractString=Genie.Configuration.env())
  response = Dict{Symbol,Any}(
    :success => false,
    :error_code => EVALUATION_FAILED_CODE,
  )

  if lowercase(strip(environment)) in ("dev", "test")
    response[:error] = error isa Exception ? sprint(showerror, error) : string(error)
    response[:error_type] = string(typeof(error))
  else
    response[:error] = "Evaluation failed"
  end

  response
end

"""Attach an evaluation failure to otherwise public API-error details."""
function evaluation_failure_details(
  error,
  public_details::Dict{String,Any}=Dict{String,Any}();
  environment::AbstractString=Genie.Configuration.env(),
)
  details = copy(public_details)
  details["evaluation_error"] = evaluation_failure_response(
    error;
    environment,
  )[:error]
  return details
end

"""Redact evaluation details at the final API response boundary."""
function redact_evaluation_failure_details(
  details::Dict{String,Any};
  environment::AbstractString=Genie.Configuration.env(),
)
  lowercase(strip(environment)) in ("dev", "test") && return details
  haskey(details, "evaluation_error") || return details

  redacted = copy(details)
  redacted["evaluation_error"] = "Evaluation failed"
  return redacted
end
