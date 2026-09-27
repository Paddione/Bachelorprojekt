## Task 1: Foundation bootstrap and core plugins

Context. This partial implements the foundation rows of `design.md` section 5 for change `nvim-dashboard-foundation` (ticket T900655). It owns exactly three new files, creates no other file, and depends on no other partial. Verified environment facts: the target Neovim is v0.12.5 at `/usr/local/bin/nvim`, and the repo BATS runner at `tests/unit/lib/bats-core/bin/bats` reports Bats 1.13.0. The plan-intel filter reports all three target paths as new with zero existing lines and no S1 entries. Lua files are not covered by the S1 line-limit gate, so no line arithmetic applies to this partial; the size note below is scope guidance only. The old host config at `~/.config/nvim.old-20260927` is read-only reference. Verified reference facts reused here: the lazy.nvim stable bootstrap pattern (old `init.lua` lines 1-30), the thirteen plugin repository slugs from the old lazy specs, the thirteen plugin names from the old `lazy-lock.json`, and the editing defaults from the old `lua/config/editor.lua`. The `:Lazy load` command and `require("lazy").plugins()` used in the smoke steps were verified against the installed lazy.nvim stable source under `~/.local/share/nvim/lazy/lazy.nvim`.

Target files (all NEW):

- `dotfiles/nvim/init.lua` (init.lua): bootstrap with `mapleader`, lazy.nvim stable bootstrap, and requires; scope is about one hundred twenty lines.
- `dotfiles/nvim/lua/config/editor.lua` (editor.lua): reviewed editing defaults module exposing `M.setup()`.
- `dotfiles/nvim/lua/plugins/core.lua` (core.lua): lazy spec list with exactly the thirteen kept plugins.

### Steps

1. Create `dotfiles/nvim/init.lua` (init.lua). Set `vim.g.mapleader` and `vim.g.maplocalleader` to space before anything loads plugins. Bootstrap lazy.nvim on the stable pin: resolve `vim.fn.stdpath("data") .. "/lazy/lazy.nvim"`, clone `https://github.com/folke/lazy.nvim.git` with `--filter=blob:none` when the directory is absent, check out the `stable` ref inside the clone, then prepend the path to the runtime path. Call `require("lazy").setup()` with an import of the `plugins.core` module, then call `require("config.editor").setup()`. The file must not require `config.dashboard`, `config.gitroot`, or any other module owned by a later partial.

2. Create `dotfiles/nvim/lua/config/editor.lua` (editor.lua) as a module returning `M` with `M.setup()`. Migrate the reviewed old defaults: create the undo directory under `stdpath("state")/undo` and set `undodir` plus `undofile`; set `updatetime` to 300, `sidescrolloff` to 5, `softtabstop` to 2, and `confirm` to true; create one cleared augroup holding a `TextYankPost` highlight autocmd and a `FocusGained` checktime autocmd guarded to normal mode and normal buffers; provide a guarded `map()` helper that skips existing normal-mode mappings via a `maparg()` check and register `<leader>w` (save), `<leader>nh` (clear search highlight), `[q` / `]q` (quickfix navigation), and `Ctrl-h/j/k/l` (window focus). Keep Windows-cache user commands out of scope for this partial.

3. Create `dotfiles/nvim/lua/plugins/core.lua` (core.lua) returning the lazy spec list with exactly these thirteen kept plugins as short `user/repo` slugs (lazy.nvim canonical form, same as the old config), ordered alphabetically by plugin name:
   - `lewis6991/gitsigns.nvim`
   - `Ramilito/kubectl.nvim`
   - `folke/lazy.nvim` (stable pin, matching the bootstrap)
   - `nvim-lualine/lualine.nvim`
   - `nvim-tree/nvim-web-devicons`
   - `nickjvandyke/opencode.nvim`
   - `nvim-lua/plenary.nvim`
   - `folke/snacks.nvim`
   - `nvim-telescope/telescope.nvim`
   - `akinsho/toggleterm.nvim`
   - `folke/tokyonight.nvim`
   - `folke/trouble.nvim`
   - `folke/which-key.nvim`
   Keep every spec minimal (a load trigger plus safe options only) and declare no spec for any other plugin, so no new plugin enters the set. Do not wire nodectl and do not add a compatibility shim (per the design decision, nodectl stays unwired until its chapter ticket). The snacks spec must not reference dashboard sections from `config.dashboard`, and the opencode spec must not reference `config.opencode_wsl` or `llm` modules; those owners arrive in later partials.

4. Prove a clean headless startup from an isolated config home. Copy the repo config to a fresh temporary directory and run Neovim with fully isolated XDG directories so the real home stays untouched:
   ```bash
   TMP_NVIM="$(mktemp -d)"
   cp -r dotfiles/nvim "$TMP_NVIM/nvim"
   export XDG_CONFIG_HOME="$TMP_NVIM" XDG_DATA_HOME="$TMP_NVIM/data" XDG_STATE_HOME="$TMP_NVIM/state" XDG_CACHE_HOME="$TMP_NVIM/cache"
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +"Lazy! sync" +qa
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +qa
   echo "startup exit: $?"
   ```
   The first invocation installs lazy.nvim stable plus the thirteen plugins and may take a while; the second invocation must exit with code 0.

