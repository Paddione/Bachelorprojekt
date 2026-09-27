## Task p1: Files & Search chapter implementation

Context. This partial implements ticket T900657 (Neovim Files & Search chapter) for change `nvim-files-search`. It owns exactly one NEW module and wires the chapter page in the dashboard, touching no other file. Foundation (T900655) provides the dashboard shell, gitroot resolution, and the thirteen kept plugins; editor capabilities (T900656) are merged. Telescope (`nvim-telescope/telescope.nvim`, cmd `Telescope`) and Snacks are already installed — no new plugin enters the set. The old host config at `~/.config/nvim.old-20260927` is read-only reference only.

Target files:

- `dotfiles/nvim/lua/config/files-search.lua` (NEW module exposing search actions; .lua not S1-gated)
- `dotfiles/nvim/lua/config/dashboard.lua` (MODIFY: replace the files-search stub page with the real chapter page; .lua not S1-gated, so no numeric budget applies — stated in words on purpose and no numeric budget is claimed)

### Steps

1. Inventory overlap: confirm Telescope provides `find_files`, `live_grep`, `buffers`, `oldfiles` and Snacks provides only dashboard/UI here. Record the no-new-plugin finding as a code comment header in `files-search.lua`.
2. Create `dotfiles/nvim/lua/config/files-search.lua` as a module returning `M` with five functions, each resolving `cwd` via `require('config.gitroot').root()` at execution time (never at render time) and returning early with a warning when root is nil:
   - `M.find_file()` — Telescope `find_files` rooted at cwd (hidden files shown, `.git/` respected via ripgrep defaults).
   - `M.live_grep()` — Telescope `live_grep` rooted at cwd with results sendable to the quickfix list (`<C-q>` mapping preserved plus an explicit `M.send_to_quickfix()` helper).
   - `M.buffers()` — Telescope `buffers` filtered to the current cwd where possible.
   - `M.recent()` — Telescope `oldfiles` filtered to paths under cwd.
   - `M.related()` — open the file related to the current buffer: source to test and back, config to docs, derived live from repo layout rules recorded in the module header (Astro/Svelte components, `tests/spec/*.bats`, `docs/`); notify when no relation matches.
   Quote all paths with `fnameescape()` for Ex commands and `shellescape()` for shell arguments; handle nested files, linked worktrees, and space-containing paths.
3. Modify `dotfiles/nvim/lua/config/dashboard.lua`: replace the auto-generated files-search stub with an explicit `['files-search']` page entry (title `Files & Search`) whose rows are `action()` records in this exact order and naming: `find-file`, `live-grep`, `buffers`, `recent-files`, `related-open`. Each action's `effect` calls the matching `files-search.lua` function with the execution-time cwd. Keep the CHAPTERS order, the `0`/`<BS>` navigation rows, the quit row, and the action-model shape (name, inputs, effect, cwd, on_error). No other page changes.
4. Prove headless behavior without network: stage the repo config to a temp dir; run a Lua probe with `package.path` at staged `lua/` requiring `config.files-search` and asserting all five functions exist; run headless `nvim --headless -u "$STAGE/init.lua" -i NONE` probes asserting the dashboard `files-search` page lists the five action names in order and that invoking focus creates no side-effect marker while explicit execute against a scratch git repo resolves the scratch top level (nested file, worktree-style symlink, and space-containing directory cases).
5. Stage exactly the two touched paths and commit:
   ```bash
   git add dotfiles/nvim/lua/config/files-search.lua dotfiles/nvim/lua/config/dashboard.lua
   git commit -m "feat(T900657): files search chapter with gitroot pickers [T900657]"
   ```

### Acceptance criteria

- `files-search.lua` exists with the five functions, execution-time gitroot resolution, quickfix helper, related-file rules, and escaped paths.
- The dashboard `files-search` page lists exactly `find-file`, `live-grep`, `buffers`, `recent-files`, `related-open` in order; CHAPTERS order and navigation unchanged; no other page altered.
- Headless probes pass for module shape, page order, focus-before-execute separation, and nested/worktree/space-path resolution.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
