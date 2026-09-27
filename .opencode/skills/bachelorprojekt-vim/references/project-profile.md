# Bachelorprojekt Neovim profile

## Repository roots and workflow

- Known Linux checkout: `/home/patrick/Bachelorprojekt`; detect the active checkout/worktree on the editor's host rather than hardcoding this path.
- Primary instructions: `AGENTS.md`; deeper reference: `CLAUDE.md`
- Change verification: `task test:changed`, `task freshness:check`, `task workspace:validate`
- Task discovery: `task --list`
- OpenSpec work: `openspec/changes/` and `openspec/specs/`
- Branches use `feature/*`, `fix/*`, `chore/*`, or `docs/*`; feature and fix work normally uses worktrees.

## Languages and filetypes

Prioritize syntax, indentation, search, and navigation for Astro, Svelte, TypeScript/JavaScript, JSON/JSONC, YAML, Markdown, Bash, Lua, SQL, Dockerfiles, and Kubernetes manifests.

Do not assume JSONC is strict JSON. Do not introduce automatic whitespace cleanup or formatting because generated files and fixtures may depend on exact content.

## Package-manager boundaries

- Root: npm (`package-lock.json`)
- `components/website/`: pnpm (`pnpm-lock.yaml`); never run `npm install` there
- `components/brett/`: npm (`components/brett/package-lock.json`)

Useful scoped checks:

- Website unit tests: `(cd components/website && pnpm test:unit)`
- Brett: `npm run typecheck --prefix components/brett`, `npm test --prefix components/brett`, and `npm run build --prefix components/brett`

## Safe editor integrations

Good defaults include `rg`-backed grep, quickfix navigation, buffer-local Git-root detection, commands for the three local verification gates, and shortcuts to `AGENTS.md`, active OpenSpec changes, and task discovery.

Keep deploy operations visible and manual. `task workspace:deploy` is a break-glass fallback, not a routine editor shortcut.
