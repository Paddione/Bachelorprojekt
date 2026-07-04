---
type: runbook
tags: [howto, reference]
status: active
source:: Bachelorprojekt openspec/changes/brain-quality-goals (T001608)
---
# Cheatsheet

## Frontmatter-Template (kopieren, anpassen)

```yaml
---
type: note
tags: [thema]
status: draft
source:: Bachelorprojekt docs/pfad-zur-quelle (Kontext)
---
```

Erlaubte Werte — `type`: note, moc, entity, decision, runbook ·
`status`: draft, active, archived · `tags`: nicht-leere Liste (leere Liste
wird vom Lint abgewiesen, G-BRAIN02). Welcher `type` wofür: [[usage]].

## Wikilink-Syntax (alle drei Formen werden gelintet)

- Plain: `[[index-moc]]` — Linkziel ist der Dateiname ohne Endung.
- Alias: `[[quality-goals|Qualitätsziele]]` — eigener Linktext nach dem Strich.
- Anker: `[[SCHEMA#wikilinks]]` — Sprung zu einer Überschrift.

Der Lint prüft den Slug-Teil vor `|` bzw. `#` — auch in Code-Fences. Für
Platzhalter-Beispiele deshalb spitze Klammern nutzen: `[[<slug>]]` matcht der
Linter nicht.

## source::-Rückverweise

```text
source:: Bachelorprojekt openspec/specs/brain-foundation.md
source:: Vaultwarden-Eintrag "GPU-Host" (Credentials NIE im Klartext)
```

## Sprach- und Slug-Konvention (Kurzform, verbindlich in [[SCHEMA]])

Prosa deutsch, Fachbegriffe englisch; Slugs kebab-case, englisch, sprechend.

## Lint lokal

```bash
bash scripts/lint-frontmatter.sh .
bash scripts/lint-wikilinks.sh .
```

Rote CI entwirren: [[first-aid]] · Ziele und Mess-Kommandos: [[quality-goals]].
