---
title: "branch-reaper-local-ref — Implementation Plan"
ticket_id: T003182
domains: [ci-cd, scripts, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# branch-reaper-local-ref — Implementation Plan

_Ticket: T003182_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/branch-reaper.sh` | 204 | 596 |
| `tests/spec/ci-cd/branch-reaper-local-ref.bats` | 116 | — (bereits committet, RED) |
| `openspec/changes/branch-reaper-local-ref/specs/ci-cd.md` | neu | — |

`scripts/branch-reaper.sh` ist nicht in `docs/code-quality/baseline.json` gebaselinet; wirksame
Schwelle ist damit das statische `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`. Die
erwartete Änderung liegt bei rund 15 Zeilen — kein Split nötig.

Abgrenzung zu den zwei anderen offenen Tickets an derselben Datei: **T003180** (`--dry-run` ohne
`--ticket`) fasst den Argumentparser und den Format-Guard an (Zeile 63–79), **T003074**
(ticketloser Sweep) die Kandidatenauswahl (Zeile 118–130). Dieser Plan fasst ausschliesslich die
Löschschleife ab Zeile 189 an. Wer hier arbeitet, ändert nichts an Parser oder Auswahl, damit
die drei Vorgänge sich nicht gegenseitig überschreiben.

## Task 1 — RED bestätigen

- [ ] Die bereits auf dem Branch liegende Testdatei ausführen und den roten Zustand belegen.
      Test 1 muss fehlschlagen (der lokale Ref überlebt den Reap), Test 2 muss bereits grün
      sein — er ist der Regressionsschutz für den lokalen Branch mit ungepushter Arbeit.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-local-ref.bats
# expected: FAIL — "T003182: nach dem Reap ist der lokale Branch-Ref weg" schlaegt an der
# Zusicherung fehl, dass refs/heads/<branch> nicht mehr aufloesbar ist.
```

Der Test misst den Ref-Zustand nach einem echten Lauf gegen ein Fixture-Repo mit eigenem
bare-Remote, nicht den Wortlaut der Ausgabe. Ein Fix, der nur die Meldung von `DELETED $branch`
auf `DELETED remote/$branch` umschreibt, macht ihn deshalb NICHT grün — das ist beabsichtigt.

## Task 2 — Lokalen Ref in der Löschschleife mitlöschen

- [ ] In `scripts/branch-reaper.sh` im erfolgreichen Zweig des Remote-Deletes (Zeile 199–200)
      den lokalen Ref behandeln:
      - lokalen SHA über `git rev-parse --verify --quiet "refs/heads/$branch"` ermitteln;
        löst er nicht auf, ist nichts zu tun (kein Fehler, kein Exit-Wechsel),
      - stimmt er mit dem bereits ermittelten `$sha` überein, den Ref mit
        `git update-ref -d "refs/heads/$branch"` entfernen — `git branch -d` verweigert nach dem
        Remote-Delete den Merged-Nachweis und `-D` wäre unqualifiziert scharf,
      - weicht er ab, den Ref stehen lassen und das in einer eigenen Ausgabezeile mit Grund
        nennen.
- [ ] Die Ausgabezeile des Erfolgsfalls so fassen, dass sie remote- und lokal-Anteil getrennt
      benennt. Der Kopfkommentar ab Zeile 23 („Ausgabe — der Vertrag") wird entsprechend
      nachgezogen; die bestehenden `REAP`/`KEEP`-Präfixe bleiben unverändert, weil
      `tests/spec/ci-cd/branch-reaper.bats` an ihnen ankert.
- [ ] Der aktuell ausgecheckte Branch ist über den bestehenden `CURRENT_BRANCH`-Filter (Zeile
      136) bereits vom Reap ausgenommen; kein zusätzlicher Guard nötig, aber im Kommentar
      festhalten, dass die lokale Löschung sich darauf verlässt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/branch-reaper-local-ref.bats
# expected: PASS — beide Tests gruen
tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd/branch-reaper.bats tests/spec/ci-cd/
# Bestandsguards des Reapers duerfen nicht rot werden
```

## Task 3 — Runbook nachziehen

- [ ] `.claude/skills/references/repo-hygiene-ops.md` §2 („Verwaiste Remote-Branches") um einen
      Satz ergänzen, dass der Reaper den lokalen Ref mitnimmt, wenn er auf den archivierten SHA
      zeigt, und ihn sonst stehen lässt. Nur dieser eine Punkt — die in T003180 beanstandete
      `--dry-run`-Zeile derselben Sektion bleibt unverändert, damit die Tickets kollisionsfrei
      bleiben.

## Task 4 — Finale Verifikation

- [ ] Test-Inventar nach der Testdatei-Änderung regenerieren und mitcommitten.

```bash
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```
