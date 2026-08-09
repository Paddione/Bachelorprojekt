## ADDED Requirements

### Requirement: Local smoke-test tooling picks a deterministic, small model

The BATS suite under `tests/spec/local-llm-proxy/` that launches a short-lived real
`llama-server` process to verify UI-config seeding (`ui-config-seed.bats`) SHALL select the
model file deterministically by size rather than by filesystem enumeration order, and SHALL
exclude auxiliary files (`mmproj-*`, `*draft*`) from that selection, so the test's runtime does
not depend on which model happens to be found first on disk.

#### Scenario: Smallest eligible model file is chosen among multiple candidates

- **GIVEN** multiple `*.gguf` files of different sizes exist under the configured model roots
- **WHEN** the test selects a model to launch the short-lived `llama-server` with
- **THEN** it selects the file with the smallest byte size among the eligible candidates,
  independent of directory traversal order

#### Scenario: Auxiliary model files are never selected

- **GIVEN** the only `*.gguf` files present match `mmproj-*` or `*draft*`
- **WHEN** the test selects a model to launch the short-lived `llama-server` with
- **THEN** no candidate is selected and the caller is told none is available, rather than
  launching `llama-server` with an auxiliary (non-primary) weight file
