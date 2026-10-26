# Design: Dangling-Interfaces-Flow

## Klassen und Markierung

| Klasse | Bedeutung | Darstellung |
|---|---|---|
| Beinahe-Treffer | Aufruf zielt auf `/api/flux/value`, angeboten wird `/api/flux/values` | rot, gestrichelte Embedding-Kante mit Score |
| Waise Anbieter | Endpunkt ohne jeden Aufrufer | orange, eigener Cluster |
| Waise Verbraucher | Aufruf ohne Anbieter | rot und fett (Laufzeitfehler) |

## Ablauf

1. Inventar: `src/pages/api/**/*.ts` einlesen, Dateipfad → Route mappen
   (`pages/api/flux/values.ts` → `/api/flux/values`), `[id]` → `:id`,
   Service-DNS (`llm-gateway-tablet:8080`) über K8s-Services auflösen.
2. Exakt-Abgleich: HTTP_CALLS-Ziele normalisieren (Query strippen,
   Trailing-Slash, `:id`-Form) und gegen Inventar joinen.
3. Kalibrierung: exakt verbundene Paare = Positivbeispiele, Zufallspaare =
   Negativbeispiele, daraus τ messen statt schätzen.
4. Reste: Embedding-Ähnlichkeit zwischen verbliebenen Anbietern und
   Verbrauchern, Kante nur bei Score ≥ τ.
5. Report: JSON plus HTML-Kraftgraph (rot gestrichelt mit Score, orange
   Cluster, rot fett). Skripte via Runbook erreichbar (S4).

## Entscheidungen

- Embeddings nur zweite Stufe: Normalisierung schließt die meisten Lücken
  deterministisch; Einbettung findet semantische Nähe der Reste.
- HTML-Artifact statt UI-Eingriff: keine Änderung an :9749 nötig.
- Neue Dateien bewusst klein (≈200 Zeilen) mit Reserve unter dem Limit.
