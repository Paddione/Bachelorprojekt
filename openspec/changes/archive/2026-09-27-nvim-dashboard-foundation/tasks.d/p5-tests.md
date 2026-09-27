---
partial: p5-tests
role: tests
depends_on: [p1, p2, p3]
---

## Task 5: Headless BATS tests with red-green cycle

This partial is the last one at execution time and runs after partials p1, p2, and p3 have landed, because the tests stage the implemented repo config. It creates the new headless BATS suite `tests/spec/neovim-dashboard.bats` (suite file `neovim-dashboard.bats`) and regenerates the generated inventory `components/website/src/data/test-inventory.json` (inventory file `test-inventory.json`) via the repo task, committing both together. The suite file `neovim-dashboard.bats` carries a shell-test extension that the S1 line-limit gate does not cover, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. All assertions verify process output (exit codes, stdout files, marker files), never implementation source text.

### Steps

1. Create the suite file `neovim-dashboard.bats` at `tests/spec/neovim-dashboard.bats` with a `setup()` harness: skip when Neovim is absent via `command -v nvim >/dev/null || skip`, resolve the repo root from `BATS_TEST_DIRNAME`, build an isolated staging area under `BATS_TEST_TMPDIR` with private `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, and `XDG_STATE_HOME`, and copy the repo config from `dotfiles/nvim/` into the staged config directory. The harness reads the stage directory from an environment variable with a sane default so the red run can point it at an empty directory. Provide a `teardown()` that removes nothing outside `BATS_TEST_TMPDIR`.
2. Add the clean-startup probes. First, load every staged Lua module (`lua/config/gitroot.lua`, `lua/config/dashboard.lua`, `lua/config/editor.lua`, `lua/plugins/core.lua`) through a headless Lua probe with `package.path` pointed at the staged `lua/` directory, and fail on any load error — this probe is unconditional and must pass without network access. Second, drive Neovim headless against the staged init file, which bootstraps lazy.nvim over the network on first run:
   ```bash
   nvim --headless -u "$STAGE/init.lua" -i NONE +qa >"$RESULT" 2>"$LOG"
   ```
   Assert the exit status is zero and the log contains no error line. Guard this second probe with a network-availability check (`git ls-remote https://github.com/folke/lazy.nvim.git HEAD` with a short timeout): when the plugin host is unreachable, skip the full-startup assertion with a message instead of failing, because offline CI runners cannot bootstrap the plugin manager.
3. Add the Git-root probes. Each case runs a headless Lua probe that calls the staged Git-root function for one buffer path and prints the result to a result file; the BATS test compares that output against the expected value:
   - a file nested in the main checkout resolves to that checkout top level (expected value computed at runtime with `git rev-parse --show-toplevel`);
   - a file under `/home/patrick/Bachelorprojekt/.worktrees/nvim-dashboard-foundation` resolves to that worktree root;
   - an unnamed buffer reports the contained no-project marker instead of any directory;
   - a file under `BATS_TEST_TMPDIR` outside any checkout reports the contained no-project marker;
   - a file in a space-containing directory of a fresh `git init` scratch repo under `BATS_TEST_TMPDIR` resolves to that scratch top level.
4. Add the dashboard Home order probe. Call the staged dashboard module's Home listing through a headless Lua probe, print one entry per line, and assert the exact ten chapter titles verbatim per design.md section 6 in EPIC order: Files & Search, JavaScript / Frontend, GitHub, SDLC, Repository & Code Knowledge, AI & Agents, Models & Inference, Infrastructure, ComfyUI & Images, Settings & Help. Assert the output contains no Factory entry.
5. Add the runbook coverage probe in three comparisons. (a) Extract the ten chapter entries in order from the staged `runbooks/README.md` master index and `diff` them against the dashboard Home listing from step 4 — names and order must match, no Factory entry. (b) Extract the `actions[]` names in order from the machine header of the staged `runbooks/home.md` (`status: complete`) and `diff` them against the dashboard Home actions — names and order must match. (c) Assert every chapter entry in the index carries a stub mark with its owning ticket and is exempt from the runbook file-exists check, because chapter runbooks arrive with their chapter tickets; only `home.md` must exist now.
6. Add the action-table shape probe. Dump one action record per line through a headless Lua probe and assert each record exposes name, inputs, target and effect, working directory, and error behavior. Assert focus-before-execute behavior: invoking the select or focus entry point creates no side-effect marker file in `BATS_TEST_TMPDIR`, while invoking the explicit execute entry point for a scratch probe action does create its marker. No dashboard interaction may execute on open or on focus.
7. RED run: point the harness stage variable at a freshly created EMPTY directory (no init file, no Lua modules, no runbooks) and run the new suite; the run has expected: FAIL outcome because every probe must detect the absent config, which proves the tests are sensitive and not vacuous. Execute the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats` with the empty stage exported, observe the failures, and keep the failure output as the red evidence for the commit message body.
8. GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every test must pass. If any probe fails here, fix the test to match the real staged module names from the earlier partials and re-run until the suite is fully green.
9. Regenerate the inventory file `test-inventory.json` at `components/website/src/data/test-inventory.json` with the repo task:
   ```bash
   task test:inventory
   ```
   Confirm the regenerated inventory mentions the new suite, then stage exactly the two touched paths and commit with the ticket-scoped conventional subject:
   ```bash
   git add tests/spec/neovim-dashboard.bats components/website/src/data/test-inventory.json
   git commit -m "feat(T900655): headless dashboard BATS tests with red-green proof [T900655]"
   ```

### Acceptance criteria

- `tests/spec/neovim-dashboard.bats` exists with a guard that skips when Neovim is missing, stages the repo config under isolated XDG directories, and asserts only on process output and result files.
- The suite covers clean headless startup, all five Git-root cases, the ten-chapter Home order without Factory, index-to-dashboard action coverage with stub tolerance, and the action-table shape with focus-before-execute separation.
- The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation.
- `components/website/src/data/test-inventory.json` is regenerated with the repo task and committed together with the suite in one ticket-scoped commit using explicit pathspecs.
