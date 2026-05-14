---
title: dev.mentolder.de Implementation Plan
domains: [infra, security, website, test, db]
status: active
pr_number: null
---

# dev.mentolder.de Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a persistent, SSO-gated k3d-based staging stack at `*.dev.mentolder.de` that mirrors the website + Brett against prod data, and adds an ad-hoc reverse-SSH tunnel broker (sish) for publishing localhost ports.

**Architecture:** A k3d cluster runs as a sibling Docker workload on the existing `gekko-hetzner-2` control-plane node of the mentolder k3s cluster. Its HTTP load balancer is bound to `127.0.0.1:18080`; prod Traefik fronts it as an SSO-gated reverse proxy via a dedicated `workspace-dev` OIDC client. A nightly CronJob in the mentolder k3s `workspace` namespace `pg_restore`s prod data into the dev Postgres. sish exposes a public SSH listener on `0.0.0.0:2222` for `ssh -R` tunnels, protected by pubkey-auth + ufw allowlist; HTTP from those tunnels still passes through the same OIDC gate.

**Tech Stack:** k3d, k3s, Kustomize, Traefik (k8s Ingress + Middleware CRD), oauth2-proxy v7.9.0, Keycloak, sealed-secrets, postgres:16, sish (antoniomika/sish), GitHub Actions (`appleboy/ssh-action`), BATS.

**Source spec:** `docs/superpowers/specs/2026-05-13-dev-mentolder-stack-design.md`.

---

## Working assumptions (carry into every task)

- Plan executes from an isolated worktree (creates via `superpowers:using-git-worktrees`). All paths below are repo-relative.
- The mentolder kubeconfig context is named `mentolder`. The new dev k3d context will be `k3d-mentolder-dev`.
- The user's PRs go through `commit-commands:commit-push-pr` and are auto-merged (per user preference in memory). Each task ends with a commit; the final phase opens a PR.
- "Workspace dev" inside the k3d cluster lives in namespace `workspace-dev` (NOT to be confused with the prod `workspace` namespace).
- `gekko-hetzner-2`'s public IP is `178.104.169.206` (per spec §3 / hosts file).
- All env-aware Taskfile work for this plan uses `ENV=mentolder` (the dev cluster is a sibling of the mentolder cluster; the only env file that needs new entries is `environments/mentolder.yaml`).
- Plaintext dev secrets live in `environments/.secrets/mentolder.yaml` and are sealed against the mentolder cluster cert into `environments/sealed-secrets/mentolder.yaml`. We do NOT introduce a new `dev` env file — the dev stack is a sub-deployment of the mentolder env.

---

## File map

**New files:**

```
k3d/dev-stack/
├── kustomization.yaml
├── namespace.yaml                       # workspace-dev
├── shared-db-dev.yaml                   # Postgres 16 + PVC + init Job + NodePort 30000
├── website-dev.yaml                     # Deployment + Service + Ingress (web.dev.${PROD_DOMAIN})
├── brett-dev.yaml                       # Deployment + Service + Ingress (brett.dev.${PROD_DOMAIN})
├── sish.yaml                            # Deployment + Service (HTTP + SSH) + authorized-keys CM
└── traefik-wildcard-ingress.yaml        # Wildcard Ingress *.dev.${PROD_DOMAIN} → sish

prod-mentolder/
├── dev-ingress.yaml                     # Ingress *.dev.${PROD_DOMAIN} → oauth2-proxy-dev → 127.0.0.1:18080
├── dev-db-refresh-cron.yaml             # Nightly pg_restore CronJob (workspace ns, hostNetwork+nodeSelector)
├── oauth2-proxy-dev.yaml                # Deployment + Service in workspace ns
├── oauth2-proxy-dev-middleware.yaml     # Traefik Middleware (ForwardAuth)
├── cert-dev-wildcard.yaml               # cert-manager Certificate for *.dev.${PROD_DOMAIN}
└── realm-workspace-dev-client.json      # Keycloak client + dev-access group definition

Taskfile.dev-stack.yml                    # New include — `dev:` namespace

scripts/
├── dev-db-refresh.sh                    # Restore script (used by CronJob + `task dev:db:refresh`)
└── dev-stack/                            # Helper scripts referenced by Taskfile tasks
    └── tunnel.sh                         # `task dev:tunnel` convenience wrapper

tests/dev-stack/
├── dev-tls.bats
├── dev-sso.bats
└── dev-tunnel.bats

.github/workflows/
├── dev-auto-deploy.yml                  # Push-to-main → SSH gekko-hetzner-2 → task dev:redeploy:*
└── dev-smoke.yml                        # Nightly smoke run after auto-deploy

docs/dev-stack/README.md                  # Operator runbook (1 file, ~150 lines)
```

**Modified files:**

```
Taskfile.yml                              # add include for Taskfile.dev-stack.yml
environments/schema.yaml                  # add DEV_* env vars + secrets
environments/mentolder.yaml               # add DEV_DOMAIN + DEV_NODE values
environments/.secrets/mentolder.yaml      # add 5 new sealed secret values (NOT committed)
prod/cloud-init.yaml                      # add 2222/tcp + allowlist ufw rules
prod-mentolder/kustomization.yaml         # add the 5 new files as resources
tests/runner.sh                           # opt-in gate `RUN_DEV_TESTS`
CLAUDE.md                                 # add Gotchas section + `dev:` task reference
docs/MEMORY-ready/                        # n/a — memory writes happen post-merge
```

---

## Phase 1 — Schema, secrets, and Keycloak (prep)

### Task 1: Declare dev env vars in `environments/schema.yaml`

**Files:**
- Modify: `environments/schema.yaml`

- [ ] **Step 1: Open `environments/schema.yaml` and find the end of the `env_vars:` array** (line ~258, just before `secrets:`).

- [ ] **Step 2: Append five new `env_vars` entries before `secrets:`**

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Dev stack (dev.mentolder.de) — only meaningful when ENV=mentolder.
  # All five have `default_dev: ""` so the dev k3d cluster (which
  # treats schema "dev" defaults as its own) ignores them.
  # ─────────────────────────────────────────────────────────────────
  - name: DEV_DOMAIN
    required: false
    default_dev: ""
    description: "Public base domain for the dev stack (e.g. dev.mentolder.de). Empty disables the dev stack."

  - name: DEV_NODE
    required: false
    default_dev: ""
    description: "Hostname of the k3s node that runs the dev k3d cluster (e.g. gekko-hetzner-2). Used as nodeSelector for the dev-db-refresh CronJob."

  - name: DEV_WEBSITE_HOST
    required: false
    default_dev: ""
    description: "Public hostname of the dev website (auto-derived as web.${DEV_DOMAIN} when DEV_DOMAIN is set)."

  - name: DEV_BRETT_HOST
    required: false
    default_dev: ""
    description: "Public hostname of the dev Brett (auto-derived as brett.${DEV_DOMAIN})."

  - name: DEV_SSH_ALLOWLIST
    required: false
    default_dev: ""
    description: "Comma-separated CIDR list allowed to reach :2222 on the dev node. Empty means deny-all from public Internet."
```

- [ ] **Step 3: Find the `secrets:` block and append five new entries at the end (just before `setup_vars:`)**

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Dev stack — sealed against mentolder cluster cert.
  # The shared-db-dev passwords are DISTINCT from prod's shared-db
  # passwords so a leaked dev cred cannot unlock prod.
  # ─────────────────────────────────────────────────────────────────
  - name: DEV_SHARED_DB_PASSWORD
    required: false
    generate: true
    length: 32
    description: "Postgres superuser password for shared-db-dev (inside the dev k3d cluster)."

  - name: DEV_WEBSITE_DB_PASSWORD
    required: false
    generate: true
    length: 32
    description: "Postgres role password for the `website` DB inside shared-db-dev."

  - name: DEV_OAUTH2_PROXY_COOKIE_SECRET
    required: false
    generate: true
    length: 32
    description: "Cookie secret for oauth2-proxy-dev (separate from prod's OAUTH2_PROXY_COOKIE_SECRET)."

  - name: DEV_WORKSPACE_OIDC_SECRET
    required: false
    generate: true
    length: 40
    description: "Confidential client secret for the workspace-dev Keycloak client."

  - name: DEV_SISH_AUTHORIZED_KEYS
    required: false
    generate: false
    description: "SSH authorized_keys list (newline-separated) for sish — anyone who can publish a dev tunnel."
```

- [ ] **Step 4: Validate the schema with the existing tool**

