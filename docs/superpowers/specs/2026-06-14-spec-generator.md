---
ticket_id: T000723
plan_ref: docs/superpowers/plans/2026-06-14-spec-generator.md
status: active
date: 2026-06-14
---

# Spec: Spec-Generator — KI destilliert Grilling-Antworten in vollständige Feature-Spec

## Kontext: Ist-Zustand

Nach einem abgeschlossenen Feature-Grilling (Modus E in `feature-intake/SKILL.md`) liegen die Antworten als strukturiertes Markdown in einem Ticket-Kommentar vor. Danach muss Patrick manuell eine Spec-Datei erstellen und `dev-flow-plan` starten. Dieser manuelle Eingriff unterbricht den Fluss und erzeugt Reibung.

**Betroffener Flow:**
1. Modus E (Grilling) → HTML-Formular → Rücklauf → Kommentar ins Ticket (Schritt 5a)
2. **[Manuelle Lücke]** Patrick schreibt Spec, öffnet dev-flow-plan
3. dev-flow-plan liest Ticket + Spec → Brainstorming → Implementierungsplan

## Was dieses Feature ändert

Nach vollständig ausgefülltem Grilling-Rücklauf (Schritt 5a, alle Pflicht-Blöcke befüllt) führt der Skill automatisch folgende Schritte aus:

1. Vollständigkeits-Check: alle 6 Pflicht-Blöcke müssen nicht-leer sein
2. Spec-Generierung aus den Grilling-Antworten (kein weiterer User-Input nötig)
3. Spec als Datei in `docs/superpowers/specs/` schreiben
4. Spec-Inhalt als Ticket-Kommentar hinterlegen (author: `feature-intake/spec-generator`)
5. Readiness-Flag `spec_skizziert=true` setzen
6. Automatischer Handoff zu `dev-flow-plan` ohne STOP

## Kern-Nutzerflow

```
Grilling-Rücklauf kommt zurück (Markdown mit Blöcken 1–6)
  │
  ▼
Vollständigkeits-Check
  ├── Alle 6 Blöcke befüllt? → JA → weiter
  └── Nein → BLOCK: Fehlende Blöcke auflisteen, Formular erneut zeigen
  │
  ▼
Spec-Text generieren (KI-destillation aus Grilling-Antworten)
  │
  ▼
Datei schreiben: docs/superpowers/specs/<DATUM>-<ticket-slug>.md
  │
  ▼
Ticket-Kommentar: scripts/ticket.sh add-comment --author "feature-intake/spec-generator"
  │
  ▼
Readiness-Flag: spec_skizziert=true (via ticket.sh plan-meta set)
  │
  ▼
Handoff: dev-flow-plan aufrufen mit TICKET_EXT_ID (kein STOP)
```

## Vollständigkeits-Check-Logik

Ein Grilling gilt als **vollständig**, wenn alle folgenden Bedingungen erfüllt sind:

| Block | Pflicht-Feld | Gilt als befüllt wenn |
|-------|-------------|----------------------|
| Block 1 | Kern-Nutzerflow (Ablauf-Textarea) | Länge > 20 Zeichen |
| Block 1 | Primäre Nutzergruppe | Nicht leer / nicht „(nicht angegeben)" |
| Block 2 | Nicht-Scope | Mindestens eine Checkbox ODER Freitext > 5 Zeichen |
| Block 3 | Edge Cases | Mindestens eine Checkbox ODER Freitext > 5 Zeichen |
| Block 5 | Fehlerfall-Radio | Nicht leer |
| Block 6 | Erfolgsmetrik | Radio oder Freitext > 5 Zeichen |

**Block 4 (Mobile)** und domain-spezifische Blöcke sind optional — fehlen sie, wird kein BLOCK ausgelöst.

Bei unvollständigem Grilling:

```
⛔ Spec-Generierung blockiert — folgende Blöcke fehlen oder sind leer:
  • Block 1 — Kern-Nutzerflow: Ablauf-Feld ist leer
  • Block 6 — Erfolgsmetrik: weder Radio noch Freitext ausgefüllt

→ Bitte das Grilling-Formular erneut aufrufen und die markierten Felder ausfüllen.
  (Grilling-Formular: /tmp/grilling-<TICKET_EXT_ID>-<DATUM>.html)
```

## Spec-Inhalt (Ausgabeformat)

Die generierte Spec enthält folgende Abschnitte auf Deutsch:

