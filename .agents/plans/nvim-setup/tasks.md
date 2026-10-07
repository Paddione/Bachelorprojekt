---
title: nvim-setup implementation plan
ticket_id: T901043
domains: [developer-experience, neovim]
status: plan_staged
---

# nvim-setup — Implementation Plan

Neuaufbau der projektbewussten Neovim-Konfiguration (EPIC T901043, Kinder
T901044–T901058). SSOT `dotfiles/nvim`; Fundament (p1) zuerst, Kapitel danach;
p3 nach p2 (Picker-Entscheid). 15 Kinder sind auf 9 Partials gruppiert
(`stage-plan`-Cap 1..9); Mapping siehe unten. Design: `design.md`, Verlauf:
`proposal.md`, Fakten: `intel.json`.

## File Structure

### New files

- `dotfiles/nvim/lua/core/lazy.lua`
- `dotfiles/nvim/lua/core/options.lua`
- `dotfiles/nvim/lua/core/keymaps.lua`
- `dotfiles/nvim/lua/core/gitroot.lua`
- `dotfiles/nvim/lua/core/actions.lua`
- `dotfiles/nvim/lua/core/dashboard.lua`
- `dotfiles/nvim/lua/chapters/editor.lua`
- `dotfiles/nvim/lua/chapters/files-search.lua`
- `dotfiles/nvim/lua/chapters/js-frontend.lua`
- `dotfiles/nvim/lua/chapters/github.lua`
- `dotfiles/nvim/lua/chapters/sdlc.lua`
- `dotfiles/nvim/lua/chapters/repo-knowledge.lua`
- `dotfiles/nvim/lua/chapters/ai-agents.lua`
- `dotfiles/nvim/lua/chapters/models-inference.lua`
- `dotfiles/nvim/lua/chapters/comfyui-images.lua`
- `dotfiles/nvim/lua/chapters/infrastructure.lua`
- `dotfiles/nvim/lua/chapters/ml-training.lua`
- `dotfiles/nvim/lua/chapters/mcp-servers.lua`
- `dotfiles/nvim/lua/chapters/settings-help.lua`
- `dotfiles/nvim/lua/chapters/user-services.lua`
- `dotfiles/nvim/runbooks/index.md`
- `dotfiles/nvim/runbooks/ml-training.md`
- `dotfiles/nvim/runbooks/mcp-servers.md`
- `dotfiles/nvim/runbooks/user-services.md`

### Changed files

- `dotfiles/nvim/init.lua` (rewrite, slim)
- `dotfiles/nvim/lua/plugins/core.lua` (rewrite, Doppel bereinigt)
- `dotfiles/nvim/lua/plugins/editor.lua` (rewrite, Doppel bereinigt)
- `dotfiles/nvim/windows/init.lua` (adaptiert)
- `dotfiles/nvim/README.md` (rewrite)
- `dotfiles/nvim/SETUP_CHECKLIST.md` (rewrite)
- `dotfiles/nvim/runbooks/home.md` (rewrite)
- `dotfiles/nvim/runbooks/_template.md` (rewrite)
- `dotfiles/nvim/runbooks/editor.md` (rewrite)
- `dotfiles/nvim/runbooks/files-search.md` (rewrite)
- `dotfiles/nvim/runbooks/js-frontend.md` (rewrite)
- `dotfiles/nvim/runbooks/github.md` (rewrite)
- `dotfiles/nvim/runbooks/sdlc.md` (rewrite)
- `dotfiles/nvim/runbooks/repo-knowledge.md` (rewrite)
- `dotfiles/nvim/runbooks/ai-agents.md` (rewrite)
- `dotfiles/nvim/runbooks/models-inference.md` (rewrite)
- `dotfiles/nvim/runbooks/comfyui-images.md` (rewrite)
- `dotfiles/nvim/runbooks/infrastructure.md` (rewrite)
- `dotfiles/nvim/runbooks/settings-help.md` (rewrite)
- `tests/spec/neovim-dashboard.bats` (auf neue Struktur umgestellt)
- `components/website/src/data/test-inventory.json` (regeneriert)

