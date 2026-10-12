---
title: p6 SDLC um Plan-Review erweitern
ticket_id: T901049
role: impl
---

# p6 — SDLC (T901049)

Ziel: Lese-Aktionen belegen, fehlende Plan-Review-Aktion ergaenzen,
Mutationsfreiheit belegen. Haengt an p1.

## File Structure

- `dotfiles/nvim/lua/chapters/sdlc.lua` (Ist 145, S1 n/a)
- `dotfiles/nvim/runbooks/sdlc.md` (S1 n/a)

## Task 1 — Bestand und Dispatcher belegen

```bash
grep -n "name = " dotfiles/nvim/lua/chapters/sdlc.lua
test -x ~/scripts/sdlc-tool.sh && echo "dispatcher ok"
grep -n -i "stage-plan\|release-hold\|update-status" dotfiles/nvim/lua/chapters/sdlc.lua; echo "mut-rc=$? (1 erwartet)"
```

Erwartung: ticket-show/search, claims-list, messages-read, plan-lint,
ci-gates, cfr-show; Dispatcher vorhanden; keine Mutation aus dem Editor.

## Task 2 — Plan-Review-Aktion ergaenzen

Die Checkliste verlangt Plan-Review rendern — keine Aktion ruft
`scripts/plan-review/plan-review.sh render` auf. Neue Aktion
`plan-review-render` mit Plan-Eingabe (lesend, oeffnet das gerenderte
Review), naechsten freien Taste zuordnen, Runbook-Schritt in
Aktionsreihenfolge ergaenzen. Danach:

```bash
nvim --headless -u dotfiles/nvim/init.lua \
  -c "lua print(table.concat(require('chapters.sdlc').actions(), ','))" -c "qa!" 2>&1 | tail -1
```

Erwartung: die neue Aktion erscheint in der Liste.

## Task 3 — Abschluss

- Commit: `feat(T901049): plan-review-aktion ergaenzt`.
