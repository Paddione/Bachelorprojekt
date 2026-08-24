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

- [ ] **Domain-Registry erweitern.** `BGE_EMBED_HOST`/`BGE_RERANK_HOST` in
      configmap-domains.yaml (dev: `embed.localhost`/`rerank.localhost`);
      Prod-Werte im Fleet-Overlay setzen. Muster: bestehende Keys wie
      BRAIN_DOMAIN.
- [ ] **IngressRoute embed/rerank.** Neues Manifest nach dem
      Wildcard-Cert-Muster (`prod-fleet/mentolder/sessions-server.yaml`);
      Backend = Service `llm-gateway-embed`/`llm-gateway-rerank`, Port 8081,
      Namespace workspace.
- [ ] **DB-Route fail-closed.** TCP-IngressRoute oder LB-Service für
      shared-db:5432, gebunden an den wg-internen Entrypoint; öffentliche
      Entrypoints explizit ausschließen. Kommentar im Manifest dokumentiert die
      Grenze.
- [ ] **Env-Registry.** Falls environments/schema.yaml die neuen Hosts führen
      muss (legacy_only-Mechanik beachten), Keys dort ergänzen.
- [ ] **BATS-Test.** Assertions: (a) neue Manifeste enthalten keinen literalen
      Hostnamen, sondern Referenzen auf die Registry-Keys; (b) das DB-Route-
      Manifest bindet an den internen Entrypoint und nicht an den öffentlichen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Test anlegen — FAIL, weil Manifeste/
      Registry-Keys fehlen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/internal-endpoints.bats
# expected: FAIL (red — endpoint manifests and domain keys do not exist yet)
```

- [ ] **Fix-Step (GREEN).** Artefakte gemäß Tasks umsetzen; Test grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/fleet-operations/internal-endpoints.bats
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
