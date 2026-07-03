---
title: "agentic-terminal-sidekick — Implementation Plan"
ticket_id: T001565
domains: [website, infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agentic-terminal-sidekick — Implementation Plan

## File Structure

New and modified files, grouped by responsibility. Each file has one clear job.

**Infra — cluster manifests (Kustomize base `k3d/`):**
- Create: `k3d/terminal-sidekick.yaml` — selector-less `terminal-bridge` Service + `Endpoints` on `${TERMINAL_OVERLAY_IP}:7681` (pattern: `k3d/rustdesk-web-bridge.yaml`).
- Create: `k3d/oauth2-proxy-terminal.yaml` — oauth2-proxy Deployment + Service, `client-id=terminal-sidekick`, upstream `http://terminal-bridge:7681`, group-gate flags (pattern: `k3d/oauth2-proxy-mediaviewer.yaml`).
- Modify: `k3d/kustomization.yaml` — register the two new manifests (S4 orphan guard).
- Modify: `k3d/ingress.yaml` — dev host `terminal.localhost` → `oauth2-proxy-terminal:4180`.
- Modify: `k3d/configmap-domains.yaml` — new key `TERMINAL_HOST: "terminal.localhost"`.
- Modify: `k3d/website.yaml` — inject `TERMINAL_HOST` env from `domain-config` into the website Deployment.
- Modify: `k3d/pocket-id-client-seed.yaml` — new ROW `terminal-sidekick` + `SECRET_terminal` env injection.

**Infra — prod overlay (`prod/`):**
- Create: `prod/patch-oauth2-proxy-terminal.yaml` — prod args (issuer `https://auth.${PROD_DOMAIN}`, `--cookie-secure=true --cookie-samesite=none`).
- Modify: `prod/ingress.yaml` — TLS Ingress for `terminal.${PROD_DOMAIN}` → `oauth2-proxy-terminal:4180`.
- Modify: `prod/configmap-domains.yaml` — `TERMINAL_HOST: "terminal.${PROD_DOMAIN}"`.
- Modify: `prod/traefik-middlewares.yaml` — `terminal-embed-headers` Middleware (frame-ancestors → website origin).
- Modify: `prod/kustomization.yaml` — register `patch-oauth2-proxy-terminal.yaml`.

**Infra — WireGuard + env registry:**
- Modify: `wireguard/wg-mesh-nodes.yaml` — WSL-host peer in the `fleet:` block (`wg_ip 10.20.0.10`).
- Modify: `environments/schema.yaml` — register `TERMINAL_OVERLAY_IP`.
- Modify: `environments/mentolder.yaml`, `environments/fleet-mentolder.yaml` — `TERMINAL_OVERLAY_IP: "10.20.0.10"`.
- Modify: `Taskfile.yml` — add `$TERMINAL_OVERLAY_IP` to the two `ENVSUBST_VARS` lists that already carry `$TURN_OVERLAY_IP`.

**Host setup (not k8s-deployable — committed script):**
- Create: `scripts/terminal-sidekick-host.sh` — idempotent ttyd + tmux `sidekick` + systemd-user-unit installer.

**Frontend (`website/`):**
- Create: `website/src/components/mediaviewer/TerminalSessionHost.svelte` — iframe on `https://${terminalHost}/` + open-in-new-tab link.
- Modify: `website/src/components/PortalSidekick.svelte` — `View` union `grilling`→`terminal`; `titleMap`; drawer-body branch; new `terminalHost` prop.
- Modify: `website/src/components/assistant/SidekickHome.svelte` — menu item swap (`grilling`→`terminal`, `show: isAdmin`) + `View` type.
- Modify: `website/src/lib/assistant/sidekick-nudge.ts` — `SidekickView` type + `KNOWN_VIEWS` set `grilling`→`terminal`.
- Modify: `website/src/layouts/AdminLayout.astro` — read `TERMINAL_HOST` env, pass `terminalHost` prop.
- Delete: `website/src/components/mediaviewer/GrillingSessionHost.svelte`.
- Modify: `website/src/components/PortalSidekick.test.ts` — new `terminal` view test; assert no `grilling`.

**Tests:**
- Create: `tests/spec/terminal-sidekick.bats` — infra structure assertions (bridge/proxy/ingress/seed/wg/script).

**Unchanged (explicitly out of scope):** `MediaviewerPanel.svelte`, `mediaviewer-bridge.ts`, `GrillingStepper.svelte`, `lib/tickets/grilling.ts`, `lib/tickets/final-grilling.ts` and their tests — the `mode="grilling"` dead path stays for a later chore (Q7).

---

**Goal:** Replace the Sidekick `grilling` view with a SSO-gated live terminal (`terminal`) that embeds ttyd running the local WSL agents.

**Architecture:** Browser → Traefik → `oauth2-proxy-terminal` (Pocket-ID group gate) → selector-less `terminal-bridge` Service → `Endpoints(${TERMINAL_OVERLAY_IP}:7681)` → ttyd on the WSL host (bind wg-fleet IP only, `--writable`) → tmux session `sidekick`. Direct precedent: the RustDesk web-client bridge.

**Tech Stack:** Kustomize, oauth2-proxy v7.9.0, Pocket-ID OIDC, WireGuard (fleet mesh `10.20.0.0/24`), ttyd + tmux + systemd-user-unit, Svelte 5 (runes), Vitest, BATS.

## Global Constraints

- ttyd MUST bind only the wg-fleet interface IP (`--interface 10.20.0.10`), never `0.0.0.0`, and MUST run `--writable` (ttyd ≥1.7 is read-only without it).
- oauth2-proxy MUST pass `--allowed-group=terminal-admins` together with `--oidc-groups-claim=groups`; the `groups` claim must reach the ID token (client-scope config is a manual step).
- S3 (no hardcoded brand hostnames): in `k3d/*.yaml` and `prod*/*.yaml` use only `${PROD_DOMAIN}`, `${SCHEME}://terminal.${SUFFIX}`, or `terminal.localhost` — never `terminal.mentolder.de` / `terminal.korczewski.de` literals.
- S4 (no orphans): every new `k3d/*.yaml` MUST be referenced in a `kustomization.yaml`; `scripts/terminal-sidekick-host.sh` MUST be reachable (referenced by the BATS spec and the design spec).
- One shared hostname/proxy for both brands (`terminal.${PROD_DOMAIN}`) — no korczewski-specific proxy (Q4).
- CQ02: introduce no new `: any` / `as any` in `website/src` (global count is 10, limit 200).

### S1 line-budget pre-flight (per touched, gated file)

Effective threshold = static extension limit (none of these files are baselined). Budget = threshold − current `wc -l`. Keep each file ≤ ~80% of its threshold after the change.

| Datei | Sprache / Limit | Ist (wc -l) | Budget | Strategie |
|-------|-----------------|-------------|--------|-----------|
| `website/src/components/PortalSidekick.svelte` | svelte / 500 | 383 | 117 | swap only (net ≈ 0) |
| `website/src/components/assistant/SidekickHome.svelte` | svelte / 500 | 307 | 193 | swap only (net ≈ 0) |
| `website/src/components/mediaviewer/TerminalSessionHost.svelte` | svelte / 500 | 0 (neu) | 500 | new, ~70 lines — well under |
| `website/src/components/PortalSidekick.test.ts` | ts / 600 | 20 | 580 | append one describe block |
| `scripts/terminal-sidekick-host.sh` | sh / 500 | 0 (neu) | 500 | new, ~120 lines — well under |

YAML manifests are S1-ungated (limit 0). `sidekick-nudge.ts` and `AdminLayout.astro` changes are ≤2 lines each; neither is near its threshold.

---

### Task 1: Terminal bridge + oauth2-proxy (dev) + ingress + domain wiring

**Files:**
- Create: `tests/spec/terminal-sidekick.bats`
- Create: `k3d/terminal-sidekick.yaml`
- Create: `k3d/oauth2-proxy-terminal.yaml`
- Modify: `k3d/kustomization.yaml`, `k3d/ingress.yaml`, `k3d/configmap-domains.yaml`, `k3d/website.yaml`, `website/src/layouts/AdminLayout.astro`

**Interfaces:**
- Produces: Service `terminal-bridge` (port 7681, no selector), Deployment+Service `oauth2-proxy-terminal` (port 4180), ConfigMap key `TERMINAL_HOST`, website env `TERMINAL_HOST`. Later tasks (seed row, prod overlay, frontend) rely on the `terminal-sidekick` client-id and the `TERMINAL_HOST` key existing.

- [ ] **Step 1: Write the failing BATS spec.** Create `tests/spec/terminal-sidekick.bats`:

```bash
#!/usr/bin/env bats
# tests/spec/terminal-sidekick.bats
# SSOT: openspec/specs/terminal-sidekick.md (post-archive)
# Structural assertions over the raw k3d/ + prod/ manifests + host script.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  K3D="${REPO_ROOT}/k3d"
  PROD="${REPO_ROOT}/prod"
}

@test "terminal: bridge Service is selector-less on port 7681" {
  f="${K3D}/terminal-sidekick.yaml"
  [ -f "$f" ]
  grep -qE 'name:[[:space:]]*terminal-bridge' "$f"
  grep -qE 'port:[[:space:]]*7681' "$f"
  # no `selector:` key anywhere in the bridge manifest
  ! grep -qE '^[[:space:]]*selector:' "$f"
}

@test "terminal: Endpoints target the overlay IP placeholder" {
  grep -qE 'ip:[[:space:]]*"\$\{TERMINAL_OVERLAY_IP\}"' "${K3D}/terminal-sidekick.yaml"
}

@test "terminal: oauth2-proxy carries client-id + group-gate flags" {
  f="${K3D}/oauth2-proxy-terminal.yaml"
  [ -f "$f" ]
  grep -qE 'client-id=terminal-sidekick' "$f"
  grep -qE 'allowed-group=terminal-admins' "$f"
  grep -qE 'oidc-groups-claim=groups' "$f"
  grep -qE 'upstream=http://terminal-bridge:7681' "$f"
}

@test "terminal: dev ingress routes terminal.localhost to the proxy" {
  grep -qE 'host:[[:space:]]*terminal\.localhost' "${K3D}/ingress.yaml"
}

@test "terminal: TERMINAL_HOST configmap key present (dev + prod)" {
  grep -qE 'TERMINAL_HOST:[[:space:]]*"terminal\.localhost"' "${K3D}/configmap-domains.yaml"
  grep -qE 'TERMINAL_HOST:[[:space:]]*"terminal\.\$\{PROD_DOMAIN\}"' "${PROD}/configmap-domains.yaml"
}

@test "terminal: new manifests are registered in kustomization (no orphans)" {
  grep -qE 'terminal-sidekick\.yaml' "${K3D}/kustomization.yaml"
  grep -qE 'oauth2-proxy-terminal\.yaml' "${K3D}/kustomization.yaml"
}

@test "terminal: no hardcoded brand domain in the new k3d manifests" {
  ! grep -REn 'terminal\.(mentolder|korczewski)\.de' "${K3D}/terminal-sidekick.yaml" "${K3D}/oauth2-proxy-terminal.yaml"
}
```

- [ ] **Step 2: Run the spec and confirm it fails.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats
# expected: FAIL (red — manifests do not exist yet)
```

- [ ] **Step 3: Create `k3d/terminal-sidekick.yaml`** (selector-less Service + Endpoints, pattern `k3d/rustdesk-web-bridge.yaml`):

```yaml
# ═══════════════════════════════════════════════════════════════════
# terminal-sidekick bridge — selector-less Service → ttyd on the WSL
# host, reached over the wg-fleet overlay IP ${TERMINAL_OVERLAY_IP}.
# ttyd runs off-cluster (systemd user unit); there are no pod IPs, so
# Endpoints point straight at the overlay address. Pattern: rustdesk-web.
# ═══════════════════════════════════════════════════════════════════
apiVersion: v1
kind: Service
metadata:
  name: terminal-bridge
  labels:
    app: terminal-sidekick
spec:
  ports:
    - name: ttyd
      port: 7681
      targetPort: 7681
      protocol: TCP
---
apiVersion: v1
kind: Endpoints
metadata:
  name: terminal-bridge
  labels:
    app: terminal-sidekick
subsets:
  - addresses:
      - ip: "${TERMINAL_OVERLAY_IP}"
    ports:
      - name: ttyd
        port: 7681
        protocol: TCP
```

- [ ] **Step 4: Create `k3d/oauth2-proxy-terminal.yaml`** (copy `k3d/oauth2-proxy-mediaviewer.yaml`, change client-id/cookie/upstream, add the two group flags):

```yaml
# ═══════════════════════════════════════════════════════════════════
# OAuth2 Proxy — Pocket ID SSO gateway for the Agentic Terminal (ttyd).
# Group-gated: only members of `terminal-admins` pass. WebSocket upstream.
# ═══════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-terminal
  labels:
    app: terminal-sidekick
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oauth2-proxy-terminal
  template:
    metadata:
      labels:
        app: oauth2-proxy-terminal
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile:
          type: RuntimeDefault
      initContainers:
        - name: write-cookie-secret
          image: busybox:1.38.0@sha256:fd8d9aa63ba2f0982b5304e1ee8d3b90a210bc1ffb5314d980eb6962f1a9715d
          imagePullPolicy: Always
          command: ["/bin/sh", "-c"]
          args:
            - printf 'cookie_secret = "%s"\n' "$(printf '%s' "$OAUTH2_PROXY_COOKIE_SECRET" | cut -c1-32)" > /run/config/oauth2-extra.cfg
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: ["ALL"]
          resources:
            requests: { cpu: 10m, memory: 32Mi }
            limits:   { memory: 64Mi }
          env:
            - name: OAUTH2_PROXY_COOKIE_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: OAUTH2_PROXY_COOKIE_SECRET
          volumeMounts:
            - name: oauth2-config
              mountPath: /run/config
      containers:
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.9.0@sha256:37c1570c0427e02fc7c947ef2c04e8995b8347b7abc9fcf1dbb4e376a4b221a7
          imagePullPolicy: Always
          args:
            - --config=/run/config/oauth2-extra.cfg
            - --provider=oidc
            - --client-id=terminal-sidekick
            - --client-secret=$(POCKET_ID_TERMINAL_SECRET)
            - --redirect-url=http://terminal.localhost/oauth2/callback
            - --oidc-issuer-url=http://pocket-id:1411
            - --ssl-insecure-skip-verify=true
            - --skip-oidc-discovery=true
            - --login-url=http://auth.localhost/authorize
            - --redeem-url=http://pocket-id:1411/api/oidc/token
            - --oidc-jwks-url=http://pocket-id:1411/.well-known/jwks.json
            - --profile-url=http://pocket-id:1411/api/oidc/userinfo
            - --upstream=http://terminal-bridge:7681
            - --http-address=0.0.0.0:4180
            - --cookie-secure=false
            - --cookie-name=_oauth2_proxy_terminal
            - --email-domain=*
            - --pass-access-token=true
            - --pass-authorization-header=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            - --code-challenge-method=S256
            - --insecure-oidc-allow-unverified-email=true
            - --oidc-extra-audience=terminal-sidekick
            - --scope=openid email profile groups
            - --oidc-groups-claim=groups
            - --allowed-group=terminal-admins
          env:
            - name: POCKET_ID_TERMINAL_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: POCKET_ID_TERMINAL_SECRET
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: [ALL]
            seccompProfile:
              type: RuntimeDefault
          ports:
            - containerPort: 4180
          readinessProbe:
            httpGet: { path: /ping, port: 4180 }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /ping, port: 4180 }
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests: { memory: 64Mi, cpu: "50m" }
            limits:   { memory: 128Mi, cpu: "200m" }
          volumeMounts:
            - name: oauth2-config
              mountPath: /run/config
              readOnly: true
      volumes:
        - name: oauth2-config
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: oauth2-proxy-terminal
  labels:
    app: terminal-sidekick
