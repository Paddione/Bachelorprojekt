# tmux Agent-Marker (Markieren statt Zoomen) [T901042]

Wartende Agent-Panes werden markiert, statt dass Hooks Fokus/Zoom stehlen.

| Baustein | Zweck |
|---|---|
| `scripts/hooks/agent-running.sh` / `scripts/hooks/agent-waiting.sh` | Hooks (via `.claude/settings.json`) setzen `@agent running\|waiting` pro Pane |
| `scripts/tmux/agent-status.conf` | Statuszeile (Zaehler wartender Panes), Rahmen-Markierung, `prefix+n` zoomt das aelteste wartende Pane |
| `scripts/agent-tmux-start.sh` | Starter: repo-lokaler Worktree + tmux-Fenster, gemeinsame DB, freier Port |

## Nutzung

```bash
tmux source-file scripts/tmux/agent-status.conf
bash scripts/agent-tmux-start.sh <name> [base-ref]
```

Hooks fokussieren nie; nur `prefix+n` selektiert/zoomt auf expliziten Tastendruck.
