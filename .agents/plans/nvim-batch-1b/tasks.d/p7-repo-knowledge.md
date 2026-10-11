---
title: p7 Repo-Knowledge auf echtes CLI umstellen
ticket_id: T901050
role: impl
---

# p7 — Repository & Code Knowledge (T901050)

Ziel: Graph-Aktionen auf das reale `codebase-memory-mcp cli` umstellen,
Semantik-Gating und Brain-Pfad belegen. Haengt an p1. Home-Branch:
feat/nvim-repo-knowledge-T901050.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/repo-knowledge.lua` (Ist 149, S1 n/a)
- `~/dotfiles/nvim/runbooks/repo-knowledge.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-repo-knowledge-T901050"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-repo-knowledge-T901050
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach dem p1-Home-Merge. Alle Befehle mit
HOME_WT laufen im Home-Worktree; Befehle ohne HOME_WT laufen im
Bachelor-Worktree dieses Plan-Branches.

## Task 1 — CLI-Form live belegen

Der Modulkommentar behauptet, es gebe kein Shell-CLI. Das stimmt nicht
mehr (v0.11.0). Verifizieren (Bachelor-Worktree):

```bash
codebase-memory-mcp cli search_graph '{"name_pattern":"M.show"}' 2>&1 | head -5
ls docs/brain/k3-code-graph.md
```

Erwartung: der CLI-Aufruf mit Positionsargument liefert Treffer, der
Brain-Pfad existiert.

## Task 2 — Anzeige durch echte Aufrufe ersetzen

`show_mcp_form` durch echte CLI-Aufrufe ersetzen: symbol-search ruft
`cli search_graph`, call-graph `cli trace_path`, architecture-layers
`cli get_architecture`, code-snippet `cli get_code_snippet` — jeweils mit
Positionsargument als JSON-String, Ausgabe im Terminal (snacks.terminal,
Muster der Nachbarkapitel). Unerreichbare Bridge meldet sich klar statt
still zu bleiben. Kommentar-Korrektur: die alte Kein-CLI-Behauptung
entfernen. Semantik-Gating (`backend_available`) bleibt unveraendert.

## Task 3 — Runbook angleichen

Aufrufform, Bridge/Webview-URLs und Referenzpfad im Runbook auf den
neuen Stand bringen; Namen und Reihenfolge mit den Aktionen abgleichen.

## Task 4 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-repo-knowledge-T901050"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/repo-knowledge.lua dotfiles/nvim/runbooks/repo-knowledge.md
git -C "$HOME_WT" commit -m "feat(T901050): echte cli-aufrufe statt hinweistext"
git -C "$HOME_WT" push -u origin feat/nvim-repo-knowledge-T901050
(cd "$HOME_WT" && gh pr create --title "feat(T901050): echte cli-aufrufe statt hinweistext" --body "Batch-1b p7. Haengt am p1-Home-Merge.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
