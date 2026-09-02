---
title: bge-mcp auf Windows startfaehig machen und mcp-task-runner reaktivieren
ticket_id: T900039
domains: [tooling, ops, test]
status: plan_staged
---

# bge-mcp-windows-start — Implementation Plan

## File Structure

| Datei | Art | S1-Budget |
|---|---|---|
| `tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats` | neu (liegt bereits rot vor) | `.bats` nicht S1-limitiert |
| `scripts/bge-mcp/server.mjs` | geaendert | Ist 296 · Limit 800 (nicht gebaselined) → Budget 504 |
| `docs/agent-guide/registry/mcp.yaml` | geaendert | `.yaml` nicht S1-limitiert |
| `scripts/mcp-gateway/start-windows.ps1` | neu | `.ps1` nicht S1-limitiert |
| `Taskfile.yml` | geaendert (S4: Skript erreichbar machen) | `.yml` nicht S1-limitiert |
| `.mcp.json`, `.opencode/opencode.jsonc`, `mcp_config.json`, `scripts/llm/mcp-servers.json` | generiert via `task mcp:sync` — nie von Hand editieren | — |

<!-- vitest: kein neuer Test noetig, weil dieser Change keine Datei unter
components/website/src/lib/** oder components/website/src/pages/api/** anfasst. -->

## Task 1 — Failing Test (rot) absichern

Der Test liegt bereits im Worktree und ist rot verifiziert. Dieser Task stellt nur sicher,
dass die Rotphase vor dem Fix reproduziert wird.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats
```

expected: FAIL — auf einem Windows-Checkout brechen beide Faelle mit
`ERR_UNSUPPORTED_ESM_URL_SCHEME` ab, bevor die Token-Pruefung erreicht wird.

Auf einem POSIX-Checkout ist der erste Fall bereits gruen (dort existiert der Defekt nicht);
der Test bleibt trotzdem sinnvoll, weil er die Token-Pruefung als Positiv-Anker festhaelt.

## Task 2 — Router-Import als file://-URL aufloesen

In `scripts/bge-mcp/server.mjs`: `pathToFileURL` aus `node:url` importieren und den in
`ROUTER_PATH` aufgeloesten Pfad damit umwandeln, bevor er an `await import()` geht
(betroffen sind die Zeilen um die `ROUTER_PATH`-Definition und den Import direkt darunter).

Der Kommentarblock darueber haelt fest, warum die Umwandlung noetig ist: ein absoluter Pfad
mit Laufwerksbuchstaben wird vom ESM-Loader als URL-Schema `c:` gelesen und abgewiesen.

Danach muss Task 1 gruen sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats
```

## Task 3 — mcp-task-runner in der Registry auf node umstellen

In `docs/agent-guide/registry/mcp.yaml`, Eintrag `mcp-task-runner`:

- `harness.opencode` bekommt `command: [node, scripts/mcp-task-runner/server.mjs]` und
  `enabled: true`. Der repo-relative Pfad folgt dem bestehenden Pfad-Split, den der Kommentar
  am Kopf der Datei beschreibt: `claude_code` und `opencode` nutzen den repo-relativen Pfad,
  weil beide Harnesses aus dem Repo-Root starten und `G-AGENTIC14` genau diese beiden
  vergleicht.
- `harness.claude_code` wird auf denselben Aufruf angeglichen. Der Kopf-Kommentar der Registry
  verlangt ausdruecklich, `command` und `args` ueber alle `harness.*`-Eintraege desselben
  Servers plus die Top-Level-`args` anzugleichen — sonst tauscht man ein rotes Gate gegen ein
  anderes (`G-AGENTIC12` gruen, `G-AGENTIC14` rot).
- Der veraltete Begruendungs-Kommentar zum fehlenden Windows-Binary wird durch die
  tatsaechliche Lage ersetzt: der Server ist reines Node.js, der Wrapper unter
  `/usr/local/bin` ist nur ein Bash-Aufruf von `node server.mjs`.

Die Top-Level-`command`/`args` und der `agy`-Eintrag bleiben unveraendert, weil `agy` nur auf
dem Linux-Host laeuft und dort der Wrapper existiert.

Verifikation, dass der Server ueber node antwortet:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node scripts/mcp-task-runner/server.mjs
```

Erwartet: `serverInfo.name` ist `mcp-task-runner`, die Tools enthalten `plan_tasks` und
`run_task`.

## Task 4 — bge-mcp fuer opencode aktivieren

In `docs/agent-guide/registry/mcp.yaml`, Eintrag `bge-mcp`: `harness.opencode.enabled` auf
`true` setzen und den Kommentar aktualisieren, der die Deaktivierung mit dem
WSL-systemd-Betrieb begruendet. Die `{env:BGE_MCP_TOKEN}`-Uebersetzung fuer opencode bleibt
unveraendert — sie ist in `scripts/mcp-sync.sh` implementiert und wird hier nicht angefasst.

## Task 5 — Windows-Startmechanismus

Neues Skript `scripts/mcp-gateway/start-windows.ps1` nach dem Muster der bestehenden
PowerShell-Skripte unter `scripts/llm/pk-devices/`. Es leistet auf Windows das, was unter
Linux die systemd-Units leisten:

1. Port-Forwards gegen den fleet-Kontext starten: `svc/claude-code-mcp-monolith`
   (`18080:8080`, `13000:3000`, `13001:3001`, `13002:3002`) sowie `svc/llm-gateway-embed`
   und `svc/llm-gateway-rerank` auf zwei lokale Ports.
2. `BGE_MCP_TOKEN` aus der Umgebung uebernehmen und fehlend mit klarer Meldung abbrechen —
   der Shim selbst verweigert ohne Token ohnehin den Start.
3. `LLM_EMBED_URL` und `LLM_RERANKER_URL` auf die lokalen Forward-Ports setzen und
   `scripts/bge-mcp/server.mjs` starten.

Konventionen aus `scripts/llm/CLAUDE.md` gelten: reines ASCII, kein BOM, und vor dem Commit
ein Parser-Check:

```bash
powershell -NoProfile -Command "[System.Management.Automation.Language.Parser]::ParseFile('scripts/mcp-gateway/start-windows.ps1',[ref]\$null,[ref]\$null) | Out-Null; 'parse ok'"
```

S4 (Orphan-Guard): Das Skript wird ueber einen Taskfile-Eintrag erreichbar gemacht, damit es
nicht als verwaistes Skript gilt.

## Task 6 — Generierte Configs und Delta-Spec

```bash
task mcp:sync
task mcp:check
```

`task mcp:check` ist fail-closed und muss gruen sein. Die generierten Dateien werden
ausschliesslich durch den Sync veraendert.

Anschliessend die Delta-Spec gegen die Umsetzung gegenlesen
(`openspec/changes/bge-mcp-windows-start/specs/mcp-gateway.md`) und
`task openspec:validate` ausfuehren.

## Task 7 — Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-mcp-windows-esm-url.bats
task test:changed
task freshness:regenerate
task freshness:check
```

Zusaetzlich der Nachweis am laufenden System: nach Task 5 antwortet der Shim auf einen
MCP-`initialize`-Request an seinem Port mit HTTP 200.