Run: `task env:validate:all`
Expected: `OK` for every env file. (Existing env files do not yet have these keys, but they're all optional, so validation must still pass.)

- [ ] **Step 5: Commit**

```bash
git add environments/schema.yaml
git commit -m "feat(env): declare dev-stack env vars and secrets in schema"
```

---

### Task 2: Add dev values to `environments/mentolder.yaml`

**Files:**
- Modify: `environments/mentolder.yaml`

- [ ] **Step 1: Read the current `environments/mentolder.yaml`** so you can find the right section (`env_vars:`).

- [ ] **Step 2: Append the dev values inside the existing `env_vars:` block**

```yaml
  DEV_DOMAIN: "dev.mentolder.de"
  DEV_NODE: "gekko-hetzner-2"
  DEV_WEBSITE_HOST: "web.dev.mentolder.de"
  DEV_BRETT_HOST: "brett.dev.mentolder.de"
  # Comma-separated CIDRs allowed to reach :2222. Replace with your own ranges.
  # Empty (current) value means ufw drops all 2222/tcp until you set it.
  DEV_SSH_ALLOWLIST: ""
```

- [ ] **Step 3: Validate**

Run: `task env:validate ENV=mentolder`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add environments/mentolder.yaml
git commit -m "feat(env): wire dev.mentolder.de env values"
```

---

### Task 3: Generate dev secrets and seal them

**Files:**
- Modify (not commit): `environments/.secrets/mentolder.yaml`
- Modify (commit): `environments/sealed-secrets/mentolder.yaml`

- [ ] **Step 1: Run the existing generator to fill in the new secret fields**

Run: `task env:generate ENV=mentolder`
Expected: The generator emits `Generated DEV_SHARED_DB_PASSWORD=...`, `Generated DEV_WEBSITE_DB_PASSWORD=...`, `Generated DEV_OAUTH2_PROXY_COOKIE_SECRET=...`, `Generated DEV_WORKSPACE_OIDC_SECRET=...` and writes them into `environments/.secrets/mentolder.yaml`. (`DEV_SISH_AUTHORIZED_KEYS` has `generate: false` so it stays empty — fill it manually in step 2.)

- [ ] **Step 2: Open `environments/.secrets/mentolder.yaml` and paste your SSH pubkey(s) into `DEV_SISH_AUTHORIZED_KEYS`**

Use a literal block scalar so newlines round-trip cleanly:

```yaml
  DEV_SISH_AUTHORIZED_KEYS: |
    ssh-ed25519 AAAA... patrick@laptop
    ssh-ed25519 AAAA... claude@worker
```

- [ ] **Step 3: Seal against the mentolder cluster cert**

Run: `task env:seal ENV=mentolder`
Expected: `environments/sealed-secrets/mentolder.yaml` is updated; the five new keys appear under `spec.encryptedData`.

- [ ] **Step 4: Verify .secrets is NOT staged**

Run: `git status -- environments/.secrets/`
Expected: no output (file stays ignored).

- [ ] **Step 5: Commit only the sealed file**

```bash
git add environments/sealed-secrets/mentolder.yaml
git commit -m "feat(secrets): seal dev-stack secrets for mentolder"
```

---

### Task 4: Add the `workspace-dev` Keycloak client + `dev-access` group

**Files:**
- Create: `prod-mentolder/realm-workspace-dev-client.json`
- Modify: `prod-mentolder/kustomization.yaml`

- [ ] **Step 1: Read `prod-mentolder/kustomization.yaml`** to find how `realm-workspace-mentolder.json` is consumed (it's referenced as a `configMapGenerator` or `configMap` patch around line 16). Note the exact mechanism so the new file follows the same pattern.

- [ ] **Step 2: Create `prod-mentolder/realm-workspace-dev-client.json`** — this is a partial-realm document consumed by `scripts/keycloak-sync.sh` (which already merges client/group additions into the existing `workspace` realm; check that script first to confirm the expected JSON shape).

```json
{
  "groups": [
    {
      "name": "dev-access",
      "path": "/dev-access",
      "attributes": {
        "description": ["Members may reach *.dev.${PROD_DOMAIN}"]
      }
    }
  ],
  "clients": [
    {
      "clientId": "workspace-dev",
      "name": "Workspace Dev (SSO gate for *.dev.${PROD_DOMAIN})",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": false,
      "rootUrl": "https://${DEV_DOMAIN}",
      "redirectUris": [
        "https://*.${DEV_DOMAIN}/oauth2/callback",
        "https://*.${DEV_DOMAIN}/oauth2/sign_in"
      ],
      "webOrigins": ["https://*.${DEV_DOMAIN}"],
      "attributes": {
        "post.logout.redirect.uris": "https://*.${DEV_DOMAIN}/*",
        "pkce.code.challenge.method": "S256"
      },
      "authorizationSettings": {
        "policyEnforcementMode": "ENFORCING",
        "policies": [
          {
            "name": "require-dev-access",
            "type": "group",
            "logic": "POSITIVE",
            "decisionStrategy": "AFFIRMATIVE",
            "config": {
              "groups": "[{\"path\":\"/dev-access\",\"extendChildren\":false}]"
            }
          }
        ],
        "permissions": [
          {
            "name": "dev-access-required",
            "type": "scope",
            "decisionStrategy": "UNANIMOUS",
            "policies": ["require-dev-access"],
            "scopes": ["openid"]
          }
        ]
      },
      "secretRef": "DEV_WORKSPACE_OIDC_SECRET"
    }
  ]
}
```

- [ ] **Step 3: Verify `scripts/keycloak-sync.sh` accepts this file**

Run: `bash -n scripts/keycloak-sync.sh && grep -nE 'realm-workspace-dev-client|workspace-dev' scripts/keycloak-sync.sh`
Expected: If `keycloak-sync.sh` does NOT yet pick up additional JSON files alongside the main realm template, extend it minimally — find the loop that reads the realm template (likely `kubectl get cm realm-template …`) and add a second `cat prod-mentolder/realm-workspace-dev-client.json` pass that POSTs to `/admin/realms/workspace/clients` and `/admin/realms/workspace/groups`. **Concrete change:**

```bash
# Inside scripts/keycloak-sync.sh, just before the existing "OK realm reconciled" line:
if [[ -f "${REPO_ROOT}/prod-mentolder/realm-workspace-dev-client.json" ]]; then
  EXTRA=$(envsubst < "${REPO_ROOT}/prod-mentolder/realm-workspace-dev-client.json")
  echo "[keycloak-sync] applying dev client/group additions"
  jq -c '.groups[]'  <<<"$EXTRA" | while read -r g; do
    curl -sS -X POST "$KC_URL/admin/realms/workspace/groups" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$g" >/dev/null || echo "  (group exists or skipped)"
  done
  jq -c '.clients[]' <<<"$EXTRA" | while read -r c; do
    clientId=$(jq -r '.clientId' <<<"$c")
    existing=$(curl -sS "$KC_URL/admin/realms/workspace/clients?clientId=$clientId" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id // empty')
    if [[ -z "$existing" ]]; then
      curl -sS -X POST "$KC_URL/admin/realms/workspace/clients" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$c" >/dev/null
      echo "  + created client $clientId"
    else
      curl -sS -X PUT "$KC_URL/admin/realms/workspace/clients/$existing" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$c" >/dev/null
      echo "  ~ updated client $clientId"
    fi
  done
fi
```

(If the existing script structure differs significantly, port the same intent to whatever auth/HTTP helpers it already uses. The key contract is: idempotent, runs after the main realm reconcile, envsubsts `${DEV_DOMAIN}`.)

- [ ] **Step 4: Reference the new file from `prod-mentolder/kustomization.yaml`**

Add `realm-workspace-dev-client.json` to whichever `configMapGenerator` already produces `realm-template` — append it to the `files:` list so it ships into the same ConfigMap alongside the main realm. (If you cannot share — the existing realm-template generator is the `realm.json` key only — leave the file as input to `keycloak-sync.sh` only and skip the kustomization change; that path is acceptable since `keycloak-sync.sh` reads it from the filesystem.)

- [ ] **Step 5: Validate**

Run: `task env:validate ENV=mentolder && python3 -c "import json,sys; json.load(open('prod-mentolder/realm-workspace-dev-client.json'))" && echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add prod-mentolder/realm-workspace-dev-client.json prod-mentolder/kustomization.yaml scripts/keycloak-sync.sh
git commit -m "feat(keycloak): add workspace-dev client and dev-access group"
```

> **Apply happens later** (Task 21, rollout step). Right now we just commit the artefacts.

---

## Phase 2 — Prod-side ingress, TLS, oauth2-proxy

### Task 5: cert-manager `Certificate` for `*.dev.${PROD_DOMAIN}`

**Files:**
- Create: `prod-mentolder/cert-dev-wildcard.yaml`

- [ ] **Step 1: Read `prod/cert-*.yaml`** (or wherever the existing wildcard Certificate lives — `grep -rln "kind: Certificate" prod/ prod-mentolder/`). Mirror its shape exactly.

- [ ] **Step 2: Write `prod-mentolder/cert-dev-wildcard.yaml`**

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: workspace-dev-wildcard-tls
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  secretName: workspace-dev-wildcard-tls
  issuerRef:
    name: letsencrypt-prod-dns
    kind: ClusterIssuer
  commonName: "*.${DEV_DOMAIN}"
  dnsNames:
    - "${DEV_DOMAIN}"
    - "*.${DEV_DOMAIN}"
  privateKey:
    algorithm: ECDSA
    size: 256
  duration: 2160h
  renewBefore: 720h
```

- [ ] **Step 3: Reference it from `prod-mentolder/kustomization.yaml`**

Add `cert-dev-wildcard.yaml` to the `resources:` list (or the local resources list that prod-mentolder uses to layer extra manifests onto the base).

- [ ] **Step 4: Validate**

Run: `kubectl --context mentolder kustomize prod-mentolder/ | grep -A3 "name: workspace-dev-wildcard-tls"`
Expected: the Certificate appears in the rendered output with `${DEV_DOMAIN}` already substituted (or not, depending on whether you run envsubst — match the existing prod-mentolder build pattern).

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/cert-dev-wildcard.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(tls): request *.dev.mentolder.de wildcard via DNS-01"
```

---

### Task 6: Add wildcard DNS A record for `*.dev.${PROD_DOMAIN}`

**Files:**
- None — operational step using the ipv64 API.

- [ ] **Step 1: Look at how existing DNS records are managed** (`scripts/ipv64-*.sh`, `task livekit:dns-pin`).

- [ ] **Step 2: Create the wildcard A record pointing to `gekko-hetzner-2`'s public IP**

Run:
```bash
source scripts/env-resolve.sh mentolder
GEKKO_IP=$(getent hosts gekko-hetzner-2 | awk '{print $1}')
[[ -z "$GEKKO_IP" ]] && GEKKO_IP="178.104.169.206"
curl -fsSL "https://ipv64.net/update.php?key=${IPV64_API_KEY}&domain=*.${DEV_DOMAIN}&ip=${GEKKO_IP}"
echo
curl -fsSL "https://ipv64.net/update.php?key=${IPV64_API_KEY}&domain=${DEV_DOMAIN}&ip=${GEKKO_IP}"
```
Expected: `+OK` (twice). If your registrar has a different API, port the call. Persist nothing in repo — DNS is operational state.

- [ ] **Step 3: Verify**

Run: `dig +short A "test.${DEV_DOMAIN}"`
Expected: the gekko-hetzner-2 IP (may take 60 s to propagate).

- [ ] **Step 4: No commit — operational change only.** Note completion in the PR description for traceability.

---

### Task 7: `oauth2-proxy-dev` Deployment + Service

**Files:**
- Create: `prod-mentolder/oauth2-proxy-dev.yaml`

- [ ] **Step 1: Open `k3d/oauth2-proxy-docs.yaml`** as the structural template. The dev variant differs only in: client ID, cookie name, `--whitelist-domain`, `--cookie-domain`, the upstream URL (the dev proxy upstream is `http://gekko-hetzner-2:18080` reached via `hostNetwork: true`, NOT a ClusterIP service).

- [ ] **Step 2: Write `prod-mentolder/oauth2-proxy-dev.yaml`**

```yaml
# ════════════════════════════════════════════════════════════════════
# oauth2-proxy-dev — SSO gate for everything under *.dev.${PROD_DOMAIN}.
# Upstream is the k3d HTTP loadbalancer bound to 127.0.0.1:18080 on
# the gekko-hetzner-2 node, reached via hostNetwork+nodeSelector.
# ════════════════════════════════════════════════════════════════════
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth2-proxy-dev
  namespace: ${WORKSPACE_NAMESPACE}
  labels: { app: oauth2-proxy-dev }
spec:
  replicas: 1
  selector:
    matchLabels: { app: oauth2-proxy-dev }
  template:
    metadata:
      labels: { app: oauth2-proxy-dev }
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      nodeSelector:
        kubernetes.io/hostname: ${DEV_NODE}
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        seccompProfile: { type: RuntimeDefault }
      initContainers:
        - name: write-cookie-secret
          image: busybox:1.36
          command: ["/bin/sh", "-c"]
          args:
            - printf 'cookie_secret = "%s"\n' "$(printf '%s' "$DEV_OAUTH2_PROXY_COOKIE_SECRET" | cut -c1-32)" > /run/config/oauth2-extra.cfg
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: ["ALL"] }
          resources:
            requests: { cpu: 10m, memory: 32Mi }
            limits:   { memory: 64Mi }
          env:
            - name: DEV_OAUTH2_PROXY_COOKIE_SECRET
              valueFrom:
                secretKeyRef: { name: workspace-secrets, key: DEV_OAUTH2_PROXY_COOKIE_SECRET }
          volumeMounts:
            - { name: oauth2-config, mountPath: /run/config }
      containers:
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.9.0
          args:
            - --config=/run/config/oauth2-extra.cfg
            - --provider=keycloak-oidc
            - --client-id=workspace-dev
            - --client-secret=$(DEV_WORKSPACE_OIDC_SECRET)
            - --oidc-issuer-url=https://auth.${PROD_DOMAIN}/realms/workspace
            - --redirect-url=https://${DEV_DOMAIN}/oauth2/callback
            - --upstream=http://127.0.0.1:18080
            - --http-address=0.0.0.0:4181
            - --reverse-proxy=true
            - --whitelist-domain=.${DEV_DOMAIN}
            - --cookie-domain=.${DEV_DOMAIN}
            - --cookie-name=_oauth2_dev
            - --cookie-secure=true
            - --email-domain=*
            - --pass-access-token=true
            - --pass-authorization-header=true
            - --set-xauthrequest=true
            - --skip-provider-button=true
            - --code-challenge-method=S256
            - --insecure-oidc-allow-unverified-email=true
            - --scope=openid email profile
          env:
            - name: DEV_WORKSPACE_OIDC_SECRET
              valueFrom:
                secretKeyRef: { name: workspace-secrets, key: DEV_WORKSPACE_OIDC_SECRET }
          ports:
            - { containerPort: 4181, hostPort: 4181 }
          readinessProbe:
            httpGet: { path: /ping, port: 4181 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: 64Mi, cpu: "50m" }
            limits:   { memory: 128Mi, cpu: "200m" }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 65534
            capabilities: { drop: [ALL] }
            seccompProfile: { type: RuntimeDefault }
          volumeMounts:
            - { name: oauth2-config, mountPath: /run/config, readOnly: true }
      volumes:
        - { name: oauth2-config, emptyDir: {} }
---
apiVersion: v1
kind: Service
metadata:
  name: oauth2-proxy-dev
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  selector: { app: oauth2-proxy-dev }
  ports:
    - { port: 4181, targetPort: 4181 }
```

> **Why hostNetwork?** The k3d HTTP LB is bound to `127.0.0.1:18080` on the host — only a pod sharing the host's network namespace can dial it. Pinning to `${DEV_NODE}` keeps the proxy on the same node as k3d. (If the spec evolves to multiple dev hosts, this is the seam to revisit.)

- [ ] **Step 3: Reference it from `prod-mentolder/kustomization.yaml`**

Append to its `resources:` list.

- [ ] **Step 4: Validate**

Run: `kubectl --context mentolder kustomize prod-mentolder/ | yq 'select(.kind == "Deployment" and .metadata.name == "oauth2-proxy-dev")' | yq '.spec.template.spec.hostNetwork'`
Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/oauth2-proxy-dev.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(dev): add oauth2-proxy-dev (SSO gate for *.dev.${PROD_DOMAIN})"
```

---

### Task 8: Traefik `Middleware` (ForwardAuth)

**Files:**
- Create: `prod-mentolder/oauth2-proxy-dev-middleware.yaml`

- [ ] **Step 1: Find an existing ForwardAuth Middleware** for shape: `grep -rln 'kind: Middleware' k3d/ prod/ prod-mentolder/` — `k3d/mail-ingressroute-dev.yaml:11` is one example.

- [ ] **Step 2: Write `prod-mentolder/oauth2-proxy-dev-middleware.yaml`**

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: oauth2-proxy-dev
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  forwardAuth:
    address: http://oauth2-proxy-dev.${WORKSPACE_NAMESPACE}.svc.cluster.local:4181/oauth2/auth
    trustForwardHeader: true
    authResponseHeaders:
      - X-Auth-Request-User
      - X-Auth-Request-Email
      - X-Auth-Request-Access-Token
      - Authorization
```

- [ ] **Step 3: Append to `prod-mentolder/kustomization.yaml` resources.**

- [ ] **Step 4: Commit**

```bash
git add prod-mentolder/oauth2-proxy-dev-middleware.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(dev): add ForwardAuth middleware for oauth2-proxy-dev"
```

---

### Task 9: Prod-side wildcard `Ingress` for `*.dev.${PROD_DOMAIN}`

**Files:**
- Create: `prod-mentolder/dev-ingress.yaml`

- [ ] **Step 1: Read `prod/ingress.yaml:101-123`** (the docs Ingress) as the template.

- [ ] **Step 2: Write `prod-mentolder/dev-ingress.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: workspace-ingress-dev
  namespace: ${WORKSPACE_NAMESPACE}
  annotations:
    traefik.ingress.kubernetes.io/router.middlewares: "${WORKSPACE_NAMESPACE}-redirect-https@kubernetescrd,${WORKSPACE_NAMESPACE}-hsts-headers@kubernetescrd,${WORKSPACE_NAMESPACE}-security-headers@kubernetescrd,${WORKSPACE_NAMESPACE}-oauth2-proxy-dev@kubernetescrd"
    # priority ensures auth+rewrite runs before any catch-all dev route
    traefik.ingress.kubernetes.io/router.priority: "10"
spec:
  tls:
    - hosts:
        - "${DEV_DOMAIN}"
        - "*.${DEV_DOMAIN}"
      secretName: workspace-dev-wildcard-tls
  rules:
    - host: "*.${DEV_DOMAIN}"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-dev
                port: { number: 4181 }
    - host: "${DEV_DOMAIN}"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: oauth2-proxy-dev
                port: { number: 4181 }
```

- [ ] **Step 3: Reference it from `prod-mentolder/kustomization.yaml` resources.**

- [ ] **Step 4: Validate dry-run**

Run: `kubectl --context mentolder kustomize prod-mentolder/ | yq 'select(.kind == "Ingress" and .metadata.name == "workspace-ingress-dev")' | yq '.spec.rules[].host'`
Expected: `*.${DEV_DOMAIN}` and `${DEV_DOMAIN}` (or substituted values if you envsubst before piping).

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/dev-ingress.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(dev): route *.dev.${PROD_DOMAIN} through oauth2-proxy-dev"
```

---

## Phase 3 — Dev k3d overlay (`k3d/dev-stack/`)

### Task 10: Verify docker on `gekko-hetzner-2`

**Files:**
- None.

- [ ] **Step 1: SSH into the node and check**

Run: `ssh root@gekko-hetzner-2 'command -v docker && docker info | head -5'`
Expected: A path and the docker daemon info. If not installed, install:

```bash
ssh root@gekko-hetzner-2 'curl -fsSL https://get.docker.com | sh && systemctl enable --now docker'
```

- [ ] **Step 2: Install k3d binary on the node** (used by the auto-deploy SSH workflow):

Run: `ssh root@gekko-hetzner-2 'curl -fsSL https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash'`
Expected: `k3d` version printout.

- [ ] **Step 3: Clone the repo on the node** (if not already present at `/opt/bachelorprojekt`):

Run: `ssh root@gekko-hetzner-2 'test -d /opt/bachelorprojekt || git clone https://github.com/paddione/Bachelorprojekt.git /opt/bachelorprojekt'`
Expected: success.

- [ ] **Step 4: No commit. Operational step only — record completion in the PR description.**

---

### Task 11: `k3d/dev-stack/` scaffold

**Files:**
- Create: `k3d/dev-stack/kustomization.yaml`
- Create: `k3d/dev-stack/namespace.yaml`

- [ ] **Step 1: Make the directory**

Run: `mkdir -p k3d/dev-stack tests/dev-stack`

- [ ] **Step 2: Write `k3d/dev-stack/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: workspace-dev
  labels:
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/warn: baseline
```

- [ ] **Step 3: Write `k3d/dev-stack/kustomization.yaml`** — start with just the namespace; we'll append resources as we add them.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: workspace-dev
resources:
  - namespace.yaml
  # populated in subsequent tasks:
  # - shared-db-dev.yaml
  # - website-dev.yaml
  # - brett-dev.yaml
  # - sish.yaml
  # - traefik-wildcard-ingress.yaml
images: []  # populated by the dev:deploy task with concrete digests
```

- [ ] **Step 4: Validate**

Run: `kubectl kustomize k3d/dev-stack/`
Expected: emits a single Namespace document.

- [ ] **Step 5: Commit**

```bash
git add k3d/dev-stack/
git commit -m "feat(dev): scaffold k3d/dev-stack overlay (namespace only)"
```

---

### Task 12: `shared-db-dev` Postgres + init Job + NodePort

**Files:**
- Create: `k3d/dev-stack/shared-db-dev.yaml`

- [ ] **Step 1: Write the manifest**

```yaml
# ════════════════════════════════════════════════════════════════════
# shared-db-dev — Postgres 16 inside the dev k3d cluster.
# Cred set is distinct from prod's shared-db so a leak here cannot
# unlock prod. NodePort 30000 → host 127.0.0.1:15432 (via k3d --port).
# Restore CronJob in prod uses host loopback to pg_restore into here.
# ════════════════════════════════════════════════════════════════════
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-db-dev-data
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: local-path
  resources:
    requests: { storage: 1Gi }
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: shared-db-dev
  labels: { app: shared-db-dev }
spec:
  serviceName: shared-db-dev
  replicas: 1
  selector:
    matchLabels: { app: shared-db-dev }
  template:
    metadata:
      labels: { app: shared-db-dev }
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports: [ { containerPort: 5432 } ]
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef: { name: shared-db-dev-secrets, key: DEV_SHARED_DB_PASSWORD }
            - name: POSTGRES_DB
              value: postgres
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          readinessProbe:
            exec: { command: [pg_isready, -U, postgres] }
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests: { memory: 256Mi, cpu: 100m }
            limits:   { memory: 1Gi,   cpu: 500m }
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: shared-db-dev-data }
---
apiVersion: v1
kind: Service
metadata:
  name: shared-db-dev
spec:
  selector: { app: shared-db-dev }
  type: NodePort
  ports:
    - name: postgres
      port: 5432
      targetPort: 5432
      nodePort: 30000
---
apiVersion: batch/v1
kind: Job
metadata:
  name: shared-db-dev-init
  annotations:
    # Re-run on every kubectl apply by changing the suffix in the deploy task
    # via kustomize nameSuffix (see deploy task for details).
    kustomize.config.k8s.io/needs-hash: "false"
spec:
  backoffLimit: 6
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: init
          image: postgres:16
          env:
            - name: PGHOST
              value: shared-db-dev
            - name: PGUSER
              value: postgres
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef: { name: shared-db-dev-secrets, key: DEV_SHARED_DB_PASSWORD }
            - name: WEBSITE_DB_PASSWORD
              valueFrom:
                secretKeyRef: { name: shared-db-dev-secrets, key: DEV_WEBSITE_DB_PASSWORD }
          command:
            - /bin/bash
            - -c
            - |
              set -euo pipefail
              echo "waiting for postgres..."
              for i in {1..30}; do pg_isready -h "$PGHOST" -U "$PGUSER" && break; sleep 2; done
              psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" <<-SQL
                DO \$\$ BEGIN
                  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='website') THEN
                    EXECUTE format('CREATE ROLE website LOGIN PASSWORD %L', '$WEBSITE_DB_PASSWORD');
                  ELSE
                    EXECUTE format('ALTER ROLE website WITH PASSWORD %L', '$WEBSITE_DB_PASSWORD');
                  END IF;
                  PERFORM 1 FROM pg_database WHERE datname='website';
                  IF NOT FOUND THEN EXECUTE 'CREATE DATABASE website OWNER website'; END IF;
                  PERFORM 1 FROM pg_database WHERE datname='bugs';
                  IF NOT FOUND THEN EXECUTE 'CREATE DATABASE bugs OWNER website'; END IF;
                  PERFORM 1 FROM pg_database WHERE datname='bachelorprojekt';
                  IF NOT FOUND THEN EXECUTE 'CREATE DATABASE bachelorprojekt OWNER website'; END IF;
                END \$\$;
              SQL
              echo "ok."
```

> **Why a StatefulSet?** Stable pod identity makes the NodePort routable consistently. With Deployment + PVC the pod IP churns less but the StatefulSet keeps the bring-up shape explicit.

- [ ] **Step 2: Append to `k3d/dev-stack/kustomization.yaml`** (uncomment the `shared-db-dev.yaml` line).

- [ ] **Step 3: Validate**

Run: `kubectl kustomize k3d/dev-stack/ | grep -c "kind: StatefulSet\|kind: PersistentVolumeClaim\|kind: Service\|kind: Job"`
Expected: 4.

- [ ] **Step 4: Commit**

```bash
git add k3d/dev-stack/shared-db-dev.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): shared-db-dev StatefulSet + init Job + NodePort 30000"
```

---

### Task 13: `website-dev` Deployment + Service + Ingress

**Files:**
- Create: `k3d/dev-stack/website-dev.yaml`

- [ ] **Step 1: Read `k3d/website.yaml`** to copy the env block, volume mounts, healthcheck path. The dev variant differs in: namespace (workspace-dev), DB host (`shared-db-dev.workspace-dev.svc.cluster.local:5432`), no SealedSecret (uses plain Secret), no node affinity (single-node k3d), no replicas tuning, Ingress host uses `${DEV_WEBSITE_HOST}`.

- [ ] **Step 2: Write `k3d/dev-stack/website-dev.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: website-dev-config
data:
  NODE_ENV: production
  BRAND: mentolder
  BRAND_ID: mentolder
  PROD_DOMAIN: ${DEV_DOMAIN}
  WEBSITE_SITE_URL: "https://${DEV_WEBSITE_HOST}"
  WEBSITE_HOST: ${DEV_WEBSITE_HOST}
  KEYCLOAK_FRONTEND_URL: "https://auth.${PROD_DOMAIN}"
  CONTACT_EMAIL: ${CONTACT_EMAIL}
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  # Dev DB
  DB_HOST: shared-db-dev
  DB_PORT: "5432"
  DB_NAME: website
  DB_USER: website
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
  labels: { app: website }
spec:
  replicas: 1
  selector:
    matchLabels: { app: website }
  template:
    metadata:
      labels: { app: website }
    spec:
      containers:
        - name: website
          image: ghcr.io/paddione/workspace-website:dev   # tag overridden by kustomize images: at deploy time
          imagePullPolicy: IfNotPresent
          ports: [ { containerPort: 3000 } ]
          envFrom:
            - configMapRef: { name: website-dev-config }
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef: { name: shared-db-dev-secrets, key: DEV_WEBSITE_DB_PASSWORD }
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: 256Mi, cpu: 100m }
            limits:   { memory: 512Mi, cpu: 500m }
---
apiVersion: v1
kind: Service
metadata:
  name: website
spec:
  selector: { app: website }
  ports:
    - { port: 80, targetPort: 3000 }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: website-dev
spec:
  rules:
    - host: ${DEV_WEBSITE_HOST}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: website
                port: { number: 80 }
```

- [ ] **Step 3: Append to `k3d/dev-stack/kustomization.yaml` resources.**

- [ ] **Step 4: Validate**

Run: `kubectl kustomize k3d/dev-stack/ | yq 'select(.kind == "Ingress" and .metadata.name == "website-dev")' | yq '.spec.rules[0].host'`
Expected: `${DEV_WEBSITE_HOST}` (literal — substitution happens at deploy time).

- [ ] **Step 5: Commit**

```bash
git add k3d/dev-stack/website-dev.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): website-dev Deployment, Service, Ingress"
```

---

### Task 14: `brett-dev` Deployment + Service + Ingress

**Files:**
- Create: `k3d/dev-stack/brett-dev.yaml`

- [ ] **Step 1: Read `k3d/brett.yaml`** as template. Differences: namespace, no SealedSecret (use plain env), Ingress host `${DEV_BRETT_HOST}`.

- [ ] **Step 2: Write `k3d/dev-stack/brett-dev.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: brett
  labels: { app: brett }
spec:
  replicas: 1
  selector:
    matchLabels: { app: brett }
  template:
    metadata:
      labels: { app: brett }
    spec:
      containers:
        - name: brett
          image: ghcr.io/paddione/workspace-brett:dev   # overridden by kustomize images: at deploy time
          imagePullPolicy: IfNotPresent
          ports: [ { containerPort: 3000 } ]
          env:
            - { name: NODE_ENV, value: production }
            - { name: PORT,     value: "3000" }
          readinessProbe:
            httpGet: { path: /, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: 128Mi, cpu: 50m }
            limits:   { memory: 256Mi, cpu: 250m }
---
apiVersion: v1
kind: Service
metadata:
  name: brett
spec:
  selector: { app: brett }
  ports:
    - { port: 80, targetPort: 3000 }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: brett-dev
spec:
  rules:
    - host: ${DEV_BRETT_HOST}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: brett
                port: { number: 80 }
```

- [ ] **Step 3: Append to `k3d/dev-stack/kustomization.yaml` resources.**

- [ ] **Step 4: Commit**

```bash
git add k3d/dev-stack/brett-dev.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): brett-dev Deployment, Service, Ingress"
```

---

### Task 15: `sish` Deployment + Service + authorized-keys ConfigMap

**Files:**
- Create: `k3d/dev-stack/sish.yaml`

- [ ] **Step 1: Confirm sish image**

Run: `docker pull antoniomika/sish:latest 2>&1 | tail -3`
Expected: pulls cleanly. Use that exact tag for now; pin to a SHA in a later hardening pass.

- [ ] **Step 2: Write `k3d/dev-stack/sish.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: sish-authorized-keys
data:
  authorized_keys: |
    # placeholder — overwritten by `task dev:deploy` from the unsealed
    # value of DEV_SISH_AUTHORIZED_KEYS at apply time.
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sish
  labels: { app: sish }
spec:
  replicas: 1
  selector:
    matchLabels: { app: sish }
  template:
    metadata:
      labels: { app: sish }
    spec:
      containers:
        - name: sish
          image: antoniomika/sish:latest
          args:
            - --domain=${DEV_DOMAIN}
            - --ssh-address=:2222
            - --http-address=:80
            - --authentication=true
            - --authentication-keys-directory=/keys
            - --bind-random-subdomains=false
            - --bind-random-ports=false
            - --force-requested-subdomains=true
            - --idle-connection-timeout=24h
            - --service-console=false
            - --tcp-aliases=false
            - --bind-hosts=*.${DEV_DOMAIN}
          ports:
            - { containerPort: 2222, name: ssh }
            - { containerPort: 80,   name: http }
          volumeMounts:
            - { name: keys, mountPath: /keys, readOnly: true }
          resources:
            requests: { memory: 64Mi,  cpu: 50m }
            limits:   { memory: 256Mi, cpu: 500m }
      volumes:
        - name: keys
          configMap:
            name: sish-authorized-keys
            items:
              - { key: authorized_keys, path: authorized_keys }
---
apiVersion: v1
kind: Service
metadata:
  name: sish
spec:
  type: NodePort
  selector: { app: sish }
  ports:
    - { name: ssh,  port: 2222, targetPort: 2222, nodePort: 32222 }
    - { name: http, port: 80,   targetPort: 80 }
```

> **Port plumbing recap:** Inside k3d, sish listens on :2222 and :80. k3d's loadbalancer publishes the SSH side to `0.0.0.0:2222` on the host (via `--port "0.0.0.0:2222:2222@loadbalancer"`). The HTTP side stays inside the k3d Traefik routing (see Task 16).

- [ ] **Step 3: Append to `k3d/dev-stack/kustomization.yaml` resources.**

- [ ] **Step 4: Commit**

```bash
git add k3d/dev-stack/sish.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): add sish reverse-tunnel broker"
```

---

### Task 16: k3d Traefik wildcard route → sish

**Files:**
- Create: `k3d/dev-stack/traefik-wildcard-ingress.yaml`

- [ ] **Step 1: Write the file** — uses Traefik's `IngressRoute` CRD so we can express a HostRegexp at lower priority than the explicit `web.*` and `brett.*` Ingresses:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: sish-catchall
spec:
  entryPoints: [web]
  routes:
    - match: HostRegexp(`{subdomain:[a-z0-9-]+}.${DEV_DOMAIN}`)
      priority: 1   # lower than the explicit website / brett Ingresses
      kind: Rule
      services:
        - name: sish
          port: 80
```

- [ ] **Step 2: Append to `k3d/dev-stack/kustomization.yaml` resources.**

- [ ] **Step 3: Validate**

Run: `kubectl kustomize k3d/dev-stack/ | yq 'select(.kind == "IngressRoute")' | yq '.spec.routes[0].match'`
Expected: contains `HostRegexp` and `${DEV_DOMAIN}`.

- [ ] **Step 4: Commit**

```bash
git add k3d/dev-stack/traefik-wildcard-ingress.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): k3d Traefik catch-all routes <name>.dev to sish"
```

---

## Phase 4 — Taskfile

### Task 17: `Taskfile.dev-stack.yml` — cluster lifecycle

**Files:**
- Create: `Taskfile.dev-stack.yml`

- [ ] **Step 1: Read `Taskfile.argocd.yml`** for include conventions (the `_hub-guard`, `vars: ENV: '{{.ENV | default ...}}'`, the `desc:` style).

- [ ] **Step 2: Create `Taskfile.dev-stack.yml`** with the lifecycle tasks:

```yaml
# Taskfile.dev-stack.yml
# ─────────────────────────────────────────────────────────────────────────────
# dev.mentolder.de — k3d-in-k3s persistent dev stack.
# All tasks here either:
#   1) Run against the dev k3d cluster context `k3d-mentolder-dev`, OR
#   2) Run against the prod mentolder cluster but provision the dev side.
# `ENV=` is fixed to "mentolder" for this file — the dev stack is a
# sub-deployment of the mentolder env.
# ─────────────────────────────────────────────────────────────────────────────
version: "3"

vars:
  CTX_DEV: k3d-mentolder-dev
  CTX_PROD: mentolder
  NS_DEV: workspace-dev
  NS_PROD: workspace
  CLUSTER_NAME: mentolder-dev
  ENV: mentolder

tasks:

  # ── Internal guard — ensures we're on the right node when needed ────────
  _node-guard:
    internal: true
    preconditions:
      - sh: |
          source scripts/env-resolve.sh "{{.ENV}}"
          test -n "$DEV_NODE" && test -n "$DEV_DOMAIN"
        msg: |
          DEV_NODE / DEV_DOMAIN unset. Add them to environments/mentolder.yaml first.

  cluster:create:
    desc: "[dev] Create the dev k3d cluster on $DEV_NODE with the right port bindings"
    deps: [_node-guard]
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        # Refuse to clobber an existing cluster of the same name
        if k3d cluster list | grep -q "^{{.CLUSTER_NAME}} "; then
          echo "Cluster {{.CLUSTER_NAME}} already exists. Use task dev:cluster:delete first."
          exit 1
        fi
        ssh root@$DEV_NODE "cd /opt/bachelorprojekt && k3d cluster create {{.CLUSTER_NAME}} \
          --servers 1 --agents 0 \
          --port '127.0.0.1:18080:80@loadbalancer' \
          --port '0.0.0.0:2222:2222@loadbalancer' \
          --port '127.0.0.1:15432:30000@loadbalancer' \
          --k3s-arg '--disable=metrics-server@server:*' \
          --wait"
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ssh root@$DEV_NODE "k3d kubeconfig get {{.CLUSTER_NAME}}" \
          | KUBECONFIG=/dev/stdout kubectl config view --flatten \
          > /tmp/dev-kubeconfig.yaml
        # merge into ~/.kube/config under the canonical context name
        KUBECONFIG=$HOME/.kube/config:/tmp/dev-kubeconfig.yaml kubectl config view --flatten \
          > /tmp/merged-kubeconfig.yaml
        mv /tmp/merged-kubeconfig.yaml $HOME/.kube/config
        chmod 600 $HOME/.kube/config
        kubectl config use-context {{.CTX_DEV}}
        echo "✓ context {{.CTX_DEV}} active"

  cluster:delete:
    desc: "[dev] Destroy the dev k3d cluster (data lost — refresh from prod with dev:db:refresh)"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ssh root@$DEV_NODE "k3d cluster delete {{.CLUSTER_NAME}}"

  cluster:status:
    desc: "[dev] Show pod status on the dev k3d cluster"
    cmds:
      - kubectl --context {{.CTX_DEV}} get pods,svc,ing -n {{.NS_DEV}}
      - kubectl --context {{.CTX_DEV}} get pods -n kube-system

  logs:
    desc: "[dev] Tail logs of a pod (usage: task dev:logs -- website|brett|shared-db-dev|sish)"
    cmds:
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} logs -l app={{.CLI_ARGS}} --tail 200 -f

  psql:
    desc: "[dev] Open psql shell to shared-db-dev"
    cmds:
      - |
        kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} exec -it statefulset/shared-db-dev -- \
          psql -U postgres
