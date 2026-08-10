# p7 — BATS-Tests für die CI-Batch-Fixes (Tests-Rolle)

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p6 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-ci-check-eval-fixes.bats
# expected: FAIL (red — die Fixes aus p1..p6 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/batch-ci-check-eval-fixes.bats`:
   - `vacuous all`: leere Checkliste ≠ "CI ok"
   - `push failure`: abgelehnter Commit + Push wird als inkonsistent erkannt
   - `stale scope`: Push nach Rebase akzeptiert
   - `freshness archive`: Archiv-PR enthält openspec-status.json
   - `live e2e gate`: openspec/-only startet kein Live-E2E
   - `cluster bats`: cluster-bats laufen oder Skip explizit

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-ci-check-eval-fixes/specs/*.md`
   gegen die implementierten Fixes abgleichen.

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/batch-ci-check-eval-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen (jeder Defekt hat echten Negativ- und Positiv-Pfad).
