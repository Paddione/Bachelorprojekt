# p4 — BATS-Tests für die Quick-Win-Fixes (Tests-Rolle)

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p3 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/quickwins-script-fixes.bats
# expected: FAIL (red — die Fixes aus p1..p3 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/quickwins-script-fixes.bats` mit je einem
   Testblock pro Defekt:
   - `touched files`: unerwähnte, aber real geänderte Datei in touched_files
   - `preflight scope`: Test deterministisch, unabhängig von realem Diff (Fixture)
   - `backup restore`: beschädigter kubectl-Attach-Download wird erkannt;
     intaktes Backup besteht (Positiv-Anker)

2. **Delta-Spec.** `openspec/changes/quickwins-script-fixes/specs/quickwins-script-fixes.md`
   gegen die implementierten Fixes abgleichen.

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/quickwins-script-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen (jeder Defekt hat echten Negativ- und Positiv-Pfad).
