---
page: comfyui-images
ticket: T900666
status: complete
actions:
  - status
  - queue
  - logs
  - start
  - use
  - troubleshoot
  - unload
  - stop
---

## Voraussetzungen

- Neovim v0.12.5 with the dashboard foundation (T900655) and the ComfyUI & Images page (T900666 p1+p2).
- **ToggleTerm** is in `plugins/core.lua` (T900655) — no new plugin needed. Check: `:ToggleTerm` opens a terminal.
- **curl** (8.5.0 verified on PATH) for the HTTP probes against the ComfyUI server: `curl --version` prints a version.
- ComfyUI reachable at `COMFY_HOST_IP:COMFY_PORT` (default port 8189, never 8188 — 8188 is refused with a warning, Janus WebSocket conflict per `environments/schema.yaml`). Default host 192.168.100.10 comes from `environments/mentolder.yaml`. Hand-check: `curl -sf "http://${COMFY_HOST_IP}:8189/system_stats" | head -c 200`.
- Start script `scripts/start-comfyui.sh` at the git root of the current buffer (starts `screen` sessions `comfyui` on port 8189 and `rigger` on port 8190; logs `~/comfyui.log` and `~/rigger.log`).
- The current buffer must sit inside a git repository: every action resolves its working directory at execution time via `config.gitroot.root()` (nil-guard: outside a repository a warning appears and nothing starts).
- No network needed beyond the ComfyUI host. Note on WSL/Windows: ComfyUI runs Windows-native per ADR-007 while the dashboard curls it over the mesh IP — the probes above work unchanged from either side as long as the mesh IP routes.
- No new plugin, no format-on-save, no hidden deployments: verified by the chapter scope guards (zero write-time autocommands).

## Geordnete Schritte

1. **status**: Open the page (Dashboard: `<leader>h`, chapter "ComfyUI & Images"). Focus has no side effect (focus-versus-execute: moving the cursor runs nothing; only Enter or the row key runs the action). Press `s`. The module fetches `GET /system_stats` plus queue counts and renders OS/Python/PyTorch versions, per-device VRAM totals/free, and running/pending counts in a ToggleTerm float. When the server is unreachable, a warning names host, port, and the curl probe to retry by hand.

2. **queue**: Press `e`. `GET /queue` is rendered read-only: the running job plus pending entries with prompt ids. An empty queue states so explicitly ("queue empty: nothing running, nothing pending"). Unreachable server or an unparsable reply degrades to a warning.

3. **logs**: Press `l`. Tails `~/comfyui.log` and `~/rigger.log` (`tail -n 100 -f`) in a ToggleTerm split. A missing file degrades to a warning naming the path; with both files missing nothing opens.

4. **start**: Press `a`. Runs `bash scripts/start-comfyui.sh` from the git root in a visible ToggleTerm so the operator watches both screen sessions (`comfyui`, `rigger`) come up; never backgrounded silently. A missing script warns with its path. Hand-check afterwards: `screen -ls` lists both sessions.

5. **use**: Press `u`. Opens the ComfyUI web UI (`http://host:8189`) via `vim.ui.open` and notifies the scripted path: the generate-3d pipeline entry in `components/website` (admin studio, API `pages/api/admin/generate-3d.ts`).

6. **troubleshoot**: Press `t`. Runs guided checks in order, each printing pass/fail into a read-only view: port is not 8188; screen sessions `comfyui`/`rigger` present (`screen -ls`); `GET /system_stats` answers; `POST .../rig?method=mixamo` answers 501 (expected — Blender/Rigify is the only rigging path); weights present (`~/ComfyUI/models/hunyuan3d/model.safetensors`).

7. **unload**: Press `n`. First checks `GET /queue` via the guard: while any job is running or pending — or while the queue is unreachable or unparsable (fail-closed) — the action refuses with a warning and shells out nothing beyond the guard probe. Otherwise it sends `POST /free` with `{"unload_models": true, "free_memory": true}` and notifies the outcome.

8. **stop**: Press `p`. Same guard as unload: refuses with a warning while jobs are active (or the queue state is unknown). Otherwise quits the `comfyui` and `rigger` screen sessions (`screen -S <name> -X quit`) and notifies the outcome.

Focus-versus-execution: navigating the page (moving the cursor) executes **nothing** ("focus-no-side-effect", verified by headless probe); only Enter or the row's letter starts the action.

## Erwartetes Ergebnis

