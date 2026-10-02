## Task 4: Headless tests for the models-inference chapter

Context. This partial adds the T900663 test block to the dashboard spec and regenerates the test inventory. It owns exactly one existing shared spec file plus the generated inventory file, creates no other file, and runs after p1, p2, and p3 so every asserted artifact exists. Verified anchor facts (2026-09-28): `tests/spec/neovim-dashboard.bats` is 778 lines and ends with the T900657 files-search runbook test; the spec stages the config from `$NVIM_DASHBOARD_CONFIG_SRC` (default `$REPO/dotfiles/nvim`), so a RED run points that variable at an empty directory; the repo BATS runner is `tests/unit/lib/bats-core/bin/bats` (Bats 1.13.0); sibling chapter workers append their own blocks at the same end-of-file anchor in parallel, so the rebase discipline in step 1 is mandatory. Output verification only, no source grep: every new test runs headless Neovim probes and asserts on result files.

Target files (one CHANGED shared spec, one REGENERATED inventory):

- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats): new T900663 block appended at end of file behind a unique marker; .bats not S1-gated.
- `components/website/src/data/test-inventory.json` (test-inventory.json): regenerated via the inventory task; .json not S1-gated.

### Steps

1. Rebase onto latest `origin/main` before touching the shared spec, then confirm the anchor still matches:
   ```bash
   git fetch origin main && git rebase origin/main
   tail -5 tests/spec/neovim-dashboard.bats
   grep -c "T900663" tests/spec/neovim-dashboard.bats || true
   ```
   Proceed only when the file still ends with the files-search runbook test and contains no T900663 block yet; keep every other chapter block byte-identical.
2. Demonstrate RED first: run the new block's assertions against an empty staged config and confirm they fail. Point the spec at an empty directory so the module, page, and runbook are all absent:
   ```bash
   EMPTY_CFG="$(mktemp -d)/empty-nvim" && mkdir -p "$EMPTY_CFG"
   NVIM_DASHBOARD_CONFIG_SRC="$EMPTY_CFG" ./tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats --filter 'models-inference' 2>&1 | tail -15
   ```
   At this point the block does not exist yet, so the filter matches nothing; after step 3 the same command against the empty config is re-run and every new test fails — expected: FAIL. Record the failing output in the step-6 commit message body as the red proof.
3. Append the T900663 block at end of file behind the unique marker line `# ── T900663 models-inference ──` with four tests following the existing spec patterns: (a) module contract — an `nvim -l` probe requires `config.models-inference` from the staged config and asserts the six functions `status`, `show_config`, `logs`, `gpu`, `start_unit`, `stop_unit` exist; (b) page order — an `nvim -l` probe calls `dashboard.sections('models-inference')` and diffs the six action names against the dashboard order `models-status`, `server-config`, `server-logs`, `gpu-resources`, `server-start`, `server-stop`; (c) focus-before-execute — reusing the spec's `write_action_probe` marker technique against the `models-inference` page, opening and focusing the page writes no marker while the explicit execute step does; (d) runbook coverage — the staged `runbooks/models-inference.md` carries `status: complete`, its `actions` list diffs clean against the six dashboard names, and the five H2 sections plus the six `Geordnete Schritte` step names match in order. Every test writes its probe result to a file under `$BATS_TEST_TMPDIR` and asserts on that file.
4. Run the RED proof with the block in place (expected: FAIL), then the GREEN run against the real staged config:
   ```bash
   EMPTY_CFG="$(mktemp -d)/empty-nvim" && mkdir -p "$EMPTY_CFG"
   NVIM_DASHBOARD_CONFIG_SRC="$EMPTY_CFG" ./tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats --filter 'models-inference' 2>&1 | tail -8
   ./tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats --filter 'models-inference' 2>&1 | tail -8
   ```
   The first invocation must fail every new test (expected: FAIL — empty config has no module, page, or runbook); the second invocation must pass all four new tests with exit code 0.
5. Regenerate the test inventory and confirm the spec stays registered:
   ```bash
   task test:inventory
   git status --porcelain components/website/src/data/test-inventory.json tests/spec/neovim-dashboard.bats
   ```
   The inventory file must show as modified (regenerated) and the spec as modified (new block); no other test file may appear in the status output.
6. Commit the two files with explicit pathspecs and the red proof in the message body:
   ```bash
   git add tests/spec/neovim-dashboard.bats components/website/src/data/test-inventory.json
   git commit -m "feat(T900663): headless tests for models-inference chapter [T900663]"
   git diff HEAD~1 --stat
   ```
   The commit message keeps the required `feat(T900663): <subject> [T900663]` shape and stages exactly the two files.

### Acceptance criteria

- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats) ends with the `# ── T900663 models-inference ──` block holding exactly the four documented tests, all following the spec's headless output-verification pattern with no source grep.
- The RED run against the empty config fails every new test (expected: FAIL, recorded in the commit message body) and the GREEN run against the staged config passes all four with exit code 0 via the repo BATS runner `tests/unit/lib/bats-core/bin/bats`.
- `components/website/src/data/test-inventory.json` (test-inventory.json) is regenerated via `task test:inventory` and committed alongside the spec.
- The diff against the rebased base appends only the new block: no other test in the spec file modified.
- The implementation commit uses the `feat(T900663): <subject> [T900663]` shape and stages exactly the two files.
