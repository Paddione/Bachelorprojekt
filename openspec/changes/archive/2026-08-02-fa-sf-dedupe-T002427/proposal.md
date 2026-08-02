# Proposal: fa-sf-dedupe-T002427

## Why

`tests/spec/software-factory.bats` ist eine Sammeldatei, in die der komplette `tests/local/FA-SF-*.bats`-Baum (41 Dateien) konsolidiert wurde — **ohne die Originale zu entfernen**. Jeder Fall existierte damit zweimal unter demselben `@test`-Namen.

Diese Duplikation hat einen Fehler aktiv verdeckt: nach dem Entfernen von `scripts/factory/pipeline.js` (PR #3450) sah ein gefilterter Lauf auf `tests/spec/` grün aus, während `task test:factory` über die veralteten Kopien mit 30 Tests rot lief (T002421). Jeder Folge-PR im Factory-Bereich musste den Bruch erst als fremd identifizieren.

T002421 hat die 13 roten Dateien entfernt. Die verbleibenden **27** waren grün, aber dieselbe Falle — sie hätte jederzeit erneut zuschnappen können, und jede Änderung an einem Factory-Skript musste an zwei Stellen nachgezogen werden.

## What

**Deckungsnachweis vor jedem Entfernen** (Methode aus T002421):

| Prüfung | Ergebnis |
|---|---|
| `@test`-Titel gegen die Sammeldatei | 163 von 166 vorhanden |
| Rumpfvergleich nach Normalisierung der Pfadvariablen | **147 identisch, 16 abweichend, 0 echte Abweichungen** |
| Sammeldatei-Lauf | 484 Tests, 0 Fehler |

Die 16 „Abweichungen" lagen alle in `FA-SF-04-db-schema.bats` und bestanden **ausschließlich** darin, dass die Sammeldatei `_skip_if_no_db` **pro Test** ruft, wo die Legacy-Datei nur pauschal in `setup()` überspringt. Die Sammelfassung ist damit die weiterentwickelte, nicht die schwächere.

**Drei Fälle ohne Gegenstück — portiert:**

- `FA-SF-26`: gestaltetes `in_progress`-Feature **mit** gestagtem Plan muss nach `backlog` statt `triage` — sonst wirft der Watchdog den Plan weg und erzwingt einen vollen Scout/Design/Plan-Neustart (T001850). Echtes Gegenstück zum vorhandenen Test ohne Plan.
- `FA-SF-33`: Falsch-Positiv-Wache — das bloße Vorkommen des Wortes „manifest" in einer Erfolgsmeldung darf die Klassifikation nicht auf `manifest` ziehen.
- `FA-SF-70`: statt eines Beinah-Duplikats wurde der **vorhandene** Test verstärkt. Ihm fehlten `[[ "$output" == *"WARNING"* ]]` und `[[ "$output" != *"Usage:"* ]]` — ohne die zweite Zeile bestünde er auch dann, wenn `tier=opus` hart abgelehnt würde, weil die Usage-Ausgabe den Tier-Namen ebenfalls enthält.

**Danach:** 27 Dateien entfernt, `task test:factory` auf die Sammeldatei umgestellt, Fixture `tests/factory-eval/fixtures/T000925/expected.json` nachgezogen, Kopfkommentar der Sammeldatei um den Hinweis ergänzt, dass neue Fälle dorthin gehören.

## Impact

- `task test:factory`: **182 → 503 Tests** — die Sammeldatei deckt deutlich mehr ab als die verbliebene Legacy-Teilmenge
- Änderungen an Factory-Skripten müssen nur noch an einer Stelle nachgezogen werden
- Der Umfang von `test:factory` ändert sich bewusst; deshalb war das ein eigener Vorgang und nicht Teil von T002421

_Ticket: T002427_
