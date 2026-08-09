## ADDED Requirements

### Requirement: bge CPU thread count is declared explicitly

The `bge-embed` and `bge-rerank` Deployments in `k3d/llm-gpu.yaml` SHALL pass an
explicit `-t <threads>` argument to llama.cpp. The declared thread count SHALL NOT
exceed the allocatable CPU core count of the smallest node the pod can be scheduled
onto, because the Deployments carry no `nodeSelector` or `affinity` and may land on
any Ready node of the cluster.

#### Scenario: Manifest declares a thread count

- **GIVEN** the manifest `k3d/llm-gpu.yaml`
- **WHEN** the args of the `llama-cpp` container of `bge-embed` and of `bge-rerank`
  are read
- **THEN** each contains a `-t` flag followed by a positive integer

#### Scenario: Thread count fits the smallest schedulable node

- **GIVEN** a cluster whose smallest Ready node has N allocatable CPU cores
- **WHEN** the declared `-t` value is compared against N
- **THEN** the declared value is less than or equal to N

### Requirement: bge CPU limit permits opportunistic burst

The `bge-embed` and `bge-rerank` containers SHALL declare `limits.cpu` above their
`requests.cpu`, so that batch embedding can burst beyond the guaranteed share while
the scheduling footprint stays unchanged.

#### Scenario: Limit exceeds request

- **GIVEN** the resource block of either bge container
- **WHEN** `requests.cpu` and `limits.cpu` are compared
- **THEN** `requests.cpu` is `1000m` and `limits.cpu` is strictly greater

#### Scenario: Raising the limit does not change scheduling

- **GIVEN** a change that raises only `limits.cpu`
- **WHEN** the rendered manifest is diffed against the previous revision
- **THEN** `requests.cpu` is unchanged, so the scheduler's placement decision is
  unaffected and the change is a burst-headroom decision only

### Requirement: Embedding throughput is measurable and reproducible

The repository SHALL provide a benchmark entry point that measures embedding
throughput against the `llm-gateway-embed` Service with a fixed document count and
a fixed document size, and reports both `chunks/s` and the document size the figure
refers to.

#### Scenario: Benchmark reports throughput with its measurement basis

- **GIVEN** a reachable `llm-gateway-embed` Service
- **WHEN** the benchmark entry point is invoked
- **THEN** it prints the achieved `chunks/s` together with the document count, the
  approximate tokens per document and the batch size used

#### Scenario: Benchmark run invalidated by a container restart

- **GIVEN** a benchmark run against `bge-embed`
- **WHEN** the container restart counter increases during the run
- **THEN** the run is reported as invalid rather than as a throughput figure
