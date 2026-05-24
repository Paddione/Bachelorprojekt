---
name: fleet-ops
description: Use when deploying, verifying, or operating across both prod clusters simultaneously — mentolder and korczewski. Covers task feature:* fan-out, cross-cluster schema changes, cluster status checks, Flux GitOps reconciliation, and the constraint that each cluster has its own independent shared-db and sealed-secrets controller.
---

# fleet-ops — Two-Cluster Fleet Operations

## Overview

Production runs as **two independent k3s clusters**. They share no storage, no database, no sealed-secrets controller — any operation that changes shared state (DB schema, role passwords, sealed secrets, OIDC config) must be applied to **both explicitly**.

| Cluster | Context | Namespace | Domain |
|---|---|---|---|
| mentolder | `mentolder` | `workspace` | `web.mentolder.de` |
| korczewski | `korczewski` | `workspace-korczewski` | `web.korczewski.de` |

---

## Fan-Out Deploy Commands

These are the primary interfaces for cross-cluster work:

```bash
task feature:deploy        # workspace:deploy + post-setup on BOTH clusters
task feature:website       # Rebuild + roll Astro website on BOTH clusters
task feature:brett         # Rebuild + roll brett on BOTH clusters
task feature:livekit       # Re-pin LiveKit DNS on BOTH clusters
task health                # Cross-cluster status + connectivity check
task workspace:verify:all-prods  # Smoke probes on BOTH clusters
task clusters:status       # One-line status across both
```

Use `task workspace:deploy ENV=mentolder` + `ENV=korczewski` sequentially when you need finer control than the fan-out tasks.

---

## Cross-Cluster Schema / DB Changes

Each cluster has its own `shared-db`. Schema changes must be applied to both:

```bash
# Apply to mentolder
task workspace:psql ENV=mentolder -- website
# Run SQL

# Apply to korczewski
task workspace:psql ENV=korczewski -- website
# Run SQL
```

**DB password rotation** on one cluster never propagates to the other. After re-sealing secrets for one cluster, also run for the other:

```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
task secrets:sync    # applies SealedSecrets to both
```

---

## SealedSecrets Controller Independence

Each cluster has its own Sealed Secrets controller with its own keypair. A secret sealed for mentolder **cannot** be decrypted by korczewski and vice versa.

```bash
# Fetch cluster-specific sealing cert before sealing
task env:fetch-cert ENV=mentolder
task env:fetch-cert ENV=korczewski

# Then seal with correct cert
task env:seal ENV=mentolder
task env:seal ENV=korczewski
```

---

## Keycloak Realm Independence

Each cluster has its own Keycloak realm. OIDC client changes (redirect URIs, mappers, group memberships) must be made in both:

```bash
task keycloak:sync ENV=mentolder
task keycloak:sync ENV=korczewski
```

---

## Korczewski-Specific Constraints

- Arena server runs **korczewski only** (`arena-ws.korczewski.de`) — `task arena:deploy ENV=mentolder` exits with an explanation.
- Website namespace is `website-korczewski`, not `website`.
- SSH access: `patrick@pk-hetzner-4/6/8` (AllowUsers locked to `patrick`).
- DB role password drift is a known footgun: after re-sealing, run `task workspace:sync-db-passwords ENV=korczewski`.

---

## Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Deploy hits wrong cluster | Missing `ENV=` flag | Always pass `ENV=mentolder` or `ENV=korczewski` explicitly |
| SealedSecret not decrypting on korczewski | Sealed with mentolder cert | `task env:fetch-cert ENV=korczewski` → `task env:seal ENV=korczewski` |
| Post-setup writes to wrong namespace | Script hardcodes `-n workspace` | Use `task workspace:post-setup ENV=korczewski` — it exports `WORKSPACE_NAMESPACE` |
| Schema change only on one cluster | Forgot the second cluster | Always apply schema to both shared-db instances |
| `flux reconcile` applies old revision | Didn't reconcile source first | See Flux GitOps section below |

---

## Flux GitOps Operations

Flux watches the `main` branch and reconciles both prod clusters automatically — but it polls on its own schedule. Force reconciliation, debug drift, and handle the subtleties below.

**Both clusters run Flux independently.** Any Flux operation must be run against **each cluster separately**.

### Forced Reconcile After PR Merge

Always prime the GitRepository before reconciling the kustomization. Skipping step 1 silently applies the previous revision.

```bash
# Step 1: prime the git source (fetches latest main)
flux reconcile source git flux-system --context mentolder
flux reconcile source git flux-system --context korczewski

# Step 2: reconcile the kustomization
flux reconcile kustomization workspace --context mentolder
flux reconcile kustomization workspace-korczewski --context korczewski
```

> **Why source first?** `flux reconcile kustomization` re-applies whatever revision the GitRepository last fetched. If that's 5 minutes old, the kustomization gets the wrong commit.

### Check Flux Status

```bash
flux get all --context mentolder
flux get all --context korczewski

# Just kustomizations (most common drift point)
flux get kustomizations --context mentolder
flux get kustomizations --context korczewski
```

### Suspend / Resume Reconciliation

Suspend before manual emergency changes to prevent Flux from immediately reverting them:

```bash
flux suspend kustomization workspace --context mentolder
# Do your manual kubectl apply / patch here...
flux resume kustomization workspace --context mentolder
```

> **Don't forget to resume.** A suspended kustomization silently stops tracking main.

### `$$`-Escaping in substituteFrom

Flux's `substituteFrom` treats `${VAR}` in YAML values as variable references. To emit a literal `$`, use `$$`:

```yaml
# ❌ variable substitution fires
value: "https://${PROD_DOMAIN}/path"

# ✅ literal dollar sign in the rendered manifest
value: "https://$${PROD_DOMAIN}/path"
```

This bites most often in Ingress annotations, env vars, and shell-script ConfigMaps.

### ImageUpdateAutomation

Image auto-update is **not** used for `website`, `brett`, or `docs` (they use `task feature:*` with `:latest`). For other images:

```bash
flux get image update --context mentolder
flux reconcile image repository <name> --context mentolder
flux reconcile image update <name> --context mentolder
flux logs --kind=ImageUpdateAutomation --context mentolder
```

### Flux Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| Kustomization applies old commit | Didn't reconcile source first | `flux reconcile source git flux-system` then kustomization |
| `health check failed` | Pod not Ready within timeout | `kubectl describe pod` — usually image pull or CrashLoop |
| `$$` becomes empty string | Forgot double-dollar in substituteFrom manifest | Replace `${VAR}` with `$${VAR}` in the YAML |
| Kustomization stuck Suspended | Manual suspend never resumed | `flux resume kustomization workspace` |
| `secrets/xxx not found` | SealedSecret not yet decrypted | `kubectl get sealedsecret -n workspace` — controller may be behind |
