## Task p3: Repository & Code Knowledge headless tests (tests role)

Context. This partial runs after p1 and p2 have landed, because the tests stage the implemented knowledge module, the dashboard page and the runbook. It owns exactly one existing suite file and creates no other file. The suite file `neovim-dashboard.bats` carries a shell-test extension that the S1 line-limit gate does not cover, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. All assertions verify process output (exit codes, stdout files, result files), never implementation source text. The bats runner is `tests/unit/lib/bats-core/bin/bats` and the target Neovim is v0.12.5 at `/usr/local/bin/nvim` (both verified live). The runbooks README master index stays untouched (its stub entries and the ten-stub count assertion are owned by the foundation and hold for every chapter, as the merged files-search state shows).

Target files:

- `tests/spec/neovim-dashboard.bats` (EXTEND with repo-knowledge probes plus red-green proof at a unique anchor; also accept `repo-knowledge.md` in the existing runbook allowlist case)

### Steps

1. Rebase onto latest origin/main before touching the suite, then append the new block at the end of `tests/spec/neovim-dashboard.bats` under the unique header `# ── T900661 repo-knowledge chapter (anchor: repo-knowledge) ──`, keeping every other chapter block intact, and add `repo-knowledge.md` to the existing runbook allowlist case alongside `files-search.md`. Reuse the existing setup harness (isolated XDG staging, `command -v nvim || skip` guard).
2. Add output-verifying probes: (a) staged Lua probe loads `config.repo-knowledge` and asserts all nine functions plus the quickfix helper exist; (b) headless probe asserts the dashboard `repo-knowledge` page lists the nine action names in exact order; (c) page-name probe asserts no action on the page is named with an openspec term, proving the no-OpenSpec-integration rule on rendered output; (d) focus-before-execute probe reuses the marker pattern (opening or focusing the page writes no marker, the explicit execute step does); (e) K3 probes guarded by `command -v codebase-memory-mcp || skip` assert `k3-status` output names the index state and `k3-symbol` with a nonsense term reports zero hits without touching quickfix; (f) runbook coverage: `runbooks/repo-knowledge.md` exists with `status: complete`, its frontmatter `actions` match the dashboard order, and its step headers match the nine names in order.
3. RED run: point the harness stage variable at a freshly created EMPTY directory and run the new repo-knowledge tests with the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the run has expected: FAIL outcome because every new probe must detect the absent module, page wiring, and runbook, which proves the tests are sensitive and not vacuous. Keep the failure output as the red evidence for the commit message body.
4. GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` with p1 and p2 landed and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every repo-knowledge test must pass. If any probe fails, fix the test to match the real staged module names from p1 and re-run until green.
5. Stage exactly the one touched path and commit:
   ```bash
   git add tests/spec/neovim-dashboard.bats
   git commit -m "feat(T900661): repo knowledge headless tests [T900661]"
   ```

### Acceptance criteria

- The BATS suite covers module shape, page order, no-OpenSpec page names, focus-before-execute, K3 live-or-skip behavior, and runbook step order, all asserting on process output and result files.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`.
- The runbook allowlist case accepts `repo-knowledge.md` and no other chapter block was modified.
- Commit uses the exact subject above with the explicit pathspec and touches no other file.
