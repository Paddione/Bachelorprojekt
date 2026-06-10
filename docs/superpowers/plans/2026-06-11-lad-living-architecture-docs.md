---
title: Plan: T000626 — Living Architecture Docs (LAD)
ticket_id: T000626
domains: [website, infra, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: T000626 — Living Architecture Docs (LAD)

**Ticket:** T000626  
**Branch:** feature/lad-living-architecture-docs  
**Datum:** 2026-06-11  
**Status:** staged

---

## Ziel

Graph-basierte, selbstaktualisierendes Architekturdokumentation: K8s-Manifest-Abhängigkeitsgraph, API-Surface-Map, interaktive Mermaid-Diagrammseite und CI-Freshness-Gate. Ersetzt die manuell gepflegten Architekturabschnitte in `CLAUDE.md`.

---

## Design-Injektion (Industrial/Loft)

Alle UI-Komponenten (LAD-3) verwenden das Factory Design System aus `website/src/styles/factory-tokens.css` (T000597):

| Token | Verwendung in LAD-3 |
|-------|---------------------|
| `--ff-bg` | Hintergrund der Mermaid-Diagrammseite (dark surface) |
| `--ff-surface` | Card-Hintergrund je Service-Node |
| `--ff-amber` | Aktive / in-progress Services, kritische Abhängigkeiten |
| `--ff-green` | Healthy / deployed Services |
| `--ff-red` | Missing-Link, Drift-Fehler, unbekannte Services |
| `--ff-muted` | Deaktivierte / suspended Deployments |
| `--ff-border` | Node-Borders, Kanten-Linien |
| Monospace (JetBrains Mono / ui-monospace) | Service-Labels, Namespace-Badge, Port-Annotationen |

Mermaid-Diagramme verwenden `%%{init: {'theme': 'dark', 'themeVariables': {'background': 'var(--ff-bg)'}}}%%` als Init-Block. Interaktive Node-Highlights via `classDef active fill:var(--ff-amber)`.

---

## Architektur

### Neue Dateien

```
scripts/build-graph.mjs                              # K8s-Manifest-Parser → graph.json
scripts/build-api-map.mjs                            # Astro-API-Crawler → api-map.json
scripts/build-graph-docs.mjs                         # Mermaid-Generator aus graph.json + api-map.json
docs/generated/graph.json                            # Maschinenlesbarer Abhängigkeitsgraph
docs/generated/api-map.json                          # API-Surface-Map
k3d/docs-content-built/architecture/index.html       # Generierte Architekturseite
.github/workflows/freshness-graph.yml                # CI: Graph-Konsistenz-Check (oder task freshness:graph-check)
```

### Geänderte Dateien

```
scripts/build-docs.mjs                               # LAD-3: Aufruf von build-graph-docs.mjs ergänzen
package.json (root)                                  # scripts: "graph:build", "graph:check"
Taskfile.yml                                         # task graph:build, task freshness:graph-check
```

### Nicht geändert

- `k3d/` Manifeste (nur gelesen, nie geschrieben)
- `website/` (keine App-Änderungen)
- `environments/schema.yaml`

---

## Sub-Ticket-Breakdown

### LAD-1: Service-Dependency-Graph aus K8s-Manifesten (T000629)

**Depends on:** —

**Ziel:** `scripts/build-graph.mjs` parst alle `k3d/*.yaml` und `prod*/**/*.yaml`, extrahiert Service-zu-Service-Aufrufe (env-Refs auf Service-Namen, ConfigMap-Bindings, Ingress-Backend-Refs), und schreibt `docs/generated/graph.json`.

**Output-Format:**
```json
{
  "nodes": [{ "id": "website", "namespace": "website", "type": "Deployment" }],
  "edges": [{ "from": "website", "to": "shared-db", "via": "env:DATABASE_URL" }]
}
```

**Tasks:**
- [ ] `build-graph.mjs` schreiben: `glob('k3d/**/*.yaml')` → yaml-parse → Services/Deployments extrahieren → env-Werte auf bekannte Service-Namen matchen → Ingress backends → JSON ausgeben
- [ ] Namespace-Mapping: `workspace` = mentolder, `workspace-korczewski` = korczewski, `website` = website
- [ ] `docs/generated/graph.json` in `.gitignore`? Nein — committed, damit CI drift erkennt
- [ ] `task graph:build` in `Taskfile.yml` registrieren
- [ ] Unit-Test: `tests/unit/build-graph.bats` — prüft mind. 5 bekannte Services im Output

---

### LAD-2: API-Surface-Map aus `website/src/pages/api/**` (T000630)

**Depends on:** LAD-1 (T000629)

**Ziel:** `scripts/build-api-map.mjs` crawlt alle `*.ts`-Dateien unter `website/src/pages/api/`, extrahiert HTTP-Methoden via `export const GET/POST/PATCH/DELETE`, Parameter-Typen aus Zod-Schemas oder TypeScript-Signaturen, Auth-Anforderungen (`requireAdmin`, `requireAuth`), und schreibt `docs/generated/api-map.json`.

**Output-Format:**
```json
{
  "endpoints": [{
    "path": "/api/tickets",
    "methods": ["GET", "POST"],
    "auth": "admin",
    "params": [{ "name": "status", "type": "string", "in": "query" }]
  }]
}
```

**Tasks:**
- [ ] `build-api-map.mjs` schreiben: `glob('website/src/pages/api/**/*.ts')` → AST-Analyse mit `acorn` oder Regex-Heuristik → Methoden + Auth extrahieren
- [ ] `docs/generated/api-map.json` schreiben
- [ ] Markdown-Tabelle als Nebenprodukt: `docs/generated/api-surface.md`
- [ ] `task graph:build` ruft beide Scripts auf (LAD-1 + LAD-2)

---

### LAD-3: Auto-Docs-Generator — Mermaid-Architekturdiagramm (T000631)

**Depends on:** LAD-1 (T000629), LAD-2 (T000630)

**Ziel:** `scripts/build-graph-docs.mjs` generiert aus `graph.json` + `api-map.json` eine interaktive HTML-Seite unter `k3d/docs-content-built/architecture/index.html`. Design: Industrial/Loft via factory-tokens.css.

**Design-Details:**
- Seite verwendet `--ff-bg` als `<body>` Background (kein weißes Default)
- Mermaid-Diagramme: Service-Map (alle Nodes + Edges), K8s-Topology (Namespaces als Subgraph), API-Surface-Tabelle
- Node-Hover zeigt Tooltip: Namespace, Type, Port, Auth
- `classDef active fill:var(--ff-amber),color:#000` für Services mit laufenden Deploys
- `classDef down fill:var(--ff-red),color:#fff` für bekannt-suspendierte Services
- Monospace-Labels für alle Service-Namen

**Tasks:**
- [ ] `build-graph-docs.mjs`: `graph.json` lesen → Mermaid-Syntax generieren (flowchart LR) → HTML-Template mit Dark-Theme-Init-Block wrappen
- [ ] Drei Diagramm-Tabs: **Service-Map** | **K8s-Topology** | **API-Surface**
- [ ] `k3d/docs-content-built/architecture/index.html` schreiben
- [ ] `scripts/build-docs.mjs` erweitern: `await import('./build-graph-docs.mjs')` aufrufen
- [ ] Verifikation: `task docs:deploy` deployt neue Architekturseite

---

### LAD-4: Freshness-Gate — CI prüft Graph-Konsistenz (T000632)

**Depends on:** LAD-3 (T000631)

**Ziel:** `task freshness:graph-check` (analog zu `freshness:check` für `repo-index.json`) regeneriert `graph.json` + `api-map.json` und vergleicht mit committed Version. CI schlägt fehl wenn Drift > 0 neue oder gelöschte Services.

**Tasks:**
- [ ] `task freshness:graph-check` in `Taskfile.yml`: `node scripts/build-graph.mjs --stdout | diff - docs/generated/graph.json`
- [ ] CI: `task test:all` ruft `freshness:graph-check` auf (oder eigenständiger Job)
- [ ] Toleranz-Parameter: `GRAPH_DRIFT_THRESHOLD=0` (ENV, default 0 = kein Drift erlaubt)
- [ ] Fehler-Message: `"graph.json veraltet — bitte task graph:build ausführen und committen"`
- [ ] BATS-Test: `tests/unit/freshness-graph.bats` — prüft dass committed JSON == generiertes JSON

---

## Implementierungs-Reihenfolge

```
LAD-1 → LAD-2 → LAD-3 → LAD-4
(jeder Schritt blockiert den nächsten)
```

LAD-1 und LAD-2 können nach dem ersten Commit parallel in Branches, aber LAD-3 benötigt beide Outputs.

---

## Verifikation

### Lokal

```bash
# Graph generieren
node scripts/build-graph.mjs
node scripts/build-api-map.mjs
cat docs/generated/graph.json | jq '.nodes | length'  # > 0

# Architekturseite generieren
node scripts/build-graph-docs.mjs
# Browser: k3d/docs-content-built/architecture/index.html öffnen
# Prüfen: Dark Background, Mermaid-Diagramm rendert, amber Nodes sichtbar

# Freshness-Check
task freshness:graph-check  # muss grün sein nach graph:build

# Alle Offline-Tests
task test:all
```

### CI

```bash
task test:all           # freshness:graph-check integriert
task workspace:validate # Manifeste unverändert
```

### Akzeptanzkriterien

- [ ] `docs/generated/graph.json` enthält mind. 20 Nodes (alle k3d Services)
- [ ] `docs/generated/api-map.json` enthält mind. 15 Endpoints
- [ ] Architekturseite lädt ohne JS-Fehler in Chromium
- [ ] Mermaid-Diagramm: Dark Background (`--ff-bg`), amber/grüne Node-Colors
- [ ] `task freshness:graph-check` schlägt fehl wenn `graph.json` manuell verändert wird
- [ ] CI-Job grün auf main-Branch
