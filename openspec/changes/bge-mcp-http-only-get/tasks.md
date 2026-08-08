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

- [ ] **Failing-Test-Step (RED).** Der Test `tests/spec/mcp-gateway/bge-http-only-get.bats`
      liegt bereits im Stage-Commit dieses Branches. Er startet den echten Shim auf einem freien
      Port und prüft, dass `GET /mcp` mit gültigem Bearer nicht in einem Event-Stream endet.
      Vor dem Fix schlägt er fehl, weil `curl` in `--max-time` läuft (der Kanal bleibt offen und
      schweigt) und die Antwort deshalb leer ist statt `405` zu enthalten.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-http-only-get.bats
# expected: FAIL (rot — Test 1 fällt, Tests 2 und 3 sind bereits grün)
```

- [ ] **Fix-Step (GREEN).** In `scripts/bge-mcp/server.mjs` den `if (req.method === 'GET')`-Block
      (samt `res.writeHead`, `setInterval`-Keep-Alive und `req.on('close')`) ersatzlos entfernen.
      `GET` fällt damit in den bestehenden `if (req.method !== 'POST') return send(405, …)`-Zweig.
      Die Bearer-Prüfung darüber bleibt unberührt — ein unauthentifizierter `GET` muss weiterhin
      `401` liefern, nicht `405`. Danach müssen alle drei Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/bge-http-only-get.bats
# erwartet: 3 von 3 grün
```

- [ ] **End-to-End-Beleg (H1 entscheiden).** Der Test oben belegt das geänderte HTTP-Verhalten,
      nicht die Behauptung, dass genau dieses Verhalten agy blockiert hat. Deshalb den Dienst neu
      starten und agy nach seinen MCP-Servern fragen — `bge-mcp` muss in der Aufzählung
      erscheinen. Das Ergebnis wird als Kommentar an T002703 vermerkt.

```bash
systemctl --user restart bge-mcp.service
agy --print-timeout 2m -p 'Liste NUR die Namen aller dir verfuegbaren MCP-Server auf, kommasepariert. Wenn du keine hast, antworte exakt: KEINE.'
# erwartet: die Ausgabe enthält bge-mcp
```

> Erscheint `bge-mcp` nicht, ist H1 widerlegt: der Fix bleibt trotzdem richtig (der stumme Kanal
> ist eine Sackgasse), aber die Ursache für agys Ausfall liegt dann woanders und braucht ein
> Folgeticket. In diesem Fall wird der Vorgang **nicht** als Behebung von T002703 verbucht.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
