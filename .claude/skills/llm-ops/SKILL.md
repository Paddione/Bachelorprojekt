---
name: llm-ops
description: LLM pipeline operations — GPU host bootstrap, model management, deploy/status/test of LLM gateway services (TEI embed, LM Studio chat) plus ComfyUI and Rigger across dev and fleet clusters.
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
| Dev k3d cluster | `172.17.0.1` (Docker bridge) | TEI embed, LM Studio via `k3d/llm-gpu.yaml` | `task llm:* ENV=dev` |
| Prod fleet | `192.168.100.10` (wg-mesh) | TEI embed, Windows LM Studio, ComfyUI, Rigger | `task llm:* ENV=mentolder\|korczewski` |

> **Architecture note (post-#895):** There is **no in-cluster LiteLLM router Deployment**. Apps call the in-cluster gateway Services directly:
> - `LLM_EMBED_URL` → `llm-gateway-embed` → TEI bge-m3 (`:8081` on the GPU host)
> - `LLM_ROUTER_URL` → `llm-gateway-lmstudio` → Windows LM Studio OpenAI-compatible (`:1234` on the GPU host)
> The earlier `prod/llm-router.yaml`, `llm-gateway-rerank`, and `llm-gateway-chat` Endpoints were removed in commit `04194edc` (PR #895). If you need a unified router for multi-model fan-out, that's a separate platform decision — do not reintroduce it without a plan.

---

## Phase 1 — GPU Host Bootstrap

Run once per GPU host (Hetzner or local WSL GPU worker).

```bash
# SSH-driven bootstrap: Docker, NVIDIA Container Toolkit, Ollama, systemd units, ufw
bash scripts/llm-host-setup.sh

# Pull all 4 Ollama models + warm TEI HF cache
task llm:pull-models HOST=<wg-mesh-ip>
```

**Services running on the GPU host:**

| Service | Port | Description |
|---------|------|-------------|
| Ollama | 11434 | Local chat models (qwen2.5:14b, qwen2.5-coder:14b, qwen2.5vl:7b, llama3.2:3b) — used by WSL dev only |
| TEI embed | 8081 | bge-m3 embeddings — exposed in-cluster as `llm-gateway-embed` |
| LM Studio | 1234 | Windows OpenAI-compatible chat — exposed in-cluster as `llm-gateway-lmstudio` (prod) |

Systemd units (GPU host): `scripts/llm/ollama.service`, `scripts/llm/tei-embed.service`.

> **Reranker:** The in-cluster `llm-gateway-rerank` Endpoint was removed in #895. `LLM_RERANK_ENABLED` stays `false`; do not enable it until a reranker Service is redeclared in `k3d/llm-gpu.yaml`.

---

## Phase 2 — Deploy (`task llm:deploy`)

Deploys the Kubernetes-side LLM infrastructure: two gateway Services + their Endpoints that bridge to GPU-host ports.

```bash
# Requires LLM_HOST_IP set in environments/<env>.yaml
task llm:deploy ENV=<env>
```

**What it deploys:**

| Manifest | Content |
|----------|---------|
| `k3d/llm-gpu.yaml` | `Service` + `Endpoints` for `llm-gateway-embed` (TEI bge-m3 → `${LLM_HOST_IP}:8081`) and `llm-gateway-lmstudio` (LM Studio → `${LLM_HOST_IP}:1234`) |
| `prod/comfy-gpu.yaml` | `Service` + `Endpoints` for `comfy-gateway` → `${COMFY_HOST_IP}:${COMFY_PORT}` |
| `prod/rigger-gpu.yaml` | `Service` + `Endpoints` for `rigger-gateway` → `${RIGGER_HOST_IP}:${RIGGER_PORT}` (default `:8190`) |
| `prod/patch-oauth2-proxy-comfy.yaml` | OAuth2-proxy patch for SSO-gated ComfyUI at `comfy.<domain>` |

> **Note:** `k3d/llm-gpu.yaml` lives under `k3d/` even on prod because the namespace is `workspace` (not `prod-fleet/<brand>/`). The file is generic — `envsubst` fills in `LLM_HOST_IP` per env. The legacy `prod/llm-gpu.yaml` and `prod/llm-router.yaml` are gone.

**Env vars required in `environments/<env>.yaml`:**

| Var | Example (prod) | Example (dev) | Notes |
|-----|----------------|---------------|-------|
| `LLM_HOST_IP` | `192.168.100.10` | `172.17.0.1` | Mesh IP of GPU host (TEI + LM Studio) |
| `LLM_ENABLED` | `true` | `true` | If false, embeddings go to Voyage directly (bypass) |
| `LLM_RERANK_ENABLED` | `false` | `false` | Keep `false` — reranker service not deployed |
| `LLM_ROUTER_URL` | `http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234` | (same) | Sealed into `website-secrets` |
| `LLM_EMBED_URL` | `http://llm-gateway-embed.workspace.svc.cluster.local:8081` | (same) | Namespace-aware (`workspace` vs `workspace-korczewski`) |
| `LLM_ROUTER_API_KEY` | (sealed) | (sealed) | Sealed into `website-secrets` for Windows LM Studio auth |
| `COMFY_HOST_IP` | `192.168.100.10` | — | Empty disables 3D generation |
| `COMFY_PORT` | `8189` | — | Must NOT be 8188 (Janus WS conflict) |
| `RIGGER_HOST_IP` | `192.168.100.10` (defaults to `COMFY_HOST_IP`) | — | — |
| `RIGGER_PORT` | `8190` | — | — |

---

## Phase 3 — Status (`task llm:status`)

```bash
task llm:status ENV=<env>
```

Checks:

1. **Gateway Endpoints** resolve to `LLM_HOST_IP`:
   ```bash
   kubectl --context fleet -n <ns> get endpoints llm-gateway-embed llm-gateway-lmstudio
   ```
2. **TEI health** (cluster-side, via the Service):
   ```bash
   kubectl --context fleet -n <ns> exec <any-pod> -- \
     curl -fsS http://llm-gateway-embed.${NS}.svc.cluster.local:8081/health
   ```
3. **LM Studio health** (cluster-side):
   ```bash
   kubectl --context fleet -n <ns> exec <any-pod> -- \
     curl -fsS http://llm-gateway-lmstudio.${NS}.svc.cluster.local:1234/v1/models
   ```
4. **GPU host reachable** (from a debug pod):
   ```bash
   kubectl --context fleet -n <ns> exec <any-pod> -- \
     curl -s http://${LLM_HOST_IP}:8081/health
   kubectl --context fleet -n <ns> exec <any-pod> -- \
     curl -s http://${LLM_HOST_IP}:1234/v1/models
   ```

---

## Phase 4 — Test (`task llm:test`)

```bash
task llm:test ENV=<env>
```

Runs smoke tests by curling the gateway Services directly from a debug pod in the target namespace. No router pod is involved:

| Route | Gateway Service | Model | Endpoint |
|-------|-----------------|-------|----------|
| Embed (bge-m3) | `llm-gateway-embed` | `bge-m3` | `/v1/embeddings` |
| Embed (Voyage) | direct (bypasses cluster) | `voyage-multilingual-2` | `<VOYAGE_API_URL>/v1/embeddings` |
| Chat | `llm-gateway-lmstudio` | (Windows LM Studio model) | `/v1/chat/completions` |

Each test sends a minimal payload and expects a 200 response with valid JSON. The chat test passes the `LLM_ROUTER_API_KEY` as `Authorization: Bearer …`.

> **Rerank test removed** — no in-cluster reranker service. Reranking is a future-work item.

---

## Phase 5 — Logs

There is no router Deployment to tail. Use these instead:

```bash
# GPU host logs (LLM-side errors, OOM, model load):
ssh <GPU_HOST> "docker logs tei-embed --tail 200"
ssh <GPU_HOST> "ollama logs"            # if LM Studio not on Windows

# Windows LM Studio: check the LM Studio UI / log file at:
#   %USERPROFILE%\.cache\lm-studio\logs\
# or use the LM Studio REST API to verify it's still serving.

# K8s events for the gateway Services:
kubectl --context fleet -n <ns> get events --field-selector involvedObject.name=llm-gateway-embed
kubectl --context fleet -n <ns> get events --field-selector involvedObject.name=llm-gateway-lmstudio
```

---

## Phase 6 — Model Management

```bash
# Pull Ollama models onto GPU host (dev/WSL only — prod uses Windows LM Studio)
task llm:pull-models HOST=<wg-mesh-ip>

# Individual model operations on the GPU host:
ssh <GPU_HOST> "ollama pull qwen2.5:14b-instruct-q4_K_M"
ssh <GPU_HOST> "ollama list"
ssh <GPU_HOST> "ollama rm <model>"

# TEI model cache (HF):
ssh <GPU_HOST> "docker exec tei-embed huggingface-cli download BAAI/bge-m3 --cache-dir /data/hf-cache"
```

For Windows LM Studio (prod), manage models via the LM Studio UI or its REST API — there is no `ollama` CLI on the prod chat backend.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Gateway Endpoints empty | `LLM_HOST_IP` missing/wrong | Verify `kubectl get endpoints llm-gateway-embed` shows `LLM_HOST_IP`; fix in `environments/<env>.yaml` |
| `/v1/embeddings` 503 | TEI down on GPU host | `ssh <GPU_HOST> docker ps` (tei-embed running?); `nvidia-smi` (VRAM); `docker logs tei-embed` |
| `/v1/chat/completions` 401/timeout | LM Studio down or API key wrong | Check Windows LM Studio UI; verify `LLM_ROUTER_API_KEY` in `website-secrets` matches the LM Studio-issued key |
| `/v1/chat/completions` 404 | Model not loaded in LM Studio | Open the LM Studio UI on the Windows host and load the model |
| ComfyUI unreachable | `COMFY_HOST_IP`/`COMFY_PORT` wrong | `kubectl get endpoints comfy-gateway -n <ns>`; must NOT be 8188 |
| Rigger unreachable | `RIGGER_HOST_IP`/`RIGGER_PORT` wrong | Same — defaults to `COMFY_HOST_IP:8190` |
| `LLM_HOST_IP` unset | Missing from environment config | Add to `environments/<env>.yaml` and re-register in `environments/schema.yaml` |
| App bypasses cluster and calls Voyage despite `LLM_ENABLED=true` | Wrong `LLM_ROUTER_URL`/`LLM_EMBED_URL` | Re-seal with `task env:seal ENV=<env>` after fixing the values |
| Rerank calls fail | `llm-gateway-rerank` Endpoint does not exist | Expected — keep `LLM_RERANK_ENABLED=false` until a reranker is redeclared |
| GPU OOM | Model too large for VRAM | `nvidia-smi` to check; reduce model size or restart TEI container |

---

## Related Skills

| Skill | Beziehung |
|-------|-----------|
| `host-node-networking` | Voraussetzung — WireGuard-Tunnel zum GPU-Worker |
| `cluster-deployment` | Voraussetzung — Cluster muss stehen |
| `secret-rotation` | Querschnitt — API-Keys für Voyage/DeepSeek/LM Studio |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
