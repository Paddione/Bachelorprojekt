# Proposal: agent-lock-windows-drive-path

## Why

`scripts/agent-lock.sh` war unter Windows aus jedem Worktree heraus unbenutzbar, solange
`AGENT_LOCK_DIR` nicht von Hand gesetzt wurde: `_lock_dir()` prueft mit
`case "$common" in /*)` auf absolute Pfade, Git-for-Windows liefert aus einem Worktree
aber `C:/…/.git` ohne fuehrenden Slash. Der else-Zweig haengte den Laufwerkspfad an
`$toplevel`, das `cd` scheiterte und das Lock-Verzeichnis wurde zu `/agent-locks`.

**Der Muster-Fix ist waehrend der Planung direkt auf `main` gelandet** — Commit
`d60c3704` (2026-08-31 04:47) setzt `[A-Za-z]:[/\]*` und `\*`. Verifiziert aus einem
Worktree ohne `AGENT_LOCK_DIR`: die Aufloesung funktioniert. Dieser Change dokumentiert
das Verhalten nachtraeglich als Requirement und sichert es mit einem Guard ab, der die
Windows-Laufwerksform ueber einen `git`-Shim auch auf Linux-CI erzwingt — ohne den waere
der Test dort dauerhaft gruen und wuerde nichts schuetzen.

Verworfen: `git rev-parse --path-format=absolute --git-common-dir`. Gemessen mit
git 2.55.0.windows.5 liefert auch diese Form `C:/…` ohne fuehrenden Slash — die
Git-Invocation zu tauschen loest das Muster-Problem nicht.

## Der Restumfang

Derselbe Commit hat zwei Folgen hinterlassen, die offen sind:

1. **`main` ist im Quality-Gate rot.** `scripts/agent-lock.sh` steht bei 806 Zeilen bei
   einem S1-Limit von 800; `node scripts/code-quality/check.mjs` meldet
   `✗ NEW: S1:scripts/agent-lock.sh — 806 lines > 800 limit (.sh)`. Behoben wird das
   durch Aufteilen — der Reap-Block wandert nach `scripts/agent-lock-reap.sh`, nach dem
   Muster der vier bereits vorhandenen Fragmente. Eine untrackte Vorarbeit dazu
   (230 Zeilen) lag im Haupt-Checkout und wurde vor dessen Bereinigung gesichert; sie
   wird nach Review uebernommen statt neu geschrieben.

2. **Der main-Checkout-Guard in `worktree-create.sh` wurde entfernt**, nicht verbessert —
   ohne Ticket-Referenz in der Commit-Message und ohne Spec-Delta. Deshalb meldet
   `agent-lock.sh check-merged T900023` bis heute "NOT found on main", obwohl der Fix
   dort liegt. Ob die Entfernung tragfaehig ist oder der Guard mit handlungsfaehiger
   Diagnose zurueckkommt, wird geprueft statt vorweggenommen.

Unveraendert offen bleibt der **opencode-Startton**. Die Ursache ist nicht belegt; es
gibt drei Kandidaten aus dem Log. Der Reproducer steht vor dem Fix — ein Fix auf Verdacht
faellt unter die Bug-Triage-Konvention.

_Ticket: T900023_
