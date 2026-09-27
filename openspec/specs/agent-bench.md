# agent-bench

## Purpose

Der agent-bench misst reproduzierbar, wie gut lokale und entfernte Modelle die Agentenrollen Planner, Orchestrator, Code-Worker, Vision-Worker und Reviewer einzeln und in Kombination erfüllen, erkennt Regressionen gegen eine Baseline und exportiert saubere Trajektorien als Trainingsdaten.

## Requirements

### Requirement: Role Selection At Startup

The bench SHALL support the roles `planner`, `orchestrator`, `code-worker`, `vision-worker` and `reviewer`. The operator SHALL select the roles to measure at startup; roles that were not selected SHALL NOT be executed and SHALL NOT appear in the report.

#### Scenario: Only selected roles are measured

- **GIVEN** a case set covering all five roles
- **WHEN** the operator runs the bench with `--roles orchestrator,code-worker`
- **THEN** the run contains results only for `orchestrator` and `code-worker`
- **AND** the report lists no planner, vision-worker or reviewer scores

#### Scenario: Unknown role is refused

- **GIVEN** any case set
- **WHEN** the operator passes `--roles planer`
- **THEN** the bench exits with a configuration error before any model is loaded

### Requirement: Cases Are Grounded In Real Events

Every case SHALL reference the real event it is derived from (archived change, bug ticket, incident or commit). Every case SHALL provide one or more variants, each declaring a perspective from `clean`, `ambiguous`, `faulty-worker`, `conflicting`, `detour-trap` or `vision`, the roles it exercises, a reference budget and hidden checks. Cases SHALL be data; adding a case SHALL NOT require a code change.

#### Scenario: Case without source event is rejected

- **GIVEN** a case directory without a source-event reference
- **WHEN** the bench loads its case set
- **THEN** the bench exits with a validation error naming that case

#### Scenario: New case needs no code change

- **GIVEN** a new valid case directory is added
- **WHEN** the bench runs
- **THEN** the new case is executed without any change to the bench code

### Requirement: Isolated And Chained Role Execution

In isolated mode each role SHALL receive the reference artifacts of the preceding stage (reference plan, reference partial, reference diff) instead of another model's output. In chained mode the stages SHALL pass real intermediate results from one role to the next.

#### Scenario: Worker is measured on the reference partial

- **GIVEN** a variant with a reference plan
- **WHEN** the code-worker role runs in isolated mode
- **THEN** the worker receives the reference partial, not a partial produced by a planner under test

#### Scenario: Chained mode passes the real plan

- **GIVEN** model A as planner and model B as orchestrator in chained mode
- **WHEN** the run executes
- **THEN** model B executes the plan produced by model A

### Requirement: Deterministic Score Vector

Each role run SHALL be scored as a vector of outcome (0 to 1), errors, detours and effort relative to the variant's reference budget, and as a combined score derived from that vector with the weights of a versioned scoring configuration. Scoring SHALL be deterministic: identical traces and identical scoring version SHALL yield identical scores. Every result SHALL carry the scoring version, and results with different scoring versions SHALL NOT be compared.

#### Scenario: Same trace yields same score

- **GIVEN** a recorded trace and scoring version 3
- **WHEN** the trace is scored twice
- **THEN** both score vectors and combined scores are identical

#### Scenario: Detour lowers the score

- **GIVEN** two traces of the same variant with equal outcome and errors
- **WHEN** one trace edits a file outside the partial's target files
- **THEN** that trace has a higher detour count and a lower combined score

#### Scenario: Ambiguous variant requires a clarification

- **GIVEN** a variant with perspective `ambiguous`
- **WHEN** the planner produces a plan instead of asking for clarification
- **THEN** the planner's outcome is 0 and an error is recorded

#### Scenario: False pass weighs more than false fail for the reviewer

- **GIVEN** one reviewer run approving a seeded defective diff and one rejecting a clean diff
- **WHEN** both are scored
- **THEN** the false approval receives the larger deduction

### Requirement: Combination Matrix Over A Model Pool

The bench SHALL read its candidate models from a model pool configuration declaring endpoint or loadout, GPU and capabilities. A role SHALL only be assigned to models whose capabilities cover it. Stage results SHALL be cached per variant, model and repetition so that every planner output is executed by every selected execution assignment without re-planning. Execution assignments SHALL only combine models that can be resident at the same time.

#### Scenario: Vision role skips models without vision

- **GIVEN** a model pool where only one model declares vision capability
- **WHEN** the vision-worker role runs
- **THEN** only that model is assigned to it

#### Scenario: Plans are reused across executors

- **GIVEN** two planners and three execution assignments
- **WHEN** a full run completes
- **THEN** each planner planned each variant once per repetition
- **AND** each plan was executed by all three execution assignments

### Requirement: Report With Marginal, Compatibility And Discovery Views

The report SHALL show, per role and model, the marginal score over all partners; a compatibility matrix of planner × execution and worker × reviewer with the interaction effect per cell; and a list of combinations that outperform every homogeneous assignment of their members. The report SHALL list infrastructure errors separately and SHALL NOT count them against a model. The report SHALL include the executable commands and the revision that produced it.

