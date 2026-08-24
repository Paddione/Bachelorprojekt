---
title: "identity-guard-sidepaths — Implementation Plan"
ticket_id: T015669
domains: [scripts, factory, tickets]
status: active
file_locks: [scripts/lib/db-ghost-guard.sh, scripts/factory/lib.sh, scripts/factory/conflict-check.sh, scripts/mishap-categorize.sh, scripts/batch-gap-analysis.sh, tests/spec/identity-guard-sidepaths.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# identity-guard-sidepaths — Implementation Plan

_Ticket: T015669_

## File Structure

```
scripts/lib/db-ghost-guard.sh               (new — geteilter Zwei-Schichten-Guard)
scripts/factory/lib.sh                      (modified — factory_pgpod nutzt Guard)
scripts/factory/conflict-check.sh           (modified — _pgpod nutzt Guard)
scripts/mishap-categorize.sh                (modified — Selektionen nutzen Guard)
scripts/batch-gap-analysis.sh               (modified — Selektion nutzt Guard)
tests/spec/identity-guard-sidepaths.bats    (new — BATS-Guard mit kubectl-Stub)
```

## Tasks

### Partial 1: Shared-Guard, vier Anbindungen, BATS-Guard

1. **RED — BATS-Guard anlegen.** Neue Datei `tests/spec/identity-guard-sidepaths.bats` mit
   kubectl-Stubs (PATH-Shim):
   - **Test A (Singleton):** Stub liefert zwei Running-Pods → Aufruf von `factory_pgpod` und der
     drei Plain-Text-Pfade endet rc≠0; stderr listet beide Pods; `factory_pgpod`-Fehlerpfad
     bleibt valides JSON (`jq -e .error`).
   - **Test B (Marker fehlt):** ein Pod, psql-Antwort leer → rc≠0 mit Marker-Remediation-Hinweis.
   - **Test C (Marker fremd):** Antwort ≠ erwarteter Identität → rc≠0 mit Mismatch-Meldung.
   - **Test D (Sentinel-Skip):** unter `BATS_TEST_NAME` ohne Opt-in läuft die Selektion durch
     den Guard hindurch gegen den Stub (Referenzmuster `_assert_db_identity`, T015168).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/identity-guard-sidepaths.bats
# expected: FAIL (red — der Shared-Guard existiert noch nicht)
```

2. **GREEN — Helper + Anbindungen implementieren:**
   - `scripts/lib/db-ghost-guard.sh`: `db_ghost::assert_single_pod <ns> <ctx>` (Liste aller
     laufenden Pods auf dem Selector; >1 → laut abbrechen mit Remediation) und
     `db_ghost::probe_identity <ns> <ctx> -- <psql-cmd...>`
     (`SELECT identity FROM tickets.db_identity`; leer/fremd → Abbruch mit Hinweisen inkl.
     `task db:migrate ENV=mentolder` bzw. `TICKET_CTX`). Sentinel-Skip + Opt-in-Variable
     (`TICKET_TEST_DB_OK=1`) + `TICKET_ALLOW_UNVERIFIED_DB=1` wie im Referenz-Fix.
   - Vier Stellen source-n den Guard und rufen ihn vor der Rückgabe des Pods auf; bestehende
     Fehlerverträge (JSON bei `factory_pgpod`, Plain-Text sonst) bleiben unverändert — der
     Guard schreibt seine Diagnose nach stderr, das Skript wrappt sie in sein Format.

3. **Verifizieren.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/identity-guard-sidepaths.bats
# expected: PASS (green)
bash scripts/check-pod-phase-filter.sh
# expected: grün — die neuen kubectl-Aufrufe behalten den phase-filter bei
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/identity-guard-sidepaths.bats
# expected: FAIL (red — die vier Nebenpfade sind noch ungeschützt)
```

- [ ] **Fix-Step (GREEN).** Helper + vier Anbindungen umsetzen, bis der Guard grün ist.

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
