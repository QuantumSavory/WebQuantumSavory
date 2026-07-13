# Changelog

## Unreleased

- Added clipboard image pasting to the project Description editor, inserting safe bitmap images as Markdown data URLs at the current selection.

## 1.6.0

- Added schema-v1 project normalization with consistently trimmed project names, editing locks after Parse and through Prepare, shared dialog and button primitives, and a brand-aligned light PrimeVue palette.
- Made the bottom Tools panel resizable upward and to the right with cursor-only border affordances, persistent dimensions, viewport-aware bounds, and compact collapse behavior.
- Added a dismissible full-screen warning when the simulator is opened on a phone or other small viewport.
- Added template-driven star, 2D grid, and all-to-all network layout helpers with deterministic geometry and 1-based clone names.
- Added a default-on repeater-chain option for a direct virtual edge between the endpoints and stabilized generated edge ordering across save/reload.
- Added an Export Script tools tab with highlighted, downloadable, backend-generated Julia for running the configured simulation, plus pedagogical animation and protocol-visualization recipes.
- Kept the Simulation Runner's Play control visible but disabled, with guidance, until the network is defined.
- Replaced UI icon fonts, hand-drawn control artwork, and plain icon glyphs with semantically selected Lucide icons, including PrimeVue and JSON viewer controls, while retaining MapLibre's native navigation controls.
- Added a persisted Markdown project Description tab with safe data-image support, inline and display LaTeX rendering, and explicit edit/save/cancel controls.
- Added node reordering with visible simulator IDs, ID tooltips, and stable edge, selection, map, and project persistence behavior.
- Moved log-level counters into the Logs tab and shortened the containing panel title to Tools.
- Added simulation-wide typed variables that can be defined in the Variables tab and assigned to node, edge, or floating protocol parameters.
- Added JSON persistence and backend validation for variable definitions and protocol assignments, including legacy-project compatibility and simulation-state edit locking.
- Filtered protocol variable pickers to field-compatible types, with explicit selection and availability guidance.
- Made Symbolic value editors collapse to their rendered result after successful validation, with compact protocol defaults and click-to-edit reopening.
- Added a States Zoo tools tab for defining symbolic state variables from the five allowlisted QuantumSavory state types, with metadata-driven parameter controls and debounced rendered previews.
- Added safe structured States Zoo recipes that persist with projects and remain available to compatible protocol parameters without enabling unsafe symbolic evaluation.
- Added States Zoo catalog and PNG preview API endpoints with strict type, parameter, numeric, and range validation plus serialized CairoMakie rendering.
- Exposed every upstream States Zoo type through the explicit whitelist, marked weighted states consistently, normalized their symbolic values and previews, and added synchronized trace variables with heralding-probability guidance while keeping generated Zoo variables out of the ordinary Variables tab and recomputing exported traces alongside their normalized states.
- Added a tabbed bottom panel with Logs and Layout Tools views.
- Added a repeater chain generator that clones configured repeater nodes and edges into an evenly spaced chain.

## 1.5.0

WebQuantumSavory 1.5.0 is the first public release. A changelog was not kept before this release.
