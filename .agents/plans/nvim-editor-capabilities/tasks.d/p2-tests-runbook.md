## Task p2: Editor runbook and headless tests (tests role)

Context. This partial runs after p1 has landed, because the tests stage the implemented editor modules. It owns exactly one NEW runbook file and extends the existing headless BATS suite `tests/spec/neovim-dashboard.bats` (suite file `neovim-dashboard.bats`) without creating any other file. The suite file `neovim-dashboard.bats` carries a shell-test extension that the S1 line-limit gate does not cover, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. The runbook file `editor.md` is Markdown and carries no S1 limit entry. All assertions verify process output (exit codes, stdout files, health output), never implementation source text.

Target files:

- `dotfiles/nvim/runbooks/editor.md` (NEW runbook chapter: prerequisites, install/update/remove steps, troubleshooting, recovery)
- `tests/spec/neovim-dashboard.bats` (EXTEND with editor capability probes plus red-green proof)

### Steps

1. Create `dotfiles/nvim/runbooks/editor.md` following `runbooks/_template.md` with sections prerequisites, ordered steps, expected result, troubleshooting, recovery. Steps mirror the dashboard editor page action names in order: status, parsers-install, lsp-install, completion-check. Record upstream sources with verification date (treesitter, lspconfig, blink.cmp refs chosen in p1), per-environment install paths (Linux/WSL vs Windows native manual), JSONC note, and the no-format-on-save guarantee. Include health-check (`:checkhealth nvim-treesitter lsp blink`) and removal (lazy plugin remove plus module unwire) procedures.
2. Extend `tests/spec/neovim-dashboard.bats` with editor probes reusing the existing setup harness (isolated XDG staging, `command -v nvim || skip` guard): (a) staged Lua probe loads `config.editor-capabilities` and asserts `M.setup` is a function; (b) headless probe calls `M.setup()` inside `pcall` and asserts no `BufWritePre` autocmd exists afterwards (`nvim_get_autocmds` filtered, count zero); (c) headless probe asserts treesitter parser list contains astro and svelte entries via the module's exposed parser table; (d) runbook coverage: `runbooks/editor.md` exists and its step headers match the dashboard editor action names in order.
3. RED run: point the harness stage variable at a freshly created EMPTY directory and run the new editor tests with the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the run has expected: FAIL outcome because every new probe must detect the absent modules and runbook, which proves the tests are sensitive and not vacuous. Keep the failure output as the red evidence for the commit message body.
4. GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` with p1 landed and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every editor test must pass. If any probe fails, fix the test to match the real staged module names from p1 and re-run until green.
5. Stage exactly the two touched paths and commit with the ticket-scoped conventional subject:
   ```bash
   git add dotfiles/nvim/runbooks/editor.md tests/spec/neovim-dashboard.bats
   git commit -m "feat(T900656): editor runbook and headless capability tests [T900656]"
   ```

### Acceptance criteria

- `dotfiles/nvim/runbooks/editor.md` exists with the four named steps in order plus troubleshooting, recovery, sources with dates, and health-check.
- The BATS suite covers capability load, no-format-on-save, parser list, and runbook step order, all asserting on process output and result files.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