```markdown
---
ticket_id: <TICKET_EXT_ID>
plan_ref: docs/superpowers/plans/<DATUM>-<slug>.md
status: active
date: <DATUM>
---

# Spec: <Ticket-Titel>

## Kern-Nutzerflow
[Destilliert aus Block 1 — Schritt-für-Schritt, in Prosaform]

## Akzeptanzkriterien
[Testbar formuliert, abgeleitet aus Blocks 1/3/5/6 — Beispiel:
- Wenn User X tut, erscheint Y innerhalb Z Sekunden
- Bei Fehlerfall zeigt System Fehlermeldung mit Retry-Option
- Feature ist auf Android-Chrome vollständig nutzbar (falls Mobile=Ja)]

## Edge Cases
[Liste aus Block 3 — je ein Satz was passiert]

## Fehlerfall-Behandlung
[Aus Block 5 — konkretes Verhalten bei Fehlern]

## Erfolgsmetrik
[Aus Block 6 — messbar oder beobachtbar]

## Technische Constraints
[Aus Ticket-Feldern + domain-spezifischen Blöcken:
- Betroffene Areas: <areas>
- Mobile: <Block 4 Ergebnis>
- Brand-Scope: <falls website/infra block vorhanden>
- Abhängigkeiten: <depends_on aus Ticket>]

## Betroffene Dateien
[Aus areas abgeleitet — grobe Hinweise für dev-flow-plan]
```

**Kein Nicht-Scope-Block** (explizit ausgenommen per Grilling-Entscheidung). Kein Wireframes-/Mockups-Block. Keine Migrations-SQL. Kein adversarialer KI-Review.

## Akzeptanzkriterien

- **AK-1:** Nach vollständigem Grilling-Rücklauf (alle 6 Pflicht-Blöcke befüllt) wird automatisch eine Spec-Datei unter `docs/superpowers/specs/<DATUM>-<slug>.md` erzeugt — ohne weiteren User-Input.
- **AK-2:** Die Spec enthält alle 6 Abschnitte (Kern-Nutzerflow, Akzeptanzkriterien, Edge Cases, Fehlerfall-Behandlung, Erfolgsmetrik, Technische Constraints) und ist auf Deutsch verfasst.
- **AK-3:** Alle Akzeptanzkriterien in der Spec sind testbar formuliert (kein „sollte besser sein", sondern „wenn X passiert, zeigt System Y").
- **AK-4:** Der Ticket-Kommentar wird via `scripts/ticket.sh add-comment --author "feature-intake/spec-generator"` geschrieben und ist im Ticket sichtbar.
- **AK-5:** Das Readiness-Flag `spec_skizziert=true` wird nach erfolgreicher Spec-Generierung gesetzt.
- **AK-6:** Der Handoff zu `dev-flow-plan` erfolgt automatisch mit der Ticket-ID — kein STOP, kein manueller Eingriff von Patrick.
- **AK-7:** Bei unvollständigem Grilling (mindestens ein Pflicht-Block leer) wird die Spec-Generierung GEBLOCKT und die fehlenden Blöcke werden mit Formular-Verweis aufgelistet.
- **AK-8:** Der gesamte Durchgang Grilling → Spec → Plan-Start läuft in einem einzigen Skill-Aufruf ohne Unterbrechung.

## Edge Cases

- **Leere Textarea im Pflicht-Block:** → BLOCK mit klarem Hinweis, welcher Block fehlt
- **Nur Checkboxen, keine Freitexte:** → gilt als befüllt (Checkboxen reichen)
- **Grilling-Rücklauf fehlt Block-Header:** → Parser erkennt Blöcke an `### Block N —` Prefix; fehlt ein Header → Block als fehlend werten
- **Domain-spezifischer Block fehlt:** → Kein Fehler; Technische Constraints werden ohne diesen Block generiert
- **Ticket hat keine `areas`:** → Betroffene Dateien-Abschnitt wird weggelassen
- **Spec-Datei existiert bereits (Datum+Slug Kollision):** → Suffix `-v2` anhängen

## Technische Constraints

- Implementierung ausschließlich als neue Sektion in `.claude/skills/feature-intake/SKILL.md` (nach Schritt 5a in Modus E)
- Kein neues Backend, kein neues Skript — nur SKILL.md-Erweiterung
- `scripts/ticket.sh add-comment` für Ticket-Kommentar (bestehender Befehl)
- `scripts/ticket.sh plan-meta set --readiness spec_skizziert=true` für Flag-Update
- Spec-Datei wird mit dem `Write`-Tool in `docs/superpowers/specs/` geschrieben
- Dateiname-Konvention: `<DATUM>-<ticket-slug>.md` wobei slug = Ticket-Titel lowercased, Leerzeichen → Bindestriche, Sonderzeichen entfernt
- Handoff zu dev-flow-plan via `export TICKET_EXT_ID` + Skill-Aufruf (wie in bestehender Übergabe-Sektion in feature-intake/SKILL.md)
- Spec auf Deutsch (Abschnittsnamen auf Deutsch, Inhalt auf Deutsch)
- Markdown-Dateien unterliegen keinem S1-Zeilenlimit (nur .ts/.js/.svelte etc.)

## Betroffene Dateien

| Datei | Änderung |
|-------|---------|
| `.claude/skills/feature-intake/SKILL.md` | Neuer Schritt 5b (Spec-Generator) nach bisherigem Schritt 5a — Vollständigkeits-Check + Spec-Generierung + Datei schreiben + Kommentar + Flag + Handoff |

Alle anderen Dateien bleiben unverändert.
