## Task 2: Dashboard registration of the models-inference page

Context. This partial registers the `models-inference` page in the dashboard shell for ticket T900663. It owns exactly one existing shared file, creates no other file, and runs after p1 so the six module functions it references exist. Verified anchor facts (2026-09-28, `dotfiles/nvim/lua/config/dashboard.lua` at 271 lines): the `CHAPTERS` table already lists `{ key = '7', title = 'Models & Inference', page = 'models-inference' }`, so Home needs no change; the page currently resolves through the auto-stub loop; the `files-search` page entry ends at the `},` line directly above the closing `}` of the `local pages` table, and that closing brace is the EXACT registration anchor — the new page entry is inserted between those two lines, mirroring the `files-search` action-record shape (key, name, inputs, effect delegating to the chapter module, on_error). Sibling chapter workers append their own page entries at the same anchor in parallel, so the rebase discipline in step 1 is mandatory.

Target files (one CHANGED shared file):

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua): minimal anchor-based append of the `models-inference` page entry only; .lua not S1-gated.

### Steps

1. Rebase onto latest `origin/main` before touching the shared file, then confirm the anchor still matches:
   ```bash
   git fetch origin main && git rebase origin/main
   grep -n "models-inference\|files-search' \] = \|^}" dotfiles/nvim/lua/config/dashboard.lua | head -12
   ```
   Proceed only when the `CHAPTERS` row for `models-inference` exists and the `files-search` entry still ends right above the `local pages` closing brace; keep every other chapter block byte-identical.
2. Insert the `models-inference` page entry at the anchor with a unique per-chapter marker comment above and below the block (`-- T900663 models-inference page begin` / `-- T900663 models-inference page end`). The entry carries `title = 'Models & Inference'` and six `action()` rows in this exact dashboard order, each effect delegating to the p1 module function of the same purpose: `models-status` (key `s`) calls `require('config.models-inference').status(cwd)`; `server-config` (key `c`) calls `show_config`; `server-logs` (key `l`) calls `logs`; `gpu-resources` (key `g`) calls `gpu`; `server-start` (key `b`) calls `start_unit`; `server-stop` (key `x`) calls `stop_unit`. Every row passes `inputs = {}` and `on_error = function() end`, exactly like the `files-search` rows. No other line of the file changes.
3. Prove the page renders headless with six actions in order and that Home still lists ten chapters with no Factory entry:
   ```bash
   STAGE="$(mktemp -d)/nvim" && mkdir -p "$STAGE" && cp -r dotfiles/nvim/. "$STAGE"/
   /usr/local/bin/nvim -l /dev/stdin "$STAGE" <<'LUA'
   local stage = arg[1]
   package.path = stage .. '/lua/?.lua;' .. package.path
   local dashboard = require('config.dashboard')
   local rows = dashboard.sections('models-inference')
   local names = {}
   for _, r in ipairs(rows[3]) do
     if r.name then names[#names + 1] = r.name end
   end
   local want = 'models-status,server-config,server-logs,gpu-resources,server-start,server-stop'
   assert(table.concat(names, ',') == want, 'order mismatch: ' .. table.concat(names, ','))
   local home = dashboard.sections('home')
   assert(#home[3] == 10, 'home chapter count drifted')
   print('models-inference registration ok')
   LUA
   ```
   The probe must print `models-inference registration ok` and exit with code 0.
4. Run the shared-file guards from the worktree root:
   ```bash
   grep -c "T900663 models-inference page" dotfiles/nvim/lua/config/dashboard.lua
   git diff --stat dotfiles/nvim/lua/config/dashboard.lua
   git diff dotfiles/nvim/lua/config/dashboard.lua | grep -c "^-[^-]"
   ```
   The marker count must be exactly 2 (begin plus end), and the removed-lines count must be 0 (pure append, no other chapter block touched).
5. Commit the one shared file. `dotfiles/` is gitignored, so force-add the explicit path:
   ```bash
   git add -f dotfiles/nvim/lua/config/dashboard.lua
   git commit -m "feat(T900663): register models-inference dashboard page [T900663]"
   ```
   The commit message keeps the required `feat(T900663): <subject> [T900663]` shape and stages exactly the one force-added file.

### Acceptance criteria

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua) contains the `models-inference` page entry between the unique begin/end markers, with six `action()` rows in the documented order and keys, delegating to the six p1 module functions.
- The headless probe prints `models-inference registration ok` with exit code 0, and Home still lists exactly ten chapters.
- The diff against the rebased base is a pure append: zero removed lines, no other page entry modified.
- The implementation commit uses the `feat(T900663): <subject> [T900663]` shape and stages exactly the one force-added file.