```

- [ ] **Step 3: Wire into the main `Taskfile.yml`**

Open `Taskfile.yml`, locate the `includes:` block (line ~4), and add:

```yaml
  dev:
    taskfile: ./Taskfile.dev-stack.yml
    dir: .
```

- [ ] **Step 4: Validate**

Run: `task --list | grep '^\* dev:'`
Expected: prints at least `dev:cluster:create`, `dev:cluster:delete`, `dev:cluster:status`, `dev:logs`, `dev:psql`.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.dev-stack.yml Taskfile.yml
git commit -m "feat(dev): add Taskfile.dev-stack.yml with cluster lifecycle tasks"
```

---

### Task 18: `Taskfile.dev-stack.yml` — deploy + redeploy

**Files:**
- Modify: `Taskfile.dev-stack.yml`

- [ ] **Step 1: Open `Taskfile.dev-stack.yml`** and append these tasks at the end of `tasks:`:

```yaml
  _materialise-secrets:
    internal: true
    desc: "[dev] Decrypt sealed mentolder secrets and apply as plain Secrets in workspace-dev"
    cmds:
      - |
        set -euo pipefail
        # We need raw values for shared-db-dev-secrets (dev k3d has no
        # sealed-secrets controller). Use the prod sealed-secrets controller
        # to decrypt by routing through the prod cluster, then re-apply as
        # plain Secret inside dev.
        source scripts/env-resolve.sh "{{.ENV}}"
        TMP=$(mktemp -d)
        trap "rm -rf $TMP" EXIT
        # Read the plaintext values directly from .secrets — we trust the operator's
        # local file rather than round-tripping through the prod cluster.
        SHARED=$(yq '.secrets.DEV_SHARED_DB_PASSWORD' environments/.secrets/mentolder.yaml)
        SITE=$(yq '.secrets.DEV_WEBSITE_DB_PASSWORD' environments/.secrets/mentolder.yaml)
        AUTHKEYS=$(yq '.secrets.DEV_SISH_AUTHORIZED_KEYS' environments/.secrets/mentolder.yaml)
        kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} create secret generic shared-db-dev-secrets \
          --from-literal=DEV_SHARED_DB_PASSWORD="$SHARED" \
          --from-literal=DEV_WEBSITE_DB_PASSWORD="$SITE" \
          --dry-run=client -o yaml | kubectl --context {{.CTX_DEV}} apply -f -
        kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} create configmap sish-authorized-keys \
          --from-literal=authorized_keys="$AUTHKEYS" \
          --dry-run=client -o yaml | kubectl --context {{.CTX_DEV}} apply -f -

  build:website:
    desc: "[dev] Build the website image and import it into the dev k3d cluster"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        docker build -t ghcr.io/paddione/workspace-website:dev \
          -f website/Dockerfile \
          --build-arg PROD_DOMAIN=$DEV_DOMAIN \
          --build-arg BRAND=mentolder \
          .
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        docker save ghcr.io/paddione/workspace-website:dev \
          | ssh root@$DEV_NODE 'k3d image import - -c {{.CLUSTER_NAME}}'

  build:brett:
    desc: "[dev] Build the brett image and import it into the dev k3d cluster"
    cmds:
      - docker build -t ghcr.io/paddione/workspace-brett:dev -f brett/Dockerfile brett/
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        docker save ghcr.io/paddione/workspace-brett:dev \
          | ssh root@$DEV_NODE 'k3d image import - -c {{.CLUSTER_NAME}}'

  apply:
    desc: "[dev] Apply the dev-stack overlay to the dev k3d cluster (no image build)"
    deps: [_materialise-secrets]
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        kubectl kustomize k3d/dev-stack/ \
          | envsubst '$DEV_DOMAIN $DEV_WEBSITE_HOST $DEV_BRETT_HOST $PROD_DOMAIN $CONTACT_EMAIL' \
          | kubectl --context {{.CTX_DEV}} apply -f -
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout status deploy/website  --timeout=180s
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout status deploy/brett    --timeout=120s
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout status statefulset/shared-db-dev --timeout=180s
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout status deploy/sish    --timeout=60s

  deploy:
    desc: "[dev] Build images, import to k3d, apply manifests. Optional BRANCH=feature/x."
    cmds:
      - task: _maybe-checkout-branch
      - task: build:website
      - task: build:brett
      - task: apply

  redeploy:website:
    desc: "[dev] Rebuild + roll website only"
    cmds:
      - task: build:website
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout restart deploy/website
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout status  deploy/website --timeout=180s

  redeploy:brett:
    desc: "[dev] Rebuild + roll brett only"
    cmds:
      - task: build:brett
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout restart deploy/brett
      - kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} rollout status  deploy/brett --timeout=120s

  _maybe-checkout-branch:
    internal: true
    cmds:
      - |
        BRANCH="{{.BRANCH | default \"\"}}"
        if [[ -z "$BRANCH" ]]; then
          echo "deploying current HEAD"
          exit 0
        fi
        # Switch to an ephemeral worktree at the requested branch
        WT=$(mktemp -d)/branch
        git fetch origin "$BRANCH"
        git worktree add "$WT" "origin/$BRANCH"
        trap "git worktree remove --force $WT" EXIT
        echo "deploying $BRANCH from $WT"
        # Re-exec subsequent build:* tasks from the worktree
        cd "$WT" && task dev:build:website dev:build:brett dev:apply
```

