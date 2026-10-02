## Task 3: dashboard registration plus runbook index flip

Context. This partial wires the p1 module into the dashboard and marks the chapter complete in the runbook index. It owns exactly the two shared files below and runs after p1 fixed the module function names. Sibling chapter workers edit these same two files in parallel on their own branches, so this partial rebases onto the latest `origin/main` first and touches only its own anchor-delimited hunks, keeping every other chapter block byte-identical.

Target files (shared, anchor-based appends only):

- `dotfiles/nvim/lua/config/dashboard.lua` (Ist 271 Zeilen; .lua not S1-gated)
- `dotfiles/nvim/runbooks/README.md` (Ist 43 Zeilen; .md not S1-gated)

### Steps

- [ ] Rebase onto the latest upstream state before touching the shared files, then confirm the anchors still exist:
  ```bash
  git fetch origin
  git rebase origin/main
  grep -n "'files-search'" dotfiles/nvim/lua/config/dashboard.lua
  grep -n 'JavaScript / Frontend' dotfiles/nvim/runbooks/README.md
  ```
  Both greps must print their anchor lines; if the rebase conflicts in another chapter block, keep that block and re-apply only the js-frontend hunks below.
- [ ] Insert the `['js-frontend']` page block into the `local pages` table of `dotfiles/nvim/lua/config/dashboard.lua` directly after the `['files-search']` block and before the table close, wrapped in unique markers:
  ```lua
  -- T900658 js-frontend registration BEGIN (do not remove; other chapters own their own blocks)
  ['js-frontend'] = {
    title = 'JavaScript / Frontend',
    rows = function()
      return {
        -- twelve action() rows in the pinned index order, keys p/c/l/r/d/v/w/n/t/b/e/s,
        -- each effect calling require('config.js-frontend').<fn>(cwd) with on_error set
      }
    end,
  },
  -- T900658 js-frontend registration END
  ```
  The twelve rows use the visible-action-model `action()` helper with `name`, empty or documented `inputs`, `effect` delegating to the p1 module function of the same name (`test` maps to `test_cmd`), and `on_error` set. No other line of the file changes.
- [ ] Flip the index line in `dotfiles/nvim/runbooks/README.md` from `2. **JavaScript / Frontend** — T900658 — status: stub` to `2. **JavaScript / Frontend** — T900658 — status: complete — [`js-frontend.md`](js-frontend.md)`. No other line of the file changes.
- [ ] Prove the page renders twelve ordered actions headless and Home is untouched:
  ```bash
  cat > /tmp/jsf-page.lua <<'LUA'
  package.path = 'dotfiles/nvim/lua/?.lua;' .. package.path
  local d = require('config.dashboard')
  local rows = d.sections('js-frontend')[3]
  local names = {}
  for _, r in ipairs(rows) do if r.name then names[#names + 1] = r.name end end
  assert(#names == 12, 'want 12 actions, got ' .. #names)
  assert(names[1] == 'goto-page' and names[12] == 'lsp-status', 'order broken')
  local home = d.sections('home')[3]
  assert(#home == 10, 'home chapter count changed')
  print('js-frontend page OK')
  LUA
  nvim -l /tmp/jsf-page.lua
  git diff --stat
  ```
  The probe prints OK and exits 0; the diff touches only the two owned files.
- [ ] Commit both files with explicit force-adds (dotfiles/ is gitignored):
  ```bash
  git add -f dotfiles/nvim/lua/config/dashboard.lua dotfiles/nvim/runbooks/README.md
  git commit -m "feat(T900658): register js-frontend dashboard page [T900658]"
  ```

### Acceptance criteria

- The executor rebased onto the latest `origin/main` before editing and other chapters blocks are byte-identical (the diff shows only the two marker-delimited hunks).
- `dashboard.lua` holds the `['js-frontend']` block with twelve ordered `action()` rows using the pinned keys and delegating effects.
- The runbook index lists the chapter as complete with a link to `js-frontend.md`.
- The headless probe confirms twelve ordered actions plus an unchanged ten-chapter Home.
- The commit uses the `feat(T900658): <subject> [T900658]` shape and tracks exactly the two force-added files.
