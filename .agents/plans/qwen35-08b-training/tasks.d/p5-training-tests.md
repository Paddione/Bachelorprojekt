---
id: P5
role: tests
ticket: T900979
depends_on:
  - P1
  - P2
  - P3
  - P4
target_files:
  - tests/spec/llm-local-dev/
---

# P5 — Training-Tests & Verifikation (T900979)

## Ziel

Testabdeckung für den 0.8B-Trainingslauf (Minimal Slice Filter, 0.8B Modellkonfiguration, Viability-Gate, Export-Block-Count 24) auf Fixtures ohne GPU- und Netzwerkabhängigkeit.

## Betroffene Dateien

- `tests/spec/llm-local-dev/`

## Concrete Steps

1. PFLICHT-Failing-Test: neuen Testfall in `tests/spec/llm-local-dev/qwen35-08b-training.bats` anlegen, der die 0.8B-Konfiguration und Viability-Kriterien prüft; zuerst `bats tests/spec/llm-local-dev/qwen35-08b-training.bats` ausführen (expected: FAIL before implementation).
2. Slice-Unit-Tests: Überprüfung des `--slice-08b` Filters auf mechanische Domains und Anker.
3. Config- und Preflight-Tests: Überprüfung der 0.8B-Model-Specs in `train_5070ti.py`.
4. Viability-Gate-Tests: Simulation von Eval-Ergebnissen (bestanden vs. nicht bestanden).
5. Export-Tests: Validierung des 24-Block-Counts und #24737 Handlings.
6. GREEN: BATS-Tests erneut ausführen bis alle Tests grün sind (`bats tests/spec/llm-local-dev/qwen35-08b-training.bats`).
7. Abschließende Verifikation: `task test:changed` ausführen.

## Gate

- `bats tests/spec/llm-local-dev/qwen35-08b-training.bats` meldet PASS.
- `bash scripts/plan-lint.sh .agents/plans/qwen35-08b-training/tasks.md` meldet PASS.

## Disjunktheit

P5 schreibt ausschließlich Testdateien unter `tests/spec/llm-local-dev/`. P1–P4 schreiben keine Tests.
