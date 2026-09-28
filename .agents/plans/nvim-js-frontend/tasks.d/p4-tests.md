## Task 4: headless BATS tests with red-green cycle

Context. This partial is the last one at execution time and runs after p1, p2 and p3 have landed, because the tests stage the implemented config. It appends the js-frontend cases to the shared suite `tests/spec/neovim-dashboard.bats` under a unique per-chapter anchor and regenerates the inventory via the repo task. All assertions verify process output (exit codes, stdout files, recorded picker and terminal calls), never implementation source text. The suite stages the config through `NVIM_DASHBOARD_CONFIG_SRC`, so the red run points the harness at an empty directory.

Target files (shared suite append plus generated inventory):

- `tests/spec/neovim-dashboard.bats` (Ist 778 Zeilen; .bats not S1-gated)
- `components/website/src/data/test-inventory.json` (Ist 6038 Zeilen; .json not S1-gated)

### Steps

- [ ] Append the js-frontend block at the end of `tests/spec/neovim-dashboard.bats` between the markers `# ── T900658 js-frontend BEGIN` and `# ── T900658 js-frontend END`. The block holds five headless probes reusing the suite `setup()` staging (`$STAGE`, `$PROBE_DIR`, `$REPO`): a module-shape probe asserting the twelve p1 functions load via `nvim -l`; a page-order probe asserting `dashboard.sections('js-frontend')` yields the twelve names in pinned order; a boundary probe with a `package.preload` fake for `toggleterm.terminal` recording `cmd` and `dir`, asserting website buffers produce a pnpm command, brett buffers an npm command, and no website command contains npm; a runbook-coverage probe asserting `runbooks/js-frontend.md` carries `status: complete`, its `actions` match the dashboard order, its twelve bold steps match in order, and the five required sections exist; a no-format probe asserting zero `BufWritePre` autocmds after requiring the module. No earlier line of the suite changes.
- [ ] RED run: point the harness stage variable at a freshly created empty directory and run the suite; the run has expected: FAIL outcome because every new probe must detect the absent config, which proves the tests are sensitive and not vacuous. Execute the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats` with the empty stage exported, observe the failures, and keep the failure output as the red evidence for the commit message body.
- [ ] GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every test must pass. If any probe fails here, fix the test to match the real staged module names from the earlier partials and re-run until the suite is fully green.
- [ ] Regenerate the inventory file at `components/website/src/data/test-inventory.json` with the repo task:
  ```bash
  task test:inventory
  ```
  Confirm the regenerated inventory mentions the extended suite, then stage exactly the two touched paths and commit with the ticket-scoped conventional subject:
  ```bash
  git add tests/spec/neovim-dashboard.bats components/website/src/data/test-inventory.json
  git commit -m "feat(T900658): js-frontend headless tests with red-green proof [T900658]"
  ```

### Acceptance criteria

- The suite carries the js-frontend block between the unique T900658 markers; earlier tests are untouched.
- The block covers module shape, page order, the pnpm/npm boundary, runbook coverage with step order, and the no-format guard, asserting only on process output.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation.
- `components/website/src/data/test-inventory.json` is regenerated with the repo task and committed together with the suite in one ticket-scoped commit using explicit pathspecs.
