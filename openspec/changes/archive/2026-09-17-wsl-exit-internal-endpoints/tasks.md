---
title: "wsl-exit-internal-endpoints — Implementation Plan"
ticket_id: T016430
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-internal-endpoints — Implementation Plan

_Ticket: T016430_

## File Structure

```
k3d/configmap-domains.yaml                          # BGE_EMBED_HOST / BGE_RERANK_HOST (dev-Defaults)
k3d/llm-gateway-ingress.yaml                        # NEU: IngressRoutes embed/rerank → llm-gateway-*-Services
prod-fleet/mentolder/domains-patch.yaml             # NEU (oder bestehendes Patch): Prod-Hostnames
k3d/shared-db-tcp-route.yaml                        # NEU: wg-gebundener TCP-Eintrag zu shared-db:5432
environments/schema.yaml                            # falls Env-Registry neue Keys verlangt (Muster prüfen)
tests/spec/fleet-operations/internal-endpoints.bats # NEU: Registry-Pflicht + fail-closed-DB-Route
```

## Tasks

- [x] **Domain-Registry erweitern.** `BGE_EMBED_HOST`/`BGE_RERANK_HOST` in
      configmap-domains.yaml (dev: `embed.localhost`/`rerank.localhost`);
      Prod-Werte im Fleet-Overlay setzen. Muster: bestehende Keys wie
      BRAIN_DOMAIN.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `k3d/configmap-domains.yaml:35-36` führt `BGE_EMBED_HOST`/`BGE_RERANK_HOST` (PR #5252).
- [x] **IngressRoute embed/rerank.** Neues Manifest nach dem
      Wildcard-Cert-Muster (`prod-fleet/mentolder/sessions-server.yaml`);
      Backend = Service `llm-gateway-embed`/`llm-gateway-rerank`, Port 8081,
      Namespace workspace.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `k3d/llm-gateway-ingress.yaml` liegt auf `main` (PR #5252).
- [x] **DB-Route fail-closed.** TCP-IngressRoute oder LB-Service für
      shared-db:5432, gebunden an den wg-internen Entrypoint; öffentliche
      Entrypoints explizit ausschließen. Kommentar im Manifest dokumentiert die
      Grenze.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Gelöst als `k3d/shared-db-endpoint-policy.yaml` (NetworkPolicy), nicht als die oben
      geplante TCP-IngressRoute `k3d/shared-db-tcp-route.yaml` — die existiert auf `main` nicht.
      Die Zusicherung (fail-closed, nur wg-interner Zugang) ist damit erfüllt, der Mechanismus
      weicht ab. Die File-Structure oben ist an dieser Stelle überholt.
- [x] **Env-Registry.** Falls environments/schema.yaml die neuen Hosts führen
      muss (legacy_only-Mechanik beachten), Keys dort ergänzen.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `environments/schema.yaml:291,297` führt beide Keys (PR #5252).
- [x] **BATS-Test.** Assertions: (a) neue Manifeste enthalten keinen literalen
      Hostnamen, sondern Referenzen auf die Registry-Keys; (b) das DB-Route-
      Manifest bindet an den internen Entrypoint und nicht an den öffentlichen.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `tests/spec/fleet-operations/internal-endpoints.bats` liegt auf `main` (PR #5252).

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** BATS-Test anlegen — FAIL, weil Manifeste/
      Registry-Keys fehlen.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Test-Datei auf `main`; PR #5252 folgte dem RED→GREEN-Schritt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/internal-endpoints.bats
# expected: FAIL (red — endpoint manifests and domain keys do not exist yet)
```

- [x] **Fix-Step (GREEN).** Artefakte gemäß Tasks umsetzen; Test grün.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Alle Manifeste und der Test liegen gemeinsam auf `main` (PR #5252).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/internal-endpoints.bats
```

- [x] **Final Verification.** Die drei Pflicht-Gates:
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Über den gemergten PR #5252 belegt (Repo-Regel 4: CI grün vor Merge).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
