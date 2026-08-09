## ADDED Requirements

### Requirement: bge-embed Memory-Limit ueber gemessenem Peak

The system SHALL run the `bge-embed` Deployment with a `limits.memory` of at least
3Gi, keeping the llama.cpp batch parameters `-np 4 -ub 8192` unchanged, so that the
embedding server survives a 64-embedding batch load without an OOMKilled restart.

#### Scenario: Batch-Last ohne OOMKilled

- **GIVEN** the `bge-embed` Deployment in `k3d/llm-gpu.yaml` has `limits.memory: 3Gi`
- **WHEN** a 64-embedding batch is sent to the embedding gateway
- **THEN** the container stays within the memory limit and does not restart with
  `reason=OOMKilled`

#### Scenario: Batch-Parameter bleiben erhalten

- **GIVEN** the `bge-embed` Deployment in `k3d/llm-gpu.yaml`
- **WHEN** the llama.cpp server starts
- **THEN** it runs with `-np 4 -ub 8192` so the throughput for the T002572 benchmark
  is preserved
