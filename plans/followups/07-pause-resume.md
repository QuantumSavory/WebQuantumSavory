# Plan 07: Repair pause and resume execution

## Goal

Make simulation runs observable and cooperatively pausable while they are in progress, then make the serial Playwright workflow deterministic.

## Evidence

- `/run_simulation` executes `WebQuantumSavory.run_simulation` synchronously.
- The run loop advances a long CPU-bound sequence without yielding to other request tasks.
- The GUI intentionally fires the run request in the background and polls, but the 1000-unit run completes before `/pause_simulation` is handled.
- The current end-to-end result is 8 passed, 1 failed, and 1 skipped.

## Scope

- Introduce a clear asynchronous HTTP contract backed by cooperative Julia task execution.
- Preserve ConcurrentSim single-threaded safety, prevent duplicate runs, and keep lifecycle flags consistent.
- Update Swagger, integration tests, GUI handling, and Playwright expectations together.
- Add this plan to `plans/followups/07-pause-resume.md`.

## Implementation

1. Define the run endpoint response semantics (prefer immediate accepted/started response) and set running state before returning to eliminate start races.
2. Execute the simulation in a supervised task and yield between simulation steps so polling and pause requests can run without moving ConcurrentSim objects across threads.
3. Prevent overlapping run tasks and preserve errors, timeout blocking, logs, pause state, resume target, and cleanup behavior.
4. Make pause acknowledgement reflect backend state, and make resume continue from current simulation time to the existing cumulative target.
5. Remove noisy per-step debug output that makes long runs impractical.
6. Update backend unit/integration tests and the serial Playwright test to wait on state transitions rather than arbitrary sleeps.

## Verification

- Run backend unit and integration suites.
- Run the full Chromium Playwright suite repeatedly; require all tests to pass without skipped successors.
- Exercise duplicate-run, pause-before-start, pause, resume, completion, stop/destroy, and task-error paths.
- Run the production build and `git diff --check`.

## Non-goals

- Do not move QuantumSavory simulation mutation onto multiple threads.
- Do not add a general job queue or persistence layer.
