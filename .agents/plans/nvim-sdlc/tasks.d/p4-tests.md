## Task 4: SDLC headless tests and inventory refresh

Context. This partial extends the dashboard BATS suite with the SDLC chapter
cases and regenerates the test inventory for ticket T900660 (EPIC T900654).
It owns one shared test file plus the regenerated inventory and depends on
p1, p2, and p3 (module, page, and runbook must exist before the cases can
pass). Style reference is the T900657 block at the end of
`tests/spec/neovim-dashboard.bats` (probe helpers writing to `$PROBE_DIR`,
`nvim -l` execution, `run`/`diff` assertions, output verification instead of
source grepping). New tests assert result files produced by headless probes;
the only grep-based assertions are the no-OpenSpec guards, which assert
command output emptiness. Every new test name contains `T900660` so the RED
step can select exactly these cases with `--filter`. Rebase onto latest
`origin/main` before touching the shared files and keep every sibling
chapter block byte-identical.

Target files (all CHANGED):

- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats): append the T900660 block at end of file under the marker `# ── T900660 sdlc chapter ──`.
- `components/website/src/data/test-inventory.json` (test-inventory.json): regenerate via `task test:inventory`.

### Steps

1. Rebase the branch onto latest `origin/main` (`git fetch origin main`
   then `git rebase origin/main`), then confirm the append anchor: the file
   must still end with the T900657 files-search runbook test. Append the new
   block strictly after the last line; never insert between existing cases.

2. Append the T900660 block under the marker comment
   `# ── T900660 sdlc chapter ──` with these five cases, each following the
   existing probe-helper pattern against the staged config (`$STAGE`):
   (a) `neovim-dashboard: T900660 sdlc module exposes nine functions` —
   `nvim -l` probe requiring `config.sdlc` and asserting all nine function
   fields, expecting the `nine functions exist` line; (b)
   `neovim-dashboard: T900660 sdlc page lists nine actions in order` —
   `dashboard.sections('sdlc')` names diffed against the nine-name
   expectation; (c) `neovim-dashboard: T900660 sdlc actions no-op with a
   warning outside any checkout` — probe stubbing `vim.notify` into a
   marker file, calling `M.list_tickets` and `M.show_triage` from an unnamed
   buffer, asserting exit 0 plus a `no project` marker line and no scratch
   buffer created; (d) `neovim-dashboard: T900660 sdlc runbook exists and
   matches dashboard order` — file presence, `^status: complete`, actions[]
   diff against the nine names, all five `##` sections, nine `**name**`
   steps in order (same awk shape as the files-search runbook case); (e)
   `neovim-dashboard: T900660 sdlc files carry no OpenSpec references` —
   `run grep -r -i openspec` over the staged module, dashboard registration,
   and runbook files asserting exit 1 (no match) with empty output.

3. Prove the new cases are red without the implementation and green with it.
   First point the suite at an empty config source so the staged files are
   missing — expected: FAIL:
   ```bash
   EMPTY_CFG="$(mktemp -d)"
   NVIM_DASHBOARD_CONFIG_SRC="$EMPTY_CFG" tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats --filter 'T900660'
   echo "RED run exit: $? (nonzero required here)"
   ```
   This RED run must exit nonzero (the T900660 cases fail against the empty
   source). Then run the same filter against the real staged config:
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats --filter 'T900660'
   ```
   This GREEN run must exit 0 with all five T900660 cases passing. Finally
   run the whole file unfiltered and require exit 0 so no sibling chapter
   case regressed.

4. Regenerate the test inventory and confirm the diff is limited to the two
   owned files:
   ```bash
   task test:inventory
   git status --short -- components/website/src/data/test-inventory.json tests/spec/neovim-dashboard.bats
   ```
   Only the two manifest files may appear changed (plus the plan files,
   which are committed separately at staging time, not in this partial).

5. Commit the two files with explicit pathspecs:
   ```bash
   git add tests/spec/neovim-dashboard.bats components/website/src/data/test-inventory.json
   git commit -m "test(T900660): neovim sdlc headless cases [T900660]"
   ```
   The commit keeps the `test(T900660): <subject> [T900660]` shape and
   contains only the suite plus the regenerated inventory.

### Acceptance criteria

- The BATS file ends with the `# ── T900660 sdlc chapter ──` marker block
  holding exactly the five specified cases; no earlier line changed.
- RED run against the empty config source exits nonzero; GREEN filtered run
  exits 0 with five passes; full unfiltered file run exits 0.
- `test-inventory.json` is regenerated and only the two manifest files show
  as changed.
- The commit uses the `test(T900660): <subject> [T900660]` shape and tracks
  only the suite plus the inventory.
