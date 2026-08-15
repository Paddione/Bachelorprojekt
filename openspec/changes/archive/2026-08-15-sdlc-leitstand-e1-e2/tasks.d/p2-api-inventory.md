# p2 — API-/Connector-Inventar + CI-Drift-Gate

**Rolle:** bachelorprojekt-infra

**target_files:**
- `scripts/sdlc/api-inventory.mjs`
- `components/website/src/data/api-inventory.json`
- `docs/agent-guide/registry/api-overlay.yaml`
- `Taskfile.yml`
- `.gitattributes`

_Ticket: T007559 · Epic T007553 · Etappe E2 (design.md S8) · Partial p2 von 3
(disjunkt und parallel zu p1) · SSOT-Requirement:
`openspec/changes/sdlc-leitstand-e1-e2/specs/sdlc-cockpit.md` →
„API Connector Inventory"_

## Ziel

Ein generiertes Inventar aller SDLC-API-Endpunkte, MCP-Server und
factory-mcp-Tools als `components/website/src/data/api-inventory.json`, erzeugt von
`scripts/sdlc/api-inventory.mjs`, angereichert mit kuratierten Feldern aus
`docs/agent-guide/registry/api-overlay.yaml`, deterministisch (keine
Zeitstempel, stabile Sortierung) und durch das bestehende
`freshness:regenerate`/`freshness:check`-Gate (test-inventory-Muster) gegen
Drift geschützt.

## Recherche-Ergebnis: kanonischer Ort für Task-Definition + CI-Anbindung

`task test:inventory` (Taskfile.yml:1174) erzeugt `test-inventory.json`; es
gibt **keinen eigenen CI-Workflow-Schritt** dafür. Der Schutz läuft
ausschließlich über:

1. `freshness:regenerate` (Taskfile.yml, `- task: test:inventory`) ruft den
   Generator.
2. `freshness:check` (Taskfile.yml) führt zuerst `freshness:regenerate` aus
   und vergleicht danach eine feste `FILES`-Liste gegen `git status
   --porcelain` — jede Abweichung ist ein Fehler (`ERRORS` Zähler).
3. `.github/workflows/ci.yml` hat genau einen Schritt „Ensure freshness
   artifacts are up to date" (Zeile ~141), der nur `task freshness:check`
   aufruft — generisch für alle registrierten Artefakte.
4. `tests/spec/ci-cd/generated-artifacts-registry.bats` verifiziert
   zusätzlich, dass jede Datei aus der `FILES`-Liste auch `merge=ours` in
   `.gitattributes` trägt (`git check-attr`).

**Konsequenz für dieses Partial:** `.github/workflows/ci.yml` bleibt
**unverändert** — der bestehende generische Schritt deckt jedes neu in
`FILES` eingetragene Artefakt automatisch mit ab; ein weiterer Workflow-Schritt
wäre eine funktionslose Dopplung. Zu ändern sind ausschließlich `Taskfile.yml`
(neuer Task + zwei Einhängepunkte) und `.gitattributes` (ein `merge=ours`-
Eintrag) — beides Teil der bereits deklarierten target_files.

## Vorab-Recherche: Ist-Bestand `components/website/src/pages/sdlc/api/`

```bash
find components/website/src/pages/sdlc/api -name '*.ts' ! -name '*.test.ts' | wc -l   # 123 Routen-Dateien
find components/website/src/pages/sdlc/api -name '*.test.ts' | wc -l                  # 21 Test-Dateien (ausgeschlossen)
```

(Stand 2026-08-15, Commit `938567c13`.)

## Tasks

