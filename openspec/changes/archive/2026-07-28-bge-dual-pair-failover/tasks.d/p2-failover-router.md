# p2 — Failover-Router als einzige Routing-Entscheidung

**Rolle:** impl · **depends_on:** p1 · **target_files:**
`website/src/lib/bge-router.ts`, `website/src/lib/embeddings.ts`, `website/src/lib/rerank.ts`

## Ziel

Eine Stelle, die entscheidet, welches bge-Paar eine Anfrage bedient — und die bei Ausfall oder
Überlast auf den Partner ausweicht. Alle späteren Konsumenten (HTTP-API in p3, MCP-Shim in p4)
rufen diese Stelle auf, statt eigene Ausweichlogik mitzubringen.

## Vorgaben

- **Bidirektional.** Agenten-Verkehr fällt von Paar B auf Paar A zurück, Batch-Verkehr von Paar A
  auf Paar B. Kein einseitiger Sonderfall.
- **Zwei Auslöser, nicht einer.** Umgeleitet wird bei rotem Health-Check *und* bei Überlast
  (gesättigte Queue bzw. gerissene Latenzschwelle). Die Überlast-Bedingung ist der eigentliche
  Wert des Routers: sie verhindert, dass ein laufender Reindex interaktive Agenten blockiert.
- **Jede Umleitung wird protokolliert.** `logger.warn` bei jedem Wechsel und bei jeder
  Degradation. Der stille Rerank-Ausfall, der wochenlang unbemerkt blieb, war genau das Ergebnis
  fehlender Sichtbarkeit — Stille ist hier der zu behebende Fehler, nicht ein Nebenaspekt.
- **Fail-closed, wenn beide Paare aus sind.** Ein Fehler wird geworfen; es werden keine
  Ersatz- oder Nullvektoren geliefert. Die bestehende Requirement „Fail-Closed bei
  bge-m3-Netzwerkfehler" bleibt damit gewahrt.
- **Health-Probing und Routing-Entscheidung bleiben getrennte Funktionen.** Das hält die Datei
  unter 300 Zeilen und macht beide Teile einzeln testbar.
- **Keine `any`-Typen.** Die Antwortformen von `llama-server` (Embedding, Rerank, Health) werden
  als explizite Interfaces typisiert.

## Schritte

- [x] `website/src/lib/bge-router.ts` anlegen: Typen für Paar-Identität (`batch` | `interactive`),
      Health-Status und Routing-Entscheidung; eine Probe-Funktion, die Erreichbarkeit und
      Auslastung eines Paars ermittelt; eine Auflösungsfunktion, die aus gewünschter Rolle plus
      Health-Zustand das tatsächlich zu verwendende Paar bestimmt und die Umleitung protokolliert.
- [x] Die Endpunkt-Adressen aus den in p5 eingeführten Environment-Variablen lesen, nicht
      hartkodieren. Solange p5 noch nicht gemergt ist, gegen die Variablennamen programmieren,
      die das Manifest in p5 festlegt.
- [x] `website/src/lib/embeddings.ts`: `callRouter` (aktuell Zeile 80) so umbauen, dass es die
      Zieladresse vom `bge-router` bezieht statt sie direkt aufzulösen. Das ist der einzige
      Engpass in dieser Datei — die öffentlichen Signaturen von `embedQuery` und `embedBatch`
      bleiben unverändert, damit keine Aufrufer angefasst werden müssen.
- [x] `website/src/lib/rerank.ts`: `rerankCandidates` so umbauen, dass es bei Ausfall des
      primären Rerankers **erst den Partner versucht** und erst danach auf `score: 0` degradiert.
      Sowohl der Partner-Wechsel als auch die Degradation werden als Warnung protokolliert. Die
      Signatur `rerankCandidates` und der Rückgabetyp `RerankResult` bleiben unverändert.

## Abgrenzung

Keine neuen HTTP-Endpunkte, kein MCP-Server, keine Änderung an `environments/*`. Dieses Partial
liefert die Routing-Bibliothek und schließt die beiden Bestandsclients daran an.
