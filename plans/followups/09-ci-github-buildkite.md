# Plan 09: Add GitHub Actions and Buildkite CI

## Goal

Run the maintained backend, integration, frontend build, and browser tests in both GitHub Actions and Buildkite with shared, readable commands.

## Evidence

- The repository has no checked-in test CI; only GitHub-managed CodeQL currently runs.
- Backend tests use a separate Julia environment and are working-directory-sensitive.
- Integration and Playwright suites require a live backend, a generated GUI, and deterministic server teardown.

## Scope

- Add a GitHub Actions workflow and `.buildkite/pipeline.yml` covering equivalent required checks.
- Use Julia 1.12 and a supported LTS Node release; install Playwright Chromium and required Linux libraries reproducibly.
- Add this plan to `plans/followups/09-ci-github-buildkite.md`.

## Implementation

1. Factor only genuinely shared orchestration into small `ci/` shell scripts so local, GitHub, and Buildkite commands do not drift.
2. Run backend unit tests, frontend version/build checks, backend integration tests, and the full headless Chromium suite.
3. Start the backend with bounded readiness polling, capture useful logs on failure, and always terminate it cleanly.
4. Configure GitHub Actions for pull requests and pushes to `main`, with dependency caches, concurrency cancellation, least-privilege permissions, and pinned major action versions from official publishers.
5. Configure Buildkite with equivalent steps, provision Julia and Node.js through the JuliaCI and official mise plugins, install browser system dependencies through Playwright, and document the smaller remaining agent baseline. Use official Buildkite syntax and avoid organization-specific secrets or queue names.
6. Keep generated manifests, Vite output, Playwright results, and logs uncommitted; upload diagnostic artifacts only on failures where supported.
7. Document how to run each CI check locally and how Buildkite agents must be provisioned.

## Verification

- Run every shared CI script locally from a clean dependency state.
- Strict-parse the Buildkite pipeline with the official agent and validate the GitHub workflow YAML with available tooling.
- Push the draft PR and inspect both GitHub Actions and Buildkite configuration/check discovery.
- Require backend unit/integration, frontend build, and full Playwright results to be represented in both systems.

## Non-goals

- Do not add deployment/release automation.
- Do not embed credentials, assume a private Buildkite queue, or duplicate large shell programs in YAML.
