## Task p2: GitHub runbook and headless tests (tests role)

Context. This partial runs after p1 has landed, because the tests stage the
implemented github module and dashboard page. It owns exactly one NEW runbook
file and extends the existing headless BATS suite
`tests/spec/neovim-dashboard.bats` (suite file `neovim-dashboard.bats`)
without creating any other file. The suite file `neovim-dashboard.bats`
carries a shell-test extension that the S1 line-limit gate does not cover, so
no line budget applies to it; this is stated in words on purpose and no
numeric budget is claimed. The runbook file `github.md` is Markdown and
carries no S1 limit entry. All assertions verify process output (exit codes,
stdout files, result files), never implementation source text.

Target files:

- `dotfiles/nvim/runbooks/github.md` (NEW runbook chapter: prerequisites, the nine ordered steps, troubleshooting, recovery)
- `tests/spec/neovim-dashboard.bats` (EXTEND with github probes plus red-green proof; also accept `github.md` in the existing runbook allowlist case)

### Steps

1. Rebase onto latest origin/main before touching the shared suite file:
   `git fetch origin main` then rebase this branch, keeping every other
   chapter test block byte-identical. Create
   `dotfiles/nvim/runbooks/github.md` following `runbooks/_template.md` with
   frontmatter `page: github`, `ticket: T900659`, `status: complete`, and
   `actions` in dashboard order: `branch-status`, `diff-view`, `pr-view`,
   `review-list`, `pr-checks`, `failure-logs`, `release-view`, `pr-merge`,
   `branch-cleanup`. Prerequisites cover installed `gh` (verified v2.101.0),
   optional `gh-axi` for display, Gitsigns availability, and the git-rooted
   buffer requirement. The nine ordered steps walk the runbook flow (prepare,
   review, check CI, merge, clean up) with focus-versus-execute behavior, the
   visible repo/branch/PR target, the canonical guard on the two mutations,
   and the squash-merge plus branch-prefix conventions from the git-workflow
   skill. Troubleshooting covers missing PR, unreachable remotes, absent
   checks, and declined confirmations; recovery documents that read-only
   actions write nothing and that a merge is undone via `gh pr revert`
   followed by branch recreation.
2. Extend `tests/spec/neovim-dashboard.bats` reusing the existing setup
   harness (isolated XDG staging, `command -v nvim || skip` guard), appending
   a new section at end of file under unique `# ── T900659 ... ──` anchor
   comments: (a) staged Lua probe loads `config.github` and asserts all nine
   action functions plus `target` and `confirm_or_abort` exist; (b) headless
   probe asserts the dashboard `github` page lists the nine action names in
   order with distinct keys; (c) guard probes with stubbed `vim.fn.confirm`
   and a recording `vim.system` assert that declining runs zero commands and
   accepting runs the recorded canonical command, and that requiring the
   module creates zero `BufWritePre` autocmds; (d) runbook coverage:
   `runbooks/github.md` exists with `status: complete`, its step headers match
   the dashboard action names in order, and the allowlist case accepts
   `github.md` alongside the existing entries.
3. RED run: point the harness stage variable at a freshly created EMPTY
   directory and run the new github tests with the real runner invocation
   `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the
   run has expected: FAIL outcome because every new probe must detect the
   absent module, page wiring, and runbook, which proves the tests are
   sensitive and not vacuous. Keep the failure output as the red evidence for
   the commit message body.
4. GREEN run: point the harness back at the implemented staged config from
   `dotfiles/nvim/` with p1 landed and execute the same real runner invocation
   `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`;
   every github test must pass. If any probe fails, fix the test to match the
   real staged module names from p1 and re-run until green.
5. Stage exactly the two touched paths and commit (`dotfiles/` is gitignored,
   so force-add the new runbook explicitly):
   ```bash
   git add -f dotfiles/nvim/runbooks/github.md tests/spec/neovim-dashboard.bats
   git commit -m "feat(T900659): github runbook and headless tests [T900659]"
   ```

### Acceptance criteria

- `dotfiles/nvim/runbooks/github.md` exists with the nine named steps in order plus prerequisites, troubleshooting, recovery, and guard documentation.
- The BATS suite covers module shape, page order with distinct keys, guard decline-aborts and accept-runs behavior, zero format-on-save autocmds, runbook step order, and the allowlist accept, all asserting on process output and result files.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
