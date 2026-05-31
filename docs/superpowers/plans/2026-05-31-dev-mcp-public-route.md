---
title: Restore the dev MCP public route — self-contained k3d edge
ticket_id: T000363
domains: [infra, security, ops, test]
status: active
pr_number: null
---

# Restore the dev MCP public route — self-contained k3d edge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://mcp.dev.mentolder.de/{kubernetes,postgres}/mcp` reachable from the public internet with a valid TLS cert, by moving the 443 TLS + SSO edge entirely into the k3d dev cluster on the k3s-1 node — removing the lost dependency on the decommissioned standalone-k3s.

**Architecture:** The k3d dev cluster becomes self-contained: it publishes host `0.0.0.0:443`, its in-cluster Traefik terminates TLS with a cert-manager-issued `*.dev.mentolder.de` wildcard (Let's Encrypt DNS-01 via ipv64), and `oauth2-proxy-dev` runs as an ordinary in-cluster pod (no hostNetwork) that SSO-gates `*.dev` while skip-auth'ing the token-authed MCP path prefixes and looping back to the cluster Traefik for host routing. The FritzBox already forwards public 443 → k3s-1. The old fleet/standalone bridge artifacts are removed and the half-applied multinode-HA VIP (#1213) is reverted.

**Tech Stack:** k3d / k3s v1.31, Traefik (k3s built-in, TLSStore), cert-manager + cert-manager-lego-webhook (ipv64 DNS-01), oauth2-proxy v7.9.0 (keycloak-oidc), Kustomize, kubectl, envsubst, BATS.

**Spec:** `docs/superpowers/specs/2026-05-31-dev-mcp-public-route-design.md` (this plan supersedes `2026-05-30-dev-mcp-public-route-design.md` and shelves `2026-05-30-multinode-dev-cluster-ha-design.md`).
**Ticket:** T000363 · **Branch:** `fix/dev-mcp-public-route`

---

## Context an implementer needs

- **What broke:** The mentolder-standalone cluster was decommissioned 2026-05-30; standalone-k3s was uninstalled from the k3s-1 node. That standalone k3s provided host `:443` (Traefik), the `workspace-dev-wildcard-tls` cert, and the `oauth2-proxy-dev` pod. The k3d dev cluster on k3s-1 survived (serves HTTP on `127.0.0.1:18080`) but is now orphaned — nothing listens on `:443`.
- **Where you work:** `task dev:*` SSHes to `DEV_NODE=k3s-1`. From this workstation reach the node with `ssh -i ~/.ssh/gekko_id_ed25519 gekko@10.0.3.1`. Run dev-cluster kubectl as `kubectl --context k3d-mentolder-dev ...` **from the k3s-1 guest** (the context is not merged locally).
- **Apply path:** `task dev:apply` runs `kubectl kustomize k3d/dev-stack/ | sed 's|workspace-dev|<NS_DEV>|g' | envsubst '$DEV_DOMAIN $DEV_WEBSITE_HOST $DEV_BRETT_HOST $PROD_DOMAIN $CONTACT_EMAIL' | kubectl apply -f -`. Anything you add to `k3d/dev-stack/kustomization.yaml` is applied this way. If a manifest uses a NEW `${VAR}`, add it to that `envsubst` allow-list (`Taskfile.dev-stack.yml` `apply:` task, ~line 216) or the placeholder stays literal.
- **Secrets in k3d:** `task dev:_materialise-secrets` (`Taskfile.dev-stack.yml:114`) creates `shared-db-dev-secrets`, `sish-authorized-keys`, `mcp-tokens` (key `CLUSTER_TOKEN` from `DEV_MCP_TOKEN`), `ghcr-pull-secret`. It does **not** yet create the OIDC/cookie/ipv64 secrets the new design needs — Task 5 adds them. Source values live in `environments/.secrets/mentolder.yaml` (gitignored).
- **Request flow (target):** client → `:443` (FritzBox→k3s-1) → k3d Traefik `websecure` (TLS via wildcard) → `dev-ingress` routes `*.dev` → `oauth2-proxy-dev:4181` → (authed, or skip-auth on MCP paths) → upstream `http://traefik.kube-system.svc.cluster.local:80` with Host preserved → k3d Traefik `web` → host-routed IngressRoute (`mcp-dev` → monolith, or `website-dev`/`brett-dev`).
- **Reference (do not blindly copy):** `prod-mentolder/oauth2-proxy-dev.yaml` (old hostNetwork form), `prod-mentolder/dev-ingress.yaml` (TLS ingress), `prod-mentolder/cert-dev-wildcard.yaml` (Certificate), `prod/cluster-issuer.yaml` (ClusterIssuer `letsencrypt-prod`, ipv64 DNS-01), `k3d/dev-stack/mcp-ingress-dev.yaml`, `k3d/dev-stack/traefik-wildcard-ingress.yaml`, `k3d/dev-stack/kustomization.yaml`.

**Reproduction test already written (currently RED):** `tests/dev-stack/dev-mcp-public.bats` — gated `RUN_DEV_TESTS=true DEV_MCP_TOKEN=<dev token>`; asserts a valid (non-default) TLS cert for `mcp.dev.mentolder.de` and JSON-RPC `result` from `/kubernetes/mcp` and `/postgres/mcp`. This plan ends with it GREEN.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `Taskfile.dev-stack.yml` | k3d `cluster:create` port maps; `apply` envsubst list; `_materialise-secrets` | Modify |
| `k3d/dev-stack/cert-manager.yaml` | cert-manager install ref + ClusterIssuer `letsencrypt-prod` (ipv64) + `workspace-dev-wildcard-tls` Certificate, scoped to the k3d cluster | Create |
| `k3d/dev-stack/traefik-tls.yaml` | Traefik `TLSStore` `default` → `workspace-dev-wildcard-tls` so `websecure` serves the wildcard | Create |
| `k3d/dev-stack/oauth2-proxy-dev.yaml` | In-cluster oauth2-proxy-dev Deployment+Service (no hostNetwork), upstream → cluster Traefik | Create |
| `k3d/dev-stack/dev-ingress.yaml` | TLS Ingress `*.dev`/`dev` → oauth2-proxy-dev:4181 on `websecure` | Create |
| `k3d/dev-stack/mcp-ingress-dev.yaml` | MCP IngressRoute (existing; confirm entryPoint) | Verify/Modify |
| `k3d/dev-stack/kustomization.yaml` | Add the 4 new resources | Modify |
| `prod-mentolder/oauth2-proxy-dev.yaml`, `dev-ingress.yaml`, `oauth2-proxy-dev-middleware.yaml`, `cert-dev-wildcard.yaml` | Old standalone/fleet dev edge | Delete + de-reference |
| `prod-mentolder/kustomization.yaml` | Drop refs to the deleted dev-edge files | Modify |
| `prod-fleet/mentolder/kustomization.yaml` | Drop obsolete `$patch:delete` blocks for oauth2-proxy-dev | Modify |
| `docs/superpowers/specs/2026-05-31-dev-mcp-public-route-design.md` | New design of record | Create |
| `docs/superpowers/specs/2026-05-30-multinode-dev-cluster-ha-design.md` | Mark SHELVED | Modify |
| `website/src/data/test-inventory.json` | Regenerated for the new bats file | Modify |

---

## Task 1: Write the design-of-record spec (supersede + shelve)

**Files:**
- Create: `docs/superpowers/specs/2026-05-31-dev-mcp-public-route-design.md`
- Modify: `docs/superpowers/specs/2026-05-30-multinode-dev-cluster-ha-design.md`

- [x] **Step 1: Write the new spec** capturing: the break (standalone decommission removed the dev edge), the decided self-contained-k3d architecture, the request flow (above), and that the prod `mcp.mentolder.de` route and the #1213 VIP are explicitly out of scope / shelved. Include the request-flow diagram and the TLS/SSO/MCP-skip-auth design.

- [x] **Step 2: Mark the HA draft shelved** — prepend a `> **STATUS: SHELVED (2026-05-31, T000363).** Superseded by the self-contained-k3d dev edge; the 10.0.0.20 kube-vip / devc-1/2/3 VMs were never built.` banner to `2026-05-30-multinode-dev-cluster-ha-design.md`.

- [ ] **Step 3: Commit**
```bash
git add docs/superpowers/specs/2026-05-31-dev-mcp-public-route-design.md docs/superpowers/specs/2026-05-30-multinode-dev-cluster-ha-design.md
git commit -m "docs(spec): self-contained k3d dev edge; shelve multinode-HA draft [T000363]"
```

---

## Task 2: Publish host :443 from the k3d cluster

**Files:**
- Modify: `Taskfile.dev-stack.yml:38-44` and `:59-65` (both `K3D_CREATE` paths in `cluster:create`)

- [ ] **Step 1:** In BOTH `k3d cluster create` invocations, add a port line after the `0.0.0.0:2222` line:
```yaml
            --port '0.0.0.0:443:443@loadbalancer' \
```
Keep the existing `127.0.0.1:18080:80`, `0.0.0.0:2222:2222`, `127.0.0.1:15432:30000` lines unchanged.

- [ ] **Step 2: Validate the Taskfile parses**
Run: `task --list 2>&1 | grep -q 'dev:cluster:create' && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**
```bash
git add Taskfile.dev-stack.yml
git commit -m "feat(dev): publish host 0.0.0.0:443 from the k3d loadbalancer [T000363]"
```

> The cluster recreate that activates this mapping happens in Task 9 (deploy), not here — it SSHes to k3s-1 and destroys/recreates the dev cluster (dev data reconstructs via `task dev:db:refresh`).

---

## Task 3: cert-manager + wildcard Certificate inside k3d

**Files:**
- Create: `k3d/dev-stack/cert-manager.yaml`
- Modify: `Taskfile.dev-stack.yml` `apply:` (add a cert-manager install/wait step before the kustomize apply, since CRDs must exist first)

- [ ] **Step 1: Write `k3d/dev-stack/cert-manager.yaml`** containing the `ClusterIssuer` `letsencrypt-prod` (copy `prod/cluster-issuer.yaml` verbatim — ipv64 DNS-01 webhook, `privateKeySecretRef: letsencrypt-prod-key`, `ipv64-api-key` secretKeyRef) and the `Certificate` (copy `prod-mentolder/cert-dev-wildcard.yaml`, `namespace: ${WORKSPACE_NAMESPACE}` → render to `workspace-dev`, `dnsNames: [${DEV_DOMAIN}, *.${DEV_DOMAIN}]`, `secretName: workspace-dev-wildcard-tls`). Do NOT add this file to the kustomization (cert-manager CRDs must be installed before applying CRs).

- [ ] **Step 2: Add a cert-manager bootstrap step to `apply:`** (before the `kubectl kustomize` step), idempotent:
```yaml
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        # cert-manager core + CRDs
        kubectl --context {{.CTX_DEV}} apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
        kubectl --context {{.CTX_DEV}} -n cert-manager rollout status deploy/cert-manager-webhook --timeout=180s
        # lego ipv64 webhook (same chart prod uses via task cert:install)
        helm repo add lego-webhook https://yxwuxuanl.github.io/cert-manager-lego-webhook 2>/dev/null || true
        helm --kube-context {{.CTX_DEV}} upgrade --install cert-manager-lego-webhook lego-webhook/cert-manager-lego-webhook -n cert-manager --wait
        # issuer + wildcard cert
        envsubst '$WORKSPACE_NAMESPACE $DEV_DOMAIN' < k3d/dev-stack/cert-manager.yaml \
          | sed "s|workspace-dev|{{.NS_DEV}}|g" | kubectl --context {{.CTX_DEV}} apply -f -
```
(Confirm the exact cert-manager version + lego chart against `task cert:install` in `Taskfile.yml:3156`; mirror whatever prod pins.)

- [ ] **Step 3: Commit**
```bash
git add k3d/dev-stack/cert-manager.yaml Taskfile.dev-stack.yml
git commit -m "feat(dev): cert-manager + ipv64 wildcard cert in the k3d cluster [T000363]"
```

---

## Task 4: Traefik default TLSStore for the wildcard

**Files:**
- Create: `k3d/dev-stack/traefik-tls.yaml`
- Modify: `k3d/dev-stack/kustomization.yaml`

- [ ] **Step 1: Write `k3d/dev-stack/traefik-tls.yaml`** — a Traefik `TLSStore` named `default` in `kube-system` referencing the wildcard secret, so `websecure` serves it for every host:
```yaml
apiVersion: traefik.io/v1alpha1
kind: TLSStore
metadata:
  name: default
  namespace: kube-system
spec:
  defaultCertificate:
    secretName: workspace-dev-wildcard-tls
```
> The wildcard secret lives in `workspace-dev`; Traefik's default TLSStore must be in `kube-system` and reference a secret in its own namespace. Add a step to copy/sync the cert secret into `kube-system` (a tiny `reflector`-style `kubectl get secret -o yaml | sed namespace | apply`, or a cert-manager `Certificate` duplicated into `kube-system`). **Decision for implementer:** issue the Certificate directly into `kube-system` instead — change Task 3's Certificate `namespace` to `kube-system` and keep a second copy in `workspace-dev` only if an Ingress there needs it. Pick one and make the secret co-located with the TLSStore.

- [ ] **Step 2: Add to kustomization** — append `- traefik-tls.yaml` to `k3d/dev-stack/kustomization.yaml` `resources:`.

- [ ] **Step 3: Validate kustomize builds**
Run: `kubectl kustomize k3d/dev-stack/ >/dev/null && echo OK`
Expected: `OK`

- [ ] **Step 4: Commit**
```bash
git add k3d/dev-stack/traefik-tls.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): default Traefik TLSStore serves the dev wildcard [T000363]"
```

---

## Task 5: Materialise OIDC + cookie + ipv64 secrets in k3d

**Files:**
- Modify: `Taskfile.dev-stack.yml` `_materialise-secrets` (`:114-161`)

- [ ] **Step 1: Add three secrets** to `_materialise-secrets` after the `mcp-tokens` block, reading from `environments/.secrets/mentolder.yaml` (keys already used by the prod manifest: `DEV_WORKSPACE_OIDC_SECRET`, `DEV_OAUTH2_PROXY_COOKIE_SECRET`, `IPV64_API_KEY`):
```bash
        OIDC=$(yq -r '.DEV_WORKSPACE_OIDC_SECRET // ""' "$SECRETS_FILE")
        COOKIE=$(yq -r '.DEV_OAUTH2_PROXY_COOKIE_SECRET // ""' "$SECRETS_FILE")
        IPV64=$(yq -r '.IPV64_API_KEY // ""' "$SECRETS_FILE")
        if [[ -n "$OIDC" && -n "$COOKIE" ]]; then
          kubectl --context {{.CTX_DEV}} -n {{.NS_DEV}} create secret generic workspace-secrets \
            --from-literal=DEV_WORKSPACE_OIDC_SECRET="$OIDC" \
            --from-literal=DEV_OAUTH2_PROXY_COOKIE_SECRET="$COOKIE" \
            --dry-run=client -o yaml | kubectl --context {{.CTX_DEV}} apply -f -
        else
          echo "DEV_WORKSPACE_OIDC_SECRET / DEV_OAUTH2_PROXY_COOKIE_SECRET missing — oauth2-proxy-dev will crashloop." >&2
        fi
        if [[ -n "$IPV64" ]]; then
          kubectl --context {{.CTX_DEV}} -n cert-manager create secret generic ipv64-api-key \
            --from-literal=IPV64_API_KEY="$IPV64" \
            --dry-run=client -o yaml | kubectl --context {{.CTX_DEV}} apply -f -
        else
          echo "IPV64_API_KEY missing — cert-manager DNS-01 cannot issue the wildcard." >&2
        fi
```
(If the Certificate is issued into `kube-system` per Task 4, also create `ipv64-api-key` wherever the ClusterIssuer solver reads it — ClusterIssuer secrets resolve in the cert-manager namespace, so `-n cert-manager` is correct.)

- [ ] **Step 2: Confirm keys exist** in the secrets file (read-only check; do not print values):
Run: `yq -r 'keys' environments/.secrets/mentolder.yaml | grep -E 'DEV_WORKSPACE_OIDC_SECRET|DEV_OAUTH2_PROXY_COOKIE_SECRET|IPV64_API_KEY'`
Expected: all three present. If any missing, run `task env:generate ENV=mentolder` or add them, and STOP to flag it.

- [ ] **Step 3: Commit**
```bash
git add Taskfile.dev-stack.yml
git commit -m "feat(dev): materialise OIDC/cookie/ipv64 secrets into k3d [T000363]"
```

---

## Task 6: In-cluster oauth2-proxy-dev (no hostNetwork)

**Files:**
- Create: `k3d/dev-stack/oauth2-proxy-dev.yaml`
- Modify: `k3d/dev-stack/kustomization.yaml`

- [ ] **Step 1: Write `k3d/dev-stack/oauth2-proxy-dev.yaml`** — adapt `prod-mentolder/oauth2-proxy-dev.yaml` with these CHANGES:
  - Drop `hostNetwork: true`, `dnsPolicy: ClusterFirstWithHostNet`, `nodeSelector`, and the `hostPort: 4181` (keep `containerPort: 4181`).
  - `namespace: workspace-dev` (literal; the apply `sed` maps it).
  - Change `--upstream=http://10.0.0.20:80` → `--upstream=http://traefik.kube-system.svc.cluster.local:80` (loops back to the cluster Traefik `web` entrypoint for host routing; replaces the old `127.0.0.1:18080`).
  - Keep: keycloak-oidc provider, `--client-id=workspace-dev`, `--client-secret=${DEV_WORKSPACE_OIDC_SECRET}`, `--oidc-issuer-url=https://auth.${PROD_DOMAIN}/realms/workspace`, `--redirect-url=https://${DEV_DOMAIN}/oauth2/callback`, `--whitelist-domain=.${DEV_DOMAIN}`, `--cookie-domain=.${DEV_DOMAIN}`, `--keycloak-group=/dev-access`, and `--skip-auth-route=^/(kubernetes|postgres|github|browser)(/|$)`.
  - Keep the `write-cookie-secret` initContainer and both env `secretKeyRef`s pointing at secret `workspace-secrets` (created in Task 5).
  - Keep the `Service oauth2-proxy-dev` (port 4181 → targetPort 4181).

- [ ] **Step 2: Add to kustomization** — append `- oauth2-proxy-dev.yaml`.

- [ ] **Step 3: Add envsubst vars** — `dev:apply` envsubst list (`Taskfile.dev-stack.yml:216`) must include the new vars this manifest references: add `$WORKSPACE_NAMESPACE` is NOT needed (sed handles ns), but ADD `$DEV_WORKSPACE_OIDC_SECRET`. Final list:
```
| envsubst '$DEV_DOMAIN $DEV_WEBSITE_HOST $DEV_BRETT_HOST $PROD_DOMAIN $CONTACT_EMAIL $DEV_WORKSPACE_OIDC_SECRET' \
```

- [ ] **Step 4: Validate kustomize builds**
Run: `kubectl kustomize k3d/dev-stack/ >/dev/null && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**
```bash
git add k3d/dev-stack/oauth2-proxy-dev.yaml k3d/dev-stack/kustomization.yaml Taskfile.dev-stack.yml
git commit -m "feat(dev): in-cluster oauth2-proxy-dev edge (drop hostNetwork) [T000363]"
```

---

## Task 7: Dev TLS Ingress → oauth2-proxy-dev on websecure

**Files:**
- Create: `k3d/dev-stack/dev-ingress.yaml`
- Modify: `k3d/dev-stack/kustomization.yaml`, `k3d/dev-stack/mcp-ingress-dev.yaml` (verify entryPoint)

- [ ] **Step 1: Write `k3d/dev-stack/dev-ingress.yaml`** — adapt `prod-mentolder/dev-ingress.yaml`: keep `tls.secretName: workspace-dev-wildcard-tls`, hosts `${DEV_DOMAIN}` + `*.${DEV_DOMAIN}`, backend `oauth2-proxy-dev:4181`. DROP the prod-only middleware annotation (`redirect-https`/`hsts`/`security-headers@kubernetescrd`) unless those middlewares are also defined in the dev stack — verify with `grep -r "redirect-https\|hsts-headers\|security-headers" k3d/dev-stack/`; if absent, omit the annotation. `namespace: workspace-dev` literal.

- [ ] **Step 2: Verify the MCP IngressRoute entryPoint** — `k3d/dev-stack/mcp-ingress-dev.yaml` uses `entryPoints: [web]`. Because oauth2-proxy loops back to Traefik `web` (HTTP, port 80) with Host preserved, `web` is CORRECT — leave it. Confirm the `mcp-dev` route priority (100) still beats the sish-catchall (1). No change expected; document the confirmation in the commit body.

- [ ] **Step 3: Add to kustomization** — append `- dev-ingress.yaml`.

- [ ] **Step 4: Validate kustomize builds + render check**
Run: `kubectl kustomize k3d/dev-stack/ | grep -A2 'kind: Ingress' | grep -q 'workspace-ingress-dev' && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**
```bash
git add k3d/dev-stack/dev-ingress.yaml k3d/dev-stack/kustomization.yaml
git commit -m "feat(dev): TLS ingress *.dev → oauth2-proxy-dev on websecure [T000363]"
```

---

## Task 8: Remove the old standalone/fleet dev-edge artifacts (untangle + revert #1213)

**Files:**
- Delete: `prod-mentolder/oauth2-proxy-dev.yaml`, `prod-mentolder/dev-ingress.yaml`, `prod-mentolder/cert-dev-wildcard.yaml`, `prod-mentolder/oauth2-proxy-dev-middleware.yaml` (verify each exists/used)
- Modify: `prod-mentolder/kustomization.yaml`, `prod-fleet/mentolder/kustomization.yaml`

- [ ] **Step 1: Find every reference** before deleting:
Run: `grep -rn "oauth2-proxy-dev\|dev-ingress\|cert-dev-wildcard\|workspace-ingress-dev" prod-mentolder/ prod-fleet/ prod/`
Expected: references only in the files listed above + the fleet `$patch:delete` blocks. If anything else references them, STOP and reassess.

- [ ] **Step 2: Delete the moved files and drop them from `prod-mentolder/kustomization.yaml` `resources:`.** Keep `cert-dev-wildcard.yaml` deletion only after confirming the dev cert now issues from the k3d cluster (Task 3) — prod no longer needs to mint the dev wildcard.

- [ ] **Step 3: Remove the obsolete `$patch:delete` blocks** for `oauth2-proxy-dev` (Service, Deployment, Middleware) in `prod-fleet/mentolder/kustomization.yaml` (~lines 52-70) — they delete resources that no longer exist in the base overlay.

- [ ] **Step 4: Confirm the #1213 VIP is fully gone**
Run: `grep -rn "10.0.0.20" prod-mentolder/ prod-fleet/ k3d/ Taskfile*.yml`
Expected: no matches (the only one was the oauth2-proxy upstream, now in the deleted file).

- [ ] **Step 5: Validate both overlays build**
Run: `kubectl kustomize prod-mentolder/ >/dev/null && kubectl kustomize prod-fleet/mentolder/ >/dev/null && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**
```bash
git add -A prod-mentolder/ prod-fleet/mentolder/
git commit -m "refactor(prod): drop dev edge from prod overlays; revert #1213 VIP [T000363]"
```

---

## Task 9: Deploy + recreate the dev cluster on k3s-1

> Live operational task on k3s-1 (`ssh -i ~/.ssh/gekko_id_ed25519 gekko@10.0.3.1`). Run `task dev:*` from a checkout of this branch with `ENV=mentolder`. The cluster recreate is destructive but dev data reconstructs from prod.

- [ ] **Step 1: Recreate the cluster** with the new :443 mapping:
```bash
task dev:cluster:delete ENV=mentolder
task dev:cluster:create ENV=mentolder
```
Verify the serverlb now publishes 443:
Run (on k3s-1): `docker ps --format '{{.Ports}}' | grep -o '0.0.0.0:443->'`
Expected: `0.0.0.0:443->`

- [ ] **Step 2: Deploy** (materialises secrets, installs cert-manager, applies the stack, builds+imports images):
```bash
task dev:deploy ENV=mentolder
```

- [ ] **Step 3: Wait for the wildcard cert to be Ready** (DNS-01 can take a few minutes):
Run: `kubectl --context k3d-mentolder-dev get certificate -A -w`
Expected: `workspace-dev-wildcard-tls` `READY=True`. If stuck, inspect `kubectl describe certificate` / `challenges` and the ipv64 webhook logs.

- [ ] **Step 4: Confirm the edge pods are up**
Run: `kubectl --context k3d-mentolder-dev -n workspace-dev get pod -l app=oauth2-proxy-dev`
Expected: `1/1 Running`. And the monolith MCP containers `kubernetes`/`postgres` ready.

---

## Task 10: Verify end-to-end (turn the repro test GREEN)

**Files:**
- Test: `tests/dev-stack/dev-mcp-public.bats` (already written)

- [ ] **Step 1: External TLS + MCP probe from this workstation** (not on k3s-1):
```bash
DEV_MCP_TOKEN=$(ssh -i ~/.ssh/gekko_id_ed25519 gekko@10.0.3.1 \
  "kubectl --context k3d-mentolder-dev -n workspace-dev get secret mcp-tokens -o jsonpath='{.data.CLUSTER_TOKEN}' | base64 -d")
curl -sS -m 15 -o /dev/null -w 'k8s → %{http_code}\n' -X POST \
  "https://mcp.dev.mentolder.de/kubernetes/mcp?token=$DEV_MCP_TOKEN" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"d","version":"1"}}}'
