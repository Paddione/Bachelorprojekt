# Proposal: mishap-t002137

## Why

Übergangs-Gotcha nach T002135 (bats-Support-Libs von Git-Submodulen auf vendorte
Dateien umgestellt, PR #3167): Worktrees, die **vor** diesem Merge angelegt wurden,
verweigern `git worktree remove` mit `"working trees containing submodules cannot
be moved or removed"` — obwohl der aktuelle Index keine Submodule mehr referenziert.
Ursache sind verwaiste per-Worktree-Submodul-Gitdirs unter
`.git/worktrees/<name>/modules/`, die von der alten Submodul-Ära übrig geblieben
sind. Ohne dokumentierten Workaround greifen Entwickler und Agenten reflexhaft zu
`--force`, was das eigentliche Problem verschleiert statt es zu erklären.

## What

Reiner Doku-Fix (kein Verhaltensänderungscode):

- `docs/superpowers/references/gotchas-footguns.md`: neuer Unterabschnitt
  „Alt-Worktrees nach T002135 — Submodul-Gitdir-Reste" mit Hintergrund (2 Sätze)
  und dem sauberen Cleanup-Befehl (`rm -rf .git/worktrees/<name>/modules` gefolgt
  von `git worktree remove` ohne `--force`), plus Eintrag im Section Index.
- `CLAUDE.md`: neue Zeile in der „Covered sub-topics"-Liste unter
  „Gotchas & Footguns", die auf den neuen Abschnitt verweist (bestehendes
  Listenmuster).
- `tests/spec/dev-flow-plan.bats`: neuer `@test`, der per `grep` prüft, dass der
  neue Abschnittstitel und das Pfadmuster `.git/worktrees/<name>/modules` in
  `gotchas-footguns.md` vorkommen (RED vor dem Fix, GREEN danach).

_Ticket: T002137_
