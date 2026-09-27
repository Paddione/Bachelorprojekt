# Neovim plugin and repository scouting

Use this runbook before a new repository-specific Neovim config, substantial rebuild, or dashboard design. It preserves the current repository investigation while requiring a fresh check of mutable facts.

## 1. Establish the target

- Identify the Neovim process that will run the config, its version, shell, executable, `stdpath('config')`, data path, and live startup file. The agent's shell does not prove where the editor runs.
- Identify the current buffer's Git root and worktree. Read the applicable `AGENTS.md`, root `CLAUDE.md`, and any nested instructions relevant to files or commands under consideration.
- On Windows/WSL, follow `.opencode/skills/bachelorprojekt-vim/references/windows-wsl.md`. Native Windows and WSL have separate Neovim installations, paths, shells, and tools.
- Before a full rewrite, copy the entire live config outside discovered config roots, compare the copy with the source, then review it for behavior worth migrating. Keep it until migration is accepted.

## 2. Read repository evidence

Begin with the authored sources that explain the repository:

- `AGENTS.md` for quick-start commands, repository layout, hazards, and agent routing.
- `CLAUDE.md` for comprehensive project practices; load only the sections relevant to this editor design.
- `docs/agent-guide/README.md` and `docs/brain/recall-routing.md` for agent/tool boundaries and code discovery routing.
- `docs/brain/k3-code-graph.md` for the K3 code-graph's purpose, available tools, freshness, and limitations. For known symbols/call chains, use K3 tools when available. Do not assume a graph result is current: the index may lag repository changes.
- `docs/diagrams/architecture.md` for the current service map. Check its generation/source notes and refresh status before relying on it; use it to orient zones, not as a command source.
- `docs/runbooks/`, `docs/agent-guide/`, `openspec/specs/`, and active `openspec/changes/` for canonical workflows. Use `task --list` and inspect the relevant Taskfile target before exposing a command in Neovim.
- `references/project-profile.md` for the retained language, package-manager, verification, and safe-integration findings.

Treat generated maps and graphs as navigation aids. Treat authored runbooks, task definitions, specs, and repository instructions as the authority for actions. Do not copy a command from a generated diagram into a button without checking its canonical source and side effects.

## 3. Build a small evidence inventory

Record a concise table before deciding the editor structure:

| Evidence | What to inspect | Design consequence |
|---|---|---|
| Languages and filetypes | representative paths; existing filetype/plugin config | syntax, indentation, navigation needs |
| Common workflows | task targets, runbooks, test docs, active specs | safe commands and structured inputs |
| Architecture | service map, K3, authored architecture docs | dashboard zones and cross-service navigation |
| Existing editor behavior | live config, plugin manager, mappings, commands | preserve or deliberately replace behavior |
| Runtime boundary | target Neovim version, shell, installed CLIs | API compatibility and command construction |

Repo profile findings to re-check: priority languages include Astro, Svelte, TypeScript/JavaScript, JSON/JSONC, YAML, Markdown, Bash, Lua, SQL, Dockerfiles, and Kubernetes manifests. Root and Brett use npm; `components/website/` uses pnpm only. Useful deliberate checks include `task test:changed`, `task freshness:check`, and `task workspace:validate`; website and Brett also have scoped checks documented in `references/project-profile.md`. Never infer a command or workflow is still current from this list alone.

## 4. Evaluate plugins against actual needs

For each candidate, write down:

- The user-visible capability and repository evidence that calls for it.
- Existing Neovim, shell, or repository tools that overlap.
- Compatibility with the target Neovim version and current plugin manager.
- Upstream maintenance and install/update path, checked from primary project documentation.
- Dependencies, startup/runtime cost, security/privacy effects, and removal path.

Prefer built-in Neovim features or an already installed tool when they meet the need. Do not install a candidate just because it is popular. Do not change the plugin manager or make a fresh config depend on an unreviewed network installer without making that tradeoff clear.

## 5. Shape the dashboard and actions

- Curate a few human-facing categories from the evidence; do not mirror every service, graph node, or directory.
- Map each category to its home page, selected plugin capability, useful actions, and canonical command/source.
- Make search return category names and actions. It should navigate to and focus the action; a separate intentional selection executes it.
- Define command inputs, working directory, expected output, and failure behavior. Resolve Git root from the current buffer and handle unnamed/out-of-repo buffers without falling back to another project.
- Keep actions manual and visible. Deployments, Git mutations, and production operations need their canonical guard or workflow and must never run on startup or save.

## 6. Keep findings durable

When this scouting changes a durable fact (a canonical command, runtime boundary, plugin-manager decision, or architecture mapping), update the appropriate authored runbook/profile or project config documentation in the same change. Include a source/date for time-sensitive plugin compatibility. Do not edit generated maps directly. On later runs, verify the source and revise stale findings instead of assuming this snapshot is current.
