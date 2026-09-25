---
ticket_id: T900373
plan_ref: openspec/changes/glimmer-worker-mcp/tasks.md
status: active
date: 2026-09-25
---

# Design: glimmer-worker-mcp

_Ticket: T900373 · Parent-Spec: `llm-local-dev` · Vorgänger: T900365 (Glimmer auf :1919)_

## Kontext

Muse Code 1.4.0 (Metas Coding-CLI, installiert in WSL unter `~/.local/bin/muse` und auf Windows unter
`%LOCALAPPDATA%\Programs\muse`) plant auf Muse Spark 1.3. Glimmer ist aus Spark destilliert und läuft seit
T900365 lokal auf `:1919`. Muse soll Glimmer als **Arbeitermodell** nutzen: Spark plant, Glimmer führt
abgegrenzte Teilaufgaben mit eigenen Tools aus.

## Befund: kein nativer Anschluss

- Muse kennt pro Subagent ein eigenes Modell (`agent_definitions` mit `model`, `child_model_override`), aber
  nur **einen** Provider (`--provider echo|meta`) mit **einem** Endpunkt (`endpoint_transport.base_url` bzw.
  `--base-url`). Modelle außerhalb von Metas Katalog weist es ab (`child_route_model_unknown`).
- Muse spricht die Responses-API (`/v1/responses`). llama-server (`e85e15cf6`) bietet sie ebenfalls an,
  Streaming eingeschlossen. Trotzdem verwirft Muse den Stream: `provider_stream.lifecycle … outcome="failed"
  reason="protocol"`, Retry-Grund `decode`. Meta nutzt eigene Event- und Tool-Formate; llama-server loggt
  `unsupported Responses tool type 'namespace' skipped`, das heißt: Muses Tools gingen verloren.
- Ein Übersetzer für das undokumentierte Protokoll plus ein Modell-Router, der das Meta-Bearer-Token
  durchreicht, wäre Reverse-Engineering und bräche beim nächsten Muse-Update.

Nachstellbar:

```bash
# Stand: muse 1.4.0-R4161.1, llama.cpp e85e15cf6, glimmer.service aktiv
muse exec --base-url http://127.0.0.1:1919/v1 --model Muse-Glimmer-30B "Antworte nur mit BEREIT."
grep -h 'provider_stream.lifecycle' ~/.local/share/muse/local-tracing/bootstrap/*.log | grep failed | tail -1
journalctl --user -u glimmer --since -10min | grep "tool type 'namespace'"
```

## Entscheidungen

### D1 — MCP statt Provider

Muse unterstützt MCP-Server offiziell (`settings.json` → `mcpServers`), und in der WSL-Config ist mit
`factory-mcp-node` bereits ein HTTP-Server mit Bearer eingetragen. Glimmer wird als **MCP-Werkzeug** angeboten.
Die Arbeitsteilung ist dieselbe wie bei einem Subagenten: Spark formuliert den Auftrag, Glimmer führt aus und
liefert Ergebnis und Diff zurück.

### D2 — Glimmers Agentenschleife ist opencode `glimmer-primary`

Ein Job startet `opencode run --agent glimmer-primary --dir <cwd> <auftrag>`, dasselbe Modell mit derselben
Tool-Schleife, die in T900365 einen realen Bugfix-Auftrag in 30 s gelöst hat. Kein eigener Agent-Loop im
MCP-Server. Binärpfad: `GLIMMER_WORKER_OPENCODE`, Default `~/.opencode/bin/opencode`.

### D3 — Streamable HTTP auf `127.0.0.1:13007`, Bearer, Muster von `factory-mcp-node`

Node-Standardbibliothek ohne npm-Abhängigkeiten, Sicherheitsgrenze aus `scripts/lib/mcp-http-security.mjs`
(Host → Origin → Bearer, fail-closed vor dem Body-Lesen). Das Token (`GLIMMER_WORKER_MCP_TOKEN`) liegt in
`~/.config/glimmer-worker-mcp/server.env` (Modus 600), erzeugt vom Installer. Port 13007 ist frei
(13001/13003/13005 belegt).

