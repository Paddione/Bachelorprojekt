---
ticket_id: T000089
title: CI/CD Release Flow Implementation Plan
domains: []
status: active
pr_number: null
---

# CI/CD Release Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four CI/CD gaps so every `website/**` merge auto-deploys to both clusters, every release-please tag auto-deploys brett/arena-server, website gets versioned releases with CHANGELOGs, and non-conventional commit messages are blocked in CI.

**Architecture:** RBAC ServiceAccounts on each cluster give GitHub Actions scoped `rollout restart` rights via kubeconfig secrets. Existing build workflows get a deploy step appended. release-please gains a fourth package (`website`). A commitlint CI job enforces Conventional Commit format on PRs.

**Tech Stack:** GitHub Actions, kubectl, Kubernetes RBAC, release-please-action v4, @commitlint/config-conventional, appleboy/ssh-action (already used in dev-auto-deploy for reference only — NOT used here; kubeconfig pattern instead).

---

## File Map

| File | Change |
|------|--------|
| `k3d/cicd-deploy-sa.yaml` | **New** — RBAC ServiceAccount + Roles + RoleBindings for both namespaces |
| `Taskfile.yml` | **Modify** — add `k3d/cicd-deploy-sa.yaml` apply to `workspace:deploy` dev+prod paths |
| `release-please-config.json` | **Modify** — add `website` package |
| `.release-please-manifest.json` | **Modify** — add `"website": "1.0.0"` |
| `commitlint.config.js` | **New** — conventional commits config |
| `.github/workflows/ci.yml` | **Modify** — add `commit-lint` job |
| `.github/workflows/build-website.yml` | **Modify** — add mentolder deploy step |
| `.github/workflows/build-website-korczewski.yml` | **Modify** — add korczewski deploy step |
| `.github/workflows/build-brett.yml` | **Modify** — add deploy steps (mentolder + korczewski) |
| `.github/workflows/build-arena-server.yml` | **Modify** — add korczewski deploy step |

---

## Task 1: RBAC manifest — `k3d/cicd-deploy-sa.yaml`

**Files:**
- Create: `k3d/cicd-deploy-sa.yaml`

Context: `${WORKSPACE_NAMESPACE}` resolves to `workspace` (mentolder) or `workspace-korczewski` (korczewski). `${WEBSITE_NAMESPACE}` resolves to `website` or `website-korczewski`. The manifest is applied separately (like `tests-retention-cronjob.yaml`) so it can span both namespaces.

- [ ] **Step 1: Create the RBAC manifest**

```yaml
# k3d/cicd-deploy-sa.yaml
# ── CI/CD deploy ServiceAccount ──────────────────────────────────────────────
# One SA per cluster (in the workspace namespace).
# RoleBindings in both workspace and website namespaces allow:
#   kubectl rollout restart deployment/<name> -n <ns>
# Applied separately from the kustomize build so cross-NS RoleBindings
# land in ${WEBSITE_NAMESPACE} rather than being forced into ${WORKSPACE_NAMESPACE}.
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cicd-deploy
  namespace: ${WORKSPACE_NAMESPACE}
---
# Role + RoleBinding in workspace namespace (brett, arena-server)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cicd-rollout
  namespace: ${WORKSPACE_NAMESPACE}
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cicd-deploy-rollout
  namespace: ${WORKSPACE_NAMESPACE}
subjects:
- kind: ServiceAccount
  name: cicd-deploy
  namespace: ${WORKSPACE_NAMESPACE}
roleRef:
  kind: Role
  name: cicd-rollout
  apiGroup: rbac.authorization.k8s.io
---
# Role + RoleBinding in website namespace (website deployment)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cicd-rollout
  namespace: ${WEBSITE_NAMESPACE}
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cicd-deploy-rollout
  namespace: ${WEBSITE_NAMESPACE}
subjects:
- kind: ServiceAccount
  name: cicd-deploy
  namespace: ${WORKSPACE_NAMESPACE}
roleRef:
  kind: Role
  name: cicd-rollout
  apiGroup: rbac.authorization.k8s.io
```

