## p1 — Helper `scripts/lib/worktree-remove.sh`

Target files: `scripts/lib/worktree-remove.sh`

Requirement: agent-skills „Removal of managed worktrees unlocks before removing". Neue
source-only Datei, Richtwert unter 40 Zeilen, Kopfkommentar nach dem Muster von
`scripts/lib/worktree-set.sh` (Warum als Lib, Verweis auf T900046 und T900340).

- [ ] **`worktree_remove_managed <repo> <path>` implementieren.**
  1. Beide Argumente Pflicht; fehlt eins: Meldung auf stderr, `return 2`.
  2. Registrierung pruefen: `git -C "$repo" worktree list --porcelain | grep -qxF "worktree $path"`.
     Nicht registriert: `worktree_remove_managed: $path ist kein registrierter Worktree von $repo`
     auf stderr, `return 1` (design.md D4).
  3. `git -C "$repo" worktree unlock "$path" 2>/dev/null || true` — ein ungesperrter Worktree
     laesst `unlock` scheitern, das ist kein Fehler.
  4. `git -C "$repo" worktree remove --force "$path"`; dessen Exit-Status zurueckgeben. stderr nicht
     unterdruecken — die Aufrufer entscheiden selbst ueber `2>/dev/null`.
  Kein `set -e` in der Lib (sie wird in Skripte mit eigener Fehlerbehandlung gesourct).

- [ ] **Helper-Tests gruen.**

```bash
tests/unit/lib/bats-core/bin/bats -f 'Helper|ungesperrt|registriert' tests/spec/agent-skills/worktree-remove-managed.bats
# expected: 3/3 ok
```
