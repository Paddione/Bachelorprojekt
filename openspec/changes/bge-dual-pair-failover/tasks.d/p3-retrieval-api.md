# p3 — Retrieval-Endpunkt und Änderungs-Feed

**Rolle:** impl · **depends_on:** p2 · **target_files:**
`website/src/pages/api/bge/retrieve.ts`, `website/src/pages/api/bge/changes.ts`

## Ziel

Die Arbeit des Batch-Paars für Agenten nutzbar machen, ohne dass ein Konsument Modellnamen,
Vektordimension oder Distanzmaß kennen muss.

## Vorgaben

- **Serverseitiges Embedding und Reranking.** Der Retrieval-Endpunkt nimmt Query plus `top_k`
  entgegen und liefert gerankte Treffer. Der Aufrufer übergibt kein Modell, keine Dimension und
  kein Distanzmaß — genau das ist der Zweck des Endpunkts.
- **Cross-Space-Queries werden abgelehnt.** Die bestehende Requirement „Verbot von
  Cross-Space-Queries" gilt unverändert. Eine Query, die Collections mit unterschiedlichen
  Vektorräumen träfe, wird zurückgewiesen statt gemischte Treffer zu liefern.
- **Der Router aus p2 wird aufgerufen, nicht umgangen.** Kein eigener Health-Check, keine eigene
  Ausweichlogik in diesen beiden Dateien.
- **Auth analog zum Bestand.** `website/src/pages/api/openspec/search.ts` und
  `website/src/pages/api/codesearch.ts` sind die Referenz für Auth-Gating und Query-Validierung
  in diesem Repo. Die neuen Endpunkte folgen derselben Form; die bestehende Requirement
  „SCS-Such-API mit Admin-Auth und Query-Validierung" ist der Maßstab.
- **503 statt stiller Leermenge**, wenn der Embedding-Pfad nicht erreichbar ist — konsistent zur
  bestehenden Requirement „SCS-Such-API 503 bei nicht erreichbarem Embedding-Service".

## Schritte

- [ ] `website/src/pages/api/bge/retrieve.ts` anlegen: Query und `top_k` validieren, über den
      Router aus p2 embedden, gegen den pgvector-Bestand suchen, über den Router reranken und
      höchstens `top_k` Treffer absteigend nach Relevanz zurückgeben.
- [ ] Cross-Space-Prüfung einbauen: zielt die Query auf Collections mit unterschiedlichen
      Vektorräumen, wird sie abgelehnt.
- [ ] `website/src/pages/api/bge/changes.ts` anlegen: nimmt einen Zeitpunkt entgegen und liefert
      genau die seither neu embeddeten Ressourcen samt ihrem Embedding-Zeitpunkt, damit Agenten
      Caches invalidieren können.
- [ ] Beide Endpunkte geben 503 zurück, wenn der Router meldet, dass beide Paare nicht erreichbar
      sind.

## Abgrenzung

Keine Änderung an der Routing-Bibliothek selbst und keine MCP-Registrierung. Wird beim Umsetzen
klar, dass der Router eine zusätzliche Funktion braucht, gehört diese Änderung nach p2 und muss
dort nachgezogen werden, nicht hier eingebaut.
