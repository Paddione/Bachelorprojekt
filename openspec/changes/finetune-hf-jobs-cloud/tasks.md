---
title: "finetune-hf-jobs-cloud — Implementation Plan"
ticket_id: T016438
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# finetune-hf-jobs-cloud — Implementation Plan

_Ticket: T016438_

## File Structure

```
scripts/finetune/README.md                     # Abschnitt „HF Jobs Cloud (WSL-Exit)“
taskfiles/Taskfile.finetune.yml                # Cloud-Targets + Deprecated-Hinweise
tests/spec/finetune/hf-jobs-cloud.bats         # NEU (statische Struktur-Checks)
openspec/changes/finetune-hf-jobs-cloud/       # Proposal + Delta (liegt vor)
```

## Kontext

- Pipeline heute: `measure → guard → train → export` (Namespace `finetune`,
  inkludiert aus Taskfile.yml); Skripte unter `scripts/finetune/`.
- Cloud-Muster im Repo vorhanden: Skills `huggingface-llm-trainer` /
  `unsloth-buddy` (UV-Scripts PEP 723, Trackio, HF Jobs).
- Registry-Pfad: `scripts/finetune/model-registry.sh` + `registry-db.sql`
  — unverändert.
- Keine WSL-Venv-Migration: Venvs sterben mit dem Host.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Neue Datei
      `tests/spec/finetune/hf-jobs-cloud.bats`, statische Checks nach
      Repo-Stil (vgl. agent-lock-fetch-guard.bats):
      1. Taskfile.finetune.yml enthält Cloud-Target(s)
         (`grep -E 'train:cloud|export:cloud'` bzw. final gewählte Namen).
      2. README.md enthält Abschnitt „HF Jobs Cloud“.
      3. Lokale Targets weiterhin deklariert (measure/guard/train/export).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune/hf-jobs-cloud.bats
# expected: FAIL (red — Targets und README-Abschnitt existieren noch nicht)
```

- [ ] **Fix-Step (GREEN).** Doku-Abschnitt + Targets implementieren;
      Deprecated-Hinweis in den desc-Feldern der lokalen Targets.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/finetune/hf-jobs-cloud.bats
# expected: PASS (green)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Nachbarsuiten wegen gemeinsamer Datei:
`tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-training-env/`