#### Scenario: Infrastructure error is not blamed on the model

- **GIVEN** a run where the model server crashed during one variant
- **WHEN** the report is generated
- **THEN** that variant appears under infrastructure errors
- **AND** the model's score for it is not counted as a failure

#### Scenario: Mixed combination is highlighted

- **GIVEN** model A planning and model B executing scores higher than A-only and B-only
- **WHEN** the report is generated
- **THEN** the combination A→B is listed as a discovery

### Requirement: Paired Regression Gate

The bench SHALL compare a run against a stored baseline run per variant and role, using only cases with `split: eval`. The gate SHALL exit non-zero when any role's score drops by more than the noise threshold derived from the repetitions, and SHALL exit zero otherwise. Runs with differing scoring versions SHALL be refused.

#### Scenario: Regression fails the gate

- **GIVEN** a baseline run and a new run where the orchestrator score dropped beyond the noise threshold
- **WHEN** the gate runs
- **THEN** it exits non-zero and names the regressed role

#### Scenario: Mismatched scoring version is refused

- **GIVEN** a baseline scored with version 2 and a run scored with version 3
- **WHEN** the gate runs
- **THEN** it exits with a configuration error instead of a verdict

### Requirement: Recorded Traces In A Neutral Format

Every request and response of every role SHALL be recorded, attributed to its role, in the OpenAI chat format including tool calls, reasoning content, usage and timing. Images SHALL be stored as content-addressed files, not inline. Secrets SHALL be redacted before a trace is written, and every redaction SHALL be marked. Each run SHALL store a manifest with revision, scoring version, model pool hash, seed, profile and server command lines.

#### Scenario: Secret is redacted in the trace

- **GIVEN** a worker response containing a token matching the repository's secret patterns
- **WHEN** the trace is written
- **THEN** the stored trace contains a redaction marker instead of the token

#### Scenario: Image is stored by content hash

- **GIVEN** a vision-worker request with a screenshot
- **WHEN** the trace is written
- **THEN** the trace references the image by its SHA-256 file name and contains no base64 image data

### Requirement: Training Corpus Export Without Contamination

The corpus export SHALL emit, per variant and role, the best clean trajectory (outcome 1, no errors, no detours; ties broken by fewer tokens), SHALL emit preference pairs of best and worst trajectory per variant and role, and SHALL list variants without a clean trajectory as gaps. The export SHALL only use cases marked `split: train`. The split SHALL be assigned per source event, so that variants of one event never appear in both splits.

#### Scenario: Eval cases never reach the corpus

- **GIVEN** runs over cases with `split: eval` and `split: train`
- **WHEN** the corpus is exported
- **THEN** no exported example originates from a `split: eval` case

#### Scenario: Trajectory with a detour is not exported as ideal

- **GIVEN** the only successful trajectory of a variant contains one detour
- **WHEN** the corpus is exported
- **THEN** the variant appears in the gap list and not in the SFT output

### Requirement: Safe GPU Loadout Handling

Before measuring on a GPU loadout the bench SHALL acquire the GPU lock, stop the production orchestrator service and verify the loaded server: an NVFP4 vLLM server SHALL be refused if it fell back to the Marlin kernel, and any server SHALL be refused if device memory exceeds the host's spill threshold. After the run, including aborted and failed runs, the bench SHALL restore the production orchestrator service and release the lock.

#### Scenario: Production orchestrator is restored after an abort

- **GIVEN** a running bench that stopped the production orchestrator
- **WHEN** the bench is interrupted
- **THEN** the production orchestrator service is running again and the GPU lock is released

#### Scenario: Marlin fallback is refused

- **GIVEN** a vLLM NVFP4 server that selected the Marlin kernel
- **WHEN** the bench verifies the loadout
- **THEN** the bench aborts that loadout as an infrastructure error

### Requirement: Runtime Profiles And Resume

The bench SHALL offer a `quick` profile that completes within one hour on the reference host and a `full` profile covering all variants and combinations with three repetitions. If a full matrix exceeds its budget, the bench SHALL sample it with a recorded seed and SHALL state the sampling in the report. An interrupted run SHALL resume from its persisted state without repeating completed stage results.

#### Scenario: Resume skips completed stages

- **GIVEN** a run interrupted after its planning stage completed
- **WHEN** the operator resumes it
- **THEN** no plan is regenerated and execution continues with the cached plans

### Requirement: Finetune Readiness Inventory

The repository SHALL document, per model family in the pool (Qwen3.5-4B, Qwen3.8-27B, Gemma-4-12B), the base checkpoint, a chat template carrying the generation marker, the training precision, the training location (local GPU or HF Jobs), the export target (GGUF or vLLM) and whether vision training is supported, and SHALL mark every missing item as a gap.

#### Scenario: Missing template is shown as a gap

- **GIVEN** a model family without a patched chat template
- **WHEN** the inventory is read
- **THEN** that family's template entry is marked as a gap

<!-- merged from change delta agent-bench.md (b6c417461c6d) -->