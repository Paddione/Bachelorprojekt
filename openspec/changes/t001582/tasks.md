---
title: "Mishap-Bundle: agent-lock.sh, ticket.sh, vda.sh (3 Einträge)"
ticket_id: T001582
domains: [infra, test]
status: plan_staged
---

# t001582 — Implementation Plan

Design: `docs/superpowers/specs/2026-07-03-t001582-mishap-bundle-design.md`

Bündelt drei unabhängig root-verursachte Kleinbugs aus dem Mishap-Tracker. Alle drei Fixes sind
lokal, gut isoliert und ohne Cross-Datei-Kopplung — sie werden in einem Batch implementiert, aber
unabhängig verifiziert.

## File Structure

```
scripts/agent-lock.sh                     # M1: _reapable() Altersbasis fixen
scripts/vda/ticket/create.sh              # M2: --severity clientseitig validieren
scripts/ticket.sh                         # M2: Usage-Text; M3: Duplikate entfernen
scripts/vda/ticket/_ticket-core.sh        # M3: gemeinsame Offline-Guard-Funktionen
scripts/vda/ticket/get.sh                 # M3: keine Codeänderung nötig (erbt via source)
tests/spec/t001582-mishap-bundle.bats     # bereits committed (failing-test stage)
```

## Tasks

### 1. M1 — agent-lock.sh: `_reapable()` Altersbasis auf `heartbeat_at` umstellen

- In `scripts/agent-lock.sh` `_reapable()`: im `pid-dead`-Zweig (aktuell `age=$(( now - ${ct:-0} ))`
  mit `ct=created_at`) und im `sid-dead`-Zweig dieselbe `age`-Berechnung durch eine gemeinsame
  Altersbasis ersetzen, die `heartbeat_at` bevorzugt und nur auf `created_at` zurückfällt, wenn
  `heartbeat_at` leer ist (Rückwärtskompat. für alte Claim-Dateien ohne das Feld). Konkret: vor
  den beiden Zweigen `local age_base="${hb:-${ct:-0}}"` einführen und `age=$(( now - age_base ))`
  in beiden Stellen verwenden statt `${ct:-0}`.
- Verify (expected: FAIL vor dem Fix, PASS danach):
  ```bash
  bats tests/spec/t001582-mishap-bundle.bats -f "T001582-M1: agent-lock does not pid-dead-reap"
  ```
  Vor dem Fix schlägt dieser Test fehl (Claim mit altem `created_at` aber frischem
  `heartbeat_at` wird fälschlich gereapt) — das ist der erwartete Rot-Zustand dieser Planungsphase.
- Regressions-Check (muss vor UND nach dem Fix grün bleiben):
  ```bash
  bats tests/spec/t001582-mishap-bundle.bats -f "T001582-M1 (regression guard)"
  ```

### 2. M2 — create.sh: `--severity` clientseitig validieren, bevor die DB berührt wird

- In `scripts/vda/ticket/create.sh` `main()`: direkt nach dem Options-Parsing (vor dem
  `if [[ -z "$type" || ... ]]`-Required-Check oder unmittelbar danach, vor `local pod; pod=$(_pgpod)`)
  einen Guard einfügen: wenn `-n "$severity"` und `severity` nicht exakt einer von
  `critical|major|minor|trivial` ist → `echo "ERROR: --severity must be one of: critical, major, minor, trivial (got: $severity)" >&2; exit 2`.
  Leerer `severity` (Flag nicht gesetzt) bleibt erlaubt und überspringt den Guard.
- In `scripts/ticket.sh`: die Usage-Zeile (`# create --type <type> ... [--severity <severity>] ...`)
  um die vier erlaubten Werte ergänzen, z. B.
  `[--severity critical|major|minor|trivial]`.
- Verify (expected: FAIL vor dem Fix, PASS danach):
  ```bash
  bats tests/spec/t001582-mishap-bundle.bats -f "T001582-M2: create.sh rejects an invalid --severity"
  bats tests/spec/t001582-mishap-bundle.bats -f "T001582-M2: ticket.sh usage text lists"
  ```
- Regressions-Check (muss vor UND nach dem Fix grün bleiben — leerer `--severity` darf nie blockiert werden):
  ```bash
  bats tests/spec/t001582-mishap-bundle.bats -f "T001582-M2: create.sh still allows an empty"
  ```

### 3. M3 — Offline-Guard-Funktionen in `_ticket-core.sh` konsolidieren

- `_ticket_offline_skip()` und `_ticket_offline_refuse_read()` aus `scripts/ticket.sh`
  (aktuell Zeilen ~46–60) nach `scripts/vda/ticket/_ticket-core.sh` verschieben (ans Dateiende
  anhängen, nach `_exec_sql()`).
- In `scripts/ticket.sh` die beiden Funktionsdefinitionen entfernen — die Kommentare zur
  TICKET_OFFLINE-Semantik wandern mit in `_ticket-core.sh`. `scripts/ticket.sh` sourced
  `_ticket-core.sh` bereits vor der ersten Verwendung, daher kein Verhaltensunterschied für die
  bestehenden Aufrufer.
- `scripts/vda/ticket/get.sh` bleibt unverändert — es sourced `_ticket-core.sh` bereits und
  erreicht `_ticket_offline_refuse_read` damit transitiv.
- Verify (expected: FAIL vor dem Fix, PASS danach):
  ```bash
  bats tests/spec/t001582-mishap-bundle.bats -f "T001582-M3"
  ```

### 4. Verify (final gate)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, um die drei Mishaps end-to-end zu bestätigen:

```bash
bats tests/spec/t001582-mishap-bundle.bats
```

Alle 7 Tests müssen grün sein (die zwei bereits-grünen Regressions-/Empty-Severity-Guards bleiben
grün, die fünf vormals roten M1/M2/M3-Tests wechseln auf grün).
