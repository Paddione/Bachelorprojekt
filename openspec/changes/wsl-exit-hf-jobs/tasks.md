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

- [x] **Bestand aufnehmen.** `ls scripts/finetune/`, Taskfile.finetune.yml und
      bestehende Doku lesen (Skill finetune-run referenziert T002587/T002606-
      Artefakte: eval_harness.py, train.py etc.).
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Belegt durch das Ergebnis: README und Taskfile auf `main` tragen den HF-Jobs-Pfad.
- [x] **Doku.** Primärer Pfad: HF Jobs mit UV-Inline-Scripts (PEP 723),
      Trackio-Monitoring, GGUF-Export in den Registry-Pfad; lokale
      ~/.venvs-Pfade als deprecated kennzeichnen.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `scripts/finetune/README.md` nennt HF Jobs (4 Treffer).
- [x] **Taskfile.** Für jeden bestehenden Trainings-/Export-Target eine hf-jobs-
      Variante (CLI-Aufruf des UV-Scripts); lokale Targets behalten
      `deprecated: true`-Kommentar. Keine Secrets im Taskfile.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `taskfiles/Taskfile.finetune.yml:106,124` führt `hf-jobs:train` und `hf-jobs:export`.
      Der Pfad weicht von der File-Structure oben ab (`taskfiles/`, nicht Repo-Wurzel).
- [x] **BATS-Test.** Assertions: README erwähnt HF Jobs als primär;
      Taskfile.finetune.yml enthält hf-jobs-Targets und keine hardcoded
      Hostnamen/API-Keys.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `tests/spec/finetune-hf-jobs.bats` liegt auf `main`.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).**
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Test-Datei auf `main`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune-hf-jobs.bats
# expected: FAIL (red — HF Jobs path not documented/wired yet)
```

- [x] **Fix-Step (GREEN).**
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      README, Taskfile und Test liegen gemeinsam auf `main`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune-hf-jobs.bats
```

- [x] **Final Verification.** Die drei Pflicht-Gates:
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Über den gemergten PR belegt (Repo-Regel 4: CI grün vor Merge).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