- [ ] **Step 2: Dry-run validate against mentolder**

```bash
WORKSPACE_NAMESPACE=workspace WEBSITE_NAMESPACE=website \
  envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/cicd-deploy-sa.yaml \
  | kubectl apply --dry-run=server -f - --context mentolder
```

Expected output: 5 lines, each `serverside-applied (server dry run)` — no errors.

- [ ] **Step 3: Dry-run validate against korczewski**

```bash
WORKSPACE_NAMESPACE=workspace-korczewski WEBSITE_NAMESPACE=website-korczewski \
  envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/cicd-deploy-sa.yaml \
  | kubectl apply --dry-run=server -f - --context korczewski
```

Expected: same 5 `serverside-applied` lines, no errors.

- [ ] **Step 4: Commit**

```bash
git add k3d/cicd-deploy-sa.yaml
git commit -m "feat(infra): add cicd-deploy RBAC ServiceAccount for automated rollouts"
```

---

## Task 2: Taskfile — wire RBAC apply into `workspace:deploy`

**Files:**
- Modify: `Taskfile.yml`

The RBAC manifest must be applied on every `workspace:deploy` run so it exists on fresh cluster bringups. Mirror the pattern used for `tests-retention-cronjob.yaml`.

- [ ] **Step 1: Find the two apply sites in Taskfile.yml**

```bash
grep -n "tests-retention-cronjob" Taskfile.yml
```

There are two lines — one for dev (under the `else`-free path) and one for prod. Note their line numbers.

- [ ] **Step 2: Add dev apply (after the tests-retention-cronjob line in the dev path)**

Find the line:
```
          envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/tests-retention-cronjob.yaml | kubectl apply -f -
```

Add directly after it:
```yaml
          envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/cicd-deploy-sa.yaml | kubectl apply -f -
```

- [ ] **Step 3: Add prod apply (after the prod tests-retention-cronjob apply)**

Find the prod version of the same line (within the `else` branch of the `if eq .ENV "dev"` block) and add:
```yaml
          envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/cicd-deploy-sa.yaml | kubectl apply -f -
```

- [ ] **Step 4: Validate Taskfile parses**

```bash
task --list 2>&1 | head -5
```

Expected: no YAML parse errors, task list prints normally.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "chore(infra): apply cicd-deploy RBAC on workspace:deploy"
```

---

## Task 3: Apply RBAC to both clusters and generate GitHub secrets

**Files:** none in repo — operational step only.

This task runs commands against the live clusters and stores results in GitHub. No code is committed.

- [ ] **Step 1: Apply RBAC to mentolder**

```bash
source scripts/env-resolve.sh mentolder
envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/cicd-deploy-sa.yaml \
  | kubectl apply -f - --context mentolder
```

Expected: 5 lines — `serviceaccount/cicd-deploy configured`, `role.rbac.../cicd-rollout configured` (×2), `rolebinding.rbac.../cicd-deploy-rollout configured` (×2).

- [ ] **Step 2: Apply RBAC to korczewski**

```bash
source scripts/env-resolve.sh korczewski
envsubst "\$WORKSPACE_NAMESPACE \$WEBSITE_NAMESPACE" < k3d/cicd-deploy-sa.yaml \
  | kubectl apply -f - --context korczewski
```

Expected: same 5 lines.

- [ ] **Step 3: Generate mentolder kubeconfig and store as GH secret**

```bash
# Get cluster CA and server
MENTOLDER_SERVER=$(kubectl config view --raw --context mentolder \
  -o jsonpath='{.clusters[?(@.name=="mentolder")].cluster.server}')
MENTOLDER_CA=$(kubectl config view --raw --context mentolder \
  -o jsonpath='{.clusters[?(@.name=="mentolder")].cluster.certificate-authority-data}')

# Create long-lived token (10 years — stored in GH secret, rotate annually)
MENTOLDER_TOKEN=$(kubectl create token cicd-deploy \
  -n workspace --context mentolder --duration=87600h)

