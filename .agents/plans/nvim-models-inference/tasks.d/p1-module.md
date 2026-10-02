## Task 1: Models and Inference chapter module

Context. This partial creates the chapter module for ticket T900663 (page id `models-inference`). It owns exactly one new file, creates no other file, and depends on no other partial. The module exposes six action functions in fixed EPIC dashboard order plus small private helpers; the dashboard registration (p2) and the runbook (p3) build on these exact names, so they are the contract of this partial: `status`, `show_config`, `logs`, `gpu`, `start_unit`, `stop_unit`.

Live facts verified 2026-09-28 on the dev host (the executor re-verifies each one in step 1 before writing code): `llama-server` lives at `/home/patrick/opt/llama-current/bin/llama-server` (version 0.5.0-dev build 747, commit e85e15cf6); systemd user unit `qwen38-gsq-iq2s` is active and serves model `Qwen3.8-27B-gsq-iq2s` on `127.0.0.1:1919` (bind `0.0.0.0:1919`, pid 326503 at probe time); unit `qwen35-mtp` is active and serves `Qwen3.5-4B-MTP` on `127.0.0.1:1920`; LM Studio answers on `127.0.0.1:1234` (process `llmster`) with models `qwen3.5-2b`, `qwen3.5-2b-agent2`, `text-embedding-nomic-embed-text-v1.5` plus two hash ids; llm-proxy answers on `127.0.0.1:18235` (devmesh forward per `scripts/mcp-gateway/devmesh-forward.service`) with an auth error body, which proves reachability but not usable access; unit `glimmer` is inactive even though its service file header claims the active `:1919` backend — the header is stale and the module must probe live state instead of trusting it; GPUs are RTX 3060 Ti (8192 MiB) and RTX 5070 Ti (16303 MiB) per `nvidia-smi -L`. FreeToken references were checked against the current setup and rejected: FreeToken is retired (T900363, skill `.agents/skills/freetoken-setup/SKILL.md` archived) and the `routing-check.sh` comment calling `:1919` FreeToken-native is stale — the module and runbook must not mention FreeToken as a live backend. Target Neovim is v0.12.5 at `/usr/local/bin/nvim`.

Target files (one NEW file):

- `dotfiles/nvim/lua/config/models-inference.lua` (models-inference.lua): chapter module returning `M` with the six public functions and private helpers; scope is about two hundred fifty lines.

### Steps

1. Re-verify every live fact from the Context paragraph with these exact probes from the worktree root, and record any drift in the commit message body:
   ```bash
   ls -la ~/opt/llama-current/bin/llama-server && ~/opt/llama-current/bin/llama-server --version | head -3
   systemctl --user is-active qwen38-gsq-iq2s qwen35-mtp glimmer ollama
   curl -s -m 5 http://127.0.0.1:1919/v1/models | head -c 300; echo
   curl -s -m 5 http://127.0.0.1:1920/v1/models | head -c 300; echo
   curl -s -m 5 http://127.0.0.1:1234/v1/models | head -c 300; echo
   curl -s -m 5 http://127.0.0.1:18235/v1/models | head -c 200; echo
   nvidia-smi --query-gpu=index,name,memory.used,memory.total --format=csv
   journalctl --user -u qwen38-gsq-iq2s --no-pager -n 2 | head -4
   ```
   If a unit name, port, or model id changed, the module constants in step 2 follow the live values, not the Context paragraph.