5. Run headless assertions that fail loudly via `cquit` (same isolated environment as step 4):
   ```bash
   export XDG_CONFIG_HOME="$TMP_NVIM" XDG_DATA_HOME="$TMP_NVIM/data" XDG_STATE_HOME="$TMP_NVIM/state" XDG_CACHE_HOME="$TMP_NVIM/cache"
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +"lua if vim.g.mapleader ~= ' ' then vim.cmd('cquit 1') end" +qa
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +"lua if vim.o.undofile ~= true then vim.cmd('cquit 1') end" +qa
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +"lua local ok = pcall(require, 'config.editor'); if not ok then vim.cmd('cquit 1') end" +qa
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +qa 2>"$TMP_NVIM/stderr.log"
   if grep -qi error "$TMP_NVIM/stderr.log"; then cat "$TMP_NVIM/stderr.log"; exit 1; fi
   ```
   Every invocation must exit with code 0 and the captured standard error must contain no error text.

6. Run the per-plugin load smoke (same isolated environment). First assert that the headless sync installed all thirteen plugin directories:
   ```bash
   for p in gitsigns.nvim kubectl.nvim lazy.nvim lualine.nvim nvim-web-devicons opencode.nvim plenary.nvim snacks.nvim telescope.nvim toggleterm.nvim tokyonight.nvim trouble.nvim which-key.nvim; do
     test -d "$TMP_NVIM/data/lazy/$p" || { echo "MISSING plugin dir: $p"; exit 1; }
   done
   ```
   Then force-load every plugin headless and require each provided Lua module, failing on the first missing piece:
   ```bash
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +"Lazy load gitsigns.nvim kubectl.nvim lualine.nvim nvim-web-devicons opencode.nvim plenary.nvim snacks.nvim telescope.nvim toggleterm.nvim tokyonight.nvim trouble.nvim which-key.nvim" +"lua local mods = {'gitsigns','kubectl','lualine','nvim-web-devicons','opencode','plenary','snacks','telescope','toggleterm','tokyonight','trouble','which-key'}; for _, m in ipairs(mods) do local ok = pcall(require, m); if not ok then print('LOAD FAILED: ' .. m); vim.cmd('cquit 1') end end" +qa
   ```
   Finally confirm the lazy registry knows exactly the thirteen specs:
   ```bash
   /usr/local/bin/nvim --headless -u "$TMP_NVIM/nvim/init.lua" -i NONE +"lua local want = {'gitsigns.nvim','kubectl.nvim','lazy.nvim','lualine.nvim','nvim-web-devicons','opencode.nvim','plenary.nvim','snacks.nvim','telescope.nvim','toggleterm.nvim','tokyonight.nvim','trouble.nvim','which-key.nvim'}; local have = {}; for _, p in ipairs(require('lazy').plugins()) do have[p.name] = true end; for _, n in ipairs(want) do if not have[n] then print('MISSING SPEC: ' .. n); vim.cmd('cquit 1') end end" +qa
   ```

7. Run the scope guards from the worktree root. No later-partial module may be referenced, and the spec list must contain exactly the thirteen repository slugs:
   ```bash
   if grep -rnE "config\.(dashboard|gitroot|opencode)|plugins\.nodectl" dotfiles/nvim/; then exit 1; fi
   grep -oE "'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+'" dotfiles/nvim/lua/plugins/core.lua | tr -d "'" | grep -v '^folke/lazy' | sort -u > /tmp/p1-specs.txt
   printf '%s\n' Ramilito/kubectl.nvim akinsho/toggleterm.nvim folke/snacks.nvim folke/tokyonight.nvim folke/trouble.nvim folke/which-key.nvim lewis6991/gitsigns.nvim nickjvandyke/opencode.nvim nvim-lualine/lualine.nvim nvim-lua/plenary.nvim nvim-telescope/telescope.nvim nvim-tree/nvim-web-devicons | sort -u > /tmp/p1-want.txt
   diff /tmp/p1-want.txt /tmp/p1-specs.txt
   ```
   The `grep` guard must print nothing and the `diff` must report no differences (`lazy.nvim` itself is asserted separately in step 6 because the bootstrap, not a spec entry, may own it).

8. Commit the three files. `dotfiles/` is gitignored, so force-add each path explicitly:
   ```bash
   git add -f dotfiles/nvim/init.lua dotfiles/nvim/lua/config/editor.lua dotfiles/nvim/lua/plugins/core.lua
   git commit -m "feat(T900655): neovim foundation bootstrap and core plugins [T900655]"
   git ls-files dotfiles/nvim/
   ```
   The commit message keeps the required `feat(T900655): <subject> [T900655]` shape, and `git ls-files` must list exactly the three new files.

### Acceptance criteria

- `dotfiles/nvim/init.lua` (init.lua) exists, sets both leaders before the plugin manager starts, bootstraps lazy.nvim on the stable pin, imports only the `plugins.core` specs, calls only `config.editor` setup, and stays near the stated scope size.
- `dotfiles/nvim/lua/config/editor.lua` (editor.lua) exists, exposes `M.setup()`, and provides persistent undo, the stated options, the yank and focus autocmds in a cleared augroup, and the guarded mappings.
- `dotfiles/nvim/lua/plugins/core.lua` (core.lua) exists and declares exactly the thirteen kept plugin specs with the repositories listed in step 3; no other plugin spec is present and no new plugin was added.
- Headless startup from the isolated config home exits with code 0 and writes no error text to standard error.
- The headless leader, undofile, and editor-module assertions all exit with code 0.
- All thirteen plugin install directories exist after the headless sync, every provided Lua module loads headless, and the lazy registry contains all thirteen specs.
- Both scope guards pass: no reference to later-partial modules and an exact thirteen-slug spec match.
- The implementation commit uses the `feat(T900655): <subject> [T900655]` shape and tracks exactly the three force-added files.
