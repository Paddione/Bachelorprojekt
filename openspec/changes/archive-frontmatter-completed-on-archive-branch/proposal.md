# Proposal: archive-frontmatter-completed-on-archive-branch

## Why

Der Plan-Frontmatter-Wechsel auf `status: completed` erreicht das Archiv nie: Schritt 7 von
`scripts/devflow-post-merge-finalize.sh` schreibt ihn in den Haupt-Checkout, Schritt 8
archiviert aber nach `git checkout -B "$ARCHIVE_BRANCH" origin/main` in einer Subshell —
dort hat die Datei noch `status: active`. Messung (T015916): 9 von 12 zuletzt archivierten
Plänen tragen `status: active`. Folgefehler: die uncommittete Änderung blockiert
`git pull --ff-only` im Haupt-Checkout.

## What

Frontmatter-Wechsel und `ticket.sh archive-plan` wandern in die Archiv-Sektion — nach dem
`checkout -B`, vor `openspec.sh archive` (Operator-Entscheidung 2026-08-24). DB-Kopie und
Archiv-Snapshot entstehen damit aus demselben Dateizustand; Skip-/Resume-Idempotenz bleibt.
DB-freies Unterkommando `--apply-completed-frontmatter` als Testseam (Präzedenz
`--archive-state`). Die 9 Altlasten werden separat über Chore-Ticket T015920 korrigiert.

_Ticket: T015916_
