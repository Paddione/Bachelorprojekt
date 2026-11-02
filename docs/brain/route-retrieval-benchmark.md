# Route→Handler Benchmark

Stand: 2026-11-02. Ausführbar mit `python3 scripts/route-retrieval-eval.py`.

Der Benchmark liest Quellen ausschließlich aus Commit
`8fed539b996fdcb89181fa8e8084fec8d299c8ab`. Er enthält 349 Routen und
119 Kandidatdateien: 115 externe Handler sowie vier Routen mit `inline:self`.
Query: kurze Route-ID und 2500 Zeichen Quelltext. Kandidat: Dateipfad und
2500 Zeichen Quelltext. Fehlende Dateien führen zum Abbruch statt zum
stillen Entfernen von Queries. JSON-Ausgaben enthalten die SHA256 der Labels.

| Verfahren | nDCG@10 | Recall@10 | MRR@10 |
|---|---:|---:|---:|
| Zeichen-TF-IDF, 3–5 Gramm | 0.441643 | 0.452614 | 0.626150 |
| BAAI/bge-m3, 1024 Tokens | 0.299346 | 0.351466 | 0.421761 |
| Statische Imports, zwei Schritte | 0.983337 | 0.986765 | 0.988539 |

Die Importbaseline ist diagnostisch: Die Labels stammen aus Codebeziehungen.
Ihr Ergebnis belegt keine semantische Generalisierung. TF-IDF passt das
Vokabular auf dem gesamten eingefrorenen Query-/Kandidatkorpus an; dies ist
ein transduktiver Retrievalvergleich.

Der dichte Vergleich mit `BAAI/bge-m3` (SentenceTransformers 6.2.0,
1024 Tokens) lief auf CPU, da CUDA in der vorhandenen Python-Umgebung
nicht verfügbar ist. Das Modell liegt unter TF-IDF und deutlich unter
der statischen Importreferenz. Ein Vergleich mit dem gemergten LoRA ist
für diese Entscheidung nicht nötig; erneutes Training ist nicht begründet.

## Entscheidung

Ein erneutes Training ist durch diesen Benchmark bisher nicht begründet.
Route→Handler mit sichtbaren Imports sollte primär über Codebeziehungen
aufgelöst werden. Für eine Trainingsentscheidung brauchen wir zusätzlich
unabhängig gelabelte semantische Fragen ohne direkte Importhinweise.
Das bisherige Training enthält Markdown-/Python-Docstring-Paare und bildet
diese TypeScript-Aufgabe nicht unmittelbar ab.

## Prüfung

`python3 -m pytest tests/py/unit/test_route_retrieval_eval.py -q`:
3 Tests bestanden (Frozen-Snapshot einschließlich Inline-Routen,
Metrikberechnung, Importauflösung und lexikalische Rangfolge).
