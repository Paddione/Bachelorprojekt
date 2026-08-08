---
ticket_id: T002703
plan_ref: openspec/changes/bge-mcp-http-only-get/tasks.md
status: active
date: 2026-08-08
---

# Design — bge-mcp: stummen SSE-Kanal entfernen

## Ausgangslage

agy sieht den `bge-mcp`-Server nicht. Er ist der einzige der vier HTTP-MCP-Server der Registry,
der bei agy fehlt.

## Symptom vs. Hypothese

Die Ticket-Beschreibung (T002703) nannte Symptom und vermutete Ursache in einem Satz. Die
Trennung nach der Messung am 2026-08-08:

| | Aussage | Beleg |
|---|---|---|
| S1 | agy listet `codebase-memory-mcp`, `factory-mcp`, `mcp-kubernetes`, `mcp-postgres`, `mcp-task-runner`, `ticket-mcp` — **nicht** `bge-mcp` | agy-Lauf, positive Aufzählung (nicht Abwesenheitsprüfung) |
| S2 | `GET /mcp` gegen :13005 öffnet einen SSE-Kanal und sendet 4 s lang nichts — kein `endpoint`-Event | `curl -sN`, Mitschnitt leer |
| S3 | `POST /mcp` antwortet `200` mit JSON-Body direkt (Streamable-HTTP-Semantik, nicht SSE) | `curl -i`, `initialize` |
| S4 | Die drei funktionierenden HTTP-Server antworten auf `GET /mcp` mit `405 Method Not Allowed` | `curl` gegen :18080 und :13003 |
| S5 | Alle vier Server sind in `mcp.yaml` identisch per `agy.serverUrl` konfiguriert | `docs/agent-guide/registry/mcp.yaml` |

Aus S1 und S5 folgt: `serverUrl` ist **nicht** das falsche Feld — drei Server nutzen es
erfolgreich. Die einzige belegte Verhaltensdifferenz zwischen `bge-mcp` und den drei
funktionierenden ist S2 gegen S4.

**Verbleibende Hypothese (H1):** Der Client versucht GET zuerst; bei `405` fällt er sofort auf
Streamable HTTP zurück, am stummen offenen Kanal bleibt er dagegen hängen. H1 wird durch den
RED-Test entschieden, nicht vorausgesetzt.

## Entscheidung

Der GET-Zweig in `scripts/bge-mcp/server.mjs` entfällt ersatzlos. `GET /mcp` fällt damit in den
bereits vorhandenen `405`-Zweig und `bge-mcp` verhält sich wie `factory-mcp` und `mcp-postgres`.

Der Shim ist damit ausschließlich, was er ohnehin war: ein Streamable-HTTP-Server. Der SSE-Zweig
war Vorsorge aus T002426 („SSE-Kanal fuer Clients, die ihn erwarten") und hat nie einen Client
bedient — er sendet von sich aus nichts.

### Verworfene Alternativen

**`endpoint`-Event senden** (der ursprünglich am Ticket hängende Ein-Zeilen-Patch): bringt den
Handshake weiter, lässt aber die Antwort-Semantik inkonsistent — die JSON-RPC-Antworten kämen
weiterhin im POST-Body statt über den Stream (S3). Ein Client, der nach dem `endpoint`-Event
konsequent SSE spricht, wartete dann auf Antworten, die nie kommen. Das Symptom verschiebt sich,
statt zu verschwinden.

**Vollwertiger SSE-Transport** (POST → `202`, Antworten über den Stream, Session-Zuordnung per
`Mcp-Session-Id`): korrekt und vollständig, macht den bewusst zustandslosen Shim aber zustands-
behaftet — für einen Bedarf, den kein Client belegt.

## Betroffene Konsumenten

`scripts/llm/ui-config.template.json` gibt der llama-Web-UI für `bge-mcp` dieselbe URL-Form wie
für `mcp-postgres` (:13001) und `factory-mcp` (:13003). Da diese beiden auf GET mit `405`
antworten und dort funktionieren, braucht die UI den offenen Kanal nicht. Weitere Konsumenten des
Ports :13005 gibt es laut Repo-Suche nicht (`.opencode/opencode.jsonc`, `.mcp.json` und die
agy-Config sprechen alle POST).

## Edge-Cases

- **Der `keep-alive`-Timer entfällt mit dem Zweig.** Er war nur an die offene GET-Verbindung
  gebunden; ohne GET-Handler gibt es keinen `setInterval` mehr und damit auch kein Leck bei
  abgebrochenen Verbindungen.
- **Auth-Reihenfolge bleibt unberührt.** Die Bearer-Prüfung liegt vor der Methoden-Weiche; ein
  unauthentifizierter GET beantwortet weiterhin `401`, nicht `405`. Der Test muss deshalb mit
  gültigem Token prüfen, sonst misst er die Auth statt der Methoden-Weiche.
- **CORS-Preflight (`OPTIONS`) bleibt unberührt** — eigener Zweig oberhalb.

## Verifikation

1. **Rot:** Test gegen den laufenden Shim erwartet auf `GET /mcp` (mit gültigem Bearer) eine
   Antwort ungleich `text/event-stream` — schlägt gegen den heutigen Stand fehl.
2. **Grün:** nach dem Entfernen des Zweigs antwortet `GET /mcp` mit `405`.
3. **End-to-End (H1):** `systemctl --user restart bge-mcp`, dann agy nach seinen MCP-Servern
   fragen. `bge-mcp` muss in der Aufzählung erscheinen. Erscheint es nicht, ist H1 widerlegt und
   die Ursache liegt woanders — dann wird der Fix nicht als Lösung verbucht.
