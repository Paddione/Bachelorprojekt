---
title: "rustdesk-web-client — Implementation Plan"
ticket_id: T001381
domains: [infra, security, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rustdesk-web-client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the RustDesk browser web-client for Patrick and gekko through an SSO gate (Pocket-ID + oauth2-proxy + Traefik) that fronts the two additional relay WebSocket ports (21118 hbbs, 21119 hbbr), without ever exposing those ports to the public internet.

**Architecture:** hbbs/hbbr open ports 21118/21119 as extra `hostPort`s on `${TURN_NODE}` (pk-hetzner-4). `ufw` allows them **only from the `wg-fleet` overlay (`10.20.0.0/16`)**, never publicly. Two selector-less `Service`+`Endpoints` pairs in the workspace namespace bridge to `${TURN_OVERLAY_IP}:21118/:21119`; a single `oauth2-proxy-rustdesk-web` (1:1 copy of the `oauth2-proxy-downloads` pattern, new Pocket-ID client `rustdesk-web`) fronts both bridges under the shared hostname `remote.<domain>`, wired through the existing dev `k3d/ingress.yaml` + prod `prod/ingress.yaml` mechanism.

**Tech Stack:** Kubernetes (Kustomize base `k3d/` + prod overlay `prod/`), Traefik Ingress, `quay.io/oauth2-proxy/oauth2-proxy:v7.9.0`, Pocket-ID OIDC, BATS, `ufw` (cloud-init), `envsubst`.

## Global Constraints

- **S1 line-limits do NOT apply to any file this plan touches.** Every changed/created file is `.yaml`, `.yml`, `.tmpl` or `.bats`. `docs/code-quality/gates.yaml → s1.limits` lists only code extensions (`.astro .ts .svelte .sh .mjs .mts .py .js .jsx .tsx .cjs .bash .java .php`); none of these extensions appear there, and a `jq 'keys[]'` scan of `docs/code-quality/baseline.json` returns **zero** `.yaml/.yml/.tmpl/.bats` keys. Therefore per-file S1 budget = **n/a (extension out of S1 scope, not baselined)**. Each task still records `wc -l` for size awareness. Do **not** add a baseline or ignore entry — `freshness:check` Phase 3 asserts the baseline key-count against main.
- **S3 — no brand-domain literals.** In `k3d/`, `prod*/` and `website/src/` the strings `*.mentolder.de` / `*.korczewski.de` are forbidden (comments excepted). Dev manifests use `remote.localhost`; prod manifests use `remote.${PROD_DOMAIN}`. Never hardcode `remote.mentolder.de` in code.
- **S4 — no orphan manifests.** Every new `k3d/*.yaml` must be referenced from a `kustomization.yaml`. New manifests: `k3d/rustdesk-web-bridge.yaml` + `k3d/oauth2-proxy-rustdesk-web.yaml` → `k3d/kustomization.yaml`; prod patch `prod/patch-oauth2-proxy-rustdesk-web.yaml` → `prod/kustomization.yaml`.
- **Image pins.** `oauth2-proxy` and its init `busybox` are digest-pinned verbatim from `oauth2-proxy-downloads.yaml` (`v7.9.0@sha256:37c1570c…`, `busybox:1.38.0@sha256:fd8d9aa6…`). hbbs/hbbr keep the existing `rustdesk/rustdesk-server:1.1.15@sha256:10818ec0…` pin.
- **wg-fleet overlay values (verbatim from `wireguard/wg-mesh-nodes.yaml → fleet`):** `pk-hetzner-4` overlay IP = `10.20.0.1`; the spec-mandated firewall source CIDR is the superset `10.20.0.0/16`.
- **Deploy path.** `k3d/` is deployed by `task workspace:deploy ENV=<brand>` (envsubst list in `Taskfile.yml`). `k3d/rustdesk-stack/` is applied separately by the shared-services step with `envsubst '$TURN_NODE'`. Only the hbbs/hbbr port additions live in `rustdesk-stack`; the bridge + oauth2-proxy + ingress live in the workspace base `k3d/`.

## File Structure

```
NEW  k3d/rustdesk-web-bridge.yaml            # 2 selector-less Services + 2 Endpoints → ${TURN_OVERLAY_IP}:21118/:21119 (workspace ns)
NEW  k3d/oauth2-proxy-rustdesk-web.yaml      # Deployment + Service, dev values, client rustdesk-web (copy of oauth2-proxy-downloads.yaml)
NEW  prod/patch-oauth2-proxy-rustdesk-web.yaml  # strategic-merge: prod redirect/issuer URLs, cookie-secure=true

MOD  k3d/rustdesk-stack/hbbs.yaml            # + containerPort/hostPort 21118/tcp
MOD  k3d/rustdesk-stack/hbbr.yaml            # + containerPort/hostPort 21119/tcp
MOD  k3d/kustomization.yaml                  # + rustdesk-web-bridge.yaml, oauth2-proxy-rustdesk-web.yaml
MOD  prod/kustomization.yaml                 # + patch-oauth2-proxy-rustdesk-web.yaml
MOD  k3d/ingress.yaml                        # + dev rule host remote.localhost → oauth2-proxy-rustdesk-web:4180
MOD  prod/ingress.yaml                       # + prod Ingress workspace-ingress-remote host remote.${PROD_DOMAIN}
MOD  k3d/configmap-domains.yaml              # + REMOTE_DOMAIN: remote.localhost
MOD  prod/configmap-domains.yaml             # + REMOTE_DOMAIN: remote.${PROD_DOMAIN}
MOD  k3d/pocket-id-client-seed.yaml          # + SECRET_rustdeskweb env + ROWS entry for client rustdesk-web
MOD  k3d/secrets.yaml                        # + dev POCKET_ID_RUSTDESK_WEB_SECRET
MOD  environments/schema.yaml                # + TURN_OVERLAY_IP (env_var) + POCKET_ID_RUSTDESK_WEB_SECRET (secret)
MOD  environments/mentolder.yaml             # + TURN_OVERLAY_IP: "10.20.0.1"
MOD  environments/korczewski.yaml            # + TURN_OVERLAY_IP: "10.20.0.1"  (both brands deploy k3d/ to their ns)
MOD  Taskfile.yml                            # + $TURN_OVERLAY_IP in the two ENVSUBST_VARS lists + default-export guard
MOD  prod/cloud-init.yaml                    # + ufw allow from 10.20.0.0/16 to any port 21118,21119 proto tcp
MOD  scripts/hetzner/cloud-init.yaml.tmpl    # same ufw rule
MOD  scripts/hetzner/cloud-init-server.yaml.tmpl  # same ufw rule
MOD  tests/spec/rustdesk-server.bats         # invert "ports absent" → positive assertions; bridge/proxy/ingress/ufw checks
MOD  environments/.secrets/mentolder.yaml + environments/sealed-secrets/mentolder.yaml  # sealed POCKET_ID_RUSTDESK_WEB_SECRET
```

---

### Task 1: RED — failing BATS structure test

**Files:**
- Test: `tests/spec/rustdesk-server.bats` (156-byte header preserved; `wc -l` before = 58; extension `.bats` → **S1 budget n/a**)

This is the mandatory rot→grün failing-test step. It asserts the target structure across the relay stack, the workspace base, and the three cloud-init files. It **fails on the current branch** because none of it exists yet, and because the existing `@test "…ports 21118/21119 are absent"` encodes the opposite contract (it must be replaced, not merely extended).

- [ ] **Step 1: Replace the negative port test and add the new positive assertions.**

Remove the obsolete test:

```bash
# delete the whole @test block asserting the ports are absent
@test "rustdesk: web-client ports 21118/21119 are absent" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  ! echo "$out" | grep -qE '2111[89]'
}
```

Extend `setup()` with a workspace-base handle and add the new tests (append after the hbbr port test):

```bash
setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  STACK="${REPO_ROOT}/k3d/rustdesk-stack"
  K3D="${REPO_ROOT}/k3d"
}

@test "rustdesk-web: hbbs adds web-client port 21118/tcp, hbbr adds 21119/tcp" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$STACK")"
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21118'
  echo "$out" | grep -qE 'hostPort:[[:space:]]*21119'
}

@test "rustdesk-web: bridge Services are selector-less with matching Endpoints to \${TURN_OVERLAY_IP}" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$K3D" --load-restrictor=LoadRestrictionsNone)"
  # both bridge Services exist
  echo "$out" | grep -qE 'name:[[:space:]]*rustdesk-web-hbbs'
  echo "$out" | grep -qE 'name:[[:space:]]*rustdesk-web-hbbr'
  # matching Endpoints object referencing the overlay IP placeholder
  echo "$out" | grep -qE 'kind:[[:space:]]*Endpoints'
  echo "$out" | grep -qE 'ip:[[:space:]]*"?\$\{TURN_OVERLAY_IP\}"?'
  # the bridge Services must NOT carry a selector (manually managed Endpoints)
  svc_block="$(echo "$out" | awk '/name: rustdesk-web-hbbs/,/^---/')"
  ! echo "$svc_block" | grep -qE '^\s*selector:'
}

@test "rustdesk-web: oauth2-proxy-rustdesk-web fronts the bridges (downloads pattern)" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$K3D" --load-restrictor=LoadRestrictionsNone)"
  echo "$out" | grep -qE 'name:[[:space:]]*oauth2-proxy-rustdesk-web'
  echo "$out" | grep -qE 'client-id=rustdesk-web'
  echo "$out" | grep -qE 'rustdesk-web-hbbs:21118'
  echo "$out" | grep -qE 'rustdesk-web-hbbr:21119'
}

@test "rustdesk-web: dev ingress routes remote.localhost to the proxy" {
  command -v kustomize >/dev/null || skip "kustomize not installed"
  out="$(kustomize build "$K3D" --load-restrictor=LoadRestrictionsNone)"
  echo "$out" | grep -qE 'host:[[:space:]]*remote\.localhost'
}

@test "rustdesk-web: every ufw 21118/21119 rule is overlay-restricted (10.20.0.0/16)" {
  for f in prod/cloud-init.yaml \
           scripts/hetzner/cloud-init.yaml.tmpl \
           scripts/hetzner/cloud-init-server.yaml.tmpl; do
    # the port rule must exist
    grep -qE '2111[89]' "${REPO_ROOT}/${f}"
    # and NO 21118/21119 line may lack the overlay CIDR (guards public exposure)
    ! grep -E '2111[89]' "${REPO_ROOT}/${f}" | grep -vqE '10\.20\.0\.0/16'
  done
}
```

- [ ] **Step 2: Run the test and confirm it fails (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
# expected: FAIL (red — ports, bridge, proxy, ingress and ufw rules are not implemented yet)
```

- [ ] **Step 3: Commit the failing test.**

```bash
git add tests/spec/rustdesk-server.bats
git commit -m "test(rustdesk-web): RED structure test for SSO-gated web client [T001381]"
```

---

### Task 2: hbbs/hbbr web-client port additions

**Files:**
- Modify: `k3d/rustdesk-stack/hbbs.yaml` (`wc -l` = 66 · S1 n/a)
- Modify: `k3d/rustdesk-stack/hbbr.yaml` (`wc -l` = 45 · S1 n/a)

**Interfaces:**
- Produces: hostPort `21118/tcp` on hbbs, `21119/tcp` on hbbr — the overlay targets that Task 3's Endpoints point at.

- [ ] **Step 1: Add port 21118 to hbbs.** In `k3d/rustdesk-stack/hbbs.yaml`, append to the `ports:` list (after the existing UDP 21116 entry):

```yaml
            - containerPort: 21118
              hostPort: 21118
              protocol: TCP
```

- [ ] **Step 2: Add port 21119 to hbbr.** In `k3d/rustdesk-stack/hbbr.yaml`, append to the `ports:` list (after the existing 21117 entry):

```yaml
            - containerPort: 21119
              hostPort: 21119
              protocol: TCP
```

- [ ] **Step 3: Verify the stack still builds.**

```bash
kustomize build k3d/rustdesk-stack | grep -E 'hostPort: 2111[89]'
# expected: two lines — hostPort: 21118 and hostPort: 21119
```

- [ ] **Step 4: Commit.**

```bash
git add k3d/rustdesk-stack/hbbs.yaml k3d/rustdesk-stack/hbbr.yaml
git commit -m "feat(rustdesk-web): open hbbs 21118 + hbbr 21119 web-client ports [T001381]"
```

---

### Task 3: Overlay-bridge Services + Endpoints

**Files:**
- Create: `k3d/rustdesk-web-bridge.yaml`
- Modify: `k3d/kustomization.yaml` (`wc -l` = 108 · S1 n/a)

**Interfaces:**
- Consumes: hbbs `21118` / hbbr `21119` on `${TURN_OVERLAY_IP}` (Task 2 ports + Task 6 env var).
- Produces: in-cluster Services `rustdesk-web-hbbs:21118` and `rustdesk-web-hbbr:21119` — the upstreams Task 4's oauth2-proxy dials.

- [ ] **Step 1: Create `k3d/rustdesk-web-bridge.yaml`.** Selector-less Services with manually-managed Endpoints (the top-level `namespace:` transformer in `k3d/kustomization.yaml` places them in the target workspace ns; the Endpoints IP is `envsubst`-substituted at deploy time):

```yaml
# ═══════════════════════════════════════════════════════════════════
# rustdesk-web bridge — selector-less Services → hbbs/hbbr web-client
# ports on the wg-fleet overlay address of ${TURN_NODE}. hbbs/hbbr run
# hostNetwork on ${TURN_NODE}; there are no pod IPs to select, so we
# point Endpoints straight at the overlay IP (${TURN_OVERLAY_IP}).
# ═══════════════════════════════════════════════════════════════════
apiVersion: v1
kind: Service
metadata:
  name: rustdesk-web-hbbs
  labels:
    app: rustdesk-web
spec:
  ports:
    - name: hbbs-ws
      port: 21118
      targetPort: 21118
      protocol: TCP
---
apiVersion: v1
kind: Endpoints
metadata:
  name: rustdesk-web-hbbs
  labels:
    app: rustdesk-web
subsets:
  - addresses:
      - ip: "${TURN_OVERLAY_IP}"
    ports:
      - name: hbbs-ws
        port: 21118
        protocol: TCP
---
apiVersion: v1
kind: Service
metadata:
  name: rustdesk-web-hbbr
  labels:
    app: rustdesk-web
spec:
  ports:
    - name: hbbr-ws
      port: 21119
      targetPort: 21119
      protocol: TCP
---
apiVersion: v1
kind: Endpoints
metadata:
  name: rustdesk-web-hbbr
  labels:
    app: rustdesk-web
subsets:
  - addresses:
      - ip: "${TURN_OVERLAY_IP}"
    ports:
      - name: hbbr-ws
        port: 21119
        protocol: TCP
```

- [ ] **Step 2: Reference it in `k3d/kustomization.yaml`.** Add, immediately before the `# Ingress` / `- ingress.yaml` block:

```yaml
  # RustDesk web-client SSO bridge (T001381)
  - rustdesk-web-bridge.yaml
  - oauth2-proxy-rustdesk-web.yaml
```

- [ ] **Step 3: Verify (Endpoints render with the placeholder, selector absent).**

```bash
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | grep -E 'rustdesk-web-hbb[sr]|TURN_OVERLAY_IP'
# expected: both Services + both Endpoints, ip: "${TURN_OVERLAY_IP}" twice
```

- [ ] **Step 4: Commit.**

```bash
git add k3d/rustdesk-web-bridge.yaml k3d/kustomization.yaml
git commit -m "feat(rustdesk-web): selector-less overlay bridge Services + Endpoints [T001381]"
```

---

### Task 4: oauth2-proxy-rustdesk-web (dev) + Pocket-ID client + dev secret

**Files:**
- Create: `k3d/oauth2-proxy-rustdesk-web.yaml`
- Modify: `k3d/pocket-id-client-seed.yaml` (`wc -l` = 208 · S1 n/a)
- Modify: `k3d/secrets.yaml`

**Interfaces:**
- Consumes: bridge Services `rustdesk-web-hbbs:21118` / `rustdesk-web-hbbr:21119` (Task 3); secret `POCKET_ID_RUSTDESK_WEB_SECRET`.
- Produces: Service `oauth2-proxy-rustdesk-web:4180` — the backend Task 8's ingress targets.

- [ ] **Step 1: Create `k3d/oauth2-proxy-rustdesk-web.yaml`** as a 1:1 copy of `oauth2-proxy-downloads.yaml` with these substitutions: name `oauth2-proxy-rustdesk-web`, label `app: rustdesk-web`, `--client-id=rustdesk-web`, `--client-secret=$(POCKET_ID_RUSTDESK_WEB_SECRET)`, `--redirect-url=http://remote.localhost/oauth2/callback`, `--cookie-name=_oauth2_proxy_rustdesk_web`, `--oidc-extra-audience=rustdesk-web`, the two bridge upstreams, and the secret env. Init-container `write-cookie-secret` (busybox pin + OAUTH2_PROXY_COOKIE_SECRET) is copied verbatim. Upstream routing: `/ws/relay*` → hbbr, everything else → hbbs.

```yaml
# ═══════════════════════════════════════════════════════════════════
# OAuth2 Proxy — Pocket ID SSO gateway for the RustDesk web client
# Authenticates via OIDC, then forwards to the hbbs/hbbr overlay bridge
# (rustdesk-web-hbbs:21118 signalling, rustdesk-web-hbbr:21119 relay).
# ═══════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-rustdesk-web
  labels:
    app: rustdesk-web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: oauth2-proxy-rustdesk-web
  template:
    metadata:
      labels:
        app: oauth2-proxy-rustdesk-web
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
            requests:
              cpu: 10m
              memory: 32Mi
            limits:
              memory: 64Mi
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
            - --client-id=rustdesk-web
            - --client-secret=$(POCKET_ID_RUSTDESK_WEB_SECRET)
            - --redirect-url=http://remote.localhost/oauth2/callback
            - --oidc-issuer-url=http://pocket-id:1411
            - --ssl-insecure-skip-verify=true
            - --skip-oidc-discovery=true
            - --login-url=http://auth.localhost/authorize
            - --redeem-url=http://pocket-id:1411/api/oidc/token
            - --oidc-jwks-url=http://pocket-id:1411/.well-known/jwks.json
            - --profile-url=http://pocket-id:1411/api/oidc/userinfo
            - --upstream=http://rustdesk-web-hbbr:21119/ws/relay
            - --upstream=http://rustdesk-web-hbbs:21118
            - --http-address=0.0.0.0:4180
            - --cookie-secure=false
            - --cookie-name=_oauth2_proxy_rustdesk_web
            - --email-domain=*
            - --pass-access-token=true
            - --pass-authorization-header=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            - --code-challenge-method=S256
            - --insecure-oidc-allow-unverified-email=true
            - --oidc-extra-audience=rustdesk-web
            - --scope=openid email profile
          env:
            - name: POCKET_ID_RUSTDESK_WEB_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: POCKET_ID_RUSTDESK_WEB_SECRET
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
            httpGet:
              path: /ping
              port: 4180
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /ping
              port: 4180
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              memory: 64Mi
              cpu: "50m"
            limits:
              memory: 128Mi
              cpu: "200m"
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
  name: oauth2-proxy-rustdesk-web
  labels:
    app: rustdesk-web
spec:
  selector:
    app: oauth2-proxy-rustdesk-web
  ports:
    - port: 4180
      targetPort: 4180
```

> **WebSocket path note (not a placeholder — the design's rollback plan flags this as the one live-verified detail):** hbbr relay is mounted at `/ws/relay`, hbbs signalling at `/` (catch-all). The manual WebSocket verification in Task 12 confirms the RustDesk 1.1.15 web client uses these paths; the plan commits to them rather than leaving them open.

- [ ] **Step 2: Register the Pocket-ID client in `k3d/pocket-id-client-seed.yaml`.** Add a `SECRET_rustdeskweb` env entry after the `SECRET_website` block (~line 124):

```yaml
            - name: SECRET_rustdeskweb
              valueFrom: { secretKeyRef: { name: workspace-secrets, key: POCKET_ID_RUSTDESK_WEB_SECRET, optional: true } }
```

Add a `ROWS` entry after the `website|SECRET_website|…` line (~line 161), using the same `${SCHEME}`/`${SUFFIX}` derivation (renders `remote.localhost` in dev, `remote.<domain>` in prod — S3-safe, no brand literal):

```
              rustdesk-web|SECRET_rustdeskweb|${SCHEME}://remote.${SUFFIX}/oauth2/callback
```

- [ ] **Step 3: Add the dev secret to `k3d/secrets.yaml`** (after `POCKET_ID_STUDIO_SECRET`, dev-only 30-char placeholder like the siblings):

```yaml
  POCKET_ID_RUSTDESK_WEB_SECRET: "devrustdeskwebpocketidsecret12"
```

- [ ] **Step 4: Verify the base renders with the client-id and both upstreams.**

```bash
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | grep -E 'oauth2-proxy-rustdesk-web|client-id=rustdesk-web|rustdesk-web-hbb[sr]:2111[89]'
# expected: Deployment+Service names, client-id=rustdesk-web, both upstream lines
```

- [ ] **Step 5: Commit.**

```bash
git add k3d/oauth2-proxy-rustdesk-web.yaml k3d/pocket-id-client-seed.yaml k3d/secrets.yaml
git commit -m "feat(rustdesk-web): oauth2-proxy + Pocket-ID client rustdesk-web (dev) [T001381]"
```

---

### Task 5: prod oauth2-proxy patch

**Files:**
- Create: `prod/patch-oauth2-proxy-rustdesk-web.yaml`
- Modify: `prod/kustomization.yaml`

- [ ] **Step 1: Create `prod/patch-oauth2-proxy-rustdesk-web.yaml`** (strategic-merge, mirroring `prod/patch-oauth2-proxy-downloads.yaml`: prod redirect/issuer URLs on `auth.${PROD_DOMAIN}`, `--cookie-secure=true`, the two bridge upstreams retained):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-rustdesk-web
spec:
  template:
    spec:
      containers:
        - name: oauth2-proxy
          args:
            - "--config=/run/config/oauth2-extra.cfg"
            - "--provider=oidc"
            - "--client-id=rustdesk-web"
            - "--client-secret=$(POCKET_ID_RUSTDESK_WEB_SECRET)"
            - "--redirect-url=https://remote.${PROD_DOMAIN}/oauth2/callback"
            - "--oidc-issuer-url=https://auth.${PROD_DOMAIN}"
            - "--ssl-insecure-skip-verify=true"
            - "--skip-oidc-discovery=true"
            - "--login-url=https://auth.${PROD_DOMAIN}/authorize"
            - "--redeem-url=https://auth.${PROD_DOMAIN}/api/oidc/token"
            - "--oidc-jwks-url=https://auth.${PROD_DOMAIN}/.well-known/jwks.json"
            - "--profile-url=https://auth.${PROD_DOMAIN}/api/oidc/userinfo"
            - "--upstream=http://rustdesk-web-hbbr:21119/ws/relay"
            - "--upstream=http://rustdesk-web-hbbs:21118"
            - "--http-address=0.0.0.0:4180"
            - "--cookie-secure=true"
            - "--cookie-name=_oauth2_proxy_rustdesk_web"
            - "--email-domain=*"
            - "--pass-access-token=true"
            - "--pass-authorization-header=true"
            - "--set-xauthrequest=true"
            - "--skip-provider-button=true"
            - "--code-challenge-method=S256"
            - "--insecure-oidc-allow-unverified-email=true"
            - "--oidc-extra-audience=rustdesk-web"
            - "--scope=openid email profile"
          env:
            - name: POCKET_ID_RUSTDESK_WEB_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: POCKET_ID_RUSTDESK_WEB_SECRET
```

- [ ] **Step 2: Reference the patch in `prod/kustomization.yaml`** — add after the `patch-oauth2-proxy-videovault.yaml` line in the `patches:` list:

```yaml
  - path: patch-oauth2-proxy-rustdesk-web.yaml
```

- [ ] **Step 3: Verify the prod overlay builds and the patch is applied.**

```bash
kustomize build prod/ --load-restrictor=LoadRestrictionsNone \
  | grep -E 'remote\.\$\{PROD_DOMAIN\}/oauth2/callback|cookie-secure=true'
# expected: prod redirect-url line + cookie-secure=true from the patch
```

- [ ] **Step 4: Commit.**

```bash
git add prod/patch-oauth2-proxy-rustdesk-web.yaml prod/kustomization.yaml
git commit -m "feat(rustdesk-web): prod oauth2-proxy patch (auth.\${PROD_DOMAIN}) [T001381]"
```

---

### Task 6: TURN_OVERLAY_IP env-var registration

**Files:**
- Modify: `environments/schema.yaml` (`wc -l` = 1281 · `.yaml`, S1 n/a)
- Modify: `environments/mentolder.yaml` (`wc -l` = 132 · S1 n/a)
- Modify: `environments/korczewski.yaml` (S1 n/a)
- Modify: `Taskfile.yml` (`wc -l` = 4492 · `.yml`, S1 n/a)

**Interfaces:**
- Produces: `${TURN_OVERLAY_IP}` — substituted into Task 3's Endpoints during `workspace:deploy`.

- [ ] **Step 1: Register `TURN_OVERLAY_IP` in `environments/schema.yaml`** — add directly after the `TURN_NODE` entry (~line 158, so the wg-fleet var sits next to the node pin):

```yaml
  - name: TURN_OVERLAY_IP
    required: true
    default_dev: "127.0.0.1"
    validate: "^[0-9.]+$"
    description: "wg-fleet overlay IP of ${TURN_NODE} (fleet pk-hetzner-4 = 10.20.0.1). Endpoints target for the RustDesk web-client bridge (T001381)."
```

- [ ] **Step 2: Register the Pocket-ID secret in `environments/schema.yaml`** — add after `POCKET_ID_STUDIO_SECRET` (~line 734) in the `secrets:` block:

```yaml
  - name: POCKET_ID_RUSTDESK_WEB_SECRET
    required: false
    generate: true
    length: 40
    description: "OIDC client secret for the `rustdesk-web` Pocket ID client (oauth2-proxy-rustdesk-web)."
```

- [ ] **Step 3: Add the value to `environments/mentolder.yaml`** — insert after the `TURN_NODE: "pk-hetzner-4"` line (~line 33):

```yaml
  TURN_OVERLAY_IP: "10.20.0.1"
```

- [ ] **Step 4: Add the same value to `environments/korczewski.yaml`** — insert after its `TURN_NODE: "pk-hetzner-4"` line (~line 36). Rationale: `k3d/` (including the bridge) deploys to **both** brand namespaces on the fleet cluster; both resolve `${TURN_NODE}` to `pk-hetzner-4`, whose overlay IP is `10.20.0.1`. Setting it on both keeps the korczewski deploy from rendering a literal `${TURN_OVERLAY_IP}`:

```yaml
  TURN_OVERLAY_IP: "10.20.0.1"
```

- [ ] **Step 5: Add `$TURN_OVERLAY_IP` to both `ENVSUBST_VARS` lists in `Taskfile.yml`.** These sit next to the existing `$TURN_PUBLIC_IP $TURN_NODE` entries — edit the two `.../TURN_PUBLIC_IP \$TURN_NODE \$BRAND_ID"` lines (the `workspace:setup` list ~line 2586 and the `workspace:deploy` list ~line 2720):

```yaml
          ENVSUBST_VARS="$ENVSUBST_VARS \$WEBSITE_IMAGE \$TURN_PUBLIC_IP \$TURN_NODE \$TURN_OVERLAY_IP \$BRAND_ID"
```

- [ ] **Step 6: Add a default-export guard in `Taskfile.yml`.** Next to the other `export …:-…` defaults in the deploy task (near the `export POCKET_ID_URL=…` block ~line 2611), add — so any fleet brand/dev env without an explicit value still renders a valid IP instead of the literal token:

```yaml
          export TURN_OVERLAY_IP="${TURN_OVERLAY_IP:-127.0.0.1}"
```

- [ ] **Step 7: Verify the schema validates and mentolder resolves the var.**

```bash
task env:validate ENV=mentolder
bash scripts/env-resolve.sh mentolder 2>/dev/null | grep -E '^TURN_OVERLAY_IP='
# expected: env:validate passes; TURN_OVERLAY_IP=10.20.0.1
```

- [ ] **Step 8: Commit.**

```bash
git add environments/schema.yaml environments/mentolder.yaml environments/korczewski.yaml Taskfile.yml
git commit -m "feat(rustdesk-web): register TURN_OVERLAY_IP + rustdesk-web secret [T001381]"
```

---

### Task 7: Firewall templates — overlay-restricted 21118/21119

**Files:**
- Modify: `prod/cloud-init.yaml` (`wc -l` = 192 · S1 n/a)
- Modify: `scripts/hetzner/cloud-init.yaml.tmpl` (`wc -l` = 70 · S1 n/a)
- Modify: `scripts/hetzner/cloud-init-server.yaml.tmpl` (`wc -l` = 82 · S1 n/a)

- [ ] **Step 1: `prod/cloud-init.yaml`** — after `- ufw allow 21117/tcp     # RustDesk hbbr relay` (line 126) add:

```yaml
  - ufw allow from 10.20.0.0/16 to any port 21118,21119 proto tcp  # RustDesk web-client (hbbs/hbbr WS) — wg-fleet overlay only, never public
```

- [ ] **Step 2: `scripts/hetzner/cloud-init.yaml.tmpl`** — after `- ufw allow 21117/tcp comment 'RustDesk hbbr relay'` (line 55) add:

```yaml
  - ufw allow from 10.20.0.0/16 to any port 21118,21119 proto tcp comment 'RustDesk web-client (hbbs/hbbr WS) — overlay only'
```

- [ ] **Step 3: `scripts/hetzner/cloud-init-server.yaml.tmpl`** — after `- ufw allow 21117/tcp comment 'RustDesk hbbr relay'` (line 63) add the identical line from Step 2.

- [ ] **Step 4: Verify no public 21118/21119 rule leaked.**

```bash
grep -rn '2111[89]' prod/cloud-init.yaml scripts/hetzner/cloud-init.yaml.tmpl scripts/hetzner/cloud-init-server.yaml.tmpl
# expected: exactly one line per file, each containing "from 10.20.0.0/16"
grep -rE '2111[89]' prod/cloud-init.yaml scripts/hetzner/*.tmpl | grep -v '10\.20\.0\.0/16'
# expected: NO output (no unrestricted rule)
```

- [ ] **Step 5: Commit.**

```bash
git add prod/cloud-init.yaml scripts/hetzner/cloud-init.yaml.tmpl scripts/hetzner/cloud-init-server.yaml.tmpl
git commit -m "feat(rustdesk-web): ufw allow 21118/21119 from wg-fleet overlay only [T001381]"
```

---

### Task 8: Domain + Ingress wiring

**Files:**
- Modify: `k3d/configmap-domains.yaml` (`wc -l` = 38 · S1 n/a)
- Modify: `prod/configmap-domains.yaml` (S1 n/a)
- Modify: `k3d/ingress.yaml` (`wc -l` = 157 · S1 n/a)
- Modify: `prod/ingress.yaml` (S1 n/a)

**Interfaces:**
- Consumes: `oauth2-proxy-rustdesk-web:4180` (Task 4).

- [ ] **Step 1: Add the dev domain key to `k3d/configmap-domains.yaml`** — after `WEB_DOMAIN: "web.localhost"` (line 18):

```yaml
  REMOTE_DOMAIN: "remote.localhost"
```

- [ ] **Step 2: Add the prod override to `prod/configmap-domains.yaml`** — after `WEB_DOMAIN: "web.${PROD_DOMAIN}"` (line 18):

```yaml
  REMOTE_DOMAIN: "remote.${PROD_DOMAIN}"
```

- [ ] **Step 3: Add the dev ingress rule to `k3d/ingress.yaml`** — inside the `workspace-ingress` `rules:` list (append a new rule, mirroring the other oauth2-proxy rules). `remote.localhost` is a `.localhost` literal, so S3-safe:

```yaml
    - host: remote.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-rustdesk-web
                port:
                  number: 4180
```

- [ ] **Step 4: Add the prod ingress to `prod/ingress.yaml`** — a dedicated `Ingress` (mirroring `workspace-ingress-downloads` from the downloads pattern), inserted before the `# ── Restliche Services` block:

```yaml
---
# ── RustDesk web client — Pocket ID SSO (oauth2-proxy) (T001381) ─────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-remote
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "${WORKSPACE_NAMESPACE}-redirect-https@kubernetescrd,${WORKSPACE_NAMESPACE}-hsts-headers@kubernetescrd,${WORKSPACE_NAMESPACE}-security-headers@kubernetescrd"
spec:
  tls:
    - hosts:
        - remote.${PROD_DOMAIN}
      secretName: ${TLS_SECRET_NAME}
  rules:
    - host: remote.${PROD_DOMAIN}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-rustdesk-web
                port:
                  number: 4180
```

- [ ] **Step 5: Verify both overlays build with the host + backend.**

```bash
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone | grep -E 'host: remote\.localhost'
kustomize build prod/ --load-restrictor=LoadRestrictionsNone | grep -E 'remote\.\$\{PROD_DOMAIN\}'
# expected: dev host line; prod host + tls host lines
```

- [ ] **Step 6: Commit.**

```bash
git add k3d/configmap-domains.yaml prod/configmap-domains.yaml k3d/ingress.yaml prod/ingress.yaml
git commit -m "feat(rustdesk-web): remote.<domain> ingress + REMOTE_DOMAIN key [T001381]"
```

---

### Task 9: GREEN — BATS structure test passes

**Files:**
- Test: `tests/spec/rustdesk-server.bats`

- [ ] **Step 1: Run the structure test — it must now pass.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/rustdesk-server.bats
# expected: PASS (green — all six rustdesk-web assertions satisfied)
```

- [ ] **Step 2: Regenerate the test inventory and commit it** (a `@test` was added/changed → CI inventory check fails otherwise):

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/rustdesk-server.bats
git commit -m "test(rustdesk-web): GREEN structure test + inventory [T001381]"
```

---

### Task 10: Sealed secret for POCKET_ID_RUSTDESK_WEB_SECRET

**Files:**
- Modify: `environments/.secrets/mentolder.yaml` (git-crypt tracked — never echo)
- Modify: `environments/sealed-secrets/mentolder.yaml` (committed SealedSecret)

- [ ] **Step 1: Add the plaintext secret** to `environments/.secrets/mentolder.yaml` (generate a 40-char value; do NOT print it):

```bash
# add key POCKET_ID_RUSTDESK_WEB_SECRET with a fresh 40-char secret
task env:generate ENV=mentolder   # fills generate:true keys, incl. the new one
```

- [ ] **Step 2: Re-seal** so the committed SealedSecret carries the new key:

```bash
task env:seal ENV=mentolder
```

- [ ] **Step 3: Verify the sealed key is present (name only).**

```bash
grep -c 'POCKET_ID_RUSTDESK_WEB_SECRET' environments/sealed-secrets/mentolder.yaml
# expected: 1
```

- [ ] **Step 4: Commit.**

```bash
git add environments/.secrets/mentolder.yaml environments/sealed-secrets/mentolder.yaml
git commit -m "feat(rustdesk-web): seal POCKET_ID_RUSTDESK_WEB_SECRET (mentolder) [T001381]"
```

---

### Task 11: Manifest validation

**Files:** (no new changes — validation gate)

- [ ] **Step 1: Validate the full workspace manifests.**

```bash
task workspace:validate
# expected: kustomize base + prod overlays build clean, no dangling refs
```

- [ ] **Step 2: Run the rustdesk spec test through the runner.**

```bash
./tests/runner.sh local rustdesk-server
# expected: all rustdesk-server.bats tests pass
```

---

### Task 12: Manual verification (post-deploy, operator)

These are the design's manual checks (native-parity + SSO gate). Not automatable in CI; run after `task workspace:deploy ENV=mentolder` + the one-time overlay ufw rule on the live node.

- [ ] **Step 1: Apply the one-time live ufw rule** on `pk-hetzner-4` (matches the cloud-init templates; the manifests cover reprovisioned nodes, this covers the running one):

```bash
ssh patrick@204.168.244.104 "sudo ufw allow from 10.20.0.0/16 to any port 21118,21119 proto tcp && sudo ufw status | grep 2111"
# expected: 21118,21119 ALLOW from 10.20.0.0/16
```

- [ ] **Step 2: SSO gate** — open `https://remote.mentolder.de` without a Pocket-ID session → redirected to Pocket-ID login (not passed through).
- [ ] **Step 3: Web-client session** — with a valid session, the RustDesk web client loads and connects to a device (hbbs signalling via `/`).
- [ ] **Step 4: Relay fallback** — force symmetric NAT (mobile hotspot) and confirm the session still connects via hbbr (`/ws/relay`).
- [ ] **Step 5: Port closure** — from a host outside the overlay, `nc -vz 204.168.244.104 21118` must time out / be refused (ufw drop). `kubectl --context fleet get pods -n rustdesk` shows hbbs/hbbr `Running` on `pk-hetzner-4` with the new ports.

---

### Task 13: Final verification — CI gates

**Files:** (no new changes — verification gate)

- [ ] **Step 1: Targeted changed-domain tests.**

```bash
task test:changed
# expected: vitest --changed + BATS selection (incl. rustdesk-server.bats) + quality:check all pass
```

- [ ] **Step 2: Regenerate freshness artifacts.**

```bash
task freshness:regenerate
# expected: test-inventory, repo-index and other generated artefacts updated (commit any diff)
```

- [ ] **Step 3: CI-equivalent freshness + quality ratchet.**

```bash
task freshness:check
# expected: freshness + quality:check (S1–S4 ratchet) + baseline key-count assertion all green
```

- [ ] **Step 4: Commit any regenerated artefacts.**

```bash
git add -A
git commit -m "chore(rustdesk-web): refresh generated artefacts [T001381]" || echo "nothing to regenerate"
```
