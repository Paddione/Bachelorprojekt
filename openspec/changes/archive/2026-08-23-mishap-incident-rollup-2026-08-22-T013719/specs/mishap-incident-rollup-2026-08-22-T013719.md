---
title: "mishap-incident-rollup-2026-08-22-T013719 — Mishap-Bundle"
ticket_id: T013719
---

## ADDED Requirements

### Requirement: Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos

The rollup bundle SHALL address the mishap "Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos" (suspicious, skills/repo-hygiene).

#### Scenario: Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos is covered by the bundle

- **GIVEN** a batch entry "Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos" (suspicious, skills/repo-hygiene) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit

The rollup bundle SHALL address the mishap "T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit" (degraded, repo/git-hygiene).

#### Scenario: T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit is covered by the bundle

- **GIVEN** a batch entry "T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit" (degraded, repo/git-hygiene) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration)

The rollup bundle SHALL address the mishap "Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration)" (suspicious, scripts/brain-ingest).

#### Scenario: Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration) is covered by the bundle

- **GIVEN** a batch entry "Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration)" (suspicious, scripts/brain-ingest) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie

The rollup bundle SHALL address the mishap "Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie" (degraded, scripts/brain-ingest-swap.sh).

#### Scenario: Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie is covered by the bundle

- **GIVEN** a batch entry "Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie" (degraded, scripts/brain-ingest-swap.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed

The rollup bundle SHALL address the mishap "factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed" (drift, scripts/llm/loadouts.json).

#### Scenario: factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed is covered by the bundle

- **GIVEN** a batch entry "factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed" (drift, scripts/llm/loadouts.json) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95%

The rollup bundle SHALL address the mishap "Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95%" (degraded, scripts/brain-ingest.sh).

#### Scenario: Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95% is covered by the bundle

- **GIVEN** a batch entry "Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95%" (degraded, scripts/brain-ingest.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv

The rollup bundle SHALL address the mishap "vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv" (degraded, scripts/vda.sh).

#### Scenario: vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv is covered by the bundle

- **GIVEN** a batch entry "vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv" (degraded, scripts/vda.sh) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren

The rollup bundle SHALL address the mishap "T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren" (suspicious, scripts/hygiene worktree cleanup).

#### Scenario: T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren is covered by the bundle

- **GIVEN** a batch entry "T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren" (suspicious, scripts/hygiene worktree cleanup) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile

The rollup bundle SHALL address the mishap "Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile" (drift, tests/bats-conventions).

#### Scenario: Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile is covered by the bundle

- **GIVEN** a batch entry "Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile" (drift, tests/bats-conventions) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap

### Requirement: Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch

The rollup bundle SHALL address the mishap "Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch" (process, repo/git-hooks).

#### Scenario: Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch is covered by the bundle

- **GIVEN** a batch entry "Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch" (process, repo/git-hooks) on the rollup container ticket
- **WHEN** the rollup generator produces the cycle change
- **THEN** the bundle SHALL cover the mishap
