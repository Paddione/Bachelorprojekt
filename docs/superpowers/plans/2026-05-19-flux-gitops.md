---
title: Flux CD GitOps Implementation Plan
domains: []
status: active
pr_number: null
---

# Flux CD GitOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install Flux CD on both production clusters (mentolder + korczewski) so that all workspace manifests reconcile automatically from Git, image tags update via Image Automation, and `task workspace:deploy` is preserved as an emergency fallback.

**Architecture:** Option A (minimal overlay) — a new `flux/` top-level directory wraps the existing `prod-mentolder/` / `prod-korczewski/` Kustomize overlays via Flux `Kustomization` CRDs. Flux's `postBuild.substituteFrom` replaces bash `envsubst` for variable injection; the Taskfile adds a `sed` preprocessing step so both paths stay compatible. Image Automation adds `sha-YYYYMMDD-HHmmss-<shortsha>` tags and commits tag updates back to `main`.

**Tech Stack:** Flux CD v2 (Source Controller, Kustomize Controller, Image Reflector Controller, Image Automation Controller), GitHub Container Registry (ghcr.io), Kustomize, Bash, GitHub Actions, SealedSecrets (already installed, unchanged).

**Spec:** `docs/superpowers/specs/2026-05-19-flux-gitops-design.md`

---

## File Map

### New files
| Path | Purpose |
|---|---|
| `flux/clusters/mentolder/vars-configmap.yaml` | Non-sensitive per-cluster vars for postBuild substitution |
| `flux/clusters/mentolder/workspace.yaml` | Flux Kustomization CRD → prod-mentolder/ |
| `flux/clusters/mentolder/website.yaml` | Flux Kustomization CRD → flux/apps/website-mentolder/ |
| `flux/clusters/korczewski/vars-configmap.yaml` | Same for korczewski |
| `flux/clusters/korczewski/workspace.yaml` | Flux Kustomization CRD → prod-korczewski/ |
| `flux/clusters/korczewski/website.yaml` | Flux Kustomization CRD → flux/apps/website-korczewski/ |
| `flux/apps/website-mentolder/kustomization.yaml` | Kustomize overlay for website ns (mentolder) |
| `flux/apps/website-mentolder/website-vars-configmap.yaml` | Website-specific non-sensitive vars |
| `flux/apps/website-mentolder/image-tag.yaml` | Strategic merge patch: hardcoded imagepolicy marker for mentolder-website |
| `flux/apps/website-korczewski/kustomization.yaml` | Kustomize overlay for website-korczewski ns |
| `flux/apps/website-korczewski/website-vars-configmap.yaml` | Website-specific non-sensitive vars (korczewski) |
| `flux/apps/website-korczewski/image-tag.yaml` | Strategic merge patch: hardcoded imagepolicy marker for korczewski-website |
| `flux/images/mentolder-website.yaml` | ImageRepository + ImagePolicy for mentolder-website |
| `flux/images/korczewski-website.yaml` | ImageRepository + ImagePolicy for korczewski-website |
| `flux/images/brett.yaml` | ImageRepository + ImagePolicy for workspace-brett |
| `flux/images/docs.yaml` | ImageRepository + ImagePolicy for workspace-docs |
| `flux/images/image-update-automation-shared.yaml` | ImageUpdateAutomation for brett + docs (path: ./k3d) |
| `flux/clusters/mentolder/image-update-automation.yaml` | ImageUpdateAutomation for mentolder-website (path: ./flux/apps/website-mentolder) |
| `flux/clusters/korczewski/image-update-automation.yaml` | ImageUpdateAutomation for korczewski-website (path: ./flux/apps/website-korczewski) |

### Modified files
| Path | Change |
|---|---|
| `prod/*.yaml` (18 files) | `${VAR}` → `$(VAR)` for Flux substitution |
| `prod-mentolder/*.yaml` (7 files) | `${VAR}` → `$(VAR)` |
| `prod-korczewski/*.yaml` (8 files) | `${VAR}` → `$(VAR)` |
| `k3d/website.yaml` | `${VAR}` → `$(VAR)` + imagepolicy marker |
| `k3d/brett.yaml` | imagepolicy marker |
| `k3d/docs.yaml` | imagepolicy marker |
| `Taskfile.yml` | Add flux:status/sync/logs tasks; add sed preprocessing to workspace:deploy lines 1395 and 1486 |
| `.github/workflows/build-website.yml` | Push SHA tag, remove kubectl steps |
| `.github/workflows/build-website-korczewski.yml` | Push SHA tag, remove kubectl steps |
| `.github/workflows/build-transcriber.yml` | Push SHA tag |

---

## Task 1: Create Worktree

**Files:** none (git operations only)

- [ ] **Step 1: Check for existing worktree**

```bash
git worktree list | grep flux-gitops
```

Expected: no output (no existing worktree).

- [ ] **Step 2: Create worktree on feature branch**

```bash
git worktree add -b feature/flux-gitops .claude/worktrees/flux-gitops origin/main
cd .claude/worktrees/flux-gitops
git submodule update --init --recursive
```

Expected: `.claude/worktrees/flux-gitops` exists, `git branch --show-current` outputs `feature/flux-gitops`.

- [ ] **Step 3: Verify**

```bash
git worktree list
```

Expected output includes `feature/flux-gitops`.

---

## Task 2: envsubst Migration — Prod Overlays

**Files:**
- Modify: `prod/*.yaml` (18 files — list below)
- Modify: `prod-mentolder/*.yaml` (7 files)
- Modify: `prod-korczewski/*.yaml` (8 files)