# Build minimal kubeconfig
MENTOLDER_KUBECONFIG=$(cat <<EOF
apiVersion: v1
kind: Config
clusters:
- name: mentolder
  cluster:
    server: ${MENTOLDER_SERVER}
    certificate-authority-data: ${MENTOLDER_CA}
contexts:
- name: cicd@mentolder
  context:
    cluster: mentolder
    user: cicd-deploy
    namespace: workspace
current-context: cicd@mentolder
users:
- name: cicd-deploy
  user:
    token: ${MENTOLDER_TOKEN}
EOF
)

# Verify it works
echo "$MENTOLDER_KUBECONFIG" > /tmp/mentolder-cicd.kubeconfig
kubectl --kubeconfig /tmp/mentolder-cicd.kubeconfig \
  rollout restart deployment/brett -n workspace
# Expected: "deployment.apps/brett restarted"

# Store as GH secret (base64)
echo "$MENTOLDER_KUBECONFIG" | base64 -w0 \
  | gh secret set MENTOLDER_KUBECONFIG --repo Paddione/Bachelorprojekt

rm /tmp/mentolder-cicd.kubeconfig
```

- [ ] **Step 4: Generate korczewski kubeconfig and store as GH secret**

```bash
KORCZEWSKI_SERVER="https://204.168.244.104:6443"
KORCZEWSKI_CA=$(kubectl config view --raw --context korczewski \
  -o jsonpath='{.clusters[?(@.name=="korczewski")].cluster.certificate-authority-data}')

KORCZEWSKI_TOKEN=$(kubectl create token cicd-deploy \
  -n workspace-korczewski --context korczewski --duration=87600h)

KORCZEWSKI_KUBECONFIG=$(cat <<EOF
apiVersion: v1
kind: Config
clusters:
- name: korczewski
  cluster:
    server: ${KORCZEWSKI_SERVER}
    certificate-authority-data: ${KORCZEWSKI_CA}
contexts:
- name: cicd@korczewski
  context:
    cluster: korczewski
    user: cicd-deploy
    namespace: workspace-korczewski
current-context: cicd@korczewski
users:
- name: cicd-deploy
  user:
    token: ${KORCZEWSKI_TOKEN}
EOF
)

echo "$KORCZEWSKI_KUBECONFIG" > /tmp/korczewski-cicd.kubeconfig
kubectl --kubeconfig /tmp/korczewski-cicd.kubeconfig \
  rollout restart deployment/brett -n workspace-korczewski
# Expected: "deployment.apps/brett restarted"

echo "$KORCZEWSKI_KUBECONFIG" | base64 -w0 \
  | gh secret set KORCZEWSKI_KUBECONFIG --repo Paddione/Bachelorprojekt

rm /tmp/korczewski-cicd.kubeconfig
```

- [ ] **Step 5: Verify secrets are set**

```bash
gh secret list --repo Paddione/Bachelorprojekt | grep KUBECONFIG
```

Expected:
```
KORCZEWSKI_KUBECONFIG  ...
MENTOLDER_KUBECONFIG   ...
```

---

## Task 4: commitlint — enforce Conventional Commits on PRs

**Files:**
- Create: `commitlint.config.js`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Create commitlint config**

```js
// commitlint.config.js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `revert`.
Scopes are optional. Breaking changes: `feat!:` or footer `BREAKING CHANGE:`.

- [ ] **Step 2: Test commitlint locally on a good commit message**

```bash
npm install -g @commitlint/cli @commitlint/config-conventional 2>/dev/null || true
echo "feat(ci): add automated deploy steps" | npx commitlint
```

Expected: no output (exit 0 = valid).

- [ ] **Step 3: Test commitlint locally on a bad commit message**

```bash
echo "j" | npx commitlint
```

Expected: non-zero exit + error mentioning `subject may not be empty` or `type may not be empty`.

- [ ] **Step 4: Add `commit-lint` job to `.github/workflows/ci.yml`**

Open `ci.yml`. After the last `jobs:` entry (currently `arena-protocol-drift`), append:

