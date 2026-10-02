## Task p1: GitHub chapter implementation

Context. This partial implements ticket T900659 (Neovim GitHub chapter, EPIC
T900654 chapter 3) for change `nvim-github`. It owns exactly one NEW module
and registers the chapter page in the dashboard, touching no other file.
Foundation (T900655) provides the dashboard shell, gitroot resolution, and the
thirteen kept plugins; files-search (T900657) is merged and its registration
block is the pattern to mirror. Gitsigns (`lewis6991/gitsigns.nvim`,
plugins/core.lua line 3, pinned in lazy-lock.json) already covers hunk signs
and in-buffer diff display — no new git plugin enters the set. The `gh` CLI
is installed (v2.101.0, verified live) and `gh-axi` is installed at
`~/.npm-global/bin/gh-axi` (verified live, 16 commands including pr, run,
release). The old host config is read-only reference only.

Target files:

- `dotfiles/nvim/lua/config/github.lua` (NEW module exposing the nine chapter actions plus two helpers; .lua not S1-gated)
- `dotfiles/nvim/lua/config/dashboard.lua` (MODIFY: register the github page after the files-search block; .lua not S1-gated, so no numeric budget applies — stated in words on purpose and no numeric budget is claimed)

### Steps

1. Rebase onto latest origin/main before touching the shared dashboard file:
   `git fetch origin main` then rebase this branch, resolving conflicts by
   keeping every other chapter block byte-identical. Inventory overlap and
   record the finding as a code comment header in `github.lua`: Gitsigns
   provides hunk/diff display (reuse via guarded `require('gitsigns')`, define
   no maps that collide with its documented keys); Telescope is not needed
   here; no new plugin is added.
2. Create `dotfiles/nvim/lua/config/github.lua` as a module returning `M`.
   Every function resolves `cwd` at execution time via
   `require('config.gitroot').root()` (accepting an optional cwd argument like
   the files-search module) and returns early with a warning when root is nil.
   Every action first resolves and displays the target triple (repo, branch,
   PR number) so the target is visible before anything runs. Read-only actions
   run directly; the two mutating actions additionally pass through the
   canonical guard helper. Display output prefers `gh-axi` when its binary is
   present (human display), while machine parsing (`--json` pipelines) and
   every mutation use `gh` directly per T004612. All external commands run via
   `vim.system` with the resolved cwd (no shell dependency, Windows/WSL
   routing unaffected); quote Ex-command paths with `fnameescape()` and shell
   arguments with `shellescape()`. Create zero autocmds (no format-on-save).
   Functions in dashboard order:
   - `M.branch_status()` — Branches: current branch, upstream tracking state, and repo name; read-only.
   - `M.diff_view()` — Diffs: working-tree change summary backed by Gitsigns hunk data; read-only.
   - `M.pr_view()` — PRs: the pull request belonging to the current branch; read-only.
   - `M.review_list()` — Reviews: review states and comments on that PR; read-only.
   - `M.pr_checks()` — CI-Checks: `gh pr checks` state for that PR; read-only.
   - `M.failure_logs()` — Failure-Logs: failed job log lines via `gh run view --log-failed`; read-only.
   - `M.release_view()` — Releases: latest release notes for the repo; read-only.
   - `M.pr_merge()` — Mergen: squash-merge (`gh pr merge --squash`) of the current PR; MUTATION, canonical guard required.
   - `M.branch_cleanup()` — Aufraeumen: delete the merged branch locally and on the remote; MUTATION, canonical guard required.
   - `M.target()` — helper returning the visible repo/branch/PR triple.
   - `M.confirm_or_abort()` — the canonical guard helper: shows the target and effect, then requires explicit `vim.fn.confirm` approval; a decline aborts with no command executed.
3. Modify `dotfiles/nvim/lua/config/dashboard.lua`: insert an explicit
   `['github']` page entry (title `GitHub`) directly after the files-search
   registration block (the block introduced by the `-- Files & Search chapter
   page (T900657).` comment) and before the pages-table closing brace. Mark
   the new block with the unique comment `-- GitHub chapter page (T900659).`
   Its rows are `action()` records in this exact order and naming with these
   keys: `branch-status` (b), `diff-view` (d), `pr-view` (p), `review-list`
   (r), `pr-checks` (c), `failure-logs` (l), `release-view` (v), `pr-merge`
   (m), `branch-cleanup` (x). Each action's `effect` calls the matching
   `github.lua` function with the execution-time cwd. Keep the CHAPTERS order,
   the `0`/`<BS>` navigation rows, the quit row, and the action-model shape
   (name, inputs, effect, cwd, on_error). No other page changes; keep every
   other chapter block byte-identical.
4. Prove headless behavior without network: stage the repo config to a temp
   dir; run a Lua probe with `package.path` at staged `lua/` requiring
   `config.github` and asserting all eleven functions exist; run headless
   `nvim --headless -u "$STAGE/init.lua" -i NONE` probes asserting the
   dashboard `github` page lists the nine action names in order, that focusing
   creates no side-effect marker while explicit execute resolves the git root
   of a scratch repo, that declining the stubbed confirm runs zero external
   commands while accepting runs the recorded squash-merge command, and that
   requiring the module creates zero `BufWritePre` autocmds.
5. Stage exactly the two touched paths and commit (`dotfiles/` is gitignored,
   so force-add the new module explicitly):
   ```bash
   git add -f dotfiles/nvim/lua/config/github.lua dotfiles/nvim/lua/config/dashboard.lua
   git commit -m "feat(T900659): github chapter module and dashboard page [T900659]"
   ```

### Acceptance criteria

- `github.lua` exists with the nine actions plus `target` and `confirm_or_abort`, execution-time gitroot resolution, visible target triple, gh-axi-for-display with gh-direkt-for-parse-and-mutation split, escaped paths, and zero autocmds.
- The dashboard `github` page lists exactly the nine names above in order with the stated keys; CHAPTERS order and navigation unchanged; no other page altered.
- Headless probes pass for module shape, page order, focus-before-execute separation, guard decline-aborts and accept-runs behavior, and zero format-on-save autocmds.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
