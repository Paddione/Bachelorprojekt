# Stash-Discipline (git-workflow Schritt 0 — Detail)

Pull-first vor jedem Commit / jeder Branch-Aktion: `origin/main` muss aktuell sein.

```bash
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  git stash push -m "wip ${TICKET_EXT_ID}"
  git pull --rebase origin main
  bash scripts/git-stash-net.sh pop --by-message "wip ${TICKET_EXT_ID}"
  # Teil-Pop-Befund (Exit 1)? Eintrag liegt noch im Stash — NICHT als Erfolg
  # behandeln, Wiederherstellung unten. Kein Treffer (Exit 2) ist ebenfalls
  # kein Erfolg: git stash list prüfen und den Eintrag zurückspielen.
fi
```

> **Stash-Pop positive Verifikation (T003069/T003070).** Nach dem Pop MUSS der eigene Eintrag
> aus `git stash list` verschwunden sein
> (`git stash list | grep -F "wip ${TICKET_EXT_ID}"` findet ihn bei Exit 1 noch). Ein
> verbliebener Eintrag ist ein **Befund, kein Erfolg**: der post-rewrite-Hook hat ein gestashtes
> Freshness-Artefakt schon neu erzeugt, der Pop wendet nur teilweise an. Wiederherstellung:
> `git stash show --stat "stash@{0}"` gegen den Arbeitsbaum halten, fehlende Datei mit
> `git checkout "stash@{0}" -- <pfad>` zurückholen, den Eintrag als Sicherungsnetz liegen lassen.

> **Stash-Disziplin (T003070).** Der Stash-Stack ist über ALLE Worktrees geteilt, `stash@{0}`
> verschiebt sich durch fremde pushes. Bei Parallelarbeit einen **Wegwerf-Commit auf dem eigenen
> Branch** verwenden (`git commit -m wip`, später `git reset --soft HEAD~1`). Wo ein Stash nötig
> bleibt: IMMER mit `-m` und Ticket-ID anlegen und über die Nachricht auflösen
> (`bash scripts/git-stash-net.sh pop --by-message ...`), NIE über den Index `stash@{0}`.

> **Branch-Switch + Stash Race (T001974 Mishap 2).** `git checkout -b <branch> && git stash pop`
> nie in einer Pipeline verketten, sonst landet der Commit auf dem falschen Branch. Jeden Schritt
> einzeln absichern:
>
> ```bash
> git checkout -b fix/my-branch || exit 1   # Branch-Switch abwarten
> git stash pop || { echo "stash pop failed"; exit 1; }
> ```

> **Probe-Commit + `--hard` verwirft auch unstaged Dateien (T001454, T002252/T002253).**
> `git reset -q --hard HEAD~1` nach einem Probe-Commit reißt unstaged Arbeitsdateien mit. Sicher:
> ```bash
> git stash -u && git reset --hard HEAD~1 && git stash pop
> ```
> Oder den Probe in einem separaten Wegwerf-Worktree testen.
