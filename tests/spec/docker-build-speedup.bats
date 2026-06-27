#!/usr/bin/env bats
# tests/spec/docker-build-speedup.bats
# SSOT: openspec/changes/docker-build-speedup/specs/docker-build-speedup.md
# Invarianten der Docker-Build-Beschleunigung (T001229), je Phase ein Block.

# ── Phase 1: Layer-Caching ──────────────────────────────────────────────────
@test "P1: website Dockerfile hat # syntax + npm-Cache-Mount" {
  head -1 website/Dockerfile | grep -q 'syntax=docker/dockerfile:1'
  grep -q 'mount=type=cache,target=/root/.npm npm ci' website/Dockerfile
}

@test "P1: kein --no-cache in den umgestellten Build-Workflows" {
  ! grep -rq -- '--no-cache' .github/workflows/build-website.yml
  ! grep -rq -- '--no-cache' .github/workflows/build-videovault.yml
}

@test "P1: website-Workflow nutzt build-push-action + gha-Cache (mode=max)" {
  grep -q 'docker/build-push-action' .github/workflows/build-website.yml
  grep -q 'cache-to: type=gha,mode=max' .github/workflows/build-website.yml
}

@test "P1: videovault-Workflow nutzt gha-Cache (mode=max)" {
  grep -q 'cache-to: type=gha,mode=max' .github/workflows/build-videovault.yml
}

@test "P1: transcriber pip-Layer hat Cache-Mount und kein --no-cache-dir" {
  grep -q 'mount=type=cache,target=/root/.cache/pip' k3d/talk-transcriber/Dockerfile
  ! grep -q 'no-cache-dir' k3d/talk-transcriber/Dockerfile
}

@test "P1: mentolder-web Dockerfile hat pnpm-Store-Cache-Mount" {
  grep -q 'mount=type=cache,target=/root/.local/share/pnpm/store' mentolder-web/Dockerfile
}

# ── Phase 2: Website slim + Konsolidierung ─────────────────────────────────
@test "P2: website Dockerfile pruned devDependencies" {
  grep -q 'npm prune --omit=dev' website/Dockerfile
}

@test "P2: website-Build-Workflow pusht das geteilte Image" {
  grep -q 'ghcr.io/paddione/website' .github/workflows/build-website.yml
}

@test "P2: korczewski-Website-Workflow ist entfernt" {
  [ ! -f .github/workflows/build-website-korczewski.yml ]
}

@test "P2: alle prod/dev env-Dateien zeigen WEBSITE_IMAGE auf den geteilten Namen" {
  for f in mentolder korczewski fleet-mentolder fleet-korczewski staging dev; do
    grep -qE '^\s*WEBSITE_IMAGE:\s*website\s*$' "environments/$f.yaml"
  done
}

@test "P2: kein per-Brand-Website-Image-Name mehr in Workflows/Manifesten" {
  ! grep -rqE 'paddione/(mentolder|korczewski)-website' \
      .github/workflows environments
}

# ── Phase 3: amd64-only ────────────────────────────────────────────────────
@test "P3: transcriber baut amd64-only ohne QEMU" {
  grep -qE '^\s*platforms:\s*linux/amd64\s*$' .github/workflows/build-transcriber.yml
  ! grep -q 'linux/arm64' .github/workflows/build-transcriber.yml
  ! grep -q 'setup-qemu-action' .github/workflows/build-transcriber.yml
}

@test "P3: collabora baut amd64-only ohne QEMU" {
  grep -qE '^\s*platforms:\s*linux/amd64\s*$' .github/workflows/build-collabora.yml
  ! grep -q 'linux/arm64' .github/workflows/build-collabora.yml
  ! grep -q 'setup-qemu-action' .github/workflows/build-collabora.yml
}
