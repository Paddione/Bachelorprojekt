---
title: Turn-Marker aus Non-Streaming-Antworten strippen
ticket_id: T002609
domains: [bachelorprojekt-infra, bachelorprojekt-ops]
status: planning
---

# Design: message-sep-strip

## Belegte Ausgangslage

Alle Angaben gemessen am 2026-08-03 gegen den laufenden `gemma9-factory` auf :8092,
temperature 0.

| Pfad | `content` | `finish_reason` |
|---|---|---|
| Klartext (5 Prompts) | trägt `<|message_sep|>` in 5 von 5 | `stop` |
| Tool-Call (`get_weather`) | `''` — Marker konsumiert | `tool_calls` |

Betroffen ist nur `gemma9-factory`: es ist das einzige Loadout, das
`scripts/llm/templates/gemma2-tools.jinja` per `extraArgs` lädt.

## Warum im Proxy und nicht an der Quelle

Zum Zeitpunkt der Auslieferung ist der peg-Parser fertig — Strippen kann ihn nicht mehr
stören. Das ist der Kern der Ortswahl: die im Ticket befürchtete Regression am Tool-Call-Pfad
ist hier konstruktiv ausgeschlossen, nicht nur getestet.

Ein Stop-Token im Loadout wäre kleiner und würde auch Direktzugriffe auf :8092 abdecken. Es
greift aber auf der Sampling-Ebene und könnte genau die Sequenz abschneiden, die der Parser
für Tool-Calls braucht; das zu prüfen erfordert einen Neustart des produktiv laufenden
Servers. Zurückgestellt, nicht verworfen.

## Schnitt

### `stripTurnMarkers(payload)` — `scripts/llm-proxy/strip-markers.mjs`

Rein, ohne I/O. Entfernt `<|message_sep|>` und `<|role_sep|>` aus
`choices[].message.content`; alles andere bleibt unangetastet. Ohne Marker wird das Objekt
unverändert zurückgegeben.

Eigene Datei statt Zeile in `server.mjs`: so ist die Regel ohne HTTP-Gerüst testbar, und
`server.mjs` behält allein die Transport-Verantwortung.

### Verzweigung in `proxyV1`

Heute endet `proxyV1` mit `upstreamStream.pipe(res)` — der Body wird roh durchgereicht, nichts
wird geparst. Neu:

```
ist die Antwort streamend?
  ja   -> bestehender pipe-Pfad, unveraendert (inkl. error-Listener)
  nein -> puffern, JSON.parse, stripTurnMarkers, mit neuem content-length senden
```

Der `error`-Listener auf dem Stream bleibt unangetastet. Der Kommentar im Code hält fest,
warum: ein unbehandeltes `error`-Event killt den Prozess, und bei serialisierter Queue reißt
das jeden wartenden Request mit.

### Fehlerrobustheit

Schlägt `JSON.parse` fehl (abgeschnittener Body, kein JSON), wird der **gepufferte Body
unverändert** ausgeliefert. Der Marker ist ein Schönheitsfehler; eine verschluckte Antwort
wäre ein Ausfall. Das ist kein Randfall, sondern der Normalfall bei jedem Upstream-Problem —
deshalb eigener Testfall.

## Bewusst nicht gelöst

1. **Streaming.** Bei SSE kann der Marker über Chunk-Grenzen zerrissen ankommen; ihn dort zu
   entfernen erforderte einen zustandsbehafteten Scanner im heikelsten Pfad des Proxys. Die
   Factory-Skripte fordern kein Streaming und sind damit abgedeckt.
2. **Direktzugriffe auf :8092** am Proxy vorbei.
3. **Fence-Problem.** Bei einer JSON-Probe kam die Antwort als ```json-Fence, was `json.loads`
   unabhängig vom Marker brach. Eigener Vorgang.
