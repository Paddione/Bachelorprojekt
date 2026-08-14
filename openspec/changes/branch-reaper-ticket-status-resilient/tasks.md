---
title: "branch-reaper-ticket-status-resilient — Implementation Plan"
ticket_id: T004892
domains: [bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# branch-reaper-ticket-status-resilient — Implementation Plan

_Ticket: T004892_

## File Structure

| Datei | Ist-Zeilen | Budget | Art |
|---|---|---|---|
| `scripts/branch-reaper.sh` | 288 | 512 | geändert — Status-Extraktion gegen fehlenden `"status"`-Treffer absichern |
| `tests/spec/ci-cd/branch-reaper-ticket-status.bats` | 101 | neu | neu — RED-Test, liegt bereits auf dem Branch |
| `openspec/changes/branch-reaper-ticket-status-resilient/specs/branch-reaper-ticket-status-resilient.md` | — | — | Delta-Spec (ADDED Requirement) |

## Kontext

`scripts/branch-reaper.sh` bricht im Sweep-Modus mit Exit 1 ab, sobald eine aus dem
Branch-Namen extrahierte Ticket-ID im Tracker nicht existiert — ohne eine einzige
REAP-/KEEP-Zeile. Ursache ist mit einem minimalen Reproducer belegt (T002448-M5): Nicht die
`ticket_json="$(... || echo '{}')"`-Zeile (dort fängt die OR-Liste korrekt ab, die
Ticket-Hypothese ist widerlegt), sondern die Status-Extraktion direkt danach: Bei
`ticket_json='{}'` findet `grep -o '"status"...'` keinen Treffer, die Pipeline endet unter
`pipefail` mit Exit 1, und `set -e` beendet das Skript, bevor der vorhandene
`case ""`-KEEP-Fallback greift. Vollständige Analyse in `proposal.md` (Symptom vs. Ursache).

## Task 1 — RED: Der Failing-Test liegt vor und ist rot

Der Test liegt bereits auf diesem Branch: `tests/spec/ci-cd/branch-reaper-ticket-status.bats`
(Fixture nach dem Muster `tests/spec/ci-cd/branch-reaper-sweep.bats`: bare Remote,
`TICKET_SH`-Stub, der pro angefragter ID antwortet — T009010 existiert mit Status done,
jede andere ID endet mit Exit 1 wie `ticket.sh get --id <unbekannt>`).

- Test 1 (Positiv-Anker, T002356-M1): Einzel-Ticket-Lauf mit existierendem done-Ticket
  liefert weiterhin eine REAP-Zeile und Exit 0 — in der Rotphase bereits GRÜN.
- Test 2 (der Defekt): Sweep mit nicht-existentem Ticket endet Exit 0 und KEEP-verschont den
  Branch; in der Rotphase ROT (aktuell bricht der Sweep mit Exit 1 ab, bevor eine KEEP-Zeile
  erscheint).

Verifikation des roten Zustands (läuft NUR auf diesem Branch — auf main ist der Test
nicht vorhanden):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-ticket-status.bats
# expected: FAIL — Test 2 scheitert an `[ "$status" -eq 0 ]' failed` (Exit 1, Sweep-Abbruch)
# Test 1 ist grün: der Test misst den Defekt, nicht einen kaputten Testaufbau
```

## Task 2 — GREEN: Status-Extraktion robust machen

In `scripts/branch-reaper.sh` (Status-Extraktion im Candidate-Loop, ~Zeile 205): die Pipeline
gegen fehlenden Treffer absichern, damit der vorhandene `case ""`-Zweig greift statt des
`set -e`-Abbruchs:

```bash
  status="$(printf '%s' "$ticket_json" \
    | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true)"
```

Semantik der Änderung: Liefert die Extraktion keinen Status (nicht-existentes Ticket,
leeres JSON), endet die Pipeline mit `|| true` sauber, `status` bleibt leer, und der
bestehende `case ""`-Zweig schreibt `KEEP <branch> — Ticket-Status nicht ermittelbar` und
setzt den Sweep fort. Verhalten für ermittelbare Status (`done`/`archived` → REAP, sonst
KEEP) bleibt unverändert. Keine weiteren Code-Änderungen — der Fallback existiert bereits.

Verifikation:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-ticket-status.bats
# expected: PASS — beide Tests grün (Test 1 unverändert, Test 2 jetzt Exit 0 + KEEP-Zeile)
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/branch-reaper.bats tests/spec/ci-cd/branch-reaper-sweep.bats tests/spec/ci-cd/branch-reaper-local-ref.bats
# expected: PASS — Bestands-Guards des Skripts bleiben grün (kein Verhaltensregress)
```

## Task 3 — Abschliessende Verifikation

```bash
task test:changed
task test:inventory          # neue Testdatei ins Inventar aufnehmen, website/src/data/test-inventory.json mitcommitten
task freshness:regenerate
task freshness:check
```

- `scripts/branch-reaper.sh` wächst nicht (Ein-Zeilen-Änderung, Ist 288 < Limit 800) —
  kein Baseline-Risiko.
- Keine Brand-Domain-Literale (S3), keine neuen Skripte/Manifeste (S4), keine
  TypeScript-Änderungen (CQ02/Vitest entfallen).
