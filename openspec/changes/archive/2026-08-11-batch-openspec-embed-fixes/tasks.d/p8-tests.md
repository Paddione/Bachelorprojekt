# p8 — BATS-Tests für die Batch-Fixes (Tests-Rolle)

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p7 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-openspec-embed-fixes.bats
# expected: FAIL (red — die Fixes aus p1..p7 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/batch-openspec-embed-fixes.bats` mit je einem
   Testblock pro Defekt:
   - `partial chunking`: >4096-Token-Partial wird gesplittet (kein 400)
   - `parse loop`: träger Port-Forward endet nicht still (rc != 1 mit Output)
   - `port conflict`: 15432-Kollision wird als Ursache gemeldet
   - `false unreachable`: erreichbares Backend → keine "nicht erreichbar"-Meldung
   - `archive batch`: N Changes in einem Node-Prozess
   - `placeholder seed gate`: Stub-Delta → Exit ≠ 0; ausformuliertes Delta → Exit 0
   - `completeness backfill`: Backfill embedded aktive Pläne
   - `archive main doc`: Runbook-Weg ohne SKIP_MAIN_COMMIT_GUARD (Doku-Referenz)

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-openspec-embed-fixes/specs/*.md`
   gegen die implementierten Anforderungen abgleichen (ADDED/MODIFIED korrekt).

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/batch-openspec-embed-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen (jeder Defekt hat einen echten Negativ- und Positiv-Pfad).
