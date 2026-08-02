# Proposal: ui-config-mcp-seed

_Ticket: T002544_

## Why

Die MCP-Serverliste der llama.cpp-WebUI lebt ausschliesslich im Browser-`localStorage`. Sie ist
damit an **Origin und Browserprofil** gebunden — beim Wechsel des Servers von `:8098` (gpt-oss)
auf `:8091` (gemma26-factory) erschien die Liste leer, obwohl die alten Eintraege noch existierten.
Verschiedene Ports sind verschiedene Origins, also verschiedener Storage.

Die Folgen sind nicht kosmetisch:

- `task mcp:check` sieht die Liste nicht, `docs/agent-guide/registry/mcp.yaml` weiss nichts davon.
  Es ist eine vierte, unsichtbare Konfigquelle neben `.mcp.json`, `.opencode/opencode.jsonc` und
  `~/.gemini/config/mcp_config.json`.
- Jeder Profil-Reset, Portwechsel oder Browserwechsel loescht sie ersatzlos.
- Die Wiederherstellung ist Handarbeit im Dialog, inklusive erneutem Eintippen des Bearer-Tokens.

## What

Die Liste wird **serverseitig vorbelegt** statt im Browser gehalten: `llama-server` bekommt
`--ui-config-file` mit einem generierten Seed, der alle erreichbaren MCP-Server enthaelt.

### Mechanik — empirisch verifiziert

Gemessen am 2026-08-02 gegen llama.cpp `b69-11924d4c1` mit einem Wegwerf-Server auf `:8199`:
Ein `--ui-config-file` mit `{"mcpServers": "<JSON-String-Array>"}` erscheint **woertlich** unter
`/props` → `ui_settings`. Genau dort liest die WebUI ihre Defaults — das Bundle fuehrt
`MCP_SERVERS: "mcpServers"` in derselben Key-Familie wie `temperature` und `presence_penalty`,
liest ueber `jn().mcpServers` und schreibt ueber `Yc.updateConfig(mr.MCP_SERVERS, …)`.

Die UI kennt das Konzept bereits: eine Migration `mcp-default-overrides-merge-v1` mergt
`mcpDefaultServerOverrides` auf `mcpServers[i].enabled`. Vom Server vorgegebene Defaults bleiben
also **vom Nutzer ein- und ausschaltbar** — der Seed entmuendigt niemanden.

### Fallstrick, der den Entwurf praegt

Der Wert ist ein **String, der ein Array enthaelt** (doppelt kodiert). Ein naiv als Array
geschriebener Wert wird von `JSON.parse` verworfen, und das Bundle faengt das mit
`console.warn("[MCP] Failed to parse mcpServers JSON, ignoring value")` still ab: die Liste bleibt
leer, **ohne sichtbaren Fehler**. Der Generator muss die Kodierung erzeugen, und ein Test muss sie
gegen `/props` pruefen — nicht gegen den Quelltext des Generators.

### Zu verdrahtende Server

Alle sieben am 2026-08-02 per `initialize`-Handshake mit HTTP 200 und CORS-Preflight verifiziert:

| Name | URL | Anmerkung |
|---|---|---|
| `k8s` | `http://127.0.0.1:18082/mcp` | CORS-Proxy-Unit vor `:18080` |
| `mcp-postgres` | `http://127.0.0.1:13001/mcp` | CORS nativ |
| `factory-mcp` | `http://127.0.0.1:13003/mcp` | |
| `bge-mcp` | `http://127.0.0.1:13005/mcp` | + Bearer `BGE_MCP_TOKEN` |
| `ticket-mcp` | `http://127.0.0.1:18235/mcp/ticket-mcp` | stdio-Bruecke (T002429) |
| `mcp-task-runner` | `http://127.0.0.1:18235/mcp/mcp-task-runner` | stdio-Bruecke |
| `codebase-memory-mcp` | `http://127.0.0.1:18235/mcp/codebase-memory-mcp` | stdio-Bruecke |

## Design-Entscheidungen

### 1. Der Seed wird generiert, nicht handgepflegt

**Entscheidung:** Eine Generator-Routine liest `docs/agent-guide/registry/mcp.yaml` und erzeugt
daraus den Seed.

