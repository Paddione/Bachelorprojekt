## Context

PR #3450 (T002393) hat `scripts/factory/pipeline.js` durch `pipeline.mjs` ersetzt. Die konsolidierte Test-Suite `tests/spec/software-factory.bats` wurde korrekt aktualisiert, aber die legacy Datei `tests/local/FA-SF-20-pipeline-contract.bats` referenziert weiter die gelöschte `pipeline.js`. Die 13 Tests in dieser Datei schlagen mit `[ -f "$SCRIPT" ]' failed` fehl, weil `scripts/factory/pipeline.js` nicht mehr existiert.

Die legacy Datei wurde im Zuge der Test-Konsolidierung (Zusammenführung vieler einzelner `tests/local/FA-SF-*.bats` in eine zentrale `tests/spec/software-factory.bats`) nicht entfernt. Die konsolidierte Datei enthält alle 13 FA-SF-20-Tests mit korrekten `pipeline.mjs`-Referenzen.

## Goals / Non-Goals

**Goals:**
- `task test:factory` und `task test:changed` laufen auf `main` wieder grün
- Doppelte Testabdeckung beseitigen (tests/local/ war von tests/spec/ superseded)
- Referenzen auf die gelöschte Datei in Doks und Inventaren entfernen

**Non-Goals:**
- Keine Änderung an Test-Logik oder Coverage — die Tests leben unverändert in `tests/spec/software-factory.bats`
- Keine Änderung an `tests/spec/software-factory.bats` — sie ist bereits korrekt
- Keine Bearbeitung anderer legacy `tests/local/FA-SF-*.bats` Dateien (separates Ticket bei Bedarf)

## Decisions

| Entscheidung | Begründung | Alternative |
|---|---|---|
| **Entfernen** statt Aktualisieren der legacy Datei | `tests/spec/software-factory.bats` deckt FA-SF-20 vollständig ab (alle 13 Test-Titel identisch, Referenzen auf `pipeline.mjs` korrigiert). Die legacy Datei ist nach der Konsolidierung obsolet. | Aktualisieren auf `pipeline.mjs` → hätte doppelte Tests mit gleicher Abdeckung hinterlassen |
| `docs/code-quality/repo-index.json` und `website/src/data/test-inventory.json` aktualisieren | Beide Dateien referenzieren die gelöschte `tests/local/FA-SF-20-pipeline-contract.bats` — ohne Update verweisen sie ins Leere | Puristische Lösung: nur Datei löschen, Inventare ignorieren → hinterlässt valide (tote) Referenzen |

## Risks / Trade-offs

- **[R1] Andere legacy FA-SF-*.bats in tests/local/ könnten ebenfalls veraltete Referenzen haben** → Erkannt während Analyse, aber außerhalb des Scopes von T002421. Bei Bedarf separates Follow-up.
- **[R2] `tests/spec/software-factory.bats` könnte von der legacy Datei abweichen** → Verifiziert: alle 13 Test-Titel und -Logiken sind identisch. Der einzige Unterschied ist die Variable `PIPELINE_SCRIPT` vs. `SCRIPT` und der korrekte Pfad `pipeline.mjs`.
