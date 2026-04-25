using Genie, Logging

Genie.Configuration.config!(
  server_port                     = 8000,
  server_host                     = "127.0.0.1",
  log_level                       = Logging.Info,
  log_to_file                     = true,
  server_handle_static_files      = true,
  cors_headers                    = Dict(
    "Access-Control-Allow-Origin" => "*",
    "Access-Control-Allow-Methods" => "*",
    "Access-Control-Allow-Headers" => "*"
  )
)

ENV["JULIA_REVISE"] = "off"
