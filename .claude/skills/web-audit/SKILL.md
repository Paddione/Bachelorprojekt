---
name: web-audit
description: "Semantische Pruefung und Triage der eigenen Brand-Seiten ueber axe, Lighthouse und LLM. Kombiniert a11y-Scan (axe), Performance-Audit (Lighthouse) und semantische LLM-Beurteilung (alt-Texte, Meta-Tags, Ueberschriften, Link-Labels). Kein Merge-Gate — laeuft manuell. Triggers on web-audit, web:audit, semantic audit, semantische Pruefung, axe triage, llm review, page audit."
agent: bachelorprojekt-website
---

# web-audit

Semantische Pruefung und Triage der Brand-Seiten: kombiniert die vorhandenen technischen Audits
(`a11y:axe`, Lighthouse) mit einer LLM-basierten semantischen Beurteilung und erstellt eine
priorisierte Rangliste der Befunde.

**Kein Merge-Gate.** Der Skill laeuft manuell gegen die Live-Brands und entscheidet nicht ueber
PRs. Die Ausgaben sind ein Bericht unter `tmp/claude-scratch/web-audit-<brand>-<datum>.md` und
eine Kurzfassung auf stdout.

## Aufruf

```bash
task web:audit ENV=mentolder     # Standard-Routen: /, /ueber-mich, /kontakt, /coaching
task web:audit ENV=korczewski    # Standard-Routen: /
task web:audit ENV=mentolder WEB_AUDIT_ROUTES="/,/leistungen"  # Eigene Routen
```

## Drei Stufen

1. **axe a11y-Scan** — delegiert an `task a11y:axe ENV=<brand>`. Die vorhandenen
   axe-core-Regeln werden unveraendert genutzt; der Skill definiert keine eigenen.

2. **Lighthouse** — delegiert an die vorhandene `lighthouserc.json`. Performance-,
   Accessibility-, Best-Practices- und SEO-Scores.

3. **Semantische LLM-Pruefung** — Playwright rendert die Seiten, extrahiert
   `alt`-Texte, `<meta>`-Tags, Ueberschriften-Hierarchie und Link-Labels mit Ziel-URLs.
   Kein rohes HTML. Das Modell beurteilt:
   - ob `alt`-Texte den Bildinhalt beschreiben und nicht nur Dateinamen sind
   - ob die Meta-Description Marken- und Leistungsbezug hat
   - ob Link-Labels ausserhalb ihres Kontexts verstaendlich sind
   - die Ueberschriften-Hierarchie

   Zusaetzlich erstellt das Modell eine **Triage-Rangliste** der Roh-Befunde aus
   Stufe 1 und 2 — nach Auswirkung auf echte Nutzer sortiert, mit Begruendung.

## Ausfallsicherheit

Jede Stufe ist einzeln ausfallbar. Keine Stufe bricht den Lauf ab. Ausgefallene Stufen
werden im Bericht ausdruecklich mit `FAILED` gekennzeichnet. Exit-Code ist auch bei
Fehlern 0.

## Abgrenzung

- Nur eigene Brands (`mentolder`, `korczewski`)
- Keine visuelle Pruefung (Screenshots/Vision gehoeren zum Headed-E2E-Vorgang)
- Kein CI-Job — manueller Lauf
