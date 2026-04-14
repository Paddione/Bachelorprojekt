# Environment & Secrets Management Redesign

**Date:** 2026-04-10
**Status:** Draft
**Problem:** Stale, missing, or wrong environment values cause deployment failures across 4+ clusters.

---

## 1. Problem Statement

Four recurring failure modes plague deployments:

1. **Prod secrets stale** -- `prod/secrets.yaml` has old or `MANAGED_EXTERNALLY` placeholder values that never got updated.
2. **envsubst misses** -- A `${VAR}` passes through un-substituted because the var wasn't exported, was misspelled, or wasn't in the envsubst allowlist.
3. **Dev/prod drift** -- A new secret key gets added to `k3d/secrets.yaml` but not to `prod/secrets.yaml` or `prod-korczewski/secrets.yaml`, so prod breaks.
4. **Wrong .env loaded** -- Deploying to korczewski but `.env` has mentolder values (or vice versa), because the current system uses a single `.env` plus a manual `source .env.korczewski`.

The root cause is structural: secrets and env vars are managed through disconnected files (`.env`, `.env.korczewski`, `k3d/secrets.yaml`, `prod/secrets.yaml`, `prod-korczewski/secrets.yaml`) with no single source of truth and no validation gate.

## 2. Target Environments

| Environment | kubectl context | Domain | Purpose |
|---|---|---|---|
| dev | k3d-dev | *.localhost | Local development |
| mentolder | mentolder | mentolder.de | Production |
| korczewski | korczewski | korczewski.de | Production |
| (future 1-2) | TBD | TBD | Production |

## 3. Solution: Sealed Secrets + Environment Registry

### 3.1 Environment Registry

A new `environments/` directory becomes the **single source of truth** for what every environment needs and what values it has.

```
environments/
  schema.yaml              # Master list of all required keys
  dev.yaml                 # k3d local values (plaintext -- dev only)
  mentolder.yaml           # mentolder.de env vars (non-secret)
  korczewski.yaml          # korczewski.de env vars (non-secret)
  sealed-secrets/
    mentolder.yaml         # SealedSecret manifest (safe to commit)
    korczewski.yaml        # SealedSecret manifest (safe to commit)
  certs/                   # Sealed Secrets public keys per cluster
    mentolder.pem
    korczewski.pem
```

#### schema.yaml

Declares every variable and secret the system needs. This is the contract -- CI and pre-deploy validation check that every environment satisfies it.

