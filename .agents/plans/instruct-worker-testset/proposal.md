# Proposal: Instruct-Worker-Testset (T901286)

## Ausgangslage (User-Entscheidung 2026-10-08)

Instruct-Modelle sind Worker: Sie führen Stufenpläne aus und emittieren immer
Aktionen — clarify-/no_action-Verhalten gehört zum Thinking-Orchestrator, nicht
zum Worker. Die clarify-0/12 des V2Eval-Adapters sind Worker-Verhalten, kein
Defekt (T901271-Diskussion). Das einzige Worker-Gate (`agent-actions.jsonl`,
action-Partition 20/20) ist zu dünn für Plan-Stufen.

## Brainstorming (Optionen, verworfen vs. gewählt)

1. **Bestehendes Set erweitern** (mehr action-Cases in `agent-actions.jsonl`):
   verworfen — vermischt Worker- und Orchestrator-Erwartungen in einer Datei,
   Gate-Aussage wird unscharf.
2. **Neues action-only Set + Validator öffnen (GEWÄHLT)**: neues
   `testsets/instruct-worker.jsonl` (Plan-Stufe → Aktion), `validate-testset`
   akzeptiert Sets mit ≥1 Partition (≥40 Cases + en/de-Paare bleiben).
   `aggregate()`/`compare_gate()` tolerieren fehlende Partitionen bereits
   (`if any(...)`), `agent-actions.jsonl` validiert unverändert weiter.
3. **Validator unangetastet, Set mit Dummy-Partitionen**: verworfen —
   Dummy-clarify würde Worker-Verhalten bestrafen, exakt der alte Fehler.

## Design

- `scripts/finetune/testsets/instruct-worker.jsonl`: ≥40 Cases (20+ Szenarien
  × en/de via `pair_id`), alle `class=action`. Requests im Plan-Stufen-Stil
  („Step N of plan …: …“), inkl. Multi-Action-Sets und vollständiger
  Required/Optional-Params; alle 10 generischen Actions abgedeckt.
  Provenance `handwritten-not-in-training-corpus`; Entitäten disjunkt zu
  Korpus-Seeds und `agent-actions.jsonl` (kein Leakage).
- `eval_scoring.validate_testset`: statt „alle drei Partitionen Pflicht“ →
  „mindestens eine Partition nicht-leer“; Fehlermeldung nennt weiter die
  Sollmenge. `eval-runner.sh --testset` übernimmt die Datei ohne Änderung.
- `testsets/README.md`: Worker- vs. Orchestrator-Sets dokumentieren
  (Instruct-Set action-only; Thinking-Set folgt eigenem Ticket).
- Guards `tests/spec/unsloth-eval-harness/worker-testset.bats`: neues Set
  validiert; Single-Partition-Verweigerung ist weg; Multi-Action-Spot-Check.

## Prior-Art

- `testsets/README.md`: 3-Partitionen-Pflicht + ≥40 + Paare (wird geändert).
- `eval-runner.sh:14,59`: `--testset`-Override existiert (keine Änderung nötig).
- Keine ADR-Entscheidung zum Worker/Testset-Split (kein Konflikt).