spec:
  selector:
    app: oauth2-proxy-terminal
  ports:
    - port: 4180
      targetPort: 4180
```

- [ ] **Step 5: Register both manifests in `k3d/kustomization.yaml`.** After the RustDesk bridge block (`oauth2-proxy-rustdesk-web.yaml`, before `# Ingress`) add:

```yaml
  # Agentic Terminal SSO bridge (T001565) — ttyd on the WSL host via wg-fleet
  - terminal-sidekick.yaml
  - oauth2-proxy-terminal.yaml
```

- [ ] **Step 6: Add the dev ingress host** in `k3d/ingress.yaml` after the `remote.localhost` block:

```yaml
    - host: terminal.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-terminal
                port:
                  number: 4180
```

- [ ] **Step 7: Add the domain key** in `k3d/configmap-domains.yaml` after `MEDIAVIEWER_HOST`:

```yaml
  TERMINAL_HOST: "terminal.localhost"
```

- [ ] **Step 8: Inject the env into the website Deployment** in `k3d/website.yaml` after the `MEDIAVIEWER_HOST` env block (around line 447):

```yaml
            - name: TERMINAL_HOST
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: TERMINAL_HOST
```

- [ ] **Step 9: Wire the prop in `website/src/layouts/AdminLayout.astro`.** After the `MEDIAVIEWER_HOST` const (line 12) add the read, and pass it on the `PortalSidekick` tag (line 158):

