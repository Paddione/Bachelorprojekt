## Task 1: SDLC chapter module (read-only actions)

Context. This partial creates the SDLC chapter module for ticket T900660
(EPIC T900654). It owns exactly one new file and depends on no other partial.
All nine actions are strictly read-only: they display ticket/worktree/check
state in a scratch buffer or open existing skill/plan files; mutating steps
are shown as copy-paste commands and never executed. No new plugin enters the
set — the module shells out to the already-documented CLIs
(`scripts/ticket.sh`, `git`, `task`) and uses only built-in buffer APIs.
Live-verified inputs reused here: `ticket.sh get/list/get-ticket-links/
get-timeline` all take `--id <T>` (real call `get-ticket-links --id T900660`
returns `child_of: [T900654]`); skill paths
`.agents/skills/{ticket-triage,ticket-dispatch,dev-flow-plan,dev-flow-execute}/
SKILL.md` exist under the repo root; the dashboard action model resolves cwd
at execution time and passes it to the effect.

Target files (all NEW):

- `dotfiles/nvim/lua/config/sdlc.lua` (sdlc.lua): chapter module exposing nine functions; scope about three hundred lines.

### Steps

1. Create `dotfiles/nvim/lua/config/sdlc.lua` (sdlc.lua) with the module
   header documenting the read-only contract, the cwd contract (execution
   time via `config.gitroot`, nil-guard WARN, never `vim.fn.getcwd()`), and
   the no-OpenSpec rule. Provide three private helpers: `resolve_cwd(cwd)`
   (return the passed cwd when non-empty, else `require('config.gitroot').
   root()` with a WARN and nil return when unresolvable); `ticket_from_branch
   (cwd)` (parse `T[0-9]{6,}` from the current branch name via `git
   -C <cwd> branch --show-current`, return nil with a WARN when no ticket id
   is found); `show_scratch(cwd, title, lines)` (new unlisted scratch buffer,
   `buftype=nofile`, `readonly`, `filetype=sdlc`, filled with the given
   lines). Run every subprocess with an argv list (`vim.fn.system()` list
   form), never through a shell string; pass `:edit` paths through
   `fnameescape()`.

2. Implement the nine public functions, each taking an optional `cwd` and
   returning early with a WARN when the root or ticket id is missing:
   `M.list_tickets` (`ticket.sh list --limit 20`, no ticket needed);
   `M.show_triage` (`ticket.sh get --id <T>`, triage fields plus the
   copy-paste `triage` command for the manual decision);
   `M.show_readiness` (`ticket.sh get --id <T>`, readiness/plan-meta fields);
   `M.show_deps` (`ticket.sh get-ticket-links --id <T>`);
   `M.open_plan` (parse `plan_ref` from `ticket.sh get --id <T>` output, open
   the file under the root when it exists, else notify the expected path);
   `M.exec_status` (`git status --short --branch`, `git worktree list`,
   touched files and PR links from the ticket record — the
   ticket-files-worktree-checks-PR linkage, all read-only);
   `M.show_gates` (static gate block: `task test:changed`, `task
   freshness:regenerate`, `task freshness:check`, plus the plan-lint re-run;
   displayed, never executed); `M.close_check` (live ticket status line plus
   the static merge-is-completion checklist); `M.open_process_docs`
   (existence-check the four SKILL.md paths, `:edit` the first hit and
   `:badd` the rest, notify which were missing).

3. Prove the module loads headless and exposes all nine functions:
   ```bash
   cat > /tmp/sdlc-shape.lua <<'LUA'
   local stage = arg[1]
   package.path = stage .. '/lua/?.lua;' .. package.path
   local ok, m = pcall(require, 'config.sdlc')
   assert(ok, 'LOAD FAILED config.sdlc')
   for _, f in ipairs({'list_tickets','show_triage','show_readiness','show_deps','open_plan','exec_status','show_gates','close_check','open_process_docs'}) do
     assert(type(m[f]) == 'function', 'missing ' .. f)
   end
   print('nine functions exist')
   LUA
   nvim -l /tmp/sdlc-shape.lua dotfiles/nvim
   ```
   The probe must print `nine functions exist` and exit 0.

4. Prove the no-git-mutation and no-OpenSpec guards from the worktree root:
   ```bash
   if grep -rnE "openspec" dotfiles/nvim/lua/config/sdlc.lua; then exit 1; fi
   if grep -nE "ticket\.sh (triage|update-status|stage-plan|enqueue|create)|git +(commit|push|checkout|switch|worktree +(add|remove)|clean|reset)|task +(workspace:deploy|freshness:regenerate)" dotfiles/nvim/lua/config/sdlc.lua; then exit 1; fi
   ```
   Both greps must print nothing. The allowed subprocess verbs in the file
   are exactly `ticket.sh get|list|get-ticket-links|get-timeline`,
   `git status|worktree list|log|branch --show-current|rev-parse`, and the
   static display of the gate commands.

5. Commit the file. `dotfiles/` is gitignored, so force-add explicitly:
   ```bash
   git add -f dotfiles/nvim/lua/config/sdlc.lua
   git commit -m "feat(T900660): neovim sdlc chapter module [T900660]"
   git ls-files dotfiles/nvim/lua/config/sdlc.lua
   ```
   The commit keeps the `feat(T900660): <subject> [T900660]` shape and tracks
   exactly the one new file.

### Acceptance criteria

- `dotfiles/nvim/lua/config/sdlc.lua` (sdlc.lua) exists and exposes the nine
  documented functions; the headless shape probe prints `nine functions
  exist` with exit 0.
- Every function resolves cwd at execution time with a nil-guard WARN and
  never touches `vim.fn.getcwd()`; ticket-bearing functions derive the id
  from the branch name and no-op with a WARN when none is found.
- No subprocess mutates state: only the allowed read verbs appear, and the
  guard greps print nothing; the file contains no `openspec` reference.
- The implementation commit uses the `feat(T900660): <subject> [T900660]`
  shape and tracks exactly the force-added file.
