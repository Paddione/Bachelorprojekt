# Design: node-mcp-servers

## Entscheidungen

### D1: Zero npm dependencies — stdlib only

Alle drei Server nutzen ausschliesslich Node.js Core-Module:
`fs`, `path`, `child_process`, `http`, `crypto`, `readline`, `json`, `util`, `events`.

**Begründung:** Die Go/Python-Quellen haben keine externen Dependencies.
Die Portierung MUSS das beibehalten, sonst entsteht neue Angriffsfläche und
ein neuer Abhängigkeits-Pflegeaufwand. Die shell-wrapper-Architektur braucht
keine Libraries — `child_process.spawn/execFileSync` genügt.

**Konsequenz:** `package.json` pro Server existiert nur als Workspaces-Marker,
nicht als Dependency-Manager. `npm install` ist nie nötig.

### D2: Stdio für ticket-mcp und brain-mcp, HTTP für factory-mcp

- **ticket-mcp**: `stdio` wie der Go-Server. `readline`-basierte JSON-RPC-Verarbeitung.
- **brain-mcp**: `stdio` wie der Python-Server. `readline`-basierte JSON-RPC-Verarbeitung.
- **factory-mcp**: `HTTP` (Streamable HTTP) wie der Go-Server. `createServer` mit
  `/mcp`- und `/health`-Endpunkten.

**Begründung:** Die Transport-Festlegung ist Teil der mcp.yaml-Registry.
Ein Wechsel des Transports wäre eine Verhaltensänderung (nicht erlaubt, T002690).

### D3: BM25-Index als eigenständiges `index.mjs`

Die Brain-Wiki-BM25-Logik (Tokenisierung, IDF-Berechnung, Scoring, Snippet-Extraktion,
Frontmatter-Parser, Freshness-Filter) wird als `index.mjs` ausgelagert, `server.mjs`
importiert sie.

**Begründung:** Testbarkeit. Der BM25-Algorithmus ist der einzige nicht-triviale
Code-Pfad. Er braucht Unit-Tests mit definierten Eingabe-/Ausgabepaaren, die
nicht den MCP-RPC-Layer mit testen müssen.

**Übersetzung Python → Node.js (1:1):**
```python
# Python: re.findall(r"\w+", text)
# Node.js:  text.match(/\w+/g) || []

# Python: math.log(x)
# Node.js:  Math.log(x)

# Python: datetime.fromisoformat(s)
# Node.js:  new Date(s) + UTC-Normalisierung

# Python: Path(wiki_dir).rglob("*.md")
# Node.js:  require('fs').readdirSync(dir, {recursive: true}).filter(...)
```

### D4: ticket-mcp/runner.mjs als gemeinsamer Shell-Executor

Alle 22 Tools rufen `scripts/ticket.sh` auf. Der Runner kapselt:
- Arg-Validierung (enum, required, length)
- `child_process.spawn` mit Timeout
- Buffering von stdout/stderr
- JSON-Output-Parsing
- Error-Propagation mit kontextuellen Messages

**Begründung:** Der Go-Code hat in jeder der 7 Tool-Dateien dieselbe
`exec.Command` + `strings.TrimSpace` + `mcp.NewToolResultText`-Schleife.
Als shared runner eliminiert das ~40% Boilerplate.

**Sicherheits-Guard:** Args werden gegen `scripts/ticket.sh` mit einem
erlaubten Zeichen-Set gefiltert (alphanumeric, `_:./-`, kein `-` prefix) —
identisch zum bestehenden `mcp-task-runner/runner.mjs` Muster (T002301).

### D5: factory-mcp/ — factory_ask LLM-Proxy unverändert

Das `factory_ask`-Tool ist der komplexeste Teil: es ruft ein lokales Qwen 3.5 9B
über LMStudio auf, extrahiert `reasoning_content` bei Qwen3-Modellen, und
parsen rohe Tool-Call-Syntax (`<|tool_call|>...<tool_call|>`).

**Begründung:** Die LLM-Proxy-Logik ist rein HTTP (OpenAI-compatible chat/completions).
Die Extraktion der reasoning traces und der Tool-Call-Syntax-Parser sind
sprachagnostisch. Sie werden 1:1 in Node.js übersetzt.

### D6: Parallel-Start während Migration

Während der Migration laufen beide Versionen (alt und neu) parallel:
- Go-Binary `/usr/local/bin/ticket-mcp-go` bleibt installiert.
- Node.js `ticket-mcp-node/server.mjs` wird über `scripts/mcp-sync.sh`
  in die Harness-Configs eingetragen.
- BATS-Tests laufen gegen BEIDE Versionen und vergleichen die Output-Formatierung.
- Nach grünen Tests wird die alte Binary entfernt.

**Begründung:** Risk-Minimierung. Ein einzelner Feature-Ticket-Change bricht
nicht alle drei MCP-Server gleichzeitig.

### D7: Verworfen — Unified Monorepo-Server

Idee: Alle drei Server in einem einzigen Node.js-Prozess mit Routing:
```
/scripts/mcp-node/server.mjs
  /brain/     → brain-mcp tools
  /factory/   → factory-mcp tools
  /ticket/    → ticket-mcp tools
```

**Warum verworfen:**
- Verletzt das Single-Responsibility-Prinzip jedes Servers.
- Der `mcp.yaml`-Registry-Eintrag erwartet pro Server eine eigene Config.
- Der `mcp-gateway`-Bridge-Mechanismus (port 18235) mappet 1:1 Server→Route.
- Ein Monolith würde einen Rewrite des Bridges erfordern (Verhaltensänderung).
- Der Go/Python-Status Quo hat drei separate Prozesse — das ist die beabsichtigte
  Architektur, nicht eine Limitation.

## Verworfen

- **TypeScript statt JavaScript:** Die bestehenden stdlib-Server (bge-mcp,
  mcp-task-runner, mcp-postgres-local) sind alle `.mjs`/ESM. TypeScript würde
  einen zusätzlichen Build-Schritt einführen. Pure JavaScript (ESM) ist konsistent.
- **Eigene npm-Pakete veröffentlichen:** Die Server sind repo-intern.
  `scripts/mcp-sync.sh` deployt sie als file-paths, nicht als npm-Packages.
  Ein `npm publish` ist nicht nötig.
- **Portierung von docfork, sequential-thinking, playwright, github, webresearch:**
  Alle sind 3rd-party, aktiv gepflegt, und haben entweder keinen project-relevanten
  Bedarf (playwright, webresearch, sequential-thinking, docfork) oder sind durch
  andere Pfade ersetzt (github → gh-axi).
