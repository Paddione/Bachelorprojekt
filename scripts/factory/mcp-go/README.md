# factory-mcp (Go)

Lightweight Streamable-HTTP MCP server for the Software Factory. Stdlib-only
Go implementation (successor of the legacy `scripts/factory/mcp-server.mjs`,
removed with T014936). Adds one extra tool over the classic surface:
`factory_ask` (LLM Q&A backed by the local LMStudio instance).
Queue truth (factory_status/factory_queue) comes exclusively from
`scripts/factory/queue.sh` — this server keeps no duplicate queue SQL [T014936].

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
| `FACTORY_LLM_URL` | `http://127.0.0.1:1919/v1` | OpenAI-compatible base URL (fallback when `route-provider.sh` fails) |
| `FACTORY_LLM_MODEL` | `Qwen3.8-27B-dualgpu` | chat-completions model (same fallback) |
| `FACTORY_LLM_API_KEY` | `lmstudio` | bearer token (FreeToken ignores it) |
| `OPENSPEC_SEARCH_URL` | `http://website.website.svc.cluster.local:4321` | OpenSpec API base |

## Model choice

The route normally comes from `scripts/factory/route-provider.sh`
(`tickets.provider_config`). The built-in fallback is the only local
generation backend: FreeToken-native on Windows (`:1919`, reached from WSL
via mirrored networking, one request at a time). The former llm-proxy
(`:18235`) is retired (T900208). The model is a reasoning model, so give
`max_tokens` generous headroom — a small budget returns empty `content`
(the tool falls back to the `reasoning_content` trace).

## Why Go

- One 6.7 MB static binary, no `node_modules` (~500 MB savings).
- Stdlib only — no MCP Go SDK dependency to drift on Go version bumps.
- Hand-rolled JSON-RPC 2.0 + MCP 2024-11-05 surface is ~200 lines and
  identical to the Node version on the wire.
