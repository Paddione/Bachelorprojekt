# f4-worktree-remove-replay — Quelle

Begebenheit (T900340, PR #5840, Change `2026-09-24-worktree-remove-managed`):
`devflow-post-merge-finalize.sh` brach in Schritt 10 mit `fatal: cannot
remove a locked working tree` ab — `worktree-create.sh` sperrt seit T900046
jeden Worktree, und `git worktree remove --force` entfernt gesperrte
Worktrees nicht. Drei weitere Skripte verschluckten denselben Fehler still.

Anfrage: Cleanup nach dem Merge bricht ab, Worktrees bleiben liegen.
Richtige Entscheidung: Eine gemeinsame Bibliothek
`scripts/lib/worktree-remove.sh` mit `worktree_remove_managed <repo> <path>`
(unlock, dann remove --force, Registrierungs-Guard), alle vier Aufrufer
(`devflow-post-merge-finalize.sh`, `pr-refresh.sh`,
`weekly-dep-schema-audit.sh`, `factory/cleanup.sh`) nutzen sie.
Schiefgegangen: Vorher vier driften kopierte Stellen, davon drei stille —
der Fall misst, ob ein Modell die gemeinsame Stelle baut statt viermal zu
flicken.

Replay: Der Bench erzeugt einen Worktree auf dem Parent-Commit des echten
Fixes (6ee026496) und kopiert den archivierten Change als Plan-Geruest ein.
Die Checks laufen offline in einem Kratz-Repo unter $TMPDIR.

Rot/Gruen-Nachweis (manuell, 2026-09-27): `checks/run.sh` ist auf dem
Parent-Commit rot (Exit 1: `scripts/lib/worktree-remove.sh` fehlt, kein
Aufrufer nutzt es) und auf dem Merge-Commit 3631636fc gruen (Exit 0:
Bibliothek entfernt einen gesperrten Worktree, alle vier Aufrufer binden sie
ein). Der seeded-1.diff (nur doppeltes --force in einem Aufrufer, keine
Bibliothek) ist gegen dieselben Checks rot.
