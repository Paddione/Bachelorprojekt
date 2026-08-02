---
title: "ui-config-mcp-seed — Implementation Plan"
ticket_id: T002544
domains: [llm, agents]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ui-config-mcp-seed — Implementation Plan

_Ticket: T002544_

Die MCP-Serverliste der llama-WebUI liegt im Browser-`localStorage` und ist damit an Origin und
Profil gebunden. Sie wird stattdessen serverseitig über `--ui-config-file` vorbelegt — generiert aus
`docs/agent-guide/registry/mcp.yaml`, mit dem Bearer-Token nur als `${BGE_MCP_TOKEN}`-Referenz in
der getrackten Vorlage. Ausschliesslich `gemma26-factory` erhält den Seed.

Design: `openspec/changes/ui-config-mcp-seed/proposal.md`

## File Structure

| Path | Ist | Budget |
|---|---|---|
| `scripts/llm/ui-config-seed.mjs` | 0 | 800 |
| `scripts/llm/ui-config-seed.test.mjs` | 0 | 800 |
| `scripts/llm/ui-config.template.json` | 0 | 200 |
| `scripts/llm-proxy/runner.mjs` | 123 | 677 |
| `scripts/llm/loadouts.json` | 182 | 200 |
| `docs/agent-guide/registry/mcp.yaml` | 353 | 200 |
| `tests/spec/local-llm-proxy/ui-config-seed.bats` | 0 | 300 |

## Tasks

### Task 1 — Failing Test (RED)

Die Vitest-Suite für den Generator wird angelegt, bevor der Generator existiert. Sie deckt die drei
Aussagen ab, an denen der Entwurf scheitern kann: die **doppelte Kodierung** des `mcpServers`-Werts
(String, der ein Array enthält), die Bevorzugung von `browser_endpoint` gegenüber `endpoint`, und
dass die getrackte Vorlage kein expandiertes Token enthält.

```bash
npx vitest run scripts/llm/ui-config-seed.test.mjs
# expected: FAIL (rot — ui-config-seed.mjs existiert noch nicht)
```

### Task 2 — Vorlage `scripts/llm/ui-config.template.json`

Getrackte Vorlage mit den sieben Servern. Der `bge-mcp`-Eintrag trägt seinen Authorization-Header
als **unexpandiertes** `${BGE_MCP_TOKEN}`. Die Datei ist bewusst die Vorlage, nicht das Ergebnis:
expandiert wird erst zur Laufzeit, ausserhalb des Arbeitsbaums.

### Task 3 — Generator `scripts/llm/ui-config-seed.mjs`

Liest `docs/agent-guide/registry/mcp.yaml`, wählt je Eintrag `browser_endpoint` falls vorhanden,
sonst `endpoint`, und schreibt den Seed. Der `mcpServers`-Wert wird als `JSON.stringify` eines
Arrays erzeugt und dann selbst noch einmal als Stringwert eingebettet — diese doppelte Kodierung ist
der Kern der Aufgabe. Ein Array statt eines Strings wird von der WebUI stillschweigend verworfen.

Der Generator akzeptiert einen Ausgabepfad und rendert `${BGE_MCP_TOKEN}` aus der Umgebung. Fehlt
die Variable, bricht er mit Exit ≠ 0 ab statt einen kaputten Header zu schreiben.

### Task 4 — `runner.mjs`: `--ui-config-file` emittieren

In `buildServerArgv` wird das Argument angehängt, wenn das Loadout `uiConfigFile` gesetzt hat. Ist
das Feld nicht vorhanden oder `null`, bleibt die argv unverändert — bestehende Loadouts behalten ihre
Kommandozeile Byte für Byte. Das Muster folgt der vorhandenen Zeile für `mcp.serversConfig`.

### Task 5 — `loadouts.json`: `uiConfigFile` an `gemma26-factory`

Genau ein Loadout bekommt das Feld. `gptoss-context`, `devstral-quality`, `gemma-factory` und
`gemma-multiagent` bleiben ohne — Betreiber-Vorgabe vom 2026-08-02, alle Jobs laufen auf dem 26B.
Die vier `bge-*` bleiben ebenfalls ohne, da sie keine Chat-UI haben.

### Task 6 — Registry: `browser_endpoint` für die Brücken-Server

`ticket-mcp`, `mcp-task-runner` und `codebase-memory-mcp` sind stdio-Einträge, über die Brücke aber
unter `http://127.0.0.1:18235/mcp/<name>` erreichbar. Diese Adresse wird als `browser_endpoint`
ergänzt, damit der Generator sie findet, ohne den `transport: stdio`-Wert anzutasten — der
fail-closed-Guard in `mcp.yaml` verlangt, dass ein `harness.llamacpp`-Block nur an stdio hängt.

### Task 7 — Rendering beim Unit-Start

`llama-gemma26-factory.service` rendert die Vorlage vor dem Serverstart in ihren Laufzeitpfad. Der
Pfad liegt ausserhalb des Repos. Die Unit liest `BGE_MCP_TOKEN` aus derselben Quelle wie
`bge-mcp.service` (`~/.config/bge-mcp/server.env`).

### Task 8 — Integrationstest gegen `/props`

Ein BATS-Test startet einen kurzlebigen `llama-server` mit dem generierten Seed und prüft dessen
`/props`-Antwort: `ui_settings.mcpServers` gleicht dem Seed-Wert, und `cors_proxy_enabled` ist
`false`. Geprüft wird die Antwort des laufenden Servers, nicht der Quelltext des Runners — Konvention
T002448-M4. Der Test läuft CPU-only gegen ein kleines Modell, damit er dem 26B kein VRAM entzieht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/ui-config-seed.bats
```

### Task 9 — Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
