## Task 2: Git-root function and dashboard shell

Role: implementation. This partial stands alone, declares no dependencies, and
creates exactly two new files. Both targets are new `.lua` files, and the S1
quality gate defines no line limit for the Lua extension, so no line budget
constrains them; keep both modules small and focused anyway. S2, S3, and S4 do
not apply: no TypeScript import graph is touched, no hostname literal is
introduced, and no manifest or repo script is added.

Read-only pattern reference (never copy content blindly):
`/home/patrick/.config/nvim.old-20260927/lua/config/dashboard.lua` lines 1-181
provides the Snacks pages pattern (`M.show` / `M.sections`, home, category,
sub-page, back navigation, key navigation). Reuse that structure only; every
page title, action, and label below is new and follows the design chapter
order. The old factory-specific async probe is explicitly not a pattern for
the new Git-root function. Do not create `init.lua`, plugin specs, runbooks,
or tests here; those belong to other partials, so this partial stays disjoint.

### Step 1: Create the buffer-based Git-root module

Create `dotfiles/nvim/lua/config/gitroot.lua` (gitroot.lua) with a single
public function `M.root()` that resolves the repository top level for the
current buffer:

- Read the current buffer path with `vim.api.nvim_buf_get_name(0)`.
- Unnamed buffers (empty name) and non-file buffers (`buftype` not empty)
  return `nil` and show a user message with `vim.notify`; they never return a
  directory.
- Otherwise take the file's directory with `vim.fn.fnamemodify(path, ':p:h')`
  and run `git -C <dir> rev-parse --show-toplevel` as a synchronous call with
  an explicit timeout (use `vim.system` with a timeout option and wait on the
  result; command-local working directory only).
- Escape the directory with `vim.fn.shellescape` when building the shell
  argument; use `vim.fn.fnameescape` for any path passed to an Ex edit
  command.
- On success return the trimmed top-level path (main repo or linked worktree
  root). On any failure (nonzero exit, timeout, empty output) return `nil`
  and show a user message; never return a stale or foreign directory, and
  never fall back to another project.
- The function never changes the global working directory: no `:cd`,
  `chdir()`, or equivalent anywhere in the module.

### Step 2: Create the Snacks dashboard shell

