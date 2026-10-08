---
title: "Instruct-Worker-Testset: Plan-Stufen zu Aktionen"
ticket_id: T901286
domains: [finetune, tests]
status: active
file_locks: [scripts/finetune/testsets/instruct-worker.jsonl, scripts/finetune/eval_scoring.py, scripts/finetune/testsets/README.md, tests/spec/unsloth-eval-harness/worker-testset.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# instruct-worker-testset — Implementation Plan

Neues action-only Worker-Testset für Instruct-Modelle (Stufenpläne
ausführen, immer Aktionen emittieren). Begründung, verworfene Optionen und
Prior-Art in `proposal.md` (User-Entscheidung 2026-10-08, T901286).

## File Structure

- `scripts/finetune/testsets/instruct-worker.jsonl` (neu, Ziel ≥40 Zeilen):
  20+ Szenarien × en/de (`pair_id`-Paare), alle `class=action`, Requests im
  Plan-Stufen-Stil, inkl. Multi-Action-Sets; alle 10 generischen Actions aus
  dem Domänenvorrat von `agent-actions.jsonl`; Entitäten disjunkt zu Seeds
  und altem Set; `provenance: handwritten-not-in-training-corpus`.
- `scripts/finetune/eval_scoring.py` (205 Zeilen, kein S1-Baseline-Eintrag):
  `validate_testset` fordert ≥1 statt 3 Partitionen (≥40 + Paar-Regel
  unverändert). Delta <10 Zeilen.
- `scripts/finetune/testsets/README.md`: Worker-/Orchestrator-Trennung +
  neue Validierungsregel dokumentieren.
- `tests/spec/unsloth-eval-harness/worker-testset.bats` (neu): neues Set
  besteht `validate-testset`; `agent-actions.jsonl` besteht weiter;
  Multi-Action-Spot-Check über `eval_scoring.py score`.

## Quality budgets

Keine geänderte Datei in `docs/code-quality/baseline.json`
(Finetune-Sektion leer) — keine S1-Schwelle. `.jsonl/.md/.bats` ohne
statische Limits; `.py`-Delta <10 Zeilen. S2: keine TS-Imports. S3: keine
Brand-Literale (generische Produktivitäts-Domäne). S4: neues Set über
`eval-runner.sh --testset` erreichbar. Keine Ignore-Ausnahme.

## Tasks

- [ ] **1. Failing-Test schreiben und expected FAIL beobachten.**
  `tests/spec/unsloth-eval-harness/worker-testset.bats` neu anlegen:
  `validate-testset` auf (noch nicht existiertem) `instruct-worker.jsonl`
  per `tests/unit/lib/bats-core/bin/bats` laufen lassen — expected FAIL
  (Datei fehlt); danach Datei anlegen und Fälle ergänzen bis grün.
- [ ] **2. Worker-Cases schreiben (20+ Szenarien × en/de).** Plan-Stufen-
  Requests, Single- und Multi-Action, vollständige Params, alle 10 Actions,
  Leakage-Check gegen Seeds/`agent-actions.jsonl` (exakte Request-Texte).
- [ ] **3. Validator öffnen.** `validate_testset`: ≥1 Partition genügt;
  bestehende Fehlermeldungen für Größe/Paare unverändert lassen.
  `agent-actions.jsonl` muss weiter validieren (Regressionsschutz).
- [ ] **4. README + GREEN.** Doku nachziehen; neue BATS-Datei plus volle
  `unsloth-eval-harness/`-Suite grün; `task test:changed`.
- [ ] **5. Verify: Adapter re-gaten (Beleg, kein Commit).** V2Eval-Adapter
  (`/tmp/opencode/tune-35instruct-60steps-v2/adapter`) per
  `run_tuned_fixed.py`-Pfad (thinking off, 512 Tokens) gegen das neue Set
  werten und Quote ins Ticket schreiben. Danach `task test:changed`,
  `task freshness:regenerate`, `task freshness:check`.
