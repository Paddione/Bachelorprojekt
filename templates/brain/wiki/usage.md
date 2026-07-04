---
type: runbook
tags: [howto, meta]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# Usage — Seiten anlegen und pflegen

## Neue Seite anlegen

1. Slug wählen: kebab-case, englisch, sprechend (Konvention in [[SCHEMA]]).
2. Datei `wiki/<slug>.md` anlegen — Frontmatter-Template aus [[cheatsheet]] kopieren.
3. `type` wählen (Tabelle unten), `tags` nicht-leer füllen, mit `status: draft` starten.
4. Von mindestens einer bestehenden Seite verlinken — üblicherweise [[index-moc]] —
   sonst entsteht ein Orphan (G-BRAIN07 in [[quality-goals]]).
5. Beide Lint-Skripte lokal laufen lassen (Kommandos in [[cheatsheet]]), committen,
   Eintrag in [[log]] ergänzen.

## Welcher type?

| type | wofür |
|---|---|
| note | Wissens-/Konzeptseite (Standard) |
| moc | Map of Content — thematischer Hub, bündelt Links |
| entity | Person, System, Dienst, Organisation |
| decision | festgehaltene Entscheidung inkl. Begründung |
| runbook | Schritt-für-Schritt-Anleitung |

## raw → wiki

Rohmaterial (Transkripte, Exporte, Fragmente) landet ohne Frontmatter-Zwang in
`raw/`. Von dort wird es zu gelinteten `wiki/`-Seiten **kompiliert, nicht
verschoben** ([[SCHEMA]]): Erkenntnisse destillieren, Quelle als `source::`
referenzieren, raw-Datei nach dem Destillat löschen (G-BRAIN10: kein Eintrag
älter als 14 Tage). Prompt-Vorlage dafür: [[llm-workflows]].

## log.md pflegen

Pro inhaltlichem Commit ein Eintrag in [[log]] (G-BRAIN09): Datum, was, warum,
betroffene Seiten als Wikilinks.

Erste Hilfe bei roter CI: [[first-aid]].
