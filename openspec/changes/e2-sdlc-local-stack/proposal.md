# Proposal: e2-sdlc-local-stack

## Why

ADR-006 Etappe 2 (Ticket T002625, Epic T002623). Etappe 1 (T002624) hat den Build-Target-Split
geliefert: `ghcr.io/paddione/website-sdlc` (BUILD_TARGET=sdlc) wird bei jedem qualifizierenden Push
gebaut, ist aber in `k3d/`, `prod-fleet/`, `flux/` **nirgends referenziert** — die SDLC-Oberfläche
existiert als Image, hat aber keine Laufzeit-Heimat. Gleichzeitig ist der lokale k3d-Cluster
verschwunden: `k3d cluster list` ist leer, vorhanden sind nur `fleet` und ein toter
`k3d-korczewski`-Kubeconfig-Eintrag. Die gemessene WSL-Speicherzuteilung (18 GB von 64 GB) reichte
für die Etappe nicht — sie ist inzwischen auf 40 GB angehoben (Messung: 39 GB effektiv), muss aber
verifiziert und dokumentiert werden.

E2 baut die lokale Laufzeit für die SDLC-Fläche neu auf und macht den k3d von einer
Wegwerf-Testumgebung zu einer dauerhaft betriebenen Umgebung: eigener Cluster `mentolder-dev`
(Kontext `k3d-mentolder-dev`), eigenes Overlay `k3d/sdlc-stack/` über **dieselben
Kustomize-Manifeste wie Prod**, SDLC-Console-Deployment, lokale PostgreSQL (`website`-DB mit
`tickets`-Schema), zweites CPU-only-bge-Paar aus `k3d/llm-gpu.yaml`, lokale Pocket ID mit
fail-closed Fallback auf die fleet-Pocket-ID über das Mesh.

## What

**Ein lauffähiger lokaler SDLC-Stack** (DoD):

1. **Cluster:** Neuer k3d-Cluster `mentolder-dev` (Kontext `k3d-mentolder-dev`) mit
   `k3d/sdlc-stack/k3d-config.yaml`; toter `k3d-korczewski`-Kontext wird entfernt.
2. **Overlay:** `k3d/sdlc-stack/kustomization.yaml` — self-contained Kustomize-Overlay, das nur
   die SDLC-relevanten Base-Manifeste referenziert (`shared-db.yaml`, `website-schema.yaml`,
   `pocket-id.yaml` + DB-Init + Client-Seed + RBAC, `llm-gpu.yaml`, `secrets.yaml`,
   `configmap-domains.yaml`, `namespace.yaml`) plus zwei neue Dateien
   (`sdlc-console.yaml`, `sdlc-ingress.yaml`). Deploy über `kubectl kustomize
   --load-restrictor=LoadRestrictionsNone` + envsubst — dasselbe Muster wie `workspace:validate`
   und `workspace:deploy`.
3. **Console:** `sdlc-console.yaml` — Deployment/Service/ConfigMap mit dem Image
   `ghcr.io/paddione/website-sdlc:latest`, verbunden mit der lokalen DB (`website`-DB, Schema
   `tickets` bootstrappt sich selbst via `initTicketsSchema()`), den lokalen
   bge-Gateway-Services (`llm-gateway-embed/-rerank:8081`) und der lokalen Pocket ID.
   Erreichbar unter `http://sdlc.localhost`.
4. **Auth (fail-closed):** `website/src/lib/auth/provider.ts` — Provider-Auswahl: primär die
   lokale Pocket ID (`http://auth.localhost`), Fallback auf die fleet-Pocket-ID
   (`https://auth.mentolder.de`) über das Mesh; **beide nicht erreichbar → deny, nie eine offene
   Session**. Eigener Vitest `provider.test.ts` beweist den Fail-closed-Fall. Kein Mesh nötig für
   den Normalbetrieb (lokale Pocket ID im selben Cluster).
5. **Betrieb:** `Taskfile.sdlc.yml` (cluster:create/delete/status, deploy) + Runbook
   `docs/sdlc-stack/README.md` (inkl. WSL-Messung 39 GB effektiv als Baseline).
6. **Nachweis:** BATS-Guard `tests/spec/sdlc-isolation/e2-local-stack.bats` (Struktur-Anker +
   DoD-Verifikation: Console 200, lokale DB bootstrapt `tickets`, bge /health, Login mit/ohne
   Mesh).

**Nicht in dieser Etappe:** Datenmigration `tickets.*` (das ist E3/T002626), Umzug von
`dev.mentolder.de`/`terminal-sidekick` (bewusste Entscheidung, dokumentiert in design.md D6),
SDLC-Routen aus dem Prod-Image (E4).

## Impact

**Neue Dateien:**
- `k3d/sdlc-stack/kustomization.yaml` — Overlay-Manifest
- `k3d/sdlc-stack/k3d-config.yaml` — Cluster-Config (name: mentolder-dev)
- `k3d/sdlc-stack/sdlc-console.yaml` — Console Deployment/Service/ConfigMap
- `k3d/sdlc-stack/sdlc-ingress.yaml` — sdlc.localhost + auth.localhost
- `Taskfile.sdlc.yml` — Cluster-/Deploy-Tasks
- `website/src/lib/auth/provider.ts` — fail-closed Provider-Auswahl
- `website/src/lib/auth/provider.test.ts` — Fail-closed-Vitest
- `tests/spec/sdlc-isolation/e2-local-stack.bats` — Struktur-/DoD-Guard
- `docs/sdlc-stack/README.md` — Runbook (inkl. WSL-Messung)
- `openspec/changes/e2-sdlc-local-stack/{proposal,design,tasks}.md` + `specs/sdlc-isolation.md`

**Geänderte Dateien:**
- `Taskfile.yml` — Include `sdlc:` → Taskfile.sdlc.yml
- `website/src/lib/auth.ts` — Endpoints über provider.ts auflösen (lazy, kein Verhalten im
  Prod-Pfad ohne Fallback-Config)

**Risiken:** mittel. Auth ist die kritische Stelle — zwei Auth-Pfade in einer Codebase sind eine
bekannte Lückenquelle (ADR-006), der Fail-closed-Test ist deshalb Pflichtbestandteil. Das Overlay
referenziert Base-Dateien per `../` (erfordert `--load-restrictor=LoadRestrictionsNone` —
etabliertes Muster aus `workspace:validate`). Der lokale Cluster belegt dauerhaft RAM (40-GB-Limit
bereits angehoben, 39 GB effektiv gemessen).

_Referenzen: Epic T002623 (ADR-006, plan_staged) · E1 T002624 (gemergt) · E3 T002626 (folgt) ·_
_E1-SSO `sdlc-isolation` (Parent-Slug der Delta-Spec, identisch mit E1/Epic)_
