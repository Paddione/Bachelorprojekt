# p8 — BATS-Tests für die Git/Worktree-Batch-Fixes (Tests-Rolle)

## Ziel

Ein gemeinsamer BATS-Test-Suite-Datei deckt die Fixes p1-p7 ab. Diese Partial
ist die Tests-Rolle — IMMER zuletzt, nach allen Implementierungs-Partials.

## RED — Failing-Test-Step (STRUCT2)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/batch-git-worktree-integrity-fixes.bats
# expected: FAIL (red — die Fixes aus p1..p7 sind nicht implementiert)
```

## Steps

1. **Sammel-Testdatei.** `tests/spec/batch-git-worktree-integrity-fixes.bats`:
   - `stash pop partial`: teilweiser pop meldet Restbestand
   - `worktree orphan`: Waise nicht als Hauptrepo gemessen
   - `write guard sid`: Nebenläufige Subagenten einer Session ≠ Konflikt
   - `stash net`: Worktree-lokaler Stash nicht global sichtbar
   - `loose objects`: 0-Byte-Object vor fetch erkannt
   - `crash dirty`: kein Falsch-Positiv nach abgebrochener Operation
   - `rebase freshness`: Artefakt bleibt oder Verlust gemeldet

2. **Delta-Spec-Finalisierung.** `openspec/changes/batch-git-worktree-integrity-fixes/specs/*.md`
   gegen die implementierten Fixes abgleichen.

3. **Verifikation.**
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/batch-git-worktree-integrity-fixes.bats
   task test:changed
   task freshness:regenerate && task freshness:check
   ```

## Acceptance

- Alle Testblöcke grün (Implementierung vorhanden).
- Kein vakues Bestehen (jeder Defekt hat echten Negativ- und Positiv-Pfad).
