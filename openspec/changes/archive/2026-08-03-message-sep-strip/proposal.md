# Proposal: message-sep-strip

## Why

`gemma9-factory` liefert den Turn-Marker `<|message_sep|>` im `content`-Feld seiner
OpenAI-kompatiblen Antworten aus — in dem Feld also, das jeder Konsument direkt
weiterverarbeitet. Gemessen am 2026-08-03 gegen den laufenden Server auf :8092,
temperature 0, in 5 von 5 Klartext-Antworten:

```
"Antworte mit genau einem Wort: funktioniert" -> 'Ja<|message_sep|>'
"Nenne die Hauptstadt von Frankreich."        -> 'Paris<|message_sep|>'
"Was ist 2+2?"                                -> '2 + 2 = 4<|message_sep|>'
```

Herkunft: `scripts/llm/templates/gemma2-tools.jinja` nutzt `<|role_sep|>`/`<|message_sep|>`
als Turn-Markup; der Kopfkommentar der Datei sagt das ausdrücklich. Für den Tool-Call-Pfad
ist das gewollt.

**Der Tool-Call-Pfad ist nicht betroffen — das ist gemessen, nicht vermutet.** Bei einer
Anfrage mit `tools` liefert derselbe Server `content=''`, sauber geparste `tool_calls` und
`finish_reason=tool_calls`: der peg-Parser konsumiert den Marker. Das kehrt die Risikolage
des Tickets um. Befürchtet war, ein Fix könnte die Tool-Fähigkeit still brechen; tatsächlich
ist der Tool-Call-Pfad der einzige, der bereits sauber arbeitet.

Betroffen ist ausschließlich `gemma9-factory` — es ist das einzige Loadout, das dieses
Template per `extraArgs` lädt. `gemma-factory`, `gemma-multiagent` und `gemma26-factory`
nutzen das im GGUF eingebettete Template.

## What

Der Proxy entfernt bekannte Turn-Marker aus dem `content` von **Non-Streaming**-Antworten,
bevor er sie ausliefert.

Der Ort ist bewusst gewählt: zum Zeitpunkt der Auslieferung ist der peg-Parser fertig,
Strippen kann ihn nicht mehr stören. Ein Stop-Token an der Quelle würde auch Direktzugriffe
auf :8092 abdecken, könnte aber genau die Sequenz abschneiden, die der Parser für Tool-Calls
braucht — das zu prüfen erforderte einen Neustart des produktiv laufenden Servers.

Eingriff: `proxyV1` reicht Antworten heute roh durch (`upstreamStream.pipe(res)`). Für
Non-Streaming-Antworten wird der Body stattdessen gepuffert, geparst, gesäubert und neu
gesendet; `content-length` wird dabei neu gesetzt.

### Bekannte Grenzen

1. **Streaming bleibt ungestrippt.** Bei SSE kann der Marker über Chunk-Grenzen zerrissen
   ankommen; ihn dort zu entfernen erforderte einen zustandsbehafteten Scanner im heikelsten
   Pfad des Proxys — dort, wo ein Fehler laut Kommentar im Code jeden wartenden Request der
   Queue mitreißt. Die Factory-Skripte fordern kein Streaming, sind also abgedeckt.
2. **Direktzugriffe auf :8092** am Proxy vorbei bleiben ungestrippt.
3. Nicht ausnahmslos reproduzierbar: bei einer JSON-Anfrage kam die Antwort in einem
   ```-Fence ohne Marker. Die Regel ist „im Klartextpfad praktisch immer", nicht „garantiert".

### Nicht Teil dieses Change

Dieselbe JSON-Probe brach `json.loads` wegen des ```-Fence, unabhängig vom Marker. Wer
Factory-Skripte auf gemma9 umstellt, braucht eine Fence-tolerante Extraktion — eigener Vorgang.

_Ticket: T002609_
