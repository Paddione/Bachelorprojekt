# p6 — Embedding-Completeness-Backfill (T002877)

## Ziel

Collection enthält 12 docs, aber 57 lokale aktive Pläne — die semantische Suche
arbeitet auf ~1/5 des Bestands. Der Backfill-Task (`task openspec:embed:backfill`)
muss alle aktiven Pläne unabhängig vom post-commit-Hook-Durchlauf embedden.

## Steps

1. **RED.** Test in `tests/spec/batch-openspec-embed-fixes.bats`: Backfill über aktive
   Pläne (status=planning|plan_staged|active), die nie durch den Hook liefen.
   `expected: FAIL` (Backfill-Pfad fehlt oder unvollständig).

2. **GREEN.** `Taskfile.yml`: `openspec:embed:backfill`-Task realisieren/reparieren,
   sodass alle aktiven Pläne embedded werden (Collection deckt Bestand ab).

3. **GREEN — Ursache klären.** Bestimmen, warum Pläne fehlen (nie gelaufener Backfill
   oder Pläne außerhalb eines Commits) und im Workflow verhindern, dass Pläne ohne
   Hook-Durchlauf entstehen.

4. **Verifikation.** Completeness-Gate meldet nach Backfill keine Lücke mehr.

## Acceptance

- Backfill embedded alle aktiven Pläne (Task in Taskfile.yml).
- Completeness-Gate meldet nach Backfill keine Lücke.
- Ursache der Lücke im Workflow verhindert.
