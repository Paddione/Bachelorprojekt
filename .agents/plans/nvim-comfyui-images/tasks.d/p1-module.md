## Task p1: ComfyUI & Images chapter module

Context. This partial implements ticket T900666 for plan `nvim-comfyui-images`. It owns exactly one NEW module and touches no other file. Foundation (T900655) provides the dashboard shell, gitroot resolution, and the thirteen kept plugins (`plugins/core.lua`); no new plugin enters the set — overlap check: ToggleTerm covers terminal display, `curl` (8.5.0, verified on PATH) covers HTTP against the ComfyUI server, `vim.ui.open` covers browser handoff. Record this no-new-plugin finding as a code comment header in the module. Canonical facts verified live during scouting: start via `scripts/start-comfyui.sh` (screen sessions `comfyui` on port 8189 and `rigger` on port 8190, logs `~/comfyui.log` and `~/rigger.log`); health probe `curl -sf "http://${COMFY_HOST_IP}:8189/system_stats"`; repo-attested endpoints `/system_stats`, `/upload/image`, `/prompt`, `/history/{id}`, `/view`. The upstream endpoints `/queue` (GET) and `/free` (POST) are NOT attested in the repo and must be verified in step 1 before wiring. There is no existing stop script and no existing unload/stop guard in the repo — the queue protection is implemented new in this module, fail-closed. The dashboard must not integrate OpenSpec.

Target files:

- `dotfiles/nvim/lua/config/comfyui-images.lua` (NEW module exposing the eight chapter actions plus the queue guard; .lua not S1-gated)

### Steps

1. Verify the two unattested upstream endpoints before wiring them. Against a reachable ComfyUI server (or, when no GPU host is reachable, against the pinned upstream ComfyUI `server.py` source the executor fetches and cites by URL and commit) confirm: `GET /queue` returns running plus pending queue entries, and `POST /free` with a JSON body unloads models. Record the verification source (live response excerpt or upstream file and line range) as a code comment above the guard. When neither a live server nor the upstream source confirms an endpoint, wire the dependent action to a visible `vim.notify` degradation message instead of the unconfirmed call — never ship an unverified HTTP call silently.
2. Create `dotfiles/nvim/lua/config/comfyui-images.lua` as a module returning `M`. Resolve the server base URL at execution time from `COMFY_HOST_IP`/`COMFY_PORT` environment (defaults: host from `environments/<env>.yaml`, port `8189`; refuse port `8188` with a warning — Janus WebSocket conflict per `environments/schema.yaml`). Every function resolves `cwd` via `require('config.gitroot').root()` at execution time and returns early with a warning when root is nil. Quote all paths with `fnameescape()` and shell arguments with `shellescape()`. Expose exactly these functions in this order (dashboard and runbook names match):
   - `M.status()` — server reachability plus `GET /system_stats` rendered in a ToggleTerm float: queue counts, VRAM and system resource usage. Unreachable server yields a warning naming host, port, and the curl probe to retry by hand.
   - `M.queue()` — `GET /queue` rendered read-only: running job plus pending entries with prompt ids. Empty queue states so explicitly.
   - `M.logs()` — tails `~/comfyui.log` and `~/rigger.log` in a ToggleTerm split (missing file degrades to a warning naming the path).
   - `M.start()` — runs `bash scripts/start-comfyui.sh` from the git root in a visible ToggleTerm so the operator watches both screen sessions come up; never backgrounded silently.
   - `M.use()` — server access: opens the ComfyUI web UI (`http://host:8189`) via `vim.ui.open` and notifies the generate-3d pipeline entry (`components/website` admin studio) as the scripted path.
   - `M.troubleshoot()` — guided checks in order, each printing pass/fail: port is not 8188; screen sessions `comfyui`/`rigger` present (`screen -ls`); `GET /system_stats` answers; `POST .../rig?method=mixamo` answers 501 (expected — Blender/Rigify is the only rigging path); weights present (`~/ComfyUI/models/hunyuan3d/model.safetensors`).
   - `M.has_active_jobs()` — guard helper returning true when `GET /queue` shows any running or pending entry; returns true (fail-closed) when the server is unreachable or the response is unparsable, and notifies which case applied.
   - `M.unload()` — refuses with a warning when `M.has_active_jobs()` is true; otherwise `POST /free` to unload models and notifies the outcome.
   - `M.stop()` — refuses with a warning when `M.has_active_jobs()` is true; otherwise quits the `comfyui` and `rigger` screen sessions (`screen -S <name> -X quit`) and notifies the outcome.
3. Prove headless behavior without network: stage the repo config to a temp dir and run an `nvim -l` probe with `package.path` at staged `lua/` requiring `config.comfyui-images` and asserting all nine functions exist; run a second probe with `COMFY_HOST_IP` pointed at an unroutable address asserting `M.has_active_jobs()` returns true (fail-closed) and `M.unload()`/`M.stop()` refuse without shelling out (assert via a stubbed `vim.fn.system`/`os.execute` counter written to an output file).
4. Scope guards from the worktree root: the module references no OpenSpec path and no plugin outside the thirteen kept (`grep -rnE "openspec|lazy.*add|packadd" dotfiles/nvim/lua/config/comfyui-images.lua` prints nothing); it creates no `BufWritePre` autocmd (`grep -c BufWritePre` is 0).
5. Stage exactly the one touched path and commit:
   ```bash
   git add -f dotfiles/nvim/lua/config/comfyui-images.lua
   git commit -m "feat(T900666): comfyui images chapter module with queue guard [T900666]"
   ```

### Acceptance criteria

- `comfyui-images.lua` exists with the nine functions above, execution-time gitroot resolution, env-based base URL with the 8188 refusal, and escaped paths.
- `/queue` and `/free` are wired only with the step-1 verification source recorded in a code comment, or degrade visibly when unverifiable.
- `M.has_active_jobs()` is fail-closed (unreachable or unparsable counts as active) and both `M.unload()` and `M.stop()` refuse on active jobs.
- Headless probes pass for module shape and for the fail-closed guard without network.
- Both scope guards pass: no OpenSpec reference, no new plugin, zero format-on-save autocmds.
- Commit uses the exact subject above with the explicit force-added pathspec and touches no other file.
