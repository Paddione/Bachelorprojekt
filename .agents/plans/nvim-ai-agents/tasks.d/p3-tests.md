## Task p3: AI und Agents headless tests (tests role)

Context. Zweck dieses Partials: die BATS-Suite um ai-agents-Proben mit Rot-grün-Nachweis erweitern. This partial runs after p1 and p2 have landed, because the tests stage the implemented module, dashboard page, and runbook. It owns exactly the existing headless BATS suite `tests/spec/neovim-dashboard.bats` (suite file `neovim-dashboard.bats`) plus the regenerated inventory file, and creates no other file. The suite file `neovim-dashboard.bats` carries a shell-test extension that the S1 line-limit gate does not cover, so no line budget applies to it; this is stated in words on purpose and no numeric budget is claimed. The inventory file `test-inventory.json` is JSON and carries no S1 limit entry. All assertions verify process output (exit codes, stdout files, result files), never implementation source text.

Target files:

- `tests/spec/neovim-dashboard.bats` (EXTEND with ai-agents probes plus red-green proof; also accept `ai-agents.md` in the existing runbook allowlist case)
- `components/website/src/data/test-inventory.json` (REGENERATE via the inventory task only if it changes; commit alongside when modified)

### Steps

- [ ] Step 1 — Rebase onto the latest `origin/main` first, then extend `tests/spec/neovim-dashboard.bats` reusing the existing setup harness (isolated XDG staging, `command -v nvim || skip` guard), appending under a unique `# ── T900662 ai-agents` anchor comment and keeping every other chapter block intact: (a) staged Lua probe loads `config.ai-agents` and asserts all five functions exist; (b) headless probe asserts the dashboard `ai-agents` page lists `ask`, `select`, `send-context`, `list-skills`, `session-new` in order and that each action row carries the full visible-action-model shape (name, inputs, effect, on_error); (c) focus probe asserts opening or focusing the page writes no side-effect marker while the explicit execute step does; (d) skills probe guarded by `command -v muse` (skip when absent) asserts `muse skills list --source all` exits 0 and its output carries the header line; (e) runbook coverage: `runbooks/ai-agents.md` exists with `status: complete`, its step headers match the dashboard action names in order, it carries all five template sections, it contains the workflow mapping and the Blink delineation, and the allowlist case accepts it. Gate: new tests are appended under the anchor and the allowlist accepts the new runbook.
- [ ] Step 2 — RED run: point the harness stage variable at a freshly created EMPTY directory and run the new ai-agents tests with the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the run has expected: FAIL outcome because every new probe must detect the absent module, page wiring, and runbook, which proves the tests are sensitive and not vacuous. Keep the failure output as the red evidence for the commit message body. Gate: the red run fails on the new tests.
- [ ] Step 3 — GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` with p1 and p2 landed and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; every ai-agents test must pass. If any probe fails, fix the test to match the real staged module names from p1 and re-run until green. Then run the inventory regeneration and check whether `components/website/src/data/test-inventory.json` changed. Gate: the green run passes fully.
- [ ] Step 4 — Stage exactly the touched paths and commit:
  ```bash
  git add tests/spec/neovim-dashboard.bats
  git add components/website/src/data/test-inventory.json 2>/dev/null || true
  git commit -m "feat(T900662): ai agents headless tests [T900662]"
  ```
  The inventory add is a no-op when regeneration produced no diff.

### Acceptance criteria

- [ ] The BATS suite covers module shape, page order, action-model shape, focus-before-execute separation, live skills listing, and runbook coverage, all asserting on process output and result files.
- [ ] The red run against an empty staged config fails and the green run against the implemented config passes using the same runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`.
- [ ] Commit uses the exact subject above with explicit pathspecs and touches no other file.
