---
title: "fix-stage-plan-branch-ref-T002263 — Implementation Plan"
ticket_id: T002263
domains: [infra]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-stage-plan-branch-ref-T002263 — Implementation Plan

_Ticket: T002263_

Ursache und Abgrenzung stehen in `proposal.md` im selben Ordner. Kurzfassung: der
MCP-Server führt `ticket.sh` immer im Haupt-Checkout aus, und die Vorprüfung fragt
`HEAD:<plan>` statt `<branch>:<plan>` ab.

## File Structure

| Datei | Ist-Zeilen | S1-Budget |
|-------|-----------|-----------|
| `scripts/vda/ticket/stage-plan.sh` | 77 | 423 |
| `tests/unit/scripts/stage-plan.bats` | 89 | S1 kennt kein Limit für `.bats` |
| `scripts/ticket.sh` | 866 | steht auf der `s1.ignore`-Liste in `docs/code-quality/gates.yaml` |

`scripts/ticket.sh` ist in `gates.yaml` ausdrücklich als sanktioniertes
Einzeldatei-CLI geführt und wird vom S1-Gate nicht gemessen; hier wird deshalb kein
Zeilenbudget behauptet. Die Änderung dort umfasst ohnehin nur wenige Zeilen im
`cmd_archive_plan`-Vorprüfblock. Solange T002270 nicht gemergt ist, meldet der
Plan-Linter für diese Zeile eine B1b-Warnung — das ist genau der dort behandelte
Fehlalarm und kein Hinweis auf einen fehlenden Umbau dieser Datei.

<!-- vitest: kein neuer Test nötig, weil die Änderung ausschließlich Bash betrifft und
     keine Datei unter website/src/ anfasst. -->

## Task 1 — RED (bereits auf dem Branch)

Die beiden Reproduktions-Tests sind mit dem Stage-Commit dieses Branches bereits in
`tests/unit/scripts/stage-plan.bats` vorhanden. Sie bauen in `$BATS_TEST_TMPDIR` ein
Wegwerf-Repository mit `main` und einem Feature-Branch auf, statt sich auf einen realen
Branch dieses Repos zu stützen — der wäre nach dem Merge verschwunden und der Test
würde später grundlos rot.

- Test „a plan that exists only on the named branch is accepted" ruft `stage-plan.sh`
  aus dem `main`-Checkout des Sandbox-Repos auf und verlangt, dass die Ausgabe **nicht**
  `does not exist in git` enthält. Der anschließende DB-Schritt darf in der Sandbox
  scheitern; geprüft wird ausschließlich die Vorprüfung.
- Test „a plan on no branch at all is still rejected" ist die Gegenprobe: er verlangt
  Exit 1 und die Fehlermeldung, damit Task 2 die Prüfung nicht versehentlich
  abschaltet.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scripts/stage-plan.bats
# expected: FAIL — Test 6 sieht "does not exist in git"; Test 7 ist bereits grün.
```

## Task 2 — Vorprüfung in stage-plan.sh dreistufig machen

In `scripts/vda/ticket/stage-plan.sh` die Bedingung um den Branch-Ref erweitern, von
speziell nach allgemein: erst `git cat-file -e "${branch}:${plan}"`, dann das bisherige
`git cat-file -e "HEAD:${plan}"`, dann `[[ -f "${plan}" ]]`. Alle drei Prüfungen
schlucken ihre Fehlerausgabe wie bisher, damit ein nicht existierender Ref keine
git-Meldung in den Ausgabestrom schreibt.

Die Fehlermeldung im Ablehnungsfall wird präzisiert: sie nennt jetzt Branch **und**
Pfad und empfiehlt nicht mehr pauschal, `dev-flow-plan` neu laufen zu lassen — der
häufigere Fall ist ein Tippfehler im Pfad oder ein noch nicht gepushter Commit.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scripts/stage-plan.bats
# erwartet: PASS — alle sieben Tests grün.
```

## Task 3 — Denselben Fallback in archive-plan ergänzen

In `scripts/ticket.sh`, Funktion `cmd_archive_plan`: die Prüfung auf eine leere oder
fehlende `--plan-file` akzeptiert zusätzlich den Fall, dass die Datei über
`git cat-file -e "${branch}:${plan_file}"` auflösbar ist. Reihenfolge und Semantik
spiegeln Task 2, damit beide Kommandos sich gleich verhalten. Der OFFLINE-Guard bleibt
davor stehen — er muss weiterhin zuerst greifen, damit Testfälle den OFFLINE-Marker
sehen und nicht einen Plan-Datei-Fehler (Begründung als T001242-M3-Kommentar im Code).

Dazu ein `@test` in `tests/unit/scripts/stage-plan.bats`, der dieselbe Sandbox-Technik
nutzt und prüft, dass `archive-plan` mit einem nur auf dem Branch vorhandenen
`--plan-file` nicht mehr an der Vorprüfung scheitert, sowie eine Gegenprobe mit leerer
Datei.

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scripts/stage-plan.bats
# erwartet: PASS
```

## Task 4 — Ende-zu-Ende-Gegenprobe über den MCP-Pfad

Nach dem Fix `mcp__ticket-mcp__stage_plan` einmal real aus einem Worktree heraus
aufrufen — der Weg, der das Ticket ausgelöst hat. Er muss ohne den Fallback auf
`bash scripts/ticket.sh` durchlaufen. Schlägt er weiterhin fehl, liegt die Ursache im
worktree-blinden Go-Runner und nicht in der Vorprüfung; dann ist der in `proposal.md`
beschriebene `cmd.Dir`-Weg als Folgeticket zu eröffnen, statt diesen Fix aufzublähen.

## Task 5 — Abschließende Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/unit/scripts/stage-plan.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu `task test:inventory` ausführen und `website/src/data/test-inventory.json`
mitcommitten, da diese Änderung neue `@test`-Blöcke hinzufügt.
