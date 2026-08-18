# T009368 — devflow-post-merge-deploy.sh: --grep -1 trifft Archiv-Commit statt Feature-Merge-Commit

## Problem

`devflow-post-merge-deploy.sh` selektiert den Merge-Commit eines Tickets per
`git log origin/main --grep="[TICKET_ID]" -1` — der neueste Commit mit Ticket-ID im Subject.
OpenSpec-Archiv-Commits (`chore(plans): archive …`) tragen dieselbe Ticket-ID im Subject;
merged der Archiv-PR vor dem Deploy-Lauf, trifft die Selektion den Archiv-Commit, dessen Diff
nur `openspec/changes/archive/`-Pfade enthält → "Keine bekannten Deploy-Trigger", Exit 0, kein
deploy:done-Phase-Event, kein Closure-Scan.

Beleg (T008017-Finalize, 2026-08-16): getroffen wurde der Archiv-Commit `673f14a48` (PR #4690)
statt des Feature-Merge-Commits `abda93f9a` (PR #4688); das deploy:done-Event musste manuell
nachgetragen werden.

## Lösung

Commit-Subject-Klasse filtern: Die Merge-Commit-Selektion wird als Funktion
`select_merge_commit <repo> <ticket_id>` extrahiert und schließt Archiv-Commits aus
(`grep -vE ' chore\(plans\): archive '` auf der Kandidatenliste).

Die im Planentwurf erwogene Variante `--grep=ID --grep="chore(plans): archive" --all-match
--invert-match` ist semantisch falsch: `--all-match` + zwei `--grep`-Patterns heißt "matcht
BEIDE Patterns", die Invertierung dann "matcht nicht beide" — das schließt auch Commits ohne
Ticket-ID ein. Deshalb Filter in Bash statt `git log`-Flag-Kombination.

Task 2 (PR-Nummer als Eingabe) ist bewusst nicht umgesetzt: Kein Aufrufer reicht aktuell eine
PR-Nummer durch (`devflow-post-merge-finalize.sh` ruft den Deploy nicht auf), und die
Subject-Klassen-Filterung erfüllt die Acceptance Criteria vollständig.
