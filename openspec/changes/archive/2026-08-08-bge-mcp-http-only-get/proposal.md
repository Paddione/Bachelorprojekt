# Proposal: bge-mcp-http-only-get

## Why

Der `bge-mcp`-Shim ist bei agy nicht verfügbar. Ein agy-Lauf am 2026-08-08 zählt sechs MCP-Server
auf — `codebase-memory-mcp`, `factory-mcp`, `mcp-kubernetes`, `mcp-postgres`, `mcp-task-runner`,
`ticket-mcp` — und `bge-mcp` ist der einzige, der fehlt. Embedding und Reranking sind für agy
damit unerreichbar, obwohl der Dienst läuft und Claude Code sowie opencode ihn nutzen.

Die belegte Verhaltensdifferenz ist eng: `bge-mcp` beantwortet `GET /mcp` mit einem offenen
SSE-Kanal, in dem er nie etwas sendet — kein `endpoint`-Event, nur Keep-Alive-Kommentare. Die drei
funktionierenden HTTP-Server antworten auf dasselbe `GET` mit `405 Method Not Allowed`. Alle vier
sind in der Registry identisch per `agy.serverUrl` konfiguriert, das Konfigurationsfeld scheidet
als Ursache also aus.

Der SSE-Zweig stammt aus T002426 und war Vorsorge für „Clients, die ihn erwarten". Er hat nie
einen Client bedient: die Antworten des Shims kommen ausschließlich im POST-Body zurück
(Streamable-HTTP-Semantik), nicht über den Stream. Damit ist der Kanal kein halber SSE-Transport,
sondern eine Sackgasse, in der ein Client hängen bleibt statt schnell zu scheitern.

## What

Der GET-Zweig in `scripts/bge-mcp/server.mjs` entfällt ersatzlos; `GET /mcp` fällt in den
vorhandenen `405`-Zweig. Der Shim ist damit ausschließlich Streamable HTTP — das, was er ohnehin
spricht — und verhält sich wie `factory-mcp` und `mcp-postgres`.

Abgesichert wird das durch einen BATS-Test gegen den laufenden Shim, der prüft, dass `GET /mcp`
mit gültigem Bearer keinen `text/event-stream` mehr liefert. Die verbleibende Hypothese — dass
genau dieser stumme Kanal agy hängen lässt — entscheidet ein End-to-End-Schritt: nach dem Neustart
des Dienstes muss `bge-mcp` in agys Server-Aufzählung erscheinen. Erscheint es nicht, ist die
Hypothese widerlegt und der Fix wird nicht als Lösung verbucht.

Nicht Teil dieses Vorgangs: ein vollwertiger SSE-Transport (POST → `202`, Antworten über den
Stream, `Mcp-Session-Id`). Er wäre korrekt, machte den zustandslosen Shim aber zustandsbehaftet —
für einen Bedarf, den kein Client belegt. Begründung und verworfene Alternativen: `design.md`.

_Ticket: T002703_
