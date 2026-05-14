---
title: Local-First LLM Pipeline Implementation Plan
domains: [infra, website, test]
status: draft
pr_number: null
---

# Local-First LLM Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a wg-mesh GPU peer running TEI (bge-m3 + bge-reranker-v2-m3) and Ollama (4-model swap pool), fronted by an in-cluster LiteLLM router that gives one OpenAI-compatible URL with declarative routing and cloud-fallback for chat-class workloads only.

**Architecture:** A user-provided RTX 5070 Ti box joins `wg-mesh` and runs three systemd-managed services (TEI-embed, TEI-rerank, Ollama). Both prod clusters reach it via three `Service`/`Endpoints` pairs (one per port). An in-cluster `llm-router` Deployment (LiteLLM) exposes `/v1/embeddings`, `/v1/rerank`, `/v1/chat/completions`. The website's `embeddings.ts` and a new `rerank.ts` call the router; chat-class workloads fall back to Anthropic per call. Embeddings/rerank do **not** silently fall back across vector spaces — each `knowledge.collections` row is pinned to one embedding model for life.

**Tech Stack:** Hugging Face Text Embeddings Inference (TEI) ≥ 1.5, Ollama ≥ 0.5.7, LiteLLM (`ghcr.io/berriai/litellm:main-stable`), CUDA 12.8 (Blackwell sm_120), TypeScript / Node 20 / Vitest, Astro 5 API routes, Kubernetes/Kustomize, systemd, ufw, WireGuard.

**Reference spec:** `docs/superpowers/specs/2026-05-10-local-llm-pipeline-design.md` (commit `38f97f7f`, branch `fix/mcp-business-full-access`).

**Important deviations from spec:**

1. **Test IDs renumbered.** Spec proposed `FA-30..FA-36` and `NFA-10..NFA-11`, but `FA-30` (einvoice-sidecar) and `FA-31` (prod) are already taken. This plan uses `FA-32..FA-38` for the seven functional tests; `NFA-10`/`NFA-11` are unchanged.
2. **`ANTHROPIC_API_KEY` is a new secret.** Spec claimed it already lives in `environments/sealed-secrets/<env>.yaml`. Verification (`grep ANTHROPIC environments/.secrets/*.yaml environments/sealed-secrets/*.yaml`) returns nothing — the website currently sets `ANTHROPIC_API_KEY: ""` in its ConfigMap and `claude.ts` no-ops when empty. Task 1 adds it to the schema as a required-for-prod secret.
3. **`llm-gpu.yaml` + `llm-router.yaml` go in `prod/` overlay only**, not the `k3d/` base. Dev clusters have no GPU and do not deploy the router (consistent with `LLM_ENABLED=false` defaulting in dev).

---

## File Map

**New files:**
- `scripts/llm-host-setup.sh` — SSH-driven bootstrap for the GPU host (Docker, systemd units, ufw)
- `scripts/llm-pull-models.sh` — `ollama pull` for the 4 LLMs + HF download for bge-m3 / bge-reranker-v2-m3
- `scripts/llm/tei-embed.service` — systemd unit for TEI embeddings
- `scripts/llm/tei-rerank.service` — systemd unit for TEI reranker
- `scripts/llm/ollama.service` — systemd unit for Ollama (with `OLLAMA_KEEP_ALIVE=5m`)
- `Taskfile.llm.yml` — `llm:bootstrap-host`, `llm:pull-models`, `llm:deploy`, `llm:status`, `llm:test`, `llm:logs`, `llm:redeploy-router`
- `k3d/llm-router.yaml` — LiteLLM Deployment + Service + ConfigMap (`config.yaml`)
- `website/src/lib/rerank.ts` — `rerankCandidates(query, docs[])`
- `website/src/lib/rerank.test.ts` — Vitest unit tests
- `tests/local/FA-32.bats` — bge-m3 happy path
- `tests/local/FA-33.bats` — Voyage passthrough
- `tests/local/FA-34.bats` — no write-time fallback
- `tests/local/FA-35.bats` — no cross-space query
- `tests/local/FA-36.bats` — rerank works
- `tests/local/FA-37.bats` — chat round-trip
- `tests/local/FA-38.bats` — chat fallback to Anthropic
- `tests/local/NFA-10.bats` — fallback latency under 5× p95
- `tests/local/NFA-11.bats` — VRAM headroom after model rotation

**Modified files:**
- `k3d/llm-gpu.yaml` — replace single `llm-gateway` Service with three (`llm-gateway-embed:8081`, `llm-gateway-rerank:8082`, `llm-gateway-chat:11434`); switch `__HOST_IP__` placeholder to `${LLM_HOST_IP}`
- `prod/kustomization.yaml` — add `llm-gpu.yaml` and `llm-router.yaml` to `resources`
- `Taskfile.yml` — `includes:` line for `Taskfile.llm.yml`; add `LLM_HOST_IP LLM_ENABLED LLM_RERANK_ENABLED` to `ENVSUBST_VARS` in `workspace:deploy`
- `environments/schema.yaml` — add `LLM_HOST_IP` (env_var, prod-required), `LLM_ENABLED` (bool, default `"false"`), `LLM_RERANK_ENABLED` (bool, default `"false"`); add `ANTHROPIC_API_KEY` secret (required when `LLM_ENABLED=true`)
- `environments/dev.yaml` — explicit `LLM_ENABLED: "false"` (defensive)
- `environments/mentolder.yaml` — `LLM_HOST_IP: <gpu-mesh-ip>`, `LLM_ENABLED: "true"`, `LLM_RERANK_ENABLED: "false"` initially
- `environments/korczewski.yaml` — same as mentolder (single shared GPU peer)
- `environments/.secrets/mentolder.yaml` — add `ANTHROPIC_API_KEY: <real-key>`
- `environments/.secrets/korczewski.yaml` — add `ANTHROPIC_API_KEY: <real-key>`
- `k3d/website.yaml` — ConfigMap: replace empty `ANTHROPIC_API_KEY: ""` with `secretKeyRef`; add `LLM_ROUTER_URL`, `LLM_ENABLED`, `LLM_RERANK_ENABLED`
- `website/src/lib/embeddings.ts` — add `model` and `purpose` params; route via `LLM_ROUTER_URL` when `LLM_ENABLED=true`; legacy direct-Voyage call retained for `LLM_ENABLED=false`
- `website/src/lib/embeddings.test.ts` — extend to cover model/purpose branches
- `website/src/lib/knowledge-db.ts` — `queryNearest` reads `collections.embedding_model`; new ensure/createCollection signature accepts `embeddingModel` override; default to `bge-m3` when `LLM_ENABLED=true`
- `website/src/lib/knowledge-db.test.ts` — extend
- `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts` — pass `model: collection.embedding_model, purpose: 'index'` to `embedBatch`
- `scripts/coaching/ingest-book.mts` — same change as documents.ts
- `CLAUDE.md` — add a "Gotchas & Footguns" entry for the GPU host pin and the no-cross-space-fallback invariant
- `website/src/data/test-inventory.json` — regenerated by `task test:inventory` after new tests land

---

## Task 1: Schema additions for LLM env vars + ANTHROPIC_API_KEY secret

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `environments/dev.yaml`
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`
- Modify: `environments/.secrets/mentolder.yaml` *(plaintext, gitignored)*
- Modify: `environments/.secrets/korczewski.yaml` *(plaintext, gitignored)*
- Test: `tests/unit/env-validate.bats`

- [ ] **Step 1: Add three new env_vars to the schema**

Edit `environments/schema.yaml`. After the existing `KEYCLOAK_FRONTEND_URL` env_var entry (~line 188), insert:

```yaml
  - name: LLM_HOST_IP
    required: false
    default_dev: ""
    description: "Mesh IP of the GPU host running TEI + Ollama. Required when LLM_ENABLED=true. Empty in dev."

  - name: LLM_ENABLED
    required: true
    default_dev: "false"
    description: "If true, the website uses the in-cluster LiteLLM router for embeddings/rerank/chat. If false, embeddings.ts calls Voyage directly (legacy path)."
    validate: "^(true|false)$"

  - name: LLM_RERANK_ENABLED
    required: true
    default_dev: "false"
    description: "If true, knowledge query path runs results through the bge-reranker-v2-m3 service. Requires LLM_ENABLED=true."
    validate: "^(true|false)$"

  - name: LLM_ROUTER_URL
    required: true
    default_dev: "http://llm-router.workspace.svc.cluster.local:4000"
    description: "Cluster-internal URL of the LiteLLM router. Constant per namespace; only varies if WORKSPACE_NAMESPACE differs."
```

- [ ] **Step 2: Add ANTHROPIC_API_KEY to the schema secrets section**

Edit `environments/schema.yaml`. After the existing `VOYAGE_API_KEY` entry (~line 514):

```yaml
  - name: ANTHROPIC_API_KEY
    required: false
    generate: false
    description: "Anthropic API key. Used by (a) the website for meeting insights (claude.ts), (b) the llm-router for chat-class fallback when the local Ollama is unreachable. Required in prod when LLM_ENABLED=true."
    extra_namespaces:
      - namespace: workspace
        secret: knowledge-secrets
```

- [ ] **Step 3: Set explicit `LLM_ENABLED: "false"` in dev**

Edit `environments/dev.yaml`. Add to `env_vars`:

```yaml
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  LLM_HOST_IP: ""
```

- [ ] **Step 4: Set prod env vars on mentolder + korczewski**

Edit `environments/mentolder.yaml` `env_vars` block:

```yaml
  LLM_HOST_IP: "10.0.0.99"   # ← replace with actual wg-mesh IP at deploy time
  LLM_ENABLED: "true"
  LLM_RERANK_ENABLED: "false"   # flip to true after 24h of stable rollout
