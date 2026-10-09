# p3 — Tests

Target files: `tests/spec/llm-local-dev/plan-vector-routing.bats`, `tests/spec/llm-local-dev/fixtures/plan-vector-routing-fake-retrieve.sh`.

### Task 1: Tests grün

- `tests/spec/llm-local-dev/plan-vector-routing.bats` (Muster: `tests/spec/llm-local-dev/plan-runner.bats` + Fake-Binary via `PLAN_RUNNER_OPENCODE`-Analogon):
  - `plan-stage-index.mjs --plan-dir <fixture-plan>` liefert Beleg-JSON mit `partials`, `collection: specs_plans`, `receipt` (Backend gemockt, kein Netzwerk).
  - Backend-Ausfall (Mock-Exit != 0) → Warnung auf stderr, Exit 0, Staging nicht blockiert.
  - `decideTrack({ ready: ['a'], freeSlots: 1 })` → `worker`; `freeSlots: 0` → `self`; `ready: []` → `idle` (Rückwärtskompatibilität).
  - `decideTrack` mit `sizes: { a: 'l' }` liefert den `l`-Hint, routet aber weiter auf bestehende Tracks (kein `heavy` ohne Modell).
  - Recall-Ausfall im Worker-Prompt-Bau → Prompt ohne `Ähnliche Partials`-Abschnitt, Dispatch läuft.

```bash
bats tests/spec/llm-local-dev/plan-vector-routing.bats
```

Vor p1/p2 expected: FAIL. Danach alle grün.

### Task 2: Finale Verifikation

```bash
task test:changed
task freshness:check
task workspace:validate
```
