## Task p2: Dashboard registration and runbook index entry

Context. This partial registers the ComfyUI & Images chapter page in the dashboard and flips its runbook-index row from stub to complete. It runs after p1 (the module must exist) and touches exactly the two shared files below, nothing else. Sibling chapters land in parallel on other branches: rebase onto the latest `origin/main` first, then insert only the chapter-owned block and keep every other chapter's block byte-identical. The dashboard must not integrate OpenSpec.

Target files:

- `dotfiles/nvim/lua/config/dashboard.lua` (MODIFY: add the comfyui-images page entry at the files-search anchor; .lua not S1-gated, stated in words on purpose and no numeric budget is claimed)
- `dotfiles/nvim/runbooks/README.md` (MODIFY: flip the chapter row to complete; .md not S1-gated, stated in words on purpose and no numeric budget is claimed)

### Steps

1. Rebase preparation: `git fetch origin main`, then rebase this branch onto the latest `origin/main` so sibling chapter blocks already merged are present. Re-read `dotfiles/nvim/lua/config/dashboard.lua` and confirm the anchor: the `['files-search']` page entry inside the `local pages = { ... }` table, ending before that table's closing `}`. When the anchor moved, follow the moved anchor — never duplicate a page entry.
2. Modify `dotfiles/nvim/lua/config/dashboard.lua`: insert one explicit `['comfyui-images']` page entry (title `ComfyUI & Images`) directly after the `['files-search']` entry, opened by the unique marker comment `-- ── T900666 comfyui-images chapter page ──`. Its rows are `action()` records in this exact order and naming: `status`, `queue`, `logs`, `start`, `use`, `troubleshoot`, `unload`, `stop`. Each action's `effect` calls the matching `comfyui-images.lua` function with the execution-time cwd; each action carries `inputs = {}` and an `on_error` handler. Keep the CHAPTERS order (chapter key `9`, page id `comfyui-images`), the `0`/`<BS>` navigation rows, the quit row, and the action-model shape. No other page changes.
3. Modify `dotfiles/nvim/runbooks/README.md`: change only the ComfyUI & Images row (currently `9. **ComfyUI & Images** — T900666 — status: stub`) to reference the new chapter file with status complete: `9. **ComfyUI & Images** — T900666 — [`comfyui-images.md`](comfyui-images.md) — status: complete`. No other row changes.
4. Prove headless behavior: stage the repo config to a temp dir and run an `nvim -l` probe asserting `dashboard.sections('comfyui-images')` lists exactly the eight action names in the step-2 order, that Home still lists exactly the ten EPIC chapters in order with no Factory entry, and that opening or focusing the page creates no side-effect marker file.
5. Stage exactly the two touched paths and commit:
   ```bash
   git add -f dotfiles/nvim/lua/config/dashboard.lua dotfiles/nvim/runbooks/README.md
   git commit -m "feat(T900666): register comfyui images page and index row [T900666]"
   ```

### Acceptance criteria

- The dashboard `comfyui-images` page lists exactly `status`, `queue`, `logs`, `start`, `use`, `troubleshoot`, `unload`, `stop` in order behind the chapter marker; CHAPTERS order and navigation unchanged; no other page altered.
- The runbook index row points at `comfyui-images.md` with status complete; all other rows unchanged.
- Headless probes pass for page order, Home order, and focus-before-execute separation.
- Commit uses the exact subject above with explicit force-added pathspecs and touches no other file.
