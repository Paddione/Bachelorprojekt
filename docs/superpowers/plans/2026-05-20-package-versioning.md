---
title: Package Versioning Implementation Plan
domains: []
status: active
pr_number: null
---

# Package Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire release-please + semver-tagged Docker builds for brett/arena-server/docs, migrate Flux ImagePolicy from sha-timestamp to semver, and add Renovate for inbound dependency management.

**Architecture:** release-please scans Conventional Commits on every `main` push and opens Release PRs per package; on merge, CI tags the commit and builds versioned images. Flux ImagePolicy switches from alphabetical sha-* matching to semver range tracking. Renovate monitors npm, k8s YAML, and GitHub Actions on a weekly schedule.

**Tech Stack:** googleapis/release-please-action@v4, GitHub Actions, Flux image.toolkit.fluxcd.io/v1beta2, Renovate GitHub App, Docker buildx, GHCR (ghcr.io/paddione)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `release-please-config.json` | Create | Declares brett/arena-server/docs-content packages |
| `.release-please-manifest.json` | Create | Tracks current versions (seed: 0.1.0) |
| `.github/workflows/release-please.yml` | Create | Creates Release PRs + tags on main push |
| `.github/workflows/build-brett.yml` | Create | Builds workspace-brett:vX.Y.Z on `brett-v*` tag |
| `.github/workflows/build-arena-server.yml` | Create | Builds arena-server:vX.Y.Z on `arena-server-v*` tag |
| `.github/workflows/build-docs.yml` | Create | Runs build-docs.js then builds workspace-docs:vX.Y.Z on `docs-v*` tag |
| `brett/CHANGELOG.md` | Create | Initial empty changelog (release-please appends to it) |
| `arena-server/CHANGELOG.md` | Create | Initial empty changelog |
| `k3d/docs-content/CHANGELOG.md` | Create | Initial empty changelog |
| `k3d/docs-content/VERSION` | Create | Seed file: `0.1.0` (required by release-please simple type) |
| `flux/images/brett.yaml` | Modify | Switch filterTags + policy from sha-* alphabetical → semver |
| `flux/images/docs.yaml` | Modify | Switch filterTags + policy from sha-* alphabetical → semver |
| `renovate.json` | Create | Inbound dependency management config |

---

## Task 1: release-please config and workflow

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`

- [ ] **Step 1: Create release-please-config.json**

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
    }
  }
}
```

Save to `/release-please-config.json` at repo root.

- [ ] **Step 2: Create .release-please-manifest.json**

```json
{
  "brett": "0.1.0",
  "arena-server": "0.1.0",
  "k3d/docs-content": "0.1.0"
}
```

Save to `/.release-please-manifest.json` at repo root.

These versions match the existing `version` field in `brett/package.json` and `arena-server/package.json` (both `0.1.0`). docs-content has no package.json — `simple` release type uses `VERSION` file created in Task 2.

- [ ] **Step 3: Create .github/workflows/release-please.yml**

```yaml
name: Release Please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 4: Verify config files are valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8')); console.log('config OK')"
node -e "JSON.parse(require('fs').readFileSync('.release-please-manifest.json','utf8')); console.log('manifest OK')"
```

Expected:
```
config OK
manifest OK
```

- [ ] **Step 5: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release-please.yml
git commit -m "feat(release): add release-please config and workflow"
```

---

## Task 2: CHANGELOG seed files + docs VERSION

**Files:**
- Create: `brett/CHANGELOG.md`
- Create: `arena-server/CHANGELOG.md`
- Create: `k3d/docs-content/CHANGELOG.md`
- Create: `k3d/docs-content/VERSION`

release-please requires CHANGELOG.md to already exist (it appends to it, not creates it). The `simple` release type also requires a `VERSION` file to track the current version for non-node packages.

- [ ] **Step 1: Create brett/CHANGELOG.md**

```markdown
# Changelog

All notable changes to brett will be documented in this file.
```

- [ ] **Step 2: Create arena-server/CHANGELOG.md**

```markdown
# Changelog

All notable changes to arena-server will be documented in this file.
```

- [ ] **Step 3: Create k3d/docs-content/CHANGELOG.md**

```markdown
# Changelog

All notable changes to docs will be documented in this file.
```

- [ ] **Step 4: Create k3d/docs-content/VERSION**

```
0.1.0
```

Plain text file, no newline trailing issues — just the version string. release-please reads and writes this file for the `simple` release type.

- [ ] **Step 5: Commit**

```bash
git add brett/CHANGELOG.md arena-server/CHANGELOG.md k3d/docs-content/CHANGELOG.md k3d/docs-content/VERSION
git commit -m "chore(release): seed CHANGELOG files and docs VERSION"
```

---

## Task 3: Build workflow for brett

**Files:**
- Create: `.github/workflows/build-brett.yml`

Triggers on tag `brett-v*` (format release-please uses for this package). Builds `ghcr.io/paddione/workspace-brett` with both `:vX.Y.Z` and `:latest` tags.

Brett uses a plain Node 22 Dockerfile (`brett/Dockerfile`): copies `package.json`, runs `npm ci --omit=dev`, copies `server.js`. No build args needed.

- [ ] **Step 1: Create .github/workflows/build-brett.yml**

```yaml
name: Build Brett