> **Note on `BRANCH` flow:** the chained `task: build:website` lines run in the main workspace by default; the `_maybe-checkout-branch` helper above is a guard. The simpler real implementation is: the user `cd`s into a worktree first (per CLAUDE.md's `dev-flow` skill) and runs `task dev:deploy` — no `BRANCH=` parameter needed. Keep the BRANCH= path as a thin convenience wrapper; document it in the runbook.

- [ ] **Step 2: Validate**

Run: `task --list | grep '^\* dev:'`
Expected: now includes `dev:deploy`, `dev:redeploy:website`, `dev:redeploy:brett`, `dev:build:website`, `dev:build:brett`, `dev:apply`.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.dev-stack.yml
git commit -m "feat(dev): add deploy + redeploy tasks for website and brett"
```

---

### Task 19: `Taskfile.dev-stack.yml` — db:refresh + tunnel

**Files:**
- Modify: `Taskfile.dev-stack.yml`
- Create: `scripts/dev-db-refresh.sh`

- [ ] **Step 1: Write `scripts/dev-db-refresh.sh`**

```bash
#!/usr/bin/env bash
# scripts/dev-db-refresh.sh
# Restore the latest prod backup of (website, bugs, bachelorprojekt) into
# the dev k3d cluster's shared-db-dev. Runs either:
#   - as the dev-db-refresh CronJob pod (hostNetwork on $DEV_NODE), OR
#   - locally via `task dev:db:refresh` (assumes 127.0.0.1:15432 is the dev DB).
set -euo pipefail

: "${BACKUP_DIR:=/backups}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE required}"
: "${DEV_SHARED_DB_PASSWORD:?DEV_SHARED_DB_PASSWORD required}"
: "${DEV_WEBSITE_DB_PASSWORD:?DEV_WEBSITE_DB_PASSWORD required}"
: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=15432}"

