## Task p1: Infrastructure chapter implementation

Context. This partial implements ticket T900664 (Neovim Infrastructure chapter) for plan `nvim-infrastructure`. It owns exactly one NEW module and rewires the chapter page in the dashboard, touching no other file. Foundation (T900655) provides the dashboard shell, gitroot resolution, and the thirteen kept plugins; the Files and Search chapter (T900657) is merged and sets the precedent this partial mirrors (registration comment marker, action-model shape, no README index flip). kubectl.nvim (`Ramilito/kubectl.nvim`, cmd `Kubectl`, core.lua line 4) and ToggleTerm (`akinsho/toggleterm.nvim`, cmd `ToggleTerm`, core.lua line 16) are already installed — no new plugin enters the set. The old host config at `~/.config/nvim.old-20260927` is read-only reference only. Verified live facts reused here: kubectl v1.36.3, contexts `fleet` (current) and `devmesh`, korczewski frozen via `flux/clusters/fleet/ks-korczewski.yaml` (`suspend: true`, T002479), namespace `workspace` with live pods and services on fleet, and task targets `workspace:status`, `clusters:status`, `workspace:validate`.

Target files:

- `dotfiles/nvim/lua/config/infrastructure.lua` (NEW module exposing six infrastructure actions; .lua not S1-gated)
- `dotfiles/nvim/lua/config/dashboard.lua` (MODIFY: replace the infrastructure stub rows with the real chapter page, keep the Status link and the foundation sub-page untouched; .lua not S1-gated, so no numeric budget applies — stated in words on purpose and no numeric budget is claimed)

### Steps

1. Rebase onto latest `origin/main` before touching the shared `dashboard.lua`, then keep every other chapter block byte-identical (only the `infrastructure = {` block changes).
2. Inventory overlap: confirm kubectl.nvim covers the pods view (`:Kubectl`) and ToggleTerm covers terminal display (`:ToggleTerm`), so diagnosis needs no new picker or terminal plugin. Record the no-new-plugin finding as a code comment header in `infrastructure.lua`, alongside the deliberate keeps: Windows/WSL routing untouched (no hardcoded paths, kubectl resolved via inherited `PATH`), no OpenSpec integration, no format-on-save (zero `BufWritePre` autocmds), and no production mutations (apply, delete, scale, deploy are not offered — manual shell only).
3. Create `dotfiles/nvim/lua/config/infrastructure.lua` as a module returning `M` with in-memory state `M.state = { context = 'fleet', namespace = 'workspace' }` (no file writes) and six functions. Each function accepts the execution-time `cwd` argument for action-model compatibility; shell-outs run via `vim.system` with inherited environment so WSL `PATH` resolution keeps working. Every kubectl call guards a missing binary with a warning plus install hint instead of failing:
   - `M.cluster_status()` — read-only overview: `kubectl get nodes` and `kubectl config get-contexts` output into a scratch buffer.
   - `M.pods()` — open the kept kubectl.nvim view via `:Kubectl`, guarded by `pcall(require, 'kubectl')` with a retry hint when the lazy plugin is not loaded yet.
   - `M.services()` — read-only `kubectl get svc -n <state.namespace>` into a scratch buffer.
   - `M.pod_logs()` — list pods via `kubectl get pods -n <state.namespace> -o name`, let the operator pick one pod manually through `vim.ui.select`, then tail its logs in a kept ToggleTerm terminal. No automatic pod choice.
   - `M.context_select()` — choose the context from exactly `{ fleet, devmesh }` via `vim.ui.select` plus a namespace prompt; show the current selection first and switch only after explicit confirmation through `kubectl config use-context` (local kubeconfig only). Any korczewski namespace input is refused with a message pointing at the frozen Flux Kustomization (`suspend: true`, T002479) — no switch happens.
   - `M.setup_checklist()` — verify and report one line per check in a scratch buffer: kubectl on `PATH`, contexts `fleet` and `devmesh` reachable, the state namespace exists, and the kubectl.nvim plus ToggleTerm specs are present in `plugins/core.lua`.
   Quote all Ex-command paths with `fnameescape()`; pass pod and namespace values to `vim.system` as argv entries (no shell string), so no shell quoting layer is needed.
4. Modify `dotfiles/nvim/lua/config/dashboard.lua`: inside the `infrastructure = {` block only, replace the `stub_rows` rows with `action()` records in this exact order and naming: `cluster-status` (key `c`), `pods` (key `p`), `services` (key `v`), `pod-logs` (key `l`), `context-select` (key `x`), `setup-checklist` (key `k`). Each action's `effect` calls the matching `infrastructure.lua` function. Keep the `link('s', 'Status', 'infrastructure-status')` row as the last row and leave the `['infrastructure-status']` page block untouched. Mark the block with a `-- Infrastructure chapter page (T900664).` comment. Keep the CHAPTERS order, the `0`/`<BS>` navigation rows, the quit row, and the action-model shape (name, inputs, effect, cwd, on_error). No other page changes.
5. Prove headless behavior without network: stage the repo config to a temp dir; run a Lua probe with `package.path` at staged `lua/` requiring `config.infrastructure` and asserting all six functions plus `M.state` defaults exist; run headless `nvim --headless -u "$STAGE/init.lua" -i NONE` probes asserting the dashboard `infrastructure` page lists the six action names in order with the Status link last, and that invoking focus creates no side-effect marker while an explicit execute of `context_select` against a korczewski namespace input refuses without switching.
6. Stage exactly the two touched paths and commit (`dotfiles/` is gitignored, hence force-add):
   ```bash
   git add -f dotfiles/nvim/lua/config/infrastructure.lua dotfiles/nvim/lua/config/dashboard.lua
   git commit -m "feat(T900664): infrastructure chapter with kubectl actions [T900664]"
   ```

### Acceptance criteria

- `infrastructure.lua` exists with the six functions, in-memory fleet/workspace state, kubectl-missing guards, argv-style shell-outs, the korczewski refusal, and the no-new-plugin header comment.
- The dashboard `infrastructure` page lists exactly `cluster-status`, `pods`, `services`, `pod-logs`, `context-select`, `setup-checklist` in order with the Status link last; CHAPTERS order and navigation unchanged; the foundation `infrastructure-status` page unaltered; no other page altered.
- Headless probes pass for module shape, page order, focus-before-execute separation, and the korczewski refusal.
- Commit uses the exact subject above with explicit force-added pathspecs and touches no other file.
