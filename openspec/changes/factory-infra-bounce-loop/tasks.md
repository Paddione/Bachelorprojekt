---
title: "factory-infra-bounce-loop — Implementation Plan"
ticket_id: T015556
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-infra-bounce-loop — Implementation Plan

_Ticket: T015556_

## File Structure

```
scripts/factory/schedule.sh                  (MODIFIED — Readiness-Gate vor claim-gang)
scripts/factory/watchdog.sh                  (MODIFIED — Counter-Sichtbarkeit, Fail-safe-Eskalation, DB-Identitätscheck, STALE_MIN-Floor)
tests/spec/software-factory/bounce-loop-guard.bats  (NEW — Guards für alle vier Deltas)
```

S1-Budgets (wc -l, Stand Plan-Erstellung): schedule.sh 183 (nicht gebaselined),
watchdog.sh 377 (nicht gebaselined), dispatcher-bridge.sh 208 (unverändert,
nur Referenz). Netto-Wachstum je Datei klein halten; watchdog.sh um ≥ die
eigenen Zugaben zeilenneutral halten (Fehlerbehandlung ersetzt stillen
Fallback, keine parallelen Pfade).

## Tasks

- [x] **p1 — Failing-Test (RED).** Neue Datei
      `tests/spec/software-factory/bounce-loop-guard.bats` mit vier Tests
      (je Delta-Szenario aus specs/factory-watchdog.md): (1) planloses
      locked-Feat wird von schedule.sh nicht geclaimt (Status bleibt backlog),
      (2) dreimal unlesbarer Counter → unfactory-Eskalation, Kommentar
      enthält `ERR`, (3) DB-Mismatch zwischen factory_psql und ticket.sh
      bricht Sweep ohne Reset ab, (4) STALE_MIN=0 ohne Opt-out läuft mit 5.
      Tests folgen dem Isolationsmuster aus watchdog-parallel-isolation.bats
      (T005561) und skippen ohne DB (`_skip_if_no_db`). Ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/bounce-loop-guard.bats
# expected: FAIL (red — Gates und Fail-safe existieren noch nicht)
```

- [x] **p2 — Fix schedule.sh (GREEN Teil 1).** Vor `slots.sh claim-gang`
      (Zeile ~173) denselben Readiness-Check wie dispatcher-bridge.sh
      (`check_ticket_readiness` aus lib.sh) ausführen; bei missing_args:
      Journal-Line `schedule: $ext_id not ready (readiness=missing_args) —
      not claimed`, Row aus Launch-Liste ausschließen, kein Claim. Test 1 muss
      danach grün sein.

- [x] **p3 — Fix watchdog.sh (GREEN Teil 2).** (a) `2>/dev/null` am
      Counter-Aufruf entfernen, Fehler auf stderr; (b) konsekutive unlesbare
      Runden über Key `factory_infra_unreadable:<ext_id>` zählen, ab
      MAX_INFRA_ATTEMPTS → escalate=1, Kommentar-Suffix `ERR` statt `?`;
      (c) einmal pro Sweep DB-Identitätscheck (Marker-Query über beide Pfade,
      Mismatch → Sweep-Abbruch rc!=0 ohne Writes); (d) STALE_MIN-Floor 5 mit
      Opt-out `FACTORY_ALLOW_STALE_MIN_ZERO=1` + Journal-Zeile. Tests 2–4
      müssen grün sein.

- [x] **p4 — Final Verification.** Alle drei CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
