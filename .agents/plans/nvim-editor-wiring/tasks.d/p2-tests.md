## Task p2: Headless wiring test for the editor registry

Context. Zweck dieses Partials: die Verdrahtung Ende-zu-Ende abdecken, damit
ein Dormant-Zustand nie wieder unentdeckt bleibt. This partial implements the
test half of ticket T900747 for plan `nvim-editor-wiring`. It appends one
probe helper plus one `@test` to the dashboard suite and touches no other
assertion. Suite methodology is output verification, never source grep
(`neovim-dashboard.bats:1-3`); the harness stages the config to
`$XDG_CONFIG_HOME/nvim`, guards `command -v nvim` in `setup()`, and skips
network-dependent tests via the `git ls-remote` probe. Verified live
2026-09-28 with a headless prototype: unwired stage shows 13 registry names
(core only), wired stage shows 16 (plus `nvim-treesitter`, `nvim-lspconfig`,
`blink.cmp`); both exit 0 with zero error lines and `bufwritepre_count=0`
after startup with a file buffer.

Target files:

- `tests/spec/neovim-dashboard.bats` (MODIFY: append wiring probe plus test under the ticket anchor; Ist 2451, .bats not S1-gated, so no numeric budget applies — stated in words on purpose and no numeric budget is claimed)
- `components/website/src/data/test-inventory.json` (only if freshness regeneration changes it; Ist 6038, .json not S1-gated, no numeric budget claimed)

### Steps

- [x] Step 1 — Rebase onto the latest `origin/main` first, then extend `tests/spec/neovim-dashboard.bats` reusing the existing setup harness (isolated XDG staging, `command -v nvim || skip` guard), appending under a unique `# ── T900747 editor wiring` anchor comment and keeping every other chapter block intact: (a) a `write_editor_wiring_probe` helper staging the repo config, priming with `Lazy! sync` (skipped when the plugin host is unreachable, same `git ls-remote` guard as the existing startup tests), then starting headless with a file buffer (`edit`), dumping the sorted `require('lazy.core.config').plugins` keys plus the `BufWritePre` autocmd count into a result file, and capturing the startup log; (b) one `@test "neovim-dashboard: T900747 editor wiring registers treesitter, lspconfig and blink"` asserting exit 0, the three lines `plugin=nvim-treesitter`, `plugin=nvim-lspconfig`, `plugin=blink.cmp` in the result file, zero case-insensitive error lines in the startup log, and `bufwritepre_count=0`. Gate: the new block sits under the anchor and no other test changed.
- [x] Step 2 — RED run: point the harness stage variable at a freshly created EMPTY directory and run the new wiring test with the real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the run has expected: FAIL outcome because the probe must detect the absent staged init and empty registry, which proves the test is sensitive and not vacuous. (The same test is also red against the current unwired `main` init, which lacks exactly the three registry names.) Keep the failure output as the red evidence for the commit message body. Gate: the red run fails on the new test.
- [x] Step 3 — GREEN run: point the harness back at the implemented staged config from `dotfiles/nvim/` with p1 landed and execute the same real runner invocation `tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats`; the wiring test must pass with all three registry names present, exit 0, no error lines, and `bufwritepre_count=0`. Then run the inventory regeneration and check whether `components/website/src/data/test-inventory.json` changed. Gate: the green run passes fully.
- [x] Step 4 — Stage exactly the touched paths and commit:
  ```bash
  git add tests/spec/neovim-dashboard.bats
  git add components/website/src/data/test-inventory.json 2>/dev/null || true
  git commit -m "feat(T900747): headless wiring test for editor registry [T900747]"
  ```
  The inventory add is a no-op when regeneration produced no diff.

### Acceptance criteria

- [x] The BATS suite covers the wiring end to end: registry names, clean startup, and zero `BufWritePre` autocmds, all asserting on process output and result files.
- [x] Red-green proof exists: empty-stage RED plus wired GREEN with the real runner.
