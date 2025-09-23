using QuantumSavory
using QuantumSavory.ProtocolZoo
using InteractiveUtils

function QuantumSavory.PauliNoise(τ::Float64)
  @warn "PauliNoise constructor with single τ parameter as fallback!!! Use PauliNoise(τ, τ, τ) instead."
  QuantumSavory.PauliNoise(τ, τ, τ)
end

function QuantumSavory.PauliNoise(; τˣ::Float64 = rand(), τʸ::Float64 = rand(), τᶻ::Float64 = rand())
  @warn "PauliNoise constructor with keyword arguments" τˣ=τˣ τʸ=τʸ τᶻ=τᶻ
  QuantumSavory.PauliNoise(τˣ, τʸ, τᶻ)
end

function QuantumSavory.AmplitudeDamping(; τ::Float64 = rand())
  @warn "AmplitudeDamping constructor with keyword arguments" τ=τ
  QuantumSavory.AmplitudeDamping(τ)
end

function QuantumSavory.Depolarization(; τ::Float64 = rand())
  @warn "Depolarization constructor with keyword arguments" τ=τ
  QuantumSavory.Depolarization(τ)
end

function QuantumSavory.T1Decay(; t1::Float64 = rand())
  @warn "T1Decay constructor with keyword arguments" t1=t1
  QuantumSavory.T1Decay(t1)
end