```yaml
# environments/schema.yaml
version: 1

env_vars:
  # Infrastructure
  - name: PROD_DOMAIN
    required: true
    description: "Base domain for the deployment"
    default_dev: "localhost"
    example: "example.com"
    validate: "^[a-z0-9.-]+$"

  - name: BRAND_NAME
    required: true
    description: "Branding name used in website and emails"
    default_dev: "Workspace"

  - name: CONTACT_EMAIL
    required: true
    description: "Primary contact email"
    default_dev: "dev@localhost"
    validate: "^.+@.+$"

  - name: CONTACT_PHONE
    required: true
    description: "Phone number displayed on website"
    default_dev: "+49 000 000 00 000"

  - name: CONTACT_CITY
    required: true
    description: "City/region displayed on website"
    default_dev: "DevCity"

  - name: CONTACT_NAME
    required: true
    description: "Person name displayed on website"
    default_dev: "Dev User"

  - name: LEGAL_STREET
    required: true
    default_dev: "Musterstrasse 1"

  - name: LEGAL_ZIP
    required: true
    default_dev: "00000"

  - name: LEGAL_JOBTITLE
    required: true
    default_dev: "Coach, Berater, Trainer"

  - name: LEGAL_CHAMBER
    required: true
    default_dev: "Entfaellt"

  - name: LEGAL_UST_ID
    required: true
    default_dev: "Nicht vorhanden"

  - name: LEGAL_WEBSITE
    required: true
    default_dev: "localhost"

  - name: WEBSITE_IMAGE
    required: true
    default_dev: "workspace-website"

  - name: INFRA_NAMESPACE
    required: true
    default_dev: "workspace-infra"

  - name: TLS_SECRET_NAME
    required: true
    default_dev: "workspace-wildcard-tls"

  - name: SMTP_FROM
    required: true
    default_dev: "noreply@localhost"

secrets:
  # Database passwords
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: KEYCLOAK_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: MATTERMOST_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: NEXTCLOUD_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: INVOICENINJA_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: VAULTWARDEN_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: MEETINGS_DB_PASSWORD
    required: true
    generate: true
    length: 32

  # Admin passwords (user-provided)
  - name: KEYCLOAK_ADMIN_PASSWORD
    required: true
    generate: false

  - name: NEXTCLOUD_ADMIN_PASSWORD
    required: true
    generate: false

  - name: INVOICENINJA_ADMIN_PASSWORD
    required: true
    generate: false

  - name: COLLABORA_ADMIN_PASSWORD
    required: true
    generate: true
    length: 24

  - name: CLAUDE_CODE_ADMIN_EMAIL
    required: true
    generate: false

  - name: CLAUDE_CODE_ADMIN_PASSWORD
    required: true
    generate: false

  # OIDC secrets
  - name: MATTERMOST_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: NEXTCLOUD_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: INVOICENINJA_OIDC_SECRET
    required: true
    generate: true
    length: 40

  - name: VAULTWARDEN_OIDC_SECRET
    required: true
    generate: true
    length: 40

  # Service secrets
  - name: SIGNALING_SECRET
    required: true
    generate: true
    length: 32

  - name: TURN_SECRET
    required: true
    generate: true
    length: 32

  - name: OAUTH2_PROXY_COOKIE_SECRET
    required: true
    generate: true
    length: 32

  - name: INVOICENINJA_API_TOKEN
    required: true
    generate: true
    length: 32

  - name: BILLING_BOT_MM_TOKEN
    required: true
    generate: true
    length: 32

  - name: INVOICENINJA_APP_KEY
    required: true
    generate: true
    length: 32
    encoding: base64  # prefix with "base64:" for Laravel

  - name: WHITEBOARD_JWT_SECRET
    required: true
    generate: true
    length: 32

  - name: VAULTWARDEN_ADMIN_TOKEN
    required: true
    generate: true
    length: 48

  - name: RECORDING_SECRET
    required: true
    generate: true
    length: 32

  - name: SMTP_PASSWORD
    required: true
    generate: false

# Setup-only vars (used by admin-users-setup.sh, not consumed by pods)
setup_vars:
  - name: KC_USER1_USERNAME
    required: true
  - name: KC_USER1_EMAIL
    required: true
    validate: "^.+@.+$"
  - name: KC_USER1_PASSWORD
    required: true
  - name: KC_USER2_USERNAME
    required: false
  - name: KC_USER2_EMAIL
    required: false
  - name: KC_USER2_PASSWORD
    required: false
```

#### Environment file (e.g. mentolder.yaml)

```yaml
# environments/mentolder.yaml
environment: mentolder
context: mentolder                # kubectl context name
domain: mentolder.de

env_vars:
  PROD_DOMAIN: mentolder.de
  BRAND_NAME: Mentolder
  CONTACT_EMAIL: info@mentolder.de
  CONTACT_PHONE: "+49 151 508 32 601"
  CONTACT_CITY: "Lueneburg"
  CONTACT_NAME: "Gerald Korczewski"
  LEGAL_STREET: "Ludwig-Erhard-Str. 18"
  LEGAL_ZIP: "20459"
  LEGAL_JOBTITLE: "Coach, Berater, Trainer"
  LEGAL_CHAMBER: "Entfaellt"
  LEGAL_UST_ID: "Kleinunternehmer gem. 19 Abs. 1 UStG"
  LEGAL_WEBSITE: mentolder.de
  WEBSITE_IMAGE: mentolder-website
  INFRA_NAMESPACE: mentolder-infra
  TLS_SECRET_NAME: mentolder-tls
  SMTP_FROM: mentolder@mailbox.org

# Kustomize overlay path for this environment
overlay: prod

# Sealed secrets are in sealed-secrets/mentolder.yaml
secrets_ref: sealed-secrets/mentolder.yaml
```

