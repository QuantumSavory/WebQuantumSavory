# This adapter is intentionally locked to ModelContextProtocol.jl v0.6.0.
#
# Upstream source:
#   tag: https://github.com/JuliaSMLM/ModelContextProtocol.jl/releases/tag/v0.6.0
#   tag commit: 6ac7a4739bf1a1b231d76b459746d6ea50eae034
#   registered tree: 1d5b3d4098247ceb20496d4d5cf55ff79b70d69b
#
# The adapter mirrors `connect(::HttpTransport)`, reads private `HttpTransport`
# fields, and calls the unexported `handle_request` dispatcher. It does so to
# enforce the sidecar's one-session policy and to neutralize the process-global
# mutable MCPLogger installed by upstream `start!` and `logging/setLevel`.
#
# Before changing the exact dependency pin:
#   1. Diff upstream `src/transports/http.jl`, `src/core/server.jl`, and
#      `src/protocol/handlers.jl` against v0.6.0.
#   2. Update this adapter for every changed field or delegated Transport method.
#   3. Run the unit logger test and the real Streamable HTTP lifecycle suite.

const SIDECAR_LOGGER = Logging.ConsoleLogger(stderr, Logging.Info)

function install_safe_sidecar_logger!(logger=SIDECAR_LOGGER)
  Logging.global_logger(logger)
  return logger
end

struct SingleSessionHttpTransport <: ModelContextProtocol.Transport
  inner::HttpTransport
  session_initialized::Base.Event
end

SingleSessionHttpTransport(inner::HttpTransport) =
  SingleSessionHttpTransport(inner, Base.Event())

function reject_session(stream, status::Int, message::String)
  body = JSON3.write(Dict(
    "jsonrpc" => "2.0",
    "error" => Dict(
      "code" => -32000,
      "message" => message,
    ),
    "id" => nothing,
  ))
  HTTP.setstatus(stream, status)
  HTTP.setheader(stream, "Content-Type" => "application/json")
  HTTP.setheader(stream, "Content-Length" => string(ncodeunits(body)))
  HTTP.startwrite(stream)
  write(stream, body)
  return nothing
end

function _handle_single_session_request(
  transport::SingleSessionHttpTransport,
  stream,
)
  inner = transport.inner
  request = stream.message
  method = HTTP.method(request)
  session_id = HTTP.header(request, "Mcp-Session-Id", "")
  if method == "POST" &&
    inner.session_id !== nothing &&
    isempty(session_id)
    reject_session(
      stream,
      409,
      "Only one MCP client session is supported until the server is stopped.",
    )
  elseif method == "GET" &&
    occursin("text/event-stream", HTTP.header(request, "Accept", ""))
    if inner.session_id === nothing
      reject_session(stream, 400, "Initialize an MCP session before opening SSE.")
    elseif session_id != inner.session_id
      reject_session(stream, 401, "A valid MCP session ID is required.")
    else
      ModelContextProtocol.handle_request(inner, stream)
    end
  else
    was_uninitialized = inner.session_id === nothing
    try
      ModelContextProtocol.handle_request(inner, stream)
    finally
      if was_uninitialized && inner.session_id !== nothing
        notify(transport.session_initialized)
      end
    end
  end
  return nothing
end

function ModelContextProtocol.connect(transport::SingleSessionHttpTransport)
  inner = transport.inner
  inner.connected && return nothing
  inner.connected = true
  try
    inner.server = HTTP.serve!(inner.host, inner.port; stream=true) do stream
      _handle_single_session_request(transport, stream)
    end
  catch
    inner.connected = false
    rethrow()
  end
  return nothing
end

function wait_for_session_initialization(transport::SingleSessionHttpTransport)
  wait(transport.session_initialized)
  return transport.inner.session_id !== nothing
end

function ModelContextProtocol.read_message(transport::SingleSessionHttpTransport)
  # ModelContextProtocol installs its mutable MCPLogger inside `start!`. An MCP
  # client can otherwise lower that logger to Debug with `logging/setLevel`,
  # which makes the dependency emit raw requests, responses, and session IDs.
  # Replace it before every protocol message so the client preference is a no-op.
  install_safe_sidecar_logger!()
  return ModelContextProtocol.read_message(transport.inner)
end

ModelContextProtocol.write_message(
  transport::SingleSessionHttpTransport,
  message::String,
) = ModelContextProtocol.write_message(transport.inner, message)

ModelContextProtocol.pending_auth_context(transport::SingleSessionHttpTransport) =
  ModelContextProtocol.pending_auth_context(transport.inner)

ModelContextProtocol.capture_response_route(transport::SingleSessionHttpTransport) =
  ModelContextProtocol.capture_response_route(transport.inner)

ModelContextProtocol.deliver_response(
  transport::SingleSessionHttpTransport,
  route,
  message::String,
) = ModelContextProtocol.deliver_response(transport.inner, route, message)

ModelContextProtocol.set_negotiated_version!(
  transport::SingleSessionHttpTransport,
  version::String,
) = ModelContextProtocol.set_negotiated_version!(transport.inner, version)

ModelContextProtocol.send_notification(
  transport::SingleSessionHttpTransport,
  message::String,
) = ModelContextProtocol.send_notification(transport.inner, message)

ModelContextProtocol.is_connected(transport::SingleSessionHttpTransport) =
  ModelContextProtocol.is_connected(transport.inner)

function ModelContextProtocol.close(transport::SingleSessionHttpTransport)
  try
    return ModelContextProtocol.close(transport.inner)
  finally
    # Wake the session reporter when the parent stops before any client initializes.
    notify(transport.session_initialized)
  end
end
