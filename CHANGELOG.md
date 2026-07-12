# Changelog

## Unreleased

- Added an Export Script tools tab with highlighted, downloadable, backend-generated Julia for running the configured simulation, plus pedagogical animation and protocol-visualization recipes.
- Replaced UI icon fonts, hand-drawn control artwork, and plain icon glyphs with semantically selected Lucide icons, including PrimeVue, MapLibre, and JSON viewer controls.
- Added node reordering with visible simulator IDs, ID tooltips, and stable edge, selection, map, and project persistence behavior.
- Moved log-level counters into the Logs tab and shortened the containing panel title to Tools.
- Added simulation-wide typed variables that can be defined in the Variables tab and assigned to node, edge, or floating protocol parameters.
- Added JSON persistence and backend validation for variable definitions and protocol assignments, including legacy-project compatibility and simulation-state edit locking.
- Filtered protocol variable pickers to field-compatible types, with explicit selection and availability guidance.
- Made Symbolic value editors collapse to their rendered result after successful validation, with compact protocol defaults and click-to-edit reopening.
- Added a States Zoo tools tab for defining symbolic state variables from the five allowlisted QuantumSavory state types, with metadata-driven parameter controls and debounced rendered previews.
- Added safe structured States Zoo recipes that persist with projects and remain available to compatible protocol parameters without enabling unsafe symbolic evaluation.
- Added States Zoo catalog and PNG preview API endpoints with strict type, parameter, numeric, and range validation plus serialized CairoMakie rendering.

## 1.6.0

- Added a tabbed bottom panel with Logs and Layout Tools views.
- Added a repeater chain generator that clones configured repeater nodes and edges into an evenly spaced chain.

## 1.5.0

WebQuantumSavory 1.5.0 is the first public release. A changelog was not kept before this release.
