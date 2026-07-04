---
type: runbook
tags: [llm, workflow]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# LLM-Workflows — den Brain maschinell anreichern

## Ingest-Weg

Im Hauptrepo (Bachelorprojekt) existiert die Skill `brain-ingest` samt
Worklist; die Gruppe `ssot-specs` listet alle OpenSpec-SSOT-Specs als
Ingest-Kandidaten (G-BRAIN11 in [[quality-goals]]). Rohmaterial landet in
`raw/`, destillierte Seiten in `wiki/` — Details in [[usage]].

## Agent-Konventionen (Pflicht)

1. **source::-Pflicht:** Jede kompilierte Seite trägt mindestens eine
   `source::`-Zeile auf ihre Quelle ([[cheatsheet]]).
2. **Kompilieren, nicht verschieben:** Quellinhalte bleiben im
   Ursprungs-Repository ([[SCHEMA]]); Wiki-Seiten fassen zusammen.
3. **Kein Orphan:** Neue Seiten aus [[index-moc]] (oder einem thematischen MOC)
   verlinken.
4. **Lint vor Push:** Beide Skripte lokal ausführen ([[cheatsheet]]).
5. **Journal:** Pro Commit ein [[log]]-Eintrag (G-BRAIN09).

## Prompt-Vorlagen

### Prompt 1 — Neue Wiki-Seite anlegen

```text
Lege im brain-Repo eine neue Wiki-Seite an. Thema: <Thema>.
1. Lies SCHEMA.md (Frontmatter-Pflicht, Wikilink-Formen, Sprachkonvention).
2. Erzeuge wiki/<slug>.md (Slug: kebab-case, englisch) mit type/tags/status
   (Start: draft) und mindestens einer source::-Zeile auf die Quelle.
3. Verlinke die Seite aus wiki/index-moc.md (kein Orphan).
4. Fuehre bash scripts/lint-frontmatter.sh . und bash scripts/lint-wikilinks.sh . aus.
5. Ergaenze einen log.md-Eintrag (Datum, was, warum).
```

### Prompt 2 — Bestehende Seite verdichten

```text
Verdichte die Wiki-Seite wiki/<slug>.md, ohne Wissen zu verlieren.
Regeln: Frontmatter nur bei status aendern, source::-Zeilen erhalten,
bestehende Wikilinks weiterverwenden oder bewusst entfernen (Ziel-Seiten
muessen ueber index-moc erreichbar bleiben). Danach beide Lint-Skripte
ausfuehren und einen log.md-Eintrag ergaenzen.
```

### Prompt 3 — MOC pflegen

```text
Pruefe wiki/index-moc.md gegen den Bestand unter wiki/:
1. Liste Seiten, die von keiner anderen Seite verlinkt sind (Orphans).
2. Gruppiere thematisch; lege ab ca. 10 ungruppierten Seiten einen neuen
   MOC (type: moc) an und verlinke ihn aus index.md (max. 2 Hops).
3. Beide Lint-Skripte ausfuehren, log.md-Eintrag ergaenzen.
```

### Prompt 4 — raw → wiki destillieren

```text
Destilliere raw/<datei>.md in gelintete Wiki-Seiten (kompilieren, nicht
verschieben — siehe SCHEMA.md):
1. Extrahiere die wiederverwendbaren Erkenntnisse; eine Seite pro Konzept.
2. Jede neue Seite: Frontmatter, source::-Rueckverweis auf die
   Ursprungsquelle, Verlinkung aus einem MOC.
3. Loesche die raw-Datei nach dem Destillat (Backlog-Frische: 14 Tage).
4. Beide Lint-Skripte ausfuehren, log.md-Eintrag ergaenzen.
```

### Prompt 5 — OpenSpec-SSOT-Sync

```text
Synchronisiere eine Hauptrepo-Spec ins brain-Wiki:
Quelle: Bachelorprojekt openspec/specs/<spec-slug>.md (SSOT — bleibt dort).
1. Kompiliere sie zu wiki/<spec-slug>.md: Purpose als Kurzfassung,
   Requirements als Stichpunkte — keine Volltext-Kopie.
2. Frontmatter: type: note, tags: [ssot, spec], status: active.
3. Pflicht-Zeile: source:: Bachelorprojekt openspec/specs/<spec-slug>.md
4. Verlinke die Seite aus wiki/index-moc.md; beide Lint-Skripte ausfuehren;
   log.md-Eintrag ergaenzen.
Kandidatenliste: Ingest-Worklist-Gruppe ssot-specs im Hauptrepo.
```

Ziele: [[quality-goals]] · Troubleshooting: [[first-aid]].
