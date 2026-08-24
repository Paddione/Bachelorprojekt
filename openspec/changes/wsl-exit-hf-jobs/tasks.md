---
title: "wsl-exit-hf-jobs — Implementation Plan"
ticket_id: T016438
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-hf-jobs — Implementation Plan

_Ticket: T016438_

## File Structure

```
scripts/finetune/README.md        # HF-Jobs-Pfad als primär, lokale Venvs deprecated
Taskfile.finetune.yml             # Targets: hf-jobs-Varianten; lokale markiert
tests/spec/finetune-hf-jobs.bats  # NEU
```

## Tasks

- [ ] **Bestand aufnehmen.** `ls scripts/finetune/`, Taskfile.finetune.yml und
      bestehende Doku lesen (Skill finetune-run referenziert T002587/T002606-
      Artefakte: eval_harness.py, train.py etc.).
- [ ] **Doku.** Primärer Pfad: HF Jobs mit UV-Inline-Scripts (PEP 723),
      Trackio-Monitoring, GGUF-Export in den Registry-Pfad; lokale
      ~/.venvs-Pfade als deprecated kennzeichnen.
- [ ] **Taskfile.** Für jeden bestehenden Trainings-/Export-Target eine hf-jobs-
      Variante (CLI-Aufruf des UV-Scripts); lokale Targets behalten
      `deprecated: true`-Kommentar. Keine Secrets im Taskfile.
- [ ] **BATS-Test.** Assertions: README erwähnt HF Jobs als primär;
      Taskfile.finetune.yml enthält hf-jobs-Targets und keine hardcoded
      Hostnamen/API-Keys.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune-hf-jobs.bats
# expected: FAIL (red — HF Jobs path not documented/wired yet)
```

- [ ] **Fix-Step (GREEN).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune-hf-jobs.bats
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
