---
name: fleet-ops
description: Use when deploying, verifying, or operating across both prod environments simultaneously — mentolder standalone and fleet (hosting korczewski brand). Covers task feature:* fan-out, the feature:promote dev→prod flow with smoke gate and auto-rollback, cross-cluster schema changes, cluster status checks, Flux GitOps reconciliation, and the constraint that each cluster has its own independent shared-db and sealed-secrets controller.
---

# fleet-ops — Multi-Cluster Operations (mentolder + fleet)

## Overview

Production runs as **two independent k3s clusters** — the standalone `mentolder` cluster and the unified `fleet` cluster. They share no storage, no database, no sealed-secrets controller — any operation that changes shared state (DB schema, role passwords, sealed secrets, OIDC config) must be applied to **both explicitly**.

| Brand | Cluster context | Namespace | Domain |
|---|---|---|---|
| mentolder | `mentolder` (standalone) | `workspace` | `web.mentolder.de` |
| korczewski | `fleet` | `workspace-korczewski` | `web.korczewski.de` |

> **Fleet Stage 2 topology (as of 2026-05-30).** The standalone `korczewski` cluster has been torn down. Its hosts (`pk-hetzner-4/6/8`) now back the unified **`fleet`** k3s cluster (control-plane pk-4; workers pk-6, pk-8). The korczewski **brand** lives on, operated via the **`fleet`** kubeconfig context in namespace `workspace-korczewski`. The old `korczewski` context (`204.168.244.104:6443`) is **DEAD**: that IP now serves the fleet k3s CA, so it throws an x509 error (T000340). `ENV=korczewski` / `BRAND=korczewski` remain valid brand identifiers.
>
> **`task fleet:deploy` HAS been run (Phase 2a complete).** Both brands' core workloads are deployed and Running on the fleet cluster — namespaces `workspace` (mentolder brand) and `workspace-korczewski` are each at **26/26** pods (PRs #1193, #1205, #1206, #1213). **Still pending (Phase 2b / 2c):** Collabora office-stack + CoTURN live deploy on fleet (mechanism merged #1197, not yet run), the wildcard cert won't issue (T000351, coturn cert-gated), website apps are not on fleet, and the **DNS cutover is NOT done** — `mentolder` remains a live STANDALONE cluster (reversible DNS flip). See `docs/fleet-stage2-cutover-runbook.md` and plan T000338.

---

## Fan-Out Deploy Commands

These are the primary interfaces for cross-environment work:

```bash
task feature:deploy        # workspace:deploy + post-setup on BOTH environments
task feature:website       # Rebuild + roll Astro website on BOTH environments
task feature:brett         # Rebuild + roll brett on BOTH environments
task feature:livekit       # Re-pin LiveKit DNS on BOTH environments
task health                # Cross-environment status + connectivity check
task workspace:verify:all-prods  # Smoke probes on BOTH environments
task clusters:status       # One-line status across both
```

Use `task workspace:deploy ENV=mentolder` + `ENV=korczewski` sequentially when you need finer control than the fan-out tasks.

> **`feature:deploy` does NOT deploy every service.** It runs `workspace:deploy` + post-setup + verify only — the base kustomization. Collabora, CoTURN/Janus, the website, and arena each deploy by their own task. For a full bring-up, use the "Deploy Every Service to Both Brands" sequence below.

---

## Deploy Every Service to Both Brands

The base kustomization (`workspace:deploy`) leaves four services undeployed: **Collabora** (office-stack), **CoTURN/Janus** (coturn-stack), the **website** (own namespace), and **arena** (korczewski only). To bring up the *complete* platform on both brands, fan each pass across both `ENV=mentolder` (standalone cluster) and `ENV=korczewski` (fleet cluster, namespace `workspace-korczewski`):

```bash
# 1. Full umbrella per brand: workspace:deploy → office:deploy → mcp:deploy →
#    post-setup → talk-setup → recording-setup → transcriber-setup
task workspace:setup ENV=mentolder
task workspace:setup ENV=korczewski

# 2. CoTURN/Janus (prod-only privileged stack — Talk video fails without it)
task workspace:coturn:deploy ENV=mentolder
task workspace:coturn:deploy ENV=korczewski

# 3. Website (own namespace; brand-baked image per cluster)
task feature:website            # builds + rolls both brands

# 4. LiveKit DNS pin (both brands — ICE silently fails ~66% unpinned)
task feature:livekit

# 5. Arena game server + migrations — korczewski ONLY
task feature:arena              # arena:deploy ENV=korczewski (mentolder is a no-op)
```

> **Fleet cluster (both brands, one cluster):** when both brands live on `fleet`, `task fleet:deploy` deploys platform once then both brands through the same `workspace:deploy` path and seeds the `coturn` + `workspace-office` SealedSecret namespaces. Still follow with the per-brand office/coturn/website/livekit passes above using `ENV=fleet-mentolder` / `ENV=fleet-korczewski`.

