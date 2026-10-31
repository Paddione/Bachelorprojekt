# Proposal: Dangling-Interfaces-Flow

WARUM: 879 Route-Knoten im Graph, 642 mit Aufrufer, 0 mit Handler-Verknüpfung
(Astro `src/pages/api/**/*.ts`, 362 Dateien, nicht als Handler verlinkt).
Eine naive „Route ohne Gegenstück"-Abfrage meldet fast alles als dangling.
Ziel: echte Waisen von Umbenennungen trennen und Einbettungs-Kanten zwischen
Akteuren sichtbar machen.

WAS (Scope: Feature, HTTP-only, HTML-Artifact):
- Anbieter-Inventar deterministisch: Astro-Dateirouten (`pages/api/**` →
  `/api/...`, `[id]`/`[...rest]` normalisiert) plus K8s-Service-DNS-Mapping.
- Exakter Abgleich gegen HTTP_CALLS (Pfad normalisiert, Query gestrippt).
- Reste als Beinahe-Treffer (Embedding, Schwelle τ kalibriert) oder Waisen
  klassifizieren. Drei Klassen mit Markierung im Kraftgraph.
- Ausgabe: eigenständiges HTML-Artifact mit Kraftgraph, kein Eingriff in die
  codebase-memory-UI auf :9749.

NICHT-Scope: EnvVars (1.124 Knoten), MCP-Tools, Taskfile-Tasks — folgt später.
Kein Health-/Latenz-Layer (tablet-rerank-Fall bleibt separates Thema).
