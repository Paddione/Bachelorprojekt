# Proposal: fix-devflow-post-merge-finalize-worktree-path

## Why

Bug-Fix T008014 — zwei post-Merge entdeckte Bugs in
`scripts/devflow-post-merge-finalize.sh` (Beobachtung beim Finalizer-Lauf für
T007559/PR #4663, 2026-08-15), beide erzeugen falsche Skips und lassen Cleanup
liegen:

1. **Worktree-Pfad-Ableitung:** `WORKTREE="$REPO_DIR/.worktrees/$SLUG"`
   konkateniert den Slug ohne `-T<id>`-Suffix. Reale Worktrees heißen
   `<slug>-T<id>` (z. B. `.worktrees/sdlc-leitstand-e1-e2-T007559`). Dadurch
   überspringen die Schritte 8+10 fälschlich als "bereits archiviert/entfernt".
   Der Lauf wurde damals per Workaround kompensiert (`git worktree move`).
2. **cat-file mit absolutem Pfad:** `PLAN_FILE` wird absolutiert, der Skip-Check
   nutzt aber `git cat-file -e "$BRANCH:$PLAN_FILE"` — `rev:path` verlangt einen
   relativen Pfad, der Check schlägt immer fehl und meldet fälschlich
   "vermutlich bereits persistiert", obwohl nichts persistiert war.

## What

1. **Worktree-Auflösung per `git worktree list --porcelain`** mit Branch-exakter
   Zuordnung (`refs/heads/$BRANCH`, Zeilen-Gleichheit) — deckt `<slug>-T<id>`
   und `<branch-ohne-Typ-Praefix>-T<id>` ab (beide Konventionen existieren im
   Repo; der Slug kann einen Typ-Präfix tragen, den das Worktree-Dir nicht
   hat), Fallback auf die Slug-Konkatenation für Worktrees ohne Suffix.
2. **Relativer Plan-Pfad im cat-file-Check:** `${PLAN_FILE#"$REPO_DIR"/}` statt
   des absoluten Pfads.
3. **Delta-Spec** `openspec/specs/agent-skills.md` (MODIFIED, Requirement
   "Post-Merge-Finalisierung als idempotente Skript-Einheit") + Guard-Tests in
   `tests/spec/agent-skills/post-merge-finalize-guards.bats` (dokumentierte
   Source-Grep-Ausnahme, Laufzeitpfad braucht Ticket-DB).

_Ticket: T008014_
