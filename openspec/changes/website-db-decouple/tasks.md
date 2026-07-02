---
title: "website-db-decouple — Implementation Plan"
ticket_id: T001490
domains: [website, infra]
status: plan_staged
file_locks:
  - website/package.json
  - packages/website-api/package.json
  - Taskfile.yml
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# website-db-decouple — Implementation Plan

## File Structure

```
NEW:
  packages/website-api/           — neue Bridge-Service-Package
  packages/website-api/package.json
  packages/website-api/tsconfig.json
  packages/website-api/src/index.ts        — Express/Fastify-Server
  packages/website-api/src/db-pool.ts       — Pool aus website/src/lib/db-pool.ts übernommen
  packages/website-api/src/routes/content.ts — GET /api/content/...
  packages/website-api/src/routes/website.ts — GET/POST website-data
  packages/website-api/src/routes/coaching.ts
  packages/website-api/src/routes/tickets.ts
  packages/website-api/src/routes/billing.ts
  packages/website-api/Dockerfile
  packages/website-api/kustomization.yaml

  k3d/website-api/               — Base-Manifeste für den neuen Service
  k3d/configmap-website-api.yaml
  prod-fleet/mentolder/website-api/  — Prod-Overlay
  prod-fleet/korczewski/website-api/

  website/src/lib/api-client.ts   — HTTP-Client zur Bridge
  website/src/lib/api-types.ts    — Shared API-Typen (von website-db.ts abgeleitet)

MODIFIED:
  website/src/lib/content.ts     — ersetzt DB-Zugriff durch apiClient-Aufruf
  website/src/lib/website-db.ts  — ersetzt direkte DB-Zugriffe durch apiClient
  website/src/lib/coaching-db.ts
  website/src/lib/tickets-db.ts
  website/src/lib/billing-db.ts
  Taskfile.yml                   — workspace:deploy inkl. website-api
  k3d/kustomization.yaml         — neue Resource website-api
  environments/schema.yaml       — API_URL-Env für website
  k3d/configmap-website.yaml     — API_URL-Eintrag
```

## Implementation Tasks

### Task 0: Bridge-Architektur aufsetzen

Create the `packages/website-api/` package with Express/Fastify HTTP server. Copy `db-pool.ts` as the sole DB connection point. Define health endpoint (`GET /health`).

OpenSpec-Spec-Reference: `openspec/specs/website-core.md`

```bash
mkdir -p packages/website-api/src/routes
# package.json: name "@bachelorprojekt/website-api", port 3001
# tsconfig.json: extends website/tsconfig.json
# Dockerfile: multi-stage, based on website's pattern
```

### Task 1: API-Contract definieren

Wander sämtliche Query-Funktionen aus den 5 Zieldateien in einem `api-types.ts`-Interface zusammen. Jede Operation bekommt einen HTTP-Route + Request/Response-Type.

**Dateien:**
- `website/src/lib/content.ts`: `getEffectiveHomepage`, `getEffectiveUebermich`, `getEffectiveKontakt`, `getEffectiveServices`, `getFAQs`, `getTestimonials`
- `website/src/lib/website-db.ts`: `getSettings`, `saveSetting`, `getAllSettings`, `listAdminUsers`
- `website/src/lib/coaching-db.ts`: `getCoachings`, `getCoaching`, `saveCoaching`
- `website/src/lib/tickets-db.ts`: `initTicketsSchema`, `isFeatureEnabled`
- `website/src/lib/billing-db.ts`: `getInvoices`, `getInvoice`, `createInvoice`

Output: `packages/website-api/src/api-contract.ts` (reine Type-Exporte, kein Code)

### Task 2: Bridge-Routen implementieren

Für jedes der 5 Module eine Route-Datei anlegen, die via `pool.query()` dieselben SQL-Queries ausführt wie aktuell die Website. JSON-Response.

```bash
# Beispiel-Route: packages/website-api/src/routes/content.ts
# GET /api/content/homepage → getEffectiveHomepage()
# GET /api/content/uebermich → getEffectiveUebermich()
# GET /api/content/kontakt → getEffectiveKontakt()
```

### Task 3: API-Client in der Website

Erstelle `website/src/lib/api-client.ts`: ein HTTP-Client (fetch-based), der gegen `process.env.WEBSITE_API_URL` routet. Type-safe via `api-types.ts`.

Alle 5 Ziel-DB-Module ersetzen ihre direkten `pool.query()`-Aufrufe durch Aufrufe des `apiClient`.

```typescript
// api-client.ts (Konzept)
const apiClient = {
  content: {
    getHomepage: () => fetch(`${BASE}/api/content/homepage`).then(r => r.json()),
    getUebermich: () => fetch(`${BASE}/api/content/uebermich`).then(r => r.json()),
    // ...
  },
  // ...
};
```

### Task 4: Tests schreiben

**Unit-Tests für die Bridge:**
- `packages/website-api/src/routes/content.test.ts`
- `packages/website-api/src/routes/website.test.ts`

**Integration-Tests für den API-Client:**
- `website/src/lib/api-client.test.ts` — mockt fetch und prüft korrekte URL + Typen

### Task 5: Manifeste + Deployment

- `k3d/website-api/` — Basis-Deployment, Service, ConfigMap
- `k3d/configmap-website-api.yaml` — `DATABASE_URL` via envsubst
- `k3d/configmap-website.yaml` — neuer Key `WEBSITE_API_URL=http://website-api.workspace.svc.cluster.local:3001`
- Prod-Overlays für mentolder + korczewski
- `environments/schema.yaml`: `WEBSITE_API_URL` eintragen
- `Taskfile.yml`: `workspace:deploy` inkl. website-api bauen+deployen

### Task 6: Finale CI-Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
task workspace:validate
```
