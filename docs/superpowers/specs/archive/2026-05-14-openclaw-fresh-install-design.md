# OpenClaw Fresh Install — Design Spec

## Goal

Wipe the existing `~/.openclaw/` install (preserving as backup), install OpenClaw fresh via npm on the WSL host, and configure it to use the existing Ollama instance on the GPU host as its chat backend. No cluster changes, no GPU host changes, no llm-router changes.

## Non-Goals

- TRT-LLM stack, model migration, llm-router rewrite — out of scope
- Custom OpenClaw extension that runs Claude superpowers plans — Phase 2 / separate spec
- NC Talk, Telegram, Discord, or other external messenger channels — Phase 2
- New Ingress / TLS for llm-router

## Existing Stack (untouched)

- Ollama on GPU host: `http://10.10.0.3:11434` (OpenAI-compat at `/v1`), reachable from WSL via `wg-mesh`
- Models: `qwen2.5:14b-instruct-q4_K_M` (default chat), `qwen2.5-coder:14b`, `qwen2.5vl:7b`, `llama3.2:3b`
- `~/.openclaw/` from prior install: `agents/`, `identity/`, `credentials/`, `memory/`, `tasks/`, etc.

## Target State

```
WSL host (Patrick's machine, wg-mesh peer)

  npm install -g openclaw@latest             ← global install
  ~/.openclaw/                               ← fresh, created by `openclaw onboard`
  ~/.openclaw.bak.20260514/                  ← previous install (rollback safety)

  systemd --user: openclaw.service           ← installed by `openclaw onboard --install-daemon`
    reads ~/.openclaw/.env:
      OPENAI_BASE_URL=http://10.10.0.3:11434/v1
      OPENAI_API_KEY=ollama                  ← Ollama ignores key, just needs non-empty
      OPENAI_MODEL=qwen2.5:14b-instruct-q4_K_M
    channels: web/canvas only

GPU host (10.10.0.3) — UNCHANGED
  systemd: ollama.service :11434
```

## Files

### New

| Path | Purpose |
|---|---|
| `openclaw/.env.example` | Template (committed, no secrets) — `OPENAI_BASE_URL`, `OPENAI_MODEL`, etc. |
| `openclaw/README.md` | Bootstrap docs: install, onboard, configure, daemon control, rollback |
| `Taskfile.openclaw.yml` | Tasks: `openclaw:backup`, `openclaw:install`, `openclaw:configure`, `openclaw:start`, `openclaw:status`, `openclaw:logs`, `openclaw:restore` (rollback), `openclaw:wipe` |

### Modified

| Path | Change |
|---|---|
| `Taskfile.yml` | `includes:` add `openclaw: Taskfile.openclaw.yml` |
| `.gitignore` | Add `openclaw/.env` (sensitive — only `.env.example` is committed) |

### Untouched

- `k3d/llm-gpu.yaml`, `k3d/llm-router.yaml`, `scripts/llm-host-setup.sh`, `scripts/llm-pull-models.sh` — no changes
- All website / brett / coaching consumers — no changes (Ollama still serves `workspace-chat` via llm-router for them)

## Cutover Sequence

1. **Pre-flight**: `node --version` ≥ 22.16 (OpenClaw requires Node 22.16+ or 24); `curl http://10.10.0.3:11434/v1/models` returns 200 from WSL
2. **Backup**: `task openclaw:backup` → `mv ~/.openclaw ~/.openclaw.bak.20260514` (no-op if absent)
3. **Install**: `task openclaw:install` → `npm install -g openclaw@latest`
4. **Onboard (fresh)**: `task openclaw:configure` → runs `openclaw onboard --install-daemon` non-interactively, then writes `~/.openclaw/.env` from `openclaw/.env.example` with the Ollama URL and model
5. **Start**: `task openclaw:start` → `systemctl --user restart openclaw && systemctl --user status openclaw` (active)
6. **Smoke test**: `task openclaw:status` → daemon healthy + curl gateway `/healthz`
7. **End-to-end**: open OpenClaw web canvas in browser, send "hello in one word", verify response (visible in `journalctl --user -u openclaw` and Ollama logs on host: `ssh gpu-host journalctl -u ollama --since '1 min ago'`)

## Rollback

`task openclaw:restore`:
- `systemctl --user disable --now openclaw`
- `npm uninstall -g openclaw`
- `rm -rf ~/.openclaw`
- `mv ~/.openclaw.bak.20260514 ~/.openclaw` (if present)

Restores prior state in <30 s. Ollama is never touched, so cluster consumers (website, brett, coaching) are unaffected by anything in this spec, success or failure.

## Testing

| Test | Type | Pass criterion |
|---|---|---|
| Pre-flight curl `:11434/v1/models` | Smoke | 200 + Ollama model list |
| `task openclaw:status` | Smoke | systemd active + gateway responds |
| Manual web canvas roundtrip | E2E | Reply visible, chain visible in Ollama logs |

No new BATS tests added in Phase 1 — too thin to justify. Will be added in Phase 2 when there's an extension/skill surface to test.

## Risks & Open Items

- **`openclaw onboard` may be interactive even with `--install-daemon`**: if it prompts for OAuth/account setup, the configure task may need to be split into "install daemon" + "skip onboarding" + "write .env directly". Discover during execute; adjust plan if needed.
- **Ollama OpenAI-compat coverage**: OpenClaw may expect features Ollama's `/v1` endpoint doesn't implement (e.g., function-calling specifics). Fallback: switch `OPENAI_BASE_URL` to `http://llm-router.<svc>:4000/v1` after exposing it (Phase 2).
- **`~/.openclaw.bak.20260514/` is on the WSL ext4 disk** — single-disk, no replication. Acceptable: if WSL host dies, the prior install was also on it; backup is just a safety net for "I changed my mind in the next 30 minutes".

## Phase 2 Pointer

After Phase 1 daemon runs cleanly:
- Spec for OpenClaw extension that reads `docs/superpowers/plans/*.md` (the original "execute Claude's plans" goal)
- Channel expansion (NC Talk bot, Telegram)
- Multi-model routing via llm-router (workspace-chat / -code / -vision aliases)