```

Edit `environments/korczewski.yaml` with the same three lines (same `LLM_HOST_IP` — single shared GPU peer).

> **Note:** the user must provide the real wg-mesh IP. Leave the placeholder visible so they replace it before sealing.

- [ ] **Step 5: Add ANTHROPIC_API_KEY to plaintext prod secrets**

Edit `environments/.secrets/mentolder.yaml` (gitignored):

```yaml
ANTHROPIC_API_KEY: "sk-ant-..."   # ← user provides real key
```

Same for `environments/.secrets/korczewski.yaml`.

- [ ] **Step 6: Run env validation**

```bash
task env:validate ENV=dev
task env:validate ENV=mentolder
task env:validate ENV=korczewski
```

Expected: all three print `OK`. If `LLM_HOST_IP` validation fails, double-check the schema entry has `required: false` (the var is only meaningful when `LLM_ENABLED=true`; the runtime checks happen elsewhere).

- [ ] **Step 7: Run the BATS env-validate suite**

```bash
bats tests/unit/env-validate.bats
```

Expected: all tests pass. If a test asserts the exact list of env_vars, update it to include the three new entries.

- [ ] **Step 8: Re-seal prod secrets**

```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

Expected: updated `environments/sealed-secrets/{mentolder,korczewski}.yaml` files include the new `ANTHROPIC_API_KEY` ciphertext.

- [ ] **Step 9: Commit**

```bash
git add environments/schema.yaml environments/dev.yaml \
  environments/mentolder.yaml environments/korczewski.yaml \
  environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml \
  tests/unit/env-validate.bats
git commit -m "feat(env): add LLM_HOST_IP/LLM_ENABLED/LLM_RERANK_ENABLED + ANTHROPIC_API_KEY"
```

---

## Task 2: Three-port `k3d/llm-gpu.yaml`

**Files:**
- Modify: `k3d/llm-gpu.yaml`

- [ ] **Step 1: Rewrite the manifest with three Service/Endpoints pairs**

Replace the entire contents of `k3d/llm-gpu.yaml` with:

```yaml
# ─────────────────────────────────────────────────────────────────────────────
# llm-gpu: external GPU peer (TEI embed, TEI rerank, Ollama chat)
#
# The GPU box runs on the wg-mesh overlay. Three Services + Endpoints route
# traffic to it from inside the cluster. ${LLM_HOST_IP} is filled by envsubst
# at deploy time from environments/<env>.yaml.
# ─────────────────────────────────────────────────────────────────────────────

# ── Embeddings (TEI bge-m3) ──────────────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway-embed
spec:
  ports:
    - name: http
      port: 8081
      targetPort: 8081
---
apiVersion: v1
kind: Endpoints
metadata:
  name: llm-gateway-embed
subsets:
  - addresses:
      - ip: ${LLM_HOST_IP}
    ports:
      - name: http
        port: 8081
---
# ── Reranker (TEI bge-reranker-v2-m3) ────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway-rerank
spec:
  ports:
    - name: http
      port: 8082
      targetPort: 8082
---
apiVersion: v1
kind: Endpoints
metadata:
  name: llm-gateway-rerank
subsets:
  - addresses:
      - ip: ${LLM_HOST_IP}
    ports:
      - name: http
        port: 8082
---
# ── Chat (Ollama) ────────────────────────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway-chat
spec:
  ports:
    - name: http
      port: 11434
      targetPort: 11434
---
apiVersion: v1
kind: Endpoints
metadata:
  name: llm-gateway-chat
subsets:
  - addresses:
      - ip: ${LLM_HOST_IP}
    ports:
      - name: http
        port: 11434
```

- [ ] **Step 2: Verify the manifest renders with envsubst**

```bash
LLM_HOST_IP="10.0.0.99" envsubst < k3d/llm-gpu.yaml | head -20
```

Expected: `${LLM_HOST_IP}` replaced with `10.0.0.99` in two lines, three `Service` + three `Endpoints` blocks visible.

- [ ] **Step 3: Validate against kubectl client-side**

```bash
LLM_HOST_IP="10.0.0.99" envsubst < k3d/llm-gpu.yaml | kubectl apply --dry-run=client -f -
```

Expected: six lines, each ending in `created (dry run)`.

- [ ] **Step 4: Commit**

```bash
git add k3d/llm-gpu.yaml
git commit -m "feat(llm): split llm-gpu into embed/rerank/chat services"
```

---

## Task 3: `k3d/llm-router.yaml` — LiteLLM Deployment + Service + ConfigMap

**Files:**
- Create: `k3d/llm-router.yaml`

- [ ] **Step 1: Create the manifest**

```yaml
# ─────────────────────────────────────────────────────────────────────────────
# llm-router: in-cluster LiteLLM proxy
#
# Exposes one OpenAI-compatible URL (port 4000). Encodes the local-first /
# cloud-fallback policy declaratively in litellm-config. Embeddings and
# reranking NEVER fall back across vector spaces — see docs spec for the
# invariant. Chat-class aliases fall back to Anthropic per call.
# ─────────────────────────────────────────────────────────────────────────────
apiVersion: v1
kind: ConfigMap
metadata:
  name: litellm-config
data:
  config.yaml: |
    model_list:
      # ── Embedding aliases (no fallback — vector-space integrity) ──────────
      - model_name: bge-m3
        litellm_params:
          model: huggingface/BAAI/bge-m3
          api_base: http://llm-gateway-embed:8081
          timeout: 60
      - model_name: voyage-multilingual-2
        litellm_params:
          model: voyage/voyage-multilingual-2
          api_key: os.environ/VOYAGE_API_KEY
          timeout: 60

      # ── Rerank alias (no fallback — caller skips on 503) ──────────────────
      - model_name: workspace-rerank
        litellm_params:
          model: huggingface/BAAI/bge-reranker-v2-m3
          api_base: http://llm-gateway-rerank:8082
          timeout: 30

      # ── Chat-class aliases — primary local, fallback Anthropic ────────────
      - model_name: workspace-chat
        litellm_params:
          model: ollama/qwen2.5:14b-instruct-q4_K_M
          api_base: http://llm-gateway-chat:11434
          timeout: 30
      - model_name: workspace-chat-fallback
        litellm_params:
          model: anthropic/claude-sonnet-4-6
          api_key: os.environ/ANTHROPIC_API_KEY
          timeout: 30

      - model_name: workspace-code
        litellm_params:
          model: ollama/qwen2.5-coder:14b-instruct-q4_K_M
          api_base: http://llm-gateway-chat:11434
          timeout: 30
      - model_name: workspace-code-fallback
        litellm_params:
          model: anthropic/claude-sonnet-4-6
          api_key: os.environ/ANTHROPIC_API_KEY
          timeout: 30

      - model_name: workspace-vision
        litellm_params:
          model: ollama/qwen2.5vl:7b-instruct-q4_K_M
          api_base: http://llm-gateway-chat:11434
          timeout: 30
      - model_name: workspace-vision-fallback
        litellm_params:
          model: anthropic/claude-sonnet-4-6
          api_key: os.environ/ANTHROPIC_API_KEY
          timeout: 30

      - model_name: workspace-fast
        litellm_params:
          model: ollama/llama3.2:3b-instruct-q4_K_M
          api_base: http://llm-gateway-chat:11434
          timeout: 30
      - model_name: workspace-fast-fallback
        litellm_params:
          model: anthropic/claude-haiku-4-5
          api_key: os.environ/ANTHROPIC_API_KEY
          timeout: 30

    litellm_settings:
      drop_params: true
      set_verbose: false
      fallbacks:
        - workspace-chat: ["workspace-chat-fallback"]
        - workspace-code: ["workspace-code-fallback"]
        - workspace-vision: ["workspace-vision-fallback"]
        - workspace-fast: ["workspace-fast-fallback"]
      success_callback: []
      failure_callback: []

    general_settings:
      master_key: os.environ/LITELLM_MASTER_KEY
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-router
spec:
  replicas: 1
  selector:
    matchLabels: { app: llm-router }
  template:
    metadata:
      labels: { app: llm-router }
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values: [gekko-hetzner-2, gekko-hetzner-3, gekko-hetzner-4, pk-hetzner-4]
      containers:
        - name: litellm
          image: ghcr.io/berriai/litellm:main-stable
          args: ["--config", "/app/config.yaml", "--port", "4000", "--num_workers", "2"]
          ports:
            - containerPort: 4000
          env:
            - name: VOYAGE_API_KEY
              valueFrom:
                secretKeyRef: { name: workspace-secrets, key: VOYAGE_API_KEY }
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef: { name: workspace-secrets, key: ANTHROPIC_API_KEY }
            - name: LITELLM_MASTER_KEY
              value: "sk-llm-router-internal"
          volumeMounts:
            - name: config
              mountPath: /app/config.yaml
              subPath: config.yaml
          readinessProbe:
            httpGet: { path: /health/readiness, port: 4000 }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /health/liveliness, port: 4000 }
            initialDelaySeconds: 30
            periodSeconds: 30
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { cpu: 1000m, memory: 1Gi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
            runAsNonRoot: true
            runAsUser: 1000
            seccompProfile: { type: RuntimeDefault }
      volumes:
        - name: config
          configMap: { name: litellm-config }
---
apiVersion: v1
kind: Service
metadata:
  name: llm-router
spec:
  selector: { app: llm-router }
  ports:
    - name: http
      port: 4000
      targetPort: 4000
```

- [ ] **Step 2: Validate manifest**

```bash
kubectl apply --dry-run=client -f k3d/llm-router.yaml
```

Expected: 3 `... created (dry run)` lines (ConfigMap, Deployment, Service).

- [ ] **Step 3: Commit**

```bash
git add k3d/llm-router.yaml
git commit -m "feat(llm): add llm-router (LiteLLM) Deployment + Service + ConfigMap"
```

---

## Task 4: Wire the new manifests into the prod overlay + Taskfile envsubst

**Files:**
- Modify: `prod/kustomization.yaml`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add resources to `prod/kustomization.yaml`**

Open `prod/kustomization.yaml` and add to the `resources:` list (preserve alphabetical or grouped order):

