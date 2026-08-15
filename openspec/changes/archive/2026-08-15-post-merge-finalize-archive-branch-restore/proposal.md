# Proposal: post-merge-finalize-archive-branch-restore

## Why

Nach-Merge-Befund zu T006348 (PR #4572): Der Plan deklarierte zwei Härtungen der
Archiv-Sektion von `scripts/devflow-post-merge-finalize.sh` — (a) den
Idempotenz-Skip via `git ls-remote` (implementiert) und (b) das Merken des
vorherigen Branches (`ARCHIVE_PREV_BRANCH`) mit Restore nach Push/PR (fehlt).
Auf main wechselt die Archiv-Sektion weiterhin per `git checkout -B
"$ARCHIVE_BRANCH" origin/main` den Branch des geteilten Arbeitsbaums (Worktree
oder Haupt-Checkout) ohne Rückkehr — T002357-Fallenklasse: parallele Sessions im
geteilten Checkout laufen danach auf dem falschen Branch weiter.

Beleg (MESSUNG, T002717 — Stand vor PR #4586, nachstellbar):

```bash
PRE=8422d5b3993124642beec769264b891acc178960   # main vor dem Fix-Merge
git show "$PRE:scripts/devflow-post-merge-finalize.sh" | grep -c ARCHIVE_PREV_BRANCH   # → 0
```

Der BATS-Guard Assertion 5 (ARCHIVE_PREV_BRANCH) lag als `skip` auf main (via PR
#4579) und verweist auf dieses Ticket.

## What

Das Finalize-Skript merkt vor der Archiv-Sektion den aktuellen Branch
(`ARCHIVE_PREV_BRANCH`, plus SHA für detached HEAD) und stellt ihn nach der
Sektion wieder her — auch auf Fehlerpfaden innerhalb der Sektion (EXIT-Trap in
der Subshell mit Ownership-Guard gegen parallele Wechsel). Die Sektion wechselt
per Order-Swap zuerst auf den Archiv-Branch (von origin/main) und committet die
Archivierung direkt dort — kein Streu-Commit, kein cherry-pick. Der BATS-Guard
Assertion 5 wird von `skip` auf eine echte Assertion zurückgestellt (Capture-
Signal plus Trap-Signal).

_Ticket: T006791_