### Deleted files

- `dotfiles/nvim/lua/config/dashboard.lua`
- `dotfiles/nvim/lua/config/gitroot.lua`
- `dotfiles/nvim/lua/config/editor.lua`
- `dotfiles/nvim/lua/config/editor-capabilities.lua`
- `dotfiles/nvim/lua/config/files-search.lua`
- `dotfiles/nvim/lua/config/js-frontend.lua`
- `dotfiles/nvim/lua/config/github.lua`
- `dotfiles/nvim/lua/config/sdlc.lua`
- `dotfiles/nvim/lua/config/repo-knowledge.lua`
- `dotfiles/nvim/lua/config/ai-agents.lua`
- `dotfiles/nvim/lua/config/models-inference.lua`
- `dotfiles/nvim/lua/config/comfyui-images.lua`
- `dotfiles/nvim/lua/config/infrastructure.lua`
- `dotfiles/nvim/lua/config/nodectl.lua`
- `dotfiles/nvim/lua/plugins/nodectl.lua`
- `dotfiles/nvim/runbooks/README.md` (geht in index.md auf)
- `dotfiles/nvim/runbooks/infrastructure-status.md` (geht in infrastructure.md auf)

### S1 pre-flight (wirksame Schwellen)

`.lua`/`.md`/`.bats` sind ungated (kein Limit, keine Baseline) — kein
Budget-Druck, neue Dateien trotzdem schlank schneiden. `.bats` steht zudem
unter `s1.ignore`. Einzige gated Datei:

| `dotfiles/install.sh` | 169 | 631 |

## Partials

| id | plan | role | target_files | depends_on |
|----|-----------------|-----|--------------|--------------|
| p1 | tasks.d/p1-fundament.md | impl | dotfiles/nvim/init.lua, dotfiles/nvim/lua/core/lazy.lua, dotfiles/nvim/lua/core/options.lua, dotfiles/nvim/lua/core/keymaps.lua, dotfiles/nvim/lua/core/gitroot.lua, dotfiles/nvim/lua/core/actions.lua, dotfiles/nvim/lua/core/dashboard.lua, dotfiles/nvim/runbooks/index.md, dotfiles/nvim/runbooks/home.md, dotfiles/nvim/runbooks/_template.md, dotfiles/nvim/runbooks/README.md, dotfiles/nvim/README.md, dotfiles/nvim/SETUP_CHECKLIST.md, dotfiles/nvim/windows/init.lua, dotfiles/install.sh, dotfiles/nvim/lua/config/dashboard.lua, dotfiles/nvim/lua/config/gitroot.lua, dotfiles/nvim/lua/config/editor.lua, dotfiles/nvim/lua/plugins/nodectl.lua |  |
| p2 | tasks.d/p2-editor.md | impl | dotfiles/nvim/lua/chapters/editor.lua, dotfiles/nvim/lua/plugins/core.lua, dotfiles/nvim/lua/plugins/editor.lua, dotfiles/nvim/runbooks/editor.md, dotfiles/nvim/lua/config/editor-capabilities.lua | p1 |
| p3 | tasks.d/p3-files-search.md | impl | dotfiles/nvim/lua/chapters/files-search.lua, dotfiles/nvim/runbooks/files-search.md, dotfiles/nvim/lua/config/files-search.lua | p2 |
| p4 | tasks.d/p4-js-frontend.md | impl | dotfiles/nvim/lua/chapters/js-frontend.lua, dotfiles/nvim/runbooks/js-frontend.md, dotfiles/nvim/lua/config/js-frontend.lua | p1 |
| p5 | tasks.d/p5-github-sdlc.md | impl | dotfiles/nvim/lua/chapters/github.lua, dotfiles/nvim/lua/chapters/sdlc.lua, dotfiles/nvim/runbooks/github.md, dotfiles/nvim/runbooks/sdlc.md, dotfiles/nvim/lua/config/github.lua, dotfiles/nvim/lua/config/sdlc.lua | p1 |
| p6 | tasks.d/p6-knowledge-agents.md | impl | dotfiles/nvim/lua/chapters/repo-knowledge.lua, dotfiles/nvim/lua/chapters/ai-agents.lua, dotfiles/nvim/runbooks/repo-knowledge.md, dotfiles/nvim/runbooks/ai-agents.md, dotfiles/nvim/lua/config/repo-knowledge.lua, dotfiles/nvim/lua/config/ai-agents.lua | p1 |
| p7 | tasks.d/p7-models-comfyui.md | impl | dotfiles/nvim/lua/chapters/models-inference.lua, dotfiles/nvim/lua/chapters/comfyui-images.lua, dotfiles/nvim/runbooks/models-inference.md, dotfiles/nvim/runbooks/comfyui-images.md, dotfiles/nvim/lua/config/models-inference.lua, dotfiles/nvim/lua/config/comfyui-images.lua | p1 |
| p8 | tasks.d/p8-infra-ml-mcp-settings.md | impl | dotfiles/nvim/lua/chapters/infrastructure.lua, dotfiles/nvim/lua/chapters/ml-training.lua, dotfiles/nvim/lua/chapters/mcp-servers.lua, dotfiles/nvim/lua/chapters/settings-help.lua, dotfiles/nvim/lua/chapters/user-services.lua, dotfiles/nvim/runbooks/infrastructure.md, dotfiles/nvim/runbooks/infrastructure-status.md, dotfiles/nvim/runbooks/ml-training.md, dotfiles/nvim/runbooks/mcp-servers.md, dotfiles/nvim/runbooks/settings-help.md, dotfiles/nvim/runbooks/user-services.md, dotfiles/nvim/lua/config/infrastructure.lua, dotfiles/nvim/lua/config/nodectl.lua | p1 |
| p9 | tasks.d/p9-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1, p2, p3, p4, p5, p6, p7, p8 |