**Windows ohne Brücke:** `.wslconfig` setzt `networkingMode = Mirrored`, deshalb erreicht Windows einen
WSL-Listener auf `127.0.0.1` direkt. Beide Muse-Installationen tragen dieselbe URL
`http://127.0.0.1:13007/mcp` ein.

### D4 — Asynchron: `start` / `result` / `status`

Ein Worker-Lauf dauert Minuten, und Muses MCP-Timeout ist nicht dokumentiert. Deshalb gibt es kein
blockierendes Tool:

- `glimmer_worker_start({task, cwd, timeout_s?})` → `{job_id, position}` sofort.
- `glimmer_worker_result({job_id, wait_s?})` wartet höchstens `wait_s` (Default 50, max 55) und liefert
  `status` (`queued|running|done|failed|timeout`) sowie am Ende `summary` (letzte 6000 Zeichen der
  opencode-Ausgabe), `git_status` (`git status --porcelain`), `diff_stat` und `exit_code`.
- `glimmer_worker_status()` → Gesundheit von `:1919` (`/health`, Modell-ID, `n_ctx`), laufender Job,
  Warteschlange.

### D5 — Ein Job zur Zeit

`:1919` hat einen Slot (`-np 1`). Die Jobs laufen strikt nacheinander in einer FIFO-Queue. Jeder Job hat ein
Zeitlimit (`timeout_s`, Default 900, max 3600) und wird danach mit SIGTERM beendet. Abgeschlossene Jobs bleiben
eine Stunde abrufbar.

### D6 — Pfade und Git-Pflicht

`cwd` darf eine Windows-Form haben: `C:\x\y` → `/mnt/c/x/y`; `\\wsl.localhost\<distro>\p` und
`\\wsl$\<distro>\p` → `/p`. Der aufgelöste Pfad muss ein existierendes Verzeichnis **innerhalb eines
Git-Arbeitsbaums** sein, damit jede Änderung sichtbar und rückgängig zu machen ist. Sonst lehnt `start` mit
`isError` ab.

### D7 — Nur in Muse registriert, nicht in opencode/Claude

Der Server kommt **nicht** in `docs/agent-guide/registry/mcp.yaml`; `task mcp:sync` würde ihn sonst in
opencode eintragen, und `glimmer-primary` könnte sich selbst beauftragen. Registriert wird er ausschließlich
per `scripts/glimmer-worker-mcp/install.sh` in `~/.config/muse/settings.json` (WSL) und
`%USERPROFILE%\.config\muse\settings.json` (Windows), jeweils per `jq`-Merge mit Backup.

### D8 — Hinweis an Spark per Tool-Beschreibung

Die Tool-Beschreibung von `glimmer_worker_start` sagt Spark, wofür sich der Worker eignet (abgegrenzte
Implementierungs- und Refactoring-Aufgaben mit klarem Ziel, Dateien und Abnahme) und dass danach der Diff zu
prüfen ist. Eine Muse-Agent-Definition ist nicht nötig.

## Verworfen

- **Protokoll-Shim als nativer Provider.** Siehe Befund; fragil, und er reicht das Meta-Token durch einen
  selbstgebauten Proxy.
- **stdio-MCP per `wsl.exe` für Windows.** Das `settings.json`-Schema für stdio ist in Muse nicht belegt (nur
  im Plugin-Format), und `wsl.exe`-Brücken sind langsam. Mit mirrored networking unnötig.
- **Nur `factory_ask`.** Q&A ohne Tools ist kein Arbeitermodell.

## Risiken

- Muse-Updates können das `mcpServers`-Format ändern; der Installer validiert danach mit
  `muse config`-freiem Smoke-Test (`tools/list` per curl) und nennt den Muse-Aufruf zum Prüfen.
- Läuft gleichzeitig ein opencode-`local`-Dispatch, teilen sich beide den einen Slot auf `:1919`; die Queue
  des Servers sieht nur ihre eigenen Jobs. Das kostet Wartezeit, keine Korrektheit.
