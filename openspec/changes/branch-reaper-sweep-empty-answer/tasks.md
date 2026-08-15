---
title: "branch-reaper-sweep-empty-answer — Implementation Plan"
ticket_id: T006329
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# branch-reaper-sweep-empty-answer — Implementation Plan

_Ticket: T006329_

## File Structure

```
scripts/branch-reaper.sh                      # Fix: Pipeline-Rest gegen leere Antwort absichern
tests/spec/ci-cd/branch-reaper-empty-answer.bats   # neu: RED-Test (liegt im Stage-Commit bei)
website/src/data/test-inventory.json          # regeneriert (neue BATS-Datei, CI-Inventar)
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Die BATS-Datei `tests/spec/ci-cd/branch-reaper-empty-answer.bats`
      liegt dem Stage-Commit bereits bei (siehe Task 1). Der Lauf muss auf dem ungefixten Stand
      fehlschlagen.

- [x] **Fix-Step (GREEN).** `scripts/branch-reaper.sh` Zeile 205–207 absichern. Der BATS-Lauf aus
      Task 1 muss danach grün sein.

- [x] **Final Verification.** Siehe Task 3.

## Task 1 — RED: Leer-Antwort-Test ist rot

**Ziel:** Belegen, dass der neue Test den Defekt reproduziert. Die Testdatei
`tests/spec/ci-cd/branch-reaper-empty-answer.bats` wurde im Plan-Stage-Commit angelegt (3 Tests:
Positiv-Anker Einzel-Ticket-Lauf, Sweep überlebt leere Antwort, Einzel-Ticket-Lauf mit
unbekannter ID). Der Implementer schreibt sie nicht neu, sondern verifiziert die Rot-Phase auf
dem aktuellen Stand.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-empty-answer.bats
# expected: FAIL — Test 2 (Sweep) und Test 3 (Einzel-Lauf) scheitern an `status -eq 0`,
# weil die Status-Extraktion bei leerer ticket.sh-Antwort still mit Exit 1 stirbt.
```

- Der Positiv-Anker (Test 1, Einzel-Lauf auf die existierende ID T009001) ist GRÜN — nur die
  Leer-Antwort-Pfade sind rot. Beides zusammen beweist, dass der Test den Defekt misst und nicht
  die Test-Ausrüstung (T002356-M1).

## Task 2 — GREEN: Status-Extraktion gegen leere Antwort absichern

**Ziel:** `scripts/branch-reaper.sh` Zeile 205–207 so ändern, dass eine leere
`ticket_json`-Antwort (rc=0, leere stdout von `ticket.sh get --id <id>` für nicht existierende
Tickets) den Lauf nicht mehr beendet.

**Ursache (belegt):** `ticket_json=""` → `printf '%s' "" | grep -o '...'` → grep endet mit 1 →
unter `set -euo pipefail` wird der Pipeline-Exit 1 der Command-Substitution → Skript stirbt
still. Der `""`-Zweig des nachfolgenden `case` („Ticket-Status nicht ermittelbar" → KEEP) ist
dadurch unerreichbarer Dead Code.

**Änderung:** Am Ende der Status-Extraktions-Pipeline `|| true` ergänzen, damit die Zuweisung
bei leerer Eingabe `status=""` setzt statt abzubrechen:

```bash
status="$(printf '%s' "$ticket_json" \
  | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true)"
```

- Der `case "$status"`-Zweig `"") KEEP <branch> — Ticket-Status nicht ermittelbar` wird damit
  erreichbar: ein nicht existierendes Ticket verschont den Branch explizit („leere Antwort ist
  kein Urteil", T003074) und gibt ihn NICHT zum Löschen frei.
- Der `|| echo '{}'`-Fallback am Lookup-Aufruf (Zeile 204, rc≠0) bleibt unverändert.
- Kein neuer Ausgabevertrag, kein neuer Wortlaut: REAP/KEEP-Präfixe und Begründungen bleiben,
  wie `tests/spec/ci-cd/branch-reaper.bats` sie zusichert.

**Verifikation (GREEN):**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-empty-answer.bats
# alle 3 Tests grün — insbesondere Exit 0 des Sweeps bei leerer Antwort und KEEP des
# Problem-Branches (T006329).
```

Budget: `scripts/branch-reaper.sh` Ist 288 · Limit 800 (nicht-baselined) → Budget 512; der Fix
addiert eine Zeile und bleibt weit unter der Schwelle. `tests/spec/ci-cd/branch-reaper-empty-answer.bats`
neu, 122 Zeilen, unter allen relevanten Schwellen.

## Task 3 — Final Verification

- [x] **Test-Inventar regenerieren** (neue BATS-Datei → CI-Inventar-Check):

```bash
task test:inventory
```

- [x] **Mandatory Verify-Commands:**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- Keine neuen Hostnamen (S3), keine Import-Zyklen (S2, kein TS-Graph betroffen), keine neuen
  Manifeste/Skripte (S4), keine `any`-Typen (CQ02, kein `website/src`-Code betroffen).
