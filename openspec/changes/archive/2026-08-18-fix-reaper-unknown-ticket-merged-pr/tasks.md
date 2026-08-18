---
title: "branch-reaper: unbekannter Ticket-Status reicht auf die MERGED-PR-Signale durch"
ticket_id: T012412
domains: [ci-cd, scripts]
status: plan_staged
---

# branch-reaper unbekannter Ticket-Status — Implementation Plan

## File Structure

| Datei | Änderung | Zeilen jetzt | Wirksame S1-Schwelle | Budget |
|---|---|---|---|---|
| `scripts/branch-reaper.sh` | Ticket-Gate setzt bei leerer Antwort ein Flag statt `continue`; Positiv-Signal-Block wird für dieses Flag geöffnet und erzwingt danach KEEP | 399 | 800 (`.sh`, nicht gebaselined) | 401 Zeilen |
| `tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats` | bereits im RED-Commit angelegt — Guard für den neuen Pfad | 219 | keine `.bats`-Schwelle in `docs/code-quality/gates.yaml` | — |
| `openspec/changes/fix-reaper-unknown-ticket-merged-pr/specs/batch-repo-hygiene-ops-fixes.md` | `MODIFIED`-Delta auf das T006329-Requirement | 79 | keine Schwelle für Spec-Deltas | — |

Der Eingriff bleibt in einer einzigen Funktion der Entscheidungsschleife. Es entsteht **keine**
neue Abfrage und **kein** neues Signal: `_merged_pr_head_oid` und `_merged_successor` existieren
seit T007032 unverändert und werden lediglich erreichbar gemacht.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| p1 | tests | `tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats` |

Der Produktionsteil liegt bewusst mit im Tests-Partial: der Eingriff umfasst einen
Kontrollfluss-Umbau in einer Datei, und ein zweites Partial müsste sich dieselbe Datei teilen —
das verletzt die Disjunktheitsregel (D1).

## Task 1 — RED: der failing Test ist bereits committed

Der Guard `tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats` liegt im Stage-Commit
dieses Plans. Er läuft gegen ein Wegwerf-Git-Repo mit `gh`- und `ticket.sh`-Stubs, nie gegen das
echte Repo (ein Löschlauf ist nicht umkehrbar).

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats
# expected: FAIL
```

Erwarteter Rotstand zum Zeitpunkt des Stagings — verifiziert am 2026-08-18:

- `ok 1` Positiv-Anker (Grundlauf reapt ein done-Ticket mit Allowlist-Abweichung)
- `not ok 2` unbekanntes Ticket + eigener MERGED-PR
- `not ok 3` unbekanntes Ticket + gemergter Nachfolger
- `ok 4` / `ok 5` / `ok 6` Negativfälle — sie sichern das Bestandsverhalten und müssen grün
  bleiben, auch nach dem Fix
- `not ok 7` derselbe Fall im `--ticket`-Modus

Ist Test 1 rot, ist der Grundlauf kaputt und nicht der geprüfte Pfad — dann zuerst das klären,
nicht den Fix schreiben.

## Task 2 — GRÜN: Ticket-Gate öffnen, ohne den Allowlist-Check zu öffnen

In `scripts/branch-reaper.sh`, Block „(3) Ticket-Status":

1. Eine Variable `ticket_unknown=0` vor dem Block setzen.
2. Im `case "$status"` den Zweig `""` von `echo … ; continue` auf `ticket_unknown=1` umstellen.
   Der Zweig `*` (gelesener, nicht-terminaler Status) behält sein `continue` unverändert — nur
   die fehlende Messung reicht durch, nicht die negative Aussage.
3. Die Bedingung des Positiv-Signal-Blocks von `[ "$freshness_decided" -eq 0 ]` so erweitern,
   dass sie auch bei `ticket_unknown=1` läuft (sie läuft dort ohnehin schon, da
   `freshness_decided=0` bleibt) — hier ist nichts zu ändern, der Block wird allein dadurch
   erreichbar, dass das `continue` oben entfällt.
4. **Unmittelbar nach** dem Positiv-Signal-Block und **vor** dem Blob-Allowlist-Check (4) den
   Riegel einziehen:

   ```bash
   # [T012412] Ein unbekannter Ticket-Status gibt einen Branch NUR ueber ein Positiv-Signal
   # frei. Faellt er bis hierher durch, hat keines gegriffen — dann gilt die bisherige
   # Begruendung. Der Blob-Allowlist-Check darf ihn nicht ersatzweise freigeben: "Ticket done"
   # und "Blob-Diff in der Allowlist" sind zwei getrennt noetige Signale (T002431).
   if [ "$ticket_unknown" -eq 1 ]; then
     echo "KEEP $branch — Ticket-Status nicht ermittelbar"
     continue
   fi
   ```

Die Reihenfolge ist der ganze Fix: Der Riegel muss **hinter** den Positiv-Signalen stehen,
sonst ist der Zustand vor dem Fix wiederhergestellt, und er muss **vor** dem Allowlist-Check
stehen, sonst gibt dieser den Branch frei.

Zum Grünlauf:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-unknown-ticket-merged-pr.bats
```

Alle sieben Tests müssen grün sein.

## Task 3 — Bestandsguards des Reapers gegenprüfen

Der Eingriff sitzt in der Entscheidungsschleife, die alle Reaper-Guards durchlaufen. Besonders
`branch-reaper-empty-answer.bats` prüft denselben leeren Ticket-Status und muss unverändert
grün bleiben — sein `gh`-Stub liefert nirgends einen PR, der neue Pfad greift dort also nicht.

```bash
./tests/unit/lib/bats-core/bin/bats \
  tests/spec/ci-cd/branch-reaper.bats \
  tests/spec/ci-cd/branch-reaper-empty-answer.bats \
  tests/spec/ci-cd/branch-reaper-merged-pr-signal.bats \
  tests/spec/ci-cd/branch-reaper-sweep.bats \
  tests/spec/ci-cd/branch-reaper-local-ref.bats \
  tests/spec/ci-cd/branch-reaper-freshness-regen.bats \
  tests/spec/batch-repo-hygiene-ops-fixes.bats
```

## Task 4 — Runbook-Text nachziehen

`.claude/skills/references/repo-hygiene-ops.md` §2 beschreibt die Reaper-Entscheidung mit den
Worten „Gelöscht wird nur, wenn kein offener PR existiert, das Ticket `done`/`archived` ist
**und** jede Blob-Abweichung … in der Allowlist liegt". Diese Beschreibung wird um den Fall
ergänzt, dass ein **nicht ermittelbarer** Ticket-Status durch ein Positiv-Signal ersetzt werden
kann — ohne die Aussage zu schwächen, dass Ticket-Status und Blob-Check zwei getrennte Signale
sind.

## Task 5 — Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich der reale Gegenbeweis auf dem echten Repo, ausschließlich als Dry-Run — er belegt,
dass die Messung aus dem Proposal sich umkehrt:

```bash
bash scripts/branch-reaper.sh --sweep --dry-run | grep -c 'Ticket-Status nicht ermittelbar'
# vor dem Fix: 10 · erwartet danach: deutlich niedriger, die Branches mit gemergtem PR
# erscheinen stattdessen als REAP
```

Ohne `--dry-run` wird hier nichts ausgeführt: ein Löschlauf ist nicht umkehrbar.
