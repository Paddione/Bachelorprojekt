# Proposal: babysit-prs-live-lock-guard

## Why

Bei der Untersuchung von T003129 (Worktree-Verlust während eines laufenden
`openspec-archive-backlog`-Batches) stellte sich heraus, dass `agent-lock.sh reap` korrekt
gearbeitet hat — der Lock wurde erst stale, *nachdem* der Worktree fehlte. Wer den Worktree
entfernt hat, bleibt ungeklärt und ist **nicht** Gegenstand dieser Änderung.

Bei der Kandidatensuche fiel jedoch eine reale, unabhängig davon bestehende Inkonsistenz auf:
`scripts/factory/cleanup.sh` prüft seit T002896 an zwei Stellen (EXIT-Trap und Hauptpfad)
`agent-lock.sh check-branch-live`, bevor es einen Worktree entfernt — "Der Factory-Autopilot
darf aktiv geclaimte Fremd-Worktrees nicht entfernen." `scripts/factory/watchdog.sh` prüft
wenigstens auf uncommitted changes, bevor es einen Zombie-Worktree entfernt.
`scripts/factory/babysit-prs.sh` (Zeile 222) hat **weder** den Live-Lock-Guard **noch** eine
Dirty-Prüfung: `git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT"` entfernt
bedingungslos, und der `rm -rf`-Fallback setzt sich sogar über ein fehlgeschlagenes
`git worktree remove` hinweg.

`babysit-prs.sh` prüft zwar bei der Kandidatenauswahl (Zeile 109, `is_branch_locked`), ob der
PR-Branch aktuell gelockt ist — das ist aber ein schwächerer, punktueller Check zum Auswahl-
Zeitpunkt (`agent-lock.sh list | grep`), nicht die belastbare Liveness-Prüfung
`check-branch-live`, und er läuft nicht erneut unmittelbar vor dem Removal. Zwischen Auswahl und
Removal liegen `gh pr view`/`gh run view`, `git worktree add`, ein `task freshness:regenerate`-
oder Agent-Fix-Durchlauf und `git push` — ein Zeitfenster, in dem eine andere Session denselben
Branch claimen kann.

## What

- `scripts/factory/babysit-prs.sh` schaltet unmittelbar vor dem Worktree-Removal (Zeile 222)
  denselben `agent-lock.sh check-branch-live "$BRANCH_NAME"`-Guard wie
  `scripts/factory/cleanup.sh` vor. Trägt der Branch einen live Agent-Lock, wird das Removal
  übersprungen und eine Diagnosezeile auf stderr ausgegeben.
- Der bedingungslose `rm -rf "$WT"`-Fallback verschwindet aus dem ungeschützten Pfad — er bleibt
  nur noch als Fallback **innerhalb** des Guards (analog `cleanup.sh`: `git worktree remove`
  zuerst, `rm -rf` nur wenn das *und* der Guard nicht greift).
- Der Fehlerpfad nach fehlgeschlagenem `git worktree add` (Zeile 190-195) wird geprüft, aber
  **nicht** geändert: `$WT` ist dort ein frisch von `babysit-prs.sh` selbst per `mktemp -d`
  angelegtes, nie als Git-Worktree registriertes Scratch-Verzeichnis — `rm -rf "$WT"` entfernt
  dort ausschließlich das eigene Scratch-Verzeichnis, nie einen fremden, ggf. live geclaimten
  Worktree. Kein Guard nötig; im Plan als geprüfter Befund dokumentiert.
- Kein Scope-Erweiterung auf die T003129-Vorfallsaufklärung — nur die Guard-Inkonsistenz
  zwischen `cleanup.sh`, `watchdog.sh` und `babysit-prs.sh`.

_Ticket: T003137_
