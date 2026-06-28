# ADR-004: LLM-Embedding-Architektur — fail-closed, kein Cross-Space-Fallback

**Status:** Accepted  
**Datum:** 2026-05-01  
**Ticket:** T001298

## Kontext

Das Projekt betreibt zwei Embedding-Modelle mit inkompatiblen Vektorräumen:

- `bge-m3` (768 Dimensionen, via TEI auf dem GPU-Host, Retrieval-optimiert)
- `voyage-multilingual-2` (1024 Dimensionen, via Voyage AI API, kostenpflichtig)

Vektoren aus verschiedenen Embedding-Modellen sind mathematisch inkompatibel: Ein `bge-m3`-Query-Vektor kann nicht sinnvoll gegen `voyage-multilingual-2`-Dokumentvektoren mit `<=>` (pgvector Cosinus-Distanz) verglichen werden. Das Ergebnis wäre semantisch bedeutungslos (Garbage-Retrieval), ohne dass ein Fehler geworfen wird.

## Entscheidung

Jede Kollektion ist genau einem Embedding-Modell zugeordnet. Anfragen an eine Kollektion verwenden immer das zugeordnete Modell. Fällt das Modell aus, schlägt die Anfrage mit einem klar definierten Fehler fehl (`MixedEmbeddingModelError` oder Service-503). Es gibt keinen automatischen Fallback auf ein anderes Modell.

Multi-Kollektions-Anfragen, die beide Vektorraumtypen mischen würden, werden abgelehnt (`MixedEmbeddingModelError`).

## Konsequenzen

**Positive Konsequenzen:**
- Retrieval-Qualität ist garantiert: kein stiller Fehler durch Vektorraum-Mismatch.
- Deterministisches Verhalten: Entwickler und Nutzer wissen, welches Modell wann verwendet wird.
- Einfache Fehlersuche: ein Fehler zeigt präzise an, welches Modell nicht erreichbar ist.

**Negative Konsequenzen:**
- Ausfall des GPU-Hosts (RTX 5070 Ti) legt alle `bge-m3`-Kollektionen lahm — kein Cloud-Fallback.
- `voyage-multilingual-2`-Kollektionen sind von der Voyage-AI-API abhängig (externe Verfügbarkeit).
- Kein transparenter Degraded-Mode: Nutzer sehen einen Fehler, keine verschlechterten Ergebnisse.

**Bewusste Ablehnung:** Ein stiller Fallback wurde explizit verworfen, weil fehlerhafte Vektorraum-Mischung schlechtere Ergebnisse liefert als ein klarer Fehler. Die Entscheidung priorisiert Korrektheit über Verfügbarkeit.
