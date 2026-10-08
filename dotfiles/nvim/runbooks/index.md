# Runbook Master-Index (T901043 p1)

Jede Dashboard-Seite hat genau ein Runbook. Aktionsnamen und
Runbook-Schritte tragen gleiche Namen und Reihenfolge (Vertrag; p9 prueft
maschinell: `actions:`-Liste gegen `core.dashboard.action_rows()`).

| Seite | Seite-ID | Runbook | Ticket | Status |
|---|---|---|---|---|
| Editor | `editor` | [editor.md](editor.md) | T901045 | complete |
| Files & Search | `files-search` | [files-search.md](files-search.md) | T901046 | complete |
| JavaScript / Frontend | `js-frontend` | [js-frontend.md](js-frontend.md) | T901047 | complete |
| GitHub | `github` | [github.md](github.md) | T901048 | complete |
| SDLC | `sdlc` | [sdlc.md](sdlc.md) | T901049 | complete |
| Repository & Code Knowledge | `repo-knowledge` | [repo-knowledge.md](repo-knowledge.md) | T901050 | complete |
| AI & Agents | `ai-agents` | [ai-agents.md](ai-agents.md) | T901051 | complete |
| Models & Inference | `models-inference` | [models-inference.md](models-inference.md) | T901052 | complete |
| ComfyUI & Images | `comfyui-images` | [comfyui-images.md](comfyui-images.md) | T901053 | complete |
| ML & Training | `ml-training` | [ml-training.md](ml-training.md) | T901056 | complete |
| Infrastructure | `infrastructure` | [infrastructure.md](infrastructure.md) | T901054 | complete |
| MCP Servers | `mcp-servers` | [mcp-servers.md](mcp-servers.md) | T901057 | complete |
| User Services | `user-services` | [user-services.md](user-services.md) | T901058 | complete |
| Tests & Plans | `tests-plans` | [tests-plans.md](tests-plans.md) | T901044 | complete |
| Settings & Help | `settings-help` | [settings-help.md](settings-help.md) | T901058 | complete |

Home-Seite: [home.md](home.md). Vorlage fuer neue Seiten: [_template.md](_template.md).
Drift-Check (Repo gegen live): `diff -rq -x lazy-lock.json dotfiles/nvim ~/.config/nvim`.
