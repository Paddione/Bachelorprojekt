# Package Versioning — Design Spec

**Date:** 2026-05-20
**Branch:** feature/package-versioning
**Status:** approved

---

## Goal

Introduce explicit, auditable version management across all three dependency layers in the monorepo, and give brett, arena-server, and docs proper SemVer release pipelines backed by Flux ImagePolicy.

Two complementary halves:
- **Inbound**: pin and consciously update third-party dependencies (k8s images, npm packages, GitHub Actions)
- **Outbound**: SemVer releases for brett, arena-server, docs — tagged Docker images, CHANGELOG.md, Flux auto-deploy

---

## Approach

**release-please** (outbound) + **Renovate** (inbound).

release-please creates Release PRs from Conventional Commits; you merge when ready. On merge, CI builds a semver-tagged Docker image. Flux ImagePolicy tracks semver tags and auto-deploys. Renovate opens weekly grouped PRs for third-party dependency updates across npm, k8s YAML, and GitHub Actions.

---

## Outbound: release-please

### Config files

```
release-please-config.json           ← package declarations
.release-please-manifest.json        ← auto-maintained current versions (start: 1.0.0)
.github/workflows/release-please.yml ← GitHub Action
```

### release-please-config.json

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

### .release-please-manifest.json (initial)

```json
{
  "brett": "0.1.0",
  "arena-server": "0.1.0",
  "k3d/docs-content": "0.1.0"
}
```

Starting at existing `package.json` versions (`0.1.0` for brett and arena-server). docs-content has no `package.json`; release-please `simple` type uses a `VERSION` file seeded at `0.1.0`.

### release-please.yml workflow

Triggers on every push to `main`. Uses `googleapis/release-please-action@v4`. On merge of a Release PR, release-please creates:
- git tag `brett-v1.2.3`
- GitHub Release with CHANGELOG entries as release notes

### Release PR lifecycle

1. Merge a commit with `feat(brett):` or `fix(brett):` to `main`
2. release-please opens/updates PR: `"chore(release): brett 1.x.y"` — pre-written `CHANGELOG.md` + bumped `version` in `brett/package.json`
3. You merge when ready to ship
4. Git tag `brett-v1.x.y` created → triggers build workflow

---

## Outbound: Build workflows on semver tags

Three new GitHub Actions workflows:

| Workflow | Trigger tag | Image |
|---|---|---|
| `.github/workflows/build-brett.yml` | `brett-v*` | `ghcr.io/paddione/workspace-brett` |
| `.github/workflows/build-arena-server.yml` | `arena-server-v*` | `ghcr.io/paddione/arena-server` |
| `.github/workflows/build-docs.yml` | `docs-v*` | `ghcr.io/paddione/workspace-docs` |

Each workflow:
1. Extracts version from tag (`brett-v1.2.3` → `1.2.3`)
2. Builds Docker image
3. Pushes **both** `:v1.2.3` and `:latest` to GHCR

Keeping `:latest` in parallel means `task feature:brett` continues working without callers needing to know the current version. Flux tracks `:v*` semver tags; human deploys still use `:latest`.

Build steps follow the pattern of existing `build-website.yml` (checkout → buildx → ghcr login → build-push-action with two tags).

---

## Outbound: Flux ImagePolicy migration

### Brett and docs (existing → updated)

Currently tracking `^sha-[0-9]{8}-[0-9]{6}-[a-f0-9]+` alphabetically.

After migration (`flux/images/brett.yaml`, `flux/images/docs.yaml`):

```yaml
spec:
  filterTags:
    pattern: '^v[0-9]+\.[0-9]+\.[0-9]+$'
  policy:
    semver:
      range: '>=1.0.0'
```

The `$imagepolicy` annotation comments in `k3d/brett.yaml` and `k3d/docs.yaml` are unchanged — the existing `ImageUpdateAutomation` already writes to those files.

### Arena-server (Phase 2 — Flux auto-deploy deferred)

