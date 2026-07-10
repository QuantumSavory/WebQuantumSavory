# Plan 06: Fix virtual-edge protocol capability metadata

## Goal

Return accurate `virtual` capability metadata from `/protocol_types` without warnings so the GUI offers valid protocols on virtual edges.

## Evidence

- WebQuantumSavory calls `permits_virtual_edge(pt.type)` with a protocol type.
- [QuantumSavory PR #480](https://github.com/QuantumSavory/QuantumSavory.jl/pull/480) defines the public capability trait on protocol types and preserves instance queries by delegating through `typeof`.
- Its type-level fallback returns `false`, while the `EntanglementConsumer` specialization returns `true`.

## Scope

- Call the upstream type-level trait directly and cover the catalog response with backend tests.
- Avoid constructing live protocols merely to inspect a static capability.
- Add this plan to `plans/followups/06-virtual-edge-metadata.md`.

## Implementation

1. Query `QuantumSavory.ProtocolZoo.permits_virtual_edge` with each edge protocol type exposed by the upstream catalog.
2. Do not duplicate capability metadata or add a compatibility mapping in WebQuantumSavory.
3. Update `/protocol_types` tests to assert known true and false edge capabilities.
4. Verify the GUI filtering contract still expects strict `virtual === true`.

## Verification

- Run backend unit tests.
- Start the server, request `/protocol_types`, and assert `EntanglementConsumer` is virtual-capable while physical-edge protocols are not.
- Run backend integration tests and relevant frontend protocol-menu checks.
- Run `git diff --check`.

## Non-goals

- Do not edit the sibling QuantumSavory checkout as part of this WebQuantumSavory PR.
- Do not hardcode unrelated protocol constructor metadata.
