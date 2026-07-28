# p4 — bge-MCP-Shim und Registrierung

**Rolle:** impl · **depends_on:** p2 · **target_files:**
`scripts/bge-mcp/server.mjs`, `scripts/llm/mcp-servers.json`,
`docs/agent-guide/registry/mcp.yaml`

## Ziel

Embedding und Reranking als MCP-Ressource anbieten, sodass Agenten sie über MCP statt über rohe
HTTP-Endpunkte erreichen — ohne Modellnamen, Ports oder Vektordimensionen zu kennen.

## Warum ein eigener Server nötig ist

`llama-server` kann sich **nicht selbst als MCP-Server exponieren**. Das Flag
`--mcp-servers-config`, gesetzt in `scripts/llm-proxy/runner.mjs:45`, ist llama.cpps
MCP-*Client*-Pfad: darüber ruft das Modell fremde Tools auf. Die umgekehrte Richtung — das Modell
als Ressource anbieten — existiert dort nicht. Der Shim ist deshalb kein Umweg, sondern die
einzige Bauform, die die Anforderung erfüllt.

## Vorgaben

- **Transport ist HTTP/SSE, nicht stdio.** Das ist eine harte Festlegung, keine Präferenz. Die
  Web-UI von `llama-server` (Seite „MCP Servers") nimmt beim Hinzufügen ausschließlich eine
  **URL** entgegen — ein stdio-Shim wäre dort prinzipiell unerreichbar. HTTP macht ihn in beiden
  Welten nutzbar: direkt in der llama-UI eintragbar und über die Registry an Claude Code,
  opencode und agy verteilbar. Der stdio-Weg (`--mcp-servers-config`, T002398) ist eine
  **andere** Anbindung und hier ausdrücklich nicht gemeint.
- **Bind auf `127.0.0.1` plus Bearer-Token.** Über HTTP entfällt die implizite Authentifizierung,
  die stdio dadurch hat, dass nur der startende Prozess den Server erreicht. Das Feld
  `Authorization / Bearer` im UI-Dialog ist der vorgesehene Weg.
- **Zwei Tools:** eines für Embedding (Text rein, Vektor raus), eines für Reranking (Query plus
  Kandidaten rein, absteigend sortierte Ergebnisse raus).
- **Der Shim ruft den Router aus p2 auf.** Er hält keine eigene Failover-Logik und keinen eigenen
  Health-Check. Welches Paar antwortet, bleibt dem Aufrufer verborgen.
- **Zwei Registrierungsorte, zwei verschiedene Zwecke — nicht verwechseln.**
  `scripts/llm/mcp-servers.json` ist die Liste der MCP-Server, die *ein llama.cpp-Modell als
  Client* aufrufen darf. `docs/agent-guide/registry/mcp.yaml` ist die SSOT (T002300), aus der
  `task mcp:sync` die drei Harness-Configs erzeugt — dort gehört der Eintrag hin, damit Claude
  Code, opencode und agy den Server sehen.
- **Configs nie von Hand editieren.** `.mcp.json`, `.opencode/opencode.jsonc` und
  `~/.gemini/config/mcp_config.json` werden generiert. Die Änderung geht in die Registry, danach
  läuft `task mcp:sync`; `task mcp:check` prüft auf Drift.
- **`.mjs`-Limit 500**, mit Reserve darunter schneiden.

## Schritte

- [x] `scripts/bge-mcp/server.mjs` anlegen: MCP-Server mit den beiden Tools, der für jede Anfrage
      den Router aus p2 konsultiert und das ermittelte Paar anspricht.
- [x] Fehlerverhalten festlegen: sind beide Paare aus, meldet das Tool einen Fehler an den
      Aufrufer, statt leere Vektoren oder unsortierte Kandidaten zurückzugeben.
- [x] Eintrag in `docs/agent-guide/registry/mcp.yaml` ergänzen, in der Form der bestehenden
      Einträge (`codebase-memory-mcp`, `ticket-mcp` sind die nächstliegenden Vorbilder).
- [x] `task mcp:sync` ausführen und die generierten Configs mitcommitten; anschließend
      `task mcp:check` auf Drift prüfen.
- [x] `scripts/llm/mcp-servers.json` **unverändert lassen.** Diese Datei ist das Ziel von
      `--mcp-servers-config` und nimmt laut Registry-Kopfkommentar ausschließlich
      `transport: stdio` auf; ein HTTP-Server dort lässt `mcp:sync` fail-closed abbrechen. Die
      Datei steht nur deshalb im Manifest, damit die Prüfung „gehört der Shim hier hinein?"
      dokumentiert beantwortet ist — die Antwort ist nein.
- [x] Den Shim in der llama-UI (`http://localhost:8098/#/mcp-servers`, „Add New Server") als URL
      eintragen und verifizieren, dass beide Tools dort erscheinen. Schlägt die Verbindung aus
      dem Browser mit einem CORS-Fehler fehl, ist der Server ohne CORS-Header gestartet — dann
      greift die `--ui-mcp-proxy`-Option aus p1, die llama-server serverseitig verbinden lässt.

## Abgrenzung

Keine Änderung an der Routing-Bibliothek und keine an den HTTP-Endpunkten aus p3.
