# Proposal: Dangling-Graph-vollständig — alle Auswertungsarten, Scope zuletzt

Vorgänger: `feature/dangling-interfaces` (ausführend, nicht anfassen) baut
Inventar plus Exakt-Abgleich plus Embedding-Near-Miss als HTML-Artifact.
Dieser Folge-Plan deckt die übrigen Auswertungsarten ab — als eigene Dateien,
disjunkt zu den v1-Targets, damit beide Branches kollisionsfrei laufen.

WARUM: Der v1-Ansatz (Datei-Inventar plus neues Embedding) ist nur eine
Lesart. Offene Alternativen: HANDLES-Lücke im Indexer reparieren statt
umgehen, SEMANTICALLY_RELATED wiederverwenden, INFRA_MAPS traversieren,
aufrufer-getriebene Auflösung mit Belegpfad, Rename-Historie vor
Embedding-Raten, Laufzeit-Logs gegen Statik, Scope über HTTP hinaus.

WAS (4 Partials, Scope-Ausweitung als letzte Stufe p4):
- p1: HANDLES-Audit — welche Astro-Dateirouten keine Route-Kante haben.
- p2: Aufrufer-Auflösung — je Aufrufer ein Belegpfad zum Anbieter oder zur Lücke.
- p3: Rename plus Laufzeit — git-Historie und 404-/Proxy-Logs korrelieren.
- p4: Scope-Ausweitung (EnvVars, MCP-Tools, Taskfile-Tasks) plus Tests plus Runbook.

NICHT-Scope: UI-Eingriff in :9749, Indexer-Umbau selbst (p1 liefert nur den
Audit als Entscheidungsgrundlage), Health-/Latenz-Layer.
