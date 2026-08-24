# Proposal: half-archive-worktree-guard

## Why

Rest-Scope des „Beides"-Beschlusses aus der T015783-Klärungsrunde: Der Post-Merge-Archivpfad
verifiziert inzwischen seinen eigenen Abschluss (geship via
`fix/finalize-archive-self-verify-T015783`), aber `openspec-half-archive-check` prüft weiterhin
nur origin/main und bleibt blind für halb archivierte Changes in `.worktrees/`. Genau diese blinde
Stelle trug den Incident von T015783: Der halbe Zustand lag ausschließlich im Worktree
`.worktrees/db-identity-guard-T015168`, der Startup-Guard meldete grün — ohne den Hygiene-Lauf
wäre die Archivierung mit dem nächsten Worktree-Cleanup verloren gegangen
(Deliverable-Drift-Klasse M10/T002506).

## What

Erweiterung von `scripts/openspec-half-archive-check.sh` (120 Zeilen, rein strukturell) um eine
Worktree-Sicht:

1. Alle registrierten Worktrees via `git worktree list --porcelain` sammeln (Haupt-Checkout
   ausschließen).
2. Pro Worktree `git status --porcelain` auf die Befundsignatur prüfen:
   - ` D`/`D ` unter `openspec/changes/<slug>/` (Quelle weg, nicht committet), oder
   - `??`/`A ` unter `openspec/changes/archive/` mit `<date>-<slug>`-Muster,
   während derselbe Slug auf `origin/main` noch regulär unter `changes/` liegt.
3. Befund = Warnung (`WORKTREE-HALB-ARCHIV: <slug> in <worktree>`) plus Heal-Hinweis; Exit-Code
   bleibt standardmäßig 0 (Parallelsessions haben legitim Archiv-Arbeit in Flight — ein
   fail-closed hier würde fremde Commits blockieren). Nur
   `OPENSPEC_HALF_ARCHIVE_WT_STRICT=1` failt.

Keine Änderung an den bestehenden Haupt-Checkout-Befundklassen (Doppelung, fehlender
Datums-Praefix bleiben fail-closed).

_Ticket: T015875_
