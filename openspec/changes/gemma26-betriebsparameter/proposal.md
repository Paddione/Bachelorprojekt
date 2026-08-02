# Proposal: gemma26-betriebsparameter

## Why

Das Loadout `gemma26-factory` faehrt drei Betriebsparameter, die nie entschieden wurden,
sondern sich aus Defaults ergeben haben — und eine Qualitaetspruefung, die nie gelaufen ist.

Der schwerwiegendste Punkt ist der letzte: die Langkontext-Woertlichkeitsprobe aus T002535
richtet ihre Anfrage an `localhost:8081` — den Port des am 2026-07-27 decommissionierten
TEI-Embed-Dienstes. `gemma26-factory` laeuft auf 8091. Der Skip-Guard des Tests griff dadurch
bei jedem Lauf, die Probe hat nie gemessen, und T002535 wurde trotzdem auf `done` gesetzt. Die
q4_0-KV-Ausnahme aus T002534 ruht damit bis heute auf einer Kurzkontext-Probe von rund
200 Tokens, obwohl die Sorge aus T002501 gerade die Fehlerakkumulation ueber lange Kontexte
betrifft. Verstaerkt wird der Guard-Defekt durch T002574: `curl -s` liefert auch bei HTTP 500
den Exit-Code 0, ein Guard darauf haelt einen kaputten Server fuer einen gesunden.

Die Messung ist am 2026-08-02 nachgeholt worden und faellt zugunsten von q4_0 aus (39388
Prompt-Tokens, fuenf Laeufe, je sechs von sechs Zeichenketten zeichengenau). Damit diese
Aussage nicht erneut nur behauptet ist, muss die Probe reparierbar und wiederholbar werden.

Die beiden anderen Punkte sind Konfigurationsentscheidungen: Sampling-Parameter werden
nirgends gesetzt (es gelten die llama.cpp-Defaults statt der fuer Gemma 4 kalibrierten Werte),
und der Thinking-Modus haengt an `reasoning: "auto"`, waehrend `--chat-template-kwargs` vom
Runner ueberhaupt nicht unterstuetzt wird.

## What

- Endpunkt-Verfuegbarkeit wird ueber den HTTP-Status entschieden, nicht ueber den curl-Exit
  (behebt T002574), und als wiederverwendbare Hilfsfunktion bereitgestellt.
- Die Langkontext-Probe zielt auf den Port, den `loadouts.json` deklariert, belegt ihre
  tatsaechliche Kontextgroesse ueber `usage.prompt_tokens` und uebergibt den Prompt ueber
  Dateien statt ueber die Argumentliste.
- Der Runner reicht Sampling-Parameter und `--chat-template-kwargs` aus dem Loadout an
  `llama-server` durch; fehlende Felder erzeugen weiterhin kein Argument.
- `gemma26-factory` bekommt die kalibrierten Sampling-Werte und Thinking als Server-Default.
- Consumer mit knappem `max_tokens` schalten Thinking clientseitig ab, damit der neue
  Server-Default sie nicht mit leerem `content` zuruecklaesst.

_Ticket: T002579_
