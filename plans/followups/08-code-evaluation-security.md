# Plan 08: Gate unsafe Julia code evaluation

## Goal

Make production deployment safe by default: raw Julia evaluation must be explicitly enabled and must never be described as a security sandbox.

## Evidence

- `/test_code`, `/test_symbolic_expression`, lambda creation, symbolic handling, and fallback parameter conversion reach `Base.eval` or `eval` in the server process.
- A fresh module isolates names but does not restrict filesystem, process, network, memory, or CPU access.
- The current documentation calls these paths sandboxed.

## Scope

- Inventory every user-controlled evaluation path, centralize a production-safe policy, and gate all unsafe paths consistently.
- Preserve safe primitive conversion and the existing known-function allowlist.
- Add this plan to `plans/followups/08-code-evaluation-security.md`.

## Implementation

1. Introduce one clearly named policy helper/configuration flag. Default unsafe evaluation off in production and on only in development/test unless an operator explicitly opts in.
2. Apply the guard to HTTP evaluation endpoints and to payload-driven lambda, symbolic, and fallback eval paths; do not leave an endpoint bypass.
3. Return a stable, documented API error when disabled and avoid leaking evaluated exception internals in production responses.
4. Expose enough capability information for the GUI to disable or explain unavailable evaluation controls rather than failing mysteriously.
5. Replace all claims of a secure sandbox with precise warnings and deployment guidance.
6. Add tests for default production denial, explicit opt-in, dev/test behavior, and safe non-eval parameter conversion.

## Verification

- Run backend unit and integration suites in test mode.
- Run focused production-mode checks proving every raw eval surface is denied by default.
- Run GUI build and relevant code/symbolic editor tests for both capability states.
- Run `git diff --check` and inspect logs/responses for secret or stack-trace leakage.

## Non-goals

- Do not claim AST filtering or a temporary module is a secure sandbox.
- Do not build a containerized multi-tenant execution service in this PR.