```
Expected: `HTTP 200`, and a JSON body containing `"result"`. Repeat for `/postgres/mcp`.

- [ ] **Step 2: Run the bats repro test (expect GREEN now)**
```bash
RUN_DEV_TESTS=true DEV_MCP_TOKEN=$DEV_MCP_TOKEN tests/unit/lib/bats-core/bin/bats tests/dev-stack/dev-mcp-public.bats
```
Expected: `3 tests, 0 failures`. (Was 3 failures before the fix.)

- [ ] **Step 3: Confirm cert is the real LE wildcard, not the Traefik default**
Run: `echo | openssl s_client -servername mcp.dev.mentolder.de -connect mcp.dev.mentolder.de:443 2>/dev/null | openssl x509 -noout -issuer`
Expected: issuer contains `Let's Encrypt`, NOT `TRAEFIK DEFAULT CERT`.

---

## Task 11: Repoint the Claude Code MCP client + regen test inventory

**Files:**
- Modify: `~/.claude.json` (local client config — NOT committed)
- Modify: `website/src/data/test-inventory.json`

- [ ] **Step 1: Repoint the user's MCP servers** — in `~/.claude.json`, change the `Kubernetes` and `postgres mentolder` server URLs from `https://mcp.mentolder.de/{kubernetes,postgres}/mcp?token=...` to `https://mcp.dev.mentolder.de/{kubernetes,postgres}/mcp?token=<DEV_MCP_TOKEN>`. Use the dev `CLUSTER_TOKEN` from Step 10.1. Then verify with `claude mcp list` → both `✓ Connected`.

