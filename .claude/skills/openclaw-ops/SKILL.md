---
name: openclaw-ops
description: Use when bootstrapping, restarting, debugging, or resetting OpenClaw on the WSL host — the local AI gateway that talks directly to Ollama on the GPU box, bypassing llm-router entirely.
---

# openclaw-ops — OpenClaw Local AI Gateway

## Overview

OpenClaw (`openclaw/`, `Taskfile.openclaw.yml`) is a local AI gateway running on the **WSL host** (not in Kubernetes). It connects directly to Ollama on the GPU box at `10.10.0.3:11434/v1` using the OpenAI-compatible API.

**Why it bypasses llm-router:** `llm-router` has no Ingress — there is no path from the WSL host or external clients to the in-cluster router. OpenClaw talks to Ollama directly over the `wg-mesh` VPN. Adding a router Ingress is Phase 2 work.

---

## Bootstrap (first-time setup)

```bash
task openclaw:install    # Install openclaw binary / service
task openclaw:configure  # Write config pointing at 10.10.0.3:11434/v1
```

---

## Daily Operations

```bash
task openclaw:start   # (Re)start the OpenClaw daemon
task openclaw:status  # Health probe — checks Ollama reachability + service state
task openclaw:logs    # journalctl tail for the openclaw service
```

---

## Backup / Restore / Wipe

```bash
task openclaw:backup          # Snapshot ~/.openclaw → timestamped archive
task openclaw:restore         # Restore from most recent snapshot
task openclaw:wipe CONFIRM=yes  # Destructive: wipes ~/.openclaw — requires explicit CONFIRM=yes
```

`wipe` requires `CONFIRM=yes` to prevent accidental data loss. Without it the task exits with an error.

---

## Connection Details

| Setting | Value |
|---|---|
| Ollama base URL | `http://10.10.0.3:11434/v1` |
| Access path | Direct over `wg-mesh` VPN |
| GPU host | RTX 5070 Ti, 16 GB VRAM |
| Models managed by | Ollama on the GPU box |

---

## Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| `openclaw:status` fails — connection refused | Ollama not running on GPU box | Check GPU host: `ssh gpu-box ollama ps` |
| `openclaw:status` fails — wg-mesh unreachable | WireGuard tunnel down | `wg show` on WSL host, check peer at 10.10.0.3 |
| Model swap takes 3-6s on first call | Ollama KEEP_ALIVE=5m evicts idle models | Expected — not a bug, models reload on demand |
| `openclaw:wipe` exits without wiping | Missing `CONFIRM=yes` | `task openclaw:wipe CONFIRM=yes` |
| Chat 503 from in-cluster code | llm-router down or GPU host unreachable | openclaw (WSL) is unaffected — only cluster services break; check `task mcp:logs -- chat` |

---

## Relationship to Cluster LLM Stack

```
WSL Host → OpenClaw → Ollama (10.10.0.3:11434/v1)   [this skill]

Cluster Pods → llm-router → {embed:8081, rerank:8082, chat:11434}   [cluster path]
```

The two paths are independent. Embedding collections in the cluster (`bge-m3`) fail closed if the GPU host is unreachable — openclaw is unaffected. The `MixedEmbeddingModelError` applies to cluster-side multi-collection queries only.
