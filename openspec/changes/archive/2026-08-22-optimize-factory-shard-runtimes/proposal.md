# Proposal: optimize-factory-shard-runtimes

## Why
Die 4 Factory-Spec-Shards (`test-factory-shard`) in GitHub Actions stellen regelmäßig den kritischen Pfad der CI-Laufzeit dar. Zwei Hauptineffizienzen treiben die Gesamtlaufzeit und Varianz hoch:
1. **Redundantes Setup pro Shard**: Jeder der 4 Matrix-Runner führt eigenständig `task ticket-mcp:test` (Go-Build und Go-Unit-Tests) aus, anstatt dies einmalig im parallel laufenden Fast-Job (`test-factory-openspec`) zu erledigen.
2. **Veraltetes Shard-Balancing**: `tests/spec/.spec-runtime.tsv` enthält nur 451 Einträge, während das Repository mittlerweile 657 `.bats`-Dateien unter `tests/spec/` umfasst. Über 200 Dateien fallen auf das ungenaue Fallback-Gewicht (`@test`-Anzahl) zurück, was zu Schieflagen (Tail-Latency) führt.

## What
1. **Workflow-Optimierung (`.github/workflows/ci.yml`)**:
   - `task ticket-mcp:test` aus `test-factory-shard` entfernen und in `test-factory-openspec` verschieben.
2. **Re-Balancing der Spec-Suite**:
   - Vollständige Neuvermessung aller 657 Spec-Dateien via JUnit-Reports / Messlauf.
   - Aktualisierung von `tests/spec/.spec-runtime.tsv`.

_Ticket: T013528_
