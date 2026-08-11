---
title: "opencode-exec-path-resolution — Implementation Plan"
ticket_id: T003275
domains: [ci, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# opencode-exec-path-resolution — Implementation Plan

_Ticket: T003275_

## File Structure

```
scripts/factory/opencode-exec.sh                                   (modifiziert — Binary-Auflösung)
tests/spec/software-factory/opencode-exec-binary-resolution.bats   (neu — Rot/Grün)
openspec/changes/opencode-exec-path-resolution/specs/software-factory.md  (Delta-Spec)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the bug: with a
      restricted PATH (no `opencode`) and no binary in the npm-global fallback,
      the current script exits 127. The test asserts the NEW contract (resolves
      npm-global, or exits non-127 with diagnostic) and must FAIL on the current
      branch. Use `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/opencode-exec-binary-resolution.bats
# expected: FAIL (red — Binary-Auflösung existiert noch nicht)
```

## Task 1 — Binary-Auflösung in `opencode-exec.sh` (GREEN)

- **Step 1.1:** In `scripts/factory/opencode-exec.sh` vor dem Aufruf (Zeile ~89) die
  Auflösung einführen:
  ```bash
  OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode || echo "$HOME/.npm-global/bin/opencode")}"
  if [[ ! -x "${OPENCODE_BIN}" ]]; then
    echo "opencode-exec: opencode-Binary nicht gefunden (PATH, \$HOME/.npm-global/bin, \$OPENCODE_BIN) — Exit 2 statt 127" >&2
    exit 2
  fi
  ```
  (neu, ~6 LOC; S1-Budget scripts/factory/opencode-exec.sh ~150 LOC → +6, bleibt
  weit unter dem Limit). Exit 2 = kollisionsfrei (2 Bedienfehler, 127 Kommando fehlt —
  bewusst verschieden, damit 127 weiterhin „echtes Kommando fehlt" bedeutet).
- **Step 1.2:** Aufruf Zeile 89 auf `"$OPENCODE_BIN" run --agent orchestrator …`
  umstellen. Rest des Skripts unverändert (Ergebnis-Check T003335 bleibt).
- **Step 1.3:** Positiv-Anker sicherstellen: `command -v opencode` greift zuerst,
  `$OPENCODE_BIN`-Override hat Vorrang.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/opencode-exec-binary-resolution.bats
# expected: PASS (green — Auflösung existiert und greift)
```

## Task 2 — Rot/Grün-Test `opencode-exec-binary-resolution.bats`

- **Step 2.1:** Testdatei `tests/spec/software-factory/opencode-exec-binary-resolution.bats`
  anlegen (neu, ~50 LOC; Muster wie `opencode-exec-result-check.bats` — Wegwerf-Launch-Dir,
  Stub-Binary, `TICKET_OFFLINE=1`). Szenarien aus der Delta-Spec:
  1. **Negativ:** `PATH=/usr/bin:/bin`, kein npm-global-Fallback, kein Stub →
     Exit-Code ≠ 0 UND ≠ 127, Meldung nennt Binary/Suchreihenfolge.
  2. **npm-global-Fallback:** `PATH=/usr/bin:/bin`, Stub unter `$HOME/.npm-global/bin/opencode`
     (mit vorangestellten Stub-Binaries für die restlichen Aufrufe) → Lauf erreicht
     den Stub, kein Exit 127.
  3. **Positiv-Anker:** Stub-`opencode` im PATH → regulärer Pfad erreicht den Stub.
  Semantik statt Darstellung (T002716): Exit-Codes + Stub-Reichweite prüfen, nicht
  Ausgabe-Grep. Kein echter Orchestrator-Lauf im Test.
- **Step 2.2:** `bash scripts/plan-lint.sh openspec/changes/opencode-exec-path-resolution/tasks.md`
  grün bekommen.

## Task 3 — Gates

- **Step 3.1:** Die drei CI-Gates ausführen: `task test:changed` (rot/gelb-grün Check),
  `task freshness:regenerate` (generierte Artefakte aktualisieren) und
  `task freshness:check` (Artefakte committet).

## Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
