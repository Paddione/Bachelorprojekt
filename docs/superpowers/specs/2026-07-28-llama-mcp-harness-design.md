---
ticket_id: T002398
plan_ref: null
status: active
date: 2026-07-28
---

# llama.cpp als vierter MCP-Harness — Design

`docs/agent-guide/registry/mcp.yaml` wird um einen `harness.llamacpp`-Block erweitert, aus dem
`scripts/mcp-sync.sh` eine Cursor-Format-Datei generiert, die `llama-server` über
`--mcp-servers-config` einliest. Damit laufen ausgewählte MCP-Server als stdio-Kindprozesse von
`llama-server`; die eingebaute WebUI wird zum lokalen Agenten, und Kindticket-Arbeiten auf
Stufe 2 (Tool-Schleifen) bekommen ihre Grundlage.

Teil von Epic **T002397** („LLM-Konsumenten erden"), Voraussetzung für die Stufe-2-Anteile von
T002399–T002404.

## Problem

llama.cpp b10155 kann MCP-Server einbinden, erwartet dafür aber eine eigene Konfigurationsdatei.
Das Repo hat seit T002300 die Regel, dass MCP-Konfiguration **nirgends von Hand** gepflegt wird:
`mcp.yaml` ist SSOT, `task mcp:sync` generiert daraus `.mcp.json`, `.opencode/opencode.jsonc`
und `~/.gemini/config/mcp_config.json`, `task mcp:check` erkennt Drift. Eine vierte,
handgepflegte Datei würde genau die Drift wieder einführen, gegen die T002300 gebaut wurde.

## Befunde, die das Design bestimmen

**B1 — llama.cpp spricht MCP ausschließlich über stdio.** `tools/server/server-mcp.h` deklariert
genau eine Transport-Implementierung, `server_mcp_stdio`; `server-mcp.cpp` enthält keinen einzigen
Treffer für `url`, `http`, `sse` oder `streamable`. llama-server **startet** MCP-Server als
Kindprozesse, es **verbindet** sich nicht zu laufenden. Von den zwölf Servern der Registry sind
`mcp-kubernetes` (:18080), `mcp-postgres` (:13001) und `factory-mcp` (:13003) HTTP-Endpunkte und
damit strukturell ausgeschlossen.

**B2 — Das Konfigurationsformat ist Cursor-kompatibel.** `server_mcp_server_config` liest
`mcpServers` mit den Feldern `command`, `args`, `env` (über die Elternumgebung gemerged), `cwd`
und `timeout_ms` (Default 30000, gilt pro Tool-Aufruf). Einträge ohne `command` werden
übersprungen, fehlendes `mcpServers` ergibt eine leere Liste — llama.cpp meldet in beiden Fällen
**keinen Fehler**.

**B3 — Tools erreichen `/v1/chat/completions` nicht.** Die aggregierten Tools (MCP plus die
eingebauten aus `--tools`) liegen unter `GET /tools` (Katalog) und `POST /tools`
(`{tool, params, stream}`). Ein Client muss sie selbst in sein `tools`-Array schreiben und
`tool_calls` selbst ausführen. Für dieses Ticket ist das kein Hindernis — die WebUI implementiert
die Schleife bereits — aber es ist der Grund, warum die Stufe-2-Kindtickets eigene Arbeit sind.

**B4 — `ticket-mcp-go` läuft ohne Anpassung.** Es ist stdio, wird von `task ticket-mcp:build`
über `make -C scripts/ticket-mcp/go build` erzeugt und nach `/usr/local/bin/ticket-mcp-go`
installiert (das Binary selbst ist gitignored, die Registry referenziert es über den PATH-Namen,
T002301). Es braucht `TICKET_MCP_REPO_ROOT` bzw. ein passendes `cwd` — beides deckt B2 ab.

## Entscheidungen

### E1 — Vierter Renderer in `mcp-sync.sh`, kein neues Werkzeug

`scripts/mcp-sync.sh` ist 167 Zeilen mit drei `render_*`-Funktionen, `diff_or_drift`,
`cmd_render` und `cmd_check`. Ein `render_llamacpp_json()` fügt sich in dieses Muster ein; Drift-
Erkennung und CI-Anbindung erbt es unverändert. Ein separater Generator hätte eigene
Drift-Logik, eigene Tests und eine zweite Stelle, an der man die Registry parst.

Zieldatei: `scripts/llm/mcp-servers.json`, committet. Sie liegt neben `loadouts.json` (T002394),
weil beide zusammen den llama-server-Start beschreiben.

### E2 — Opt-in pro Server, nicht „alle stdio automatisch"

Ein Server wird nur angehängt, wenn er einen `harness.llamacpp`-Block hat. Startwert:
`ticket-mcp` und `codebase-memory-mcp`.

Begründung: jeder MCP-Server wird ein **Kindprozess von llama-server**. Alle neun stdio-Server
automatisch anzuhängen bedeutet neun Prozesse, neun Startverzögerungen und neun Fehlerquellen bei
jedem Modellstart — sechs davon (`github-mcp`, `playwright`, `docfork`, `sequential-thinking`,
`webresearch`, `task-master-ai`) laufen über `npx` und können beim Start einen Paket-Check
auslösen. Ein Modellstart, der heute 25 s dauert, wäre dann unkalkulierbar. Opt-in macht jede
Erweiterung zu einer bewussten Entscheidung mit sichtbarem Diff.

### E3 — `harness.llamacpp` an einem HTTP-Server ist ein harter Fehler

`render` und `check` brechen mit Klartext ab, wenn ein Server mit `transport: http` einen
`llamacpp`-Block trägt.

Begründung: llama.cpp überspringt Einträge ohne `command` **wortlos** (B2). Ohne diese Regel
entstünde eine Konfiguration, die syntaktisch gültig ist, vom Server stillschweigend verworfen
wird und deren Fehlen erst auffällt, wenn ein Tool im Katalog fehlt. Fail-closed im Generator
verlegt den Fehler an die Stelle, an der er verursacht wird.

### E4 — Tool-fähige Loadouts binden auf `127.0.0.1`

Loadouts, die `mcp.serversConfig` setzen, verwenden `host: 127.0.0.1` statt des Defaults
`0.0.0.0`.

Begründung: ein `llama-server` mit angehängtem `ticket-mcp` kann Tickets **schreiben**; mit
`--tools` kämen `write_file` und `exec_shell_command` dazu. llama.cpp beschränkt bei aktivem
`--tools` automatisch `--cors-origins` auf localhost — das schützt vor fremden Webseiten, **nicht**
vor direkten Anfragen aus dem Netz. Der Bind ist der wirksame Riegel. Die Regel wird in
`loadouts.mjs` (T002394) als Validierung durchgesetzt, nicht nur dokumentiert.

Die eingebauten Tools aus `--tools` bzw. `-ag/--agent` sind **nicht** Teil dieses Tickets.

## Datenmodell

Ergänzung je Server in `docs/agent-guide/registry/mcp.yaml`:

```yaml
  ticket-mcp:
    transport: stdio
    command: ticket-mcp-go
    harness:
      claude_code:
        command: ticket-mcp-go
      agy:
        command: ticket-mcp-go
      opencode:
        type: local
        command: [ticket-mcp-go]
        enabled: true
      llamacpp:                       # NEU
        command: ticket-mcp-go
        args: []
        env:
          TICKET_MCP_REPO_ROOT: /home/patrick/Bachelorprojekt
        cwd: /home/patrick/Bachelorprojekt
        timeout_ms: 30000
```

Erzeugte Datei `scripts/llm/mcp-servers.json`:

```json
{
  "mcpServers": {
    "ticket-mcp": {
      "command": "ticket-mcp-go",
      "args": [],
      "env": { "TICKET_MCP_REPO_ROOT": "/home/patrick/Bachelorprojekt" },
      "cwd": "/home/patrick/Bachelorprojekt",
      "timeout_ms": 30000
    },
    "codebase-memory-mcp": { "…": "…" }
  }
}
```

Felder ohne Wert im Registry-Block werden **weggelassen**, nicht als `null` oder `""` emittiert —
llama.cpp würde ein leeres `command` als „überspringen" behandeln (B2).

## Datenfluss

```
mcp.yaml  ──task mcp:sync──►  .mcp.json
                          ├─►  .opencode/opencode.jsonc
                          ├─►  ~/.gemini/config/mcp_config.json
                          └─►  scripts/llm/mcp-servers.json      (NEU)
                                        │
                     loadouts.json ─────┤ mcp.serversConfig
                                        ▼
                            llama-server --mcp-servers-config …
                                        │  startet je Server einen stdio-Kindprozess
                                        ▼
                                  GET /tools   (Katalog)
                                  POST /tools  (Ausführung)
                                        ▲
                                  WebUI :8098  (implementiert die Schleife bereits)
```

## Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| `llamacpp`-Block an `transport: http`-Server | `render` und `check` brechen ab, nennen Servernamen und Transport |
| `llamacpp`-Block ohne `command` | Abbruch mit Klartext — nicht emittieren, damit llama.cpp nicht still überspringt |
| Kein Server hat einen `llamacpp`-Block | Gültige Datei mit leerem `mcpServers`-Objekt; kein Fehler |
| Generierte Datei weicht ab | `task mcp:check` meldet Drift wie bei den drei bestehenden Zielen |
| `ticket-mcp-go` fehlt auf dem PATH | Nicht Sache des Generators. llama-server meldet den Startfehler des Kindprozesses; `task ticket-mcp:build` ist der Fix. |
| Loadout setzt `mcp.serversConfig` mit `host: 0.0.0.0` | `loadouts.mjs` lehnt ab (E4) |

## Tests

BATS in `tests/spec/mcp-tooling.bats` („MCP tool registration & permission guards" — die
zuständige Datei):

- `scripts/llm/mcp-servers.json` ist gültiges JSON mit `mcpServers`-Objekt
- jeder Eintrag hat ein nicht-leeres `command`
- kein Server mit `transport: http` aus der Registry taucht in der Datei auf
- `task mcp:check` meldet Drift, wenn die Datei manipuliert wird
- ein `llamacpp`-Block an einem HTTP-Server lässt `mcp-sync.sh render` fehlschlagen

Der vorletzte Punkt ist der wichtigste: er prüft, dass die neue Datei tatsächlich an der
Drift-Erkennung hängt und nicht nur einmal erzeugt wurde.

## Nicht-Ziele

- **Keine HTTP-MCP-Server an llama.cpp.** Strukturell unmöglich (B1), nicht nachrüstbar.
- **Keine eingebauten Tools** (`--tools`, `-ag/--agent`). Eigene Sicherheitsabwägung, eigenes
  Ticket.
- **Keine Tool-Schleife in irgendeinem Konsumenten.** Das sind T002399–T002404.
- **Kein Autostart der MCP-Server außerhalb von llama-server.** Sie leben als dessen
  Kindprozesse; wer sie einzeln braucht, nutzt weiterhin die Harness-Configs.
