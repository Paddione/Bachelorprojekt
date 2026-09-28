## Task 2: Dashboard registration of the SDLC page

Context. This partial registers the SDLC page in the dashboard shell for
ticket T900660 (EPIC T900654). It owns exactly one shared file and depends on
p1 (the `config.sdlc` module must exist before the page references it).
Live-verified anchor: `dotfiles/nvim/lua/config/dashboard.lua` line 143 is
the `}` closing `local pages = {`; the files-search block occupies lines
97-142; the SDLC chapter currently resolves through the auto-stub loop. The
new `['sdlc']` block is inserted after the files-search block and before the
closing `}` so the auto-stub stops applying to `sdlc`. Rebase onto latest
`origin/main` before touching the shared file and keep every other chapter
block byte-identical.

Target files (all CHANGED):

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua): add the `['sdlc']` page block; anchor-based append only.

### Steps

1. Rebase the branch onto latest `origin/main` (`git fetch origin main`
   then `git rebase origin/main`), then re-verify the anchor: the
   files-search block must still end with `  },` immediately before the
   `}` that closes `local pages`. If sibling chapter blocks landed above the
   anchor in the meantime, insert after them — the rule is positional
   (directly before the closing `}`), not line-numbered.

2. Insert the `['sdlc']` page block directly before the closing `}` of
   `local pages`, marked with a `-- SDLC chapter page (T900660)` comment.
   The block carries `title = 'SDLC'` and nine `action()` rows in this exact
   order with these keys and effects: `tickets-list` (t,
   `require('config.sdlc').list_tickets(cwd)`), `triage-show` (g,
   `show_triage`), `readiness-show` (r, `show_readiness`), `deps-show` (d,
   `show_deps`), `plan-open` (p, `open_plan`), `exec-status` (x,
   `exec_status`), `verify-gates` (v, `show_gates`), `close-check` (c,
   `close_check`), `process-docs` (s, `open_process_docs`). Every row uses
   `inputs = {}` and `on_error = function() end`, mirroring the files-search
   rows. The registration comment and rows contain no OpenSpec reference.

3. Prove the page renders nine actions in order and Home still lists ten
   chapters with SDLC fourth:
   ```bash
   cat > /tmp/sdlc-order.lua <<'LUA'
   local stage, outfile = arg[1], arg[2]
   package.path = stage .. '/lua/?.lua;' .. package.path
   local dashboard = require('config.dashboard')
   local rows = dashboard.sections('sdlc')
   local f = io.open(outfile, 'w')
   for _, r in ipairs(rows[3]) do
     if r.name then f:write(r.name .. '\n') end
   end
   f:close()
   LUA
   nvim -l /tmp/sdlc-order.lua dotfiles/nvim /tmp/sdlc-order.out
   printf 'tickets-list\ntriage-show\nreadiness-show\ndeps-show\nplan-open\nexec-status\nverify-gates\nclose-check\nprocess-docs\n' | diff - /tmp/sdlc-order.out
   ```
   The diff must report no differences.

4. Run the shared-file guards: `git diff --stat` must show only
   `dotfiles/nvim/lua/config/dashboard.lua`; `git diff` must show a pure
   addition (no removed or altered existing line); and `grep -nE "openspec"
   dotfiles/nvim/lua/config/dashboard.lua` must print nothing.

5. Commit the registration with an explicit pathspec:
   ```bash
   git add -f dotfiles/nvim/lua/config/dashboard.lua
   git commit -m "feat(T900660): register neovim sdlc dashboard page [T900660]"
   ```
   The commit keeps the `feat(T900660): <subject> [T900660]` shape and
   contains only the one shared file.

### Acceptance criteria

- `dashboard.lua` contains the `['sdlc']` block with the T900660 marker
  comment, nine `action()` rows in the specified order and keys, and no
  other added, removed, or altered line.
- The headless order probe diff is empty; Home order and all other chapter
  blocks are unchanged.
- The shared-file guards pass: pure addition, single-file diff, no
  `openspec` match.
- The commit uses the `feat(T900660): <subject> [T900660]` shape and tracks
  only the registration file.
