using QuantumSavory
using QuantumSavory.ProtocolZoo
using InteractiveUtils

function QuantumSavory.PauliNoise(τ::Float64)
  @warn "PauliNoise constructor with single τ parameter as fallback!!! Use PauliNoise(τ, τ, τ) instead."
  QuantumSavory.PauliNoise(τ, τ, τ)
end