The variables to migrate: `PROD_DOMAIN`, `WORKSPACE_NAMESPACE`, `WEBSITE_NAMESPACE`, `DEV_DOMAIN`, `BRAND_NAME`, `BRAND_ID`.

- [ ] **Step 1: Write a test — grep must find occurrences before migration**

```bash
COUNT=$(grep -r '\${PROD_DOMAIN}\|${WORKSPACE_NAMESPACE}\|${WEBSITE_NAMESPACE}\|${DEV_DOMAIN}\|${BRAND_NAME}\|${BRAND_ID}' \
  prod/ prod-mentolder/ prod-korczewski/ --include='*.yaml' | wc -l)
echo "Found $COUNT occurrences — migration pending"
[ "$COUNT" -gt 0 ] && echo "PASS: occurrences exist (expected)" || echo "FAIL: nothing to migrate"
```

Expected: PASS with COUNT > 0.

- [ ] **Step 2: Run the migration — sed in-place across all three directories**

```bash
# This replaces ${VARNAME} with $(VARNAME) for the six variables used in overlays.
# Using a pattern that avoids bash special-var forms like ${VAR:-default}.
find prod/ prod-mentolder/ prod-korczewski/ -name '*.yaml' | xargs sed -i \
  -e 's/\${PROD_DOMAIN}/$(PROD_DOMAIN)/g' \
  -e 's/\${WORKSPACE_NAMESPACE}/$(WORKSPACE_NAMESPACE)/g' \
  -e 's/\${WEBSITE_NAMESPACE}/$(WEBSITE_NAMESPACE)/g' \
  -e 's/\${DEV_DOMAIN}/$(DEV_DOMAIN)/g' \
  -e 's/\${BRAND_NAME}/$(BRAND_NAME)/g' \
  -e 's/\${BRAND_ID}/$(BRAND_ID)/g'
```

- [ ] **Step 3: Verify — zero occurrences of old syntax remain**

```bash
COUNT=$(grep -r '\${PROD_DOMAIN}\|${WORKSPACE_NAMESPACE}\|${WEBSITE_NAMESPACE}\|${DEV_DOMAIN}\|${BRAND_NAME}\|${BRAND_ID}' \
  prod/ prod-mentolder/ prod-korczewski/ --include='*.yaml' | wc -l)
echo "Remaining old-syntax occurrences: $COUNT"
[ "$COUNT" -eq 0 ] && echo "PASS" || echo "FAIL — remaining: $(grep -r '\${PROD_DOMAIN}\|${WORKSPACE_NAMESPACE}\|${WEBSITE_NAMESPACE}\|${DEV_DOMAIN}\|${BRAND_NAME}\|${BRAND_ID}' prod/ prod-mentolder/ prod-korczewski/ --include='*.yaml')"
```

Expected: `Remaining old-syntax occurrences: 0` and PASS.

- [ ] **Step 4: Verify kustomize still builds cleanly**

```bash
kustomize build prod-mentolder/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo "PASS: prod-mentolder builds"
kustomize build prod-korczewski/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo "PASS: prod-korczewski builds"
```