#### dev.yaml

```yaml
# environments/dev.yaml
environment: dev
context: k3d-dev
domain: localhost

# Dev uses default_dev values from schema.yaml for env_vars.
# Only override when needed:
env_vars:
  WEBSITE_IMAGE: workspace-website

# Dev secrets: auto-generated from schema or use dev defaults.
# No sealed secrets needed -- plaintext is fine for local dev.
secrets_mode: plaintext
```

### 3.2 Sealed Secrets

[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) encrypts K8s Secret manifests with a cluster-specific public key. The encrypted `SealedSecret` is safe to commit to git. The Sealed Secrets controller in the cluster decrypts it into a regular `Secret` at apply time.

#### How secrets flow

```
1. User provides secret values (or they're auto-generated)
         |
         v
2. `task env:seal ENV=mentolder` encrypts them with mentolder's public key
         |
         v
3. SealedSecret YAML committed to git: environments/sealed-secrets/mentolder.yaml
         |
         v
4. ArgoCD syncs the SealedSecret to the cluster
         |
         v
5. Sealed Secrets controller decrypts -> creates K8s Secret `workspace-secrets`
         |
         v
6. Pods consume the Secret via envFrom/secretKeyRef (unchanged)
```

#### What changes for ArgoCD

- The `prod/secrets.yaml` with `MANAGED_EXTERNALLY` placeholders is **deleted**.
- `prod/kustomization.yaml` no longer patches secrets -- the SealedSecret is a separate resource.
- The ArgoCD `ignoreDifferences` for Secret `/data` is **removed** -- Sealed Secrets owns the Secret lifecycle now.
- The `argocd.argoproj.io/sync-options: Skip=true` annotation on secrets is **removed**.

#### Dev flow

For k3d local dev, Sealed Secrets controller is also deployed, but `task env:seal ENV=dev` produces a SealedSecret from the dev defaults in schema.yaml. Alternatively, dev can continue using plaintext secrets (generated from the schema) since they're throwaway values. The validation gate is the same either way.

### 3.3 Eliminating envsubst

`envsubst` is fragile -- it operates on raw text, has no type safety, and silently produces empty strings for missing vars. We replace it with **Kustomize replacements**.

#### Current flow (fragile)

```
kustomize build prod/ | envsubst "$PROD_DOMAIN $BRAND_NAME ..." | kubectl apply
```

Problems:
- Miss a var in the allowlist -> un-substituted `${VAR}` hits the cluster
- Misspell a var name -> silent empty string
- ArgoCD needs a custom CMP plugin just to run envsubst

#### New flow (validated)

Kustomize `replacements` (or `vars` for older versions) reference the domain-config ConfigMap and substitute values at kustomize build time. The environment-specific ConfigMap is generated from the registry.

```yaml
# prod/kustomization.yaml (simplified)
replacements:
  - source:
      kind: ConfigMap
      name: domain-config
      fieldPath: data.PROD_DOMAIN
    targets:
      - select:
          kind: IngressRoute
        fieldPaths:
          - spec.routes.0.match
        options:
          delimiter: "."
          index: 1  # replace domain portion
```

For cases where Kustomize replacements are too verbose (e.g. the website deploy with 13+ vars), we keep envsubst but **move it into the validation gate** -- the `task env:deploy` wrapper exports vars from the registry (not from `.env`) and validates all of them before calling envsubst.

#### ArgoCD CMP simplification

The `kustomize-envsubst` CMP plugin is replaced by standard Kustomize (no plugin needed) for the main workspace overlay. For the website (which still uses envsubst for templated YAML), the CMP reads vars from the environment registry instead of hardcoded `ARGOCD_ENV_*` vars.

### 3.4 Validation Gate

A bash script (`scripts/env-validate.sh`) that runs before every deployment. It is the **hard gate** -- nothing deploys without passing.

#### What it checks