```astro
const TERMINAL_HOST = process.env.TERMINAL_HOST ?? 'terminal.localhost';
```

```astro
    <PortalSidekick client:load helpSection={helpSection} helpContext="admin" mediaviewerHost={MEDIAVIEWER_HOST} terminalHost={TERMINAL_HOST} />
```

- [ ] **Step 10: Add the prod domain key** in `prod/configmap-domains.yaml` after `MEDIAVIEWER_HOST` (so the `TERMINAL_HOST` assertion in step 1 passes for both files):

```yaml
  # Agentic Terminal host — registry-sourced (terminal.<domain>). Same reason as
  # MEDIAVIEWER_HOST: this file strategic-merge-patches base k3d/configmap-domains.yaml.
  TERMINAL_HOST: "terminal.${PROD_DOMAIN}"
```

- [ ] **Step 11: Run the spec — the manifest/ingress/configmap/kustomization tests now pass.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats
# Expected: the seven Task-1 @test cases PASS
```

- [ ] **Step 12: Commit.**

```bash
git add tests/spec/terminal-sidekick.bats k3d/terminal-sidekick.yaml k3d/oauth2-proxy-terminal.yaml \
        k3d/kustomization.yaml k3d/ingress.yaml k3d/configmap-domains.yaml k3d/website.yaml \
        prod/configmap-domains.yaml website/src/layouts/AdminLayout.astro
