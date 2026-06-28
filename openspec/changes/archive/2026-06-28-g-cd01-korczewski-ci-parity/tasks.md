---
title: G-CD01 korczewski CI Build/Deployment Parity
ticket_id: T001276
domains: [ci-cd, test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# g-cd01-korczewski-ci-parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `.github/workflows/build-website.yml` into three independent jobs (`build-image` → `deploy-mentolder` + `deploy-korczewski`) so a mentolder deploy failure can no longer silently skip the korczewski deploy, and lock the brand-parity guarantee in with BATS tests + spec sync.

**Architecture:** One shared `build-image` job builds and pushes the brand-neutral `ghcr.io/paddione/website` Docker image and exports `image` + `sha_tag` as job outputs. Two deploy jobs each declare `needs: [build-image]` (and crucially NOT each other), run in parallel, and read the image tag from `needs.build-image.outputs.*`. The kubectl / kustomize / envsubst deploy logic is moved verbatim into each deploy job — no functional change to deploy commands.

**Tech Stack:** GitHub Actions YAML, BATS (`tests/spec/`, `tests/unit/`), `python3`+`yaml` for structural assertions, OpenSpec markdown specs.

## Global Constraints

- **No functional change to deploy commands.** The `kustomize build`, `sed`, `envsubst`, `kubectl apply --server-side`, `kubectl set image`, secret-check `python3` block, and `kubectl rollout status --timeout=120s` lines stay byte-identical to today's content — only their job container changes.
- **Image tags flow via job outputs, not `$GITHUB_ENV`.** `build-image` writes `image` + `sha_tag` to `$GITHUB_OUTPUT`; deploy jobs consume `${{ needs.build-image.outputs.image }}` / `${{ needs.build-image.outputs.sha_tag }}` injected into `IMAGE` / `SHA_TAG` env vars so the existing `${IMAGE}:${SHA_TAG}` run-script references keep working.
- **`deploy-korczewski` MUST NOT list `deploy-mentolder` in `needs:`** (and vice versa). Both depend only on `build-image`.
- **Each deploy job runs `actions/checkout`** — GitHub Actions jobs do not share a workspace, and the deploy steps read `prod-fleet/website-*` overlays and `k3d/website.yaml`.
- **Pin action SHAs unchanged.** Reuse the exact `@<sha>  # vN` pins already present (`actions/checkout@93cb6efe…`, `docker/login-action@c94ce9fb…`, `docker/setup-buildx-action@8d2750c6…`, `docker/build-push-action@10e90e36…`).
- **S1 line budget:** all four touched files are non-baselined AND their extensions (`.yml`, `.bats`, `.md`) are not in the S1 limits table → no per-file line gate applies. Still work net-minimal.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `.github/workflows/build-website.yml` | Modify (restructure) | 1 job `build-and-deploy` → 3 jobs `build-image`, `deploy-mentolder`, `deploy-korczewski` |
| `tests/spec/ci-cd.bats` | Modify (add tests) | New G-CD01 brand-parity assertions on the 3-job structure of `build-website.yml` |
| `tests/unit/website-ci-deploy.bats` | Modify (comment + keep assertions) | Header comment describes the 3-job split; existing `set image` / rollout-count assertions stay valid |
| `openspec/specs/ci-cd.md` | Modify (SSOT sync) | Drop dead `build-website-korczewski.yml` scenarios, update the deploy requirement to the 3-job model, add a G-CD01 brand-parity requirement |

**Decomposition rationale:** Task 1 writes the failing G-CD01 tests (rot). Task 2 makes them green by restructuring the workflow. Task 3 syncs the regression test header + SSOT spec to the new reality. Task 4 runs the full CI-equivalent gate suite and commits. Each task ends with an independently testable deliverable.

---

### Task 1: Failing G-CD01 brand-parity BATS tests

**Files:**
- Modify: `tests/spec/ci-cd.bats` (extend `setup()` + append G-CD01 block; keep existing G-CD02/G-CQ03 tests untouched)

**Interfaces:**
- Consumes: nothing (structural assertions on a file).
- Produces: BATS tests that assert `build-website.yml` defines jobs `build-image` (with `outputs.image` + `outputs.sha_tag`), `deploy-mentolder`, and `deploy-korczewski`, where each deploy job `needs: [build-image]` and neither deploy job depends on the other. These are the rot→grün gate for Task 2.

- [ ] **Step 1: Extend `setup()` to expose the workflow path**

Replace the existing `setup()` (lines 6–9) with:

```bash
setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WF="$REPO_ROOT/.github/workflows/post-merge.yml"
  BUILD_WF="$REPO_ROOT/.github/workflows/build-website.yml"
}
```

- [ ] **Step 2: Append the G-CD01 test block to the end of the file**

```bash
# --- G-CD01: Brand-Parity im Website-Deploy (T001276) ---
# build-website.yml muss korczewski in einem Job deployen, der NICHT vom
# mentolder-Deploy-Job abhängt — ein mentolder-Fehler darf korczewski nicht
# still überspringen. SSOT: openspec/specs/ci-cd.md.

@test "G-CD01: build-website.yml hat einen build-image Job mit image+sha_tag outputs" {
  run python3 - "$BUILD_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
assert 'build-image' in jobs, 'kein build-image Job'
outs = jobs['build-image'].get('outputs') or {}
assert 'image' in outs, 'build-image hat kein image output'
assert 'sha_tag' in outs, 'build-image hat kein sha_tag output'
PY
  [ "$status" -eq 0 ]
}

@test "G-CD01: deploy-mentolder needs build-image und NICHT deploy-korczewski" {
  run python3 - "$BUILD_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
assert 'deploy-mentolder' in jobs, 'kein deploy-mentolder Job'
needs = jobs['deploy-mentolder'].get('needs', [])
if isinstance(needs, str): needs = [needs]
assert 'build-image' in needs, 'deploy-mentolder muss build-image brauchen'
assert 'deploy-korczewski' not in needs, 'deploy-mentolder darf nicht von deploy-korczewski abhaengen'
PY
  [ "$status" -eq 0 ]
}

@test "G-CD01: deploy-korczewski needs build-image und NICHT deploy-mentolder" {
  run python3 - "$BUILD_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
assert 'deploy-korczewski' in jobs, 'kein deploy-korczewski Job'
needs = jobs['deploy-korczewski'].get('needs', [])
if isinstance(needs, str): needs = [needs]
assert 'build-image' in needs, 'deploy-korczewski muss build-image brauchen'
assert 'deploy-mentolder' not in needs, 'deploy-korczewski muss unabhaengig von deploy-mentolder sein'
PY
  [ "$status" -eq 0 ]
}

@test "G-CD01: beide Deploy-Jobs lesen den Image-Tag aus build-image outputs" {
  grep -q 'needs.build-image.outputs.image' "$BUILD_WF"
  grep -q 'needs.build-image.outputs.sha_tag' "$BUILD_WF"
}
```

- [ ] **Step 3: Run the new tests to verify they FAIL**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && bats tests/spec/ci-cd.bats -f 'G-CD01'`
Expected: FAIL — the current `build-website.yml` has a single `build-and-deploy` job, so `build-image` / `deploy-mentolder` / `deploy-korczewski` do not exist and the `needs.build-image.outputs.*` strings are absent. (`expected: FAIL`)

- [ ] **Step 4: Commit the failing tests**

```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
git add tests/spec/ci-cd.bats
git commit -m "test(ci): add failing G-CD01 brand-parity tests for build-website.yml [T001276]"
```

---

### Task 2: Restructure build-website.yml into three independent jobs

**Files:**
- Modify: `.github/workflows/build-website.yml` (replace the single `build-and-deploy` job with `build-image` + `deploy-mentolder` + `deploy-korczewski`)

**Interfaces:**
- Consumes: the G-CD01 tests from Task 1 (turns them green).
- Produces: `build-image.outputs.image` and `build-image.outputs.sha_tag` consumed by both deploy jobs.

- [ ] **Step 1: Replace the whole file with the 3-job structure**

Write `.github/workflows/build-website.yml` with exactly this content (the deploy run-scripts are the current ones, moved verbatim; only env wiring + job boundaries change):

```yaml
name: Build & Deploy Website

on:
  push:
    branches: [main]
    paths:
      - 'website/**'
      - '.github/workflows/build-website.yml'
  workflow_dispatch:

env:
  OPENSPEC_TELEMETRY: '0'

jobs:
  build-image:
    name: Build Website Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.compute-tags.outputs.image }}
      sha_tag: ${{ steps.compute-tags.outputs.sha_tag }}

    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5
        with:
          submodules: recursive

      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444  # v5
        with:
          node-version: '22'
          cache: 'npm'

      - uses: arduino/setup-task@b91d5d2c96a56797b48ac1e0e89220bf64044611  # v2.0.0
        with:
          version: 3.x
          repo-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Regenerate freshness artifacts before build
        run: |
          bash scripts/ci-dummy-secrets.sh
          task freshness:regenerate

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9  # v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f  # v3

      - name: Compute image + tags
        id: compute-tags
        run: |
          IMAGE="ghcr.io/paddione/website"
          SHA_TAG="sha-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
          echo "image=${IMAGE}" >> "$GITHUB_OUTPUT"
          echo "sha_tag=${SHA_TAG}" >> "$GITHUB_OUTPUT"

      # Shared, brand-neutral image: website/Dockerfile has no ARG line, so the
      # former --build-arg / env values were no-ops. Brand config (PROD_DOMAIN,
      # LEGAL_*, CONTACT_*, BRAND) is injected at runtime via each brand's
      # ConfigMap in the deploy jobs below — not baked at build time. One build
      # feeds both the mentolder and korczewski deploy jobs (T001229, T001276).
      - name: Build & push Docker image
        uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8  # v6
        with:
          context: .
          file: website/Dockerfile
          push: true
          tags: |
            ${{ steps.compute-tags.outputs.image }}:${{ steps.compute-tags.outputs.sha_tag }}
            ${{ steps.compute-tags.outputs.image }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-mentolder:
    name: Deploy Website (mentolder)
    runs-on: ubuntu-latest
    needs: [build-image]
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5

      - name: Deploy to mentolder
        env:
          KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
          IMAGE: ${{ needs.build-image.outputs.image }}
          SHA_TAG: ${{ needs.build-image.outputs.sha_tag }}
          BRAND_ID: mentolder
          PROD_DOMAIN: mentolder.de
          BRAND_NAME: Mentolder
          CONTACT_EMAIL: info@mentolder.de
          CONTACT_PHONE: "+49 151 508 32 601"
          CONTACT_CITY: "Hamburg"
          CONTACT_NAME: Gerald Korczewski
          LEGAL_STREET: "Ludwig-Erhard-Str. 18"
          LEGAL_ZIP: "20459"
          LEGAL_JOBTITLE: Coach und digitaler Begleiter
          LEGAL_UST_ID: "33/023/05100"
          LEGAL_WEBSITE: mentolder.de
          SMTP_USER: mentolder@mailbox.org
          SMTP_HOST: smtp.mailbox.org
          SMTP_PORT: "587"
          SMTP_SECURE: "false"
          SMTP_FROM: mentolder@mailbox.org
          AUTH_EXTERNAL_URL: https://auth.mentolder.de
          NEXTCLOUD_EXTERNAL_URL: https://files.mentolder.de
          DOCS_URL: https://docs.mentolder.de
          VAULT_EXTERNAL_URL: https://vault.mentolder.de
          WHITEBOARD_EXTERNAL_URL: https://files.mentolder.de/apps/files
          TRAEFIK_EXTERNAL_URL: https://traefik.mentolder.de
          MAIL_EXTERNAL_URL: https://mail.mentolder.de
          BRETT_DOMAIN: brett.mentolder.de
          LIVEKIT_DOMAIN: livekit.mentolder.de
          STREAM_DOMAIN: stream.mentolder.de
          CLUSTER_ENV: fleet-mentolder

          LLM_ENABLED: "true"
          LLM_RERANK_ENABLED: "true"
          LLM_ROUTER_URL: http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234
          LLM_EMBED_URL: http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234
          WEBSITE_IMAGE: website
          WEBSITE_NAMESPACE: website
          WORKSPACE_NAMESPACE: workspace
          SYSTEMTEST_LOOP_ENABLED: "true"
          COMFY_HOST_IP: "192.168.100.10"
          COMFY_PORT: "8189"
          RIGGER_PORT: "8190"
          POCKET_ID_FRONTEND_URL: https://auth.mentolder.de
          POCKET_ID_URL: http://pocket-id.workspace.svc.cluster.local:1411
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          rm -f /usr/local/bin/kustomize
          curl -sSL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" \
            | bash -s -- 5.4.3 /usr/local/bin
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config

          # Derived vars
          WEBSITE_HOST="web.${PROD_DOMAIN}"
          WEBSITE_SITE_URL="https://web.${PROD_DOMAIN}"
          KEYCLOAK_FRONTEND_URL="https://auth.${PROD_DOMAIN}"
          REACT_APP_ORIGIN="https://react.${PROD_DOMAIN}"
          RIGGER_HOST_IP="${COMFY_HOST_IP}"
          export WEBSITE_HOST WEBSITE_SITE_URL KEYCLOAK_FRONTEND_URL REACT_APP_ORIGIN RIGGER_HOST_IP

          # Apply full website overlay (ConfigMap + networking + Deployment with :latest).
          # The sed step adds YAML string quotes around unquoted ${VAR} placeholders so
          # server-side apply doesn't reject boolean/integer fields as wrong types.
          kustomize build prod-fleet/website-mentolder --load-restrictor=LoadRestrictionsNone \
            | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
            | envsubst '$WEBSITE_IMAGE $BRAND_ID $BRAND_NAME $CONTACT_EMAIL $CONTACT_NAME $CONTACT_PHONE $CONTACT_CITY $LEGAL_STREET $LEGAL_ZIP $LEGAL_JOBTITLE $LEGAL_UST_ID $LEGAL_WEBSITE $SMTP_FROM $SMTP_USER $SMTP_HOST $SMTP_PORT $SMTP_SECURE $WEBSITE_HOST $WEBSITE_SITE_URL $REACT_APP_ORIGIN $KEYCLOAK_FRONTEND_URL $NEXTCLOUD_EXTERNAL_URL $DOCS_URL $AUTH_EXTERNAL_URL $VAULT_EXTERNAL_URL $WHITEBOARD_EXTERNAL_URL $TRAEFIK_EXTERNAL_URL $MAIL_EXTERNAL_URL $BRETT_DOMAIN $LIVEKIT_DOMAIN $STREAM_DOMAIN $PROD_DOMAIN $CLUSTER_ENV $WEBSITE_NAMESPACE $WORKSPACE_NAMESPACE $SYSTEMTEST_LOOP_ENABLED $LLM_ENABLED $LLM_RERANK_ENABLED $LLM_ROUTER_URL $LLM_EMBED_URL $COMFY_HOST_IP $COMFY_PORT $RIGGER_HOST_IP $RIGGER_PORT $POCKET_ID_FRONTEND_URL $POCKET_ID_URL' \
            | sed -E 's/\$\$([a-zA-Z0-9_\{])/$\1/g' \
            | kubectl apply --server-side --force-conflicts -f -

          # Pin to the exact SHA-tagged image to guarantee the freshly built version rolls out.
          kubectl set image deployment/website website="${IMAGE}:${SHA_TAG}" -n website

      - name: Pre-Rollout Secret-Check
        env:
          NAMESPACE: website
        run: |
          MISSING=""
          for KEY in $(python3 -c "
          import yaml
          with open('k3d/website.yaml') as f:
              for doc in yaml.safe_load_all(f):
                  if not doc: continue
                  for c in (doc.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[]) or []):
                      for e in (c.get('env',[]) or []):
                          v = (e.get('valueFrom') or {}).get('secretKeyRef') or {}
                          if v.get('name') == 'website-secrets' and v.get('key'):
                              print(v['key'])
          "); do
            if ! kubectl get secret website-secrets -n "$NAMESPACE" \
                -o jsonpath="{.data.${KEY//_/\_}}" 2>/dev/null | grep -q .; then
              MISSING="$MISSING $KEY"
            fi
          done
          if [[ -n "$MISSING" ]]; then
            echo "::error::website-secrets in $NAMESPACE is missing required keys:$MISSING"
            echo "Fix: task env:seal ENV=mentolder && task env:deploy ENV=mentolder"
            exit 1
          fi

      - name: Wait for rollout
        env:
          NAMESPACE: website
        run: |
          kubectl rollout status deployment/website -n "$NAMESPACE" --timeout=120s

  deploy-korczewski:
    name: Deploy Website (korczewski)
    runs-on: ubuntu-latest
    needs: [build-image]
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd  # v5

      - name: Deploy to korczewski
        env:
          KUBECONFIG_DATA: ${{ secrets.FLEET_KUBECONFIG }}
          IMAGE: ${{ needs.build-image.outputs.image }}
          SHA_TAG: ${{ needs.build-image.outputs.sha_tag }}
          BRAND_ID: korczewski
          PROD_DOMAIN: korczewski.de
          BRAND_NAME: KORE
          CONTACT_EMAIL: info@korczewski.de
          CONTACT_PHONE: ${{ secrets.KORCZEWSKI_CONTACT_PHONE }}
          CONTACT_CITY: Lüneburg
          CONTACT_NAME: Patrick Korczewski
          LEGAL_STREET: ${{ secrets.KORCZEWSKI_LEGAL_STREET }}
          LEGAL_ZIP: ${{ secrets.KORCZEWSKI_LEGAL_ZIP }}
          LEGAL_JOBTITLE: Software Engineer, IT-Security-Berater
          LEGAL_UST_ID: ${{ secrets.KORCZEWSKI_LEGAL_UST_ID }}
          LEGAL_WEBSITE: korczewski.de
          SMTP_USER: korczewski@mailbox.org
          SMTP_HOST: smtp.mailbox.org
          SMTP_PORT: "587"
          SMTP_SECURE: "false"
          SMTP_FROM: korczewski@mailbox.org
          AUTH_EXTERNAL_URL: https://auth.korczewski.de
          NEXTCLOUD_EXTERNAL_URL: https://files.korczewski.de
          DOCS_URL: https://docs.korczewski.de
          VAULT_EXTERNAL_URL: https://vault.korczewski.de
          WHITEBOARD_EXTERNAL_URL: https://files.korczewski.de/apps/files
          TRAEFIK_EXTERNAL_URL: https://traefik.korczewski.de
          MAIL_EXTERNAL_URL: https://mail.korczewski.de
          BRETT_DOMAIN: brett.korczewski.de
          LIVEKIT_DOMAIN: livekit.korczewski.de
          STREAM_DOMAIN: stream.korczewski.de
          CLUSTER_ENV: korczewski
          LLM_ENABLED: "true"
          LLM_RERANK_ENABLED: "false"
          LLM_ROUTER_URL: http://llm-gateway-lmstudio.workspace-korczewski.svc.cluster.local:1234
          LLM_EMBED_URL: http://llm-gateway-lmstudio.workspace-korczewski.svc.cluster.local:1234
          WEBSITE_IMAGE: website
          WEBSITE_NAMESPACE: website-korczewski
          WORKSPACE_NAMESPACE: workspace-korczewski
          SYSTEMTEST_LOOP_ENABLED: "true"
          COMFY_HOST_IP: "10.13.14.10"
          COMFY_PORT: "8189"
          RIGGER_PORT: "8190"
          POCKET_ID_FRONTEND_URL: https://auth.korczewski.de
          POCKET_ID_URL: http://pocket-id.workspace-korczewski.svc.cluster.local:1411
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          rm -f /usr/local/bin/kustomize
          curl -sSL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" \
            | bash -s -- 5.4.3 /usr/local/bin
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config

          # Derived vars
          WEBSITE_HOST="web.${PROD_DOMAIN}"
          WEBSITE_SITE_URL="https://web.${PROD_DOMAIN}"
          KEYCLOAK_FRONTEND_URL="https://auth.${PROD_DOMAIN}"
          REACT_APP_ORIGIN="https://react.${PROD_DOMAIN}"
          RIGGER_HOST_IP="${COMFY_HOST_IP}"
          export WEBSITE_HOST WEBSITE_SITE_URL KEYCLOAK_FRONTEND_URL REACT_APP_ORIGIN RIGGER_HOST_IP

          # Apply full website overlay (ConfigMap + networking + Deployment with :latest).
          # The sed step adds YAML string quotes around unquoted ${VAR} placeholders so
          # server-side apply doesn't reject boolean/integer fields as wrong types.
          kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone \
            | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
            | envsubst '$WEBSITE_IMAGE $BRAND_ID $BRAND_NAME $CONTACT_EMAIL $CONTACT_NAME $CONTACT_PHONE $CONTACT_CITY $LEGAL_STREET $LEGAL_ZIP $LEGAL_JOBTITLE $LEGAL_UST_ID $LEGAL_WEBSITE $SMTP_FROM $SMTP_USER $SMTP_HOST $SMTP_PORT $SMTP_SECURE $WEBSITE_HOST $WEBSITE_SITE_URL $REACT_APP_ORIGIN $KEYCLOAK_FRONTEND_URL $NEXTCLOUD_EXTERNAL_URL $DOCS_URL $AUTH_EXTERNAL_URL $VAULT_EXTERNAL_URL $WHITEBOARD_EXTERNAL_URL $TRAEFIK_EXTERNAL_URL $MAIL_EXTERNAL_URL $BRETT_DOMAIN $LIVEKIT_DOMAIN $STREAM_DOMAIN $PROD_DOMAIN $CLUSTER_ENV $WEBSITE_NAMESPACE $WORKSPACE_NAMESPACE $SYSTEMTEST_LOOP_ENABLED $LLM_ENABLED $LLM_RERANK_ENABLED $LLM_ROUTER_URL $LLM_EMBED_URL $COMFY_HOST_IP $COMFY_PORT $RIGGER_HOST_IP $RIGGER_PORT $POCKET_ID_FRONTEND_URL $POCKET_ID_URL' \
            | sed -E 's/\$\$([a-zA-Z0-9_\{])/$\1/g' \
            | kubectl apply --server-side --force-conflicts -f -

          # Pin to the exact SHA-tagged image to guarantee the freshly built version rolls out.
          kubectl set image deployment/website website="${IMAGE}:${SHA_TAG}" -n website-korczewski

      - name: Pre-Rollout Secret-Check (korczewski)
        env:
          NAMESPACE: website-korczewski
        run: |
          MISSING=""
          for KEY in $(python3 -c "
          import yaml
          with open('k3d/website.yaml') as f:
              for doc in yaml.safe_load_all(f):
                  if not doc: continue
                  for c in (doc.get('spec',{}).get('template',{}).get('spec',{}).get('containers',[]) or []):
                      for e in (c.get('env',[]) or []):
                          v = (e.get('valueFrom') or {}).get('secretKeyRef') or {}
                          if v.get('name') == 'website-secrets' and v.get('key'):
                              print(v['key'])
          "); do
            if ! kubectl get secret website-secrets -n "$NAMESPACE" \
                -o jsonpath="{.data.${KEY//_/\_}}" 2>/dev/null | grep -q .; then
              MISSING="$MISSING $KEY"
            fi
          done
          if [[ -n "$MISSING" ]]; then
            echo "::error::website-secrets in $NAMESPACE is missing required keys:$MISSING"
            echo "Fix: task env:seal ENV=korczewski && task env:deploy ENV=korczewski"
            exit 1
          fi

      - name: Wait for rollout (korczewski)
        env:
          NAMESPACE: website-korczewski
        run: |
          kubectl rollout status deployment/website -n "$NAMESPACE" --timeout=120s
```

- [ ] **Step 2: Sanity-check the YAML parses and exposes the expected jobs**

Run:
```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
python3 -c "import yaml; j=yaml.safe_load(open('.github/workflows/build-website.yml'))['jobs']; print(sorted(j))"
```
Expected: `['build-image', 'deploy-korczewski', 'deploy-mentolder']`

- [ ] **Step 3: Run the G-CD01 tests to verify they now PASS**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && bats tests/spec/ci-cd.bats -f 'G-CD01'`
Expected: PASS (all four G-CD01 tests green)

- [ ] **Step 4: Run the existing regression suite to confirm no regression**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && bats tests/unit/website-ci-deploy.bats`
Expected: PASS — `kubectl set image … -n website` / `-n website-korczewski` patterns and the `rollout status deployment/website` count of 2 are preserved across the two deploy jobs.

- [ ] **Step 5: Commit the workflow refactor**

```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
git add .github/workflows/build-website.yml
git commit -m "ci(website): split build-website.yml into independent build + per-brand deploy jobs [T001276]"
```

---

### Task 3: Sync regression-test header and SSOT spec to the 3-job model

**Files:**
- Modify: `tests/unit/website-ci-deploy.bats` (header comment only)
- Modify: `openspec/specs/ci-cd.md` (deploy requirement + remove dead korczewski-workflow scenarios + add G-CD01 requirement)

**Interfaces:**
- Consumes: the job names introduced in Task 2 (`build-image`, `deploy-mentolder`, `deploy-korczewski`).
- Produces: SSOT spec that matches the live workflow so `task openspec:validate` and freshness checks stay green.

- [ ] **Step 1: Update the `website-ci-deploy.bats` header comment**

Replace the comment block at the top (lines 12–18, the `T001229 folded …` paragraph) with:

```bash
# T001229 folded the standalone korczewski workflow into build-website.yml.
# T001276 then split that consolidated workflow into THREE independent jobs:
# `build-image` (one shared ghcr.io/paddione/website build, exports image +
# sha_tag as job outputs) → `deploy-mentolder` (namespace `website`) and
# `deploy-korczewski` (namespace `website-korczewski`), which both declare
# `needs: [build-image]` and run in PARALLEL — neither depends on the other,
# so a mentolder failure no longer skips the korczewski deploy. The legacy
# build-website-korczewski.yml stays deleted. Each deploy job must still
# `set image` to the freshly-built tag and wait for rollout.
```

- [ ] **Step 2: Update the deploy Requirement text in `openspec/specs/ci-cd.md`**

Replace the `SHALL deploy …` sentence under `### Requirement: Website-CI-Deploy via kubectl set image` (line 661) with:

```markdown
The system SHALL deploy the website by repointing the Deployment to the freshly built image via `kubectl set image deployment/website website=<IMAGE>:<SHA_TAG>` in both per-brand deploy jobs of `build-website.yml`, and SHALL wait for rollout status after each set image command. The image tag SHALL be produced once by the shared `build-image` job and consumed by both deploy jobs via `needs.build-image.outputs.*`.
```

- [ ] **Step 3: Remove the dead `build-website-korczewski.yml` scenario and fix the korczewski scenarios**

In `openspec/specs/ci-cd.md`, delete the scenario block "Korczewski build-website-korczewski.yml existiert" (the four lines 668–671). Then in the two remaining korczewski scenarios change every `build-website-korczewski.yml` reference to `build-website.yml`, so the block reads:

```markdown
#### Scenario: Korczewski Deploy repoints via kubectl set image deployment/website *(BATS)*
- **GIVEN** `build-website.yml` ist vorhanden
- **WHEN** die Datei auf `kubectl set image deployment/website website=` durchsucht wird
- **THEN** enthält die Datei dieses Muster

#### Scenario: Korczewski set image verwendet SHA_TAG/IMAGE-Variable *(BATS)*
- **GIVEN** `build-website.yml` enthält `kubectl set image deployment/website`
- **WHEN** die entsprechende Zeile auf `${SHA_TAG}` oder `${IMAGE}` geprüft wird
- **THEN** enthält die Zeile eine dieser Variablen

#### Scenario: Beide Deploy-Jobs warten auf rollout status nach set image *(BATS)*
- **GIVEN** `build-website.yml` enthält die Jobs `deploy-mentolder` und `deploy-korczewski`
- **WHEN** beide Deploy-Jobs auf `kubectl rollout status deployment/website` geprüft werden
- **THEN** enthält jeder Deploy-Job dieses Muster — kein Deployment ohne Rollout-Wait
```

- [ ] **Step 4: Add the G-CD01 brand-parity Requirement**

Immediately after the `### Requirement: Website-CI-Deploy via kubectl set image` block (after its last scenario, before the following `---` separator), insert:

```markdown
### Requirement: G-CD01 Brand-Parity im Website-Deploy
<!-- bats: ci-cd.bats -->

The system SHALL deploy the korczewski brand in a CI job that is structurally independent of the mentolder deploy job, so that a mentolder deploy failure does not skip or block the korczewski deploy. `build-website.yml` SHALL define a shared `build-image` job (exporting `image` + `sha_tag` outputs) and two deploy jobs `deploy-mentolder` and `deploy-korczewski`, each with `needs: [build-image]` and neither depending on the other.

#### Scenario: build-image exportiert image + sha_tag als Job-Outputs *(BATS)*
- **GIVEN** `build-website.yml` ist vorhanden
- **WHEN** der `build-image`-Job geprüft wird
- **THEN** definiert er die Outputs `image` und `sha_tag`

#### Scenario: korczewski Deploy ist unabhängig vom mentolder Deploy *(BATS)*
- **GIVEN** `build-website.yml` definiert `deploy-mentolder` und `deploy-korczewski`
- **WHEN** die `needs:`-Felder beider Deploy-Jobs geprüft werden
- **THEN** referenziert jeder Deploy-Job `build-image`, und `deploy-korczewski` listet `deploy-mentolder` NICHT in seinem `needs:`
```

- [ ] **Step 5: Validate the spec and re-run the affected BATS files**

Run:
```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
task openspec:validate
bats tests/unit/website-ci-deploy.bats tests/spec/ci-cd.bats
```
Expected: openspec validate exits 0; both BATS files PASS.

- [ ] **Step 6: Commit the spec + comment sync**

```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
git add tests/unit/website-ci-deploy.bats openspec/specs/ci-cd.md
git commit -m "docs(spec): sync ci-cd deploy spec to 3-job build-website model, add G-CD01 [T001276]"
```

---

### Task 4: Full CI-equivalent verification + plan-lint gate

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated, if BATS additions change it)
- Modify: generated freshness artifacts as produced by the regen task

**Interfaces:**
- Consumes: all prior task changes.
- Produces: a green CI-equivalent run proving brand parity is enforced and no gate regressed.

- [ ] **Step 1: Regenerate the test inventory (tests were added/changed)**

Run:
```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
task test:inventory
git add website/src/data/test-inventory.json
```
Expected: inventory regenerated; if it changed, it is now staged.

- [ ] **Step 2: Run the targeted change tests**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && task test:changed`
Expected: PASS (vitest --changed + BATS selection + quality all green).

- [ ] **Step 3: Regenerate freshness artifacts**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && task freshness:regenerate`
Expected: generated artifacts (test-inventory, repo-index, …) refreshed.

- [ ] **Step 4: Run the CI-equivalent freshness + quality ratchet**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && task freshness:check`
Expected: PASS — S1–S4 ratchet green and the baseline key-count assertion passes (no baseline entries added).

- [ ] **Step 5: Run the plan-lint gate on this plan**

Run: `cd /tmp/wt-g-cd01-korczewski-ci-parity && bash scripts/plan-lint.sh`
Expected: exit 0 — all hard rules (F1/F2/STRUCT1/STRUCT2/STRUCT3/P1) satisfied.

- [ ] **Step 6: Commit any regenerated artifacts**

```bash
cd /tmp/wt-g-cd01-korczewski-ci-parity
git add -A
git commit -m "chore(ci): regenerate freshness artifacts for build-website 3-job split [T001276]" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage:**
  - `korczewski-deploy-parity` spec — "Both deploy jobs depend on the shared build job" / "korczewski runs independently" / "uses SHA-tagged image from build job" → Task 2 (3-job structure + outputs) + Task 1/Task 3 G-CD01 tests + spec.
  - `korczewski-deploy-parity` spec — "G-CD01 Brand-Parity BATS coverage" → Task 1 (`tests/spec/ci-cd.bats`).
  - `ci-cd` MODIFIED "Website-Auto-Deploy bei main-Push" (3 jobs, parallel rollout) → Task 2 + Task 3 spec text.
  - `ci-cd` REMOVED "build-website-korczewski.yml Deploy-Coverage" → Task 3 Step 3 (deletes dead scenario, repoints references) + Task 3 Step 1 (regression-test header).
- **Placeholder scan:** no open placeholder tokens remain in prose; all code steps carry full content. `<IMAGE>:<SHA_TAG>` appears only inside the spec/markdown code fences (allowed).
- **Type/name consistency:** Job names `build-image`, `deploy-mentolder`, `deploy-korczewski` and outputs `image`/`sha_tag` are identical across Tasks 1–3 and both spec deltas. The `needs.build-image.outputs.image|sha_tag` strings match the `outputs:` keys and the `id: compute-tags` step's `$GITHUB_OUTPUT` writes.

## Risks

- **Archive coordination:** This plan edits the live SSOT `openspec/specs/ci-cd.md` directly (as the design mandates) AND the change carries spec deltas under `openspec/changes/g-cd01-korczewski-ci-parity/specs/`. At `/opsx:archive` time the delta merge may report the change as already applied — resolve by accepting the already-present SSOT content. No additional migration needed.
- **T001182 file_lock:** `g-cd01-korczewski-secret-drift` (T001182) holds a file_lock on `build-website.yml`. This change must land AFTER T001182 merges, or be rebased onto it, to avoid clobbering the secret-drift fix.
- **Deploy-job checkout scope:** Deploy jobs use a plain `actions/checkout` (no submodules) — sufficient because `kustomize build prod-fleet/website-*` and the `k3d/website.yaml` secret-check read only in-repo, non-submodule paths. If a future overlay starts referencing the website submodule at deploy time, add `submodules: recursive` to the deploy checkouts.
