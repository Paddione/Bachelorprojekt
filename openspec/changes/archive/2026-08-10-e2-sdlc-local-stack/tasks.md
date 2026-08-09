---
title: "e2-sdlc-local-stack — Implementation Plan"
ticket_id: T002625
domains: [infra, website, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002623
depends_on_plans: []
---

# e2-sdlc-local-stack — Implementation Plan

_Ticket: T002625 (E2) · Epic T002623 (ADR-006) · E1 T002624 gemergt · E3 T002626 folgt_

Ziel: Die lokale Laufzeit für die SDLC-Fläche steht — neuer k3d-Cluster `mentolder-dev`
(Kontext `k3d-mentolder-dev`), self-contained Overlay `k3d/sdlc-stack/` über die
Prod-Kustomize-Manifeste, SDLC-Console (`website-sdlc`-Image), lokale PostgreSQL
(`website`-DB, `tickets`-Schema bootstrappt selbst), zweites CPU-only-bge-Paar, lokale
Pocket ID mit fail-closed fleet-Fallback über das Mesh. DoD: Console erreichbar, gegen die
lokale DB lauffähig, bge antwortet, Anmeldung mit und ohne Mesh.

## File Structure

```
NEU
  k3d/sdlc-stack/kustomization.yaml          Overlay: referenziert ../-Base-Manifeste (p1)
  k3d/sdlc-stack/k3d-config.yaml             Cluster-Config name: mentolder-dev (p1)
  Taskfile.sdlc.yml                          cluster:create/delete/status, deploy, status (p1)
  docs/sdlc-stack/README.md                  Runbook: Create, Deploy, Auth, WSL-Baseline (p1)
  k3d/sdlc-stack/sdlc-console.yaml           Console Deployment/Service/ConfigMap (p2)
  k3d/sdlc-stack/sdlc-ingress.yaml           sdlc.localhost + auth.localhost (p2)
  website/src/lib/auth/provider.ts           fail-closed Provider-Auswahl (p3)
  website/src/lib/auth/provider.test.ts      Vitest: deny/fallback/primary/no-fallback (p3)
  tests/spec/sdlc-isolation/e2-local-stack.bats  Struktur- + DoD-Guard (p4)

GEÄNDERT
  Taskfile.yml                               Include sdlc: -> Taskfile.sdlc.yml (p1)
  website/src/lib/auth.ts                    Endpoints über provider.ts (p3)
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-infra.md | impl | `k3d/sdlc-stack/kustomization.yaml`, `k3d/sdlc-stack/k3d-config.yaml`, `Taskfile.sdlc.yml`, `Taskfile.yml`, `docs/sdlc-stack/README.md` | |
| p2 | tasks.d/p2-console.md | impl | `k3d/sdlc-stack/sdlc-console.yaml`, `k3d/sdlc-stack/sdlc-ingress.yaml` | p1 |
| p3 | tasks.d/p3-auth.md | impl | `website/src/lib/auth/provider.ts`, `website/src/lib/auth/provider.test.ts`, `website/src/lib/auth.ts` | p2 |
| p4 | tasks.d/p4-tests.md | tests | `tests/spec/sdlc-isolation/e2-local-stack.bats` | p3 |

### p1 — infra: Overlay, Cluster-Config, Taskfile, Runbook

**Rolle:** impl — `k3d/sdlc-stack/kustomization.yaml` (referenziert die Base-Manifeste per
`../`), `k3d/sdlc-stack/k3d-config.yaml` (name: mentolder-dev), `Taskfile.sdlc.yml`
(cluster:create inkl. Entfernen des toten `k3d-korczewski`-Kontexts, deploy mit
`--load-restrictor=LoadRestrictionsNone` + envsubst, status), Include in `Taskfile.yml`,
Runbook `docs/sdlc-stack/README.md` (inkl. WSL-Messung 39 GB effektiv als Baseline).
Verifikation: `task sdlc:cluster:create` + `task sdlc:deploy` laufen durch.

### p2 — console: Console-Deployment + Ingress

**Rolle:** impl — `sdlc-console.yaml` (ConfigMap `sdlc-console-config`, Deployment mit
`ghcr.io/paddione/website-sdlc:latest`, Service `sdlc-console:8080`) und `sdlc-ingress.yaml`
(`sdlc.localhost` → Console, `auth.localhost` → Pocket ID). Verifikation: Deployment kommt
auf `Ready`, `curl http://sdlc.localhost` liefert 200.

### p3 — auth: fail-closed Provider-Auswahl + Vitest

**Rolle:** impl — `website/src/lib/auth/provider.ts` (Primary lokal / Fallback fleet über
Mesh, Health-Probe mit TTL, fail-closed deny) + `provider.test.ts` (vier Fälle) + `auth.ts`
auf lazy Provider-Getter umgestellt. Verifikation: `cd website && npx vitest run
src/lib/auth/provider.test.ts` grün; `npx tsc --noEmit` sauber.

### p4 — tests: BATS-Guard + DoD-Nachweis

**Rolle:** tests — `tests/spec/sdlc-isolation/e2-local-stack.bats` (Struktur-Anker + DoD:
Console 200, `/api/health` sdlc-Target, lokales `tickets`-Schema, bge /health, Login mit/ohne
Mesh). Zuerst rot (Dateien fehlen), nach p1–p3 grün.

## Verify (final)

```bash
bash scripts/openspec.sh validate
bash scripts/plan-lint.sh openspec/changes/e2-sdlc-local-stack/tasks.md
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```

## Risiken

- **Auth ist die kritische Stelle** — zwei Pfade in einer Codebase, deshalb fail-closed mit
  eigenem Test (p3). Prod-Verhalten bleibt ohne Fallback-Env unverändert.
- **`../`-Referenzen** brauchen `--load-restrictor=LoadRestrictionsNone` — ohne das Flag bricht
  `kubectl kustomize` hart ab; Task + Runbook dokumentieren es.
- **Pocket-ID-Admin-Bootstrap** ist interaktiv (Login-Code aus Pod-Logs) — im Runbook
  dokumentiert, blockiert den Stack nicht (Seed-Job registriert die OIDC-Clients automatisch).
- **Mesh ist aktuell down** — der ohne-Mesh-Pfad (lokale Pocket ID) ist der Primärpfad; der
  Mesh-Nachweis (fleet-Fallback) läuft erst nach `wg-quick up wg-fleet`.
- **Kein Datenbestand lokal** — bewusst (D7), Cockpit zeigt leere Tickets bis E3.