git commit -m "feat(terminal): dev bridge + group-gated oauth2-proxy for agentic terminal [T001565]"
```

---

### Task 2: Pocket-ID client seed row for terminal-sidekick

**Files:**
- Modify: `k3d/pocket-id-client-seed.yaml`
- Modify: `tests/spec/terminal-sidekick.bats`

**Interfaces:**
- Consumes: `k3d/oauth2-proxy-terminal.yaml` reads `workspace-secrets/POCKET_ID_TERMINAL_SECRET` (Task 1).
- Produces: seeded OIDC client `terminal-sidekick` with callback `${SCHEME}://terminal.${SUFFIX}/oauth2/callback`; secret written back on first create.

- [ ] **Step 1: Add the failing seed assertion** to `tests/spec/terminal-sidekick.bats`:

```bash
@test "terminal: seed job registers the terminal-sidekick client row" {
  f="${K3D}/pocket-id-client-seed.yaml"
  grep -qE 'terminal-sidekick\|SECRET_terminal\|POCKET_ID_TERMINAL_SECRET\|\$\{SCHEME\}://terminal\.\$\{SUFFIX\}/oauth2/callback' "$f"
  grep -qE 'name:[[:space:]]*SECRET_terminal' "$f"
  grep -qE 'key:[[:space:]]*POCKET_ID_TERMINAL_SECRET' "$f"
}
```

- [ ] **Step 2: Run it and confirm the new test fails.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'seed job registers'
# Expected: FAIL (red — the ROW and env injection are absent)
```

- [ ] **Step 3: Add the `SECRET_terminal` env injection** in `k3d/pocket-id-client-seed.yaml` after the `SECRET_rustdeskweb` block (around line 146):

```yaml
            - name: SECRET_terminal
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_TERMINAL_SECRET, optional: true } }
```

- [ ] **Step 4: Add the client ROW** in the `ROWS="` heredoc after the `rustdesk-web` row (line 188):

```sh
              terminal-sidekick|SECRET_terminal|POCKET_ID_TERMINAL_SECRET|${SCHEME}://terminal.${SUFFIX}/oauth2/callback
```

- [ ] **Step 5: Run the assertion — it now passes.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'seed job registers'
# Expected: PASS
```

- [ ] **Step 6: Commit.**

```bash
git add k3d/pocket-id-client-seed.yaml tests/spec/terminal-sidekick.bats
git commit -m "feat(terminal): seed terminal-sidekick Pocket-ID client [T001565]"
```

---

### Task 3: WireGuard fleet peer + TERMINAL_OVERLAY_IP env registry

**Files:**
- Modify: `wireguard/wg-mesh-nodes.yaml`, `environments/schema.yaml`, `environments/mentolder.yaml`, `environments/fleet-mentolder.yaml`, `Taskfile.yml`
- Modify: `tests/spec/terminal-sidekick.bats`

**Interfaces:**
- Produces: `TERMINAL_OVERLAY_IP=10.20.0.10` resolvable in the mentolder envs; `terminal-sidekick.yaml` Endpoints render a real IP after `envsubst`.

- [ ] **Step 1: Add the failing wg + schema assertion** to `tests/spec/terminal-sidekick.bats`:

```bash
@test "terminal: WSL host is a fleet wg peer and overlay IP is registered" {
  grep -qE 'wg_ip:[[:space:]]*"10\.20\.0\.10"' "${REPO_ROOT}/wireguard/wg-mesh-nodes.yaml"
  grep -qE 'name:[[:space:]]*TERMINAL_OVERLAY_IP' "${REPO_ROOT}/environments/schema.yaml"
}
```

- [ ] **Step 2: Run it and confirm failure.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'fleet wg peer'
# Expected: FAIL (red — peer + schema entry missing)
```

- [ ] **Step 3: Add the fleet peer** at the end of the `fleet:` block in `wireguard/wg-mesh-nodes.yaml` (after the `workers:` list, mirroring the `gpu_hosts` shape from the brand meshes):

