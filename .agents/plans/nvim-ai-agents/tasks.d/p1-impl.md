## Task p1: AI und Agents chapter implementation

Context. Zweck dieses Partials: das Kapitel-Modul und die Dashboard-Seite bauen. This partial implements ticket T900662 (Neovim AI und Agents chapter) for plan `nvim-ai-agents`. It owns exactly one NEW module and wires the chapter page in the dashboard, touching no other file. Foundation (T900655) provides the dashboard shell, gitroot resolution, and the thirteen kept plugins. Verified live 2026-09-28: `nickjvandyke/opencode.nvim` is in `lua/plugins/core.lua` (lazy-lock commit `06770e2`); the installed plugin README documents `ask`/`select`/`prompt`/`operator`/`command`, context placeholders `@this`/`@buffer`/`@buffers`/`@diagnostics`/`@marks`/`@quickfix`/`@visible`, built-in prompts (`diagnostics`, `document`, `explain`, `fix`, `implement`, `optimize`, `review`, `test`), session commands (`session.new`, `session.select`, `session.compact`, `session.interrupt`, `session.undo`, `session.redo`, `session.share`), `:checkhealth opencode`, and server discovery via `opencode --port`; `opencode` CLI is v2.0.18; `muse skills list --source all` exits 0 with 79 lines including the header; target Neovim is v0.12.5 at `/usr/local/bin/nvim`. No new plugin enters the set. The old host config at `~/.config/nvim.old-20260927` is read-only reference only.

Target files:

- `dotfiles/nvim/lua/config/ai-agents.lua` (NEW module exposing the five chapter actions; .lua not S1-gated)
- `dotfiles/nvim/lua/config/dashboard.lua` (MODIFY: register the explicit ai-agents page; .lua not S1-gated, so no numeric budget applies — stated in words on purpose and no numeric budget is claimed)

### Steps

- [ ] Step 1 — Inventory overlap: confirm `opencode.nvim` (context selection, prompts, session commands), Snacks (dashboard/UI, picker), Telescope (pickers) and ToggleTerm (terminal sessions) already cover every checklist capability, so no new plugin is needed. Record the no-new-plugin finding as a code comment header in `ai-agents.lua`, naming the verified plugin APIs reused. Gate: `grep -c opencode.nvim dotfiles/nvim/lua/plugins/core.lua` prints 1 and the module header names the reused sources.
- [ ] Step 2 — Create `dotfiles/nvim/lua/config/ai-agents.lua` as a module returning `M` with five functions, each resolving `cwd` via `require('config.gitroot').root()` at execution time (never at render time) and returning early with a warning when root is nil:
  - `M.ask()` — guarded `require('opencode')`, then `ask('@this: ')` prompt input; warn when the plugin is absent.
  - `M.select()` — `opencode.select()` picker over prompts, commands and servers.
  - `M.send_context()` — `opencode.prompt('@buffer @diagnostics ')` (trailing space appends); documents the verified context-selection placeholders in a comment.
  - `M.list_skills()` — run `vim.system({'muse', 'skills', 'list', '--source', 'all'}, { cwd = cwd, text = true })` and show stdout in a read-only scratch buffer; warn when the `muse` CLI is missing.
  - `M.session_new()` — `opencode.command('session.new')` to start a new OpenCode session.
  Use argv lists only (no shell string building); quote paths with `fnameescape()` for Ex commands. Handle nested files, linked worktrees, and space-containing paths via gitroot. Gate: headless `nvim -l` probe requiring the staged module asserts all five functions exist.
- [ ] Step 3 — Modify `dotfiles/nvim/lua/config/dashboard.lua`: rebase onto the latest `origin/main` first, then insert an explicit `['ai-agents']` page entry (title `AI & Agents`) whose rows are `action()` records in this exact order and naming: `ask`, `select`, `send-context`, `list-skills`, `session-new` (keys `a`, `s`, `c`, `k`, `n`). Anchor: insert after the `['files-search']` entry and before the pages-table close that precedes the auto-stub loop; mark the block with a `T900662 ai-agents` comment and keep every other chapter block byte-identical. Each action's `effect` calls the matching `ai-agents.lua` function with the execution-time cwd. Keep the CHAPTERS order, the `0`/`<BS>` navigation rows, the quit row, and the action-model shape (name, inputs, effect, cwd, on_error). No other page changes. No OpenSpec integration anywhere on the page.
- [ ] Step 4 — Prove headless behavior without network: stage the repo config to a temp dir; run a Lua probe with `package.path` at staged `lua/` requiring `config.ai-agents` and asserting all five functions exist; run headless `nvim --headless -u "$STAGE/init.lua" -i NONE` probes asserting the dashboard `ai-agents` page lists the five action names in order and that invoking focus creates no side-effect marker while the explicit execute step resolves gitroot (nested file, worktree-linked file, and space-containing directory cases). Gate: every probe exits 0.
- [ ] Step 5 — Stage exactly the two touched paths and commit (dotfiles/ is gitignored, force-add per repo convention):
  ```bash
  git add -f dotfiles/nvim/lua/config/ai-agents.lua dotfiles/nvim/lua/config/dashboard.lua
  git commit -m "feat(T900662): ai agents chapter with opencode actions [T900662]"
  ```

### Acceptance criteria

- [ ] `ai-agents.lua` exists with the five functions, execution-time gitroot resolution, argv-only process calls, escaped paths, and a header recording the no-new-plugin inventory.
- [ ] The dashboard `ai-agents` page lists exactly `ask`, `select`, `send-context`, `list-skills`, `session-new` in order; CHAPTERS order and navigation unchanged; no other page altered; no OpenSpec reference on the page.
- [ ] Headless probes pass for module shape, page order, focus-before-execute separation, and nested/worktree/space-path resolution.
- [ ] Commit uses the exact subject above with explicit pathspecs and touches no other file.
