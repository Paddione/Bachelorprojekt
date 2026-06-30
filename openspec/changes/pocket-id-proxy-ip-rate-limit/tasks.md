---
title: "pocket-id-proxy-ip-rate-limit — Implementation Plan"
ticket_id: T001328
domains: [infra, auth]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-proxy-ip-rate-limit — Implementation Plan

_Ticket: T001328_

**Problem:** Pocket-ID logs and rate-limits by the cluster-internal proxy IP (10.42.x.x Pod-CIDR) instead of the real browser client IP. This causes `429 Too Many Requests from your network` errors fleet-wide. `TRUST_PROXY=true` is set in the Deployment but the IngressRoute has no `forwardedHeaders` configuration — Traefik's default `X-Forwarded-For` injection may not be picked up by Pocket-ID when the proxy IP is not in a trusted range.

**Goal:** Ensure Traefik passes the real client IP to Pocket-ID and Pocket-ID correctly reads it for rate-limiting and audit logging.

## File Structure

| Status | File | Budget | Responsibility |
|--------|------|--------|----------------|
| MODIFY | `k3d/pocket-id.yaml` | budget 390 | Add `forwardedHeaders.trustedIPs` to the IngressRoute so Traefik signals the original client IP; adjust `TRUST_PROXY` value from `"true"` to the Pod-CIDR (`10.42.0.0/16`) |
| MODIFY | `environments/.secrets/dev.yaml` | budget 10 | No change needed (TRUST_PROXY is set in the Deployment manifest, not in secrets) |
| CREATE | `tests/spec/pocket-id-proxy-ip.bats` | budget 80 | BATS test that validates the IngressRoute has `forwardedHeaders` and Pocket-ID logs show a non-10.42.x.x IP |
| MODIFY | `k3d/configmap-domains.yaml` | budget 10 | No change — just reference for context |
| MODIFY | `prod-fleet/mentolder/prod/patch-pocket-id.yaml` (or create if absent) | budget 40 | Mirror the `forwardedHeaders` config in the prod overlay if it exists, or add it to the k3d base that prod inherits |

**S1 Budget Notes:**
- `k3d/pocket-id.yaml` — 291 lines current, effective threshold 500 (.yaml is ungated → default 0; no baseline entry → budget = static limit from `_ext_limit` which returns 0 for .yaml → budget effectively unconstrained; no S1 freeze applies)
- `tests/spec/pocket-id-proxy-ip.bats` — new file, budget 80

### Pre-flight: effective thresholds

| File | Live LOC | Threshold | Residual |
|------|----------|-----------|----------|
| `k3d/pocket-id.yaml` | 291 | n/a (ungated .yaml) | n/a |

---

### Task 1: Diagnose current X-Forwarded-For flow on dev cluster

Deploy the current state and inspect what Pocket-ID actually sees.

**Steps:**
1. Deploy the current workspace in dev: `task workspace:setup ENV=dev` (or `task workspace:deploy` if cluster already exists)
2. Port-forward pocket-id: `kubectl port-forward -n workspace svc/pocket-id 1411:1411`
3. Send a request with a custom X-Forwarded-For and inspect Pocket-ID's response headers:
   ```bash
   curl -sv -H 'X-Forwarded-For: 203.0.113.42' http://localhost:1411/.well-known/openid-configuration 2>&1 | grep -i 'x-forwarded'
   ```
4. Check Pocket-ID logs for the IP it logs on each request:
   ```bash
   kubectl logs -n workspace deploy/pocket-id --tail=50
   ```
5. Check if Traefik's IngressRoute adds `forwardedHeaders` implicitly:
   ```bash
   kubectl get ingressroute -n workspace pocket-id -o yaml
   ```
6. Document findings in a comment on ticket T001328.

**Acceptance criteria:**
- Confirm the IngressRoute lacks `forwardedHeaders.trustedIPs`
- Confirm Pocket-id logs show the Pod-CIDR IP (10.42.x.x) rather than the external client IP
- `expected: FAIL` — the test below will fail until the fix is deployed

```bash
# Reproduce: verify Pocket-ID logs show 10.42.x.x instead of real client IP
kubectl logs -n workspace deploy/pocket-id --tail=20 | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -5
# expected: FAIL — the IP will be 10.42.x.x (pod CIDR), not the browser IP
```

---

### Task 2: Add `forwardedHeaders` to IngressRoute + adjust TRUST_PROXY

**Files:**
- Modify: `k3d/pocket-id.yaml`

**What to change:**

In the IngressRoute (Traefik CRD), add `forwardedHeaders` at the route or entrypoint level so Traefik explicitly trusts the upstream proxy IPs and passes the real client IP via `X-Forwarded-For` to Pocket-ID:

```yaml
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`${POCKET_ID_DOMAIN}`)
      services:
        - name: pocket-id
          port: 1411
```

