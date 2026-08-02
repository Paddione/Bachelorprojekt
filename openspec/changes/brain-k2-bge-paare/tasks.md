# Tasks: K2 bge-Paare Visualisierung

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | docs/brain/k2-bge-paare.md | docs | docs/brain/k2-bge-paare.md | — |
| 2 | docs/brain/k2-silent-failures.md | docs | docs/brain/k2-silent-failures.md | 1 |

## Partials

### 1 — Diagramm und Aufrufer-Tabelle

**target_files:** `docs/brain/k2-bge-paare.md`

- Mermaid/ASCII-Diagramm: GPU-Paar (Ist) + CPU-Paar (Soll, gestrichelt)
- Aufrufer-Tabelle: wer ruft welchen Endpunkt, welcher Vektorraum, woher kommt die Adresse
- Ist/Soll visuell unterscheidbar (durchgezogen vs. gestrichelt, oder Farben)
- Host-SPOF markiert

### 2 — Silent-Failure-Analyse

**target_files:** `docs/brain/k2-silent-failures.md`

- Pro Aufrufer: Fehlerbehandlung, Fallback-Wert, Alarmierung
- Historischer Fall: Reranker score:0-Fallback (Wochen unentdeckt)
- Liste aller still degradierenden Pfade