2. Create `dotfiles/nvim/lua/config/models-inference.lua` (models-inference.lua) with module constants `M.UNITS` (the two llama units plus their ports and model ids from step 1), `M.LMSTUDIO_URL`, and `M.PROXY_URL`, all as plain data at the top so a later drift fix touches one place. Every public function takes an optional `cwd` argument for dashboard-model consistency and resolves it at execution time via `require('config.gitroot').root()` with a WARN early-return when no git root resolves, mirroring `config/files-search.lua`; `show_config` uses the resolved root to locate the repo service files under `<root>/scripts/llm/`, the other five probes are host-local and keep the parameter for signature uniformity only.
3. Implement `M.status(cwd)`: probe each backend with a five-second `curl` of `/v1/models` plus `systemctl --user is-active` for the two units, then show one summary via `vim.notify` (one line per backend: name, active state, model ids or the failure reason). Implement `M.show_config(cwd)`: read the repo service file of the currently active unit from `<cwd>/scripts/llm/<unit>.service` and the matching `loadouts.json` entry, then display the effective flags (`-c`, `-ngl`, `-fa`, `-ctk`/`-ctv`, `-np`, draft settings) read-only in a scratch buffer. Implement `M.logs(cwd)`: open the active unit log with `journalctl --user -u <unit> -f -n 100` inside ToggleTerm (`akinsho/toggleterm.nvim`, already a kept plugin — no new plugin enters the set); when no unit is active, notify a WARN naming the checked units instead of opening an empty terminal.
4. Implement `M.gpu(cwd)`: run `nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv` and show the table via `vim.notify`; when `nvidia-smi` is absent, notify a WARN with the install hint. Implement `M.start_unit(cwd)` and `M.stop_unit(cwd)`: each asks which unit via `vim.ui.select` over the known units, then asks for an explicit typed confirmation via `vim.ui.input` (proceed only on exactly `yes`), then runs `systemctl --user start <unit>` or `systemctl --user stop <unit>` and reports the resulting `is-active` state. No auto-start, no auto-restart, no hidden state change: both functions only act after the two explicit answers.
5. Prove the module loads headless and exposes the contract, with zero `BufWritePre` autocmds (no format-on-save):
   ```bash
   STAGE="$(mktemp -d)/nvim" && mkdir -p "$STAGE" && cp -r dotfiles/nvim/. "$STAGE"/
   /usr/local/bin/nvim -l /dev/stdin "$STAGE" <<'LUA'
   local stage = arg[1]
   package.path = stage .. '/lua/?.lua;' .. package.path
   local ok, m = pcall(require, 'config.models-inference')
   assert(ok, 'LOAD FAILED config.models-inference')
   for _, fn in ipairs({ 'status', 'show_config', 'logs', 'gpu', 'start_unit', 'stop_unit' }) do
     assert(type(m[fn]) == 'function', 'missing function: ' .. fn)
   end
   local au = vim.api.nvim_get_autocmds({ event = 'BufWritePre' })
   assert(#au == 0, 'BufWritePre autocmds present')
   print('models-inference contract ok')
   LUA
   ```
   The probe must print `models-inference contract ok` and exit with code 0.
6. Run the scope guards from the worktree root:
   ```bash
   if grep -rniE "freetoken" dotfiles/nvim/lua/config/models-inference.lua; then exit 1; fi
   if grep -rnE "config\.(dashboard|opencode)" dotfiles/nvim/lua/config/models-inference.lua; then exit 1; fi
   grep -c "^function M\.\|^M\.[a-z_]* = function" dotfiles/nvim/lua/config/models-inference.lua
   ```
   The first two guards must print nothing (no retired-backend reference, no render-time dashboard require); the count confirms the six public functions plus helpers exist.
7. Commit the one file. `dotfiles/` is gitignored, so force-add the explicit path:
   ```bash
   git add -f dotfiles/nvim/lua/config/models-inference.lua
   git commit -m "feat(T900663): models-inference chapter module [T900663]"
   git ls-files dotfiles/nvim/lua/config/models-inference.lua
   ```
   The commit message keeps the required `feat(T900663): <subject> [T900663]` shape, and `git ls-files` must list the new file.

### Acceptance criteria

- `dotfiles/nvim/lua/config/models-inference.lua` (models-inference.lua) exists, returns `M`, and exposes exactly the six documented public functions with the optional-`cwd` execution-time contract.
- `status` probes `:1919`, `:1920`, `:1234` plus unit states and notifies one summary; `show_config` displays effective flags from the repo service files read-only; `logs` tails the active unit journal in ToggleTerm; `gpu` shows the `nvidia-smi` table; `start_unit` and `stop_unit` require select plus typed `yes` before any `systemctl` mutation.
- The headless probe prints `models-inference contract ok` with exit code 0 and zero `BufWritePre` autocmds.
- Both scope guards print nothing: no FreeToken reference and no dashboard require in the module.
- The implementation commit uses the `feat(T900663): <subject> [T900663]` shape and tracks exactly the one force-added file.