```
1. Schema completeness
   - Every key in schema.yaml has a value in the target environment file
   - No unknown keys in the environment file (catches typos)

2. Secret completeness
   - For prod: SealedSecret manifest exists and contains all keys from schema
   - For dev: plaintext secrets exist for all keys

3. Cross-environment drift detection
   - Compare secret key sets across all environment files
   - Flag any key present in one environment but missing in another

4. Value validation
   - Regex patterns from schema.yaml (e.g. domain format, email format)
   - No placeholder values ("MANAGED_EXTERNALLY", "REPLACE_ME", "yourdomain.tld")
   - No empty strings for required keys

5. Context verification
   - The kubectl context in the environment file matches the target
   - The cluster is reachable
```

#### Integration points

```yaml
# Taskfile.yml -- every deploy task gets the gate
workspace:deploy:
  deps: [env:validate]    # <-- hard dependency
  vars:
    ENV: '{{.ENV | default "dev"}}'
  cmds:
    - scripts/env-deploy.sh {{.ENV}}

workspace:prod:deploy:
  cmds:
    - task: env:validate
      vars: { ENV: mentolder }
    - scripts/env-deploy.sh mentolder
```

CI also runs validation:
```yaml
# .github/workflows/ci.yml
- name: Validate all environments
  run: |
    for env in environments/*.yaml; do
      scripts/env-validate.sh "$env" --schema-only  # no cluster access in CI
    done
```

### 3.5 Unified Taskfile Interface

All deployment tasks converge on a single `ENV` parameter:

```bash
# Local dev (default)
task workspace:up                        # ENV=dev implied

# Production
task workspace:deploy ENV=mentolder      # validates + deploys mentolder
task workspace:deploy ENV=korczewski     # validates + deploys korczewski

# Seal secrets for a specific environment
task env:seal ENV=mentolder              # encrypts secrets -> sealed-secrets/mentolder.yaml

# Generate dev secrets from schema defaults
task env:generate ENV=dev                # creates plaintext secrets for local dev

# Validate without deploying
task env:validate ENV=mentolder          # dry-run validation only

# Show current config for an environment
task env:show ENV=mentolder              # prints all resolved values

# Initialize a new environment
task env:init ENV=newclient              # creates environments/newclient.yaml from schema
```

**What this replaces:**
- `.env` / `.env.korczewski` -- no longer needed; values live in `environments/*.yaml`
- `dotenv: ['.env']` in Taskfile -- removed
- Manual `set -a; source .env.korczewski; set +a` -- removed
- `workspace:prod:deploy` vs `korczewski:deploy` as separate tasks -- unified into one parameterized task

### 3.6 Secret Lifecycle

#### Initial setup (new environment)

```bash
# 1. Create environment file from schema
task env:init ENV=clientname
# -> creates environments/clientname.yaml with placeholders from schema

# 2. Fill in env_vars in the file (domain, brand, email, etc.)
$EDITOR environments/clientname.yaml

# 3. Generate secrets (auto-generate where schema says generate: true)
task env:generate ENV=clientname
# -> creates environments/.secrets/clientname.yaml (gitignored, plaintext)
# -> prompts for user-provided secrets (admin passwords, SMTP, etc.)

# 4. Fetch the cluster's sealing key
task env:fetch-cert ENV=clientname
# -> saves public key to environments/certs/clientname.pem

# 5. Seal the secrets
task env:seal ENV=clientname
# -> encrypts .secrets/clientname.yaml -> sealed-secrets/clientname.yaml
# -> sealed version is safe to commit

# 6. Deploy
task workspace:deploy ENV=clientname
```

#### Rotation

```bash
# Rotate a specific secret
task env:rotate ENV=mentolder SECRET=MATTERMOST_DB_PASSWORD
# -> generates new value, updates .secrets/mentolder.yaml, re-seals

# Rotate all auto-generated secrets
task env:rotate-all ENV=mentolder
# -> regenerates all generate:true secrets, re-seals
```

#### Adding a new secret to the system

1. Add the key to `schema.yaml`
2. Run `task env:validate ENV=all` -- fails for every environment missing the key
3. Add values to each environment, re-seal
4. CI catches any environment you missed

This directly solves **dev/prod drift** -- the schema is the contract.

