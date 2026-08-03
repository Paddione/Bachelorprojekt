# p2 — Website-Clients auf den llama.cpp-Dialekt

**Rolle:** impl
**target_files:** `website/src/lib/rerank.ts`, `website/src/lib/embeddings.ts`

| Datei | Ist | Budget |
| --- | --- | --- |
| `website/src/lib/rerank.ts` | 31 | 569 |
| `website/src/lib/embeddings.ts` | 179 | 421 |

Beide Budgets sind komfortabel; die Änderungen bewegen sich im Bereich weniger Zeilen.

## Task 2.1 — `rerank.ts` auf `POST /v1/rerank` umstellen

`website/src/lib/rerank.ts` — Ist 31, Budget 569.

Der aktuelle Aufruf spricht TEI-Dialekt:

```ts
const r = await fetch(`${rerankerUrl}/rerank`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, texts: docs }),
  signal: opts.signal,
});
if (!r.ok) return docs.map(doc => ({ doc, score: 0 }));
const j = await r.json() as Array<{ index: number; score: number }>;
return j
  .map(({ index, score }) => ({ doc: docs[index], score }))
  .sort((a, b) => b.score - a.score);
```

Umzustellen auf den llama.cpp-Dialekt:

- Pfad `/v1/rerank` statt `/rerank`
- Body `{ model, query, documents }` statt `{ query, texts }` — `documents` statt `texts` ist der
  entscheidende Feldnamen-Unterschied
- Antwortform `{ results: Array<{ index: number; relevance_score: number }> }` statt eines flachen
  Arrays; `relevance_score` wird auf das bestehende Feld `score` abgebildet

Das Modell-ID-Feld wird aus einer Umgebungsvariablen mit Default `bge-reranker-v2-m3` gelesen.
Bei Single-Model-Betrieb ignoriert `llama-server` den Wert, aber das Feld gehört zum Wire-Format.

Der öffentliche Rückgabetyp `RerankResult { doc: string; score: number }` bleibt **unverändert** —
kein Consumer muss angefasst werden.

Die llama.cpp-Antwortform wird als explizites Interface typisiert. Kein `as any`, kein
`catch (e: any)`: die `any`-Zählung in `website/src` steht auf 0 und darf nicht steigen.

## Task 2.2 — Stillen Rerank-Ausfall sichtbar machen

Weiterhin `website/src/lib/rerank.ts`.

Der heutige `catch`-Block ist die Ursache dafür, dass der Totalausfall des Rerankers unbemerkt
blieb: er gibt kommentarlos `score: 0` für alle Dokumente zurück.

Graceful Degradation bleibt Requirement — der Rückgabewert ändert sich nicht. Ergänzt wird eine
Warnung über den bereits im Modul verfügbaren `logger`:

- **Fehlerfall** (Exception oder `!r.ok`): `logger.warn` mit Kontext (Statuscode beziehungsweise
  Fehlermeldung, Anzahl Dokumente), danach wie bisher `score: 0`.
- **Regulär deaktiviert** (`LLM_RERANK_ENABLED=false`, `LLM_RERANKER_URL` nicht gesetzt, leere
  Eingabe): **keine** Warnung — das ist kein Ausfall, und eine Warnung dort würde die Logs
  fluten und den echten Fehlerfall wieder unsichtbar machen.

`logger` wird aus `./logger` importiert, analog zu `website/src/lib/embeddings.ts`.

## Task 2.3 — `embeddings.ts`-Defaults korrigieren

`website/src/lib/embeddings.ts` — Ist 179, Budget 421.

Das Wire-Format in `callRouter` (`POST ${embedUrl()}/v1/embeddings` mit `{ model, input }`,
Antwort `{ data: [{ embedding }], usage }`) passt bereits exakt zu `llama-server` und bleibt
unverändert. Zu ändern sind nur die veralteten Defaults und Kommentare:

- `embedUrl()`: Default `http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234` zeigt auf
  den abgeschalteten LM-Studio-Service und wird auf den neuen Embedding-Service umgestellt.
- Der Kommentar über `MODEL_ID_MAP` behauptet „TEI ignores this field; LM Studio routes by it" —
  nach dem Change trifft beides nicht mehr zu und wird korrigiert.

Der Voyage-Fallback-Pfad bleibt vollständig erhalten; `EmbeddingModel`, `embedQuery` und
`embedBatch` behalten ihre Signaturen.
