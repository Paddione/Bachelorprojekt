# Proposal: branch-reaper-local-ref

## Why

`scripts/branch-reaper.sh` meldet `DELETED <branch>`, löscht aber ausschliesslich den
Remote-Ref. Belegt an Zeile 189–204: die Löschschleife führt nur `git push $REMOTE
$sha:refs/tags/reaped/…` und `git push $REMOTE --delete $branch` aus; ein `git branch -d/-D`
kommt im gesamten Skript nicht vor (`grep -nE 'git branch|branch -D|branch -d'
scripts/branch-reaper.sh` liefert keine Treffer). Die unqualifizierte Meldung liest sich als
vollständige Löschung. Folge: nach jedem Reap bleibt der lokale Branch liegen, dessen Upstream
ab da `[gone]` ist — genau die Leichen, die der Reaper beseitigen soll.

Der SSOT-Spec `openspec/specs/ci-cd.md` → „Post-Merge Reaping of Orphaned Remote Branches"
spricht durchgehend nur von *remote branches* und trifft über den lokalen Ref keine Aussage.
Das Verhalten ist damit weder gedeckt noch verboten — die Lücke wird hier geschlossen.

## What

Der Reaper löscht nach erfolgreichem Remote-Delete auch den lokalen Branch-Ref, aber nur wenn
dieser exakt auf den archivierten SHA zeigt. Ein lokaler Ref mit ungepushter Arbeit (anderer
SHA) bleibt unangetastet — er wäre durch den Archiv-Tag nicht gedeckt und damit unwiederbringlich.

Nicht Teil dieses Vorgangs: `--dry-run` ohne `--ticket` (T003180) und der ticketlose Sweep über
alle Remote-Heads (T003074). Beide betreffen dasselbe Skript, aber andere Stellen —
Argumentparser bzw. Kandidatenauswahl (Zeile 63–79 / 118–130). Dieser Vorgang fasst
ausschliesslich die Löschschleife am Dateiende an.

_Ticket: T003182_