- [x] **Task 1 — Scanner-Kern: Route-Scan + Backend-Klassifikation.**
      `scripts/sdlc/api-inventory.mjs` (neu) verwendet `fs.readdirSync(dir, {
      recursive: true, withFileTypes: true })` (Node ≥22.13, `engines.node`
      in `package.json`) über `components/website/src/pages/sdlc/api/`, schließt
      `*.test.ts` aus. Route-Pfad = Dateisystempfad relativ zum Scan-Root,
      `.ts`-Endung entfernt, `/index` am Ende entfernt, Präfix `/sdlc/api/` —
      `[param]`-Segmente bleiben wörtlich erhalten (z. B.
      `components/website/src/pages/sdlc/api/tickets/[id].ts` → `/sdlc/api/tickets/[id]`).
      HTTP-Methoden: Regex `^export const (GET|POST|PUT|PATCH|DELETE)\b` auf
      Dateiinhalt (Zeilenanfang), sortiert nach fester Reihenfolge
      `['GET','POST','PUT','PATCH','DELETE']` (nicht alphabetisch — lesbarer).
      Backend-Klassifikation ausschließlich aus den **direkten**
      Import-Spezifizierern der Route-Datei (Regex `from\s+['"]([^'"]+)['"]`
      über den ganzen Dateiinhalt), pro Spezifizierer eine von sieben Regeln,
      Ergebnis als **Set** (eine Datei kann mehrere Backends haben):

      ```js
      function classifyImport(spec) {
        if (/\/lib\/sdlc\/k8s(\.ts)?$/.test(spec)) return 'k8s-rest';
        if (spec === 'child_process' || spec === 'node:child_process' || /kubectl/i.test(spec)) return 'kubectl';
        if (spec === 'pg' || /db-pool/.test(spec) || /\/lib\/[^/]*db[^/]*(\.ts)?$/i.test(spec)) return 'postgres';
        if (/github/i.test(spec)) return 'github';
        if (/prometheus/i.test(spec)) return 'prometheus';
        if (['node:fs', 'node:fs/promises', 'fs', 'fs/promises'].includes(spec)) return 'filesystem';
        return null;
      }
      ```

      `backends = [...new Set(specifiers.map(classifyImport).filter(Boolean))].sort()`,
      leer → `['unknown']`.

      **Wichtig — verifizierter Fallstrick:** KEIN Volltext-Grep auf das Wort
      `kubectl` im Dateiinhalt einbauen. `deployments/[name]/restart.ts` und
      `ops/redeploy/website.ts` importieren nur `lib/sdlc/k8s` (k8s-rest),
      enthalten aber die K8s-Annotation `'kubectl.kubernetes.io/restartedAt'`
      als Stringliteral — ein Volltext-Match klassifiziert sie fälschlich
      zusätzlich als `kubectl`. Nur `tests/report.ts` importiert tatsächlich
      `child_process`; das ist aktuell die einzige `kubectl`-Route.

      **Bekannte Grenze (dokumentieren, nicht lösen):** Die Klassifikation
      prüft nur die direkten Imports der Route-Datei, keine transitive
      Auflösung. `tickets/index.ts` importiert `lib/tickets/admin.ts`, das
      selbst über `lib/tickets-schema.ts` → `db-pool` auf Postgres zugreift —
      der Scanner klassifiziert diese Route dennoch als `unknown`. Das ist
      akzeptiert: eine transitive Import-Graph-Auflösung ist nicht Teil des
      Designs (S5) und keine Voraussetzung für ein erstes nutzbares Inventar;
      das Overlay kann `description`/`tier` trotzdem pflegen.

- [x] **Task 2 — MCP-Server- und factory-mcp-Tool-Scan.** Zwei weitere
      Funktionen im selben Skript:
      - `scanMcpServers()`: parst `docs/agent-guide/registry/mcp.yaml` mit
        dem vorhandenen npm-Paket `yaml` (`import { parse as parseYaml } from
        'yaml'`, bereits in `package.json` und u. a. in
        `scripts/agent-guide/load.mjs` verwendet). Liest ausschließlich den
        Top-Level-Schlüssel `clients` (nicht `cluster` — andere Bedeutung,
        keine MCP-Client-Verbindungen). Für jeden Eintrag: `name` (Objekt-
        Key), `transport` (`http`|`stdio`), `endpoint` (nur bei `http`
        vorhanden, sonst `null`). 13 Einträge im Ist-Stand
        (`mcp-kubernetes`, `mcp-postgres`, `factory-mcp`, `bge-mcp` mit
        `endpoint`; `mcp-task-runner`, `ticket-mcp`, `brain-mcp`,
        `codebase-memory-mcp`, `github-mcp`, `playwright`, `docfork`,
        `sequential-thinking`, `webresearch` als `stdio` ohne `endpoint`).
      - `scanFactoryMcpTools()`: liest `scripts/factory/mcp-go/main.go` als
        Text und extrahiert die `toolList()`-Einträge per Regex
        `/Name:\s*"([^"]+)",\s*\n\s*Description:\s*"([^"]+)"/g` — liefert
        alle 7 Tools (`factory_status`, `factory_queue`, `factory_enqueue`,
        `factory_trigger`, `factory_recent`, `openspec_find_similar`,
        `factory_ask`) mit ihrer `Description`. Kein Hardcoding der Liste im
        `.mjs` — Änderungen an `main.go` fließen automatisch ein, keine
        Zweitquelle.
      Beide Listen jeweils nach `name` sortiert (`localeCompare`).

