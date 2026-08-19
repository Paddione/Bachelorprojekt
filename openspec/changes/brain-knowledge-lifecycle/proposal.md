# Proposal: brain-knowledge-lifecycle

## Why

Das Brain kann Inhalte bereits kompilieren und per BM25 lesen, bewertet dabei aber weder
zeitliche Gültigkeit noch Provenienz, Widersprüche oder Retrieval-Qualität. Dadurch sind
veraltete und aktuelle Aussagen für Agenten gleichwertig, und die Pipeline kann eine hohe
Quellabdeckung melden, ohne zu messen, ob relevante Seiten tatsächlich gefunden werden.

Zusätzlich bleibt entscheidungsrelevantes Wissen aus Pull Requests und Reviews außerhalb des
Brain. Dieses Wissen soll nur über einen expliziten, datensparsamen und menschlich geprüften
Pilotpfad aufgenommen werden; ambienter Zugriff auf beliebige private Repositories ist
ausgeschlossen.

## What

- Ergänzt Wiki-Seiten rückwärtskompatibel um flache Provenienz- und Gültigkeitsmetadaten sowie
  optionale maschinenlesbare `claim::`-Kanten.
- Erweitert `brain_search` um optionale Metadaten- und Zeitpunktfilter und liefert Provenienz-
  und Frischeinformationen in Treffern zurück, ohne das bestehende Default-Verhalten zu brechen.
- Fügt einen offline deterministischen, zunächst report-only laufenden Audit für veraltete
  Quellen, überlappende widersprüchliche Claims und ungültige Zeitintervalle hinzu.
- Pilotiert eine explizit auf Repository und Pull Requests begrenzte Expertise-Extraktion. Rohes
  GitHub-Material wird lokal redigiert und gestagt; nur ausdrücklich freigegebene Artefakte unter
  einer allowlisteten Quelle gelangen in den Ingest.
- Fügt ein versioniertes Offline-Evalset und reproduzierbare Retrieval-Metriken (Recall@k, MRR
  und Anteil veralteter Treffer) hinzu. Ein hartes Gate wird erst nach einer gemessenen Baseline
  eingeführt.
- Nutzt weiter das dateibasierte Brain als SSOT-kompilierte Langzeitablage; es wird weder eine
  Graphdatenbank noch ein zweiter Retrieval-Dienst eingeführt.

_Ticket: T012913_