```yaml
  commit-lint:
    name: Conventional Commits
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install commitlint
        run: npm install -g @commitlint/cli @commitlint/config-conventional
      - name: Lint commit messages
        run: |
          npx commitlint \
            --from ${{ github.event.pull_request.base.sha }} \
            --to ${{ github.event.pull_request.head.sha }} \
            --verbose
```

- [ ] **Step 5: Commit**

```bash
git add commitlint.config.js .github/workflows/ci.yml
git commit -m "feat(ci): enforce Conventional Commits via commitlint on PRs"
```

---

## Task 5: Add `website` to release-please

**Files:**
- Modify: `release-please-config.json`
- Modify: `.release-please-manifest.json`

- [ ] **Step 1: Add website package to release-please-config.json**

Replace the current content:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    "brett": {
      "release-type": "node",
      "package-name": "brett",
      "changelog-path": "CHANGELOG.md"
    },
    "arena-server": {
      "release-type": "node",
      "package-name": "arena-server",
      "changelog-path": "CHANGELOG.md"
    },
    "k3d/docs-content": {
      "release-type": "simple",
      "package-name": "docs",
      "changelog-path": "CHANGELOG.md"
    },
    "website": {
      "release-type": "node",
      "package-name": "website",
      "changelog-path": "CHANGELOG.md"
    }
  }
}
```

- [ ] **Step 2: Add website version to manifest**

Replace the current content of `.release-please-manifest.json`:

```json
{
  "brett": "0.3.0",
  "arena-server": "0.3.0",
  "k3d/docs-content": "0.2.0",
  "website": "1.0.0"
}
```

- [ ] **Step 3: Validate JSON is well-formed**

```bash
jq . release-please-config.json && echo "config OK"
jq . .release-please-manifest.json && echo "manifest OK"
```

Expected: both files pretty-print without error.

- [ ] **Step 4: Commit**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "feat(ci): add website package to release-please for versioned releases"
```

---

## Task 6: `build-website.yml` — add mentolder deploy step

**Files:**
- Modify: `.github/workflows/build-website.yml`

The existing workflow builds and pushes the image. We append a deploy step that uses `MENTOLDER_KUBECONFIG` (set in Task 3) to restart the website deployment.

- [ ] **Step 1: Add deploy step after the docker push step**

In `.github/workflows/build-website.yml`, after the `Build & push Docker image` step (which ends with `echo "SHA_TAG=..."`), append:

```yaml
      - name: Deploy to mentolder
        env:
          KUBECONFIG_DATA: ${{ secrets.MENTOLDER_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config
          kubectl rollout restart deployment/website -n website
          kubectl rollout status deployment/website -n website --timeout=120s
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/build-website.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-website.yml
git commit -m "feat(ci): auto-deploy website to mentolder after image push"
```

---

## Task 7: `build-website-korczewski.yml` — add korczewski deploy step

**Files:**
- Modify: `.github/workflows/build-website-korczewski.yml`

Same pattern as Task 6 but targets the korczewski cluster.

- [ ] **Step 1: Add deploy step after the docker push step**

In `.github/workflows/build-website-korczewski.yml`, after the `Build & push Docker image` step, append:

```yaml
      - name: Deploy to korczewski
        env:
          KUBECONFIG_DATA: ${{ secrets.KORCZEWSKI_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config
          kubectl rollout restart deployment/website -n website-korczewski
          kubectl rollout status deployment/website -n website-korczewski --timeout=120s
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/build-website-korczewski.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-website-korczewski.yml
git commit -m "feat(ci): auto-deploy website to korczewski after image push"
```

---

## Task 8: `build-brett.yml` — add deploy steps for both clusters

**Files:**
- Modify: `.github/workflows/build-brett.yml`

Brett runs in `workspace` (mentolder) and `workspace-korczewski` (korczewski). Deploy to mentolder first, then korczewski.

- [ ] **Step 1: Add two deploy steps after the docker push step**

In `.github/workflows/build-brett.yml`, after the `Build & push Docker image` step, append:

