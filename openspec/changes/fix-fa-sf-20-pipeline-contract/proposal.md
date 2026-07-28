## Why

PR #3450 (T002393) hat `scripts/factory/pipeline.js` entfernt und durch `pipeline.mjs` ersetzt. Die konsolidierte Test-Suite in `tests/spec/software-factory.bats` wurde dabei auf `pipeline.mjs` umgestellt, aber die legacy Datei `tests/local/FA-SF-20-pipeline-contract.bats` referenziert weiter die gelöschte `pipeline.js`. Dadurch sind 13 Tests auf `main` rot, sobald `task test:factory` läuft — was `task test:changed` für jeden Folge-PR im Factory-Bereich blockiert.

## What Changes

- **REMOVE** `tests/local/FA-SF-20-pipeline-contract.bats` — die legacy Datei wurde durch die konsolidierte Test-Suite `tests/spec/software-factory.bats` vollständig ersetzt, welche FA-SF-20 mit korrekten `pipeline.mjs`-Referenzen abdeckt.
- **Dokumentation aktualisiert**: Referenzen in `docs/code-quality/repo-index.json` und `website/src/data/test-inventory.json` werden ebenfalls entfernt.
- **Kein Breaking Change**: die konsolidierte Suite deckt alle 13 Tests ab.

## Capabilities

### New Capabilities
*Keine* — es wird keine neue Fähigkeit eingeführt.

### Modified Capabilities
*Keine* — es ändern sich keine Requirements. Der Test-Inhalt ist vollständig in der konsolidierten Suite (`tests/spec/software-factory.bats`) vorhanden.

## Impact

- **Datei entfernt**: `tests/local/FA-SF-20-pipeline-contract.bats`
- **Dokumentation aktualisiert**: Referenzen in `docs/code-quality/repo-index.json` und `website/src/data/test-inventory.json` werden entfernt
- **13 Tests auf main werden grün**: `task test:factory` und `task test:changed` laufen wieder fehlerfrei