- [ ] **Step 2: Regenerate the test inventory** (CI fails otherwise):
```bash
task test:inventory
git add website/src/data/test-inventory.json tests/dev-stack/dev-mcp-public.bats
git commit -m "test(dev): public dev MCP route smoke test + inventory [T000363]"
```

- [ ] **Step 3: Run offline CI locally**
Run: `task test:all`
Expected: PASS. (The dev-stack bats is gated by `RUN_DEV_TESTS`, so it stays skipped in offline CI — correct.)

---

## Task 12: PR + ticket closure

- [ ] **Step 1:** Push the branch and open a PR referencing T000363, summarising the self-contained-k3d edge and the prod/fleet cleanup.
- [ ] **Step 2:** After CI green + squash-merge, the deploy (Task 9) is already live; set T000363 to `done`.
- [ ] **Step 3:** Run `bash scripts/hooks/mishap-tracker.sh` if any operational surprises occurred during execution.

---

## Self-Review notes
- **Spec coverage:** :443 publish (T2), cert-manager/wildcard (T3), TLSStore (T4), secrets (T5), in-cluster oauth2-proxy w/ upstream fix + skip-auth (T6), TLS ingress (T7), prod/fleet cleanup + #1213 revert (T8), deploy/recreate (T9), green test (T10), client repoint + inventory (T11). All mapped.
- **Open decision flagged for implementer (T4 Step 1):** which namespace holds the wildcard secret for the default TLSStore (issue Certificate directly into `kube-system`). Resolve before T9.
- **Secrets dependency:** T5 must precede T9; `environments/.secrets/mentolder.yaml` must already contain `DEV_WORKSPACE_OIDC_SECRET`, `DEV_OAUTH2_PROXY_COOKIE_SECRET`, `IPV64_API_KEY` (T5 Step 2 guards this).