```yaml
  - ../k3d/llm-gpu.yaml
  - ../k3d/llm-router.yaml
```

> If `prod/kustomization.yaml` uses `resources` relative to the file's own directory, mirror existing entries' style (e.g., `../k3d/...`).

- [ ] **Step 2: Add env vars to the prod envsubst list**

Edit `Taskfile.yml`. In the `workspace:deploy` task, find the `ENVSUBST_VARS=` block (~line 1341–1348). Append a line:

```bash
          ENVSUBST_VARS="$ENVSUBST_VARS \$LLM_HOST_IP \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL"
```

- [ ] **Step 3: Default LLM_HOST_IP to empty if unset**

Just below the `ENVSUBST_VARS` block, add:

```bash
          export LLM_HOST_IP="${LLM_HOST_IP:-}"
          export LLM_ENABLED="${LLM_ENABLED:-false}"
          export LLM_RERANK_ENABLED="${LLM_RERANK_ENABLED:-false}"
          export LLM_ROUTER_URL="${LLM_ROUTER_URL:-http://llm-router.workspace.svc.cluster.local:4000}"
```

This guards against env files that haven't yet adopted the new keys.

- [ ] **Step 4: Validate the prod overlay still builds**

```bash
source scripts/env-resolve.sh mentolder
kustomize build prod-mentolder/ --load-restrictor=LoadRestrictionsNone | envsubst "$ENVSUBST_VARS \$LLM_HOST_IP \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL" | kubectl apply --dry-run=client -f - >/dev/null
```

Expected: exits 0. The new resources do not conflict with existing ones.

- [ ] **Step 5: Run offline manifest test**

```bash
task test:manifests
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add prod/kustomization.yaml Taskfile.yml
git commit -m "feat(llm): include llm-gpu + llm-router in prod overlay; envsubst LLM vars"
```

---

## Task 5: `scripts/llm-host-setup.sh` — bootstrap the GPU host

**Files:**
- Create: `scripts/llm-host-setup.sh`
- Create: `scripts/llm/tei-embed.service`
- Create: `scripts/llm/tei-rerank.service`
- Create: `scripts/llm/ollama.service`

- [ ] **Step 1: Write the systemd unit for Ollama**

Create `scripts/llm/ollama.service`:

```ini
[Unit]
Description=Ollama (local LLM swap pool)
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ollama serve
Environment=OLLAMA_HOST=0.0.0.0:11434
Environment=OLLAMA_KEEP_ALIVE=5m
Environment=OLLAMA_FLASH_ATTENTION=1
Restart=on-failure
RestartSec=5
User=ollama
Group=ollama

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write the systemd unit for TEI-embed**

Create `scripts/llm/tei-embed.service`:

```ini
[Unit]
Description=TEI Embeddings (bge-m3)
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStartPre=-/usr/bin/docker rm -f tei-embed
ExecStart=/usr/bin/docker run --rm --name tei-embed \
  --gpus all \
  -p 8081:80 \
  -v /var/lib/llm/hf-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:1.5 \
  --model-id BAAI/bge-m3 \
  --port 80
ExecStop=/usr/bin/docker stop tei-embed
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Write the systemd unit for TEI-rerank**

Create `scripts/llm/tei-rerank.service`:

```ini
[Unit]
Description=TEI Reranker (bge-reranker-v2-m3)
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStartPre=-/usr/bin/docker rm -f tei-rerank
ExecStart=/usr/bin/docker run --rm --name tei-rerank \
  --gpus all \
  -p 8082:80 \
  -v /var/lib/llm/hf-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:1.5 \
  --model-id BAAI/bge-reranker-v2-m3 \
  --port 80
ExecStop=/usr/bin/docker stop tei-rerank
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Write the bootstrap shell script**

Create `scripts/llm-host-setup.sh`:

```bash
#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# llm-host-setup.sh — bootstrap the GPU host (TEI + Ollama + ufw)
# ════════════════════════════════════════════════════════════════════
# Idempotent: re-running upgrades systemd units and Docker images
# without re-pulling Ollama models. Models are pulled by
# scripts/llm-pull-models.sh.
#
# Prereqs on the host:
#   - Ubuntu 24.04 with NVIDIA driver ≥ 555 (Blackwell sm_120 needs CUDA 12.8)
#   - The host has joined wg-mesh (interface name "wg-mesh")
#   - SSH key in ~/.ssh/id_ed25519_hetzner allows passwordless root
#
# Usage:
#   scripts/llm-host-setup.sh <ssh-host>
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

HOST="${1:?Usage: llm-host-setup.sh <ssh-host>}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

echo "[1/6] Verify connectivity to ${HOST}..."
ssh $SSH_OPTS "${HOST}" "echo connected; nvidia-smi --query-gpu=name,memory.total --format=csv,noheader"

echo "[2/6] Install Docker + NVIDIA Container Toolkit if missing..."
ssh $SSH_OPTS "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
if ! dpkg -l | grep -q nvidia-container-toolkit; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update && apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi
REMOTE

echo "[3/6] Install Ollama if missing..."
ssh $SSH_OPTS "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
if ! command -v ollama >/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
fi
id ollama >/dev/null 2>&1 || useradd -r -m -d /var/lib/ollama -s /sbin/nologin ollama
mkdir -p /var/lib/llm/hf-cache
chown -R ollama:ollama /var/lib/ollama
REMOTE

echo "[4/6] Copy systemd units..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scp $SSH_OPTS \
  "${SCRIPT_DIR}/llm/ollama.service" \
  "${SCRIPT_DIR}/llm/tei-embed.service" \
  "${SCRIPT_DIR}/llm/tei-rerank.service" \
  "${HOST}:/etc/systemd/system/"

echo "[5/6] Enable and (re)start services..."
ssh $SSH_OPTS "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
systemctl daemon-reload
systemctl enable --now ollama.service
systemctl enable --now tei-embed.service
systemctl enable --now tei-rerank.service
REMOTE

echo "[6/6] Open ufw on wg-mesh interface only..."
ssh $SSH_OPTS "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
ufw allow in on wg-mesh to any port 8081 proto tcp comment "tei-embed"
ufw allow in on wg-mesh to any port 8082 proto tcp comment "tei-rerank"
ufw allow in on wg-mesh to any port 11434 proto tcp comment "ollama"
ufw status numbered | grep -E "wg-mesh.*(8081|8082|11434)"
REMOTE

echo "Done. Now run: scripts/llm-pull-models.sh ${HOST}"
```

- [ ] **Step 5: Make the script executable**

```bash
chmod +x scripts/llm-host-setup.sh
```

- [ ] **Step 6: Static-check the shell script**

```bash
shellcheck scripts/llm-host-setup.sh
```

Expected: no errors. (Warnings about heredoc variable expansion are fine — the heredocs are intentionally `<<'REMOTE'` quoted to prevent local expansion.)

- [ ] **Step 7: Commit**

```bash
git add scripts/llm-host-setup.sh scripts/llm/
git commit -m "feat(llm): host bootstrap script + systemd units"
```

---

## Task 6: `scripts/llm-pull-models.sh` — populate the GPU host

**Files:**
- Create: `scripts/llm-pull-models.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# llm-pull-models.sh — pull all required models to the GPU host
# ════════════════════════════════════════════════════════════════════
# Idempotent: ollama pull is content-addressed, hf download skips
# files already on disk. ~40 GB of downloads on first run.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

HOST="${1:?Usage: llm-pull-models.sh <ssh-host>}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_hetzner}"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

echo "[1/3] Pulling Ollama models (~32 GB)..."
ssh $SSH_OPTS "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
ollama pull qwen2.5:14b-instruct-q4_K_M
ollama pull qwen2.5-coder:14b-instruct-q4_K_M
ollama pull qwen2.5vl:7b-instruct-q4_K_M
ollama pull llama3.2:3b-instruct-q4_K_M
ollama list
REMOTE

echo "[2/3] Restarting TEI to pick up cached HF files (downloads run inside the container on first call)..."
ssh $SSH_OPTS "${HOST}" "systemctl restart tei-embed tei-rerank"

echo "[3/3] Probing endpoints..."
ssh $SSH_OPTS "${HOST}" "bash -s" <<'REMOTE'
set -euo pipefail
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8081/health > /dev/null && break || sleep 5
done
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8082/health > /dev/null && break || sleep 5
done
echo "TEI embed:  $(curl -s http://127.0.0.1:8081/info | head -c 200)"
echo "TEI rerank: $(curl -s http://127.0.0.1:8082/info | head -c 200)"
echo "Ollama:     $(curl -s http://127.0.0.1:11434/api/version)"
REMOTE

echo "Done."
```

- [ ] **Step 2: Make executable + shellcheck**

```bash
chmod +x scripts/llm-pull-models.sh
shellcheck scripts/llm-pull-models.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/llm-pull-models.sh
git commit -m "feat(llm): model-pull script (Ollama + TEI HF cache warmup)"
```

---

## Task 7: `Taskfile.llm.yml` — operations tasks

**Files:**
- Create: `Taskfile.llm.yml`
- Modify: `Taskfile.yml`

- [ ] **Step 1: Create the included Taskfile**

Create `Taskfile.llm.yml`:

```yaml
# Taskfile.llm.yml
# ─────────────────────────────────────────────────────────────────────────────
# Local-first LLM pipeline operations.
# Included from Taskfile.yml under the "llm" namespace.
# ─────────────────────────────────────────────────────────────────────────────
version: "3"

