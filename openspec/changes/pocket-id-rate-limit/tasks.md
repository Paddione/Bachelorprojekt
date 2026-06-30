---
title: "pocket-id-rate-limit — Implementation Plan"
ticket_id: T001328
domains: [auth, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-rate-limit — Implementation Plan

_Ticket: T001328_

## File Structure

| Datei | Änderung |
|-------|----------|
| `k3d/pocket-id.yaml` | `forwardedHeaders.insecure: true` am IngressRoute + `TRUSTED_PROXIES`-Env im Deployment |
| `prod/ingress.yaml` | `forwardedHeaders`-Annotation am auth-Ingress für pocket-id |
| `tests/spec/pocket-id-rate-limit.bats` | NEU — BATS-Test für forwardedHeaders-Präsenz |

## Task 1: Fix Dev IngressRoute + Deployment (k3d/pocket-id.yaml)

Add `forwardedHeaders.insecure: true` to the dev IngressRoute so Traefik injects
`X-Forwarded-For` with the real client IP. As defense-in-depth, add
`TRUSTED_PROXIES=10.42.0.0/16,10.43.0.0/16` to the Pocket ID Deployment's
env block (trusts k3s pod + service CIDR ranges).

**Dateien:**
- `k3d/pocket-id.yaml` — zwei Änderungen: forwardedHeaders im IngressRoute + TRUSTED_PROXIES-Env

**BATS-Test (RED):**

```bash
# tests/spec/pocket-id-rate-limit.bats
setup_file() { load '../helpers/bats-utils'; }

@test "k3d/pocket-id.yaml IngressRoute spec has forwardedHeaders" {
    run yq eval '.spec.forwardedHeaders.insecure' k3d/pocket-id.yaml
    [ "$output" = "true" ]
    # expected: FAIL (forwardedHeaders fehlt noch)
}
```

## Task 2: Fix Prod Ingress (prod/ingress.yaml)

Add the `traefik.ingress.kubernetes.io/router.forwardedHeaders` annotation to
the `workspace-ingress-auth` Ingress in `prod/ingress.yaml` so pod-side requests
also receive the real client IP.

**Dateien:**
- `prod/ingress.yaml` — Annotation am auth-Ingress block

**Check:**

```bash
yq eval '.metadata.annotations["traefik.ingress.kubernetes.io/router.forwardedHeaders"]' prod/ingress.yaml
# expected: insecure (or equivalent)
```

## Task 3: Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** The BATS test `pocket-id-rate-limit.bats`
      must FAIL on the current code (forwardedHeaders/TRUSTED_PROXIES fehlen).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-rate-limit.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Apply Task 1 + Task 2 changes. Rerun the test:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-rate-limit.bats
# expected: PASS (green — forwardedHeaders + TRUSTED_PROXIES sind gesetzt)
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