Arena's deployment differs from brett/docs: `prod-korczewski/arena.yaml` uses `envsubst ${ARENA_IMAGE}` at deploy time via Taskfile, not a static image field with a `$imagepolicy` annotation. Flux's image-update-automation cannot annotate envsubst placeholders.

**In this feature:** arena gets the release pipeline (release-please + tagged Docker image) but Flux auto-deploy is deferred. Deploying a specific release means:
```bash
ARENA_IMAGE=ghcr.io/paddione/arena-server:v1.2.3 task arena:deploy ENV=korczewski
```

**Phase 2 (separate feature):** refactor `prod-korczewski/arena.yaml` to use a static image reference with a `$imagepolicy` annotation, add `flux/images/arena-server.yaml` + `flux/apps/arena-server/`, and extend ImageUpdateAutomation to scan `./prod-korczewski`.

---

## Inbound: Renovate

### Installation

One-time: install Renovate GitHub App from GitHub Marketplace. No credentials beyond repo read/write.

### renovate.json (root)

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
    "fileMatch": ["^k3d/.+\\.yaml$", "^prod/.+\\.yaml$", "^prod-mentolder/.+\\.yaml$", "^prod-korczewski/.+\\.yaml$"]
  }
}
```

### Coverage

| Layer | Manager | Scope |
|---|---|---|
| npm packages | `npm` | `website/`, `brett/`, `arena-server/`, `scripts/` root |
| k8s images | `kubernetes` | `k3d/*.yaml`, `prod/`, `prod-mentolder/`, `prod-korczewski/` |
| GitHub Actions | `github-actions` | `.github/workflows/*.yml` |
| Own images | disabled | `ghcr.io/paddione/*` excluded — handled by Flux + release-please |

Lines containing `$imagepolicy` are skipped automatically (Renovate ignores lines it didn't set).

---

## Developer workflow

### Releasing a new version

```
1. Write commits: feat(brett): add gravity slider
2. Merge to main
3. release-please opens Release PR: "chore(release): brett 1.3.0"
4. Review CHANGELOG in PR, merge when ready to ship
5. CI builds workspace-brett:v1.3.0 + :latest
6. Flux picks up v1.3.0 within 5 min → commits tag to k3d/brett.yaml → deploys
7. GitHub Release page created with changelog
```

### Handling Renovate update

```
1. Monday: Renovate opens "chore(deps): update livekit 1.11.0 → 1.12.0"
2. Review diff (one image tag change in k3d/livekit*.yaml)
3. CI green → merge
4. task feature:deploy  ← applies k8s change to both clusters
```

### What does NOT change

- `task feature:brett`, `task feature:deploy`, `task feature:arena` — all unchanged
- Conventional Commits discipline already in place feeds release-please for free
- No new CLI tools required locally

---

## Files changed / created

### New files
- `release-please-config.json`
- `.release-please-manifest.json`
- `.github/workflows/release-please.yml`
- `.github/workflows/build-brett.yml`
- `.github/workflows/build-arena-server.yml`
- `.github/workflows/build-docs.yml`
- `renovate.json`
- `brett/CHANGELOG.md` (empty initial)
- `arena-server/CHANGELOG.md` (empty initial)
- `k3d/docs-content/CHANGELOG.md` (empty initial)

### Modified files
- `flux/images/brett.yaml` — policy filter: sha-* → semver
- `flux/images/docs.yaml` — policy filter: sha-* → semver
- `brett/package.json` — `version` already `0.1.0`, no change needed
- `arena-server/package.json` — `version` already `0.1.0`, no change needed

### New seed files
- `k3d/docs-content/VERSION` — seeded `0.1.0` (release-please simple type requires this file)

---

## Out of scope

- Helm chart versioning (no Helm charts in this repo — k8s manifests are plain kustomize)
- website versioning (website uses sha-timestamp via existing Flux automation, no change)
- Automating `task feature:deploy` on Renovate merges (manual deploy remains intentional)