```yaml
  # GPU / dev host — WSL2 on Windows, runs the agentic terminal (ttyd + tmux).
  # Joins the fleet mesh so the selector-less terminal-bridge can reach ttyd on
  # 10.20.0.10:7681. Endpoint is dynamic (WSL2 behind Windows NAT); host dials out.
  gpu_hosts:
    - name: wsl2-terminal-fleet
      endpoint: ""        # dynamic NAT port (WSL2 initiates outbound)
      wg_ip: "10.20.0.10"
      schema_key: WG_MESH_WSL2_TERMINAL_FLEET
      public_key: "REPLACE_WITH_WSL_HOST_PUBLIC_KEY"
      keepalive: 25
```

- [ ] **Step 4: Register the env var** in `environments/schema.yaml` after the `TURN_OVERLAY_IP` block (line 177):

```yaml
  - name: TERMINAL_OVERLAY_IP
    required: false
    default_dev: "127.0.0.1"
    validate: "^[0-9.]+$"
    description: "wg-fleet overlay IP of the WSL host running ttyd (10.20.0.10). Endpoints target for the agentic-terminal bridge (T001565)."
```

- [ ] **Step 5: Set the value** in `environments/mentolder.yaml` and `environments/fleet-mentolder.yaml` next to the existing `TURN_OVERLAY_IP`:

```yaml
  TERMINAL_OVERLAY_IP: "10.20.0.10"
```

- [ ] **Step 6: Extend the envsubst var lists** in `Taskfile.yml` — both `ENVSUBST_VARS` lines that already carry `$TURN_OVERLAY_IP` (around lines 2676 and 2842) gain `$TERMINAL_OVERLAY_IP`, and add a dev fallback next to the existing `export TURN_OVERLAY_IP=...` (lines 2724, 2870):

```bash
          ENVSUBST_VARS="$ENVSUBST_VARS \$WEBSITE_IMAGE \$TURN_PUBLIC_IP \$TURN_NODE \$TURN_OVERLAY_IP \$TERMINAL_OVERLAY_IP \$BRAND_ID"
```

```bash
        export TERMINAL_OVERLAY_IP="${TERMINAL_OVERLAY_IP:-127.0.0.1}"
```

- [ ] **Step 7: Run the assertion — it now passes.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'fleet wg peer'
# Expected: PASS
```

- [ ] **Step 8: Commit.**

```bash
git add wireguard/wg-mesh-nodes.yaml environments/schema.yaml environments/mentolder.yaml \
        environments/fleet-mentolder.yaml Taskfile.yml tests/spec/terminal-sidekick.bats
git commit -m "feat(terminal): fleet wg peer + TERMINAL_OVERLAY_IP registry [T001565]"
```

---

### Task 4: Prod overlay — patch, ingress, embed middleware

**Files:**
- Create: `prod/patch-oauth2-proxy-terminal.yaml`
- Modify: `prod/ingress.yaml`, `prod/traefik-middlewares.yaml`, `prod/kustomization.yaml`
- Modify: `tests/spec/terminal-sidekick.bats`

**Interfaces:**
- Consumes: `oauth2-proxy-terminal` Deployment (Task 1), `TERMINAL_HOST` prod key (Task 1 step 10).
- Produces: TLS-terminated `terminal.${PROD_DOMAIN}` route with cross-origin cookie + frame-ancestors embed headers.

- [ ] **Step 1: Add the failing prod assertion** to `tests/spec/terminal-sidekick.bats`:

```bash
@test "terminal: prod proxy patch sets cross-origin cookie + group gate" {
  f="${PROD}/patch-oauth2-proxy-terminal.yaml"
  [ -f "$f" ]
  grep -qE 'cookie-samesite=none' "$f"
  grep -qE 'cookie-secure=true' "$f"
  grep -qE 'allowed-group=terminal-admins' "$f"
  grep -qE 'redirect-url=https://terminal\.\$\{PROD_DOMAIN\}/oauth2/callback' "$f"
}

@test "terminal: prod ingress + kustomization wire the terminal host" {
  grep -qE 'host:[[:space:]]*terminal\.\$\{PROD_DOMAIN\}' "${PROD}/ingress.yaml"
  grep -qE 'patch-oauth2-proxy-terminal\.yaml' "${PROD}/kustomization.yaml"
}
```

- [ ] **Step 2: Run it and confirm failure.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'prod'
# Expected: FAIL (red — prod overlay files/entries absent)
```

- [ ] **Step 3: Create `prod/patch-oauth2-proxy-terminal.yaml`** (pattern `prod/patch-oauth2-proxy-mediaviewer.yaml`):

```yaml
# prod/patch-oauth2-proxy-terminal.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-terminal
spec:
  template:
    spec:
      containers:
        - name: oauth2-proxy
          args:
            - "--config=/run/config/oauth2-extra.cfg"
            - "--provider=oidc"
            - "--client-id=terminal-sidekick"
            - "--client-secret=$(POCKET_ID_TERMINAL_SECRET)"
            - "--redirect-url=https://terminal.${PROD_DOMAIN}/oauth2/callback"
            - "--oidc-issuer-url=https://auth.${PROD_DOMAIN}"
            - "--ssl-insecure-skip-verify=true"
            - "--skip-oidc-discovery=true"
            - "--login-url=https://auth.${PROD_DOMAIN}/authorize"
            - "--redeem-url=https://auth.${PROD_DOMAIN}/api/oidc/token"
            - "--oidc-jwks-url=https://auth.${PROD_DOMAIN}/.well-known/jwks.json"
            - "--profile-url=https://auth.${PROD_DOMAIN}/api/oidc/userinfo"
            - "--upstream=http://terminal-bridge:7681"
            - "--http-address=0.0.0.0:4180"
            - "--cookie-secure=true"
            - "--cookie-samesite=none"
            - "--cookie-name=_oauth2_proxy_terminal"
            - "--email-domain=*"
            - "--pass-access-token=true"
            - "--pass-authorization-header=true"
            - "--set-xauthrequest=true"
            - "--skip-provider-button=true"
            - "--code-challenge-method=S256"
            - "--insecure-oidc-allow-unverified-email=true"
            - "--oidc-extra-audience=terminal-sidekick"
            - "--scope=openid email profile groups"
            - "--oidc-groups-claim=groups"
            - "--allowed-group=terminal-admins"
          env:
            - name: POCKET_ID_TERMINAL_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: POCKET_ID_TERMINAL_SECRET
```

