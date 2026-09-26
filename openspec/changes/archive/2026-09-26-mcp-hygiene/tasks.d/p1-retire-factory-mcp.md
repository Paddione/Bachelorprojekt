---
title: "p1 — Retire factory-mcp-node server and its references"
ticket_id: T900479
domains: [mcp, repo-hygiene]
status: active
---

# p1 — Retire factory-mcp-node server and its references

Files: `scripts/factory-mcp-node/server.mjs`, `scripts/factory-mcp-node/package.json`, `tests/spec/mcp-gateway/native-server-startup-token.bats`, `tests/spec/mcp-gateway/token-drift-auto-sync.bats`, `tests/spec/llm-local-dev/glimmer-worker-mcp.bats`, `scripts/mcp-sync.sh`, `docs/code-quality/gates.yaml` (target_files dieses Partials; disjunkt zu p2, p3, p-tests).

## Task 1.1: Serververzeichnis löschen

1. `scripts/factory-mcp-node/server.mjs` (759 Zeilen) und
   `scripts/factory-mcp-node/package.json` löschen (ganzes Verzeichnis).
2. Verifizieren: `ls scripts/factory-mcp-node` schlägt fehl; Repo-Referenzen
   nur noch in den in diesem Partial bearbeiteten Dateien:
   `grep -rn "factory-mcp-node" scripts/ tests/ taskfiles/ Taskfile.yml`
   zeigt danach ausschließlich Treffer in `tests/spec/mcp-tooling.bats`,
   `tests/spec/llm-local-dev/glimmer-serving-profile.bats` (Kommentare, die den
   Wegfall behaupten — nach diesem Partial erstmals wahr) und
   `tests/spec/software-factory/decommission-guard.bats` (Registry-Guard, bleibt).

## Task 1.2: Token-Guard-Tests umhängen

1. In `tests/spec/mcp-gateway/native-server-startup-token.bats` den kompletten
   Factory-Abschnitt (Kommentar-Header `# factory-mcp-node` plus die drei
   `@test`-Blöcke „exits non-zero…", „error message names…",
   „does not bind port…") entfernen. Die bge-mcp- und mcp-postgres-local-Blöcke
   prüfen denselben Shared Guard (`mcp-http-security.mjs:requireToken`) und
   bleiben unverändert. Kopfkommentar („Jeder native HTTP-MCP-Server
   (factory-mcp-node, bge-mcp, mcp-postgres-local)") auf die zwei lebenden
   Server kürzen.
2. In `tests/spec/mcp-gateway/token-drift-auto-sync.bats`: aus dem
   `setup`-mkdir das Verzeichnis `$FAKEHOME/.config/factory-mcp-node`
   streichen; im Test „T2a…" die Zeile
   `[ ! -f "$HOOK_CALLS/restart-factory-mcp" ]` streichen (der Anker
   `restart-mcp-postgres-local` bleibt als Beleg für „unbetroffene Unit lief
   nicht").
3. In `tests/spec/llm-local-dev/glimmer-worker-mcp.bats` im Test „installer
   registers the worker…" die Fixture-Einträge `factory-mcp-node` (JSON-Setup
   und URL-Assertion) durch `mcp-postgres` mit URL
   `http://localhost:13001/mcp` ersetzen (stabiler kanonischer Server; die
   Testaussage „vorhandene Einträge bleiben erhalten" ist serverunabhängig).
4. Laufen lassen: `bats tests/spec/mcp-gateway/native-server-startup-token.bats
   tests/spec/mcp-gateway/token-drift-auto-sync.bats
   tests/spec/llm-local-dev/glimmer-worker-mcp.bats` ist grün.

## Task 1.3: mcp-sync-Referenzen entfernen

1. In `scripts/mcp-sync.sh` die drei identischen
   `path.join(configDir, 'factory-mcp-node', 'server.env')`-Zeilen (agy-,
   qwen- und claude-user-Render) streichen. `scripts/mcp-sync.sh` Ist 644 ·
   Limit 800 (.sh, nicht-baselined) → Budget 156; die Änderung schrumpft die
   Datei, Split entfällt.
2. Die zwei Kommentarblöcke, die `factory-mcp-node` als Begründung für
   Per-Harness-Header nennen (agy-Render, opencode-Render), um die
   Parenthesen kürzen; die technische Aussage (Header-Vorrang) bleibt stehen.
3. Idempotenz prüfen: `task mcp:sync` zweimal laufen lassen; der zweite Lauf
   erzeugt keinen Diff (`git status --porcelain` für `.mcp.json`,
   `.opencode/opencode.jsonc` bleibt leer).

## Task 1.4: Tote S1-Ignore-Einträge streichen

1. In `docs/code-quality/gates.yaml` die Strophe zu
   `scripts/factory/pipeline.js` und `scripts/factory/pipeline.mjs` (je zwei
   Kommentarzeilen plus Eintrag) entfernen; das Verzeichnis existiert seit
   #5933 nicht mehr.
2. `task quality:check` bleibt grün (nur Streichung, keine neue Ausnahme).

## Verify (Partial)

```bash
bats tests/spec/mcp-gateway/native-server-startup-token.bats tests/spec/mcp-gateway/token-drift-auto-sync.bats tests/spec/llm-local-dev/glimmer-worker-mcp.bats
task test:changed
task freshness:regenerate
task freshness:check
```