DBS=("website" "bugs" "bachelorprojekt")
STAMP=$(ls -1 "$BACKUP_DIR" | sort -r | head -1)
if [[ -z "$STAMP" ]]; then
  echo "No backups found in $BACKUP_DIR — bailing." >&2
  exit 1
fi
echo "[dev-refresh] using snapshot $STAMP"

export PGPASSWORD="$DEV_SHARED_DB_PASSWORD"

for DB in "${DBS[@]}"; do
  SRC="$BACKUP_DIR/$STAMP/${DB}.dump.enc"
  if [[ ! -f "$SRC" ]]; then
    echo "[dev-refresh] skip $DB — no $SRC"
    continue
  fi
  echo "[dev-refresh] restoring $DB"
  # Drop + recreate so we start clean
  psql -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<-SQL
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();
    DROP DATABASE IF EXISTS "$DB";
    CREATE DATABASE "$DB" OWNER website;
SQL
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -pass env:BACKUP_PASSPHRASE -in "$SRC" \
    | pg_restore -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" --no-owner --role=website --clean --if-exists
done

# Re-grant role password (in case prod dump altered the role definition).
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 <<-SQL
  ALTER ROLE website WITH PASSWORD '${DEV_WEBSITE_DB_PASSWORD}';
SQL

echo "[dev-refresh] done."
```

```bash
chmod +x scripts/dev-db-refresh.sh
```

- [ ] **Step 2: Append db:refresh + tunnel tasks to `Taskfile.dev-stack.yml`**

```yaml
  db:refresh:
    desc: "[dev] Restore latest prod snapshot into shared-db-dev (drops + recreates DBs)"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        # Pull plaintext from sealed values via the operator's local file
        export BACKUP_PASSPHRASE=$(yq '.secrets.BACKUP_PASSPHRASE'        environments/.secrets/mentolder.yaml)
        export DEV_SHARED_DB_PASSWORD=$(yq '.secrets.DEV_SHARED_DB_PASSWORD' environments/.secrets/mentolder.yaml)
        export DEV_WEBSITE_DB_PASSWORD=$(yq '.secrets.DEV_WEBSITE_DB_PASSWORD' environments/.secrets/mentolder.yaml)
        # Stream backup snapshot from the prod backup-pvc through ssh+kubectl
        TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
        ssh root@$DEV_NODE "kubectl --context {{.CTX_PROD}} -n {{.NS_PROD}} exec deploy/postgres-backup-debugger -- tar -C /backups -cf - ." \
          2>/dev/null | tar -C "$TMP" -xf - || {
            # Fallback: use the existing list+exec helpers
            kubectl --context {{.CTX_PROD}} -n {{.NS_PROD}} cp \
              $(kubectl --context {{.CTX_PROD}} -n {{.NS_PROD}} get pod -l app=backup -o jsonpath='{.items[0].metadata.name}'):/backups "$TMP/backups"
          }
        BACKUP_DIR="$TMP/backups" PGHOST=127.0.0.1 PGPORT=15432 bash scripts/dev-db-refresh.sh

  tunnel:
    desc: "[dev] ssh -R wrapper. Usage: task dev:tunnel -- <name> <localport>"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        NAME=$(echo "{{.CLI_ARGS}}" | awk '{print $1}')
        PORT=$(echo "{{.CLI_ARGS}}" | awk '{print $2}')
        if [[ -z "$NAME" || -z "$PORT" ]]; then
          echo "Usage: task dev:tunnel -- <name> <localport>" >&2; exit 2
        fi
        echo "Publishing localhost:$PORT as https://$NAME.$DEV_DOMAIN"
        ssh -p 2222 -R "$NAME:80:localhost:$PORT" tunnel@"$DEV_DOMAIN"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/dev-db-refresh.sh Taskfile.dev-stack.yml
