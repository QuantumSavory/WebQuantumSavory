import Pkg
import TOML

const PLATFORM_PROJECT_FILE = normpath(joinpath(@__DIR__, "..", "Project.toml"))
const FULL_GIT_COMMIT_SHA = r"^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$"

function _platform_package_field(package, field::Symbol)
  package === nothing && return nothing
  hasproperty(package, field) || return nothing
  value = getproperty(package, field)
  return value === nothing ? nothing : string(value)
end

function _platform_dependency(dependencies, package_module::Module)
  dependencies === nothing && return nothing
  return try
    get(dependencies, Base.PkgId(package_module).uuid, nothing)
  catch
    nothing
  end
end

function _platform_dependencies(dependencies_provider)
  return try
    dependencies_provider()
  catch
    nothing
  end
end

"""Return the application version declared by the root Project.toml."""
function _application_version(project_file::AbstractString=PLATFORM_PROJECT_FILE)
  return try
    version = get(TOML.parsefile(project_file), "version", nothing)
    version === nothing ? nothing : string(version)
  catch
    nothing
  end
end

"""
Return a full Git commit SHA when the tracked revision unambiguously names one.

Pkg's `tree_hash` identifies package source contents and is deliberately not used as a
commit fallback. Branches, tags, and abbreviated revisions remain available through the
separate `tracked_revision` field.
"""
function _full_commit_sha(revision)
  revision isa AbstractString || return nothing
  candidate = strip(revision)
  occursin(FULL_GIT_COMMIT_SHA, candidate) || return nothing
  return lowercase(candidate)
end

function _quantumsavory_platform_info(package)
  tracked_revision = _platform_package_field(package, :git_revision)
  return Dict{String,Any}(
    "version" => _platform_package_field(package, :version),
    "tracked_revision" => tracked_revision,
    "tracked_source" => _platform_package_field(package, :git_source),
    "tree_hash" => _platform_package_field(package, :tree_hash),
    "commit" => _full_commit_sha(tracked_revision),
  )
end

"""Collect JSON-safe platform, package, source, and capability information."""
function get_platform_info(;
  dependencies_provider=Pkg.dependencies,
  project_file::AbstractString=PLATFORM_PROJECT_FILE,
)
  dependencies = _platform_dependencies(dependencies_provider)
  genie = _platform_dependency(dependencies, Genie)
  quantumsavory = _platform_dependency(dependencies, QuantumSavory)
  quantumsavory_info = _quantumsavory_platform_info(quantumsavory)

  return Dict{String,Any}(
    "versions" => Dict{String,Any}(
      "julia" => string(VERSION),
      "genie" => _platform_package_field(genie, :version),
      "quantumsavory" => quantumsavory_info["version"],
      "app" => _application_version(project_file),
    ),
    "quantumsavory" => quantumsavory_info,
    "capabilities" => Dict{String,Any}(
      "unsafe_code_evaluation" => unsafe_code_evaluation_enabled(),
    ),
  )
end
