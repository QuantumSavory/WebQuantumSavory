const DEFAULT_QUBIT_REPRESENTATION = "QuantumOpticsRepr"
const DEFAULT_QUMODE_REPRESENTATION = "QuantumOpticsRepr"

const _REPRESENTATION_SPECS = Dict(
  "QuantumOpticsRepr" => (
    traits = (Qubit, Qumode),
    construct = () -> QuantumOpticsRepr(),
    script = "QuantumSavory.QuantumOpticsRepr()",
  ),
  "QuantumMCRepr" => (
    traits = (Qubit, Qumode),
    construct = () -> QuantumMCRepr(),
    script = "QuantumSavory.QuantumMCRepr()",
  ),
  "CliffordRepr" => (
    traits = (Qubit,),
    construct = () -> CliffordRepr(),
    script = "QuantumSavory.CliffordRepr()",
  ),
  "GabsRepr" => (
    traits = (Qumode,),
    construct = () -> GabsRepr(QuantumSavory.Gabs.QuadBlockBasis),
    script = "QuantumSavory.GabsRepr(QuantumSavory.Gabs.QuadBlockBasis)",
  ),
)

_representation_object_like(value) =
  value isa AbstractDict || startswith(string(typeof(value)), "JSON3.Object")

_representation_trait_name(trait) =
  trait === Qubit ? "Qubit" : trait === Qumode ? "Qumode" : string(trait)

function _representation_choice(config, field, default, trait)
  choice = get(config, field, default)
  choice isa AbstractString || throw(validation_error(
    "Simulation configuration field '$field' must be a representation name",
  ))
  name = String(choice)
  spec = get(_REPRESENTATION_SPECS, name, nothing)
  spec === nothing && throw(validation_error(
    "Unknown representation '$name' for $field",
    Dict{String,Any}(
      "allowed" => sort([
        candidate
        for (candidate, candidate_spec) in _REPRESENTATION_SPECS
        if trait in candidate_spec.traits
      ]),
    ),
  ))
  trait in spec.traits || throw(validation_error(
    "Representation '$name' does not support $(_representation_trait_name(trait)) slots",
  ))
  return name
end

"""
Return validated global representation defaults for a project payload.

Projects created before these fields existed retain the QuantumOptics default.
"""
function representation_config(payload)
  config = get(payload, "simulationConfig", nothing)
  if config === nothing
    config = Dict{String,Any}()
  elseif !_representation_object_like(config)
    throw(validation_error("Field 'simulationConfig' must be an object"))
  end

  return (
    qubit = _representation_choice(
      config,
      "qubitRepresentation",
      DEFAULT_QUBIT_REPRESENTATION,
      Qubit,
    ),
    qumode = _representation_choice(
      config,
      "qumodeRepresentation",
      DEFAULT_QUMODE_REPRESENTATION,
      Qumode,
    ),
  )
end

function _representation_name(config, trait)
  trait === Qubit && return config.qubit
  trait === Qumode && return config.qumode
  return DEFAULT_QUBIT_REPRESENTATION
end

function construct_representation(config, trait)
  name = _representation_name(config, trait)
  return _REPRESENTATION_SPECS[name].construct()
end

function script_representation(config, trait)
  name = _representation_name(config, trait)
  return _REPRESENTATION_SPECS[name].script
end
