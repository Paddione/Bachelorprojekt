# Proposal: bge-mcp-windows-start

## Why

Die Entwicklungsumgebung ist von WSL auf Windows-nativ umgestellt (T016422). Zwei
MCP-Server sind dabei zurueckgeblieben:

1. **`bge-mcp` startet auf Windows ueberhaupt nicht.** Der Shim laedt
   `components/website/src/lib/bge-router.ts` per dynamischem `import()` und uebergibt dabei
   einen absoluten Pfad. Node verlangt auf Windows eine `file://`-URL und bricht mit
   `ERR_UNSUPPORTED_ESM_URL_SCHEME` ab ("Received protocol 'c:'"), bevor irgendeine
   Fachlogik laeuft. Auf Linux ist der Pfad POSIX und der Import gelingt — deshalb
   faellt der Defekt nur auf Windows auf.

2. **`mcp-task-runner` ist ohne Not deaktiviert.** Die Registry begruendet
   `harness.opencode.enabled: false` damit, es handle sich um ein Linux-Binary ohne
   Windows-PATH-Eintrag. Das trifft nicht zu: der Server ist reines Node.js;
   `/usr/local/bin/mcp-task-runner` ist lediglich ein Bash-Wrapper, der `node server.mjs`
   aufruft.

Beides zusammen kostet die Faehigkeit `embedding-rerank`, fuer die
`docs/agent-guide/registry/capabilities.yaml` `mcp:bge-mcp` als `state: canonical` fuehrt:
solange der Shim nicht startet, hat der Orchestrator kein Embedding- und kein
Rerank-Werkzeug.

Hinzu kommt, dass der einzige Startmechanismus die systemd-Units unter `scripts/bge-mcp/`
sind. Sie pinnen `LLM_EMBED_URL`/`LLM_RERANKER_URL` auf den WSL-llm-proxy
`127.0.0.1:18235`, den es ohne WSL nicht mehr gibt.

Die Backends selbst sind gesund und von Windows aus erreichbar (fleet, Namespace
`workspace`: `bge-embed` und `bge-rerank` je `1/1 Running`); ein Port-Forward auf
`llm-gateway-embed`/`-rerank` liefert verifiziert Embeddings und Rerank-Scores.

## What

**1. Bugfix `scripts/bge-mcp/server.mjs`:** Der Router-Pfad wird vor dem `import()` mit
`pathToFileURL()` in eine `file://`-URL umgewandelt. Das ist auf Linux verhaltensgleich
und behebt den Windows-Abbruch.

**2. Registry-Korrektur `docs/agent-guide/registry/mcp.yaml`:** `mcp-task-runner` wird fuer
`harness.opencode` auf den direkten Node-Aufruf mit repo-relativem Pfad umgestellt und
aktiviert — analog zu `ticket-mcp-node` und `brain-mcp-node`. Der `bge-mcp`-Eintrag fuer
`harness.opencode` wird ebenfalls aktiviert. Die generierten Configs entstehen
ausschliesslich ueber `task mcp:sync`.

**3. Windows-Startmechanismus als systemd-Ersatz:** Ein PowerShell-Skript nach dem
bestehenden Muster aus `scripts/llm/pk-devices/` startet die benoetigten Port-Forwards und
den bge-Shim mit gesetzten Upstream-Variablen. Es ersetzt auf Windows das, was unter Linux
die systemd-Units leisten.

**Ausdruecklich NICHT Teil dieses Changes** (die bge-Infrastruktur bleibt unangetastet):
`components/website/src/lib/bge-router.ts`, `k3d/llm-gpu.yaml`,
`scripts/llm-proxy/bge-routes.mjs` sowie die `LLM_EMBED_URL`/`LLM_RERANKER_URL`-Eintraege in
`environments/*.yaml`. Die Linux-systemd-Units bleiben ebenfalls bestehen — der Change
ergaenzt Windows, er entfernt Linux nicht.

_Ticket: T900039_
