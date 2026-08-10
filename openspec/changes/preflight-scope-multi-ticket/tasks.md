---
title: "preflight-scope-multi-ticket — Implementation Plan"
ticket_id: T003103
domains: [ci-cd, scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# preflight-scope-multi-ticket — Implementation Plan

_Ticket: T003103_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `scripts/preflight-pr-scope.sh` | 126 | 674 |
| `tests/spec/ci-cd/preflight-multi-ticket-id.bats` | 71 | — (neu, `.bats` nicht S1-limitiert) |
| `openspec/changes/preflight-scope-multi-ticket/specs/ci-cd.md` | 37 | — (Delta-Spec) |

`scripts/preflight-pr-scope.sh` ist nicht gebaselinet; wirksame Schwelle ist das
`.sh`-Extension-Limit 800 aus `docs/code-quality/gates.yaml`. Die Änderung liegt bei etwa
+12 Zeilen und bleibt weit unter der Schwelle — kein Split nötig.

<!-- vitest: kein neuer Test nötig — die Änderung betrifft ein Bash-Skript, kein
     `website/src/lib/**` oder `website/src/pages/api/**`. Abdeckung erfolgt über BATS. -->

## Kontext

`scripts/preflight-pr-scope.sh:46` extrahiert per `head -n 1` nur die **erste** Ticket-ID des
PR-Titels und vergleicht sie in Zeile 52 mit dem Branchnamen. Nennt der Titel ein zweites Ticket
vor dem eigenen, meldet der Guard FATAL, obwohl Titel und Branch zusammenpassen — und schlägt eine
Branch-Umbenennung auf das nur erwähnte Ticket vor.

**Entschiedenes Zielverhalten: „irgendeine ID passt".** Ein Branch trägt genau eine Ticket-ID;
„alle IDs müssen passen" wäre bei zwei IDs im Titel unerfüllbar und verböte Mehrfach-Tickets im
Titel — das sichert der Guard nicht ab. Abgesichert wird ausschließlich, dass der PR zu **diesem**
Branch gehört; dieser Nachweis steht, sobald eine Titel-ID dem Branch entspricht. Ein Titel, der
nur fremde Tickets nennt, fällt weiterhin durch. Vollständige Begründung: `proposal.md`.

**Abgrenzung:** T003104 (`grep -n … | head -1` in inzwischen 23 Reihenfolge-Guards) teilt das
Muster „erster Treffer ≠ gemeinter Treffer", betrifft aber Testdateien statt dieses Skript. Nicht
Teil dieses Changes — dieser Plan fasst `tests/` nur für den eigenen Guard an.

## Task 1 — RED: Guard-Test für Mehrfach-IDs (bereits im Branch enthalten)

Der Test liegt in `tests/spec/ci-cd/preflight-multi-ticket-id.bats` (Konvention T002416: ein
Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang; die Sammeldatei `tests/spec/ci-cd.bats` wird
nicht erweitert). Er prüft ausschließlich Kommando-Output (T002448-M4) und grenzt jede Zusicherung
auf die FATAL-Zeile ein, weil das Skript `$0` in seiner Usage ausgibt.

Die drei Positiv-Anker (Ein-ID passend, Ein-ID fremd, Erste-ID passend) sind heute grün und müssen
grün bleiben; die beiden anderen Fälle sind der Defekt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/preflight-multi-ticket-id.bats
# expected: FAIL — Tests 3 und 5 rot (Exit 1), Tests 1, 2 und 4 grün.
# Test 3: "Zwei-ID-Titel besteht, wenn die ZWEITE ID zum Branch passt" → Skript
#   meldet FATAL mit 'T003180'.
# Test 5: FATAL-Zeile nennt nur die erste ID, nicht beide.
```

- [ ] Testlauf ausgeführt und die beiden roten Fälle in der Ausgabe bestätigt (nicht nur den
      Exit-Code — ein vertippter Pfad lässt `bats` mit Exit 0 enden, T003278).

## Task 2 — GREEN: alle Titel-IDs einsammeln

In `scripts/preflight-pr-scope.sh` das `head -n 1` in Zeile 46 entfernen und die vollständige
ID-Liste halten. Der Vergleich in Zeile 52 wird zu einer Schleife über alle IDs, die beim ersten
Treffer besteht.

- [ ] `TICKET_IDS` als newline-separierte Liste aller Treffer von `grep -oP '\[T\d{6}\]|T\d{6}'`
      ohne `head -n 1`; Duplikate über `sort -u` entfernen, damit ein doppelt genannter Ticket-Wert
      die Fehlermeldung nicht aufbläht.
- [ ] Leere Liste (`kein Ticket im Titel`) verhält sich unverändert: Guard übersprungen, kein
      Fehler. Diesen Zweig nicht umbauen.
- [ ] Schleife über die IDs mit demselben case-insensitiven Vergleich wie bisher
      (`BRANCH_LC` gegen `TICKET_LC`); beim ersten Treffer den Guard bestehen lassen.
- [ ] FATAL-Zweig nur erreichen, wenn KEINE ID passt. Die Meldung nennt alle gefundenen IDs
      (`PR title ticket IDs 'T003180, T003074' do not match current branch name '…'`) statt einer
      einzelnen.
- [ ] Die Rename-Empfehlung `git branch -m` nur noch ausgeben, wenn **genau eine** ID gefunden
      wurde — bei mehreren ist nicht entscheidbar, auf welches Ticket umbenannt werden soll, und
      ein Vorschlag wäre schlechter als keiner. Bei mehreren IDs stattdessen den Hinweis ausgeben,
      dass mindestens eine ID im Branchnamen stehen muss.
- [ ] Verweis auf T001917 in beiden Zweigen erhalten (der bestehende Test
      `tests/unit/preflight-pr-scope.bats:69` prüft ihn im Ein-ID-Fall).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/preflight-multi-ticket-id.bats
# erwartet: 5/5 grün
```

## Task 3 — Bestandstests und Doku-Anker

- [ ] Beide Testformen der Spec laufen lassen, Sammeldatei UND Verzeichnis (T002696):
      ```bash
      tests/unit/lib/bats-core/bin/bats -r tests/spec/ci-cd*
      tests/unit/lib/bats-core/bin/bats tests/unit/preflight-pr-scope.bats
      ```
      `tests/unit/preflight-pr-scope.bats` enthält den Ein-ID-Mismatch-Test aus T001915 und muss
      unverändert grün bleiben — er belegt, dass die Lockerung nur den Mehrfach-Fall betrifft.
- [ ] Prüfen, ob die Änderung den Kopfkommentar des Skripts berührt (dort ist die
      Allowlist-Historie dokumentiert, nicht der Ticket-Guard). Falls nicht: nichts anfassen.
- [ ] Test-Inventar regenerieren, weil eine neue Testdatei hinzukommt:
      ```bash
      task test:inventory
      ```
      `website/src/data/test-inventory.json` mitcommitten — der Check ist in CI fail-closed.

## Task 4 — Final Verification

- [ ] Die drei verbindlichen CI-Gates laufen lassen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Manueller Gegenprobe-Lauf im echten Worktree, weil der Defekt genau dort auftrat:
      ```bash
      bash scripts/preflight-pr-scope.sh "fix(scripts): loest T003180 mit [T003103]"
      # erwartet: Exit 0 (vor dem Fix: FATAL mit 'T003180')
      ```
- [ ] `bash scripts/plan-lint.sh openspec/changes/preflight-scope-multi-ticket/tasks.md` → Exit 0.