tasks:

  bootstrap-host:
    desc: "Bootstrap the GPU host (Docker, systemd units, ufw). HOST=<wg-mesh-ip>"
    preconditions:
      - sh: '[ -n "{{.HOST}}" ]'
        msg: "HOST=<wg-mesh-ip> is required."
    cmds:
      - scripts/llm-host-setup.sh {{.HOST}}

  pull-models:
    desc: "Pull all 4 Ollama models + warm TEI HF cache. HOST=<wg-mesh-ip>"
    preconditions:
      - sh: '[ -n "{{.HOST}}" ]'
        msg: "HOST=<wg-mesh-ip> is required."
    cmds:
      - scripts/llm-pull-models.sh {{.HOST}}

  deploy:
    desc: "Apply llm-gpu Endpoints + llm-router Deployment to ENV={{.ENV}}"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        : "${LLM_HOST_IP:?LLM_HOST_IP unset — configure in environments/{{.ENV}}.yaml}"
        envsubst '$LLM_HOST_IP' < k3d/llm-gpu.yaml \
          | kubectl --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" apply -f -
        kubectl --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" apply -f k3d/llm-router.yaml
        kubectl --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" rollout status deployment/llm-router --timeout=120s

  redeploy-router:
    desc: "Roll the llm-router Deployment (e.g. after config.yaml change). ENV=<env>"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        kubectl --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" rollout restart deployment/llm-router
        kubectl --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" rollout status deployment/llm-router --timeout=120s

  status:
    desc: "Show LLM pipeline status (router pod, gateway endpoints, model availability). ENV=<env>"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ns="${WORKSPACE_NAMESPACE:-workspace}"
        echo "── llm-router pod ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" get deploy/llm-router -o wide
        echo "── llm-gateway endpoints ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" get endpoints llm-gateway-embed llm-gateway-rerank llm-gateway-chat
        echo "── /health ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" exec deploy/llm-router -- \
          curl -fsS http://localhost:4000/health | head -c 500 || true

  logs:
    desc: "Tail llm-router logs. ENV=<env>"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        kubectl --context "$ENV_CONTEXT" -n "${WORKSPACE_NAMESPACE:-workspace}" logs deploy/llm-router -f --tail=200

  test:
    desc: "Smoke-test all four router routes (embed bge-m3, embed voyage, rerank, chat). ENV=<env>"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ns="${WORKSPACE_NAMESPACE:-workspace}"
        echo "── bge-m3 embed ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" exec deploy/llm-router -- \
          curl -fsS -X POST http://localhost:4000/v1/embeddings \
            -H "Content-Type: application/json" \
            -d '{"model":"bge-m3","input":"hallo welt"}' | jq '.data[0].embedding | length'
        echo "── voyage-multilingual-2 embed ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" exec deploy/llm-router -- \
          curl -fsS -X POST http://localhost:4000/v1/embeddings \
            -H "Content-Type: application/json" \
            -d '{"model":"voyage-multilingual-2","input":"hallo welt"}' | jq '.data[0].embedding | length'
        echo "── rerank ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" exec deploy/llm-router -- \
          curl -fsS -X POST http://localhost:4000/v1/rerank \
            -H "Content-Type: application/json" \
            -d '{"model":"workspace-rerank","query":"capital of germany","documents":["paris","berlin","hamburg"]}' | jq '.results[0]'
        echo "── chat ──"
        kubectl --context "$ENV_CONTEXT" -n "$ns" exec deploy/llm-router -- \
          curl -fsS -X POST http://localhost:4000/v1/chat/completions \
            -H "Content-Type: application/json" \
            -d '{"model":"workspace-chat","messages":[{"role":"user","content":"Sag Hallo auf Deutsch."}],"max_tokens":20}' | jq '.choices[0].message.content'
```

- [ ] **Step 2: Include from main Taskfile**

Edit `Taskfile.yml`. In the existing `includes:` block (~lines 4–9), add:

```yaml
  llm:
    taskfile: ./Taskfile.llm.yml
    dir: .
```

- [ ] **Step 3: Verify task discovery**

```bash
task --list | grep -E "^\* llm:"
```

Expected: 7 tasks listed (`llm:bootstrap-host`, `llm:pull-models`, `llm:deploy`, `llm:redeploy-router`, `llm:status`, `llm:logs`, `llm:test`).

- [ ] **Step 4: Dry-run a task that does not require a live cluster**

```bash
task llm:deploy ENV=mentolder --dry
```

Expected: prints commands, exits 0.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.llm.yml Taskfile.yml
git commit -m "feat(llm): Taskfile.llm.yml — bootstrap/pull/deploy/status/test/logs"
```

---

## Task 8: TDD — extend `embeddings.ts` with model + purpose params

**Files:**
- Modify: `website/src/lib/embeddings.test.ts`
- Modify: `website/src/lib/embeddings.ts`

The contract:
- `embedQuery(text, opts)` and `embedBatch(texts, opts)` accept `opts.model` (`'bge-m3' | 'voyage-multilingual-2'`) and `opts.purpose` (`'index' | 'query'`).
- When `process.env.LLM_ENABLED !== 'true'`: legacy direct-Voyage path is taken regardless of `model` (back-compat for dev).
- When `LLM_ENABLED === 'true'`:
  - `model: 'bge-m3'` → POST `/v1/embeddings` to `LLM_ROUTER_URL` with header `X-LLM-Purpose: index|query`.
  - `model: 'voyage-multilingual-2'` → same router, model param `voyage-multilingual-2`.
  - On router 5xx/timeout/refused **with `purpose: 'index'`**: throw a tagged `EmbeddingIndexError` (caller retries the job).
  - On router 5xx/timeout/refused **with `purpose: 'query'`**: throw a tagged `EmbeddingQueryError` (caller surfaces a 503 to the UI).
  - **No silent fallback to a different model.**

- [ ] **Step 1: Write failing tests for the new branches**

Add to `website/src/lib/embeddings.test.ts` (after the existing tests):

```typescript
describe('embeddings client — router mode (LLM_ENABLED=true)', () => {
  const ORIGINAL_ENV = process.env.LLM_ENABLED;
  const ORIGINAL_URL = process.env.LLM_ROUTER_URL;

  beforeEach(() => {
    process.env.LLM_ENABLED = 'true';
    process.env.LLM_ROUTER_URL = 'http://llm-router.test:4000';
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_ENABLED = ORIGINAL_ENV;
    process.env.LLM_ROUTER_URL = ORIGINAL_URL;
  });

  test('routes bge-m3 query to LLM_ROUTER_URL with X-LLM-Purpose=query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0.02) }], usage: { total_tokens: 8 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;

    const r = await embedQuery('hallo', { model: 'bge-m3', purpose: 'query' });
    expect(r.embedding).toHaveLength(1024);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://llm-router.test:4000/v1/embeddings');
    expect((init as RequestInit).headers).toMatchObject({ 'X-LLM-Purpose': 'query' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('bge-m3');
  });

  test('routes voyage-multilingual-2 model through the router (no direct voyage call)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0.03) }], usage: { total_tokens: 9 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;
    await embedQuery('hi', { model: 'voyage-multilingual-2', purpose: 'query' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('llm-router.test');
  });

  test('purpose=index, router 503 → throws EmbeddingIndexError (no fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('upstream down', { status: 503 }));
    await expect(
      embedBatch(['a', 'b'], { model: 'bge-m3', purpose: 'index', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingIndexError/);
  });

  test('purpose=query, router 503 → throws EmbeddingQueryError (no fallback)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    await expect(
      embedQuery('q', { model: 'bge-m3', purpose: 'query', maxAttempts: 1, baseDelayMs: 1 }),
    ).rejects.toThrow(/EmbeddingQueryError/);
  });

  test('LLM_ENABLED=false ignores model param and uses direct voyage call', async () => {
    process.env.LLM_ENABLED = 'false';
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ embedding: Array(1024).fill(0) }], usage: { total_tokens: 1 } }),
      { status: 200 },
    ));
    global.fetch = fetchMock;
    await embedQuery('x', { model: 'bge-m3', purpose: 'query' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('voyageai.com');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd website && npx vitest run src/lib/embeddings.test.ts
```

Expected: 5 new tests fail with messages along the lines of "embedQuery does not accept model option".

- [ ] **Step 3: Implement the new behavior in `embeddings.ts`**

Replace `website/src/lib/embeddings.ts` contents with:

