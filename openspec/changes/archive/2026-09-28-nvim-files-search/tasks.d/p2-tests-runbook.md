## Task p2: Files & Search runbook and headless tests (tests role)

Context. This partial runs after p1 has landed, because the tests stage the implemented search module and dashboard page. It owns exactly one NEW runbook file and extends the existing headless BATS suite `tests/spec/neovim-dashboard.bats` (suite file `neovim-dashboard.bats`) without creating any other file. The suite file `neovim-dashboard.bats` carries a shell-test extension that the S1 line-limit gate does not cover, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. The runbook file `files-search.md` is Markdown and carries no S1 limit entry. All assertions verify process output (exit codes, stdout files, result files), never implementation source text.

Target files:

- `dotfiles/nvim/runbooks/files-search.md` (NEW runbook chapter: prerequisites, install/update/remove steps, troubleshooting, recovery)
- `tests/spec/neovim-dashboard.bats` (EXTEND with files-search probes plus red-green proof; also accept `files-search.md` in the existing runbook allowlist case)

### Steps

1. Create `dotfiles/nvim/runbooks/files-search.md` following `runbooks/_template.md` with frontmatter `page: files-search`, `ticket: T900657`, `status: complete`, and `actions` in dashboard order: `find-file`, `live-grep`, `buffers`, `recent-files`, `related-open`. Sections cover Telescope availability (`:Telescope` command, `:checkhealth telescope`), ripgrep prerequisite for live grep, per-action usage with focus-versus-execute behavior, quickfix handoff, related-file rules table, and recovery (nothing persistent is written by search actions; `:cclose` clears quickfix).
2. Extend `tests/spec/neovim-dashboard.bats` reusing the existing setup harness (isolated XDG staging, `command -v nvim || skip` guard): (a) staged Lua probe loads `config.files-search` and asserts all five functions exist; (b) headless probe asserts the dashboard `files-search` page lists the five action names in order; (c) gitroot-backed probes execute `find-file` path resolution for a nested file, a linked-worktree file, and a space-containing scratch repo path, comparing output against runtime-computed `git rev-parse --show-toplevel` values; (d) runbook coverage: `runbooks/files-search.md` exists, its step headers match the dashboard action names in order, and the allowlist case accepts it.
3. RED run: point the harness stage variable at a freshly created EMPTY directory and run the new files-search tests with the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the run has expected: FAIL outcome because every new probe must detect the absent module, page wiring, and runbook, which proves the tests are sensitive and not vacuous. Keep the failure output as the red evidence for the commit message body.
4. GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` with p1 landed and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every files-search test must pass. If any probe fails, fix the test to match the real staged module names from p1 and re-run until green.
5. Stage exactly the two touched paths and commit:
   ```bash
   git add dotfiles/nvim/runbooks/files-search.md tests/spec/neovim-dashboard.bats
   git commit -m "feat(T900657): files search runbook and headless tests [T900657]"
   ```

### Acceptance criteria

- `dotfiles/nvim/runbooks/files-search.md` exists with the five named steps in order plus troubleshooting, recovery, and prerequisites.
- The BATS suite covers module shape, page order, nested/worktree/space-path resolution, and runbook step order, all asserting on process output and result files.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