**Begruendung:** Eine handgepflegte Seed-Datei waere exakt die vierte Konfigquelle, die dieser
Change beseitigen will. Die Registry ist seit T002300 SSOT fuer alle Harness-Configs; der WebUI-Seed
wird ihr vierter Konsument neben `mcp:sync`s bestehenden drei.

### 2. Ausschliesslich `gemma26-factory` bekommt `uiConfigFile`

**Entscheidung:** Nur das Loadout `gemma26-factory` (Port 8091). **Nicht** `gptoss-context`,
`devstral-quality`, `gemma-factory` oder `gemma-multiagent` — und nicht die vier `bge-*`.

**Begruendung:** Gemma 4 26B A4B ist das festgelegte Modell fuer alle Aufgaben (Betreiber-Vorgabe,
2026-08-02). Ein Seed an einem Loadout, das nicht laufen soll, waere toter Ballast und wuerde
suggerieren, dass die Alternativen als Chat-Instanz vorgesehen sind. Die vier `bge-*` scheiden
ohnehin aus: sie sind Embedding- und Rerank-Server ohne Chat-UI.

**Konsequenz fuer den Entwurf:** `uiConfigFile` bleibt ein **optionales** Feld pro Loadout, kein
globaler Default. Wer spaeter ein weiteres Loadout ausstatten will, setzt es dort — die Mechanik
traegt das, die Belegung ist bewusst eine einzelne.

**Bekannte Wechselwirkung:** `gemma26-factory` teilt `exclusiveGroup: "chat-gpu"` mit
`gptoss-context`, `devstral-quality`, `gemma-factory` und `gemma-multiagent`. Es kann also ohnehin
nur eines davon gleichzeitig laufen; die Vorgabe „nur 26B" macht aus einer technischen
Ausschliesslichkeit eine betriebliche.

### 3. `BGE_MCP_TOKEN` erreicht keine getrackte Datei

**Entscheidung:** Ein Template mit unexpandiertem `${BGE_MCP_TOKEN}` liegt im Repo. Beim Start wird
es per `envsubst` in eine Laufzeitdatei **ausserhalb** des Repos gerendert, die `--ui-config-file`
bekommt.

**Begruendung:** Derselbe Weg, den `docs/agent-guide/registry/mcp.yaml` seit T002487 fuer denselben
Token nutzt. Die Alternative — Token weglassen und den Nutzer einmalig eintippen lassen — waere
genau die Handarbeit, die dieser Change abschafft.

**Betriebsvoraussetzung:** `BGE_MCP_TOKEN` muss in der Umgebung der Unit gesetzt sein. Quelle ist
`~/.config/bge-mcp/server.env`, dieselbe Datei, die `bge-mcp.service` per `EnvironmentFile=` liest.

### 4. `--ui-mcp-proxy` bleibt aus

**Entscheidung:** Das Flag wird nicht gesetzt.

**Begruendung:** Alle sieben Endpunkte senden bereits CORS-Header — `mcp-kubernetes` ueber die
`mcp-cors-proxy`-Unit, die uebrigen nativ. Das Flag ist upstream als „experimental — do not enable
in untrusted environments" markiert und wuerde nichts gewinnen, was nicht schon funktioniert.
`/props` liefert `cors_proxy_enabled` maschinenlesbar zurueck, der Zustand ist also pruefbar.

## Abgrenzung

- **Nicht** Teil dieses Changes: der stille Tod des `kubectl port-forward` (T002543). Er betrifft
  zwei der sieben Endpunkte, ist aber eine eigene Ursache mit eigener Loesung.
- **Nicht** Teil: die fuenf aus `mcp-bridge.json` entfernten stdio-Server (T002542, gemergt). Wer
  sie zurueckwill, aktiviert sie dort — der Seed folgt der Registry.
- **Nicht** Teil: das Stilllegen oder Entfernen der uebrigen Chat-Loadouts. Die Vorgabe „nur 26B"
  wird hier nur insoweit umgesetzt, als kein anderes Loadout einen Seed bekommt. Ob
  `gptoss-context`, `devstral-quality`, `gemma-factory` und `gemma-multiagent` aus
  `scripts/llm/loadouts.json` verschwinden und ob die Factory-Routing-Eintraege vom 12B auf den 26B
  umgestellt werden, ist ein eigener Vorgang mit eigener Pruefung.
