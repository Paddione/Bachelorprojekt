---
title: Brain Knowledge Lifecycle
ticket_id: T012913
plan_ref: openspec/changes/brain-knowledge-lifecycle/tasks.md
status: draft
---

# Brain Knowledge Lifecycle

## Zielbild

Das bestehende dateibasierte Brain bleibt die permanente Wissensschicht. Der Ingest versieht
kompilierte Seiten deterministisch mit Provenienz und Beobachtungszeit. Retrieval lädt weiterhin
nur relevante Seiten, kann aber Status, Typ, Quelle und einen Betrachtungszeitpunkt berücksichtigen.
Ein Audit konsolidiert nicht automatisch, sondern macht veraltete oder widersprüchliche Aussagen
für Menschen und Agenten sichtbar.

## Metadatenvertrag

Die bestehenden Pflichtfelder `type`, `tags` und `status` bleiben unverändert. Neue kompilierte
Seiten erhalten flache, YAML-parserfreundliche Felder:

- `source_kind`: kontrollierter Ursprung wie `openspec`, `runbook`, `adr` oder
  `github-reviewed`;
- `source_revision`: deterministischer Hash der lokalen Quelldatei;
- optional `upstream_revision`: validierte unveränderliche GitHub-Head-SHA für
  PR-abgeleitete `github-reviewed`-Artefakte; lokale Policies derselben Manifest-Gruppe
  bleiben ausschließlich über ihren lokalen Hash verankert;
- `observed_at`: ISO-8601-Zeitpunkt der Quellenbeobachtung;
- `valid_from`: ISO-Datum oder Zeitpunkt, ab dem der Inhalt gilt;
- optional `valid_until` und `superseded_by`.

Beim Kompilieren eines PR-abgeleiteten reviewed-Artefakts bleibt `upstream_revision` erhalten, während
`source_revision` deterministisch die Bytes des lokalen approved-Artefakts bezeichnet.

Alte Seiten ohne diese Felder bleiben lesbar. Zeitintervalle sind halboffen
`valid_from <= as_of < valid_until`. Optionale Body-Kanten der Form
`claim:: <key> = <value>` erlauben einen deterministischen Widerspruchsaudit, ohne freie Prosa
semantisch erraten zu müssen.

## Retrieval

`brain_search` behält Query und `top_k` als bestehenden Vertrag. Optionale Filter für `type`,
`tags`, `status`, `source_kind` und `as_of` werden konjunktiv angewandt. Ohne Filter bleiben
Ranking und Rückgabemenge kompatibel. Treffer enthalten zusätzlich die verfügbaren
Provenienz-/Gültigkeitsfelder und eine berechnete Frischeklassifikation. `brain_read` bleibt
unverändert vollständig.

## Audit und Konsolidierung

Ein Standardbibliothek-basiertes Offline-Werkzeug prüft:

1. ungültige oder überlappende Gültigkeitsintervalle;
2. Quellrevisionen gegen den aktuellen lokalen Quellhash;
3. gleiche `claim::`-Keys mit unterschiedlichen Werten in zeitlich überlappenden aktiven Seiten;
4. `superseded_by`-Ziele auf Existenz.

Der erste Release erzeugt Text und JSON, verändert aber keine Wiki-Seite und löscht nichts.
Automatische Konsolidierung bleibt bewusst außerhalb des Scopes.

## GitHub-Expertise-Pilot

Der Pilot verlangt explizite `owner/repo`- und PR-Auswahl. Er verwendet keine globale Suche und
keine implizite Organisationsweite. Fetch-Ergebnisse werden lokal in einen nicht ingestierten
Staging-Bereich geschrieben, Secrets und unnötige Personenangaben werden entfernt, und Quellen-
URL, Repository, PR-/Review-ID sowie Revision bleiben erhalten. Erst ein ausdrücklicher
Approve-Schritt erzeugt Markdown unter der allowlisteten Gruppe `docs/brain-expertise/approved/`.
Die Pipeline verarbeitet ausschließlich diese freigegebenen Artefakte.

## Evaluation

Ein versioniertes JSONL-Evalset beschreibt Query, erwartete relevante Slugs und optionale
Metadatenfilter. Ein Offline-Runner nutzt denselben Index wie der MCP-Server und meldet Recall@k,
MRR sowie den Anteil ungültiger/veralteter Treffer. Die erste Baseline ist beobachtend; ein
Schwellwert-Gate braucht ein späteres, datenbasiertes Spec-Delta.

## Nicht-Ziele

- keine Vektor- oder Graphdatenbank;
- keine LLM-basierte Erkennung von Widersprüchen in freier Prosa;
- keine automatische Veröffentlichung ungeprüfter GitHub-Inhalte;
- keine automatische Löschung oder Überschreibung beim Audit;
- kein Bruch der vorhandenen MCP-Werkzeugliste.
