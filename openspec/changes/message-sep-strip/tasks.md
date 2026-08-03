---
title: "message-sep-strip — Implementation Plan"
ticket_id: T002609
domains: [bachelorprojekt-infra, bachelorprojekt-ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# message-sep-strip — Implementation Plan

_Ticket: T002609_

## File Structure

```
scripts/llm-proxy/strip-markers.mjs       (neu)       ~35 Zeilen, S1-Limit 800, Rest ~765
scripts/llm-proxy/strip-markers.test.mjs  (neu)       ~90 Zeilen, S1-Limit 800, Rest ~710
scripts/llm-proxy/server.mjs              437 → ~470 Zeilen, S1-Limit 800, Rest ~330
```

Die Strip-Logik kommt in eine eigene Datei statt in `server.mjs`: sie ist rein, ohne I/O und
damit ohne HTTP-Gerüst testbar. `server.mjs` behält die Transport-Verantwortung.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** `scripts/llm-proxy/strip-markers.test.mjs` anlegen. Prüft
      `stripTurnMarkers(payload)` gegen die drei Szenarien der Delta-Spec plus den
      Byte-Identitätsfall. Die Fixtures sind die real gemessenen Antworten aus dem Ticket
      (`'Ja<|message_sep|>'`, `'2 + 2 = 4<|message_sep|>'`, der Tool-Call mit leerem content),
      keine erfundenen. Der Positiv-Anker nach T002356-M1 steht vor jeder Negativ-Aussage.

```bash
node --test scripts/llm-proxy/strip-markers.test.mjs
# expected: FAIL (rot — stripTurnMarkers existiert noch nicht)
```

- [x] **Strip-Funktion (GREEN, Teil 1).** `scripts/llm-proxy/strip-markers.mjs` mit
      `stripTurnMarkers(payload)`: entfernt `<|message_sep|>` und `<|role_sep|>` aus
      `choices[].message.content`, lässt jedes andere Feld unangetastet und gibt bei fehlendem
      Marker das Objekt unverändert zurück. Rein, keine Seiteneffekte, kein I/O.

- [x] **Non-Streaming-Pfad im Proxy (GREEN, Teil 2).** In `proxyV1` (`server.mjs:123`) den
      Auslieferungsteil verzweigen. Ist die Antwort **nicht** streamend (`stream`-Flag im
      Request bzw. `content-type: application/json`), Body puffern, JSON parsen,
      `stripTurnMarkers` anwenden, mit neuem `content-length` senden. Andernfalls der
      bestehende `upstreamStream.pipe(res)`-Pfad, unverändert — inklusive des
      `error`-Listeners, dessen Fehlen laut Kommentar dort den ganzen Prozess killt.

- [x] **Fehlerrobustheit (GREEN, Teil 3).** Schlägt das Parsen fehl (kein JSON, abgeschnittener
      Body), wird der gepufferte Body **unverändert** ausgeliefert statt ein Fehler erzeugt.
      Der Marker ist ein Schönheitsfehler; eine verschluckte Antwort wäre ein Ausfall. Dieser
      Fall gehört als eigener Testfall in die Testdatei.

- [x] **Live-Gegenprobe.** Gegen den laufenden Proxy dieselben fünf Prompts aus dem Ticket
      wiederholen und belegen, dass `content` markerfrei ankommt, sowie die Tool-Call-Anfrage
      wiederholen und belegen, dass `tool_calls` unverändert bleibt. Ergebnis als Kommentar an
      T002609.

- [x] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil `node --test` nicht Teil von `test:changed` ist — der zweite Aufruf belegt,
dass der Umbau die bestehenden Proxy-Tests nicht bricht:

```bash
node --test scripts/llm-proxy/strip-markers.test.mjs
node --test scripts/llm-proxy/server.test.mjs
```
