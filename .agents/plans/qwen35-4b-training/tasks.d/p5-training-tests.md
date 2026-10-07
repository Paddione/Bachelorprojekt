---
id: P5
role: tests
ticket: T900977
depends_on:
  - P1
  - P2
  - P3
  - P4
target_files:
  - tests/spec/llm-local-dev/
---

# P5 — Training-Tests & Verifikation (T900977)

## Ziel

Testabdeckung für den 4B-Trainingslauf (Preflight-Guards, HF-ID-Auflösung, Export-Pfade, Metriken) auf Fixtures ohne GPU- und Netzwerkabhängigkeit.

## Betroffene Dateien

- `tests/spec/llm-local-dev/`

## Concrete Steps

1. PFLICHT-Failing-Test: neuen Testfall in `tests/spec/llm-local-dev/qwen35-4b-training.bats` anlegen, der die 4B-Konfiguration und Preflight-Validierung prüft; zuerst `bats tests/spec/llm-local-dev/qwen35-4b-training.bats` ausführen (expected: FAIL before implementation).
2. Preflight-Unit-Tests: Überprüfung der GPU-Memory-Abfrage und Abbruch-Logik bei < 12 GB VRAM.
3. Eval-/Export-Tests: Überprüfung der Schwellenwerte aus P3 und der Block-Count-Validierungslogik aus P4 im Trockenlauf.
4. GREEN: BATS-Tests erneut ausführen bis alle Tests grün sind (`bats tests/spec/llm-local-dev/qwen35-4b-training.bats`).
5. Abschließende Verifikation: `task test:changed` ausführen.

## Gate

- `bats tests/spec/llm-local-dev/qwen35-4b-training.bats` meldet PASS.
- `bash scripts/plan-lint.sh .agents/plans/qwen35-4b-training/tasks.md` meldet PASS.

## Disjunktheit

P5 schreibt ausschließlich Testdateien unter `tests/spec/llm-local-dev/`. P1–P4 schreiben keine Tests.
