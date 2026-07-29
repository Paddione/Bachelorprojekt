# Proposal: t2431-k1-vector-db

## Why
Visualisierung des Vektorspeichers (Komponente K1 des Epics T002430) und Benennung der Schnittstellen, um Transparenz über Datenflüsse, Modelle, Dimensionen und Distanzmaße zu schaffen und ungenutzte Kanten zu identifizieren.

## What
Erstellung eines System-Diagramms (Mermaid) für Komponente K1 (Vektorspeicher) in `docs/diagrams/k1-vector-db.md`.
Das Diagramm benennt alle pgvector-Tabellen (`code_embeddings`, `knowledge.chunks`), deren Modelle (`bge-m3`, `voyage-multilingual-2`), Dimensionen (1024), Distanzmetriken (Cosine Similarity), und die zugehörigen Lese- und Schreibzugriffe. Es identifiziert außerdem ungenutzte/tote Schnittstellen.

_Ticket: T002431_
