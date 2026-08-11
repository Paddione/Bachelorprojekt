# p4 — Delta-Specs & Verifikation (Tests-Rolle)

## Ziel

Diese Partial ist die Tests-Rolle — IMMER zuletzt, nach allen
Implementierungs-Partials (STRUCT-PARTIAL). Sie gleicht die Delta-Specs gegen die
implementierten Fixes ab und führt die Gesamtverifikation aus. Die BATS-Tests je Fix
liegen bei den Implementierungs-Partials p1..p3.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/software-factory/stage-plan-touched-files.bats \
  tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats \
  tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
# expected: FAIL (red — die Fixes aus p1..p3 sind nicht implementiert)
```

## Steps

1. **Delta-Specs abgleichen.** Die zwei Delta-Dateien gegen die implementierten Fixes
   prüfen (Scenarios 1:1 umsetzen, keine Szenario-Drift):
   - `openspec/changes/batch-plan-tooling-fixes/specs/dev-flow-plan.md`
     (MODIFIED: Plan-QA-Artefakt bei PASS unverändert; Kriterium 5 deterministisch;
     plan-intel multi --target-files)
   - `openspec/changes/batch-plan-tooling-fixes/specs/quickwins-script-fixes.md`
     (MODIFIED: touched_files — Branch-Diff nur als Ergänzung, leere Struktur bleibt
     leer)

2. **Gesamtverifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats \
     tests/spec/software-factory/stage-plan-touched-files.bats \
     tests/spec/dev-flow-plan/plan-qa-parse-and-outcome.bats \
     tests/spec/dev-flow-plan/plan-qa-payload.bats \
     tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden, kein vakues Bestehen — jeder
  Defekt hat echten Negativ- und Positiv-Pfad).
- Delta-Specs und Implementierung deckungsgleich (openspec validate grün).