on:
  push:
    tags: ['brett-v*']

jobs:
  build:
    name: Build & push Brett image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v5

      - name: Extract version from tag
        id: version
        run: |
          TAG="${GITHUB_REF_NAME}"           # brett-v1.2.3
          VERSION="${TAG#brett-v}"           # 1.2.3
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push Docker image
        run: |
          IMAGE="ghcr.io/paddione/workspace-brett"
          VERSION="${{ steps.version.outputs.version }}"
          docker build \
            -t "${IMAGE}:v${VERSION}" \
            -t "${IMAGE}:latest" \
            -f brett/Dockerfile \
            .
          docker push "${IMAGE}:v${VERSION}"
          docker push "${IMAGE}:latest"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-brett.yml
git commit -m "feat(ci): add brett semver tag build workflow"
```

---

## Task 4: Build workflow for arena-server

**Files:**
- Create: `.github/workflows/build-arena-server.yml`

Arena-server uses pnpm@9.15.3, multi-stage Dockerfile (`arena-server/Dockerfile`). No build args needed.

- [ ] **Step 1: Create .github/workflows/build-arena-server.yml**

```yaml
name: Build Arena Server

on:
  push:
    tags: ['arena-server-v*']

jobs:
  build:
    name: Build & push arena-server image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v5

      - name: Extract version from tag
        id: version
        run: |
          TAG="${GITHUB_REF_NAME}"               # arena-server-v1.2.3
          VERSION="${TAG#arena-server-v}"        # 1.2.3
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push Docker image
        run: |
          IMAGE="ghcr.io/paddione/arena-server"
          VERSION="${{ steps.version.outputs.version }}"
          docker build \
            -t "${IMAGE}:v${VERSION}" \
            -t "${IMAGE}:latest" \
            -f arena-server/Dockerfile \
            .
          docker push "${IMAGE}:v${VERSION}"
          docker push "${IMAGE}:latest"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-arena-server.yml
git commit -m "feat(ci): add arena-server semver tag build workflow"
```

---

## Task 5: Build workflow for docs

**Files:**
- Create: `.github/workflows/build-docs.yml`

Docs is a two-step build: `node scripts/build-docs.js` compiles markdown from `k3d/docs-content/` into `k3d/docs-content-built/`, then `docker build -f scripts/docs.Dockerfile` packs the built output into a static-web-server image. The workflow must run Node first.

- [ ] **Step 1: Create .github/workflows/build-docs.yml**

```yaml
name: Build Docs

on:
  push:
    tags: ['docs-v*']

jobs:
  build:
    name: Build & push docs image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v5

      - name: Extract version from tag
        id: version
        run: |
          TAG="${GITHUB_REF_NAME}"       # docs-v1.2.3
          VERSION="${TAG#docs-v}"        # 1.2.3
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install root deps and build docs
        run: |
          npm install
          node scripts/build-docs.js

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push Docker image
        run: |
          IMAGE="ghcr.io/paddione/workspace-docs"
          VERSION="${{ steps.version.outputs.version }}"
          docker build \
            -t "${IMAGE}:v${VERSION}" \
            -t "${IMAGE}:latest" \
            -f scripts/docs.Dockerfile \
            .
          docker push "${IMAGE}:v${VERSION}"
          docker push "${IMAGE}:latest"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-docs.yml
git commit -m "feat(ci): add docs semver tag build workflow"
```

---

## Task 6: Flux ImagePolicy migration — brett and docs

**Files:**
- Modify: `flux/images/brett.yaml`
- Modify: `flux/images/docs.yaml`

Swap the `filterTags` pattern and `policy` block from sha-timestamp alphabetical matching to semver range. Note: range must be `>=0.1.0` (not `>=1.0.0`) because the first releases will be `0.2.0`, `0.3.0` etc.

The `$imagepolicy` annotations in `k3d/brett.yaml:44` and `k3d/docs.yaml:21` remain unchanged — Flux writes to those lines automatically.

- [ ] **Step 1: Update flux/images/brett.yaml**

Replace the full file content:

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
    pattern: '^v[0-9]+\.[0-9]+\.[0-9]+$'
  policy:
    semver:
      range: '>=0.1.0'
```

- [ ] **Step 2: Update flux/images/docs.yaml**

Replace the full file content:

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
    pattern: '^v[0-9]+\.[0-9]+\.[0-9]+$'
  policy:
    semver:
      range: '>=0.1.0'
