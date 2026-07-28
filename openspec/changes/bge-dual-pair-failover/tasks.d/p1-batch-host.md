# p1 — Batch-Paar auf dem Host (CPU, Autostart, Watchdog)

**Rolle:** impl · **depends_on:** — · **target_files:**
`scripts/llm/start-embed-batch-server.ps1`, `scripts/llm/start-rerank-batch-server.ps1`,
`scripts/llm/register-scheduled-tasks.ps1`, `scripts/llm/watchdog-llm-servers.ps1`,
`scripts/llm/loadouts.json`, `scripts/llm-proxy/runner.mjs`

## Ziel

Ein zweites bge-Paar auf demselben Windows-Host, das ausschließlich im CPU-RAM läuft und kein
VRAM belegt: `bge-m3` auf Port **8085**, `bge-reranker-v2-m3` auf Port **8086**. Beide starten
automatisch und werden vom bestehenden Watchdog mitüberwacht.

## Vorgaben

- **Ports 8085/8086.** Frei geprüft gegen den Bestand: 8091 (Gemma), 8093/8094 (Bonsai),
  8095/8096 (Paar B), 8098 (gpt-oss), 8099 (Devstral). Kein Port aus diesem Satz darf belegt
  werden.
- **`-ngl 0` ist nicht konfigurierbar.** Der Sinn des Batch-Paars ist, kein VRAM zu belegen. Der
  Parameter wird auf 0 festgeschrieben, nicht als Default mit Override angeboten — ein versehentlich
  auf GPU gestartetes Batch-Paar würde genau die Priorität verletzen, die dieser Vorgang herstellt.
- **Flag-Satz spiegelt die Bestandsskripte.** `scripts/llm/start-embed-server.ps1` verwendet
  `--embedding --pooling cls --embd-normalize 2 --parallel 1 --host 0.0.0.0 --port <n>`.
  `--pooling cls` muss explizit gesetzt bleiben, sonst greift der GGUF-Modell-Default (Befund aus
  T002110). Das Rerank-Skript verwendet entsprechend `RANK`-Pooling.
- **Zwei Prozesse sind zwingend.** llama.cpp kann CLS-Pooling (Embedding) und RANK-Pooling
  (Rerank) nicht in einem Prozess betreiben. Kein Versuch, beide Rollen zusammenzulegen.
- **`--fit` NICHT setzen.** Bei `-ngl 0` ist es wirkungslos und würde den Eindruck erwecken, das
  Paar nehme am VRAM-Wettbewerb teil.
- **CRLF beachten.** Die `.ps1`-Dateien im Repo sind durchgehend CRLF. Neue Dateien in derselben
  Zeilenende-Konvention anlegen, damit Guards, die auf `[[:space:]]*$` ankern, greifen.

## Schritte

- [ ] `scripts/llm/start-embed-batch-server.ps1` anlegen, formgleich zu
      `start-embed-server.ps1`, aber mit `$Port = 8085`, festem `-ngl 0` und angepassten
      Ausgabetexten (Endpoint-Hinweis auf 8085). Die Port-Räumlogik über
      `Get-NetTCPConnection -LocalPort $Port -State Listen` übernehmen.
- [ ] `scripts/llm/start-rerank-batch-server.ps1` analog zu `start-rerank-server.ps1` anlegen,
      `$Port = 8086`, festes `-ngl 0`, `RANK`-Pooling.
- [ ] `scripts/llm/register-scheduled-tasks.ps1` um beide neuen Server erweitern —
      `At system startup`, `RunAs SYSTEM`, Restart-on-failure, gleiche Form wie die bestehenden
      Einträge.
- [ ] `scripts/llm/watchdog-llm-servers.ps1` um beide neuen Ports erweitern, sodass ein toter
      Batch-Server ebenso neu gestartet wird wie die Bestandsserver.
- [ ] `scripts/llm/loadouts.json` um Einträge für beide Batch-Server ergänzen: `fit.enabled: false`,
      `args.ngl: 0`, `args.parallel` passend zur Batch-Last, `mcp.serversConfig: null`. Das Feld
      `notes` hält fest, warum dieses Paar bewusst CPU-gebunden ist.
- [ ] **`--ui-mcp-proxy` als Loadout-Option nachrüsten.** Zuerst prüfen, ob der vorhandene Build
      das Flag kennt:

      ```bash
      "/mnt/c/Users/PatrickKorczewski/llama-b10090-13.3/llama-server.exe" --help | grep -i 'ui-mcp-proxy'
      ```

      Kennt er es, ein optionales Feld (etwa `args.uiMcpProxy`) in `loadouts.json` einführen und
      in `scripts/llm-proxy/runner.mjs` auf `--ui-mcp-proxy` abbilden — an derselben Stelle, an
      der heute `mcp.serversConfig` auf `--mcp-servers-config` abgebildet wird (Zeile 45). Kennt
      er es nicht, den Befund im `notes`-Feld des betroffenen Loadouts festhalten und die Option
      weglassen; dann ist ein Build-Upgrade ein eigener Vorgang.

      Zweck: Die Web-UI von `llama-server` lässt den **Browser** direkt zum MCP-Server verbinden.
      Ein lokaler MCP-Server ohne CORS-Header lehnt das ab. Mit dem Flag verbindet stattdessen
      `llama-server` selbst — das ist die Voraussetzung dafür, dass der Shim aus p4 und die
      übrigen localhost-MCPs in der UI überhaupt eintragbar sind.

## Abgrenzung

Der MCP-Shim, der Failover-Router, die HTTP-Endpunkte und die Environment-Variablen gehören nicht
in dieses Partial. Dieses Partial liefert ausschließlich zwei lauffähige, autostartende
CPU-Server und ihre Watchdog-Abdeckung.
