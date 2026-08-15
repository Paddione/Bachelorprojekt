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

Beleg: `git show origin/main:scripts/devflow-post-merge-finalize.sh | grep -c
ARCHIVE_PREV_BRANCH` → 0. Der BATS-Guard Assertion 5 (ARCHIVE_PREV_BRANCH) liegt
als `skip` auf main (via PR #4579) und verweist auf dieses Ticket.

## What

Das Finalize-Skript merkt vor der Archiv-Sektion den aktuellen Branch
(`ARCHIVE_PREV_BRANCH`) und stellt ihn nach der Sektion wieder her — auch auf
Fehlerpfaden innerhalb der Sektion (Trap in der Subshell). Der BATS-Guard
Assertion 5 wird von `skip` auf eine echte Assertion zurückgestellt.

_Ticket: T006791_