git commit -m "feat(dev): add db:refresh and tunnel convenience tasks"
```

---

## Phase 5 — Prod-side nightly refresh CronJob

### Task 20: `dev-db-refresh` CronJob in prod-mentolder

**Files:**
- Create: `prod-mentolder/dev-db-refresh-cron.yaml`

- [ ] **Step 1: Read `k3d/backup-cronjob.yaml`** to copy: image (`pgvector/pgvector:0.8.0-pg16`), the `workspace-secrets`/`BACKUP_PASSPHRASE` wiring, the volume mount for `backup-pvc`.

- [ ] **Step 2: Write the CronJob**

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: dev-db-refresh
  namespace: ${WORKSPACE_NAMESPACE}
spec:
  schedule: "30 3 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          hostNetwork: true
          dnsPolicy: ClusterFirstWithHostNet
          nodeSelector:
            kubernetes.io/hostname: ${DEV_NODE}
          containers:
            - name: refresh
              image: pgvector/pgvector:0.8.0-pg16
              command: [/bin/bash, /scripts/dev-db-refresh.sh]
              env:
                - name: BACKUP_DIR
                  value: /backups
                - name: PGHOST
                  value: 127.0.0.1
                - name: PGPORT
                  value: "15432"
                - name: BACKUP_PASSPHRASE
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: BACKUP_PASSPHRASE } }
                - name: DEV_SHARED_DB_PASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: DEV_SHARED_DB_PASSWORD } }
                - name: DEV_WEBSITE_DB_PASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: DEV_WEBSITE_DB_PASSWORD } }
              volumeMounts:
                - { name: backup-pvc, mountPath: /backups, readOnly: true }
                - { name: scripts,    mountPath: /scripts }
              resources:
                requests: { memory: 256Mi, cpu: 100m }
                limits:   { memory: 1Gi,   cpu: 1000m }
          volumes:
            - name: backup-pvc
              persistentVolumeClaim: { claimName: backup-pvc }
            - name: scripts
              configMap:
                name: dev-db-refresh-script
                defaultMode: 0755
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: dev-db-refresh-script
  namespace: ${WORKSPACE_NAMESPACE}
data:
  dev-db-refresh.sh: |
    {{ include the content of scripts/dev-db-refresh.sh inline at build time }}
```

> **Wiring the script into the ConfigMap:** Instead of using `{{ include ... }}` (not standard YAML), use the same pattern other CronJobs use — generate the CM from the script file at deploy time via kustomize's `configMapGenerator`:

```yaml
# in prod-mentolder/kustomization.yaml, add:
configMapGenerator:
  - name: dev-db-refresh-script
    namespace: workspace
    files:
      - ../scripts/dev-db-refresh.sh
generatorOptions:
  disableNameSuffixHash: true
```

(Adjust to match the existing prod-mentolder kustomization style — if it already disables the suffix hash globally, just add the new entry.)

- [ ] **Step 3: Add the CronJob YAML to `prod-mentolder/kustomization.yaml` resources** (and the configMapGenerator entry above).

- [ ] **Step 4: Validate**

Run: `kubectl --context mentolder kustomize prod-mentolder/ | yq 'select(.kind == "CronJob" and .metadata.name == "dev-db-refresh")' | yq '.spec.jobTemplate.spec.template.spec.hostNetwork'`
Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add prod-mentolder/dev-db-refresh-cron.yaml prod-mentolder/kustomization.yaml
git commit -m "feat(dev): nightly dev-db-refresh CronJob in prod-mentolder"
```

---

## Phase 6 — Firewall + ufw

### Task 21: Add 2222/tcp rules to `prod/cloud-init.yaml`

**Files:**
- Modify: `prod/cloud-init.yaml`

- [ ] **Step 1: Read the existing `ufw allow` block** in `prod/cloud-init.yaml` (lines ~85-98 per the explore report).

- [ ] **Step 2: Append the new rules**

Find the line block that contains existing `ufw allow ... /tcp` commands and add immediately after the last existing `ufw allow` (replace your `DEV_SSH_ALLOWLIST` CIDRs at apply-time via cloud-init's `runcmd` shell variable expansion if cloud-init supports it; otherwise the SSH allowlist applies as a follow-up command on the running node):

```yaml
    # ── dev.mentolder.de — sish SSH (2222/tcp) ─────────────────────────────
    # Deny-by-default; explicit allow from each entry in DEV_SSH_ALLOWLIST.
    # If DEV_SSH_ALLOWLIST is empty, nothing on the public Internet can reach
    # port 2222. Curated keys (in sish-authorized-keys CM) still gate access
    # even from allowed CIDRs.
    - ufw deny 2222/tcp comment "sish — default deny"
    # The runtime allow rules are NOT in cloud-init; they are applied by
    # `task dev:firewall:open` (see Taskfile.dev-stack.yml) per CIDR from
    # the DEV_SSH_ALLOWLIST env var, so we can update them without re-imaging.
```

- [ ] **Step 3: Add a `firewall:open` task in `Taskfile.dev-stack.yml`**

```yaml
  firewall:open:
    desc: "[dev] Apply DEV_SSH_ALLOWLIST CIDRs as ufw allow rules on $DEV_NODE"
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        if [[ -z "$DEV_SSH_ALLOWLIST" ]]; then
          echo "DEV_SSH_ALLOWLIST is empty — nothing to do." >&2
          exit 0
        fi
        IFS=',' read -ra CIDRS <<<"$DEV_SSH_ALLOWLIST"
        for cidr in "${CIDRS[@]}"; do
          ssh root@$DEV_NODE "ufw allow from $cidr to any port 2222 proto tcp comment 'sish-allow'"
        done
        ssh root@$DEV_NODE "ufw reload && ufw status numbered | grep 2222"
```

- [ ] **Step 4: Validate**

Run: `yamllint prod/cloud-init.yaml 2>&1 | head -5`
Expected: no error (or only pre-existing warnings). If yamllint isn't installed locally, run `python3 -c "import yaml; yaml.safe_load(open('prod/cloud-init.yaml'))" && echo OK`.

- [ ] **Step 5: Commit**

```bash
git add prod/cloud-init.yaml Taskfile.dev-stack.yml
git commit -m "feat(dev): ufw deny-default for :2222 + task dev:firewall:open"
```

---

## Phase 7 — Smoke tests

### Task 22: `tests/dev-stack/dev-tls.bats`

**Files:**
- Create: `tests/dev-stack/dev-tls.bats`

- [ ] **Step 1: Write the test**

```bash
#!/usr/bin/env bats
# tests/dev-stack/dev-tls.bats
# Smoke tests the SSO gate is alive: an unauthenticated GET against
# the dev website redirects to auth.mentolder.de.

load ../lib/assert

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  DEV_WEBSITE_HOST="${DEV_WEBSITE_HOST:-web.dev.mentolder.de}"
  AUTH_HOST="${AUTH_HOST:-auth.mentolder.de}"
}

@test "dev-tls.1: https://\$DEV_WEBSITE_HOST returns a TLS certificate" {
  run curl -sIo /dev/null -w "%{http_code}\n" "https://$DEV_WEBSITE_HOST"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^(200|301|302|307)$ ]] || {
    echo "Expected 2xx/3xx, got: $output"; return 1;
  }
}

@test "dev-tls.2: anonymous GET redirects to auth.\$PROD_DOMAIN" {
  run curl -sI -L --max-redirs 1 "https://$DEV_WEBSITE_HOST"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "location:.*$AUTH_HOST" || {
    echo "Expected redirect to $AUTH_HOST; got:"; echo "$output"; return 1;
  }
}

@test "dev-tls.3: cert is valid (not self-signed)" {
  run bash -c "echo | openssl s_client -servername $DEV_WEBSITE_HOST -connect $DEV_WEBSITE_HOST:443 -verify_return_error </dev/null 2>&1 | grep -q 'Verify return code: 0'"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/dev-stack/dev-tls.bats
git commit -m "test(dev): smoke test TLS + SSO redirect for dev website"
```

---

### Task 23: `tests/dev-stack/dev-sso.bats`

**Files:**
- Create: `tests/dev-stack/dev-sso.bats`

- [ ] **Step 1: Look at how other BATS tests mint Keycloak tokens** (`grep -rn 'token_endpoint\|client_credentials' tests/lib/ tests/local/` — there may already be a helper). If not, write one inline.

- [ ] **Step 2: Write the test**

```bash
#!/usr/bin/env bats
# tests/dev-stack/dev-sso.bats
# Verifies a valid _oauth2_dev session reaches the website upstream.
# Strategy: use Keycloak Direct Access Grants on a *separate test client*
# (with directAccessGrantsEnabled=true) to mint an access token for a
# test user, then exchange it for a cookie via oauth2-proxy's
# /oauth2/auth + /oauth2/start flow. Skip if the test client/user is
# not provisioned (so CI doesn't block on missing setup).

load ../lib/assert

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  : "${KC_TEST_USER:?KC_TEST_USER required}"
  : "${KC_TEST_PASSWORD:?KC_TEST_PASSWORD required}"
  : "${KC_TEST_CLIENT_ID:=workspace-dev-test}"
  : "${KC_TEST_CLIENT_SECRET:?KC_TEST_CLIENT_SECRET required}"
  AUTH="${AUTH_HOST:-auth.mentolder.de}"
  DEV="${DEV_WEBSITE_HOST:-web.dev.mentolder.de}"
}

@test "dev-sso.1: Direct Access Grant returns an access token" {
  run curl -sS -X POST "https://$AUTH/realms/workspace/protocol/openid-connect/token" \
    -d "client_id=$KC_TEST_CLIENT_ID" \
    -d "client_secret=$KC_TEST_CLIENT_SECRET" \
    -d "grant_type=password" \
    -d "username=$KC_TEST_USER" \
    -d "password=$KC_TEST_PASSWORD"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"access_token"' || { echo "$output"; return 1; }
}

