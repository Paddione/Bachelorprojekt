---
title: "mishap-dedupe-konversion — Implementation Plan"
ticket_id: T003120
domains: [bachelorprojekt-test, bachelorprojekt-db]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-dedupe-konversion — Implementation Plan

_Ticket: T003120 (führend) · mitbehandelt: T003117_
_Design und Messreihen: [`design.md`](design.md)_

## File Structure

```
NEW      tests/fixtures/mishap-dedupe-korpus.json                     (bereits im Stage-Commit)
NEW      tests/spec/mishap-tracking/dedupe-korpus.bats                (bereits im Stage-Commit, RED)
NEW      tests/spec/mishap-tracking/go-tests-registriert.bats         (bereits im Stage-Commit, RED)
NEW      scripts/ticket-mcp/go/internal/tools/mishap_konversion_test.go (bereits im Stage-Commit, RED)
NEW      scripts/vda/ticket/find-similar.sh
MODIFIED Taskfile.yml                                                 (+ ticket-mcp:test)
MODIFIED .github/workflows/ci.yml                                     (+ Aufruf von ticket-mcp:test)
MODIFIED scripts/ticket-mcp/go/internal/tools/mishap.go
MODIFIED scripts/ticket.sh                                            (+ Dispatch-Zeile find-similar)
MODIFIED .claude/skills/ticket-ops/SKILL.md                           (Dedupe-Guard-Invariante)
MODIFIED .claude/skills/mishap-tracker/SKILL.md                       (Beschreibung an das Verhalten angleichen)
MODIFIED openspec/specs/mishap-tracking.md                            (durch openspec:archive, nicht von Hand)
```

**S1-Budgets.** Die wirksame Schwelle je Datei ist der Baseline-Wert, falls gebaselined,
sonst das Extension-Limit. Vor dem ersten Schreiben lesen, nicht aus diesem Plan abschreiben:

```bash
jq -r 'to_entries[] | select(.key|test("mishap.go|find-similar|Taskfile.yml|ticket-ops")) | "\(.key)\t\(.value)"' docs/code-quality/baseline.json
grep -A20 '^s1:' docs/code-quality/gates.yaml
```

Stand bei Planerstellung: keine der berührten Dateien ist in `baseline.json` erfasst.
`scripts/ticket.sh` steht in der `s1.ignore`-Liste von `gates.yaml`. `.go` und `.md` haben
kein S1-Limit. `.sh` liegt bei 800; `scripts/vda/ticket/find-similar.sh` ist eine neue Datei
und startet weit darunter. **Kein Budget ist knapp — es ist kein Verkleinerungsschritt nötig.**

## Partials

Ein Partial. Die Aufgaben sind streng sequenziell: Task 0 ist ein Vorbedingungs-Gate, und
Task 3 darf erst laufen, wenn Task 1 die Tests überhaupt ausführbar gemacht hat. Eine
Aufteilung auf parallele Slots würde genau diese Reihenfolge aufweichen.

| # | Rolle | target_files |
|---|---|---|
| p1 | fix + tests | alle oben gelisteten |

---

## Task 0 (p1) — Vorbedingungs-Gate: T002931 muss auf `main` sein

**Bindend, nicht beratend.** Solange `scripts/factory/mishap-rollup.sh` keinen Plan aus dem
Rollup-Container extrahiert (T002931), wäre der Container nach Entfernen der
Konversionsschleife ein schwarzes Loch — es gäbe gar keinen Ausgang mehr statt eines
schlechten. Der Plan geht **nicht** davon aus, dass beide Changes gleichzeitig mergen.

- [ ] Prüfen, ob T002931 auf `main` gemergt ist. Ist es das nicht, wird **Task 3
      übersprungen** und der Rest des Plans (Tasks 1, 2, 4, 5) trotzdem umgesetzt; Task 3
      folgt in einem eigenen PR, sobald T002931 liegt. Teil 2 hängt nicht an Teil 1.

