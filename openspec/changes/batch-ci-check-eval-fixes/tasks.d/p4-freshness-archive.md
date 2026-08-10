# p4 — Archive PR: openspec-status.json nicht committet (T003136)

## Ziel

Archive PR #4083 failed freshness gate — openspec-status.json wurde nach dem
Archivieren nicht committet (generiertes Artefakt fehlt im PR).

## Steps

1. **RED.** Test in `tests/spec/batch-ci-check-eval-fixes.bats`: Archivierung
   regeneriert openspec-status.json und der PR enthält sie. `expected: FAIL`.

2. **GREEN.** In `scripts/freshness-regenerate.sh` (und dem Archiv-Workflow):
   nach `openspec.sh archive` das openspec-status.json zwingend regenerieren und
   committen — als Teil des Archiv-Schritts, nicht als vergessener Nachschritt.

3. **Verifikation.** Fall aus T003136: Archiv-PR enthält openspec-status.json-Änderung.

## Acceptance

- Archivierung committet openspec-status.json automatisch.
- Kein freshness-gate-Fail mehr bei Archiv-PRs.