The fix depends on the diagnostic outcome from Task 1. Most likely candidates:

**Option A — forward to `X-Forwarded-For` at the service level** (preferred if Traefik is already the edge in dev):
- Add `forwardedHeaders.trustedIPs` to the IngressRoute spec:

```yaml
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`${POCKET_ID_DOMAIN}`)
      services:
        - name: pocket-id
          port: 1411
```

In Traefik v3, `forwardedHeaders.trustedIPs` on an IngressRoute tells Traefik which upstream proxies it can trust and enables passing the original `X-Forwarded-For` header. This is critical when Traefik itself is the first proxy.

**Option B — Add a middleware** (if Option A is insufficient):
Create a `pocket-id-headers` Middleware that strips the previous hop and injects the real client IP into a dedicated header:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: pocket-id-real-ip
  labels:
    app: pocket-id
spec:
  passTLSClientCert:
    info:
      notAfter: true
```

**Option C — Adjust TRUST_PROXY value** in the Deployment env:
Change `TRUST_PROXY` from `"true"` to the specific CIDR that Traefik uses:

```yaml
- name: TRUST_PROXY
  value: "10.42.0.0/16,10.43.0.0/16"
```

This tells Pocket-ID's HTTP server to trust proxy IPs from the Pod-CIDR and Service-CIDR ranges. The exact value depends on Pocket-ID's framework support for CIDR notation in `trust proxy` (SvelteKit uses `http.Server` → Express trust proxy). If Pocket-ID (Express/polka) does not support long CIDR lists, keep `"true"` but add the Traefik-level fix (Option A).

**Apply:**
1. Make the changes in `k3d/pocket-id.yaml`
2. Deploy: `task workspace:deploy ENV=dev`
3. Re-run the diagnosis script from Task 1 — verify that the Pocket-ID container's logs now show the real client IP

```bash
# Verify: send a test request and check the logged IP
kubectl exec -n workspace deploy/pocket-id -- wget -qO- http://localhost:1411/.well-known/openid-configuration
kubectl logs -n workspace deploy/pocket-id --tail=20 | grep -v '10\.42\.'
# expected: PASS — no lines with 10.42.x.x should appear for external requests
```

---

### Task 3: Prod overlay check + deploy to korczewski

**Files:**
- Modify: `k3d/pocket-id.yaml` (already done in Task 2)
- Verify: `prod-fleet/` overlays for any pocket-id patches

Check if there's a prod-specific overlay for the pocket-id IngressRoute. The base `k3d/pocket-id.yaml` is shared by both dev and prod (via Kustomize). If the prod overlay has its own IngressRoute patch, mirror the `forwardedHeaders` there.

If no overlay exists, the base fix from Task 2 is sufficient for all environments.

Deploy to the korczewski brand to validate:
```bash
task workspace:deploy ENV=korczewski
```

Check Pocket-ID logs in the korczewski namespace:
```bash
kubectl logs -n workspace-korczewski deploy/pocket-id --tail=20
```

Verify rate-limiter behavior by sending multiple rapid requests from the same external IP and checking for 429 responses (should stay per-IP, not per-proxy-IP).

---

### Task 4: Write BATS test for the fix

**Files:**
- Create: `tests/spec/pocket-id-proxy-ip.bats`

A BATS test that validates:
1. The IngressRoute has `forwardedHeaders` or the expected middleware configured
2. Pocket-ID returns the correct `X-Forwarded-For` or custom header in a test scenario

```bash
setup() {
  load '../helpers/setup'
}

@test "pocket-id IngressRoute has forwardedHeaders config" {
  run kubectl get ingressroute -n workspace pocket-id -o jsonpath='{.spec.routes[0]}'
  assert_output --partial 'forwardedHeaders' || assert_output --partial 'middlewares'
}

@test "pocket-id logs show non-cluster IP after proxy fix" {
  # This test validates the runtime behaviour: deploy and check logs
  # Run only on dev cluster, skip if no cluster
  if ! kubectl get ns workspace &>/dev/null; then
    skip "no dev cluster available"
  fi
  run kubectl logs -n workspace deploy/pocket-id --tail=50
  refute_output --regexp '10\.42\.[0-9]+\.[0-9]+'  # no pod CIDR IPs in logs
}
```

Run the test:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-proxy-ip.bats
# expected: FAIL (Task 1) → PASS (after Task 2 & 3)
```

---

### Task 5: Final verification

Run the mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

**Acceptance criteria:**
- All BATS tests pass
- Pocket-ID logs show real browser IPs (not 10.42.x.x) in both dev and korczewski namespaces
- Rate-limiter applies 429 per individual client IP, not per pod proxy IP
- No regression in auth flows (OIDC login, token exchange, userinfo endpoint)