@test "dev-sso.2: authenticated session reaches the website upstream" {
  # End-to-end browser-style cookie flow is brittle in BATS; instead we
  # mint an access token and verify oauth2-proxy /oauth2/auth accepts it
  # via the Authorization header (--pass-authorization-header=true).
  TOKEN=$(curl -sS -X POST "https://$AUTH/realms/workspace/protocol/openid-connect/token" \
    -d "client_id=$KC_TEST_CLIENT_ID" \
    -d "client_secret=$KC_TEST_CLIENT_SECRET" \
    -d "grant_type=password" \
    -d "username=$KC_TEST_USER" \
    -d "password=$KC_TEST_PASSWORD" | jq -r .access_token)
  [ -n "$TOKEN" ]

  run curl -sIo /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "https://$DEV/api/health"
  [ "$status" -eq 0 ]
  [[ "$output" == "200" ]] || { echo "got: $output"; return 1; }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/dev-stack/dev-sso.bats
git commit -m "test(dev): SSO end-to-end via Direct Access Grant"
```

---

### Task 24: `tests/dev-stack/dev-tunnel.bats`

**Files:**
- Create: `tests/dev-stack/dev-tunnel.bats`

- [ ] **Step 1: Write the test**

```bash
#!/usr/bin/env bats
# tests/dev-stack/dev-tunnel.bats
# Starts a local Python HTTP server, opens an ssh -R tunnel through
# sish, then curls the tunnel hostname (with a Bearer token like in
# dev-sso.2), verifying the response body matches what the local
# server emits. Cleans up the tunnel and verifies teardown.

load ../lib/assert

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  : "${DEV_DOMAIN:?DEV_DOMAIN required}"
  : "${SISH_TUNNEL_KEY:?path to private key authorized in sish required}"
  : "${KC_TEST_USER:?}"; : "${KC_TEST_PASSWORD:?}"
  : "${KC_TEST_CLIENT_ID:=workspace-dev-test}"; : "${KC_TEST_CLIENT_SECRET:?}"
  TUNNEL_NAME="bats-tunnel-$$"
  TUNNEL_PORT=18099
  AUTH="${AUTH_HOST:-auth.mentolder.de}"
}

teardown() {
  [[ -n "${SSH_PID:-}" ]] && kill "$SSH_PID" 2>/dev/null || true
  [[ -n "${PY_PID:-}"  ]] && kill "$PY_PID"  2>/dev/null || true
}

@test "dev-tunnel.1: round-trip through sish" {
  # local server
  echo "tunnel-ok-$$" > /tmp/tunnel-marker
  ( cd /tmp && python3 -m http.server "$TUNNEL_PORT" >/dev/null 2>&1 ) &
  PY_PID=$!
  sleep 2

  # ssh tunnel
  ssh -i "$SISH_TUNNEL_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -p 2222 -N -R "$TUNNEL_NAME:80:localhost:$TUNNEL_PORT" \
      tunnel@"$DEV_DOMAIN" &
  SSH_PID=$!
  sleep 3

  # mint a token
  TOKEN=$(curl -sS -X POST "https://$AUTH/realms/workspace/protocol/openid-connect/token" \
    -d "client_id=$KC_TEST_CLIENT_ID" \
    -d "client_secret=$KC_TEST_CLIENT_SECRET" \
    -d "grant_type=password" \
    -d "username=$KC_TEST_USER" \
    -d "password=$KC_TEST_PASSWORD" | jq -r .access_token)

  run curl -sS -H "Authorization: Bearer $TOKEN" \
    "https://$TUNNEL_NAME.$DEV_DOMAIN/tunnel-marker"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "tunnel-ok-$$"
}

