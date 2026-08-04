## ADDED Requirements

### Requirement: Sequence-Length Measurement Precedes Model Selection

The system SHALL measure the token-length distribution of the target corpus, rendered through the
target model's own chat template, before any model or `max_seq_length` is fixed. The system SHALL
report median, p90, p95, p99 and maximum, and SHALL report for each candidate `max_seq_length` how
many corpus rows would be truncated.

#### Scenario: Measurement reports truncation loss for a candidate length

- **GIVEN** a corpus identifier and a candidate base model
- **WHEN** the measurement step runs
- **THEN** it emits a JSON report containing median, p90, p95, p99 and maximum token counts
- **AND** for each evaluated `max_seq_length` it reports the absolute and relative number of rows
  that would be truncated

#### Scenario: Model selection is refused without a measurement report

- **GIVEN** no measurement report exists for the requested corpus and model pairing
- **WHEN** a training run is started
- **THEN** the run exits non-zero with a message naming the missing report

### Requirement: Chat Template Byte-Equivalence Is Verified Before Training

The system SHALL train with a chat template that is byte-identical in rendered output to the base
model's Hub template. Where assistant-only loss requires generation markers, the system SHALL
verify byte-equivalence across the entire training corpus before the first training step, and SHALL
abort on any deviation.

#### Scenario: Deviating template aborts the run

- **GIVEN** a patched chat template whose rendered output differs from the Hub template for at
  least one corpus row
- **WHEN** the pre-training verification runs
- **THEN** the run exits non-zero and names the first deviating row and character position

#### Scenario: Saved adapter carries the Hub template

- **GIVEN** a completed training run
- **WHEN** the adapter is written to disk
- **THEN** the adapter's chat template is byte-identical to the base model's Hub template
- **AND** the adapter's chat template contains no generation markers

### Requirement: Assistant-Only Loss for Behaviour Training

The system SHALL compute the training loss only over assistant turns when the training objective is
behavioural (tool calling, response format, refusal behaviour). The system SHALL report the share of
tokens carrying learning signal, and SHALL discard rows whose assistant turn is empty after
truncation.

#### Scenario: Rows without learning signal are discarded

- **GIVEN** a corpus row whose assistant turn falls entirely beyond `max_seq_length`
- **WHEN** the data pipeline runs
- **THEN** the row is excluded from the training set
- **AND** the number of discarded rows is reported

### Requirement: Factory Traces Are Collectable As Training Data

The system SHALL provide a collector that reads completed factory ticket runs from
`tickets.factory_phase_events` and renders them into the training corpus format. The collector SHALL
be restricted to runs whose outcome is recorded as successful, and SHALL exclude any secret material.

#### Scenario: Only successful runs are collected

- **GIVEN** factory phase events containing both successful and failed ticket runs
- **WHEN** the collector runs
- **THEN** only events from successful runs appear in the output corpus

#### Scenario: Collected corpus is consumable by the training pipeline

- **GIVEN** a corpus produced by the collector
- **WHEN** the training data pipeline reads it
- **THEN** it renders without error through the same encode path as the external corpus

### Requirement: Training Capability Is Discoverable By Agents

The system SHALL expose its operations through a Taskfile namespace resolvable by the task oracle,
and SHALL register the repository-local instance in the capability registry so that
`toolset-context.sh` injects it into agent prompts for the roles that may use it.

#### Scenario: Task oracle resolves the training goal

- **GIVEN** the capability is registered
- **WHEN** the task oracle is asked to resolve a fine-tuning goal in plain language
- **THEN** it returns a task from the fine-tuning namespace

#### Scenario: Capability registry exposes the repository instance

- **GIVEN** the capability registry
- **WHEN** the toolset context is rendered for a role permitted to run training
- **THEN** the rendered block names the repository-local fine-tuning instance with its `use_when`
  and `avoid_when` conditions

### Requirement: No Vendored Skill Code In The Repository

The system SHALL NOT contain copies of files owned by an external skill package. Files that
originate from the fine-tuning skill SHALL be invoked from the skill, not duplicated into the
repository tree.

#### Scenario: Repository contains no copied skill runtime

- **GIVEN** the repository tree after this change
- **WHEN** the fine-tuning directory is inspected
- **THEN** it contains no file that is a byte-identical copy of a file shipped by the fine-tuning
  skill package