```yaml
      - name: Deploy to mentolder
        env:
          KUBECONFIG_DATA: ${{ secrets.MENTOLDER_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config
          kubectl rollout restart deployment/brett -n workspace
          kubectl rollout status deployment/brett -n workspace --timeout=120s

      - name: Deploy to korczewski
        env:
          KUBECONFIG_DATA: ${{ secrets.KORCZEWSKI_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config
          kubectl rollout restart deployment/brett -n workspace-korczewski
          kubectl rollout status deployment/brett -n workspace-korczewski --timeout=120s
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/build-brett.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-brett.yml
git commit -m "feat(ci): auto-deploy brett to both clusters after release tag build"
```

---

## Task 9: `build-arena-server.yml` — add korczewski deploy step

**Files:**
- Modify: `.github/workflows/build-arena-server.yml`

Arena-server runs on korczewski only (`workspace-korczewski` namespace).

- [ ] **Step 1: Add deploy step after the docker push step**

In `.github/workflows/build-arena-server.yml`, after the `Build & push Docker image` step, append:

```yaml
      - name: Deploy to korczewski
        env:
          KUBECONFIG_DATA: ${{ secrets.KORCZEWSKI_KUBECONFIG }}
        run: |
          curl -sSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" \
            -o /usr/local/bin/kubectl && chmod +x /usr/local/bin/kubectl
          mkdir -p ~/.kube
          echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
          chmod 600 ~/.kube/config
          kubectl rollout restart deployment/arena-server -n workspace-korczewski
          kubectl rollout status deployment/arena-server -n workspace-korczewski --timeout=120s
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/build-arena-server.yml'))" && echo "YAML OK"
```

Expected: `YAML OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-arena-server.yml
git commit -m "feat(ci): auto-deploy arena-server to korczewski after release tag build"
```

---

## Task 10: Final validation + PR

- [ ] **Step 1: Run offline CI checks locally**

```bash
task test:all
```

Expected: all BATS tests pass, manifest validation passes. (commitlint is PR-only so it won't run here.)

- [ ] **Step 2: Validate all modified workflow YAMLs at once**

```bash
for f in .github/workflows/build-website.yml \
          .github/workflows/build-website-korczewski.yml \
          .github/workflows/build-brett.yml \
          .github/workflows/build-arena-server.yml \
          .github/workflows/ci.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "OK: $f" || echo "FAIL: $f"
done
```

Expected: 5 lines of `OK: ...`

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feature/cicd-release-flow
gh pr create \
  --title "feat(ci): automated prod deploy + versioned releases + commitlint" \
  --body "$(cat <<'EOF'
## Summary
- Website merges to main now auto-deploy to both clusters via kubeconfig GH secrets
- Brett and arena-server release tags trigger auto-deploy after image build
- Website added to release-please — gets CHANGELOG + GitHub Release on version bumps
- commitlint CI job blocks non-conventional commit messages on PRs

## Manual prerequisites (must be done before merging)
- [ ] Task 3 completed: RBAC applied to both clusters, MENTOLDER_KUBECONFIG + KORCZEWSKI_KUBECONFIG secrets set in GitHub

## Test plan
- [ ] Merge a small `website/**` change → confirm CI runs deploy step → check `web.mentolder.de` is updated
- [ ] Confirm release-please creates a `website` Release PR on next merge with `feat:` or `fix:` commit
- [ ] Open a test PR with commit message `j` → confirm `commit-lint` job fails
- [ ] Open a test PR with commit message `feat(test): valid message` → confirm `commit-lint` job passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge PR**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ No prod deploy in build-website.yml → Tasks 6–7
- ✅ No prod deploy in build-brett.yml / build-arena-server.yml → Tasks 8–9
- ✅ Website not in release-please → Task 5
- ✅ No commitlint enforcement → Task 4
- ✅ RBAC manifest → Task 1
- ✅ Taskfile integration → Task 2
- ✅ Operational kubeconfig setup → Task 3

**Potential footgun:** Task 3 is the only manual / non-automated step. The PR in Task 10 should NOT be merged until Task 3 is complete — otherwise the deploy steps will fail with `MENTOLDER_KUBECONFIG: not found`. The PR template checklist covers this.
