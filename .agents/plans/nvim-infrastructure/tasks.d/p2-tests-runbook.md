## Task p2: Infrastructure runbook and headless tests (tests role)

Context. This partial runs after p1 has landed, because the tests stage the implemented infrastructure module and dashboard page. It owns exactly one NEW runbook file and extends the existing headless BATS suite `tests/spec/neovim-dashboard.bats` (suite file `neovim-dashboard.bats`) without creating any other file. The suite file `neovim-dashboard.bats` carries a shell-test extension that the S1 line-limit gate does not cover, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. The runbook file `infrastructure.md` is Markdown and carries no S1 limit entry. All assertions verify process output (exit codes, stdout files, result files), never implementation source text.

Target files:

- `dotfiles/nvim/runbooks/infrastructure.md` (NEW runbook chapter: prerequisites, ordered steps, expected result, troubleshooting, recovery)
- `tests/spec/neovim-dashboard.bats` (EXTEND with infrastructure probes plus red-green proof; also accept `infrastructure.md` in the existing runbook allowlist case)

### Steps

1. Rebase onto latest `origin/main` before touching the shared `neovim-dashboard.bats`, then keep every other chapter block byte-identical (only the allowlist line gains one entry and new T900664-anchored tests append at the end).
2. Create `dotfiles/nvim/runbooks/infrastructure.md` following `runbooks/_template.md` with frontmatter `page: infrastructure`, `ticket: T900664`, `status: complete`, and `actions` in dashboard order: `cluster-status`, `pods`, `services`, `pod-logs`, `context-select`, `setup-checklist`, `Status` (the kept foundation sub-page link is last, matching the F5 probe convention that documents link rows). Sections cover kubectl and context prerequisites (`fleet`, `devmesh`; korczewski frozen and refused), the kept kubectl.nvim and ToggleTerm plugins, per-action usage with focus-versus-execute behavior and the manual confirmation for context switches, category-specific diagnosis and recovery procedures (unreachable context, missing binary, refused namespace, plugin not loaded), and recovery (switch back via `kubectl config use-context`, close scratch buffers and terminals; actions write nothing persistent).
3. Extend `tests/spec/neovim-dashboard.bats` reusing the existing setup harness (isolated XDG staging, `command -v nvim || skip` guard), appending at unique `# ── T900664 p2: ...` anchors after all other chapters: (a) staged Lua probe loads `config.infrastructure` and asserts all six functions plus the fleet workspace state defaults exist; (b) headless probe asserts the dashboard `infrastructure` page lists the six action names in order with the Status link last; (c) headless probe asserts `context_select` refuses a korczewski namespace without switching; (d) headless probe with kubectl removed from `PATH` asserts the module degrades with a warning instead of an error; (e) runbook coverage: `runbooks/infrastructure.md` exists with `status: complete`, its `actions` frontmatter matches the six names plus `Status` in order, its seven ordered step headers match the same names in order, all five template sections are present, and the allowlist case accepts it.
4. RED run: point the harness stage variable at a freshly created EMPTY directory and run the new infrastructure tests with the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the run has expected: FAIL outcome because every new probe must detect the absent module, page wiring, and runbook, which proves the tests are sensitive and not vacuous. Keep the failure output as the red evidence for the commit message body.
5. GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` with p1 landed and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every infrastructure test must pass. If any probe fails, fix the test to match the real staged module names from p1 and re-run until green.
6. Stage exactly the two touched paths and commit (`dotfiles/` is gitignored, hence force-add for the runbook):
   ```bash
   git add -f dotfiles/nvim/runbooks/infrastructure.md tests/spec/neovim-dashboard.bats
   git commit -m "feat(T900664): infrastructure runbook and headless tests [T900664]"
   ```

### Acceptance criteria

- `dotfiles/nvim/runbooks/infrastructure.md` exists with the six named actions plus the Status link in order, seven ordered steps, troubleshooting, recovery, and prerequisites.
- The BATS suite covers module shape, page order with the kept Status link, the korczewski refusal, kubectl-missing degradation, and runbook parity, all asserting on process output and result files.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
