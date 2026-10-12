---
title: p8 AI-Agents Auswahlkontext umsetzen
ticket_id: T901051
role: impl
---

# p8 — AI & Agents (T901051)

Ziel: Laufzeit-Probe und Dateikontext belegen, Auswahlkontext echt
umsetzen, opencode-Begruendung belegen. Haengt an p1.

## File Structure

- `dotfiles/nvim/lua/chapters/ai-agents.lua` (Ist 104, S1 n/a)
- `dotfiles/nvim/runbooks/ai-agents.md` (S1 n/a)

## Task 1 — Probe und Dateikontext belegen

```bash
for c in opencode muse claude codex qwen pi agy; do command -v $c >/dev/null && echo "$c ok"; done
grep -n "opencode.nvim" dotfiles/nvim/runbooks/ai-agents.md | head -3
```

Erwartung: vorhandene CLIs erscheinen, fehlende nicht; das Runbook
begruendet opencode.nvim (snacks-kompatibel, kein zweites Plugin).

## Task 2 — Auswahlkontext umsetzen

`selection-context` meldet heute nur einen Hinweis. Umsetzen: visuelle
Auswahl in eine temporaere Datei ausserhalb des Repos schreiben, Agent
mit dieser Datei als Kontext im Git-Root starten, Pfad im Runbook
dokumentieren. Keine Zwischenablage-Tricks, keine Seiteneffekte beim
Bauen der Seite. Danach:

```bash
nvim --headless -u dotfiles/nvim/init.lua \
  -c "lua print(table.concat(require('chapters.ai-agents').agents(), ','))" -c "qa!" 2>&1 | tail -1
```

## Task 3 — Abschluss

- Commit: `feat(T901051): auswahlkontext umgesetzt`.
