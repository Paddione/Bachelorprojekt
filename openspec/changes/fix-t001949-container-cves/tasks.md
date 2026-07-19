# Plan: Fix T001949 — Container CVEs 39→0

## Context
39 CRITICAL CVEs across 14 pinned container images. Baseline from `docs/audits/2026-07-17-trivy-cve-baseline.md`. All fixable via image pin refresh. Biggest lever: `alpine/k8s:1.34.0` (23/39 CRITICAL).

## Tasks

1. **Bump `alpine/k8s`** (23 CRITICAL — biggest lever)
   - Check latest stable tag at `registry.gitlab.com/alpine/k8s`
   - Update digest in `k3d/*.yaml` files
   - Run `trivy image --severity CRITICAL` to verify 0 CRITICAL

2. **Bump `pgvector/pgvector`** (8 CRITICAL)
   - Check latest `0.8.x-pg16` tag at `docker.io/pgvector/pgvector`
   - Update digest in k3d manifests
   - Verify with trivy scan

3. **Bump `nats`** (3 CRITICAL)
   - Check latest `2.10.x-alpine` tag
   - Update digest in k3d manifests
   - Verify with trivy scan

4. **Bump remaining images** (5 CRITICAL across postgres, livekit/egress, livekit/ingress)
   - `postgres:16-alpine` (1 CRITICAL): refresh digest
   - `livekit/egress:v1.9.0` (2 CRITICAL): check for newer tag
   - `livekit/ingress:v1.5.0` (2 CRITICAL): check for newer tag
   - Verify each with trivy scan

5. **Rollout test on dev cluster**
   - `task workspace:deploy ENV=dev`
   - Verify all pods healthy, services responding
   - Run `scripts/trivy-scan.sh` to confirm 0 CRITICAL

6. **Update goals.md baseline**
   - Set G-SEC06 current value to 0
   - Add Baseline-Update entry

## Verify
- `bash scripts/trivy-scan.sh` shows 0 CRITICAL
- `bash scripts/health-goals-check.sh --only=G-SEC06` shows target reached
- `kubectl get pods -n workspace --context fleet` all Running
