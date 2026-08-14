# p2 — Kernretrieval implementieren

**Rolle:** impl · **Dateien:** `scripts/knowledge/lib-context-retrieve.mjs`

Pures Modul ohne Rück-Import auf CLI- oder API-Schichten (S2-Gate: keine neuen Import-Zyklen).
Neue Datei, `.mjs`-Limit 800 Zeilen, veranschlagt sind rund 250–300.

## Exportierte Funktionen

1. **`buildPredicates({ role, corpora, status })`** — übersetzt Rolle, Korpus-Whitelist und Status
   in SQL-Prädikate auf `knowledge.chunks.metadata` plus einen Join auf `knowledge.collections`
   über `source`. Rolle und Domäne dürfen den Query-Text **nicht** berühren: als Text verwässern
   sie das Signal, als Metadaten-Prädikat filtern sie exakt und ohne GPU-Kosten.

2. **`embedQuery(text)`** — genau ein `bge_embed`-Aufruf über denselben Gateway-Pfad, den
   `scripts/knowledge/lib-knowledge-pg.mjs` bereits nutzt. Ergebnis gecacht per
   `sha256(text‖model)` in einer **prozesslokalen Map**. Keine Dateiablage: nach T002661 kostet
   ein Query-Embedding 0,25 s, womit der Cache eine Optimierung ist und die
   Invalidierungsfragen einer persistenten Ablage nicht rechtfertigt.

3. **`pullCandidates(vector, predicates, limit)`** — `ORDER BY embedding <=> $1 LIMIT $2`,
   Vorgabe `limit=40`. Der Wert ist Parameter, keine Konstante im Query-String; p6 kalibriert ihn.

4. **`rerank(query, candidates, topK)`** — ein `bge_rerank`-Batch. Bei Fehler oder
   Nichterreichbarkeit liefert die Funktion die Kandidaten in Vektor-Reihenfolge zurück und setzt
   ein Flag `degraded: 'rerank'`, statt zu werfen.

5. **`fillBudget(ranked, budgetTokens)`** — greedy nach Score bis zur Budget-Grenze; liefert die
   Auswahl plus eine Bilanz `{ used, budget, selected, candidates }`.

## Konventionen

Die Token-Schätzung nutzt dieselbe Heuristik wie `scripts/openspec-embed.mjs` (`approxTokens`,
Länge geteilt durch vier), damit Index- und Retrieval-Seite dieselbe Rechnung anstellen.

Jede Funktion mit Zugriff auf ein externes System unterscheidet **drei Fälle explizit**: Antwort
erhalten und brauchbar, Antwort erhalten und leer, keine Antwort erhalten. Der leere Fall darf
nicht wie der Fehlerfall behandelt werden und umgekehrt — genau diese Verwechslung macht die
Herkunfts-Marker aus p4 sonst wertlos.

## Kostenlage (gemessen nach T002661)

Der Rerank stellt rund 96 % der Dispatch-Zeit: Embedding 0,25 s, Rerank über 40 Kandidaten
6,35 s, über 20 Kandidaten 3,42 s. Die Kandidatenzahl vor dem Rerank ist damit die einzige
Stellschraube, die zählt — deshalb ist `limit` Parameter und nicht Konstante.