- [ ] **Step 4: Register the patch** in `prod/kustomization.yaml` after `patch-oauth2-proxy-mediaviewer.yaml`:

```yaml
  - path: patch-oauth2-proxy-terminal.yaml
```

- [ ] **Step 5: Add the embed-headers Middleware** in `prod/traefik-middlewares.yaml` after the `mediaviewer-embed-headers` block:

```yaml
---
# ── Embed headers for the agentic terminal iframe (web.${PROD_DOMAIN}) ──
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: terminal-embed-headers
  namespace: workspace
spec:
  headers:
    customResponseHeaders:
      X-Frame-Options: ""
      X-Content-Type-Options: "nosniff"
      Referrer-Policy: "strict-origin-when-cross-origin"
      X-Robots-Tag: "noindex"
      Content-Security-Policy: "frame-ancestors 'self' https://web.${PROD_DOMAIN}"
```

- [ ] **Step 6: Add the prod Ingress** in `prod/ingress.yaml` after the `workspace-ingress-remote` block (mirrors the mediaviewer embed-header wiring):

```yaml
---
# ── Agentic Terminal — SSO via oauth2-proxy, iframe-embeddable ─────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-terminal
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "${WORKSPACE_NAMESPACE}-redirect-https@kubernetescrd,${WORKSPACE_NAMESPACE}-hsts-headers@kubernetescrd,${WORKSPACE_NAMESPACE}-terminal-embed-headers@kubernetescrd"
spec:
  tls:
    - hosts:
        - terminal.${PROD_DOMAIN}
      secretName: ${TLS_SECRET_NAME}
  rules:
    - host: terminal.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-terminal
                port:
                  number: 4180
```

- [ ] **Step 7: Run the prod assertions — they now pass.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'prod'
# Expected: PASS
```

- [ ] **Step 8: Validate the rendered prod overlay builds.**

```bash
kustomize build prod-fleet/mentolder >/dev/null && echo "prod-fleet/mentolder builds"
# Expected: prints the confirmation line, exit 0
```

- [ ] **Step 9: Commit.**

```bash
git add prod/patch-oauth2-proxy-terminal.yaml prod/ingress.yaml prod/traefik-middlewares.yaml \
        prod/kustomization.yaml tests/spec/terminal-sidekick.bats
git commit -m "feat(terminal): prod overlay — TLS ingress + cross-origin cookie [T001565]"
```

---

### Task 5: ttyd host setup script

**Files:**
- Create: `scripts/terminal-sidekick-host.sh`
- Modify: `tests/spec/terminal-sidekick.bats`

**Interfaces:**
- Produces: an executable installer that stands up ttyd (bind wg-fleet IP, `--writable`) in front of tmux session `sidekick`. Referenced by the BATS spec (S4 reachability).

- [ ] **Step 1: Add the failing script assertion** to `tests/spec/terminal-sidekick.bats`:

```bash
@test "terminal: host setup script binds wg IP, is writable, opens four windows" {
  f="${REPO_ROOT}/scripts/terminal-sidekick-host.sh"
  [ -f "$f" ]
  [ -x "$f" ]
  grep -qE 'ttyd' "$f"
  grep -qE -- '--writable' "$f"
  grep -qE -- '--interface' "$f"
  # not bound to all interfaces
  ! grep -qE 'interface[= ]0\.0\.0\.0' "$f"
  # four agent windows
  for w in opencode hermes claude agy; do grep -qE "$w" "$f"; done
  # idempotent guard: checks for an existing session before creating one
  grep -qE 'has-session' "$f"
}
```

- [ ] **Step 2: Run it and confirm failure.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'host setup script'
# Expected: FAIL (red — script does not exist)
```

- [ ] **Step 3: Create `scripts/terminal-sidekick-host.sh`** (idempotent; installs ttyd, builds the tmux session, installs a systemd user unit):