- The "ComfyUI & Images" page shows exactly eight actions in this order: `status`, `queue`, `logs`, `start`, `use`, `troubleshoot`, `unload`, `stop`.
- `status`/`queue` render read-only views (system/VRAM/queue counts; running plus pending prompt ids); `logs` follows both log files; `start` shows both screen sessions coming up.
- `unload`/`stop` either refuse with the queue-guard warning (active jobs or unreachable queue) or confirm completion (`models unloaded via POST /free`; `screen sessions comfyui and rigger quit`).
- Headless load of the module (`require('config.comfyui-images')`) exits 0 and exposes all nine functions (`status`, `queue`, `logs`, `start`, `use`, `troubleshoot`, `has_active_jobs`, `unload`, `stop`) in that definition order.
- No write-time autocommands are created — nothing formats on save.

## Troubleshooting

- **Warning "server unreachable at host:port"**: ComfyUI is down or the mesh IP does not route. Retry the printed probe by hand: `curl -sf "http://${COMFY_HOST_IP}:8189/system_stats" | head -c 200`. If it answers, the dashboard env differs — check `:lua print(vim.env.COMFY_HOST_IP)`. If not, run `start` (step 4) on the GPU host side.
- **Warning "refusing port 8188"**: `COMFY_PORT=8188` collides with the Janus WebSocket (`environments/schema.yaml`). Unset `COMFY_PORT` (default 8189) or set it to 8189.
- **Missing screen sessions** (`troubleshoot` FAIL): run `start`, then `screen -ls` must list `comfyui` and `rigger`. Sessions started outside the start script (different names) are not seen — reattach with `screen -r <name>` to inspect.
- **Missing log files** (`logs` warns with the path): the services never wrote there — run `start` first, then check `~/comfyui.log` / `~/rigger.log` exist. Logs live where the screen sessions run.
- **mixamo probe answers 501**: expected behavior, not a failure — `method=mixamo` is deliberately unimplemented; Blender+Rigify is the only rigging path (`docs/runbooks/asset-gen-gpu-host.md`). Any other code (or no response) means the rigger on port 8190 is down.
- **Stale weights path** (`troubleshoot` FAIL on weights): `~/ComfyUI/models/hunyuan3d/model.safetensors` is absent — re-run the one-time setup `bash scripts/setup-comfyui.sh` on the GPU host (see `docs/runbooks/asset-gen-gpu-host.md`).
- **`unload`/`stop` refuse while the queue looks empty**: the guard is fail-closed — an unreachable or unparsable `/queue` counts as active. Check `status`/`queue` first; fix reachability, then retry.
- **Action never starts / "no project root"**: the buffer is outside any git checkout. Open a file inside the repository first.

## Recovery

- Nothing persistent is written except screen sessions: roll back with `screen -S comfyui -X quit` and `screen -S rigger -X quit` (or the `stop` action when the queue is empty).
- Remove the page = delete the module plus the registration block: `dotfiles/nvim/lua/config/comfyui-images.lua` and the `['comfyui-images']` entry in `dotfiles/nvim/lua/config/dashboard.lua` (the auto-stub takes over; the master-index row already reads `stub`).
- Full config rollback path from `dotfiles/nvim/README.md`: `mv ~/.config/nvim.old-20260927 ~/.config/nvim`, then restart Neovim.

## Quellen

- Stand 2026-09-28, T900666 scouting (no live GPU host reachable from the build machine; curl to 192.168.100.10:8189 refused).
- Repo-attested: `GET /system_stats`, screen sessions `comfyui`/`rigger`, ports 8189/8190, logs `~/comfyui.log`/`~/rigger.log`, mixamo-501 expectation (`docs/runbooks/asset-gen-gpu-host.md`); `POST /upload/image`, `POST /prompt`, `GET /history/{id}`, `GET /view` (`components/website/src/lib/comfy-client.ts`); start procedure (`scripts/start-comfyui.sh`); default host/port 192.168.100.10:8189 (`environments/mentolder.yaml`); 8188 refusal (`environments/schema.yaml`); Windows-native ComfyUI (ADR-007); scripted entry `pages/api/admin/generate-3d.ts` + `AssetGenerationStudio.svelte`.
- Upstream-attested (pinned, cited in the module header): `GET /queue` returns `{queue_running, queue_pending}` and `POST /free` with `{unload_models, free_memory}` unloads models — `server.py` @ 8d534945ebd5, lines 1067-1073 and 1195-1204. No unverified endpoint is stated as fact.
- No pre-existing stop script and no pre-existing unload/stop guard exist in the repo — the queue protection in `M.has_active_jobs()` is new and fail-closed.
