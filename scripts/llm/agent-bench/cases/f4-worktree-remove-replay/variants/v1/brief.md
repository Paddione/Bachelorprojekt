# Auftrag: Gesperrte Worktrees lassen sich nicht entfernen (Replay T900340)

Symptom (beobachtet): `scripts/devflow-post-merge-finalize.sh` bricht mit
`fatal: cannot remove a locked working tree` ab; Branch-Loeschung und alle
weiteren Schritte laufen nicht. `scripts/pr-refresh.sh`,
`scripts/weekly-dep-schema-audit.sh` und der EXIT-Trap von
`scripts/factory/cleanup.sh` verschlucken denselben Fehler und lassen
Worktrees liegen.

Ursache: `scripts/worktree-create.sh` sperrt jeden Worktree
(`managed agent worktree`), aber `git worktree remove --force` entfernt
gesperrte Worktrees nicht. Reproducer:

```bash
git init -q r && cd r && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git worktree add -q ../wt -b b1 && git worktree lock ../wt --reason "managed agent worktree"
git worktree remove ../wt --force; echo $?            # 128
```

Baue EINE gemeinsame Bibliothek `scripts/lib/worktree-remove.sh` mit
`worktree_remove_managed <repo> <path>` (entriegeln, dann `remove --force`;
nicht registrierte Pfade ablehnen statt physisch loeschen) und stelle alle
vier Aufrufer darauf um:

- `scripts/devflow-post-merge-finalize.sh`
- `scripts/pr-refresh.sh`
- `scripts/weekly-dep-schema-audit.sh`
- `scripts/factory/cleanup.sh`

Keine anderen Dateien aendern.
