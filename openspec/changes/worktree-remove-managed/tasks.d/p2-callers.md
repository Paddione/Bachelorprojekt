## p2 — Aufrufer auf den Helper umstellen

Target files: `scripts/devflow-post-merge-finalize.sh`, `scripts/pr-refresh.sh`,
`scripts/weekly-dep-schema-audit.sh`, `scripts/factory/cleanup.sh`

Restbudgets (S1): `scripts/devflow-post-merge-finalize.sh` Restbudget 9,
`scripts/pr-refresh.sh` Restbudget 530, `scripts/weekly-dep-schema-audit.sh` Restbudget 705,
`scripts/factory/cleanup.sh` Restbudget 714. In finalize netto hoechstens +2 Zeilen (ein
`source` samt shellcheck-Kommentar; die Remove-Zeile wird ersetzt, nicht ergaenzt).

- [ ] **finalize Schritt 10.** Bei den anderen Lib-Einbindungen (um Zeile 110–116):
  `# shellcheck source=scripts/lib/worktree-remove.sh` und
  `source "$_FINALIZE_HERE/lib/worktree-remove.sh"`. Die Zeile
  `if git -C "$REPO_DIR" worktree remove "$WORKTREE" --force; then` wird zu
  `if worktree_remove_managed "$REPO_DIR" "$WORKTREE"; then`. Die ERROR-Meldung und `exit 1`
  im else-Zweig bleiben unveraendert.

- [ ] **`scripts/pr-refresh.sh` (vier Stellen, Zeilen ~189/203/217/233).** Lib einmal oben
  sourcen (`$REPO_ROOT/scripts/lib/worktree-remove.sh`). Jede Form
  `git -C "$REPO_ROOT" worktree remove "$wt" --force` wird zu
  `worktree_remove_managed "$REPO_ROOT" "$wt"`; Umleitungen (`>/dev/null 2>&1`) und `|| true`
  bleiben wie sie sind.

- [ ] **`scripts/weekly-dep-schema-audit.sh` (Zeilen ~61 und ~94).** Lib sourcen, beide
  `git worktree remove "$WORKTREE" --force` durch `worktree_remove_managed "$(pwd)" "$WORKTREE"`
  ersetzen. Vorher pruefen, in welchem Verzeichnis das Skript an diesen Stellen steht; ist es nicht
  das Haupt-Repo, `git rev-parse --show-toplevel` des Haupt-Checkouts als `<repo>` verwenden.
  `2>/dev/null || true` bleibt.

- [ ] **`scripts/factory/cleanup.sh`.** Lib sourcen (`$(dirname "$0")/../lib/worktree-remove.sh`).
  EXIT-Trap (Zeile ~35) und Hauptpfad (Zeilen ~47–48: `unlock` + `remove`) auf
  `worktree_remove_managed "$(git rev-parse --show-toplevel)" "$WT_PATH"` umstellen; die separate
  `unlock`-Zeile im Hauptpfad entfaellt. Bestehende Tests der Factory-Cleanup-Pfade muessen gruen
  bleiben.

- [ ] **Aufrufer-Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-remove-managed.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-worktree-branch-validation.bats tests/spec/agent-skills/post-merge-finalize-guards.bats tests/spec/agent-skills/finalize-hardening.bats
# expected: alle ok
```
