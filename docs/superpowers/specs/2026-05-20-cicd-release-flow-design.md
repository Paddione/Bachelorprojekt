# CI/CD Release Flow — Design Spec

**Date:** 2026-05-20
**Branch:** feature/cicd-release-flow
**Approach:** Ansatz A — Lücken schließen

## Problem

The repository has four CI/CD gaps that prevent a fully automated release lifecycle:

1. **No prod deploy step** in `build-website.yml` and `build-website-korczewski.yml` — images are built and pushed to GHCR but never rolled out to the clusters.
2. **No prod deploy step** in `build-brett.yml` and `build-arena-server.yml` — same gap, post-tag builds go nowhere.
3. **Website not tracked by release-please** — `brett`, `arena-server`, and `docs` get GitHub Releases and CHANGELOGs; `website` (v1.0.0 in package.json) does not.
4. **No commit-format enforcement** — release-please generates CHANGELOGs from Conventional Commits (`feat:`, `fix:`, `chore:`). Without a CI gate, malformed commits (e.g. `j`) produce silent changelog gaps.

**[HISTORICAL NOTE — 2026-06-01]** Flux has been fully removed (PRs #1282/#1286/#1287). Prod is now **push-based** via `task workspace:deploy ENV=<brand>` — there is no GitOps reconciler on fleet. The analysis below was written when Flux was still active.

~~Flux GitOps already handles manifest drift for both clusters automatically.~~ The only missing pieces are image rollouts and the release tooling gaps above.

## Target Flow

### Website (every merge to main touching `website/**`)

```
PR merge → main
  └─ build-website.yml
       ├─ build + push :latest + :sha-<date>-<sha> → ghcr.io/paddione/mentolder-website
       └─ kubectl rollout restart deployment/website -n website  [mentolder]
  └─ build-website-korczewski.yml
       ├─ build + push :latest + :sha-* → ghcr.io/paddione/korczewski-website
       └─ kubectl rollout restart deployment/website -n website-korczewski  [korczewski]
  └─ release-please.yml
       └─ opens/updates Release PR for website (bumps version, generates CHANGELOG entry)
```

When the Release PR is merged:
```
release-please PR merge → main
  └─ release-please creates tag website-vX.Y.Z + GitHub Release with CHANGELOG
  └─ build-website.yml runs again (merge commit) → another rollout (idempotent)
```

### Brett + Arena (release-gated)

```
release-please PR merge → main
  └─ tag brett-vX.Y.Z created
       └─ build-brett.yml (already triggers on brett-v* tags)
            ├─ build + push :vX.Y.Z + :latest → ghcr.io/paddione/workspace-brett
            └─ [NEW] rollout restart deployment/brett -n workspace  [mentolder]
            └─ [NEW] rollout restart deployment/brett -n workspace-korczewski  [korczewski]

  └─ tag arena-server-vX.Y.Z created
       └─ build-arena-server.yml
            ├─ build + push :vX.Y.Z + :latest
            └─ [NEW] rollout restart deployment/arena-server -n workspace-korczewski  [korczewski only]
```

### Infra / Manifests

**[HISTORICAL — Flux removed PRs #1282/#1286/#1287]** ~~No changes needed. Flux reconciles `k3d/` and `prod-*/` manifest changes automatically on every push to `main`.~~ Prod is push-based: run `task workspace:deploy ENV=<brand>` after merging to main.

### Docs

`build-docs.yml` already handles docs deploys. No changes needed.

## Implementation

### 1. Kubeconfig Secrets in GitHub Actions

Create a restricted Kubernetes ServiceAccount on each cluster with RBAC limited to `rollout restart` (i.e. `patch` on `deployments` in the relevant namespaces):

**mentolder** — namespaces: `workspace`, `website`
**korczewski** — namespaces: `workspace-korczewski`, `website-korczewski`

Store as GitHub Actions repository secrets:
- `MENTOLDER_KUBECONFIG` — base64-encoded kubeconfig for mentolder deploy-SA
- `KORCZEWSKI_KUBECONFIG` — base64-encoded kubeconfig for korczewski deploy-SA

The deploy step in each workflow:
```yaml
- name: Deploy to mentolder
  env:
    KUBECONFIG_DATA: ${{ secrets.MENTOLDER_KUBECONFIG }}
  run: |
    mkdir -p ~/.kube
    echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
    chmod 600 ~/.kube/config
    kubectl rollout restart deployment/website -n website
    kubectl rollout status deployment/website -n website --timeout=120s
```

### 2. Add website to release-please

`release-please-config.json` — add:
```json
"website": {
  "release-type": "node",
  "package-name": "website",
  "changelog-path": "CHANGELOG.md"
}
```

`.release-please-manifest.json` — add:
```json
"website": "1.0.0"
```

### 3. commitlint in CI

Add to `ci.yml` as a new job `commit-lint`:

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
    - run: npm install -g @commitlint/cli @commitlint/config-conventional
    - run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
```

Config file `commitlint.config.js` at repo root:
```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `revert`.
Breaking changes: `feat!:` or footer `BREAKING CHANGE:`.

### 4. Modify build-website.yml

After the existing `docker push` step, add:
```yaml
- name: Deploy to mentolder
  env:
    KUBECONFIG_DATA: ${{ secrets.MENTOLDER_KUBECONFIG }}
  run: |
    curl -LO "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl"
    chmod +x kubectl && sudo mv kubectl /usr/local/bin/
    mkdir -p ~/.kube
    echo "$KUBECONFIG_DATA" | base64 -d > ~/.kube/config
    chmod 600 ~/.kube/config
    kubectl rollout restart deployment/website -n website
    kubectl rollout status deployment/website -n website --timeout=120s
```

### 5. Modify build-website-korczewski.yml

Same pattern with `KORCZEWSKI_KUBECONFIG` secret, targeting `deployment/website -n website-korczewski`.

### 6. Modify build-brett.yml

After the existing `docker push` step, add deploy steps for both clusters (mentolder workspace + korczewski workspace-korczewski).

### 7. Modify build-arena-server.yml

After the existing `docker push` step, add deploy step for korczewski only (`deployment/arena-server -n workspace-korczewski`).

## RBAC Manifest (new file: `k3d/cicd-deploy-sa.yaml`)

One `cicd-deploy` ServiceAccount in the `workspace` namespace. Roles and RoleBindings are created in each namespace the SA needs to reach:

| Cluster | Namespace | Deployment |
|---------|-----------|------------|
| mentolder | `workspace` | `brett` |
| mentolder | `website` | `website` |
| korczewski | `workspace-korczewski` | `brett`, `arena-server` |
| korczewski | `website-korczewski` | `website` |

The SA lives once per cluster (`namespace: workspace` on mentolder, `namespace: workspace-korczewski` on korczewski). Additional RoleBindings in the other namespaces grant it cross-namespace rollout rights:

```yaml
# ServiceAccount (workspace namespace)
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cicd-deploy
  namespace: workspace   # workspace-korczewski on korczewski
---
# Role (repeat for each namespace in the table above)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cicd-rollout
  namespace: workspace   # swap per namespace
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "patch"]
---
# RoleBinding (repeat for each namespace)
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cicd-deploy-rollout
  namespace: workspace   # swap per namespace
subjects:
- kind: ServiceAccount
  name: cicd-deploy
  namespace: workspace   # SA home namespace
roleRef:
  kind: Role
  name: cicd-rollout
  apiGroup: rbac.authorization.k8s.io
```

Extract the long-lived token and build the kubeconfig:
```bash
TOKEN=$(kubectl create token cicd-deploy -n workspace --duration=87600h)
# Base64-encode the resulting kubeconfig and store as GH secret MENTOLDER_KUBECONFIG
```

## Files Changed

| File | Change |
|------|--------|
| `release-please-config.json` | Add `website` package |
| `.release-please-manifest.json` | Add `"website": "1.0.0"` |
| `commitlint.config.js` | New — conventional commits config |
| `.github/workflows/ci.yml` | Add `commit-lint` job |
| `.github/workflows/build-website.yml` | Add mentolder deploy step |
| `.github/workflows/build-website-korczewski.yml` | Add korczewski deploy step |
| `.github/workflows/build-brett.yml` | Add deploy steps (both clusters) |
| `.github/workflows/build-arena-server.yml` | Add korczewski deploy step |
| `k3d/cicd-deploy-sa.yaml` | New — RBAC for deploy ServiceAccounts |

## Out of Scope

- GitHub Environments with required reviewers (Ansatz B — can be added later as a phase 2)
- Flux Image Automation controller (additional complexity, not needed with this approach)
- Rollback automation (manual `kubectl rollout undo` remains the rollback mechanism)
- Monorepo root-level versioning (brett/arena/website/docs are versioned independently)

## Success Criteria

1. A PR touching `website/**` merges to main → prod website on both clusters is updated within 5 minutes, with no manual `task feature:website`.
2. A release-please PR for `brett` merges → `brett-v*` tag is created → new brett image is built and rolled out to both clusters automatically.
3. `website/CHANGELOG.md` and `brett/CHANGELOG.md` exist and reflect all `feat:` and `fix:` commits since v1.0.0.
4. A PR with a non-conventional commit message (e.g. `j`) fails the `commit-lint` CI check.
5. No SSH secrets are stored in GitHub Actions for prod deploys.