- [x] **Task 3 — Overlay-Merge + Validierung (Fehlerpfad).**
      `applyOverlay(routes, mcpServers, factoryMcpTools)` liest
      `docs/agent-guide/registry/api-overlay.yaml` (`yaml`-Paket), erwartet
      drei optionale Top-Level-Gruppen `routes`, `mcpServers`, `mcpTools`,
      deren Schlüssel exakt `path` (Routen) bzw. `name` (Server/Tools)
      matchen müssen. Für jeden Treffer werden `description`, `tier`,
      `deprecated` (Default je `null`, wenn im Overlay-Eintrag nicht gesetzt)
      auf das Ziel-Objekt geschrieben — Objekte ohne Overlay-Treffer behalten
      ihre Default-`null`-Felder (Requirement: „Fehlende Kuration ist
      erlaubt"). Für jeden Overlay-Schlüssel **ohne** Treffer in der
      jeweiligen gescannten Menge: Namen sammeln, am Ende
      `process.stderr.write(...)` mit allen gesammelten Namen (nicht nur dem
      ersten — bessere Diagnose bei mehreren Fehlern in einem Lauf) und
      `process.exit(1)` **ohne** die Ausgabedatei zu schreiben. Format der
      Fehlermeldung (von p3 per `bats`-Assertion auf Substring geprüft, siehe
      Schnittstellenvertrag unten):
      `api-inventory: api-overlay.yaml entries not found in scan: routes "/sdlc/api/does-not-exist"`

- [x] **Task 4 — `docs/agent-guide/registry/api-overlay.yaml` anlegen.**
      Neue Datei mit Kopfkommentar (Zweck + Verweis auf das Requirement) und
      genau drei Beispiel-Einträgen gegen real existierende, verifizierte
      Endpunkte/Server/Tools (kein Orphan-Risiko):

      ```yaml
      # docs/agent-guide/registry/api-overlay.yaml
      # Kuratierte Zusatzfelder fuer components/website/src/data/api-inventory.json.
      # Jeder Schluessel MUSS einem von scripts/sdlc/api-inventory.mjs
      # gescannten Endpunkt/Server/Tool entsprechen -- sonst schlaegt die
      # Generierung fehl (Requirement "API Connector Inventory" in
      # openspec/specs/sdlc-cockpit.md, Szenario "Orphaned overlay entry
      # fails"). Fehlende Kuration ist erlaubt: nicht gelistete Eintraege
      # behalten description/tier/deprecated = null.
      routes:
        "/sdlc/api/factory-floor":
          description: "Wertstrom-Ansicht: Slots, Hall, Backlog je Ticket-Phase."
          tier: "core"
          deprecated: null
      mcpServers:
        mcp-kubernetes:
          description: "Cluster-Status/-Aktionen fuer den Leitstand (Claude-Code-only SSE, Port 18080)."
          tier: "core"
          deprecated: null
      mcpTools:
        factory_status:
          description: "Queue-Tiefe und laufender Tick fuer das Statusband."
          tier: "core"
          deprecated: null
      ```

- [x] **Task 5 — Erstlauf + Commit des Inventars.** `node
      scripts/sdlc/api-inventory.mjs` einmal lokal ausführen und
      `components/website/src/data/api-inventory.json` mit committen (Schema:
      `{ routes: [...], mcpServers: [...], factoryMcpTools: [...] }`, jedes
      Route-Objekt `{ path, file, methods, backends, description, tier,
      deprecated }`, jedes Server-Objekt `{ name, transport, endpoint,
      description, tier, deprecated }`, jedes Tool-Objekt `{ name,
      description, tier, deprecated }`; Ausgabe via `JSON.stringify(payload,
      null, 2) + '\n'` — keine `generatedAt`/Zeitstempel-Felder, keine
      Kommentare, damit zwei Läufe byte-identisch sind).

- [x] **Task 6 — `Taskfile.yml`: Task `api:inventory` + Einhängung.**
      Neuer Task direkt nach `test:inventory:` (Taskfile.yml, Zeile ~1174):

      ```yaml
        api:inventory:
          desc: Regenerate components/website/src/data/api-inventory.json (SDLC API/connector inventory)
          cmds:
            - node scripts/sdlc/api-inventory.mjs
      ```

      In `freshness:regenerate` (Taskfile.yml, `cmds:`-Liste) direkt nach
      `- task: test:inventory` ergänzen: `- task: api:inventory`.

      In `freshness:check`, Phase 1, im `FILES="..."`-String (Taskfile.yml)
      direkt nach der Zeile `components/website/src/data/test-inventory.json` eine neue
      Zeile `components/website/src/data/api-inventory.json` einfügen — **keine
      Kommentarzeilen** in diesem String (Wortsplitting-Falle, siehe
      bestehender Warnkommentar direkt darüber in derselben Datei).

- [x] **Task 7 — `.gitattributes`: `merge=ours`-Eintrag.** Direkt nach der
      Zeile `components/website/src/data/test-inventory.json  merge=ours
      linguist-generated=true` ergänzen:

      ```
      components/website/src/data/api-inventory.json           merge=ours linguist-generated=true
      ```

      Ohne diesen Eintrag failt
      `tests/spec/ci-cd/generated-artifacts-registry.bats` (Test „jede Datei
      im Gate ist auch merge=ours geschuetzt") — dieser Test gehört zu keinem
      Partial dieses Changes, läuft aber automatisch gegen jede Änderung an
      `Taskfile.yml`/`.gitattributes`.

- [x] **Task 8 — Lokale Verifikation (vor Übergabe an p3).**
      _Hinweis: der p2-eigene Orphan-Snippet haengt eine zweite `routes:`-Gruppe an die
      reale Overlay-Kopie an -- der yaml-Parser faengt das als Duplicate-Key (Exit 1, keine
      Ausgabedatei, korrekt); den echten Orphan-Pfad belegen die p3-Fixtures (T5) und ein
      Einzelgruppen-Test mit eindeutigem Key._
      Determinismus:
      ```bash
      node scripts/sdlc/api-inventory.mjs
      cp components/website/src/data/api-inventory.json /tmp/run1.json
      node scripts/sdlc/api-inventory.mjs
      diff /tmp/run1.json components/website/src/data/api-inventory.json && echo "deterministic: OK"
      ```
      Orphan-Fehlerpfad (temporäre Kopie, reale Overlay-Datei bleibt
      unangetastet):
      ```bash
      cp docs/agent-guide/registry/api-overlay.yaml /tmp/overlay-bad.yaml
      printf '\nroutes:\n  "/sdlc/api/does-not-exist":\n    description: "x"\n' >> /tmp/overlay-bad.yaml
      API_INVENTORY_OVERLAY=/tmp/overlay-bad.yaml API_INVENTORY_OUT=/tmp/out.json \
        node scripts/sdlc/api-inventory.mjs; echo "exit: $?"   # erwartet: 1
      ```
      Freshness-Gate:
      ```bash
      task freshness:regenerate
      git status --porcelain components/website/src/data/api-inventory.json   # erwartet: leer
      ```

## Schnittstellenvertrag für p3 (Tests-Partial)

Damit `tests/spec/sdlc-cockpit/api-inventory-drift.bats` (p3) gegen ein
stabiles Verhalten schreibt, ohne den Scanner-Quellcode zu greppen
(Output-Verifikation, T002448-M4):

- **Env-Var-Overrides** (Default in Klammern), analog zu
  `TEST_INVENTORY_OUT` in `scripts/build-test-inventory.sh`:
  `API_INVENTORY_ROUTES_DIR` (`components/website/src/pages/sdlc/api`),
  `API_INVENTORY_OVERLAY` (`docs/agent-guide/registry/api-overlay.yaml`),
  `API_INVENTORY_MCP_REGISTRY` (`docs/agent-guide/registry/mcp.yaml`),
  `API_INVENTORY_FACTORY_MCP_GO` (`scripts/factory/mcp-go/main.go`),
  `API_INVENTORY_OUT` (`components/website/src/data/api-inventory.json`).
- **Exit-Codes:** `0` bei Erfolg (Datei geschrieben); `1` bei mindestens
  einem verwaisten Overlay-Eintrag (Datei **nicht** geschrieben/verändert).
- **Fehlermeldung:** auf stderr, enthält wortwörtlich den Substring `not
  found in scan` sowie die betroffene Gruppe (`routes`|`mcpServers`|
  `mcpTools`) und den Schlüssel in Anführungszeichen — p3 kann per `grep -qF`
  ohne Formatanker prüfen (Semantik statt Darstellung, T002716).
- **Determinismus:** zwei Läufe ohne Zwischenänderung am Baum erzeugen
  byte-identische Ausgabedateien (`diff` exit 0).
- **Top-Level-Schema:** `routes` (Array), `mcpServers` (Array),
  `factoryMcpTools` (Array) — p3 kann `jq '.routes | length'` etc. gegen
  Untergrenzen prüfen (z. B. `> 100` für Routen, `== 13` für mcpServers,
  `== 7` für factoryMcpTools), ohne exakte Zahlen festzuschreiben, die bei
  jeder neuen API-Route drifteten.

## Out of Scope für p2

- `.github/workflows/ci.yml` — bleibt unverändert (Begründung oben).
- `tests/spec/sdlc-cockpit/api-inventory-drift.bats` und
  `components/website/src/data/test-inventory.json` — Aufgabe von p3.
- UI-Modul im Wissen-Deck (design.md S5, „Katalog-Modul") — Teil von E4, nicht
  dieses Changes.
