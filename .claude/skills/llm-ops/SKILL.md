---
name: llm-ops
description: LLM pipeline operations — GPU host bootstrap, model management, deploy/status/test of LLM gateway services (TEI, Ollama, LiteLLM router, ComfyUI, Rigger) across dev and fleet clusters.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# llm-ops

LLM infrastructure lifecycle across all three GPU host contexts:

| Context | GPU host IP | Services | Task prefix |
|---------|-------------|----------|-------------|
| WSL local dev | `10.10.0.3` (localhost) | Ollama (chat), LM Studio | `task openclaw:*` |
| Dev k3d cluster | `172.17.0.1` (Docker bridge) | TEI embed, Ollama via `k3d/llm-gpu.yaml` | `task llm:* ENV=dev` |
| Prod fleet | `192.168.100.10` (wg-mesh) | TEI embed/rerank, Ollama chat, ComfyUI, Rigger | `task llm:* ENV=mentolder\|korczewski` |

---

## Phase 1 — GPU Host Bootstrap

Run once per GPU host (Hetzner or local WSL GPU worker).

```bash
# SSH-driven bootstrap: Docker, NVIDIA Container Toolkit, Ollama, systemd units, ufw
bash scripts/llm-host-setup.sh

# Pull all 4 Ollama models + warm TEI HF cache
task llm:pull-models HOST=<wg-mesh-ip>
```

**Services installed on the GPU host:**

| Service | Port | Description |
|---------|------|-------------|
| Ollama | 11434 | Chat models (qwen2.5:14b, qwen2.5-coder:14b, qwen2.5vl:7b, llama3.2:3b) |
| TEI embed | 8081 | bge-m3 embeddings |
| TEI rerank | 8082 | Workspace reranker |
| LM Studio | 1234 | OpenAI-compatible chat (dev only) |

Systemd units: `scripts/llm/ollama.service`, `scripts/llm/tei-embed.service`, `scripts/llm/tei-rerank.service`

---

## Phase 2 — Deploy (`task llm:deploy`)

Deploys the Kubernetes-side LLM infrastructure (gateway Endpoints + LiteLLM router).

```bash
# Requires LLM_HOST_IP to be set in environments/<env>.yaml
task llm:deploy ENV=<env>

# After config changes to the router:
task llm:redeploy-router ENV=<env>
```

**What it deploys:**

| Manifest | Content |
|----------|---------|
| `k3d/llm-gpu.yaml` | Service + Endpoints: `llm-gateway-embed` → `${LLM_HOST_IP}:8081`, `llm-gateway-lmstudio` → `${LLM_HOST_IP}:1234` |
| `prod/llm-router.yaml` | LiteLLM router Deployment (`llm-router`) — routes `/v1/embeddings`, `/v1/rerank`, `/v1/chat/completions` |
| `prod/comfy-gpu.yaml` | Service + Endpoints: `comfy-gateway` → `${COMFY_HOST_IP}:${COMFY_PORT}` |
| `prod/rigger-gpu.yaml` | Service + Endpoints: `rigger-gateway` → `${RIGGER_HOST_IP}:8190` |
| `prod/patch-oauth2-proxy-comfy.yaml` | OAuth2 proxy patch for SSO-gated ComfyUI at `comfy.<domain>` |

**Env vars required in `environments/<env>.yaml`:**

| Var | Example (prod) | Example (dev) |
|-----|---------------|---------------|
| `LLM_HOST_IP` | `192.168.100.10` | `172.17.0.1` |
| `COMFY_HOST_IP` | `192.168.100.10` | — |
| `COMFY_PORT` | `8189` | — |
| `LLM_ENABLED` | `true` | `true` |
| `LLM_RERANK_ENABLED` | `true` | `false` |

---

## Phase 3 — Status (`task llm:status`)

```bash
task llm:status ENV=<env>
```

Checks:

1. **Router pod**: `kubectl get deploy llm-router -n <ns>` → Ready replicas
2. **Gateway Endpoints**: `kubectl get endpoints llm-gateway-embed -n <ns>` → Addresses match `LLM_HOST_IP`
3. **Model availability**: Queries each route inside the router pod
4. **GPU host reachable**: `kubectl exec deploy/llm-router -n <ns> -- curl -s http://${LLM_HOST_IP}:11434/api/tags`

---

## Phase 4 — Test (`task llm:test`)

```bash
task llm:test ENV=<env>
```

Runs smoke tests inside the `llm-router` pod against all four routes:

| Route | Model | Endpoint |
|-------|-------|----------|
| Embed (bge-m3) | `bge-m3` | `/v1/embeddings` |
| Embed (Voyage) | `voyage-multilingual-2` | `/v1/embeddings` |
| Rerank | `workspace-rerank` | `/v1/rerank` |
| Chat | `workspace-chat` | `/v1/chat/completions` |

Each test sends a minimal payload and expects a 200 response with valid JSON.

---

## Phase 5 — Logs (`task llm:logs`)

```bash
task llm:logs ENV=<env>
```

Tails `llm-router` logs. Useful for:
- Debugging 503/timeout responses (model not loaded, GPU OOM)
- Checking LiteLLM routing decisions
- Verifying model fallback chains

---

## Phase 6 — Model Management

```bash
# Pull models onto GPU host (all 4 Ollama models + warm HF cache)
task llm:pull-models HOST=<wg-mesh-ip>

# Individual model operations on the GPU host:
ssh <GPU_HOST> "ollama pull qwen2.5:14b-instruct-q4_K_M"
ssh <GPU_HOST> "ollama list"
ssh <GPU_HOST> "ollama rm <model>"

# TEI model cache (HF):
ssh <GPU_HOST> "docker exec tei-embed huggingface-cli download BAAI/bge-m3 --cache-dir /data/hf-cache"
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Router pod CrashLoopBackOff | `LLM_HOST_IP` unreachable or env var missing | Verify `kubectl get endpoints llm-gateway-embed` — IP must match `environments/<env>.yaml` |
| `/v1/embeddings` 503 | TEI not running or OOM on GPU | SSH to GPU host: `systemctl status tei-embed`; `nvidia-smi` for VRAM |
| `/v1/chat/completions` timeout | Ollama model not loaded or GPU busy | `ollama ps` on GPU host; `ollama logs` for errors |
| ComfyUI unreachable | `COMFY_HOST_IP` wrong or service not started | Verify `kubectl get endpoints comfy-gateway -n <ns>` |
| `LLM_HOST_IP` unset | Missing from environment config | Add to `environments/<env>.yaml` and re-register in `environments/schema.yaml` |
| `prod/llm-router.yaml` not found | File not in main checkout | Applied separately by `llm:deploy` task — verify the task completed without error |
| GPU OOM | Model too large for VRAM | `nvidia-smi` to check; reduce model size (`ollama pull <smaller-model>`) or restart Ollama |

---

## Related Skills

| Skill | Beziehung |
|-------|-----------|
| `host-node-networking` | Voraussetzung — WireGuard-Tunnel zum GPU-Worker |
| `cluster-deployment` | Voraussetzung — Cluster muss stehen |
| `secret-rotation` | Querschnitt — API-Keys für Voyage/DeepSeek |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
