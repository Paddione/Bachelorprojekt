---
name: fleet-ops
description: Use when deploying, verifying, or operating across both prod clusters simultaneously — mentolder and korczewski. Covers task feature:* fan-out, the feature:promote dev→prod flow with smoke gate and auto-rollback, cross-cluster schema changes, cluster status checks, Flux GitOps reconciliation, and the constraint that each cluster has its own independent shared-db and sealed-secrets controller.
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

## Promotion with Smoke Gate (`feature:promote`)

`task feature:promote` is the dev → prod flow for service-image changes (website, brett, arena, docs). Differs from `feature:website` / `feature:brett` etc. in three ways:

1. **Build-once-deploy-many** — one image tag (`promote-<sha>-<epoch>`) is built and pushed once, then `kubectl set image` applies the *byte-identical* artifact to dev and prod. Exception: `website` is brand-baked at build time, so mentolder + korczewski each build their own image (still build-once within each brand's dev→prod lineage).
2. **Playwright smoke gate** between dev and prod. Failure aborts before any prod rollout.
3. **Auto-rollback** — every `kubectl set image` is gated by `rollout status`; failure runs `rollout undo` on that deployment and exits non-zero. Cross-cluster rollback is *not* automatic — clusters that already shipped stay shipped.

### Docs to both clusters

`docs` has no dev stage and ignores `TARGET` (always fans out to both). Full happy path:

```bash
# 1. Dry-run first to see exactly what would execute.
DRY_RUN=1 SERVICE=docs TARGET=both task feature:promote

# 2. Real run.
SERVICE=docs TARGET=both task feature:promote
```

What it does, in order:

| Phase | Side effect |
|---|---|
| 1 | `node scripts/build-docs.js` regenerates `k3d/docs-content-built/` from the Markdown source. |
| 1 | `docker build -f scripts/docs.Dockerfile .` produces `ghcr.io/paddione/workspace-docs:promote-<sha>-<epoch>`. |
| 1 | `docker push` uploads that tag to ghcr. |
| 2-3 | Skipped (docs has no dev cluster mapping). |
| 4 | `kubectl --context mentolder -n workspace set image deploy/docs docs=<tag>` + `rollout status --timeout=180s`. Failure → `rollout undo`. |
| 4 | Same against `korczewski` / `workspace-korczewski`. Mentolder failure does *not* roll back korczewski; korczewski failure rolls back korczewski only. |

### Other services

| Service | dev stage? | TARGET behavior |
|---|---|---|
| `website` | yes (`workspace-dev` / `workspace-korczewski-dev`) | `both` builds two images (brand-per-cluster); single target builds one |
| `brett` | yes (same ns as website) | one image shared across clusters |
| `arena` | korczewski-only | `TARGET=mentolder` rejected; `TARGET=both` downgrades to `korczewski`. Migrations & bootstrap Job are *not* promoted — run `task arena:deploy ENV=korczewski` for those. |
| `docs` | no | always both, `TARGET` ignored |

### Smoke spec overrides

`feature:promote` resolves the Playwright `--grep` pattern in this order:

1. `SMOKE_GREP` env var (per-run override) — `SMOKE_GREP="fa-46-brett-skins" task feature:promote`
2. `tests/e2e/smoke/<service>.txt` — one pattern per non-comment line, joined with `|`
3. Built-in default in `scripts/feature-promote.sh`

The override files live next to the Playwright suite and document the convention in `tests/e2e/smoke/README.md`.

### Useful knobs

| Env var | Purpose |
|---|---|
| `DRY_RUN=1` | Echo docker/kubectl/playwright commands without executing |
| `PROMOTE_TAG=v1.2.3` | Override the auto-generated tag (e.g. for human-meaningful semver) |
| `ROLLBACK_TIMEOUT=300s` | Raise rollout-status timeout from the default 180s |
| `SMOKE_GREP=...` | Override Playwright filter for this run only |

### When *not* to use `feature:promote`

- **Manifest or kustomize changes** — `feature:promote` only moves the image bits via `kubectl set image`. If a Deployment YAML, ConfigMap, Service, or kustomize overlay changed, run the full `task <svc>:deploy ENV=…` (or `feature:website` / `feature:brett`) once so the manifest lands.
- **Schema migrations or bootstrap Jobs** — these run in `*:deploy` tasks, not in `feature:promote`. Arena migrations specifically: `task arena:deploy ENV=korczewski`.
- **First-time deploy of a service** — the target Deployment must already exist; `kubectl set image` fails if `deploy/<name>` is missing.

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
flux reconcile kustomization workspace --context korczewski
```

> **Why source first?** `flux reconcile kustomization` re-applies whatever revision the GitRepository last fetched. If that's 5 minutes old, the kustomization gets the wrong commit.

> **Kustomization name ≠ git path.** The Flux `Kustomization` resource is named `workspace` on **both** clusters (`metadata.name` in `flux/clusters/<env>/workspace.yaml`); only the `path:` differs (`./prod-mentolder` vs `./prod-korczewski`). Likewise the website kustomization is named `website` on both (paths `./flux/apps/website-mentolder` / `-korczewski`). `flux reconcile kustomization <name>` takes the **name**, not the path — so `flux reconcile kustomization workspace-korczewski` fails with "not found". Always reconcile by the base name and select the cluster with `--context`.

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
