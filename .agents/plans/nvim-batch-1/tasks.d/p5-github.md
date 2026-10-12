---
title: p5 GitHub verifizieren
ticket_id: T901048
role: impl
---

# p5 — GitHub (T901048)

Ziel: Merge-Freiheit und die fuenf Anzeige-Aktionen belegen, gh-axi/gh-Trennung belegen. Haengt an p1.
Keine bekannten Luecken.

## File Structure

- `dotfiles/nvim/lua/chapters/github.lua` (Ist 81, S1 n/a)
- `dotfiles/nvim/runbooks/github.md` (S1 n/a)

## Task 1 — Keine Merge-Aktion, fuenf Aktionen

```bash
grep -n -i "merge" dotfiles/nvim/lua/chapters/github.lua; echo "merge-rc=$? (1 erwartet)"
grep -n "name = " dotfiles/nvim/lua/chapters/github.lua
grep -n "gh-axi\|'gh'" dotfiles/nvim/lua/chapters/github.lua
```

Erwartung: kein Merge-Treffer (rc 1), genau pr-view, pr-comments,
pr-checks, failure-logs, release-view; Anzeige via gh-axi, --json/-q via
gh direkt (T004612-Trennung).

## Task 2 — Runbook-Vertrag

Namen und Reihenfolge im Runbook mit den Aktionen abgleichen, bei
Abweichung das Runbook korrigieren.

## Task 3 — Abschluss

- Commit: `feat(T901048): github verifiziert ohne merge-aktion`.
