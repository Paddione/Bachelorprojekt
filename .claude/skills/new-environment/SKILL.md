---
name: new-environment
description: Use when setting up a new cluster/environment from scratch — guides through the mandatory bring-up order for sealed secrets, cert-manager, and workspace deploy. Also covers scaffolding a new environments/*.yaml from schema. Prevents the silent credential-overwrite footgun that occurs when steps are run out of order.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# new-environment

Bring up a new Kubernetes environment from scratch. This skill enforces the mandatory step ordering that prevents production credentials from being silently overwritten.

---

## ⚠️ Mandatory ordering — never skip steps

The ordering below is not optional. Specifically:
- `workspace:deploy` **must not** run before `env:seal` — it would apply dev placeholder secrets
- `env:seal` **must not** run before `env:fetch-cert` after a cluster reset — it uses the wrong keypair
- `cert-manager` CRDs **must** exist before `workspace:deploy` — ClusterIssuer resource will fail otherwise

---

## Step 0: Scaffold environment config

If the environment YAML doesn't exist yet:

```bash
# Create from schema template
task env:init ENV=<new-env-name>

# Edit the scaffolded file — fill in required fields:
#   PROD_DOMAIN, BRAND_NAME, CONTACT_EMAIL, ENV_CONTEXT (kubectl context name),
#   ENV_OVERLAY (e.g. prod-mentolder), BRAND_ID, SMTP settings
$EDITOR environments/<new-env-name>.yaml

# Validate against schema
task env:validate ENV=<new-env-name>
```

Required `environments/<env>.yaml` fields — check `environments/schema.yaml` for the full list:
- `PROD_DOMAIN` — e.g. `mentolder.de`
- `BRAND_NAME` — e.g. `mentolder`
- `BRAND_ID` — e.g. `mentolder`
- `ENV_CONTEXT` — kubectl context name (matches `kubectl config get-contexts`)
- `ENV_OVERLAY` — kustomize overlay path (e.g. `prod-mentolder`)
- `WORKSPACE_NAMESPACE` — e.g. `workspace` (mentolder) or `workspace-korczewski` (korczewski)

---

## Step 1: Install Sealed Secrets controller

The controller must exist **before** any SealedSecret resource is applied.

```bash
task sealed-secrets:install ENV=<env>
task sealed-secrets:status  ENV=<env>
```

Wait for the controller pod to be `Running` before proceeding:
```bash
kubectl get pod -n kube-system --context <ctx> | grep sealed-secrets
```

---

## Step 2: Fetch cluster sealing certificate

The sealing cert is unique to each cluster's sealed-secrets keypair.

```bash
task env:fetch-cert ENV=<env>
# Writes: environments/certs/<env>.pem
```

Commit the cert (safe to commit — public key only):
```bash
git add environments/certs/<env>.pem
git commit -m "chore(env): add sealing cert for <env>"
```

---

## Step 3: Generate secrets

```bash
# Only if environments/.secrets/<env>.yaml doesn't exist or is stale
task env:generate ENV=<env>
# Output: environments/.secrets/<env>.yaml (gitignored)
```

Review the generated file — replace any `MANAGED_EXTERNALLY` placeholders with real values (e.g. signaling/TURN secrets from `talk-hpb-setup.sh` checks).

---

## Step 4: Seal secrets

```bash
task env:seal ENV=<env>
# Uses: environments/.secrets/<env>.yaml + environments/certs/<env>.pem
# Writes: environments/sealed-secrets/<env>.yaml
```

Commit the sealed file:
```bash
git add environments/sealed-secrets/<env>.yaml
git commit -m "chore(env): initial sealed secrets for <env>"
```

---

## Step 5: Install cert-manager

Cert-manager CRDs must exist before `workspace:deploy` (the ClusterIssuer and Certificate resources will fail otherwise).

```bash
task cert:install ENV=<env>
```

Store the ipv64 DNS API key (needed for DNS-01 ACME challenge):
```bash
task cert:secret -- <ipv64-api-key> ENV=<env>
```

This creates the secret in **both** `cert-manager` and `$WORKSPACE_NAMESPACE` — both are required.

---

## Step 6: Deploy workspace

```bash
task workspace:deploy ENV=<env>
```

This applies the SealedSecret first (inside the kustomize overlay), then all other resources.

---

## Step 6.5: Bootstrap Flux

Once base connectivity and secrets are present, install Flux to manage future updates via GitOps.

```bash
# Apply the Flux system components and Kustomizations
kubectl apply -f flux/clusters/<env>/ --context <ctx>

# Force initial sync
flux reconcile source git flux-system --context <ctx>
flux reconcile kustomization workspace --context <ctx>
flux reconcile kustomization website --context <ctx>
```

---

## Step 7: Post-deploy setup

Run in order — each step depends on the previous one completing:

```bash
# Deploy Collabora (office suite) — separate overlay
task workspace:office:deploy ENV=<env>

# Configure Nextcloud apps (OIDC, Calendar, Contacts, Collabora)
task workspace:post-setup ENV=<env>

# Configure Nextcloud Talk HPB signaling + coturn
task workspace:talk-setup ENV=<env>

# Configure recording backend
task workspace:recording-setup ENV=<env>

# Create default admin users
task workspace:admin-users-setup ENV=<env>

# Apply Nextcloud branding (logos, colors, app order)
task workspace:theme ENV=<env>
```

---

## Step 8: Verify

```bash
task workspace:verify ENV=<env>
task workspace:status ENV=<env>
```

Check that all pods are `Running` and SSO login works (open `https://web.<domain>` in browser).

---

## Step 9: Keycloak realm sync

```bash
task keycloak:sync ENV=<env>
bash scripts/keycloak-ensure-mappers.sh <env>
```

See `keycloak-realm-sync` skill for detailed verification steps.

---

## New vs. reset: the difference

| Situation | What's different |
|---|---|
| **New server** (hcloud create) | cloud-init runs automatically — `hetzner-node` skill handles provisioning |
| **Rescue Mode reset** | No cloud-init; run setup script manually — `hetzner-node` skill handles provisioning |
| **Cluster reset with new keypair** | Steps 1-4 above are mandatory; old sealed files don't decrypt |
| **knowledge-secrets conflict** | If overlay has a `secretGenerator`-managed Secret with same name as SealedSecret, delete the plain Secret first: `kubectl delete secret knowledge-secrets -n <ns> --context <ctx>` |

---

## Related skills

- **`secret-rotation`** — for Type C (SealedSecrets keypair refresh after cluster reset): the step ordering here and the rotation steps there are complementary; run both when recovering from a full cluster reset.
- **`deployment-assist`** — for incremental re-deployment on a cluster that already exists but is partially degraded.
- **`hetzner-node`** — for provisioning the underlying nodes before running this skill.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