```

- [ ] **Step 3: Run manifest validation**

```bash
task test:all
```

Expected: all tests pass (Flux YAML lives outside `k3d/` kustomize base so it doesn't affect kustomize validation, but task test:all covers BATS unit tests and dry-run).

- [ ] **Step 4: Commit**

```bash
git add flux/images/brett.yaml flux/images/docs.yaml
git commit -m "feat(flux): migrate brett and docs ImagePolicy to semver tracking"
```

---

## Task 7: Renovate config

**Files:**
- Create: `renovate.json`

- [ ] **Step 1: Create renovate.json**

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "schedule": ["before 9am on Monday"],
  "minimumReleaseAge": "3 days",
  "packageRules": [
    {
      "matchManagers": ["npm"],
      "matchUpdateTypes": ["minor", "patch"],
      "groupName": "npm minor/patch ({{packageFileDir}})",
      "automerge": true
    },
    {
      "matchManagers": ["npm"],
      "matchUpdateTypes": ["major"],
      "groupName": "npm major updates",
      "automerge": false
    },
    {
      "matchManagers": ["kubernetes"],
      "matchPackagePatterns": ["^livekit/"],
      "groupName": "livekit images"
    },
    {
      "matchManagers": ["kubernetes"],
      "matchPackagePatterns": ["^nextcloud", "^ghcr.io/nextcloud"],
      "groupName": "nextcloud images"
    },
    {
      "matchManagers": ["kubernetes"],
      "matchPackagePatterns": ["^quay.io/keycloak"],
      "groupName": "keycloak images"
    },
    {
      "matchManagers": ["kubernetes"],
      "matchUpdateTypes": ["major"],
      "automerge": false
    },
    {
      "matchManagers": ["github-actions"],
      "groupName": "GitHub Actions digest pins",
      "pinDigests": true
    },
    {
      "matchPackagePatterns": ["^ghcr.io/paddione/"],
      "enabled": false
    }
  ],
  "kubernetes": {
    "fileMatch": [
      "^k3d/.+\\.yaml$",
      "^prod/.+\\.yaml$",
      "^prod-mentolder/.+\\.yaml$",
      "^prod-korczewski/.+\\.yaml$"
    ]
  }
}
```

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('renovate.json','utf8')); console.log('renovate.json OK')"
```

Expected: `renovate.json OK`

- [ ] **Step 3: Commit**

```bash
git add renovate.json
git commit -m "feat(deps): add Renovate config for inbound dependency management"
```

- [ ] **Step 4: Install Renovate GitHub App (manual — human action)**

This step cannot be automated:

1. Go to: https://github.com/apps/renovate
2. Click **Install**
3. Select repository: `Paddione/Bachelorprojekt`
4. Grant read + write access to contents and pull requests
5. After install, Renovate will open a "Dependency Dashboard" issue and an onboarding PR within ~30 minutes

No secrets, tokens, or credentials needed — Renovate authenticates as the GitHub App.

---

## Task 8: Open feature PR

- [ ] **Step 1: Run full test suite**

```bash
task test:all
```

Expected: all BATS unit tests and manifest dry-run pass.

- [ ] **Step 2: Push branch and open PR**

```bash
git push -u origin feature/package-versioning
gh pr create \
  --title "feat(release): package versioning — release-please + Renovate + Flux semver" \
  --body "$(cat <<'EOF'
## Summary
- Adds release-please for brett, arena-server, and docs — Conventional Commits drive Release PRs; merge to ship
- Adds semver-tagged Docker build workflows triggered on `brett-v*`, `arena-server-v*`, `docs-v*` tags
- Migrates brett + docs Flux ImagePolicy from sha-timestamp to semver `>=0.1.0`
- Adds Renovate config for weekly npm, k8s image, and GitHub Actions update PRs

## Manual step after merge
Install Renovate GitHub App at https://github.com/apps/renovate for repo Paddione/Bachelorprojekt.

## Test plan
- [ ] `task test:all` passes
- [ ] release-please workflow runs on push to main (check Actions tab)
- [ ] After first `feat(brett):` commit merges: Release PR opens for brett
- [ ] After Release PR merge: `brett-v0.2.0` tag created, build-brett workflow runs
- [ ] Flux ImagePolicy for brett reflects new semver filter (check `kubectl get imagepolicy brett -n flux-system -o yaml`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge PR**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull --rebase origin main
```

---

## Post-merge verification

After merging, confirm the release-please workflow is wired:

```bash
# Check the workflow ran on the merge commit
gh run list --workflow=release-please.yml --limit=3
```

Expected: a run with status `completed` / `success` for the merge commit.

To trigger the first actual Release PR, make any `feat(brett):` or `fix(brett):` commit to main. release-please will open a PR titled `"chore(release): brett 0.2.0"` within a few minutes of the CI run completing.
