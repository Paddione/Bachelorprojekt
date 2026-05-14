# OpenClaw

Personal AI assistant gateway, running on the WSL host and using the local
Ollama instance on the GPU box (10.10.0.3) as its chat backend.

This directory only holds:

- `.env.example` — template for `~/.openclaw/.env`
- `README.md` — this file
- (no source — OpenClaw installs globally via npm)

The runtime state (`~/.openclaw/`) lives outside the repo and is never
committed.

## Bootstrap

```bash
task openclaw:backup     # mv ~/.openclaw → ~/.openclaw.bak.<date>
task openclaw:install    # npm install -g openclaw@latest
task openclaw:configure  # openclaw onboard --install-daemon + write ~/.openclaw/.env
task openclaw:start      # systemctl --user restart openclaw
task openclaw:status     # daemon health + curl /healthz
```

Open the OpenClaw web canvas in a browser (URL printed by `openclaw:status`)
and send a message. Watch the daemon log:

```bash
task openclaw:logs
```

## Rollback

```bash
task openclaw:restore
```

This stops + uninstalls OpenClaw, removes the fresh `~/.openclaw/`, and
moves the backup back into place.

## Configuration

`~/.openclaw/.env` is loaded by the daemon at startup. Edit + restart:

```bash
$EDITOR ~/.openclaw/.env
task openclaw:start
```

The default config points at Ollama on `10.10.0.3:11434/v1` with model
`qwen2.5:14b-instruct-q4_K_M`. To switch model, change `OPENAI_MODEL` to
any model `ollama list` shows on the GPU host.

## Why a separate Ollama URL (not llm-router)?

`llm-router` (LiteLLM proxy in-cluster) has no Ingress, so OpenClaw on
WSL can't reach it. Ollama on the GPU box is reachable directly via
`wg-mesh`. Using llm-router would require either an Ingress + auth or
running OpenClaw inside the cluster — both deferred to Phase 2.
