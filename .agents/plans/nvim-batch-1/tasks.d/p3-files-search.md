---
title: p3 Files und Search verifizieren
ticket_id: T901046
role: impl
---

# p3 — Files & Search (T901046)

Ziel: die fuenf Aktionen und den p2-Picker belegen. Haengt an p1
(Fundament) und p2 (Picker-Entscheid). Keine bekannten Luecken — reines
Verify-Partial mit Dokupflege bei Fund.

## File Structure

- `dotfiles/nvim/lua/chapters/files-search.lua` (Ist 125, S1 n/a)
- `dotfiles/nvim/runbooks/files-search.md` (S1 n/a)

## Task 1 — Aktionen und Picker belegen

```bash
grep -n "name = " dotfiles/nvim/lua/chapters/files-search.lua
grep -n "snacks.picker" dotfiles/nvim/lua/chapters/files-search.lua | head -3
grep -n "executable('fd')\|rg-files\|rg fallback" dotfiles/nvim/lua/chapters/files-search.lua dotfiles/nvim/runbooks/files-search.md
```

Erwartung: find-file, live-grep, buffers, recent-files, related-open;
alle ueber snacks.picker; fd-Probe mit dokumentiertem rg-Fallback.
`related-open` (repo-weite Suche ab Git-Root) deckt die Checklisten-Zeile
Worktree-weite Suche ab — im Runbook als solche benennen, falls der Name
fehlt.

## Task 2 — Runbook-Namen angleichen

Aktionsnamen und Runbook-Schritte muessen gleiche Namen und Reihenfolge
tragen (Epic-Vertrag). Abweichung im Runbook korrigieren, Code bleibt
unberuehrt. Danach:

```bash
grep -n "find-file\|live-grep\|buffers\|recent" dotfiles/nvim/runbooks/files-search.md | head -6
```

## Task 3 — Abschluss

- Commit: `feat(T901046): files-search verifiziert und runbook angeglichen`.
