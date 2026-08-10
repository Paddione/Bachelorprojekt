# Plan: Fix T001949 — Container CVEs 39→0

## Context
39 CRITICAL CVEs across 14 pinned container images. Baseline from `docs/audits/2026-07-17-trivy-cve-baseline.md`. All fixable via image pin refresh. Biggest lever: `alpine/k8s:1.34.0` (23/39 CRITICAL).

## Tasks (Ergebnis: siehe unten — 39→8 CRITICAL, 4/6 Images gebumpt, 2 Upstream-blockiert)

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

## Ergebnis (2026-07-19, T001949)

Baseline war fehlerhaft für `alpine/k8s`: der Audit-Report ging von
`registry.gitlab.com/alpine/k8s` aus, aber das Manifest zieht `alpine/k8s` ohne Registry-Prefix
= **Docker Hub** (`registry.gitlab.com/alpine/k8s` ist für anonyme Pulls gesperrt — 403 "access
forbidden" bei jedem Versuch in dieser Session, egal ob via `crane`, `docker pull` oder direktem
JWT-Auth-Call). Docker Hub führt das Image aktiv gepflegt bis `1.36.x`.

**Gebumpt (4/6, alle mit `trivy image --severity CRITICAL` einzeln verifiziert):**
| Image | Alt → Neu | CRITICAL vorher → nachher |
|---|---|---:|
| `alpine/k8s` | `1.34.0` → `1.36.2` | 23 → 4 |
| `pgvector/pgvector` | `0.8.0-pg16` → `0.8.5-pg16` | 8 → 1 |
| `nats` | `2.10-alpine` → `2.12-alpine` | 3 → 0 |
| `livekit/egress` | `v1.9.0` → `v1.13.0` | 2 → 0 |

**Nicht behebbar (2/6 — bereits neuester verfügbarer Tag):**
| Image | CRITICAL | Grund |
|---|---:|---|
| `postgres:16-alpine` | 1 | `CVE-2025-68121` in vendored `gosu`-Binary; Digest von `16-alpine`/`16-alpine3.24` unverändert |
| `livekit/ingress:v1.5.0` | 2 | `CVE-2026-33186` (`grpc-go`); `v1.5.0` ist der neueste Tag auf Docker Hub |

**Gesamtergebnis: 39 → 8 CRITICAL (−79 %).** Restliche 8 verteilen sich auf `postgres` (1),
`pgvector` (1, gleiche `gosu`-Ursache), `alpine/k8s` (4, `grpc-go` in vendored `kustomize` +
Go-stdlib) und `livekit/ingress` (2, `grpc-go`) — alle vier sind Upstream-blockiert, kein
Repo-seitiger Fix möglich, bis neue Upstream-Releases erscheinen.

Task 5 (Rollout-Test auf Dev-Cluster) wurde **nicht** ausgeführt — kein lokaler k3d-Cluster in
dieser Session aktiv. Digest-Korrektheit wurde stattdessen über `crane digest` (Tag→Digest-Auflösung)
und `trivy image` (CVE-Scan pro Image) verifiziert; der reguläre Prod-Rollout via CI + push-based
Deploy übernimmt den Live-Test der neuen Digests nach Merge.
