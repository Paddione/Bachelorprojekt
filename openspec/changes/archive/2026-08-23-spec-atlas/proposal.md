# Proposal: spec-atlas

## Why

Die SSOT-Specs sind contract-flat: 145 Slugs, 2242 Requirements, 4988 Szenarien —
ohne Navigation auf Requirement-Ebene. `software-factory.md` allein hält 201
Requirements in einer undifferenzierten Liste (5562 Zeilen). Drei Fragen sind
today unbeantwortbar, ohne 52k Zeilen Markdown zu durchsuchen:

1. **Provenance** — welches Ticket hat REQ-X zuletzt geändert?
2. **In-Flight-Kollisionen** — welche aktiven Changes zielen auf dasselbe
   Requirement? (Der Konflikt-Gate der Factory prüft Datei-Overlap, nicht
   Requirement-Overlap.)
3. **Systemüberblick** — welche Requirements gehören zu welchem Code-Pfad?

Die Change-Delta-Mechanik bleibt unangetastet: Archive mergen bereits zu 100 %
in die SSOT. Es fehlt eine *Sicht*, keine weitere Merge-Ebene.

## What

Ein Generator-Script (`scripts/openspec-atlas.sh` + Parser-Modul), das aus drei
mechanischen Quellen ein committed Markdown-Artefakt (`docs/spec-atlas.md`)
erzeugt:

- `openspec/specs/*.md` — Slugs, Purpose-Zeilen, Requirement-/Szenario-Zählung,
  Zeilenzahl (Parser-Grammatik = dieselben Regexes wie `openspec-merge.mjs`)
- `openspec/component-map.yaml` — Reverse-Mapping Slug → Code-Pfade
- `openspec/changes/archive/*/.ticket` + Delta-Specs — Provenance je Requirement
  (letztes Ticket + ADDED/MODIFIED)
- `openspec/changes/*/specs/*.md` — In-Flight-Warnungen pro Requirement

Zusätzlich: curated Top-10-Gruppierung als View-Metadaten in einer Config-Datei
neben dem Generator; neue Requirements landen default in `ungrouped`. Das Artefakt
wird über einen neuen Taskfile-Task in `freshness:regenerate` integriert (Muster:
`openspec:status-map`) und damit vom Freshness-Gate auf Drift geprüft.

**Non-Goals:** Keine Änderung an Validator, Merge-Tool oder SSOT-Dateien. Keine
Website-Ausgabe (JSON-Follow-up bei Bedarf). Kein Split von Monolith-Specs — der
Atlas liefert später dessen Migrationskarte (A1 deferred).

_Verworfene Alternativen:_ Direkt-SSOT-Schreibweise (verliert Diff-Protokoll und
Merge-Determinismus); Gruppierungs-H2s in Spec-Dateien (Merge fügt ADDED vor dem
nächsten H2 ein → stille Fehlplatzierung); Sofort-Split (Blast-Radius über
component-map/context.sh/gestagte Pläne ohne Datenlage); Brain-Ingest-Erweiterung
(Brain ist Volltext-Narrativ-Layer, falsches Korn für einen Index).

_Ticket: T015012_
