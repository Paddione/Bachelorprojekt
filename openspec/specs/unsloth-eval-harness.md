# unsloth-eval-harness

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu unsloth-eval-harness ergänzen._

## Requirements

### Requirement: Paired Base-Versus-Tuned Measurement

The system SHALL evaluate an adapter against its own base model on the identical test set, with
identical decoding parameters and identical prompt construction. The system SHALL emit a
machine-readable result containing the per-case and aggregate score for both the base model and the
adapted model.

#### Scenario: Both models are scored on the same cases

- **GIVEN** an adapter and its base model identifier
- **WHEN** the harness runs
- **THEN** the emitted result contains, for every test case, a base score and a tuned score
- **AND** the decoding parameters recorded for both runs are identical

#### Scenario: Missing base model identifier is refused

- **GIVEN** an adapter whose base model cannot be determined
- **WHEN** the harness runs
- **THEN** it exits non-zero naming the missing base model, and produces no partial verdict

### Requirement: Test Set Covers Negative And Underspecified Cases

The test set SHALL contain at least forty cases, partitioned into cases where an action is correct,
cases where no action is correct, and cases where a clarifying question is correct. Each partition
SHALL be reported separately in the result.

#### Scenario: Partitions are reported separately

- **GIVEN** a completed evaluation
- **WHEN** the result is emitted
- **THEN** it contains a separate aggregate for the action, no-action and clarification partitions

#### Scenario: A test set below the minimum size is refused

- **GIVEN** a test set with fewer than forty cases
- **WHEN** the harness runs
- **THEN** it exits non-zero naming the shortfall

### Requirement: Test Cases Are Unseen By Training

The test set SHALL NOT contain material drawn from any corpus used for training. The harness SHALL
be able to report the provenance of its test set so that overlap can be audited.

#### Scenario: Provenance is reported

- **GIVEN** a completed evaluation
- **WHEN** the result is emitted
- **THEN** it names the provenance of the test set

### Requirement: Language Control

Every test case SHALL exist in both the language of the training corpus and the intended usage
language, and the result SHALL report the aggregate per language.

#### Scenario: Per-language aggregates are reported

- **GIVEN** a completed evaluation
- **WHEN** the result is emitted
- **THEN** it contains one aggregate per language for both the base and the adapted model

### Requirement: Regression Gate Blocks Delivery

The harness SHALL exit non-zero when the adapted model's aggregate score is below the base model's
aggregate score. Downstream delivery steps SHALL treat this exit status as blocking.

#### Scenario: A regressed adapter fails the gate

- **GIVEN** an adapter whose aggregate score is below its base model's aggregate score
- **WHEN** the harness runs
- **THEN** it exits non-zero and names the partitions in which the regression occurred

#### Scenario: A non-regressed adapter passes the gate

- **GIVEN** an adapter whose aggregate score is at least its base model's aggregate score
- **WHEN** the harness runs
- **THEN** it exits zero

### Requirement: Test Cases Are Data, Not Code

Test cases SHALL be stored as data files, so that cases can be added or amended without changing the
harness implementation.

#### Scenario: A new case requires no code change

- **GIVEN** an additional test case appended to the test-set data file
- **WHEN** the harness runs
- **THEN** the new case is evaluated and appears in the result without any change to the harness
  implementation

<!-- merged from change delta unsloth-eval-harness.md (506ec5a0d3d0) -->

### Requirement: Tandem-Kleinstmodell-Evaluation ist dokumentiert

The system SHALL eine begründete Modell-/Rollen-Empfehlung für Tandem-
Kleinstmodelle (≤ 8B) zum FreeToken-Residentmodell pflegen, gestützt auf
eine strukturierte Kandidaten-Matrix und einen Trainingsplan je Empfehlung.

#### Scenario: Kandidaten-Matrix deckt alle Rollen ab

- **GIVEN** die Kandidaten-Matrix `docs/finetune/tandem-candidates.json`
- **WHEN** sie gegen die drei Rollen (draft, router, worker) geprüft wird
- **THEN** enthält jede Rolle mindestens einen bewerteten Kandidaten mit Verdict

#### Scenario: Draft-Empfehlung respektiert Tokenizer-Match

- **GIVEN** ein Kandidat ist als Draft-Modell empfohlen
- **WHEN** seine Kriterien geprüft werden
- **THEN** ist Tokenizer/Vocab-Kompatibilität mit dem Residentmodell
  als erfüllt dokumentiert (hartes Kriterium)

#### Scenario: Empfehlungen bleiben innerhalb der Ressourcengrenzen

- **GIVEN** alle empfohlenen Modelle
- **WHEN** ihre Parameterzahl und ihr QLoRA-Trainingsfit geprüft werden
- **THEN** liegt jeder bei ≤ 8B Parametern mit GGUF-Exportfähigkeit
  und VRAM-Fit auf 16 GB geteilt mit Serving

<!-- merged from change delta unsloth-eval-harness.md (7058b4654a6f) -->