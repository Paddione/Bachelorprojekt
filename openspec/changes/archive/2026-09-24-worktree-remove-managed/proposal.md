# Proposal: worktree-remove-managed

## Why

**Symptom (Fakt):** `scripts/devflow-post-merge-finalize.sh` bricht in Schritt 10 mit
`exit 1` ab (`fatal: cannot remove a locked working tree, lock reason: managed agent worktree`);
Branch-Loeschung und alle weiteren Schritte laufen nicht. Beobachtet am 2026-09-23 beim manuellen
Cleanup nach #5835. `scripts/pr-refresh.sh`, `scripts/weekly-dep-schema-audit.sh` und der
EXIT-Trap von `scripts/factory/cleanup.sh` verschlucken denselben Fehler und lassen Worktrees liegen.

**Ursache (belegt):** `scripts/worktree-create.sh:394` sperrt seit a623e9939 (T900046,
2026-09-03) jeden Worktree. `git worktree remove --force` entfernt gesperrte Worktrees nicht;
erst ein `unlock` davor oder ein doppeltes `--force`. Reproducer:

```bash
git init -q r && cd r && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git worktree add -q ../wt -b b1 && git worktree lock ../wt --reason "managed agent worktree"
git worktree remove ../wt --force; echo $?            # 128
git worktree remove ../wt --force --force; echo $?    # 0
```

Nur die Factory-Pfade (`cleanup.sh` Hauptpfad, `watchdog.sh`, `dsh-exec.sh`, `opencode-exec.sh`,
Rollback in `worktree-create.sh`) rufen schon `git worktree unlock` auf.

```bash
# Messung: Remove-Aufrufe ohne vorangehendes unlock (Stand 8aa801c3a)
git grep -n 'worktree remove' 8aa801c3a -- scripts/ | grep -v '#'
```

## What

1. `scripts/lib/worktree-remove.sh` mit `worktree_remove_managed <repo> <path>`: prueft die
   Registrierung, entsperrt, entfernt mit `--force`.
2. Einsatz in den kaputten Aufrufern: finalize Schritt 10, `pr-refresh.sh` (4 Stellen),
   `weekly-dep-schema-audit.sh` (2 Stellen), `factory/cleanup.sh` (EXIT-Trap und Hauptpfad).
3. Anleitungen mit `git worktree unlock` vor dem Remove: `git-workflow`
   (`references/worktree-cleanup.md`), `dev-flow-chore` Schritt 6,
   `references/dev-flow-execute-phases.md`, `references/repo-hygiene-ops.md`.

**Nicht im Scope:** die Sperre selbst (bleibt, Requirement „Cross-Platform Worktree Prune
Protection"); Umstellung der Factory-Pfade, die schon entsperren.

_Ticket: T900340_