```bash
git fetch origin main --quiet
bash scripts/agent-lock.sh check-merged T002931
# rc=1 → T002931 liegt auf main → Task 3 darf laufen
# rc=0 → noch nicht gemergt → Task 3 auslassen und im PR-Text vermerken
```

- [ ] Das Ergebnis im PR-Text festhalten (welcher Zweig gewählt wurde und warum).

## Task 1 (p1) — Die ticket-mcp-Go-Tests in CI registrieren

Ohne diesen Schritt läuft der Test aus Task 2/3 nirgends. `mishap_test.go` existiert seit
langem und wird von keinem Runner aufgerufen — dieselbe Lage wie T002657.

- [ ] Taskfile-Ziel `ticket-mcp:test` ergänzen, das `make -C scripts/ticket-mcp/go test`
      aufruft (neben dem bestehenden `ticket-mcp:build`, Taskfile.yml um Zeile 5209).
- [ ] Den Aufruf in `.github/workflows/ci.yml` in dem Job platzieren, der bereits
      `actions/setup-go@v5` einrichtet (um Zeile 277) — kein zweiter Go-Setup.
- [ ] Prüfen, dass das Ziel bei fehlender Go-Toolchain nicht hart bricht, sondern der
      BATS-Guard sauber skippt.

**Failing-Test-Step (RED).** Der Guard aus dem Stage-Commit belegt den Ausgangszustand:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-tracking/go-tests-registriert.bats
# expected: FAIL (rot — `scripts/ticket-mcp/go test` steht in keinem Taskfile-Ziel)
```

Nach dieser Aufgabe muss der zweite `@test` dieser Datei grün sein. Der erste bleibt rot,
solange Task 3 aussteht — das ist beabsichtigt und keine Regression.

## Task 2 (p1) — `ticket.sh find-similar` (Teil 2 des Fixes)

Eine Implementierung, zwei Aufrufer. Neues Subkommando nach dem Muster der übrigen
Subkommandos: Logik in `scripts/vda/ticket/find-similar.sh`, in `scripts/ticket.sh` nur die
Dispatch-Zeile (`find-similar) ... ;;` im `case`-Block um Zeile 1072).

Ausgangsregel — vom Planer an den 12 Paaren des Korpus durchgerechnet, aber **nicht bindend**;
bindend ist allein das Testergebnis 9/9 und 0/3:

1. **Komponenten-Überlappung:** Die `areas`/`component`-Zeichenketten werden in Token
   zerlegt (Trennung an Nicht-Alphanumerik außer `-`, `_`, `.`, `/`). Ein Paar besteht die
   Stufe, wenn es mindestens ein Token der Länge ≥ 4 teilt, das kein Allerweltstoken ist
   (`scripts`, `skills`, `tests`, `spec`, `hook`, `hooks`).
2. **Bezugs-Überlappung:** Aus `title` + `description` werden *unterscheidende Bezüge*
   extrahiert — Slash-Pfade, Dateinamen mit Endung, Ticket-IDs (`T\d{6}`) und Zahlen ab vier
   Stellen. Von dieser Menge werden die Token abgezogen, die schon aus der eigenen
   `component` stammen. Ein Paar besteht die Stufe, wenn die Restmengen mindestens ein
   Element teilen.

Der Abzug in Schritt 2 ist der Punkt, an dem die drei Nicht-Dubletten scheitern: bei ihnen
ist der einzige gemeinsame Pfad die Komponente selbst (`scripts/plan-qa-check.sh`,
`scripts/worktree-create.sh`, `repo-hygiene/worktrees`). Ohne den Abzug wären zwei der drei
Fehlalarme.

- [ ] `--corpus <datei>` implementieren: liest den JSON-Korpus statt der Datenbank. Der Test
      darf nie eine DB-Verbindung öffnen.
- [ ] Ohne `--corpus` gegen die offenen Tickets der Brand laufen (`ticket.sh list`-Pfad,
      read-only).
- [ ] Kein Netzzugriff. Keine Embedding-Aufrufe. Der `bge`-Weg bleibt dokumentiert
      (design.md), wird aber nicht gebaut.
- [ ] Ausgabe: eine Zeile je Kandidatenpaar mit beiden `external_id`s und dem
      auslösenden gemeinsamen Bezug. Exit 0 auch bei null Kandidaten.

**Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-tracking/dedupe-korpus.bats
# expected: FAIL (rot — `ticket.sh find-similar` existiert nicht)
```