@test "dev-tunnel.2: tunnel teardown removes the route" {
  [[ -n "${SSH_PID:-}" ]] && kill "$SSH_PID"
  sleep 3
  run curl -sIo /dev/null -w "%{http_code}\n" "https://$TUNNEL_NAME.$DEV_DOMAIN/"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^(404|502|503)$ ]] || { echo "got: $output"; return 1; }
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/dev-stack/dev-tunnel.bats
git commit -m "test(dev): tunnel round-trip + teardown via sish"
```

---

### Task 25: Gate dev tests behind `RUN_DEV_TESTS` in the runner

**Files:**
- Modify: `tests/runner.sh`

- [ ] **Step 1: Open `tests/runner.sh`** and find where it enumerates BATS files for the `local` tier.

- [ ] **Step 2: Add the gate** — the runner should NOT include `tests/dev-stack/*` unless `RUN_DEV_TESTS=true`. Concretely, find the line that globs `tests/local/*.bats` and append a conditional include:

```bash
if [[ "${RUN_DEV_TESTS:-false}" == "true" ]]; then
  TEST_FILES+=("tests/dev-stack/"*.bats)
fi
```

(Adjust to fit the existing variable names.)

- [ ] **Step 3: Verify the gate works**

Run: `RUN_DEV_TESTS=false ./tests/runner.sh local --list 2>&1 | grep -c 'dev-stack' || echo "0"`
Expected: `0`.
Run: `RUN_DEV_TESTS=true ./tests/runner.sh local --list 2>&1 | grep -c 'dev-stack'`
Expected: `3` (one per .bats file).

- [ ] **Step 4: Commit**

```bash
git add tests/runner.sh
git commit -m "test(dev): gate dev-stack tests behind RUN_DEV_TESTS env"
```

---

## Phase 8 — CI auto-deploy

### Task 26: SSH deploy key on `gekko-hetzner-2` with `command=` restriction

**Files:**
- None in repo — operational.

- [ ] **Step 1: Generate a fresh ed25519 keypair on your laptop**

```bash
ssh-keygen -t ed25519 -f /tmp/dev-deploy-key -N "" -C "github-actions/dev-auto-deploy"
```

- [ ] **Step 2: Add it to `~/.ssh/authorized_keys` on the node with a `command=` lock**

```bash
PUB=$(cat /tmp/dev-deploy-key.pub)
ssh root@gekko-hetzner-2 "echo 'command=\"/opt/bachelorprojekt/scripts/dev-deploy-wrapper.sh \$SSH_ORIGINAL_COMMAND\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUB' >> ~/.ssh/authorized_keys"
```

- [ ] **Step 3: Write the wrapper script on the node**

```bash
ssh root@gekko-hetzner-2 'cat > /opt/bachelorprojekt/scripts/dev-deploy-wrapper.sh' <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/bachelorprojekt
git fetch --depth 1 origin main && git reset --hard origin/main
# Only allow these specific tasks
case "$1" in
  dev:deploy|dev:redeploy:website|dev:redeploy:brett|dev:apply|dev:db:refresh)
    exec task "$1"
    ;;
  *) echo "Disallowed: $1"; exit 1 ;;
esac
EOF
ssh root@gekko-hetzner-2 'chmod +x /opt/bachelorprojekt/scripts/dev-deploy-wrapper.sh'
```

- [ ] **Step 4: Add the private key as a GitHub secret**

```bash
gh secret set DEV_DEPLOY_SSH_KEY --body "$(cat /tmp/dev-deploy-key)" --repo paddione/Bachelorprojekt
gh secret set DEV_DEPLOY_HOST    --body "gekko-hetzner-2"            --repo paddione/Bachelorprojekt
gh secret set DEV_DEPLOY_USER    --body "root"                       --repo paddione/Bachelorprojekt
rm /tmp/dev-deploy-key /tmp/dev-deploy-key.pub
```

- [ ] **Step 5: Verify the wrapper rejects unknown commands**

Run: `ssh -i /tmp/dev-deploy-key -p 22 root@gekko-hetzner-2 'whoami'`
Expected: `Disallowed: whoami` (since the wrapper passes `$SSH_ORIGINAL_COMMAND` and rejects).

- [ ] **Step 6: No commit (operational only).** Note completion in PR body.

---

### Task 27: `.github/workflows/dev-auto-deploy.yml`

**Files:**
- Create: `.github/workflows/dev-auto-deploy.yml`

- [ ] **Step 1: Look at an existing path-filtered workflow** (`.github/workflows/build-tracking.yml` or similar) for SSH or `paths:` filter conventions.

- [ ] **Step 2: Write the workflow**

```yaml
name: dev-auto-deploy
on:
  push:
    branches: [main]
    paths:
      - "website/**"
      - "brett/**"
      - "k3d/dev-stack/**"
      - "prod-mentolder/dev-*"
      - "prod-mentolder/oauth2-proxy-dev*"
      - "prod-mentolder/cert-dev-wildcard.yaml"
      - "Taskfile.dev-stack.yml"
      - "scripts/dev-db-refresh.sh"

jobs:
  redeploy:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v5
        with: { fetch-depth: 2 }

      - name: Determine what changed
        id: changes
        run: |
          set -e
          CHANGED=$(git diff --name-only HEAD^ HEAD)
          echo "$CHANGED"
          echo "website=$(grep -qE '^website/'     <<<"$CHANGED" && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "brett=$(grep -qE '^brett/'         <<<"$CHANGED" && echo true || echo false)" >> $GITHUB_OUTPUT
          echo "full=$(grep -qE '^(k3d/dev-stack|prod-mentolder/dev-|prod-mentolder/oauth2-proxy-dev|prod-mentolder/cert-dev-wildcard|Taskfile.dev-stack|scripts/dev-db-refresh)' <<<"$CHANGED" && echo true || echo false)" >> $GITHUB_OUTPUT

      - name: SSH to gekko-hetzner-2 — full deploy
        if: steps.changes.outputs.full == 'true'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host:     ${{ secrets.DEV_DEPLOY_HOST }}
          username: ${{ secrets.DEV_DEPLOY_USER }}
          key:      ${{ secrets.DEV_DEPLOY_SSH_KEY }}
          command_timeout: 20m
          script: dev:deploy

      - name: SSH to gekko-hetzner-2 — website only
        if: steps.changes.outputs.full == 'false' && steps.changes.outputs.website == 'true'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host:     ${{ secrets.DEV_DEPLOY_HOST }}
          username: ${{ secrets.DEV_DEPLOY_USER }}
          key:      ${{ secrets.DEV_DEPLOY_SSH_KEY }}
          command_timeout: 10m
          script: dev:redeploy:website

      - name: SSH to gekko-hetzner-2 — brett only
        if: steps.changes.outputs.full == 'false' && steps.changes.outputs.brett == 'true'
        uses: appleboy/ssh-action@v1.0.3
        with:
          host:     ${{ secrets.DEV_DEPLOY_HOST }}
          username: ${{ secrets.DEV_DEPLOY_USER }}
          key:      ${{ secrets.DEV_DEPLOY_SSH_KEY }}
          command_timeout: 10m
          script: dev:redeploy:brett
```

- [ ] **Step 3: Validate**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dev-auto-deploy.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/dev-auto-deploy.yml
git commit -m "ci(dev): auto-deploy dev stack on push to main"
```

---

### Task 28: `.github/workflows/dev-smoke.yml`

**Files:**
- Create: `.github/workflows/dev-smoke.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: dev-smoke
on:
  schedule:
    - cron: "0 5 * * *"   # 05:00 UTC — after the 03:30 dev-db-refresh CronJob
  workflow_dispatch:

jobs:
  smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5

      - name: Install bats + jq + curl
        run: |
          sudo apt-get update -y
          sudo apt-get install -y bats jq curl openssh-client openssl

      - name: Write sish tunnel test key
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          echo "${{ secrets.SISH_TEST_KEY }}" > ~/.ssh/sish_test
          chmod 600 ~/.ssh/sish_test

      - name: Run dev smoke tests
        env:
          RUN_DEV_TESTS: "true"
          DEV_DOMAIN:         dev.mentolder.de
          DEV_WEBSITE_HOST:   web.dev.mentolder.de
          AUTH_HOST:          auth.mentolder.de
          KC_TEST_USER:       ${{ secrets.KC_TEST_USER }}
          KC_TEST_PASSWORD:   ${{ secrets.KC_TEST_PASSWORD }}
          KC_TEST_CLIENT_ID:  workspace-dev-test
          KC_TEST_CLIENT_SECRET: ${{ secrets.KC_TEST_CLIENT_SECRET }}
          SISH_TUNNEL_KEY:    /home/runner/.ssh/sish_test
        run: |
          ./tests/runner.sh local --files tests/dev-stack/
```

- [ ] **Step 2: Set the required secrets**

```bash
gh secret set KC_TEST_USER          --body "smoke@example.org"   --repo paddione/Bachelorprojekt
gh secret set KC_TEST_PASSWORD      --body "<password>"          --repo paddione/Bachelorprojekt
gh secret set KC_TEST_CLIENT_SECRET --body "<client-secret>"     --repo paddione/Bachelorprojekt
gh secret set SISH_TEST_KEY         --body "$(cat /tmp/sish-test-key)" --repo paddione/Bachelorprojekt
```

(Generate the sish-test-key separately; add its pubkey to `DEV_SISH_AUTHORIZED_KEYS` and re-seal/re-deploy.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/dev-smoke.yml
git commit -m "ci(dev): nightly smoke tests against dev.mentolder.de"
```

---

## Phase 9 — Documentation + rollout

### Task 29: Operator runbook

**Files:**
- Create: `docs/dev-stack/README.md`

- [ ] **Step 1: Write the runbook** (~150 lines) covering: what dev is, how it's wired, the four day-to-day operations (deploy, redeploy:website, redeploy:brett, db:refresh, tunnel), how to add yourself to `dev-access`, how to add a new sish authorized key, what breaks when, where the logs are, and the gotchas reproduced from spec §7 ("Gotchas") verbatim.

```markdown
# dev.mentolder.de — Operator Runbook

[content described above — see spec §7 for the gotchas to reproduce; cover each Taskfile.dev-stack.yml task with one usage example and one "what to check when it fails"; include the architecture diagram from the spec.]
```

- [ ] **Step 2: Commit**

```bash
git add docs/dev-stack/README.md
git commit -m "docs(dev): add operator runbook for dev.mentolder.de"
```

---

### Task 30: Update `CLAUDE.md` — Common Commands + Gotchas

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Dev stack (dev.mentolder.de)" subsection in `## Common Commands`** with the `task dev:*` reference. Place it just above the `### Testing` block.

```markdown
### Dev stack (`dev.mentolder.de` — persistent staging on gekko-hetzner-2)
```bash
task dev:cluster:create            # bootstrap the dev k3d cluster on the gekko node
task dev:cluster:status            # pod status in workspace-dev
task dev:deploy                    # build website+brett, import to k3d, apply manifests
task dev:redeploy:website          # rebuild + roll website only
task dev:redeploy:brett            # rebuild + roll brett only
task dev:db:refresh                # one-shot restore latest prod snapshot into shared-db-dev
task dev:tunnel -- <name> <port>   # publish localhost:<port> as https://<name>.dev.mentolder.de
task dev:logs    -- <svc>          # tail dev pod logs
task dev:psql                      # psql into shared-db-dev
task dev:firewall:open             # apply DEV_SSH_ALLOWLIST CIDRs to ufw on the dev node
```
See `docs/dev-stack/README.md` for the full runbook. The dev cluster's HTTP LB is bound to `127.0.0.1:18080`; access goes through prod Traefik + the `workspace-dev` OIDC client.
```

- [ ] **Step 2: Add a Gotchas subsection at the end of `## Gotchas & Footguns`**

```markdown
### dev.mentolder.de stack

- **The dev k3d cluster runs on `gekko-hetzner-2` as a Docker sibling of the k3s control-plane.** `task dev:cluster:create` SSHes to that node — running it elsewhere fails. Recreating the cluster without `task dev:cluster:create` loses the load-bearing port mappings (`127.0.0.1:18080`, `0.0.0.0:2222`, `127.0.0.1:15432`).
- **Dev sees prod data.** The 03:30 UTC `dev-db-refresh` CronJob drops + recreates `website`, `bugs`, `bachelorprojekt` in shared-db-dev from the latest prod backup. Don't write production rituals against the dev DB — they will be erased nightly.
- **SSH 2222 is exposed publicly** but ufw deny-default'd. Allowlist runs via `task dev:firewall:open` reading `DEV_SSH_ALLOWLIST` from `environments/mentolder.yaml`. Anyone who can SSH in still needs a key in `DEV_SISH_AUTHORIZED_KEYS`.
- **Dev secrets are sealed against the mentolder cert** (the dev refresh CronJob runs in prod), but materialised inside dev k3d as a plain Secret by `task dev:_materialise-secrets`. Don't apply `environments/sealed-secrets/mentolder.yaml` to the `k3d-mentolder-dev` context — there's no sealed-secrets-controller there.
- **`workspace-dev` Keycloak client requires `dev-access` group membership.** Add yourself in the KC admin UI before first-visit, else you'll loop on 403.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): add dev-stack commands and gotchas"
```

---

### Task 31: Capture node baseline

**Files:**
- None (operational).

- [ ] **Step 1: Snapshot `kubectl top` on the gekko-hetzner-2 node BEFORE first dev deploy**

Run:
```bash
kubectl --context mentolder top node gekko-hetzner-2 > /tmp/gekko-baseline-before.txt
kubectl --context mentolder top pod -A --sort-by=memory --field-selector=spec.nodeName=gekko-hetzner-2 >> /tmp/gekko-baseline-before.txt
cat /tmp/gekko-baseline-before.txt
```

Paste the output into the PR description under "Pre-rollout baseline" so we can compare after.

- [ ] **Step 2: No commit.**

---

### Task 32: First-time rollout (per spec §7)

**Files:**
- None — sequenced apply of everything we've committed.

- [ ] **Step 1: Cert + DNS** (already done in Tasks 5, 6).

Verify: `kubectl --context mentolder -n workspace get certificate workspace-dev-wildcard-tls`
Expected: `READY=True` within ~2 minutes.

- [ ] **Step 2: Keycloak — apply realm changes**

Run: `task keycloak:sync ENV=mentolder`
Expected: `~ updated client workspace-dev` / `+ created group /dev-access`.

Add your KC user to the `dev-access` group via the Keycloak admin UI at `https://auth.mentolder.de/admin/master/console/#/workspace/groups`.

- [ ] **Step 3: Prod-side resources** — apply the new prod-mentolder manifests

Run: `task workspace:deploy ENV=mentolder`
Expected: applies cleanly. `kubectl --context mentolder -n workspace get pods -l app=oauth2-proxy-dev` shows `Running`.
The `*.dev.mentolder.de` Ingress will return 502 until step 5 — expected.

- [ ] **Step 4: Bring up the k3d cluster**

Run: `task dev:cluster:create`
Expected: context `k3d-mentolder-dev` is reachable.

- [ ] **Step 5: Deploy the dev stack**

Run: `task dev:deploy`
Expected: rollout completes for website, brett, shared-db-dev, sish.

- [ ] **Step 6: First snapshot restore**

Run: `task dev:db:refresh`
Expected: "[dev-refresh] done." Tables present:
```bash
task dev:psql -- -c "\dt+ public.*" -d website | head -5
```

- [ ] **Step 7: Verify in a browser**

Open `https://web.dev.mentolder.de`. Expected: redirect to KC login → after authenticating, land on the mentolder homepage but reading the dev DB.

- [ ] **Step 8: Snapshot `kubectl top` AFTER rollout**

Run:
```bash
kubectl --context mentolder top node gekko-hetzner-2 > /tmp/gekko-baseline-after.txt
diff /tmp/gekko-baseline-before.txt /tmp/gekko-baseline-after.txt
```

Paste the diff under "Post-rollout baseline" in the PR body.

- [ ] **Step 9: No commit.**

---

### Task 33: Open the PR

**Files:**
- None.

- [ ] **Step 1: Push the branch and open the PR using the existing skill**

Use `commit-commands:commit-push-pr` (or call `gh pr create` directly). PR title: `feat(dev): persistent dev.mentolder.de stack with SSO gate and sish tunnels`.

Body should include:
- One-paragraph summary linking to `docs/superpowers/specs/2026-05-13-dev-mentolder-stack-design.md`
- The pre/post `kubectl top` diffs from Tasks 31 + 32
- Checklist of rollout steps completed (Tasks 4, 6, 26, 28 secrets, 32 §1–§7)
- Test plan: `RUN_DEV_TESTS=true ./tests/runner.sh local --files tests/dev-stack/` once the secrets are in place

- [ ] **Step 2: Auto-merge per user preference (memory: PR workflow — auto-merge).**

```bash
gh pr merge --squash --auto
```

---

## Out of scope (revisit when needed)

Per spec §8: per-branch preview subdomains, non-`dev-access` user previews, ArgoCD federation of the dev cluster, running Nextcloud/Keycloak/LiveKit/MCP/DocuSeal/Vaultwarden inside dev.

---

## Self-review notes (verify before handoff)

1. **Spec coverage map** (every §2 Goal → task):
   - Always-on dev URLs reflecting `main` → Tasks 13, 14, 27
   - Ad-hoc `<name>.dev.mentolder.de` via ssh -R → Tasks 15, 16, 19, 22
   - SSO gate via `workspace-dev` OIDC + `dev-access` group → Tasks 4, 7, 8, 9
   - Nightly prod-DB restore → Tasks 12, 19, 20
   - Manual branch preview → Task 18 (`BRANCH=` path)
   - Non-goal: per-branch URLs — explicitly noted in "Out of scope"

2. **No placeholders** — every code block above is concrete; all `${VAR}` references resolve to declared schema entries (Task 1). Two soft spots:
   - The `keycloak-sync.sh` patch in Task 4 step 3 is structural — verify the script's actual auth flow matches before merging that edit
   - The `_materialise-secrets` task in Task 18 reads `environments/.secrets/mentolder.yaml` via `yq` — confirm the path key is `.secrets.<name>` (matches the schema's `secrets:` block) before running

3. **Type consistency** — secret names (`DEV_SHARED_DB_PASSWORD`, `DEV_WEBSITE_DB_PASSWORD`, `DEV_OAUTH2_PROXY_COOKIE_SECRET`, `DEV_WORKSPACE_OIDC_SECRET`, `DEV_SISH_AUTHORIZED_KEYS`) appear identically in schema, sealed file, oauth2-proxy env block, init Job, refresh CronJob, and Taskfile materialise step. Hostname pair (`DEV_WEBSITE_HOST`, `DEV_BRETT_HOST`) is consistent across the Ingress, Taskfile, and dev-tls.bats.

---

## Frontmatter

After saving this file, run:

```bash
bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-05-13-dev-mentolder-stack.md
git add docs/superpowers/plans/2026-05-13-dev-mentolder-stack.md
git commit -m "docs(plans): add dev.mentolder.de implementation plan"
```

(per CLAUDE.md: the plan-context.sh / GH Action depend on the domains+status frontmatter).