Create `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua) following the
`M.show` / `M.sections` pages pattern from the reference above:

- Home page lists exactly the ten surviving chapters in EPIC order, one link
  row each: Files & Search; JavaScript / Frontend; GitHub; SDLC;
  Repository & Code Knowledge; AI & Agents; Models & Inference;
  Infrastructure; ComfyUI & Images; Settings & Help. There is no Factory
  page and no eleventh chapter row.
- Category pages exist for all ten chapters; at least one category exposes a
  sub-page reachable by link. Every non-home page shows back and Home rows
  plus the shared quit row.
- Navigation supports direct key selection and `j` / `k` movement with Enter
  (Snacks dashboard selection behavior); Backspace returns to the parent page
  and `0` returns Home.
- Search runs over category and action names through the Snacks picker. The
  first selection only focuses the action (opens its page and moves the
  cursor to it); execution is a separate explicit step on the focused action.
- Every executable entry follows the visible action model with the fields
  `name`, `inputs`, `target` / `effect`, `cwd`, and `on_error`. The `cwd`
  shown and used at execution time comes from `M.root()` in gitroot.lua;
  when it returns `nil`, the action reports "no project" instead of running
  elsewhere. `on_error` notifies the user and leaves editor state unchanged.
- Opening a menu never executes: page rendering and link traversal perform no
  shell commands, no file writes, and no state changes beyond the dashboard
  buffer itself.
- `M.setup()` registers the `:Dashboard` user command and the `<leader>h`
  normal-mode mapping. The bootstrap `require` of this module lives in the
  bootstrap partial; do not create `init.lua` here.

### Step 3: Headless verification of the Git-root function (5 cases)

Create a throwaway probe init `/tmp/p2-init.lua` that adds the repo config to
the runtime path without loading plugin managers:

```lua
vim.opt.rtp:prepend('/home/patrick/Bachelorprojekt/.worktrees/nvim-dashboard-foundation/dotfiles/nvim')
package.path = '/tmp/?.lua;' .. package.path
```

Create the probe `/tmp/p2-gitroot-check.lua` that opens each fixture, calls
`require('config.gitroot').root()`, compares against the expected value, and
fails the run with `vim.cmd('cquit 1')` on the first mismatch, printing one
PASS line per case otherwise. Prepare the fixtures:

```bash
mkdir -p "/tmp/p2 space/repo/nested"
git -C "/tmp/p2 space/repo" init -q
touch "/tmp/p2 space/repo/nested/file.txt" /tmp/p2-outside.txt
```

Run the probe in headless form:

```bash
/usr/local/bin/nvim --headless -u /tmp/p2-init.lua -i NONE +"luafile /tmp/p2-gitroot-check.lua" +qa
echo "gitroot-probe-exit:$?"
```

The five cases and their expected outcomes:

1. Nested main-repo file (for example an existing tracked file under
   `/home/patrick/Bachelorprojekt`) resolves to `/home/patrick/Bachelorprojekt`.
2. A file inside the linked worktree
   `/home/patrick/Bachelorprojekt/.worktrees/nvim-dashboard-foundation`
   resolves to that worktree root, not to the main checkout.
3. An unnamed buffer (`:enew`, no file) returns `nil` plus the user message.
4. A file outside any checkout (`/tmp/p2-outside.txt`) returns `nil` plus the
   user message.
5. A nested file under the space-containing path
   (`/tmp/p2 space/repo/nested/file.txt`) resolves to `/tmp/p2 space/repo`.

Clean the fixtures afterwards with `rm -rf "/tmp/p2 space" /tmp/p2-outside.txt`.

### Step 4: Headless verification of the home order and shell

Run the home-order assertion in headless form against the same probe init:

```bash
/usr/local/bin/nvim --headless -u /tmp/p2-init.lua -i NONE +"lua require('config.dashboard-home-check')" +qa
```

The check module (throwaway, under `/tmp`, added to `package.path` by the
probe init) asserts all of the following and fails the run with
`vim.cmd('cquit 1')` on the first violation:

- `M.sections('home')` yields exactly ten chapter link rows whose titles match
  the Step 2 order verbatim.
- No row on any page references a Factory chapter.
- A category page exposes back and Home rows plus the quit row.
- `M.show` and `M.sections` exist and `M.setup` registers `:Dashboard`.

Expected result: exit code 0 with one PASS line per assertion.

### Step 5: Commit the two new files

Stage only the two new files with explicit force-add paths, because
`dotfiles/` is gitignored; a tree-wide add is forbidden here:

```bash
git status --short
git add -f dotfiles/nvim/lua/config/gitroot.lua dotfiles/nvim/lua/config/dashboard.lua
git status --short
git commit -m "feat(T900655): git-root function and dashboard shell [T900655]"
```

The pre-commit status must show exactly the two new files and nothing else.

### Acceptance criteria

- [ ] `dotfiles/nvim/lua/config/gitroot.lua` (gitroot.lua) exists and all five
  Step 3 headless cases pass with the prescribed expected values.
- [ ] Unnamed, non-file, and out-of-repo buffers yield `nil` plus a user
  message, never a stale or foreign directory.
- [ ] The module never changes the global working directory and escapes shell
  and Ex paths correctly, including the space-containing path case.
- [ ] `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua) exists; Home
  lists exactly the ten chapters in the Step 2 order with no Factory page.
- [ ] Category pages, at least one sub-page, back, Home, key, and `j` / `k`
  navigation all work per the Step 4 headless assertions.
- [ ] Search focuses an action on first selection; execution needs a separate
  explicit step; opening any menu executes nothing.
- [ ] Every action exposes `name`, `inputs`, `target` / `effect`, `cwd` from
  the Git-root function, and `on_error` behavior.
- [ ] The commit message matches `feat(T900655): <subject> [T900655]` and the
  commit contains only the two new files staged via explicit paths.
