---
title: "Pin unpinned :latest images"
ticket_id: "T001790"
domains: [infra]
status: proposed
---

# unpinned-latest-images — Maintenance: Document intentional :latest usage

## Purpose

A maintenance scan on 2026-07-10 found `:latest` image tags across `k3d/` manifests. This change documents the findings and ensures every `:latest` usage has an explicit inline comment explaining why it is intentional — improving clarity for future maintainers and automated audits.

## Findings

### External images — already pinned ✅
All third-party images use pinned version + digest:
- `vaultwarden/server:1.35.3-alpine@sha256:...`
- `busybox:1.38.0@sha256:...`
- `nats:2.10-alpine@sha256:...`
- `postgres:16-alpine@sha256:...`
- `bitnami/sealed-secrets-controller:0.27.3@sha256:...`
- `axllent/mailpit:v1.29@sha256:...`

### Project-internal images — intentionally :latest ✅
Per AGENTS.md (`Critical Footguns`): *Website, Brett, Docs, Brain, Studio, and Talk-Transcriber images use `:latest` intentionally* — CI warns, do not "fix" to digests.

| Image | File | Has explicit comment? |
|-------|------|----------------------|
| `ghcr.io/paddione/${WEBSITE_IMAGE}:latest` | k3d/website.yaml | ✅ yes (line 181) |
| `ghcr.io/paddione/workspace-brett:latest` | k3d/brett.yaml | ❌ **missing** |
| `ghcr.io/paddione/workspace-docs:latest` | k3d/docs.yaml | ❌ **missing** |
| `ghcr.io/paddione/brain-site:latest` | k3d/brain.yaml | ✅ yes (line 2) |
| `ghcr.io/paddione/videovault:latest` | k3d/videovault.yaml | ✅ yes (line 33) |
| `ghcr.io/paddione/mediaviewer-widget:latest` | k3d/mediaviewer-widget.yaml | ✅ yes (line 29) |
| `ghcr.io/paddione/downloads-content:latest` | k3d/downloads.yaml | ✅ yes (line 20) |
| `ghcr.io/paddione/mentolder-web:latest` | k3d/mentolder-web.yaml | ✅ yes (line 31) |
| `studio-server:latest` | k3d/configmap-domains.yaml | ❌ **missing** (local dev image) |

### kube-prometheus-stack-rendered.yaml — false positives
The monitoring manifest references `:latest` in descriptive text only (Kubernetes API descriptions), not as actual image tags. No action needed.

## Recommendation

No images need to be pinned. The two missing comments (brett, docs) and the configmap reference (studio-server) should receive explicit `# :latest is intentional` comments to match the convention used by the other manifests.

## Scenarios

### GIVEN a deployment manifest uses `:latest` for a project-internal image
WHEN the manifest is deployed to the cluster
THEN the image is pulled from GHCR on every deploy (CI builds push `:latest` on merge)
AND the comment explains why pinning is not appropriate

### GIVEN a deployment manifest uses an external image
WHEN the manifest is deployed to the cluster
THEN the image is pinned to a specific version + digest for reproducibility
