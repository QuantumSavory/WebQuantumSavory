# Plan 08: Restrict and gate Julia source evaluation

## Goal

Reduce the risk of server-process Julia evaluation with a default-deny source
language, while requiring an explicit operator opt-in in every environment and
never describing the result as a security sandbox.

## Evidence

- `/test_code`, `/test_symbolic_expression`, `/test_numeric_expression`, lambda
  creation, symbolic handling, numeric expressions, and custom tag queries
  require native Julia evaluation in the server process.
- A fresh module isolates names but does not restrict filesystem, process, network, memory, or CPU access.
- The current documentation calls these paths sandboxed.

## Scope

- Inventory every user-controlled evaluation path, centralize the policy and
  evaluation boundary, and gate all unsafe paths consistently.
- Validate complete Julia `Expr` syntax against profile-specific allowlists and
  evaluate the same accepted subtree; do not build a private interpreter.
- Preserve safe primitive conversion and the existing known-function allowlist.
- Add this plan to `plans/followups/08-code-evaluation-security.md`.

## Implementation

1. Use one clearly named policy helper/configuration flag. Evaluation is off in
   every environment unless an operator explicitly opts in with `true`.
2. Apply the guard to HTTP evaluation endpoints and every payload-driven
   Custom Function, numeric, Symbolic, and query path; do not leave an endpoint
   bypass.
3. Return a stable, documented API error when disabled and avoid leaking evaluated exception internals in production responses.
4. Expose enough capability information for the GUI to disable or explain unavailable evaluation controls rather than failing mysteriously.
5. Replace all claims of a secure sandbox with precise warnings and deployment guidance.
6. Parse complete source, validate the exact `Expr` against profile-specific
   catalogs and limits, and evaluate that same subtree only at the central
   `Sandbox` boundary in a fresh bare module.
7. Remove ordinary-parameter and background-noise fallback evaluation.
8. Add tests for default denial in every environment, explicit opt-in, and safe
   non-eval parameter conversion.

## Evaluation surface inventory

The single `WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` policy covers:

- direct code validation through `POST /test_code`;
- symbolic validation through `POST /test_symbolic_expression`;
- numeric validation through `POST /test_numeric_expression`;
- Custom Function/Lambda validation and protocol or Variable construction;
- symbolic source conversion outside safe tagged States Zoo recipes;
- tagged `Float64` and `Int64` numeric expressions during validation and each
  concrete protocol assignment; and
- custom tag-query predicate construction and invocation.

Ordinary parameter and background-noise fallback evaluation is removed.

Numeric literals, intrinsic values, known-function allowlist choices, named-tag
catalog choices, and structured States Zoo recipes do not require unsafe
evaluation. Saved expression source remains readable while the capability is
disabled, but it cannot be validated or executed.

Numeric previews are transient. Projects must not persist computed results,
errors, node-name maps, placement, or edge physical context. Script export may
parse numeric source and emit the lexical runtime context, but must never
execute the source in the server. Runtime and export must both cast through the
authoritative `Float64` or `Int64` constructor member, evaluate expression
Variables independently at every assignment, and fail explicitly instead of
falling back to a constructor default.

`source_validation.jl` owns the pure parser/validator, context and capability
catalogs, complexity limits, and `/source_language` metadata. `Sandbox.jl`
owns the only user-source `Core.eval` call. Script Export invokes validation
only and remains available while evaluation is disabled.

## Verification

- Run backend unit and integration suites in test mode.
- Run focused checks proving every raw eval surface is denied by default in
  development, test, production, and unknown environments.
- Run GUI build and relevant code/symbolic editor tests for both capability states.
- Run `git diff --check` and inspect logs/responses for secret or stack-trace leakage.

## Non-goals

- Do not claim AST validation or a temporary module is a security boundary.
- Do not promise operation metering, checked intermediate arithmetic, memory
  limits, or an in-process timeout.
- Do not build a containerized multi-tenant execution service in this PR.
