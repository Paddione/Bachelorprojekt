---
title: "ssot-readback-verify — Implementation Plan"
ticket_id: T015668
domains: [scripts, tickets]
status: active
file_locks: [scripts/vda/ticket/_ticket-core.sh, scripts/ticket.sh, tests/spec/ssot-readback-verify.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ssot-readback-verify — Implementation Plan

_Ticket: T015668_

## File Structure

```
scripts/vda/ticket/_ticket-core.sh        (modified — neuer Helper _verify_write_effect)
scripts/ticket.sh                         (modified — Hook in 4 Write-Verben)
tests/spec/ssot-readback-verify.bats      (new — BATS-Guard mit kubectl-Stub)
```

## Tasks

### Partial 1: Helper, Hooks und BATS-Guard

1. **RED — BATS-Guard anlegen.** Neue Datei `tests/spec/ssot-readback-verify.bats` mit
   gestubtem `kubectl` (PATH-Shim wie in `tests/spec/t001582-mishap-bats`-Familie; der Stub
   bedient `_pgpod` mit genau einem Pod-Namen und führt `_exec_sql`-Aufrufe auf ein Fixture-
   SQL-Antwortbuch):
   - **Test A:** `update-status` mit konsistentem Read-Buch (Write-UPDATE ok, Rücklesung liefert
     neuen Status) → rc=0.
   - **Test B:** Read-Buch liefert ALTen Status → rc≠0, stderr nennt Ticket-ID, expected/actual
     und den Remediation-Hinweis.
   - **Test C:** `TICKET_OFFLINE=1` → kein kubectl-Aufruf für die Verifikation, rc=0,
     Ausgabe enthält `OFFLINE: skipped`.
   - BATS-Sentinel-Regime ausnehmen wie im Referenz-Fix T015168 (Sentinel-Marker im Stub
     erkennen und early-return), damit der Sentinel-Lauf die Guards nicht als echte
     Ghost-Situation wertet.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ssot-readback-verify.bats
# expected: FAIL (red — _verify_write_effect existiert noch nicht)
```

2. **GREEN — Helper + Hooks implementieren:**
   - In `scripts/vda/ticket/_ticket-core.sh` neben `_exec_sql`:
     `_verify_write_effect <pod> <ext_id> <field=expected>...` — baut SELECT by uuid via
     zweitem `_exec_sql`, vergleicht feldweise, bricht bei Abweichung mit
     `ERROR [T015668]: SSOT read-back MISMATCH ...` laut ab (exit 1).
   - In `scripts/ticket.sh`: nach dem erfolgreichen UPDATE in `cmd_update_status`,
     `cmd_enqueue`, `cmd_stage_plan`, `cmd_archive_plan` je einen Aufruf
     (`status=<zielwert>`; bei stage-plan zusätzlich `plan_ref` Nicht-leer-Prüfung).
   - Offline-Skip über vorhandenes `_ticket_offline_skip`.

3. **Verifizieren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ssot-readback-verify.bats
# expected: PASS (green)
TICKET_OFFLINE=1 bash scripts/ticket.sh get --id T015668 >/dev/null && echo offline-ok
# Bestandsverhalten unverändert (Get-Pfad ohne Write-Hook)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ssot-readback-verify.bats
# expected: FAIL (red — der Helper ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Helper + vier Verb-Hooks umsetzen, bis der Guard grün ist.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
