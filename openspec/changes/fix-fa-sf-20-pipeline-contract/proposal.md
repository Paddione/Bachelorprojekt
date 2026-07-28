## Why

PR #3450 (T002393) hat `scripts/factory/pipeline.js` entfernt und durch `pipeline.mjs` ersetzt. Die konsolidierte Test-Suite in `tests/spec/software-factory.bats` wurde dabei auf `pipeline.mjs` umgestellt, die Legacy-Dateien unter `tests/local/` aber nicht — sie zeigen weiter auf die gelöschte Datei. Dadurch ist `task test:factory` auf `main` rot, was `task test:changed` für jeden Folge-PR im Factory-Bereich blockiert.

**Befund während der Umsetzung (Abweichung vom ursprünglichen Plan):** Das Ticket nannte nur `tests/local/FA-SF-20-pipeline-contract.bats` mit 13 roten Tests. Ein Lauf von `task test:factory` zeigte jedoch **30 rote Tests über 13 Dateien**. Ursache ist derselbe Vorgang: `tests/spec/software-factory.bats` ist eine Sammeldatei, in die der komplette `tests/local/FA-SF-*.bats`-Baum konsolidiert wurde, ohne die Originale zu entfernen. Der Umfang wurde daher auf alle Dateien erweitert, die auf `pipeline.js` verweisen — sonst bliebe das Ticketziel („`task test:factory` wieder grün") unerreicht.

## What Changes

- **REMOVE** 13 Legacy-Dateien unter `tests/local/`, die auf das gelöschte `scripts/factory/pipeline.js` verweisen. Alle sind in `tests/spec/software-factory.bats` bereits enthalten — nachgewiesen durch Titelvergleich (identische `@test`-Namen) und Rumpf-Diff (nach Normalisierung der Pfadvariablen byte-identisch), bei grünem Lauf der Sammeldatei (484 Tests, 0 Fehler).
- **ADD** ein Test in `tests/spec/software-factory.bats`: `FA-SF-30: dispatcher reads prep from a file, not via child_process (T001812)` war der einzige Fall der 13 Dateien, der in der Sammeldatei fehlte, und wird vor dem Entfernen portiert.
- **Generierte Indizes**: `website/src/data/test-inventory.json` wird per `task test:inventory` regeneriert.
- **Kein Deckungsverlust**: jeder entfernte `@test`-Titel existiert grün in der Sammeldatei.

## Capabilities

### New Capabilities
*Keine* — es wird keine neue Fähigkeit eingeführt.

### Modified Capabilities
*Keine* — es ändern sich keine Requirements; nur duplizierte Test-Dateien entfallen.

## Impact

- **13 Dateien entfernt** unter `tests/local/` (FA-SF-20, -30, -31, -37, -39, -40, -43, -44, -45, -46, -59, -60, -63)
- **`task test:factory` wieder grün**: 182 Tests, 0 Fehler (vorher 30 rot)
- **Nicht in diesem Vorgang**: Die restlichen 27 `tests/local/FA-SF-*.bats` sind ebenfalls Duplikate der Sammeldatei, aber grün. Ihre Entdopplung ist ein eigener Vorgang, weil sie den Umfang von `task test:factory` selbst verändert.
