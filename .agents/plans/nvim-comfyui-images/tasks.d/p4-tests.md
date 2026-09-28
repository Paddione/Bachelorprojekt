## Task p4: Chapter tests and inventory refresh

Context. This partial extends the shared BATS spec with the chapter probes and regenerates the test inventory. It runs after p1, p2, and p3 (module, registration, and runbook must exist) and touches exactly the two files below. Sibling chapters append to the same spec file: rebase onto the latest `origin/main` first, then append only the chapter-owned block at the end of the file and keep every other chapter's block byte-identical. Output verification only (headless Neovim probes writing result files), never source grep for behavior. The dashboard must not integrate OpenSpec.

Target files:

- `tests/spec/neovim-dashboard.bats` (MODIFY: append the chapter test block at end of file under a unique marker; .bats not S1-gated, stated in words on purpose and no numeric budget is claimed)
- `components/website/src/data/test-inventory.json` (REGENERATE via the inventory task; .json not S1-gated)

### Steps

1. Rebase preparation: `git fetch origin main`, then rebase this branch onto the latest `origin/main` so sibling chapter blocks already merged are present. Confirm the append point is still the end of `tests/spec/neovim-dashboard.bats`.
2. RED proof first: point the spec at an empty config source so the new tests fail before the implementation is visible:
   ```bash
   NVIM_DASHBOARD_CONFIG_SRC="$(mktemp -d)" tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats --filter 'comfyui'
   ```
   expected: FAIL — every new comfyui test errors because the staged module, page, and runbook are absent. Record the failing output in the commit message body trailers.
3. Append the chapter test block at the end of `tests/spec/neovim-dashboard.bats` under the unique marker comment `# ── T900666 comfyui-images chapter tests ──`, following the existing headless-probe style (`STAGE`, `PROBE_DIR`, `nvim -l` probes, result-file diffs):
   - module shape: staged `config.comfyui-images` loads and exposes the nine functions in order;
   - page order: `dashboard.sections('comfyui-images')` lists exactly `status`, `queue`, `logs`, `start`, `use`, `troubleshoot`, `unload`, `stop`;
   - focus-versus-execute: focusing the page creates no side-effect marker while the explicit step does;
   - queue guard: with the base URL pointed at an unroutable address, the guard probe reports active (fail-closed) and unload/stop refuse without shelling out;
   - runbook parity: `runbooks/comfyui-images.md` exists with `status: complete`, its `actions:` list matches the dashboard order, all five template sections exist, and the eight bold step headings match in order.
4. GREEN proof: run the full spec unfiltered from the worktree root:
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats
   ```
   All tests pass, including every pre-existing test and the five new chapter tests.
5. Regenerate the test inventory (`task test:inventory`) and confirm `components/website/src/data/test-inventory.json` changed only by the regeneration. Stage exactly the two touched paths and commit:
   ```bash
   git add tests/spec/neovim-dashboard.bats components/website/src/data/test-inventory.json
   git commit -m "feat(T900666): comfyui images chapter tests [T900666]"
   ```

### Acceptance criteria

- The RED run in step 2 fails as documented and the GREEN run in step 4 passes the whole spec file.
- The appended block sits under the chapter marker at end of file; no pre-existing test was modified and no sibling chapter block was altered.
- The regenerated inventory is committed alongside the spec change.
- Commit uses the exact subject above with explicit pathspecs and touches no other file.
