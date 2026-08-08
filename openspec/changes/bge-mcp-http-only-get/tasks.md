---
title: "bge-mcp-http-only-get — Implementation Plan"
ticket_id: T002703
domains: [ops, llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-mcp-http-only-get — Implementation Plan

_Ticket: T002703_

## File Structure

```
scripts/bge-mcp/server.mjs                       (geändert — GET-Zweig entfällt, 277 → ~265 Zeilen)
tests/spec/mcp-gateway/bge-http-only-get.bats    (neu — bereits im RED-Commit enthalten)
openspec/changes/bge-mcp-http-only-get/          (Plan-Artefakte: proposal.md, design.md, specs/mcp-gateway.md)
```

**S1-Budget:** `.mjs` hat ein Limit von 800 Zeilen (`docs/code-quality/gates.yaml`), `server.mjs`
steht bei 277 und hat keinen Baseline-Eintrag. Die wirksame Schwelle ist damit das Limit; der
Vorgang **verkleinert** die Datei. Kein Verkleinerungsschritt nötig.

## Partials

Ein Partial — der Fix umfasst eine Datei und einen Zweig; eine Aufteilung erzeugte nur
Koordinationsaufwand.

| # | Rolle | target_files |
|---|-------|--------------|
| p1 | tests + fix | `scripts/bge-mcp/server.mjs`, `tests/spec/mcp-gateway/bge-http-only-get.bats` |

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Der Test `tests/spec/mcp-gateway/bge-http-only-get.bats`
      liegt bereits im Stage-Commit dieses Branches. Er startet den echten Shim auf einem freien
      Port und prüft, dass `GET /mcp` mit gültigem Bearer nicht in einem Event-Stream endet.
      Vor dem Fix schlägt er fehl, weil `curl` in `--max-time` läuft (der Kanal bleibt offen und
      schweigt) und die Antwort deshalb leer ist statt `405` zu enthalten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-http-only-get.bats
# expected: FAIL (rot — Test 1 fällt, Tests 2 und 3 sind bereits grün)
```

- [x] **Fix-Step (GREEN).** In `scripts/bge-mcp/server.mjs` den `if (req.method === 'GET')`-Block
      (samt `res.writeHead`, `setInterval`-Keep-Alive und `req.on('close')`) ersatzlos entfernen.
      `GET` fällt damit in den bestehenden `if (req.method !== 'POST') return send(405, …)`-Zweig.
      Die Bearer-Prüfung darüber bleibt unberührt — ein unauthentifizierter `GET` muss weiterhin
      `401` liefern, nicht `405`. Danach müssen alle drei Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-http-only-get.bats
# erwartet: 3 von 3 grün
```

- [x] **End-to-End-Beleg (H1 entscheiden) — durchgeführt, H1 WIDERLEGT.**

Der Beleg wurde am 2026-08-08 geführt. Weil die systemd-Unit den Shim aus dem **Hauptcheckout**
startet (`ExecStart=… /home/patrick/Bachelorprojekt/scripts/bge-mcp/server.mjs`), hätte ein
blosses `systemctl restart` den ungepatchten Code geladen und H1 fälschlich widerlegt. Der Dienst
wurde deshalb kurz durch eine Instanz aus diesem Worktree auf :13005 ersetzt (`GET` → `405`
verifiziert), danach vollständig wiederhergestellt.

Ergebnis: `bge-mcp` erschien **weiterhin nicht** in agys Server-Aufzählung. Der GET-Fix allein
macht den Shim für agy nicht erreichbar.

Die anschliessende Messung fand die tatsächliche Ursache — sie liegt nicht in diesem Repo-Pfad:
`~/.gemini/config/mcp_config.json` trägt `Authorization: "Bearer ${BGE_MCP_TOKEN}"` unexpandiert.
Ein POST mit dem literalen Platzhalter beantwortet der Shim mit `401`, mit echtem Token mit `200`;
setzt man den echten Wert in die agy-Config, erscheint `bge-mcp` sofort in der Aufzählung.
`bge-mcp` ist der einzige Server der agy-Config mit einem `headers`-Feld — das erklärt, warum
genau er als einziger fehlte. Für opencode existiert die nötige Übersetzung bereits (T002488,
`${VAR}` → `{env:VAR}` in `scripts/mcp-sync.sh`), für agy nicht.

Konsequenz gemäss der Vorgabe dieses Plans: der Vorgang wird **nicht** als Behebung des
ursprünglichen agy-Symptoms verbucht. Der GET-Fix bleibt eigenständig richtig — ein Kanal, in den
nie geschrieben wird, lässt Clients warten statt schnell zu scheitern. Die Ursache läuft als
eigenes Ticket weiter.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