### Per-Brand Ingress Accessibility Verification

A two-environment deploy is **not done until every host answers on both brands**. The base kustomization deploying clean does not prove the ingress is reachable — verify each brand explicitly:

```bash
task workspace:verify:all-prods                       # smoke probes, both clusters
task workspace:check-connectivity ENV=mentolder       # curls every host on web.mentolder.de
task workspace:check-connectivity ENV=korczewski      # curls every host on web.korczewski.de
```

`check-connectivity` sweeps `auth/files/vault/sign/tracking/web/docs/brett/office/board/signaling/mail/traefik` and exits non-zero on any unreachable host. A `✗` for `office.<domain>` means CoTURN/office was skipped on that brand; a 404 behind the Traefik default cert means that host's ingress/service never landed — re-run the matching deploy task for **that brand only** (the other brand is independent). `comfy.<domain>` and `arena-ws.korczewski.de` are not in the sweep — curl them manually.

| Service | mentolder host | korczewski host |
|---|---|---|
| Website | `web.mentolder.de` | `web.korczewski.de` |
| Keycloak | `auth.mentolder.de` | `auth.korczewski.de` |
| Nextcloud | `files.mentolder.de` | `files.korczewski.de` |
| Vaultwarden | `vault.mentolder.de` | `vault.korczewski.de` |
| DocuSeal | `sign.mentolder.de` | `sign.korczewski.de` |
| Docs | `docs.mentolder.de` | `docs.korczewski.de` |
| Brett | `brett.mentolder.de` | `brett.korczewski.de` |
| Collabora | `office.mentolder.de` | `office.korczewski.de` |
| Whiteboard | `board.mentolder.de` | `board.korczewski.de` |
| Talk signaling | `meet.`/`signaling.mentolder.de` | `meet.`/`signaling.korczewski.de` |
| LiveKit | `livekit.`/`stream.mentolder.de` | `livekit.`/`stream.korczewski.de` |
| Arena | — (korczewski only) | `arena-ws.korczewski.de` |

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
| 4 | Same against `--context fleet -n workspace-korczewski`. Mentolder failure does *not* roll back korczewski; korczewski failure rolls back korczewski only. |

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

# Apply to korczewski (fleet cluster, namespace workspace-korczewski)
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
| Deploy hits wrong cluster | Missing `ENV=` flag | Always pass `ENV=mentolder` or `ENV=korczewski` (or `ENV=fleet-mentolder` / `ENV=fleet-korczewski`) explicitly |
| SealedSecret not decrypting on fleet (workspace-korczewski) | Sealed with mentolder cert | `task env:fetch-cert ENV=korczewski` → `task env:seal ENV=korczewski` |
| Post-setup writes to wrong namespace | Script hardcodes `-n workspace` | Use `task workspace:post-setup ENV=korczewski` — it exports `WORKSPACE_NAMESPACE` (resolves to `workspace-korczewski` on fleet) |
| Schema change only on one cluster | Forgot the second cluster | Always apply schema to both shared-db instances |
| `flux reconcile` applies old revision | Didn't reconcile source first | See Flux GitOps section below |

---

## Flux GitOps Operations

Flux watches the `main` branch and reconciles both prod environments automatically — but it polls on its own schedule. Force reconciliation, debug drift, and handle the subtleties below.

**Both clusters run Flux independently.** Any Flux operation must be run against **each cluster separately** (mentolder standalone and fleet).

### Forced Reconcile After PR Merge

Always prime the GitRepository before reconciling the kustomization. Skipping step 1 silently applies the previous revision.

```bash
# Step 1: prime the git source (fetches latest main)
flux reconcile source git flux-system --context mentolder
flux reconcile source git flux-system --context fleet

# Step 2: reconcile the kustomization
flux reconcile kustomization workspace --context mentolder
flux reconcile kustomization workspace --context fleet
```

> **Why source first?** `flux reconcile kustomization` re-applies whatever revision the GitRepository last fetched. If that's 5 minutes old, the kustomization gets the wrong commit.

> **Kustomization name ≠ git path.** The Flux `Kustomization` resource is named `workspace` on **both** clusters (`metadata.name` in `flux/clusters/<env>/workspace.yaml`); only the `path:` differs (`./prod-mentolder` vs `./prod-korczewski`). Likewise the website kustomization is named `website` on both (paths `./flux/apps/website-mentolder` / `-korczewski`). `flux reconcile kustomization <name>` takes the **name**, not the path — so `flux reconcile kustomization workspace-korczewski` fails with "not found". Always reconcile by the base name and select the cluster with `--context`.

### Check Flux Status

```bash
flux get all --context mentolder
flux get all --context fleet

# Just kustomizations (most common drift point)
flux get kustomizations --context mentolder
flux get kustomizations --context fleet
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
