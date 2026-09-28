## Task p2: Adapter für claude und opencode

Context. Ticket T900791, Spec `design.md` Abschnitt 2. Setzt p1 voraus
(`scripts/toolset/lib/resolve.mjs`). Adapter sind reine Funktionen: Dateitext rein, Dateitext
raus. Kein I/O, damit `check.mjs` sie im Speicher für die Drift-Prüfung nutzen kann.

Ist-Stand (2026-09-28): `.claude/settings.json` hat `disabledMcpjsonServers:
["playwright","task-master-ai"]`. `.mcp.json` listet unter `mcpServers` die Server
`codebase-memory-mcp, context7, mcp-kubernetes, mcp-task-runner, playwright, ticket-mcp-node,
warden`. `.opencode/opencode.jsonc` hat 89 Kommentarzeilen und unter dem Key `"mcp"` je
Server-Block (4 Leerzeichen Einzug für den Namen) eine Zeile `"enabled": true|false`
(6 Leerzeichen Einzug). Die heutige opencode-Logik in `sync.mjs` sucht `config.mcpServers`,
das in der Datei nicht existiert.

Target files:

- `scripts/toolset/lib/adapters/claude.mjs` (NEW)
- `scripts/toolset/lib/adapters/opencode.mjs` (NEW)
- `scripts/toolset/lib/adapters/index.mjs` (NEW)

### Steps

- [ ] Step 1 — `claude.mjs`:
  ```js
  export const file = '.claude/settings.json';
  // ctx = { toolset: Set, registryMcp: Set (alle mcp:-Namen der Registry),
  //         suppressedMcp: Set, projectMcp: Set (Server-Namen aus .mcp.json) }
  export function render(currentText, ctx) { … }
  ```
  Ergebnis: `disabledMcpjsonServers` = sortierte Vereinigung aus `ctx.suppressedMcp` und allen
  Namen `n` in `ctx.projectMcp` mit `ctx.registryMcp.has(n) && !ctx.toolset.has('mcp:' + n)`.
  Alle anderen Keys bleiben in ihrer Reihenfolge erhalten. Ausgabe
  `JSON.stringify(obj, null, 2) + '\n'`, das Format, das `sync.mjs` heute schon schreibt.
- [ ] Step 2 — `opencode.mjs`:
  ```js
  export const file = '.opencode/opencode.jsonc';
  // ctx = { toolset: Set, registryMcp: Set }
  export function render(currentText, ctx) { … }
  ```
  Zeilenweise Verarbeitung: Innerhalb des `"mcp": {`-Blocks merkt sich der Adapter den aktuellen
  Server-Namen (Zeile `/^    "([^"]+)": \{/`) und ersetzt in einer Zeile
  `/^(\s*"enabled":\s*)(true|false)/` nur den Wert. Nur Server mit `ctx.registryMcp.has(name)`
  werden angefasst, der Wert ist `ctx.toolset.has('mcp:' + name)`. Jede andere Zeile, auch
  Kommentare, bleibt byte-identisch. Endet der Block (`/^  \}/`), stoppt die Verarbeitung.
- [ ] Step 3 — `index.mjs`:
  ```js
  import * as claude from './claude.mjs';
  import * as opencode from './opencode.mjs';
  export const ADAPTERS = { claude, opencode };
  ```
- [ ] Step 4 — Probe gegen die echten Dateien. Beide Renders gegen den aktuellen Dateitext
  ausführen und das Ergebnis mit `diff` gegen die Datei vergleichen. opencode: kein Diff.
  claude: einziger Unterschied ist `mcp-task-runner` zusätzlich in `disabledMcpjsonServers`
  (Effekt E1 aus dem Design).
- [ ] Step 5 — Commit:
  ```bash
  git add scripts/toolset/lib/adapters/claude.mjs scripts/toolset/lib/adapters/opencode.mjs scripts/toolset/lib/adapters/index.mjs
  git commit -m "feat(T900791): claude and opencode toolset adapters [T900791]"
  ```

### Acceptance criteria

- [ ] opencode-Render gegen die echte Datei ist byte-identisch (Kommentare bleiben erhalten).
- [ ] claude-Render weicht nur um `mcp-task-runner` ab.
- [ ] Keine anderen Dateien geändert.
