# p5 — BATS-Tests für die ticket-ops-Meta-Batch-Fixes (Tests-Rolle)

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p4 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ticket-ops-meta-fixes.bats
# expected: FAIL (red — die Fixes aus p1..p4 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/batch-ticket-ops-meta-fixes.bats`:
   - `triage chunk`: Triage-Query bei ~100 Tickets konsumierbar (Chunking/Datei)
   - `freshness edge`: zwei Tickets ohne gemeinsame area, aber generiertes Artefakt
     → Konfliktkante erkannt
   - `stage hold`: stage_plan(hold:true) setzt execution_released=false
   - `mishap withdraw`: zurückgenommener Eintrag erscheint nicht im Flush

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-ticket-ops-meta-fixes/specs/*.md`
   gegen die implementierten Fixes abgleichen.

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/batch-ticket-ops-meta-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen (jeder Defekt hat echten Negativ- und Positiv-Pfad).