## Task 3 (p1) — Einzelticket-Konversion entfernen (Teil 1 des Fixes)

**Nur ausführen, wenn Task 0 rc=1 lieferte.**

- [ ] In `mishap.go` die Schwellwert-Logik aus der Handler-Closure in eine benannte Funktion
      `processBufferAtThreshold(entries []MishapEntry, brand string) error` heben. Sie hängt
      die Einträge an den Rollup-Container an — und tut sonst nichts. Die Konversionsschleife
      (aktuell Zeilen 320–326) entfällt.
- [ ] `FlushStaleBuffer` auf dieselbe Funktion umstellen; die dortige Konversionsschleife
      (aktuell Zeilen 393–397) entfällt.
- [ ] `createFactoryFixTicket` und `buildFactoryFixTicketArgs` löschen — nach den beiden
      Schritten unbenutzt. Die zugehörigen Fälle in `mishap_test.go` (um Zeile 349 und 375)
      mit entfernen.
- [ ] `findOpenTicketByTitle` **behalten**: `createIncidentTicket` nutzt es weiter.
- [ ] Die Ergebnismeldung von `report_mishap` anpassen — sie nennt derzeit
      „Factory-Fix-Tickets: %d", was es dann nicht mehr gibt.

**Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-tracking/go-tests-registriert.bats
# expected: FAIL (rot — das Paket kompiliert nicht: `undefined: processBufferAtThreshold`)
```

Derselbe Guard wird grün, sobald die Funktion existiert und keine `create --type fix`-Aufrufe
mehr entstehen. Die eigentliche Messung steht in
`scripts/ticket-mcp/go/internal/tools/mishap_konversion_test.go`: Aufruflog eines
Stub-`ticket.sh`, genau ein Container-Append (Positiv-Anker), null Einzelticket-Anlagen.

## Task 4 (p1) — Aufrufer verdrahten und Beschreibungen angleichen

- [ ] `createIncidentTicket` um die zweite Stufe ergänzen: bei exaktem Titeltreffer bleibt
      alles wie heute; bei einem `find-similar`-Treffer wird das Ticket **regulär angelegt**
      und zusätzlich eine `relates_to`-Kante samt Kommentar gesetzt, der den Kandidaten
      benennt. Die Anlage wird nie unterdrückt.
- [ ] In `.claude/skills/ticket-ops/SKILL.md` die Invariante „Dedupe-Guard vor jeder
      Intake-Zeile" (um Zeile 63) auf den zweistufigen Aufruf umstellen: Stufe 1 exakter
      Titel wie bisher, Stufe 2 `ticket.sh find-similar`. Ausdrücklich festhalten, dass ein
      Stufe-2-Treffer vorgelegt und nicht automatisch zusammengeführt wird — im gemessenen
      Lauf waren 12 von 12 Embedding-Treffern bei Schwelle 0.74 Fehlalarme.
- [ ] In `.claude/skills/mishap-tracker/SKILL.md` prüfen, ob die Zusage „one aggregate ticket
      rather than creating N individual tickets" nach Task 3 zutrifft, und die Formulierung
      an das tatsächliche Verhalten angleichen (falls Task 3 übersprungen wurde: die
      Doppelnatur benennen, statt eine Unwahrheit stehen zu lassen).

## Task 5 (p1) — Abschließende Verifikation

- [ ] Beide BATS-Dateien grün, Go-Suite grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-tracking*
make -C scripts/ticket-mcp/go test
```

- [ ] Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `task openspec:validate` grün.
- [ ] Gegenprobe zur Wirkung: nach dem Merge einmal `get_mishap_buffer` bis zur Schwelle
      füllen lassen und in der DB prüfen, dass keine neuen `### Mishap-Fix`-Tickets
      entstanden sind, der Container-Kommentar aber gewachsen ist.