## 4. File Changes Summary

### New files

| File | Purpose |
|---|---|
| `environments/schema.yaml` | Master key registry |
| `environments/dev.yaml` | Dev environment config |
| `environments/mentolder.yaml` | Mentolder prod config |
| `environments/korczewski.yaml` | Korczewski prod config |
| `environments/sealed-secrets/*.yaml` | Encrypted SealedSecret manifests (committed) |
| `environments/certs/*.pem` | Cluster public keys for sealing (committed) |
| `environments/.secrets/` | Plaintext secrets (gitignored) |
| `scripts/env-validate.sh` | Pre-deploy validation gate |
| `scripts/env-deploy.sh` | Unified deploy script (reads registry, exports, deploys) |
| `scripts/env-seal.sh` | Sealed Secrets encryption wrapper |
| `scripts/env-generate.sh` | Secret generation from schema |
| `k3d/sealed-secrets-controller.yaml` | Sealed Secrets controller deployment |

### Modified files

| File | Change |
|---|---|
| `Taskfile.yml` | Remove `dotenv`, remove per-cluster deploy tasks, add `env:*` tasks, add `ENV` parameter to deploy tasks |
| `prod/kustomization.yaml` | Remove `secrets.yaml` patch, add SealedSecret resource reference |
| `prod-korczewski/kustomization.yaml` | Same |
| `argocd/install/cmp-plugin.yaml` | Simplify or remove envsubst CMP |
| `argocd/applicationset.yaml` | Reference sealed secrets, simplify env var passing |
| `.github/workflows/ci.yml` | Add `env-validate --schema-only` step for all environments |
| `.gitignore` | Add `environments/.secrets/` |

### Deleted files

| File | Reason |
|---|---|
| `.env` | Replaced by `environments/mentolder.yaml` |
| `.env.korczewski` | Replaced by `environments/korczewski.yaml` |
| `prod/secrets.yaml` | Replaced by SealedSecret |
| `prod-korczewski/secrets.yaml` | Replaced by SealedSecret |

### Unchanged

- `k3d/secrets.yaml` -- kept as-is for backward compat during migration; eventually replaced by dev SealedSecret
- All pod specs / deployments -- they still consume `workspace-secrets` via envFrom, nothing changes
- `k3d/configmap-domains.yaml` -- dev domains stay hardcoded for simplicity

## 5. Migration Path

The migration is incremental -- no big bang:

1. **Phase 1: Registry + Validation** -- Create `environments/` structure, write `env-validate.sh`, wire it into Taskfile. Old deploy flow still works, but now has a validation gate.
2. **Phase 2: Sealed Secrets** -- Deploy Sealed Secrets controller, seal existing prod secrets, update kustomizations. Remove `MANAGED_EXTERNALLY` files.
3. **Phase 3: envsubst elimination** -- Convert domain substitution to Kustomize replacements where feasible. Keep envsubst for website deploy (behind the validation gate).
4. **Phase 4: Cleanup** -- Remove `.env` files, old per-cluster deploy tasks, CMP plugin simplification.

Each phase is independently deployable and testable.

## 6. Testing

- **CI:** `env-validate --schema-only` runs on every PR, catches drift immediately.
- **Existing tests:** All existing test IDs (FA-*, SA-*, NFA-*) continue working unchanged -- pods consume secrets the same way.
- **New test:** `SA-10` (or similar) -- verify that Sealed Secrets controller decrypts correctly, verify validation gate rejects incomplete environments.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sealed Secrets controller key loss = all secrets lost | Back up the controller's private key as part of cluster setup. Document in runbook. |
| Learning curve for `kubeseal` CLI | Wrapped in `task env:seal` -- users never call kubeseal directly |
| Schema.yaml becomes a bottleneck (every change touches it) | Schema changes are rare (new service = new secret). CI validates automatically. |
| Kustomize replacements verbose for many substitutions | Keep envsubst for website deploy (the one heavy case), validate via registry |
| Migration period: two secret flows running simultaneously | Phase 1 adds validation to both flows. Phases overlap safely. |