Expected: both PASS (kustomize doesn't evaluate `$(VAR)` — it passes them through as literals).

- [ ] **Step 5: Commit**

```bash
git add prod/ prod-mentolder/ prod-korczewski/
git commit -m "chore(flux): migrate envsubst vars to \$(VAR) syntax for Flux postBuild"
```

---

## Task 3: Update k3d Manifests — imagepolicy Markers + website.yaml Migration

**Files:**
- Modify: `k3d/website.yaml`
- Modify: `k3d/brett.yaml`
- Modify: `k3d/docs.yaml`

- [ ] **Step 1: Migrate website.yaml — all 36 ${VAR} → $(VAR)**

```bash
# website.yaml has many more vars than the overlays — migrate them all
sed -i \
  -e 's/\${ARENA_WS_URL}/$(ARENA_WS_URL)/g' \
  -e 's/\${AUTH_EXTERNAL_URL}/$(AUTH_EXTERNAL_URL)/g' \
  -e 's/\${BRAND_ID}/$(BRAND_ID)/g' \
  -e 's/\${BRAND_NAME}/$(BRAND_NAME)/g' \
  -e 's/\${BRETT_DOMAIN}/$(BRETT_DOMAIN)/g' \
  -e 's/\${CLUSTER_ENV}/$(CLUSTER_ENV)/g' \
  -e 's/\${CONTACT_CITY}/$(CONTACT_CITY)/g' \
  -e 's/\${CONTACT_EMAIL}/$(CONTACT_EMAIL)/g' \
  -e 's/\${CONTACT_NAME}/$(CONTACT_NAME)/g' \
  -e 's/\${CONTACT_PHONE}/$(CONTACT_PHONE)/g' \
  -e 's/\${DOCS_URL}/$(DOCS_URL)/g' \
  -e 's/\${KEYCLOAK_FRONTEND_URL}/$(KEYCLOAK_FRONTEND_URL)/g' \
  -e 's/\${LEGAL_JOBTITLE}/$(LEGAL_JOBTITLE)/g' \
  -e 's/\${LEGAL_STREET}/$(LEGAL_STREET)/g' \
  -e 's/\${LEGAL_UST_ID}/$(LEGAL_UST_ID)/g' \
  -e 's/\${LEGAL_WEBSITE}/$(LEGAL_WEBSITE)/g' \
  -e 's/\${LEGAL_ZIP}/$(LEGAL_ZIP)/g' \
  -e 's/\${LLM_ENABLED}/$(LLM_ENABLED)/g' \
  -e 's/\${LLM_RERANK_ENABLED}/$(LLM_RERANK_ENABLED)/g' \
  -e 's/\${LLM_ROUTER_URL}/$(LLM_ROUTER_URL)/g' \
  -e 's/\${MAIL_EXTERNAL_URL}/$(MAIL_EXTERNAL_URL)/g' \
  -e 's/\${NEXTCLOUD_EXTERNAL_URL}/$(NEXTCLOUD_EXTERNAL_URL)/g' \
  -e 's/\${PROD_DOMAIN}/$(PROD_DOMAIN)/g' \
  -e 's/\${SMTP_FROM}/$(SMTP_FROM)/g' \
  -e 's/\${SMTP_HOST}/$(SMTP_HOST)/g' \
  -e 's/\${SMTP_PORT}/$(SMTP_PORT)/g' \
  -e 's/\${SMTP_SECURE}/$(SMTP_SECURE)/g' \
  -e 's/\${SMTP_USER}/$(SMTP_USER)/g' \
  -e 's/\${SYSTEMTEST_LOOP_ENABLED}/$(SYSTEMTEST_LOOP_ENABLED)/g' \
  -e 's/\${TRAEFIK_EXTERNAL_URL}/$(TRAEFIK_EXTERNAL_URL)/g' \
  -e 's/\${VAULT_EXTERNAL_URL}/$(VAULT_EXTERNAL_URL)/g' \
  -e 's/\${WEBSITE_HOST}/$(WEBSITE_HOST)/g' \
  -e 's/\${WEBSITE_IMAGE}/$(WEBSITE_IMAGE)/g' \
  -e 's/\${WEBSITE_NAMESPACE}/$(WEBSITE_NAMESPACE)/g' \
  -e 's/\${WEBSITE_SITE_URL}/$(WEBSITE_SITE_URL)/g' \
  -e 's/\${WHITEBOARD_EXTERNAL_URL}/$(WHITEBOARD_EXTERNAL_URL)/g' \
  -e 's/\${WORKSPACE_NAMESPACE}/$(WORKSPACE_NAMESPACE)/g' \
  k3d/website.yaml
```

- [ ] **Step 2: Website image — NO marker in k3d/website.yaml**

`k3d/website.yaml` is shared between both clusters but `mentolder-website` and
`korczewski-website` are different images with different policy names. Flux Image
Automation YAML comments are never substituted — a marker like
`{"$imagepolicy": "flux-system:$(WEBSITE_IMAGE)"}` would literally search for a
policy named `$(WEBSITE_IMAGE)`, which does not exist.

**Instead:** the imagepolicy marker lives in per-cluster `image-tag.yaml` patch
files inside `flux/apps/website-mentolder/` and `flux/apps/website-korczewski/`,
created in Task 7. Skip adding any imagepolicy comment to `k3d/website.yaml`.

- [ ] **Step 3: Add imagepolicy marker to brett.yaml**

Find the container image line in `k3d/brett.yaml` (currently `image: ghcr.io/paddione/workspace-brett:latest`) and append the marker:

```bash
sed -i 's|image: ghcr.io/paddione/workspace-brett:latest|image: ghcr.io/paddione/workspace-brett:latest # {"$imagepolicy": "flux-system:brett"}|' k3d/brett.yaml
```

Verify:
```bash
grep 'imagepolicy' k3d/brett.yaml
```
Expected: `image: ghcr.io/paddione/workspace-brett:latest # {"$imagepolicy": "flux-system:brett"}`

- [ ] **Step 4: Add imagepolicy marker to docs.yaml**

```bash
sed -i 's|image: ghcr.io/paddione/workspace-docs:latest|image: ghcr.io/paddione/workspace-docs:latest # {"$imagepolicy": "flux-system:docs"}|' k3d/docs.yaml
```

Verify:
```bash
grep 'imagepolicy' k3d/docs.yaml
```
Expected: one line with `{"$imagepolicy": "flux-system:docs"}`.

- [ ] **Step 5: Verify no old ${VAR} remain in k3d/website.yaml**

```bash
grep '\${' k3d/website.yaml | wc -l
```
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add k3d/website.yaml k3d/brett.yaml k3d/docs.yaml
git commit -m "chore(flux): add imagepolicy markers + migrate website.yaml to \$(VAR) syntax"
```

---

## Task 4: Taskfile Updates

**Files:**
- Modify: `Taskfile.yml`

Two changes: (a) add `flux:*` tasks, (b) fix `workspace:deploy` and `website:deploy` to convert `$(VAR)` back to `${VAR}` before piping to `envsubst`.

- [ ] **Step 1: Add flux task group to Taskfile.yml**

Open `Taskfile.yml` and add the following block before the closing of the tasks section (find a logical grouping, e.g., after `health:` or before `workspace:up:`):

```yaml
  flux:status:
    desc: "Show Flux reconciliation status on both clusters"
    cmds:
      - flux get all --context mentolder
      - flux get all --context korczewski

  flux:sync:
    desc: "Force-reconcile all Flux kustomizations immediately on both clusters"
    cmds:
      - flux reconcile kustomization workspace --with-source --context mentolder
      - flux reconcile kustomization workspace --with-source --context korczewski

  flux:logs:
    desc: "Tail Flux controller logs (ENV=mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - flux logs --context {{.ENV}} --follow

  flux:bootstrap:mentolder:
    desc: "Bootstrap Flux on the mentolder cluster (run once after sealed-secrets:install)"
    cmds:
      - |
        flux bootstrap github \
          --context=mentolder \
          --owner=Paddione \
          --repository=Bachelorprojekt \
          --branch=main \
          --path=flux/clusters/mentolder \
          --personal \
          --components-extra=image-reflector-controller,image-automation-controller

  flux:bootstrap:korczewski:
    desc: "Bootstrap Flux on the korczewski cluster (run once after sealed-secrets:install)"
    cmds:
      - |
        flux bootstrap github \
          --context=korczewski \
          --owner=Paddione \
          --repository=Bachelorprojekt \
          --branch=main \
          --path=flux/clusters/korczewski \
          --personal \
          --components-extra=image-reflector-controller,image-automation-controller
```

- [ ] **Step 2: Fix workspace:deploy — add sed preprocessing before envsubst at line ~1395**

Find line 1395 in Taskfile.yml (the `kustomize build k3d/` dev path). The current pattern is:

```bash
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone | envsubst "..." | kubectl apply --server-side --force-conflicts -f -
```

Change to:

```bash
kustomize build k3d/ --load-restrictor=LoadRestrictionsNone \
  | sed 's/\$(\([^)]*\))/\${\1}/g' \
  | envsubst "..." | kubectl apply --server-side --force-conflicts -f -
```

- [ ] **Step 3: Fix workspace:deploy — add sed preprocessing at line ~1486 (prod path)**

Find line 1486 in Taskfile.yml (the `kustomize build "$overlay/"` prod path):

```bash
kustomize build "$overlay/" --load-restrictor=LoadRestrictionsNone \
  | envsubst "$ENVSUBST_VARS" \
```

Change to:

```bash
kustomize build "$overlay/" --load-restrictor=LoadRestrictionsNone \
  | sed 's/\$(\([^)]*\))/\${\1}/g' \
  | envsubst "$ENVSUBST_VARS" \
```

- [ ] **Step 4: Fix website:deploy — add sed preprocessing before envsubst**

Find the `envsubst "..." < k3d/website.yaml` line in `website:deploy` (around line 1550-1580). Change:

```bash
envsubst "..." < k3d/website.yaml | kubectl ${CTX_ARG} apply -f -
```

To:

```bash
sed 's/\$(\([^)]*\))/\${\1}/g' k3d/website.yaml \
  | envsubst "..." | kubectl ${CTX_ARG} apply -f -
```

- [ ] **Step 5: Verify task list shows new tasks**

```bash
task --list | grep flux
```

Expected: `flux:status`, `flux:sync`, `flux:logs`, `flux:bootstrap:mentolder`, `flux:bootstrap:korczewski`.

- [ ] **Step 6: Smoke-test workspace:deploy dry-run**

```bash
task workspace:validate
```

Expected: exits 0 (kustomize dry-run passes).

- [ ] **Step 7: Commit**

```bash
git add Taskfile.yml
git commit -m "chore(flux): add flux:* tasks + sed preprocessing for \$(VAR) compat in workspace:deploy"
```

---

## Task 5: Flux Cluster Configs — mentolder

**Files:**
- Create: `flux/clusters/mentolder/vars-configmap.yaml`
- Create: `flux/clusters/mentolder/workspace.yaml`
- Create: `flux/clusters/mentolder/website.yaml`

- [ ] **Step 1: Create directory**

```bash
mkdir -p flux/clusters/mentolder
```

- [ ] **Step 2: Create vars-configmap.yaml**

Create `flux/clusters/mentolder/vars-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-vars
  namespace: flux-system
data:
  PROD_DOMAIN: mentolder.de
  WORKSPACE_NAMESPACE: workspace
  WEBSITE_NAMESPACE: website
  DEV_DOMAIN: dev.mentolder.de
  BRAND_NAME: Mentolder
  BRAND_ID: mentolder
  WEBSITE_IMAGE: mentolder-website
```

- [ ] **Step 3: Create workspace Kustomization CRD**

Create `flux/clusters/mentolder/workspace.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: workspace
  namespace: flux-system
spec:
  interval: 5m0s
  path: ./prod-mentolder
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  postBuild:
    substituteFrom:
      - kind: ConfigMap
        name: cluster-vars
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: keycloak
      namespace: workspace
    - apiVersion: apps/v1
      kind: Deployment
      name: shared-db
      namespace: workspace
```

- [ ] **Step 4: Create website Kustomization CRD**

Create `flux/clusters/mentolder/website.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: website
  namespace: flux-system
spec:
  interval: 5m0s
  path: ./flux/apps/website-mentolder
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  postBuild:
    substituteFrom:
      - kind: ConfigMap
        name: cluster-vars
      - kind: ConfigMap
        name: website-vars
      - kind: Secret
        name: website-vars-secret
        optional: true
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: website
      namespace: website
```

- [ ] **Step 5: Verify files exist**

```bash
ls flux/clusters/mentolder/
```

Expected: `vars-configmap.yaml  website.yaml  workspace.yaml`.

- [ ] **Step 6: Commit**

```bash
git add flux/clusters/mentolder/
git commit -m "chore(flux): add Flux cluster configs for mentolder"
```

---

## Task 6: Flux Cluster Configs — korczewski

**Files:**
- Create: `flux/clusters/korczewski/vars-configmap.yaml`
- Create: `flux/clusters/korczewski/workspace.yaml`
- Create: `flux/clusters/korczewski/website.yaml`

- [ ] **Step 1: Create directory**

```bash
mkdir -p flux/clusters/korczewski
```

- [ ] **Step 2: Create vars-configmap.yaml**

Create `flux/clusters/korczewski/vars-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-vars
  namespace: flux-system
data:
  PROD_DOMAIN: korczewski.de
  WORKSPACE_NAMESPACE: workspace-korczewski
  WEBSITE_NAMESPACE: website-korczewski
  DEV_DOMAIN: dev.korczewski.de
  BRAND_NAME: KORE
  BRAND_ID: korczewski
  WEBSITE_IMAGE: korczewski-website
```

- [ ] **Step 3: Create workspace Kustomization CRD**

Create `flux/clusters/korczewski/workspace.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: workspace
  namespace: flux-system
spec:
  interval: 5m0s
  path: ./prod-korczewski
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  postBuild:
    substituteFrom:
      - kind: ConfigMap
        name: cluster-vars
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: keycloak
      namespace: workspace-korczewski
    - apiVersion: apps/v1
      kind: Deployment
      name: shared-db
      namespace: workspace-korczewski
```

- [ ] **Step 4: Create website Kustomization CRD**

Create `flux/clusters/korczewski/website.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: website
  namespace: flux-system
spec:
  interval: 5m0s
  path: ./flux/apps/website-korczewski
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  postBuild:
    substituteFrom:
      - kind: ConfigMap
        name: cluster-vars
      - kind: ConfigMap
        name: website-vars
      - kind: Secret
        name: website-vars-secret
        optional: true
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: website
      namespace: website-korczewski
```

- [ ] **Step 5: Commit**

```bash
git add flux/clusters/korczewski/
git commit -m "chore(flux): add Flux cluster configs for korczewski"
```

---

## Task 7: Flux App Overlays — Website

**Files:**
- Create: `flux/apps/website-mentolder/kustomization.yaml`
- Create: `flux/apps/website-mentolder/website-vars-configmap.yaml`
- Create: `flux/apps/website-korczewski/kustomization.yaml`
- Create: `flux/apps/website-korczewski/website-vars-configmap.yaml`

The website has 36 envsubst vars split into two groups: non-sensitive (ConfigMap) and sensitive (Secret). The `website-vars-secret` is created out-of-band via `kubeseal` (documented in the bootstrap runbook — not committed to git). The `optional: true` flag in the Kustomization CRD means Flux won't fail if the secret doesn't exist yet.

- [ ] **Step 1: Create mentolder website app overlay directory**

```bash
mkdir -p flux/apps/website-mentolder
```

- [ ] **Step 2: Create mentolder kustomization.yaml**

Create `flux/apps/website-mentolder/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: website
resources:
  - ../../../k3d/website.yaml
  - ../../../k3d/website-seller-config.yaml
  - website-vars-configmap.yaml
patches:
  - path: image-tag.yaml
    target:
      kind: Deployment
      name: website
```

- [ ] **Step 2b: Create mentolder image-tag.yaml**

Create `flux/apps/website-mentolder/image-tag.yaml` — a strategic merge patch that overrides the image line with a hardcoded imagepolicy marker. Flux Image Automation searches this file (via the mentolder ImageUpdateAutomation `path: ./flux/apps/website-mentolder`) and replaces `:latest` with the detected SHA tag:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
spec:
  template:
    spec:
      containers:
        - name: website
          image: ghcr.io/paddione/mentolder-website:latest # {"$imagepolicy": "flux-system:mentolder-website"}
```

- [ ] **Step 3: Create mentolder website-vars-configmap.yaml**

Create `flux/apps/website-mentolder/website-vars-configmap.yaml` with all non-sensitive website vars:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: website-vars
  namespace: flux-system
data:
  WEBSITE_HOST: web.mentolder.de
  WEBSITE_SITE_URL: https://web.mentolder.de
  KEYCLOAK_FRONTEND_URL: https://auth.mentolder.de
  AUTH_EXTERNAL_URL: https://auth.mentolder.de
  NEXTCLOUD_EXTERNAL_URL: https://files.mentolder.de
  DOCS_URL: https://docs.mentolder.de
  VAULT_EXTERNAL_URL: https://vault.mentolder.de
  WHITEBOARD_EXTERNAL_URL: https://board.mentolder.de
  TRAEFIK_EXTERNAL_URL: https://traefik.mentolder.de
  MAIL_EXTERNAL_URL: https://mail.mentolder.de
  BRETT_DOMAIN: brett.mentolder.de
  LIVEKIT_DOMAIN: livekit.mentolder.de
  STREAM_DOMAIN: stream.mentolder.de
  ARENA_WS_URL: wss://arena-ws.korczewski.de
  CONTACT_EMAIL: info@mentolder.de
  CONTACT_NAME: Gerald Korczewski
  CONTACT_CITY: "Lüneburg, Hamburg und Umgebung"
  LEGAL_JOBTITLE: Coach und digitaler Begleiter
  LEGAL_WEBSITE: mentolder.de
  CLUSTER_ENV: mentolder
  SYSTEMTEST_LOOP_ENABLED: "false"
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  LLM_ROUTER_URL: http://llm-router.workspace.svc.cluster.local:4000
  SMTP_FROM: info@mentolder.de
```

> **Note:** Sensitive vars (CONTACT_PHONE, LEGAL_STREET, LEGAL_ZIP, LEGAL_UST_ID, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER) must be stored in `website-vars-secret` — a SealedSecret created via:
> ```bash
> kubectl create secret generic website-vars-secret \
>   --from-literal=CONTACT_PHONE='...' \
>   --from-literal=LEGAL_STREET='...' \
>   --from-literal=LEGAL_ZIP='...' \
>   --from-literal=LEGAL_UST_ID='...' \
>   --from-literal=SMTP_HOST='...' \
>   --from-literal=SMTP_PORT='...' \
>   --from-literal=SMTP_SECURE='...' \
>   --from-literal=SMTP_USER='...' \
>   -n flux-system --dry-run=client -o yaml \
>   | kubeseal --context mentolder --format yaml \
>   > flux/clusters/mentolder/website-vars-secret.yaml
> ```
> Fetch values from `environments/.secrets/mentolder.yaml`. Add the sealed file to git.

- [ ] **Step 4: Create korczewski website app overlay directory**

```bash
mkdir -p flux/apps/website-korczewski
```

- [ ] **Step 5: Create korczewski kustomization.yaml**

Create `flux/apps/website-korczewski/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: website-korczewski
resources:
  - ../../../k3d/website.yaml
  - ../../../k3d/website-seller-config.yaml
  - website-vars-configmap.yaml
patches:
  - path: image-tag.yaml
    target:
      kind: Deployment
      name: website
```

- [ ] **Step 5b: Create korczewski image-tag.yaml**

Create `flux/apps/website-korczewski/image-tag.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
spec:
  template:
    spec:
      containers:
        - name: website
          image: ghcr.io/paddione/korczewski-website:latest # {"$imagepolicy": "flux-system:korczewski-website"}
```

- [ ] **Step 6: Create korczewski website-vars-configmap.yaml**

Create `flux/apps/website-korczewski/website-vars-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: website-vars
  namespace: flux-system
data:
  WEBSITE_HOST: web.korczewski.de
  WEBSITE_SITE_URL: https://web.korczewski.de
  KEYCLOAK_FRONTEND_URL: https://auth.korczewski.de
  AUTH_EXTERNAL_URL: https://auth.korczewski.de
  NEXTCLOUD_EXTERNAL_URL: https://files.korczewski.de
  DOCS_URL: https://docs.korczewski.de
  VAULT_EXTERNAL_URL: https://vault.korczewski.de
  WHITEBOARD_EXTERNAL_URL: https://board.korczewski.de
  TRAEFIK_EXTERNAL_URL: https://traefik.korczewski.de
  MAIL_EXTERNAL_URL: https://mail.korczewski.de
  BRETT_DOMAIN: brett.korczewski.de
  LIVEKIT_DOMAIN: livekit.korczewski.de
  STREAM_DOMAIN: stream.korczewski.de
  ARENA_WS_URL: wss://arena-ws.korczewski.de
  CONTACT_EMAIL: info@korczewski.de
  CONTACT_NAME: Patrick Korczewski
  CONTACT_CITY: "Wuppertal"
  LEGAL_JOBTITLE: Informatiker
  LEGAL_WEBSITE: korczewski.de
  CLUSTER_ENV: korczewski
  SYSTEMTEST_LOOP_ENABLED: "false"
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  LLM_ROUTER_URL: http://llm-router.workspace-korczewski.svc.cluster.local:4000
  SMTP_FROM: info@korczewski.de
```

> **Note:** Create a matching `flux/clusters/korczewski/website-vars-secret.yaml` SealedSecret with the korczewski-specific sensitive values from `environments/.secrets/korczewski.yaml`.

- [ ] **Step 7: Validate kustomize builds the app overlay**

```bash
kustomize build flux/apps/website-mentolder/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo "PASS"
kustomize build flux/apps/website-korczewski/ --load-restrictor=LoadRestrictionsNone > /dev/null && echo "PASS"
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add flux/apps/
git commit -m "chore(flux): add website app overlays for mentolder and korczewski"
```

---

## Task 8: Image Automation Configs

**Files:**
- Create: `flux/images/mentolder-website.yaml`
- Create: `flux/images/korczewski-website.yaml`
- Create: `flux/images/brett.yaml`
- Create: `flux/images/docs.yaml`
- Create: `flux/images/image-update-automation.yaml`

- [ ] **Step 1: Create mentolder-website image policy**

Create `flux/images/mentolder-website.yaml`:

```yaml
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: mentolder-website
  namespace: flux-system
spec:
  image: ghcr.io/paddione/mentolder-website
  interval: 5m0s
  secretRef:
    name: ghcr-pull-secret
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: mentolder-website
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: mentolder-website
  filterTags:
    pattern: '^sha-[0-9]{8}-[0-9]{6}-[a-f0-9]+'
  policy:
    alphabetical:
      order: asc
```

- [ ] **Step 2: Create korczewski-website image policy**

Create `flux/images/korczewski-website.yaml`:

```yaml
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: korczewski-website
  namespace: flux-system
spec:
  image: ghcr.io/paddione/korczewski-website
  interval: 5m0s
  secretRef:
    name: ghcr-pull-secret
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: korczewski-website
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: korczewski-website
  filterTags:
    pattern: '^sha-[0-9]{8}-[0-9]{6}-[a-f0-9]+'
  policy:
    alphabetical:
      order: asc
```

- [ ] **Step 3: Create brett image policy**

Create `flux/images/brett.yaml`:

```yaml
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: brett
  namespace: flux-system
spec:
  image: ghcr.io/paddione/workspace-brett
  interval: 5m0s
  secretRef:
    name: ghcr-pull-secret
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: brett
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: brett
  filterTags:
    pattern: '^sha-[0-9]{8}-[0-9]{6}-[a-f0-9]+'
  policy:
    alphabetical:
      order: asc
```

- [ ] **Step 4: Create docs image policy**

Create `flux/images/docs.yaml`:

```yaml
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageRepository
metadata:
  name: docs
  namespace: flux-system
spec:
  image: ghcr.io/paddione/workspace-docs
  interval: 5m0s
  secretRef:
    name: ghcr-pull-secret
---
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: docs
  namespace: flux-system
spec:
  imageRepositoryRef:
    name: docs
  filterTags:
    pattern: '^sha-[0-9]{8}-[0-9]{6}-[a-f0-9]+'
  policy:
    alphabetical:
      order: asc
```

- [ ] **Step 5: Create shared ImageUpdateAutomation for brett and docs**

Create `flux/images/image-update-automation-shared.yaml`. This automation searches `./k3d` for imagepolicy markers — it finds `brett.yaml` and `docs.yaml` markers (which use shared images, same tag on both clusters):

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageUpdateAutomation
metadata:
  name: flux-image-updates-shared
  namespace: flux-system
spec:
  interval: 5m0s
  sourceRef:
    kind: GitRepository
    name: flux-system
  git:
    checkout:
      ref:
        branch: main
    commit:
      author:
        name: flux-bot
        email: flux@mentolder.de
      messageTemplate: 'chore(flux): update shared images {{range .Updated.Images}}{{.}} {{end}}[skip ci]'
    push:
      branch: main
  update:
    strategy: Setters
    path: ./k3d
```

- [ ] **Step 6: Create mentolder website ImageUpdateAutomation**

Create `flux/clusters/mentolder/image-update-automation.yaml`. This automation searches `./flux/apps/website-mentolder` for the `mentolder-website` imagepolicy marker in `image-tag.yaml`:

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageUpdateAutomation
metadata:
  name: flux-image-updates-website
  namespace: flux-system
spec:
  interval: 5m0s
  sourceRef:
    kind: GitRepository
    name: flux-system
  git:
    checkout:
      ref:
        branch: main
    commit:
      author:
        name: flux-bot
        email: flux@mentolder.de
      messageTemplate: 'chore(flux): update mentolder-website to {{range .Updated.Images}}{{.}}{{end}} [skip ci]'
    push:
      branch: main
  update:
    strategy: Setters
    path: ./flux/apps/website-mentolder
```

- [ ] **Step 7: Create korczewski website ImageUpdateAutomation**

Create `flux/clusters/korczewski/image-update-automation.yaml`:

```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImageUpdateAutomation
metadata:
  name: flux-image-updates-website
  namespace: flux-system
spec:
  interval: 5m0s
  sourceRef:
    kind: GitRepository
    name: flux-system
  git:
    checkout:
      ref:
        branch: main
    commit:
      author:
        name: flux-bot
        email: flux@mentolder.de
      messageTemplate: 'chore(flux): update korczewski-website to {{range .Updated.Images}}{{.}}{{end}} [skip ci]'
    push:
      branch: main
  update:
    strategy: Setters
    path: ./flux/apps/website-korczewski
```

- [ ] **Step 8: Commit**

```bash
git add flux/images/ flux/clusters/mentolder/image-update-automation.yaml flux/clusters/korczewski/image-update-automation.yaml
git commit -m "chore(flux): add image automation policies for website, brett, docs"
```

---

## Task 9: CI Workflow Updates

**Files:**
- Modify: `.github/workflows/build-website.yml`
- Modify: `.github/workflows/build-website-korczewski.yml`
- Modify: `.github/workflows/build-transcriber.yml`

- [ ] **Step 1: Update build-website.yml — add SHA tag, remove kubectl steps**

In `.github/workflows/build-website.yml`, find the `Build & push Docker image` step. Change the `run:` block from:

```yaml
run: |
  IMAGE="ghcr.io/paddione/mentolder-website"
  docker build --no-cache \
    -t "${IMAGE}:latest" \
    ...
  docker push "${IMAGE}:latest"
```

To:

```yaml
run: |
  IMAGE="ghcr.io/paddione/mentolder-website"
  SHA_TAG="sha-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
  docker build --no-cache \
    -t "${IMAGE}:${SHA_TAG}" \
    -t "${IMAGE}:latest" \
    -f website/Dockerfile \
    --build-arg PROD_DOMAIN="$PROD_DOMAIN" \
    --build-arg BRAND_NAME="$BRAND_NAME" \
    --build-arg CONTACT_EMAIL="$CONTACT_EMAIL" \
    --build-arg CONTACT_PHONE="$CONTACT_PHONE" \
    --build-arg CONTACT_CITY="$CONTACT_CITY" \
    --build-arg CONTACT_NAME="$CONTACT_NAME" \
    --build-arg LEGAL_STREET="$LEGAL_STREET" \
    --build-arg LEGAL_ZIP="$LEGAL_ZIP" \
    --build-arg LEGAL_JOBTITLE="$LEGAL_JOBTITLE" \
    --build-arg LEGAL_UST_ID="$LEGAL_UST_ID" \
    --build-arg LEGAL_WEBSITE="$LEGAL_WEBSITE" \
    .
  docker push "${IMAGE}:${SHA_TAG}"
  docker push "${IMAGE}:latest"
  echo "IMAGE=${IMAGE}" >> $GITHUB_ENV
  echo "SHA_TAG=${SHA_TAG}" >> $GITHUB_ENV
```

Then **remove** the following steps entirely from `build-website.yml`:
- `Set up kubectl`
- `Configure kubeconfig (mentolder)`
- `Rollout restart website (mentolder)`

Also remove the `packages: write` permission and replace with just `contents: read` if no other steps need it.

- [ ] **Step 2: Update build-website-korczewski.yml — add SHA tag, remove kubectl steps**

In `.github/workflows/build-website-korczewski.yml`, make the same SHA tag change:

```yaml
run: |
  IMAGE="ghcr.io/paddione/korczewski-website"
  SHA_TAG="sha-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
  docker build ... \
    -t "${IMAGE}:${SHA_TAG}" \
    -t "${IMAGE}:latest" \
    ...
  docker push "${IMAGE}:${SHA_TAG}"
  docker push "${IMAGE}:latest"
```

Remove these steps entirely:
- `Set up kubectl`
- `Configure kubeconfig (korczewski)`
- `Rollout restart website (korczewski)` (the step that does `kubectl set image`)

- [ ] **Step 3: Update build-transcriber.yml — add SHA tag**

In `.github/workflows/build-transcriber.yml`, find the `build-push-action` step tags block:

```yaml
tags: |
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
```

Change to:

```yaml
tags: |
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
  ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:sha-${{ env.BUILD_DATE }}-${{ github.sha }}
```

Add a step before the build step to compute BUILD_DATE:

```yaml
- name: Set build date
  run: echo "BUILD_DATE=$(date +%Y%m%d-%H%M%S)" >> $GITHUB_ENV
```

- [ ] **Step 4: Verify no kubectl references remain in updated workflows**

```bash
grep -n 'kubectl\|kubeconfig\|rollout' \
  .github/workflows/build-website.yml \
  .github/workflows/build-website-korczewski.yml
```

Expected: zero output.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build-website.yml \
        .github/workflows/build-website-korczewski.yml \
        .github/workflows/build-transcriber.yml
git commit -m "chore(flux): add SHA tags to CI builds, remove imperative kubectl steps"
```

---

## Task 10: Validate, PR, and Bootstrap Runbook

**Files:**
- No new files (validation + git operations)

- [ ] **Step 1: Run full test suite**

```bash
task test:all
```

Expected: all tests pass. If `test:inventory` fails, run `task test:inventory` and commit the updated `website/src/data/test-inventory.json`.

- [ ] **Step 2: Validate manifests**

```bash
task workspace:validate
```

Expected: exits 0.

- [ ] **Step 3: Verify Flux configs are valid YAML**

```bash
find flux/ -name '*.yaml' | xargs python3 -c "
import sys, yaml
for f in sys.argv[1:]:
    try:
        list(yaml.safe_load_all(open(f)))
        print(f'OK: {f}')
    except Exception as e:
        print(f'FAIL: {f}: {e}')
        sys.exit(1)
"
```

Expected: all `OK`.

- [ ] **Step 4: Final commit of any remaining files**

```bash
git status
git add -u   # only already-tracked modifications
git diff --cached --stat
```

Ensure nothing unintended is staged.

- [ ] **Step 5: Push branch and open PR**

```bash
git push -u origin feature/flux-gitops
gh pr create \
  --title "feat(flux): implement Flux CD GitOps for mentolder + korczewski" \
  --body "$(cat <<'EOF'
## Summary
- Adds Flux CD v2 with Image Automation Controller to both production clusters
- Migrates envsubst `${VAR}` → `$(VAR)` in prod overlays (Flux postBuild.substituteFrom)
- Adds SHA image tags (`sha-YYYYMMDD-HHmmss-shortsha`) to CI build workflows
- Removes imperative `kubectl rollout restart` from CI — Flux handles reconciliation
- Preserves `task workspace:deploy` as emergency fallback via sed preprocessing

## Bootstrap steps (post-merge, run once per cluster)
```bash
flux install  # install flux CLI locally if needed
task flux:bootstrap:mentolder
task flux:bootstrap:korczewski
# Then create ghcr-pull-secret on each cluster (see spec)
```

## Test plan
- [ ] `task test:all` passes
- [ ] `task workspace:validate` passes
- [ ] All flux/ YAML files parse cleanly
- [ ] `grep -r '\${PROD_DOMAIN}' prod/ prod-mentolder/ prod-korczewski/` returns 0 results
- [ ] `grep 'imagepolicy' k3d/brett.yaml k3d/docs.yaml k3d/website.yaml` shows markers on all three
EOF
)"
```

- [ ] **Step 6: Merge PR**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

---

## Bootstrap Runbook (Post-Merge)

> Run this after merging to main. Requires: flux CLI installed locally, `kubeseal` CLI, kubectl contexts `mentolder` and `korczewski` active.

```bash
# 1. Bootstrap Flux on each cluster (creates deploy key, installs controllers)
task flux:bootstrap:mentolder
task flux:bootstrap:korczewski

# 2. Create ghcr pull secret on each cluster
GHCR_PAT=<readonly-github-pat>
flux create secret oci ghcr-pull-secret \
  --url=ghcr.io --username=Paddione --password="$GHCR_PAT" --context=mentolder
flux create secret oci ghcr-pull-secret \
  --url=ghcr.io --username=Paddione --password="$GHCR_PAT" --context=korczewski

# 3. Create website-vars-secret (SealedSecret) for each cluster
# Fill values from environments/.secrets/mentolder.yaml
kubectl create secret generic website-vars-secret \
  --from-literal=CONTACT_PHONE='<value>' \
  --from-literal=LEGAL_STREET='<value>' \
  --from-literal=LEGAL_ZIP='<value>' \
  --from-literal=LEGAL_UST_ID='<value>' \
  --from-literal=SMTP_HOST='<value>' \
  --from-literal=SMTP_PORT='<value>' \
  --from-literal=SMTP_SECURE='<value>' \
  --from-literal=SMTP_USER='<value>' \
  -n flux-system --dry-run=client -o yaml \
  | kubeseal --context mentolder --format yaml \
  > flux/clusters/mentolder/website-vars-secret.yaml
# Repeat for korczewski, then git add + commit + push

# 4. Verify Flux is reconciling
task flux:status
# Expected: all Kustomizations show "Applied revision: main@sha1:..."
```