```bash
#!/usr/bin/env bash
# scripts/terminal-sidekick-host.sh — WSL-host setup for the agentic terminal
# (T001565). Idempotent: safe to re-run. Installs ttyd, builds the persistent
# tmux session `sidekick` (4 agent windows, shells in the repo cwd — agents are
# NOT auto-started), and installs+enables the `terminal-sidekick` systemd user
# unit that runs ttyd bound ONLY to the wg-fleet IP with write access.
set -euo pipefail

WG_IP="${TERMINAL_WG_IP:-10.20.0.10}"   # wg-fleet overlay IP of this host
TTYD_PORT="${TTYD_PORT:-7681}"
SESSION="sidekick"
REPO_CWD="${TERMINAL_REPO_CWD:-$HOME/Bachelorprojekt}"
WINDOWS="opencode hermes claude agy"

log() { printf '[terminal-sidekick] %s\n' "$*"; }

# 1. ttyd present?
if ! command -v ttyd >/dev/null 2>&1; then
  log "installing ttyd via apt"
  sudo apt-get update -qq && sudo apt-get install -y ttyd
fi
command -v tmux >/dev/null 2>&1 || { sudo apt-get install -y tmux; }

# 2. tmux session — create only if absent (idempotent)
if tmux has-session -t "$SESSION" 2>/dev/null; then
  log "tmux session '$SESSION' already exists — leaving it"
else
  log "creating tmux session '$SESSION' with windows: $WINDOWS"
  first=1
  for w in $WINDOWS; do
    if [ "$first" = 1 ]; then
      tmux new-session -d -s "$SESSION" -n "$w" -c "$REPO_CWD"
      first=0
    else
      tmux new-window -t "$SESSION" -n "$w" -c "$REPO_CWD"
    fi
  done
fi

# 3. systemd user unit — ttyd bound to the wg IP only, writable
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/terminal-sidekick.service" <<EOF
[Unit]
Description=Agentic Terminal ttyd (tmux attach -t $SESSION)
After=network-online.target

[Service]
ExecStart=$(command -v ttyd) --interface $WG_IP --port $TTYD_PORT --writable tmux attach -t $SESSION
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

log "reloading + enabling terminal-sidekick.service"
systemctl --user daemon-reload
systemctl --user enable --now terminal-sidekick.service
log "done — ttyd on ${WG_IP}:${TTYD_PORT}"
```

- [ ] **Step 4: Make it executable and re-run the assertion.**

```bash
chmod +x scripts/terminal-sidekick-host.sh
tests/unit/lib/bats-core/bin/bats tests/spec/terminal-sidekick.bats -f 'host setup script'
# Expected: PASS
```

- [ ] **Step 5: Lint the script (no syntax errors).**

```bash
bash -n scripts/terminal-sidekick-host.sh && echo "syntax ok"
# Expected: prints "syntax ok"
```

- [ ] **Step 6: Commit.**

```bash
git add scripts/terminal-sidekick-host.sh tests/spec/terminal-sidekick.bats
git commit -m "feat(terminal): idempotent WSL host setup script (ttyd+tmux+systemd) [T001565]"
```

---

### Task 6: Frontend — swap grilling view for terminal

**Files:**
- Create: `website/src/components/mediaviewer/TerminalSessionHost.svelte`
- Modify: `website/src/components/PortalSidekick.svelte`, `website/src/components/assistant/SidekickHome.svelte`, `website/src/lib/assistant/sidekick-nudge.ts`, `website/src/components/PortalSidekick.test.ts`
- Delete: `website/src/components/mediaviewer/GrillingSessionHost.svelte`

**Interfaces:**
- Consumes: `terminalHost` prop passed by `AdminLayout.astro` (Task 1 step 9), default `terminal.localhost`.
- Produces: `terminal` view rendering `TerminalSessionHost` (iframe `title="Agentic Terminal"`, `src="https://${terminalHost}/"`). The `grilling` view id is removed everywhere.

- [ ] **Step 1: Write the failing Vitest** — append to `website/src/components/PortalSidekick.test.ts`:

```ts
describe('PortalSidekick — terminal view', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
  });

  it('renders the terminal iframe for admins and drops Final Grilling', async () => {
    const { getByLabelText, getByText, getByTitle, queryByText } = render(PortalSidekick, {
      helpContext: 'admin',
      terminalHost: 'terminal.localhost',
    });
    await fireEvent.click(getByLabelText('Sidekick öffnen'));
    expect(queryByText('Final Grilling')).toBeNull();
    await fireEvent.click(getByText('Agentic Terminal'));
    const iframe = getByTitle('Agentic Terminal') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://terminal.localhost/');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

```bash
cd website && pnpm vitest run src/components/PortalSidekick.test.ts
# expected: FAIL (red — Agentic Terminal item and TerminalSessionHost do not exist yet)
```

- [ ] **Step 3: Create `website/src/components/mediaviewer/TerminalSessionHost.svelte`:**

```svelte
<script lang="ts">
  let { terminalHost = 'terminal.localhost' }: { terminalHost?: string } = $props();
  const src = $derived(`https://${terminalHost}/`);
</script>

<div class="th-panel">
  <div class="th-bar">
    <span class="th-label">Live-Terminal · lokale Agenten</span>
    <a class="th-newtab" href={src} target="_blank" rel="noopener noreferrer">In neuem Tab öffnen ↗</a>
  </div>
  <iframe
    {src}
    title="Agentic Terminal"
    allow="clipboard-read; clipboard-write"
  ></iframe>
</div>