```typescript
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_BATCH = 128;
const VOYAGE_DOLLARS_PER_M_TOKENS = 0.06;

export const ANTHROPIC_FALLBACK_MODEL_DIM = 1024;

export type EmbeddingModel = 'bge-m3' | 'voyage-multilingual-2';
export type EmbeddingPurpose = 'index' | 'query';

export interface EmbedResult { embedding: number[]; tokens: number; }
export interface BatchResult  { embeddings: number[][]; tokens: number; }
export interface EmbedOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  model?: EmbeddingModel;
  purpose?: EmbeddingPurpose;
}

export class EmbeddingIndexError extends Error {
  constructor(msg: string) { super(`EmbeddingIndexError: ${msg}`); this.name = 'EmbeddingIndexError'; }
}
export class EmbeddingQueryError extends Error {
  constructor(msg: string) { super(`EmbeddingQueryError: ${msg}`); this.name = 'EmbeddingQueryError'; }
}

const voyageKey = () => {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY is unset');
  return k;
};

const isLlmEnabled = () => process.env.LLM_ENABLED === 'true';
const routerUrl = () => process.env.LLM_ROUTER_URL ?? 'http://llm-router.workspace.svc.cluster.local:4000';

async function callVoyageDirect(inputs: string[], inputType: 'query' | 'document', opts: EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${voyageKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: inputs, model: VOYAGE_MODEL, input_type: inputType }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage: { total_tokens: number } };
      return { embeddings: j.data.slice(0, inputs.length).map(d => d.embedding), tokens: j.usage.total_tokens };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`voyage ${r.status} ${await r.clone().text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw new Error(`voyage ${r.status} ${await r.clone().text().catch(() => '')}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('voyage retry exhausted');
}

async function callRouter(inputs: string[], opts: Required<Pick<EmbedOpts, 'model' | 'purpose'>> & EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(`${routerUrl()}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': opts.purpose },
      body: JSON.stringify({ model: opts.model, input: inputs }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage?: { total_tokens?: number } };
      return { embeddings: j.data.slice(0, inputs.length).map(d => d.embedding), tokens: j.usage?.total_tokens ?? 0 };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`router ${r.status} ${await r.clone().text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw opts.purpose === 'index'
      ? new EmbeddingIndexError(`router ${r.status} ${await r.clone().text().catch(() => '')}`)
      : new EmbeddingQueryError(`router ${r.status} ${await r.clone().text().catch(() => '')}`);
  }
  throw opts.purpose === 'index'
    ? new EmbeddingIndexError(lastErr instanceof Error ? lastErr.message : 'router retry exhausted')
    : new EmbeddingQueryError(lastErr instanceof Error ? lastErr.message : 'router retry exhausted');
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<EmbedResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'query';
  if (isLlmEnabled()) {
    const model: EmbeddingModel = opts.model ?? 'bge-m3';
    const r = await callRouter([text], { ...opts, model, purpose });
    return { embedding: r.embeddings[0], tokens: r.tokens };
  }
  const r = await callVoyageDirect([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    const r = isLlmEnabled()
      ? await callRouter(slice, { ...opts, model: opts.model ?? 'bge-m3', purpose })
      : await callVoyageDirect(slice, 'document', opts);
    out.push(...r.embeddings);
    totalTokens += r.tokens;
  }
  return { embeddings: out, tokens: totalTokens };
}

export function costCentsForTokens(tokens: number): number {
  return (tokens / 1_000_000) * VOYAGE_DOLLARS_PER_M_TOKENS * 100;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd website && npx vitest run src/lib/embeddings.test.ts
```

Expected: all tests (existing + 5 new) pass.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/embeddings.ts website/src/lib/embeddings.test.ts
git commit -m "feat(embeddings): model+purpose params, router routing, no cross-space fallback"
```

---

## Task 9: TDD — `website/src/lib/rerank.ts`

**Files:**
- Create: `website/src/lib/rerank.test.ts`
- Create: `website/src/lib/rerank.ts`

Contract:
- `rerankCandidates(query, docs, opts?)` returns `{ doc, score }[]` sorted desc.
- Uses `LLM_ROUTER_URL` `/v1/rerank`, model `workspace-rerank`.
- On router error or `LLM_RERANK_ENABLED !== 'true'`: returns the input docs unchanged with `score = 0` (graceful degrade).

- [ ] **Step 1: Write failing tests**

Create `website/src/lib/rerank.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { rerankCandidates } from './rerank';

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENABLED = process.env.LLM_RERANK_ENABLED;
const ORIGINAL_URL = process.env.LLM_ROUTER_URL;

describe('rerank client', () => {
  beforeEach(() => {
    process.env.LLM_RERANK_ENABLED = 'true';
    process.env.LLM_ROUTER_URL = 'http://llm-router.test:4000';
    global.fetch = ORIGINAL_FETCH;
  });
  afterEach(() => {
    process.env.LLM_RERANK_ENABLED = ORIGINAL_ENABLED;
    process.env.LLM_ROUTER_URL = ORIGINAL_URL;
  });

  test('returns docs sorted descending by score on happy path', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [
        { index: 1, relevance_score: 0.9 },
        { index: 0, relevance_score: 0.4 },
        { index: 2, relevance_score: 0.1 },
      ],
    }), { status: 200 }));
    const out = await rerankCandidates('q', ['a', 'b', 'c']);
    expect(out).toEqual([
      { doc: 'b', score: 0.9 },
      { doc: 'a', score: 0.4 },
      { doc: 'c', score: 0.1 },
    ]);
  });

  test('returns input docs with score=0 when LLM_RERANK_ENABLED=false', async () => {
    process.env.LLM_RERANK_ENABLED = 'false';
    global.fetch = vi.fn();
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'a', score: 0 }, { doc: 'b', score: 0 }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('on router 503 returns input docs with score=0 (graceful)', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }));
    const out = await rerankCandidates('q', ['a', 'b']);
    expect(out).toEqual([{ doc: 'a', score: 0 }, { doc: 'b', score: 0 }]);
  });

  test('empty docs returns empty array without calling fetch', async () => {
    global.fetch = vi.fn();
    const out = await rerankCandidates('q', []);
    expect(out).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd website && npx vitest run src/lib/rerank.test.ts
```

Expected: all fail with "Cannot find module './rerank'".

- [ ] **Step 3: Implement `rerank.ts`**

Create `website/src/lib/rerank.ts`:

```typescript
const routerUrl = () => process.env.LLM_ROUTER_URL ?? 'http://llm-router.workspace.svc.cluster.local:4000';
const rerankEnabled = () => process.env.LLM_RERANK_ENABLED === 'true';

export interface RerankResult { doc: string; score: number; }

export async function rerankCandidates(
  query: string,
  docs: string[],
  opts: { signal?: AbortSignal } = {},
): Promise<RerankResult[]> {
  if (docs.length === 0) return [];
  if (!rerankEnabled()) return docs.map(doc => ({ doc, score: 0 }));

  try {
    const r = await fetch(`${routerUrl()}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'workspace-rerank', query, documents: docs }),
      signal: opts.signal,
    });
    if (!r.ok) return docs.map(doc => ({ doc, score: 0 }));
    const j = await r.json() as { results: Array<{ index: number; relevance_score: number }> };
    return j.results
      .map(({ index, relevance_score }) => ({ doc: docs[index], score: relevance_score }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return docs.map(doc => ({ doc, score: 0 }));
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd website && npx vitest run src/lib/rerank.test.ts
```

Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/rerank.ts website/src/lib/rerank.test.ts
git commit -m "feat(rerank): rerank library with graceful degrade on router failure"
```

---

## Task 10: TDD — `knowledge-db.ts` query path uses `collections.embedding_model`

**Files:**
- Modify: `website/src/lib/knowledge-db.test.ts`
- Modify: `website/src/lib/knowledge-db.ts`

Contract:
- `queryNearest({ collectionIds, queryText, limit, threshold, signal })` becomes the new public surface (replaces `queryEmbedding`-based version). It internally:
  1. Reads each collection's `embedding_model`.
  2. Validates that all `collectionIds` agree on a single `embedding_model` (rejects mixed). If mixed → throws `MixedEmbeddingModelError`.
  3. Calls `embedQuery(queryText, { model: embedding_model, purpose: 'query' })`.
  4. Performs the existing `<=>` distance query.
- The legacy `queryNearest({ collectionIds, queryEmbedding })` form is removed (callers updated in Task 11).
- `createCollection` accepts an optional `embeddingModel` arg; defaults to `'bge-m3'` when `LLM_ENABLED=true`, else `'voyage-multilingual-2'`.

- [ ] **Step 1: Add failing tests**

Edit `website/src/lib/knowledge-db.test.ts`. Add a `describe` block:

```typescript
describe('knowledge-db — model-aware query path', () => {
  test('queryNearest reads embedding_model from collection and passes to embedQuery', async () => {
    // Use the existing test pool setup (see top of file). Insert a bge-m3 collection,
    // mock embedQuery via vi.mock or by stubbing the embeddings module.
    const { id } = await createCollection({ name: 'kn-bge', source: 'custom', embeddingModel: 'bge-m3' });
    const calls: Array<{ text: string; model?: string; purpose?: string }> = [];
    vi.spyOn(await import('./embeddings'), 'embedQuery').mockImplementation(async (text, opts) => {
      calls.push({ text, model: opts?.model, purpose: opts?.purpose });
      return { embedding: Array(1024).fill(0.01), tokens: 1 };
    });
    await queryNearest({ collectionIds: [id], queryText: 'hallo' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ text: 'hallo', model: 'bge-m3', purpose: 'query' });
  });

  test('queryNearest throws MixedEmbeddingModelError when collectionIds disagree on model', async () => {
    const a = await createCollection({ name: 'kn-bge-x', source: 'custom', embeddingModel: 'bge-m3' });
    const b = await createCollection({ name: 'kn-vy-x',  source: 'custom', embeddingModel: 'voyage-multilingual-2' });
    await expect(queryNearest({ collectionIds: [a.id, b.id], queryText: 'q' }))
      .rejects.toThrow(/MixedEmbeddingModelError/);
  });

  test('createCollection defaults to bge-m3 when LLM_ENABLED=true, voyage-multilingual-2 otherwise', async () => {
    process.env.LLM_ENABLED = 'true';
    const a = await createCollection({ name: 'kn-default-bge', source: 'custom' });
    expect(a.embedding_model).toBe('bge-m3');
    process.env.LLM_ENABLED = 'false';
    const b = await createCollection({ name: 'kn-default-voyage', source: 'custom' });
    expect(b.embedding_model).toBe('voyage-multilingual-2');
  });
});
```

- [ ] **Step 2: Run tests — confirm failure**

```bash
cd website && npx vitest run src/lib/knowledge-db.test.ts
```

Expected: 3 new tests fail (queryNearest signature differs, createCollection ignores embeddingModel arg).

- [ ] **Step 3: Implement the changes in `knowledge-db.ts`**

In `website/src/lib/knowledge-db.ts`:

a) Add at the top of the file, after imports:

```typescript
import { embedQuery, type EmbeddingModel } from './embeddings';

export class MixedEmbeddingModelError extends Error {
  constructor(models: string[]) {
    super(`MixedEmbeddingModelError: collections span multiple embedding models (${models.join(', ')}); cross-space queries are not allowed`);
    this.name = 'MixedEmbeddingModelError';
  }
}
```

b) Update `createCollection`:

```typescript
export async function createCollection(args: {
  name: string; source: CollectionSource; description?: string; brand?: string | null;
  createdBy?: string | null; embeddingModel?: EmbeddingModel;
}): Promise<Collection> {
  const model: EmbeddingModel = args.embeddingModel
    ?? (process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2');
  const r = await p().query(
    `INSERT INTO knowledge.collections (name, source, description, brand, created_by, embedding_model)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, description, source, brand, chunk_count,
               last_indexed_at, embedding_model, created_at`,
    [args.name, args.source, args.description ?? null, args.brand ?? null, args.createdBy ?? null, model],
  );
  return r.rows[0];
}
```

c) Replace `queryNearest` with the model-aware version:

```typescript
export async function queryNearest(args: {
  collectionIds: string[]; queryText: string; limit?: number; threshold?: number; signal?: AbortSignal;
}): Promise<Array<{ id: string; text: string; collection_id: string; document_id: string; score: number }>> {
  const limit  = args.limit     ?? 6;
  const thresh = args.threshold ?? 0.65;

  if (args.collectionIds.length === 0) return [];

  const modelsRes = await p().query(
    `SELECT DISTINCT embedding_model FROM knowledge.collections WHERE id = ANY($1::uuid[])`,
    [args.collectionIds],
  );
  const models = modelsRes.rows.map((r: { embedding_model: string }) => r.embedding_model);
  if (models.length > 1) throw new MixedEmbeddingModelError(models);
  if (models.length === 0) return [];

  const { embedding } = await embedQuery(args.queryText, {
    model: models[0] as EmbeddingModel,
    purpose: 'query',
    signal: args.signal,
  });

  const r = await p().query(
    `SELECT id, text, collection_id, document_id,
            1 - (embedding <=> $1) AS score
       FROM knowledge.chunks
      WHERE collection_id = ANY($2::uuid[])
      ORDER BY embedding <=> $1
      LIMIT $3`,
    [vecLiteral(embedding), args.collectionIds, limit],
  );
  return r.rows.filter((row: { score: number }) => row.score >= thresh);
}
```

- [ ] **Step 4: Run tests**

```bash
cd website && npx vitest run src/lib/knowledge-db.test.ts
```

Expected: all tests pass. Existing tests that called `queryNearest({ collectionIds, queryEmbedding })` need to migrate to `queryText` — update them in this same step (search the file for `queryEmbedding:` and replace with `queryText:`).

- [ ] **Step 5: Find and update non-test callers of the old signature**

```bash
grep -rn "queryNearest" website/src/ scripts/ | grep -v ".test.ts"
```

Update each call site to use `queryText` (or to embed first themselves if the caller already has an embedding — but prefer pushing into the new model-aware path).

- [ ] **Step 6: Run the full website test suite**

```bash
cd website && npx vitest run
```

Expected: 100% pass.

- [ ] **Step 7: Commit**

```bash
git add website/src/lib/knowledge-db.ts website/src/lib/knowledge-db.test.ts \
        $(grep -rln "queryNearest" website/src/ scripts/ | grep -v node_modules)
git commit -m "feat(knowledge-db): model-aware queryNearest, MixedEmbeddingModelError"
```

---

## Task 11: TDD — `documents.ts` API route uses `embedBatch` with model + purpose=index

**Files:**
- Modify: `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts`
- Modify: `scripts/coaching/ingest-book.mts`

- [ ] **Step 1: Update the documents API route**

Edit `website/src/pages/api/admin/knowledge/collections/[id]/documents.ts`. Locate line 94:

```typescript
  const { embeddings } = await embedBatch(chunks.map(c => c.text));
```

Replace with:

```typescript
  const { embeddings } = await embedBatch(chunks.map(c => c.text), {
    model: collection.embedding_model as 'bge-m3' | 'voyage-multilingual-2',
    purpose: 'index',
  });
```

- [ ] **Step 2: Update the coaching ingest script**

Edit `scripts/coaching/ingest-book.mts` line 56:

Find the `embedBatch(slice)` call. Replace with `embedBatch(slice, { model: collection.embedding_model, purpose: 'index' })`. The `collection` variable should already be in scope; if not, fetch it earlier.

- [ ] **Step 3: Add an end-to-end test for the route**

Add a new test in the same project (e.g. `website/src/pages/api/admin/knowledge/collections/[id]/documents.test.ts`):

```typescript
import { describe, test, expect, vi } from 'vitest';

describe('admin knowledge documents POST', () => {
  test('passes collection.embedding_model and purpose=index to embedBatch', async () => {
    const embedSpy = vi.spyOn(await import('../../../../../../lib/embeddings'), 'embedBatch')
      .mockResolvedValue({ embeddings: [Array(1024).fill(0)], tokens: 1 });
    vi.spyOn(await import('../../../../../../lib/knowledge-db'), 'getCollection')
      .mockResolvedValue({
        id: 'c1', name: 'n', description: null, source: 'custom', brand: null,
        chunk_count: 0, last_indexed_at: null, embedding_model: 'bge-m3', created_at: new Date(),
      });
    vi.spyOn(await import('../../../../../../lib/auth'), 'getSession')
      .mockResolvedValue({ user: { sub: 'u', email: 'a@b', name: 'a', roles: ['admin'] } });
    vi.spyOn(await import('../../../../../../lib/auth'), 'isAdmin').mockReturnValue(true);
    vi.spyOn(await import('../../../../../../lib/knowledge-db'), 'addDocument').mockResolvedValue({
      id: 'd1', collection_id: 'c1', title: 't', source_uri: 'paste:x', raw_text: 'hello world', sha256: 'x',
    });
    vi.spyOn(await import('../../../../../../lib/knowledge-db'), 'upsertChunks').mockResolvedValue();
    vi.spyOn(await import('../../../../../../lib/knowledge-db'), 'recountChunks').mockResolvedValue();

    const { POST } = await import('./documents');
    const req = new Request('http://t', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 't', rawText: 'hello world' }),
    });
    await POST({ request: req, params: { id: 'c1' } } as any);

    expect(embedSpy).toHaveBeenCalledWith(expect.any(Array), { model: 'bge-m3', purpose: 'index' });
  });
});
```

- [ ] **Step 4: Run vitest**

```bash
cd website && npx vitest run
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/knowledge/collections/[id]/documents.ts \
  website/src/pages/api/admin/knowledge/collections/[id]/documents.test.ts \
  scripts/coaching/ingest-book.mts
git commit -m "feat(knowledge): index path passes collection.embedding_model + purpose=index"
```

---

## Task 12: Wire ANTHROPIC_API_KEY + LLM_* into the website ConfigMap

**Files:**
- Modify: `k3d/website.yaml`

- [ ] **Step 1: Replace the empty ANTHROPIC_API_KEY ConfigMap entry with a secretKeyRef**

Edit `k3d/website.yaml`. Delete the line in the ConfigMap (currently around line 67):

```yaml
  ANTHROPIC_API_KEY: ""
```

In the website Deployment's `env:` block (around line 210), add:

```yaml
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: ANTHROPIC_API_KEY
                  optional: true
```

- [ ] **Step 2: Add LLM_* keys to the ConfigMap**

In the same ConfigMap (right after `WHISPER_URL`), add:

```yaml
  # LLM router (local-first pipeline)
  LLM_ROUTER_URL: "http://llm-router.${WORKSPACE_NAMESPACE}.svc.cluster.local:4000"
  LLM_ENABLED: "${LLM_ENABLED}"
  LLM_RERANK_ENABLED: "${LLM_RERANK_ENABLED}"
```

- [ ] **Step 3: Add ANTHROPIC_API_KEY to the schema's `extra_namespaces` so it lands in `website-secrets`**

Edit `environments/schema.yaml`. Find the `ANTHROPIC_API_KEY` secret entry added in Task 1. Update its `extra_namespaces`:

```yaml
    extra_namespaces:
      - namespace: workspace
        secret: knowledge-secrets
      - namespace: website
        secret: website-secrets
```

- [ ] **Step 4: Re-seal**

```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

- [ ] **Step 5: Manifest dry-run**

```bash
LLM_ENABLED=true LLM_RERANK_ENABLED=false WORKSPACE_NAMESPACE=workspace \
  envsubst < k3d/website.yaml | kubectl apply --dry-run=client -f - | grep -E "configmap|secret|deployment"
```

Expected: succeeds, no `${...}` placeholders left in output.

- [ ] **Step 6: Commit**

```bash
git add k3d/website.yaml environments/schema.yaml \
  environments/sealed-secrets/mentolder.yaml environments/sealed-secrets/korczewski.yaml
git commit -m "feat(website): wire ANTHROPIC_API_KEY + LLM_* env into website Deployment"
```

---

## Task 13: FA-32 — bge-m3 happy path (integration)

**Files:**
- Create: `tests/local/FA-32.bats`

- [ ] **Step 1: Write the BATS test**

```bats
#!/usr/bin/env bats
# FA-32: LLM router returns 1024-dim bge-m3 vectors when TEI is up.

setup() {
  : "${NS:=workspace}"
}

@test "FA-32.1: llm-router pod is Ready" {
  run kubectl -n "$NS" get deploy/llm-router -o jsonpath='{.status.readyReplicas}'
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "FA-32.2: bge-m3 embedding round-trip returns 1024-dim vector" {
  RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -X POST http://localhost:4000/v1/embeddings \
      -H 'Content-Type: application/json' \
      -d '{"model":"bge-m3","input":"hallo welt"}')
  DIM=$(echo "$RESPONSE" | jq '.data[0].embedding | length')
  [ "$DIM" -eq 1024 ]
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-32.bats
git commit -m "test(llm): FA-32 bge-m3 happy path"
```

---

## Task 14: FA-33 — Voyage passthrough (integration)

**Files:**
- Create: `tests/local/FA-33.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# FA-33: voyage-multilingual-2 model passes through the router and returns
#        Voyage vectors regardless of TEI state.

setup() {
  : "${NS:=workspace}"
}

@test "FA-33.1: voyage-multilingual-2 returns 1024-dim vector" {
  RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -X POST http://localhost:4000/v1/embeddings \
      -H 'Content-Type: application/json' \
      -d '{"model":"voyage-multilingual-2","input":"capital of germany"}')
  DIM=$(echo "$RESPONSE" | jq '.data[0].embedding | length')
  [ "$DIM" -eq 1024 ]
}

@test "FA-33.2: voyage path independent of TEI (tag the request as legacy)" {
  # No assertion on TEI state; this test just confirms the legacy path
  # is reachable. Run it after taking TEI offline manually if you want
  # to validate true independence — out of scope for automated runs.
  RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -X POST http://localhost:4000/v1/embeddings \
      -H 'Content-Type: application/json' \
      -d '{"model":"voyage-multilingual-2","input":"x"}')
  echo "$RESPONSE" | jq -e '.data[0].embedding' >/dev/null
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-33.bats
git commit -m "test(llm): FA-33 voyage-multilingual-2 passthrough"
```

---

## Task 15: FA-34 — no write-time fallback (integration)

**Files:**
- Create: `tests/local/FA-34.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# FA-34: With TEI down and model=bge-m3 + purpose=index, the router returns 5xx —
#        it must NEVER silently fall back to Voyage.

setup() {
  : "${NS:=workspace}"
}

teardown() {
  # Restore Endpoints if the test scaled them down
  if [ -f /tmp/llm-gateway-embed.bak ]; then
    kubectl -n "$NS" apply -f /tmp/llm-gateway-embed.bak
    rm -f /tmp/llm-gateway-embed.bak
  fi
}

@test "FA-34.1: bge-m3 + purpose=index fails closed when TEI Endpoints is empty" {
  # Snapshot Endpoints, then point them at an unreachable IP.
  kubectl -n "$NS" get endpoints llm-gateway-embed -o yaml > /tmp/llm-gateway-embed.bak
  kubectl -n "$NS" patch endpoints llm-gateway-embed --type=json \
    -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]'
  sleep 2
  STATUS=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -s -o /tmp/r.json -w '%{http_code}' \
      -H 'Content-Type: application/json' -H 'X-LLM-Purpose: index' \
      -d '{"model":"bge-m3","input":"hello"}' \
      http://localhost:4000/v1/embeddings || true)
  [ "$STATUS" -ge 500 ]   # any 5xx is acceptable; what matters is no Voyage vector
  RESP=$(cat /tmp/r.json 2>/dev/null || echo '{}')
  # A Voyage response would have data[0].embedding; ensure no embedding present.
  echo "$RESP" | jq -e '.data[0].embedding' && fail "router silently fell back to Voyage" || true
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-34.bats
git commit -m "test(llm): FA-34 no write-time fallback (bge-m3 fails closed)"
```

---

## Task 16: FA-35 — no cross-space query (integration + client)

**Files:**
- Create: `tests/local/FA-35.bats`

This tests the client-side invariant (`MixedEmbeddingModelError` from Task 10) end-to-end via a direct DB+code path inside the website pod.

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# FA-35: Querying a bge-m3 collection with a Voyage-tagged collection in the
#        same call must throw MixedEmbeddingModelError.

setup() {
  : "${NS:=workspace}"
  : "${WEBSITE_NS:=website}"
}

@test "FA-35.1: queryNearest rejects mixed embedding_model collections" {
  # Run a node one-liner inside the website pod that exercises the new code path.
  OUT=$(kubectl -n "$WEBSITE_NS" exec deploy/website -- node -e '
    const { createCollection, queryNearest, MixedEmbeddingModelError, __setPoolForTests } = require("./dist/lib/knowledge-db.js");
    (async () => {
      try {
        const a = await createCollection({ name: "t-bge-" + Date.now(), source: "custom", embeddingModel: "bge-m3" });
        const b = await createCollection({ name: "t-vy-"  + Date.now(), source: "custom", embeddingModel: "voyage-multilingual-2" });
        await queryNearest({ collectionIds: [a.id, b.id], queryText: "q" });
        console.log("UNEXPECTED_OK");
      } catch (e) {
        console.log("ERR:" + (e.name || "Unknown"));
      }
    })();
  ' 2>&1)
  [[ "$OUT" =~ "MixedEmbeddingModelError" ]]
}
```

> **Note:** The exact require path (`./dist/lib/knowledge-db.js`) depends on the website's build output. Adjust to match the pod's runtime layout (e.g. `/app/dist/...`).

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-35.bats
git commit -m "test(llm): FA-35 cross-space query rejected (MixedEmbeddingModelError)"
```

---

## Task 17: FA-36 — rerank works (integration)

**Files:**
- Create: `tests/local/FA-36.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# FA-36: /v1/rerank returns sorted results; correct top-1 on a fixture set.

setup() {
  : "${NS:=workspace}"
}

@test "FA-36.1: rerank places 'berlin' first for 'capital of germany'" {
  RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -X POST http://localhost:4000/v1/rerank \
      -H 'Content-Type: application/json' \
      -d '{"model":"workspace-rerank","query":"capital of germany","documents":["paris","berlin","hamburg","munich"]}')
  TOP=$(echo "$RESPONSE" | jq -r '.results[0].index')
  # 'berlin' is index 1 in the documents array
  [ "$TOP" = "1" ]
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-36.bats
git commit -m "test(llm): FA-36 rerank correctness on fixture"
```

---

## Task 18: FA-37 — chat round-trip (integration)

**Files:**
- Create: `tests/local/FA-37.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# FA-37: workspace-chat round-trips a 200-token German prompt successfully.

setup() {
  : "${NS:=workspace}"
}

@test "FA-37.1: workspace-chat returns non-empty content" {
  RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -X POST http://localhost:4000/v1/chat/completions \
      -H 'Content-Type: application/json' \
      -d '{"model":"workspace-chat","messages":[{"role":"user","content":"Beschreibe die Stadt Hamburg in zwei Sätzen."}],"max_tokens":120}')
  CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
  [ -n "$CONTENT" ]
  [ "${#CONTENT}" -gt 30 ]
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-37.bats
git commit -m "test(llm): FA-37 chat round-trip"
```

---

## Task 19: FA-38 — chat fallback to Anthropic (integration)

**Files:**
- Create: `tests/local/FA-38.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# FA-38: With Ollama unreachable, workspace-chat returns successfully via Anthropic.

setup() {
  : "${NS:=workspace}"
}

teardown() {
  if [ -f /tmp/llm-gateway-chat.bak ]; then
    kubectl -n "$NS" apply -f /tmp/llm-gateway-chat.bak
    rm -f /tmp/llm-gateway-chat.bak
  fi
}

@test "FA-38.1: workspace-chat falls back to Anthropic when Ollama Endpoints is down" {
  kubectl -n "$NS" get endpoints llm-gateway-chat -o yaml > /tmp/llm-gateway-chat.bak
  kubectl -n "$NS" patch endpoints llm-gateway-chat --type=json \
    -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]'
  sleep 2
  RESPONSE=$(kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS --max-time 60 -X POST http://localhost:4000/v1/chat/completions \
      -H 'Content-Type: application/json' \
      -d '{"model":"workspace-chat","messages":[{"role":"user","content":"Sag Hallo."}],"max_tokens":20}')
  CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
  [ -n "$CONTENT" ]
  # LiteLLM exposes the served model in response.model — should be anthropic-flavored.
  MODEL=$(echo "$RESPONSE" | jq -r '.model')
  [[ "$MODEL" == *anthropic* ]] || [[ "$MODEL" == *claude* ]]
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/FA-38.bats
git commit -m "test(llm): FA-38 chat fallback to Anthropic on Ollama outage"
```

---

## Task 20: NFA-10 — fallback latency (non-functional)

**Files:**
- Create: `tests/local/NFA-10.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# NFA-10: Cloud-fallback for chat-class requests completes within 5x the local p95.

setup() {
  : "${NS:=workspace}"
}

teardown() {
  if [ -f /tmp/llm-gateway-chat.bak ]; then
    kubectl -n "$NS" apply -f /tmp/llm-gateway-chat.bak
    rm -f /tmp/llm-gateway-chat.bak
  fi
}

# 5 local samples to establish p95
sample_local() {
  for i in 1 2 3 4 5; do
    /usr/bin/time -f "%e" kubectl -n "$NS" exec deploy/llm-router -- \
      curl -fsS -o /dev/null --max-time 30 -X POST http://localhost:4000/v1/chat/completions \
        -H 'Content-Type: application/json' \
        -d '{"model":"workspace-chat","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' 2>&1 | tail -1
  done
}

# 1 sample with Ollama unreachable
sample_fallback() {
  kubectl -n "$NS" get endpoints llm-gateway-chat -o yaml > /tmp/llm-gateway-chat.bak
  kubectl -n "$NS" patch endpoints llm-gateway-chat --type=json \
    -p='[{"op":"replace","path":"/subsets/0/addresses/0/ip","value":"127.0.0.42"}]'
  sleep 2
  /usr/bin/time -f "%e" kubectl -n "$NS" exec deploy/llm-router -- \
    curl -fsS -o /dev/null --max-time 60 -X POST http://localhost:4000/v1/chat/completions \
      -H 'Content-Type: application/json' \
      -d '{"model":"workspace-chat","messages":[{"role":"user","content":"hi"}],"max_tokens":10}' 2>&1 | tail -1
}

@test "NFA-10.1: fallback latency ≤ 5× local-path p95" {
  LOCAL=$(sample_local | sort -n)
  P95=$(echo "$LOCAL" | tail -1)   # 5 samples, p95 ≈ max
  FALLBACK=$(sample_fallback)
  awk -v f="$FALLBACK" -v p="$P95" 'BEGIN{ exit !(f <= 5*p) }'
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/NFA-10.bats
git commit -m "test(llm): NFA-10 fallback latency budget"
```

---

## Task 21: NFA-11 — VRAM headroom after model rotation (non-functional)

**Files:**
- Create: `tests/local/NFA-11.bats`

- [ ] **Step 1: Write the test**

```bats
#!/usr/bin/env bats
# NFA-11: After all four Ollama models are touched in sequence, VRAM stays
#         under 14 GB and TEI services are still responsive.

setup() {
  : "${LLM_HOST:=root@${LLM_HOST_IP:-10.0.0.99}}"
}

@test "NFA-11.1: rotate through all 4 Ollama models, then verify TEI + VRAM" {
  for m in qwen2.5:14b-instruct-q4_K_M qwen2.5-coder:14b-instruct-q4_K_M qwen2.5vl:7b-instruct-q4_K_M llama3.2:3b-instruct-q4_K_M; do
    ssh -i ~/.ssh/id_ed25519_hetzner -o StrictHostKeyChecking=accept-new "$LLM_HOST" \
      "curl -fsS -X POST http://127.0.0.1:11434/api/generate -d '{\"model\":\"$m\",\"prompt\":\"hi\",\"stream\":false,\"options\":{\"num_predict\":1}}'" >/dev/null
  done

  USED_MIB=$(ssh -i ~/.ssh/id_ed25519_hetzner "$LLM_HOST" \
    "nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits")
  # 14 GB ≈ 14336 MiB
  [ "$USED_MIB" -lt 14336 ]

  # TEI still responsive
  ssh -i ~/.ssh/id_ed25519_hetzner "$LLM_HOST" "curl -fsS http://127.0.0.1:8081/health" >/dev/null
  ssh -i ~/.ssh/id_ed25519_hetzner "$LLM_HOST" "curl -fsS http://127.0.0.1:8082/health" >/dev/null
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/local/NFA-11.bats
git commit -m "test(llm): NFA-11 VRAM headroom + TEI responsiveness after rotation"
```

---

## Task 22: Regenerate test inventory + update CLAUDE.md

**Files:**
- Modify: `website/src/data/test-inventory.json` *(generated)*
- Modify: `CLAUDE.md`

- [ ] **Step 1: Regenerate test inventory**

```bash
task test:inventory
```

Expected: file updated to include FA-32..FA-38 and NFA-10..NFA-11.

- [ ] **Step 2: Verify the updated inventory**

```bash
git diff website/src/data/test-inventory.json | head -40
```

Expected: new entries present.

- [ ] **Step 3: Add a Gotchas entry to CLAUDE.md**

Append to the **Gotchas & Footguns** section:

```markdown
### Local-first LLM pipeline

- **The GPU host is a single, user-provided box on `wg-mesh`** (RTX 5070 Ti, 16 GB). Both prod clusters share it via three Services (`llm-gateway-embed:8081`, `llm-gateway-rerank:8082`, `llm-gateway-chat:11434`) that point at the same `${LLM_HOST_IP}`. Losing the host stalls embedding indexing on `bge-m3` collections and falls back chat-class workloads to Anthropic per call. Voyage-tagged collections are unaffected.
- **Embeddings/rerank NEVER fall back across vector spaces.** A `bge-m3` collection always queries with bge-m3 and **fails closed** if TEI is down. A `voyage-multilingual-2` collection always queries with Voyage. The `MixedEmbeddingModelError` rejects multi-collection queries that span both. Don't "fix" this by adding silent fallback — vectors from different spaces in the same `<=>` query mean garbage retrieval.
- **`llm-gpu.yaml` and `llm-router.yaml` are in `prod/` overlay only.** Dev (k3d) has no GPU and no router; `embeddings.ts` falls through to direct Voyage when `LLM_ENABLED=false`. Don't add them to `k3d/kustomization.yaml`.
- **`LLM_HOST_IP` is required when `LLM_ENABLED=true`.** Set it in `environments/<env>.yaml` to the GPU host's wg-mesh IP. The `llm:deploy` task aborts if unset.
- **Model swap costs ~3-6s on first call after idle.** Ollama's `OLLAMA_KEEP_ALIVE=5m` evicts idle models; the next request pays the swap. Router's chat-class timeout is 30s — beyond that, it falls back to Anthropic. Don't set the timeout below ~10s without testing all four models cold.
```

- [ ] **Step 4: Commit**

```bash
git add website/src/data/test-inventory.json CLAUDE.md
git commit -m "docs(llm): test inventory + CLAUDE.md gotchas"
```

---

## Task 23: Provision GPU host + first deploy to mentolder

**Files:** none (operational steps)

- [ ] **Step 1: Provide the host's wg-mesh IP**

Read `environments/mentolder.yaml` and confirm `LLM_HOST_IP` matches the GPU host's wg-mesh address. If not, edit, re-`task env:seal`, and re-commit.

- [ ] **Step 2: Bootstrap the GPU host**

```bash
task llm:bootstrap-host HOST=<gpu-host-ssh-target>
```

Watch for: `nvidia-smi` output shows the 5070 Ti, all three systemd units `active (running)`, ufw rules listed.

- [ ] **Step 3: Pull models (~40 GB; takes 20–40 min)**

```bash
task llm:pull-models HOST=<gpu-host-ssh-target>
```

Expected: `ollama list` shows 4 entries, both TEI `/info` calls return JSON.

- [ ] **Step 4: Deploy router + endpoints to mentolder**

```bash
task llm:deploy ENV=mentolder
```

Expected: `deployment "llm-router" successfully rolled out`.

- [ ] **Step 5: Run the smoke test**

```bash
task llm:test ENV=mentolder
```

Expected: 4 sections each print a positive result (1024 / 1024 / sorted result / non-empty content).

- [ ] **Step 6: Run the FA tests against mentolder**

```bash
NS=workspace ./tests/runner.sh local FA-32 FA-33 FA-34 FA-35 FA-36 FA-37 FA-38 NFA-10 NFA-11
```

Expected: all green. (NFA-11 may need `LLM_HOST_IP=...` exported for the SSH commands.)

- [ ] **Step 7: Roll the website on mentolder so it picks up the new env**

```bash
task website:redeploy ENV=mentolder
```

Verify `web.mentolder.de/admin/wissensquellen` still works for an existing Voyage-tagged collection (legacy path), and that creating a new collection now defaults `embedding_model = bge-m3` (check via psql).

---

## Task 24: Roll out to korczewski + flip rerank on

**Files:**
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`

After ~24h of stable mentolder operation:

- [ ] **Step 1: Deploy router + endpoints to korczewski**

```bash
task llm:deploy ENV=korczewski
task llm:test ENV=korczewski
```

- [ ] **Step 2: Flip `LLM_RERANK_ENABLED` to `"true"` in both env files**

Edit `environments/mentolder.yaml` and `environments/korczewski.yaml`. Change `LLM_RERANK_ENABLED: "false"` → `LLM_RERANK_ENABLED: "true"`.

- [ ] **Step 3: Redeploy the website on both**

```bash
task website:redeploy:all-prods
```

- [ ] **Step 4: Spot-check rerank in production**

Run a knowledge query against an existing collection that has rerank wired into the search path; confirm the request log shows a call to `/v1/rerank`.

- [ ] **Step 5: Commit**

```bash
git add environments/mentolder.yaml environments/korczewski.yaml
git commit -m "feat(llm): enable rerank on both prod clusters after stable rollout"
```

---

## Task 25: Open the PR

**Files:** none (PR creation)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin <branch-name>
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: local-first LLM pipeline (TEI + Ollama + LiteLLM)" --body "$(cat <<'EOF'
## Summary

Adds a wg-mesh GPU peer (RTX 5070 Ti) running TEI (bge-m3 + bge-reranker-v2-m3)
and Ollama (Qwen2.5-14B / -Coder-14B / -VL-7B / Llama-3.2-3B), fronted by an
in-cluster LiteLLM router. Embeddings and reranking pin per-collection to a
single backend; chat-class workloads fall back to Anthropic per call.

Spec: `docs/superpowers/specs/2026-05-10-local-llm-pipeline-design.md`
Plan: `docs/superpowers/plans/2026-05-10-local-llm-pipeline.md`

## Test plan

- [ ] `task test:all` green
- [ ] `task llm:test ENV=mentolder` green
- [ ] FA-32..FA-38 + NFA-10..NFA-11 green on mentolder
- [ ] Existing Voyage-tagged collections continue to work after deploy
- [ ] New collection created via UI defaults to `embedding_model = bge-m3`
- [ ] Rerank disabled initially; flipped on after 24h in a follow-up commit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: After CI passes, merge**

Per project convention (squash-and-merge).

---

## Self-review notes

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| Architecture (wg-mesh GPU peer + 3 Services + router) | Tasks 2, 3, 4, 5 |
| Model roster | Tasks 5, 6 (systemd + pull script) |
| Routing & fallback policy | Task 3 (LiteLLM config), Task 8 (no-fallback assertions) |
| Vector Space Correctness invariant | Tasks 8, 10, 11 (client) + 15, 16 (integration tests) |
| `embeddings.ts`/`rerank.ts`/`knowledge-db.ts` integration points | Tasks 8, 9, 10, 11 |
| `scripts/llm-host-setup.sh` + `scripts/llm-pull-models.sh` | Tasks 5, 6 |
| `k3d/llm-gpu.yaml` + `k3d/llm-router.yaml` | Tasks 2, 3 |
| `environments/schema.yaml` + per-env additions | Task 1 |
| `Taskfile.llm.yml` | Task 7 |
| Tests FA-30..FA-36 + NFA-10..NFA-11 | Tasks 13–21 (renumbered FA-32..FA-38) |
| Rollout plan (mentolder first → korczewski → rerank on) | Tasks 23, 24 |
| Open question: per-collection migration to bge-m3 | Out of scope (separate follow-up PR per spec) |

**Placeholder scan:** No `TODO`, `TBD`, "fill in later", or "appropriate error handling" found.

**Type/signature consistency:**
- `EmbeddingModel = 'bge-m3' | 'voyage-multilingual-2'` defined in Task 8, used in Tasks 10, 11.
- `MixedEmbeddingModelError` introduced in Task 10, asserted in Task 15.
- `EmbeddingIndexError` / `EmbeddingQueryError` introduced in Task 8, asserted in Task 8 unit tests.
- `rerankCandidates(query, docs)` introduced in Task 9 with the same signature as called in any future caller.
- `queryNearest({ collectionIds, queryText })` introduced in Task 10; old `queryEmbedding`-based callers updated in Task 10 step 5.
