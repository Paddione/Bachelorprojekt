# Proposal: clarify-Rückfrage im Eval-Harness werten (T901271)

## Symptom (Fakt) vs. Ursache (Hypothese) — T002448-M5

- **Symptom (belegt):** tuned-Eval clarify `0.0/12` in allen Adapter-Läufen
  (15-step 4bit, V2-60-step 16bit, mit/ohne System-Prompt, strict wie
  think-gestrippt). CPU-Reproducer:
  `parse_action_output("Which meeting should I schedule, and when?")`
  → `[__malformed__]` → `score_clarify_case` → `0.0`.
- **Ursache (belegt, keine Hypothese mehr):** `score_clarify_case`
  (`scripts/finetune/eval_scoring.py:98`) kennt nur „leer = 1.0, Rest = 0.0“.
  Der Modul-Docstring verspricht „a clarifying question is expected instead“,
  aber Fragtext ist nach dem Parse von `__malformed__` ununterscheidbar —
  eine perfekte Rückfrage kassiert zwingend 0.0. Nur wörtliches Schweigen
  (`""`) wertet 1.0. Die 12 Clarify-Trainingszeilen (Fragen!) lehren
  Verhalten, das das Gate bestraft.

## Entscheidungen (User, Ein-Tasten-Abfragen)

1. Bug-Ticket + Scorer-Fix statt Schweige-Retrain (T901271 angelegt).
2. Fix-Ort: **Scorer-Seite** (Empfehlung), nicht Parser-`[]`-Shortcut —
   `no_action`-Gate bleibt strikt (Geschwätz dort weiter 0.0).

## Design

- `eval_harness.parse_action_output`: Frage-ähnlicher Rohtext
  (nicht-leer, kein JSON-Listen-Parse, endet mit `?`, beginnt nicht mit
  `[`/`{`/`` ``` ``) → `[{"name": "__question__", "params": {}}]`
  statt `__malformed__`. Alles andere unverändert.
- `eval_scoring.score_clarify_case`: `[]` oder `[__question__]` → 1.0,
  sonst 0.0 (mit bisheriger Reason-Formulierung).
- `score_action_case` / `score_no_action_case`: **unverändert**.
  `__question__` fällt dort durch Namens-Mismatch bzw. Nicht-Leere auf 0.0 —
  kein Guard-Verhalten ändert sich.
- Bestehende Guards (`scoring-rules.bats`, `regression-gate.bats`,
  `gguf-fixture-bridge.bats`) füttern geparste JSON-Arrays direkt bzw.
  erwarten `__malformed__` nirgends per Name — kein Pin bricht (GREEN-Phase
  verifiziert).

## Verworfene Option

Parser-Shortcut Frage→`[]`: einfacher, aber `no_action`-Fälle mit Geschwätz
würden fälschlich 1.0 kassieren. Abgelehnt (User-Entscheidung).

## Prior-Art

- `docs/adr/ADR-006-sdlc-isolation-dev-host.md:148` nennt nur die
  Harness-Dateien, keine Scoring-Entscheidung.
- `tests/spec/unsloth-eval-harness/scoring-rules.bats:77-90` pinnt
  Parse-Ebene (`[]`→1.0, erfundene Action→0.0); Rohtext-Fragen unabgedeckt.
- `tests/spec/agent-bench/scoring.bats:48` erwartet `clarify_miss` bei
  Frag-Verweigerung — konsistent mit diesem Fix.
