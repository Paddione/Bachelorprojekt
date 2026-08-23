---
title: "tandem-small-models — Implementation Plan"
ticket_id: T015248
domains: [llm, finetune, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# tandem-small-models — Implementation Plan

_Ticket: T015248 · Tandem-Kleinstmodelle-Evaluation (Research-Deliverable)_

## File Structure

```
docs/finetune/tandem-candidates.json                          # new: Kandidaten-Matrix (strukturiert)
docs/finetune/tandem-model-evaluation.md                      # new: Empfehlung + Trainingsplan
tests/spec/unsloth-eval-harness/tandem-candidates.bats        # new: Guard-Test gegen beide Artefakte
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-candidates-matrix.md | research | docs/finetune/tandem-candidates.json | |
| p2 | tasks.d/p2-evaluation-doc.md | docs | docs/finetune/tandem-model-evaluation.md | p1 |
| p3 | tasks.d/p3-guard-test.md | tests | tests/spec/unsloth-eval-harness/tandem-candidates.bats | p1, p2 |

## Kontext für alle Partials

- Pipeline-Basis: `scripts/finetune/` (train.py, export_gguf.py, eval_harness.py,
  measure_corpus.py); Lauf 1 = Qwen-3.5-Text-4B-LoRA (`outputs/lauf1-*`).
- Rollen: (a) Draft für Speculative Decoding — Tokenizer/Vocab-Match mit dem
  Residentmodell ist HART (design.md D3); (b) Router/Intent-Classifier;
  (c) Background-Worker (Summarize/Tag/Extract).
- Ressourcen: RTX 5070 Ti 16 GB geteilt mit Serving, QLoRA, sequenziell
  (exclusiveGroup chat-gpu). GGUF-Export via export_gguf.py ins llama.cpp-
  Loadout-Setup; FreeToken serviert GGUF nur für Gemma-Architekturen.
- Eval-Protokoll: eval_harness.py Paired Measurement (SSOT unsloth-eval-harness);
  Router-Rolle über Intent-Micro-Bench auf Factory-Trace-Testset.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Guard-Test in
      `tests/spec/unsloth-eval-harness/tandem-candidates.bats`
      ergänzen und scheitern lassen, solange die Artefakte fehlen
      (Korrektur gegenüber der ursprünglich geplanten Sammeldatei
      `tests/spec/finetune-tandem-eval.bats`: neue `@test`-Blöcke gehören seit
      T002416 in eine eigene Datei unter dem Spec-Verzeichnis des SSOT —
      hier `tests/spec/unsloth-eval-harness/`):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/unsloth-eval-harness/tandem-candidates.bats
# expected: FAIL (red — docs/finetune/-Artefakte existieren noch nicht)
```

- [ ] **Fix-Step (GREEN).** Matrix + Evaluations-Dokument gemäß p1/p2 schreiben;
      Test muss anschließend passieren.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