## Ticket-Mapping (Kind -> Partial)

| Ticket | Partial | Anker im Partial |
|--------|---------|------------------|
| T901044 Fundament | p1 + p9-Testanteil | Akzeptanz-Liste p1; BATS-Umbau p9 |
| T901045 Editor | p2 | Checkliste in Akzeptanz p2 |
| T901046 Files & Search | p3 | Checkliste in Akzeptanz p3 |
| T901047 JS/Frontend | p4 | Checkliste in Akzeptanz p4 |
| T901048 GitHub | p5 Task 1 | Checkliste in Akzeptanz p5 |
| T901049 SDLC | p5 Task 2 | Checkliste in Akzeptanz p5 |
| T901050 Repo-Knowledge | p6 Task 1 | Checkliste in Akzeptanz p6 |
| T901051 AI & Agents | p6 Task 2 | Checkliste in Akzeptanz p6 |
| T901052 Models | p7 Task 1 | Checkliste in Akzeptanz p7 |
| T901053 ComfyUI | p7 Task 2 | Checkliste in Akzeptanz p7 |
| T901054 Infrastructure | p8 Task 1 | Checkliste in Akzeptanz p8 |
| T901056 ML/Training | p8 Task 2 | Checkliste in Akzeptanz p8 |
| T901057 MCP-Server | p8 Task 2 | Checkliste in Akzeptanz p8 |
| T901058 Settings/User-Services | p8 Task 2 | Checkliste in Akzeptanz p8 |

Ausfuehrungsreihenfolge: p1, dann p2 vor p3, Rest nach `depends_on`;
p9 zuletzt. Implementierungs-Commits als `feat(T901043):`, Plan-Commits als
`chore(plans):`.

## Verify

Finaler Verifikations-Task (p9 Task 2):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
