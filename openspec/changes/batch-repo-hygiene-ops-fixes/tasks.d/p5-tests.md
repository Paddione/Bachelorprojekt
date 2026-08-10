# p5 — BATS-Tests für die Batch-Fixes (Tests-Rolle)

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p4 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
# expected: FAIL (red — die Fixes aus p1..p4 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/batch-repo-hygiene-ops-fixes.bats` mit je einem
   Testblock pro Defekt:
   - `reaper sweep`: --sweep ohne --ticket listet ALLE Remote-Heads (REAP/KEEP)
   - `reaper empty`: leeres Ergebnis unterscheidbar von Fehlschlag
   - `gone prune order`: [gone]-Ref aus Reaper-Delete wird aufgeräumt
   - `merge tree probe`: Konfliktprobe ohne Working-Tree-Mutation, Phantomkonflikt = ok
   - `cancelled not fail`: cancelled-Jobs ≠ failure
   - `headsha filter`: fremde head-SHAs + conclusion="" nicht als Fehler
   - `tick vorcheck`: tick_running=true überspringt Worktree-Sektion

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-repo-hygiene-ops-fixes/specs/*.md`
   gegen die implementierten Anforderungen abgleichen (ADDED/MODIFIED korrekt).

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/batch-repo-hygiene-ops-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen (jeder Defekt hat echten Negativ- und Positiv-Pfad).