<style>
  .th-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #0b111c; }
  .th-bar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 10px 16px; border-bottom: 1px solid rgba(232,200,112,.12);
  }
  .th-label { font-size: 13px; color: var(--mute, #94a3b8); }
  .th-newtab { font-size: 13px; color: oklch(0.83 0.09 75); text-decoration: none; }
  .th-newtab:hover { text-decoration: underline; }
  iframe { flex: 1; width: 100%; height: 100%; border: 0; }
</style>
```

- [ ] **Step 4: Swap the view in `website/src/components/PortalSidekick.svelte`.** Replace the `GrillingSessionHost` import (line 10) with `TerminalSessionHost`:

```svelte
  import TerminalSessionHost from './mediaviewer/TerminalSessionHost.svelte';
```

Change the `View` union (line 19) `grilling` → `terminal`:

```svelte
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'terminal' | 'cockpit' | 'ai-quality' | 'logs';
```

Add the `terminalHost` prop to the `$props()` destructuring and its type (alongside `mediaviewerHost`, lines 24 + 28):

```svelte
    mediaviewerHost = 'mediaviewer.localhost',
    terminalHost = 'terminal.localhost',
    videovaultHost = 'videovault.localhost',
```

```svelte
    mediaviewerHost?: string;
    terminalHost?: string;
    videovaultHost?: string;
```

Change the `titleMap` entry (line 62) `grilling` → `terminal`:

```svelte
    terminal: 'Agentic Terminal',
```

Replace the drawer-body branch (lines 245-246):

```svelte
    {:else if view === 'terminal'}
      <TerminalSessionHost {terminalHost} />
```

- [ ] **Step 5: Swap the menu item in `website/src/components/assistant/SidekickHome.svelte`.** Update the `View` type (line 2) `grilling`→`terminal`, and replace the grilling item (line 28):

```svelte
    { id: 'terminal',      no: '02', title: 'Agentic Terminal',     sub: 'Live-Terminal · lokale Agenten', show: isAdmin },
```

- [ ] **Step 6: Update `website/src/lib/assistant/sidekick-nudge.ts`.** Replace `grilling`→`terminal` in the `SidekickView` union (line 5) and `KNOWN_VIEWS` set (line 8):

```ts
  | 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'cockpit' | 'mediaviewer' | 'terminal' | 'ai-quality';
```

```ts
  'home', 'support', 'questionnaire', 'help', 'agent-guide', 'cockpit', 'mediaviewer', 'terminal', 'ai-quality',
```

- [ ] **Step 7: Delete the obsolete component.**

```bash
git rm website/src/components/mediaviewer/GrillingSessionHost.svelte
```

- [ ] **Step 8: Run the Vitest — it now passes.**

```bash
cd website && pnpm vitest run src/components/PortalSidekick.test.ts
# Expected: PASS (both the mediaviewer and the terminal describe blocks green)
```

- [ ] **Step 9: Type-check the frontend (no dangling `grilling` references).**

```bash
cd website && pnpm astro check 2>&1 | grep -iE 'grilling|GrillingSessionHost' && echo "STALE REF" || echo "no stale grilling refs"
# Expected: prints "no stale grilling refs"
```

- [ ] **Step 10: Commit.**

```bash
git add website/src/components/mediaviewer/TerminalSessionHost.svelte \
        website/src/components/PortalSidekick.svelte \
        website/src/components/assistant/SidekickHome.svelte \
        website/src/lib/assistant/sidekick-nudge.ts \
        website/src/components/PortalSidekick.test.ts
git commit -m "feat(terminal): swap grilling sidekick view for agentic terminal [T001565]"
```

---

### Task 7: Manual one-time steps (manual, NOT CI-blocking)

These steps run once against live infrastructure. They are **manual and do not block CI** — no code changes, no test gate. Document completion in the PR description.

- [ ] **Step 1: Add the WSL host as a fleet wg peer.** Replace `REPLACE_WITH_WSL_HOST_PUBLIC_KEY` in `wireguard/wg-mesh-nodes.yaml` with the WSL host's real public key, then bring up the peer on the WSL host and add the symmetric peer entry on all 6 fleet nodes (pk-hetzner-4/6/8 + gekko-hetzner-2/3/4) per the fleet mesh-symmetry requirement (`openspec/specs/fleet-operations.md`).

- [ ] **Step 2: Run the host setup script on the WSL host.**

```bash
bash scripts/terminal-sidekick-host.sh
# verify: systemctl --user status terminal-sidekick.service  → active (running)
# verify: ss -tlnp | grep 7681  → bound to 10.20.0.10:7681, not 0.0.0.0
```

- [ ] **Step 3: Create the Pocket-ID group and enable the groups claim.** In the Pocket-ID admin UI: create group `terminal-admins`, assign Patrick. On the `terminal-sidekick` client, enable the `groups` scope/claim so the ID token carries `groups` (the seed job creates the client but does not set scopes). Verify a login token contains the `groups` claim.

- [ ] **Step 4: Reseal after the client was newly created.** The seed job writes `POCKET_ID_TERMINAL_SECRET` back into live `workspace-secrets` on first create. Mirror it into the sealed source and reseal (T001438 rule):

```bash
# read the generated value from the live cluster, write it into the plaintext secrets file
kubectl --context fleet -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.POCKET_ID_TERMINAL_SECRET}' | base64 -d
# → paste into environments/.secrets/mentolder.yaml (and korczewski.yaml), then:
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

- [ ] **Step 5: Smoke-test the live route.** Visit `https://terminal.${PROD_DOMAIN}` (resolved per brand) as a `terminal-admins` member → terminal loads; as a non-member → 403; the Sidekick iframe and the "In neuem Tab öffnen" fallback both work.

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Regenerate the test inventory** (a new BATS spec + a new Vitest case were added):

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/terminal-sidekick.bats
git commit -m "chore(terminal): regenerate test inventory [T001565]"
```

- [ ] **Step 2: Validate manifests render** across dev + both prod brands:

```bash
task workspace:validate
# Expected: kustomize builds for k3d/, prod-fleet/mentolder, prod-fleet/korczewski all succeed
```

- [ ] **Step 3: Confirm no CQ02 regression** (any-count must stay ≤ 200):

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
# Expected: any count: 10 (limit: 200), exit 0
```

- [ ] **Step 4: Confirm no hardcoded brand hostnames** in the new/changed manifests (S3):

```bash
! grep -REn 'terminal\.(mentolder|korczewski)\.de' k3d/ prod/ website/src/ && echo "S3 clean"
# Expected: prints "S3 clean"
```

- [ ] **Step 5: Run the three mandatory CI gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Expected: `task test:changed` runs the terminal BATS spec + the PortalSidekick Vitest + quality checks green; `task freshness:regenerate` leaves the tree clean (commit any regenerated artifacts); `task freshness:check` passes the S1–S4 ratchet and baseline key-count assertion.

- [ ] **Step 6: Commit any freshness artifacts and open the PR.**

```bash
git add -A && git commit -m "chore(terminal): freshness artifacts [T001565]" || echo "nothing to regenerate"
```
