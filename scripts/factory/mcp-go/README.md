# factory-mcp (Go)

Lightweight Streamable-HTTP MCP server for the Software Factory. Stdlib-only
Go rewrite of `scripts/factory/mcp-server.mjs` with one new tool:
`factory_ask` (LLM Q&A backed by the local LMStudio instance).

## Build & run

```bash
# Build (auto-invoked by `task agents:factory-mcp:start` on first run):
go build -trimpath -ldflags='-s -w' -o bin/factory-mcp .

# Run directly:
./bin/factory-mcp
# → factory-mcp listening on 127.0.0.1:13003
```

The `.mcp.json` / `.opencode/opencode.jsonc` already point at
`http://localhost:13003/mcp`, so no MCP config edits are needed.

## Persistent service (recommended)

`task agents:factory-mcp:start` launches a detached `nohup` process that
does not survive logout or a crash. For a durable install (autostart +
`Restart=always` via a systemd USER unit):

```bash
task agents:factory-mcp:install     # symlinks factory-mcp.service, enable --now
task agents:factory-mcp:service-status
task agents:factory-mcp:uninstall
```

Requires `loginctl enable-linger $USER` for the service to start without an
active login session (e.g. after a host reboot).

## Tools

| Name | Kind | Notes |
|------|------|-------|
| `factory_status` | deterministic | queue depth + tick lock |
| `factory_queue` | deterministic | tickets in `backlog` + `plan_staged` |
| `factory_enqueue` | deterministic | wraps `ticket.sh enqueue` |
| `factory_trigger` | deterministic | spawns `wakeup.sh` detached |
| `factory_recent` | deterministic | last N factory comments |
| `openspec_find_similar` | deterministic | GET `/api/openspec/search` |
| `factory_ask` | LLM-backed | Q&A via local model |

## Environment

| Var | Default | Purpose |
|-----|---------|---------|
| `FACTORY_REPO` | `/home/patrick/Bachelorprojekt` | repo root for shell tools |
| `FACTORY_MCP_PORT` | `13003` | listen port |
| `FACTORY_LLM_URL` | `http://192.168.100.10:1234/v1` | OpenAI-compatible base URL |
| `FACTORY_LLM_MODEL` | `hermes-3-llama-3.1-8b` | chat-completions model |
| `FACTORY_LLM_API_KEY` | `lmstudio` | bearer token (LMStudio ignores) |
| `OPENSPEC_SEARCH_URL` | `http://website.website.svc.cluster.local:4321` | OpenSpec API base |

## Model choice

Default is `hermes-3-llama-3.1-8b` (~3s per call, real content).
`qwen/qwen3.5-9b` is available on the same LMStudio instance but is a
reasoning model that often returns empty `content` and takes 60s+ per
call on this host. Override via `FACTORY_LLM_MODEL` if you specifically
want it (tool timeout is 90s, with a graceful fall-back to the
`reasoning_content` trace).

## Why Go

- One 6.7 MB static binary, no `node_modules` (~500 MB savings).
- Stdlib only — no MCP Go SDK dependency to drift on Go version bumps.
- Hand-rolled JSON-RPC 2.0 + MCP 2024-11-05 surface is ~200 lines and
  identical to the Node version on the wire.
