---
ticket_id: T000723
spec_ref: docs/superpowers/specs/2026-06-14-spec-generator.md
status: active
date: 2026-06-14
domains: [skills, scripts]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Spec-Generator — KI destilliert Grilling-Antworten in vollständige Feature-Spec

## Ziel

Nach vollständig ausgefülltem Grilling-Rücklauf (Modus E, Schritt 5) generiert der Skill automatisch eine vollständige Spec-Datei, schreibt einen Ticket-Kommentar, setzt das Readiness-Flag `spec_skizziert=true` und übergibt an `dev-flow-plan` — ohne manuellen Stop.

## Architektur

Einzige Änderung: Erweiterung von `.claude/skills/feature-intake/SKILL.md`. Der bisherige Schritt 5 (Rücklauf verarbeiten) wird um einen neuen **Schritt 5b** (Spec-Generator) ergänzt, der direkt nach Schritt 5a (Spec-Kommentar ins Ticket schreiben) eingehängt wird.

```
Modus E — Schritt 5 (Rücklauf verarbeiten)
  ├── 5a: Spec-Material als Kommentar ins Ticket  [BESTEHT BEREITS]
  ├── 5b: Vollständigkeits-Check                  [NEU]
  ├── 5c: Spec-Datei generieren + schreiben       [NEU]  ← war bisher Schritt 5b (Abschluss-Report)
  ├── 5d: Readiness-Flag spec_skizziert=true      [NEU]
  ├── 5e: Handoff zu dev-flow-plan (kein STOP)    [NEU]
  └── 5f: Abschluss-Report (angepasst)            [ANGEPASST]
```

Bestehende Schritte 5b (Readiness-Flags) und 5c (Abschluss-Report) werden umbenannt/angepasst um Nummernkollision zu vermeiden.

## S1-Budget-Analyse

| Datei | Typ | S1-Limit | Baseline | Status |
|-------|-----|----------|----------|--------|
| `.claude/skills/feature-intake/SKILL.md` | Markdown | **kein Limit** | nicht baselined | ✅ Unbegrenzt |

Markdown-Dateien (`.md`) sind von den S1-Gates ausgenommen — nur `.ts`, `.js`, `.svelte` etc. unterliegen Zeilenlimits aus `docs/code-quality/gates.yaml`. Die Erweiterung von feature-intake/SKILL.md hat kein Budget-Risiko.

## Dateistruktur

| Datei | Aktion | Begründung |
|-------|--------|-----------|
| `.claude/skills/feature-intake/SKILL.md` | Erweitern | Neue Schritte 5b–5e nach bestehendem 5a |
| `docs/superpowers/specs/2026-06-14-spec-generator.md` | Erstellt | Diese Spec (bereits vorhanden) |
| `docs/superpowers/plans/2026-06-14-spec-generator.md` | Erstellt | Dieser Plan (bereits vorhanden) |

Keine weiteren Dateien werden erstellt oder modifiziert.

## Tasks

### Task 1: Vollständigkeits-Check-Logik definieren (SKILL.md-Erweiterung vorbereiten)

**Ziel:** Klare, parsbare Vollständigkeits-Regeln als Inline-Logik in SKILL.md formulieren.

**Prüfregeln (in Prosa für den Skill-Agenten):**

```
Vollständig wenn ALLE folgenden Bedingungen erfüllt:
  • Block 1 Ablauf-Textarea: length > 20 Zeichen
  • Block 1 Primäre Nutzergruppe: nicht leer, nicht "(nicht angegeben)"
  • Block 2 Nicht-Scope: ≥1 Checkbox gesetzt ODER Freitext > 5 Zeichen
  • Block 3 Edge Cases: ≥1 Checkbox gesetzt ODER Freitext > 5 Zeichen
  • Block 5 Fehlerfall-Radio: nicht leer
  • Block 6 Erfolgsmetrik: Radio gesetzt ODER Freitext > 5 Zeichen

Optional (kein BLOCK wenn fehlend):
  • Block 4 Mobile
  • Domain-spezifische Blöcke
```

**Bei unvollständig:** Fehlende Blöcke auflisten + Formular-Verweis + kein Weiterfahren.

### Task 2: Neuen Schritt 5b (Vollständigkeits-Check) in SKILL.md einfügen

**Position:** In Modus E, nach dem bestehenden Abschnitt `#### 5a — Spec-Kommentar ins Ticket schreiben`.

**Inhalt des neuen Abschnitts:**

```markdown
#### 5b — Vollständigkeits-Check (Vorbedingung für Spec-Generierung)

Prüfe den Rücklauf auf Vollständigkeit bevor die Spec generiert wird:

| Block | Prüfung | BLOCK wenn |
|-------|---------|------------|
| Block 1 — Ablauf | Textarea-Länge | < 20 Zeichen |
| Block 1 — Nutzergruppe | Feld vorhanden + nicht leer | Fehlt |
| Block 2 — Nicht-Scope | ≥1 Checkbox ODER Freitext | Beides leer |
| Block 3 — Edge Cases | ≥1 Checkbox ODER Freitext | Beides leer |
| Block 5 — Fehlerfall | Radio ausgewählt | Nicht gesetzt |
| Block 6 — Erfolgsmetrik | Radio ODER Freitext | Beides leer |

**Bei unvollständigem Rücklauf:**

Gib aus:
```
⛔ Spec-Generierung blockiert — folgende Blöcke fehlen oder sind leer:
  • [Liste der fehlenden Blöcke]

→ Bitte das Grilling-Formular erneut öffnen und die markierten Felder ausfüllen:
  /tmp/grilling-<TICKET_EXT_ID>-<DATUM>.html
```

Stoppe hier — führe Schritt 5c NICHT aus.

**Bei vollständigem Rücklauf:** Fahre direkt mit Schritt 5c fort.
```

### Task 3: Neuen Schritt 5c (Spec-Datei generieren + schreiben) in SKILL.md einfügen

**Position:** Nach dem neuen Schritt 5b.

**Inhalt des neuen Abschnitts:**

```markdown
#### 5c — Spec-Datei generieren und schreiben

Destilliere die Grilling-Antworten in eine vollständige Spec. Dateiname:

```bash
SPEC_SLUG=$(echo "<Ticket-Titel>" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')
SPEC_FILE="docs/superpowers/specs/$(date +%F)-${SPEC_SLUG}.md"
# Bei Kollision: SPEC_FILE mit -v2 Suffix
```

Schreibe die Datei mit dem `Write`-Tool nach folgendem Schema (auf Deutsch):

```markdown
---
ticket_id: <TICKET_EXT_ID>
plan_ref: docs/superpowers/plans/<DATUM>-<SPEC_SLUG>.md
status: active
date: <DATUM>
---

# Spec: <Ticket-Titel>

## Kern-Nutzerflow
[Prosa aus Block 1 — Schritt-für-Schritt destilliert]

## Akzeptanzkriterien
[Testbar formuliert aus Blocks 1/3/5/6 — z.B. "Wenn User X tut, erscheint Y"]

## Edge Cases
[Liste aus Block 3]

## Fehlerfall-Behandlung
[Aus Block 5]

## Erfolgsmetrik
[Aus Block 6 — messbar oder beobachtbar]

## Technische Constraints
[Aus Ticket-Areas + domain-spezifischen Blöcken + depends_on]

## Betroffene Dateien
[Aus areas abgeleitet — grobe Hinweise]
```

Danach den Spec-Inhalt auch als Ticket-Kommentar schreiben:

```bash
bash scripts/ticket.sh add-comment \
  --id <TICKET_EXT_ID> \
  --author "feature-intake/spec-generator" \
  --body "## Auto-generierte Spec $(date +%F)

[vollständiger Spec-Inhalt]

---
*Generiert aus Grilling-Rücklauf via feature-intake/spec-generator*"
```
```

### Task 4: Bestehenden Schritt 5b (Readiness-Flags) zu 5d umbenennen + spec_skizziert=true ergänzen

**Änderung:** Bisheriger `#### 5b — Readiness-Flags aktualisieren` wird zu `#### 5d — Readiness-Flags aktualisieren`. Zusätzlich `spec_skizziert=true` nach erfolgreicher Spec-Generierung setzen:

```bash
bash scripts/ticket.sh plan-meta set \
  --id <TICKET_EXT_ID> \
  --readiness spec_skizziert=true
```

Der bestehende Code für `offene_fragen_geklaert=true` und `aufwand_geschaetzt=true` bleibt erhalten.

### Task 5: Neuen Schritt 5e (Automatischer Handoff zu dev-flow-plan) einfügen

**Position:** Nach 5d (Readiness-Flags), vor dem Abschluss-Report.

**Inhalt:**

```markdown
#### 5e — Automatischer Handoff zu dev-flow-plan

Nach vollständiger Spec-Generierung übergib direkt an dev-flow-plan — kein STOP, kein manueller Eingriff:

```bash
export TICKET_EXT_ID="<TICKET_EXT_ID>"
# dev-flow-plan erkennt TICKET_EXT_ID und überspringt Ticket-Erstellung
```

Sage: "Spec generiert ✓ — übergebe direkt an dev-flow-plan für die Implementierungsplanung."

Rufe dann `dev-flow-plan` auf.
```

### Task 6: Abschluss-Report (bisheriger Schritt 5c) zu 5f umbenennen und anpassen

**Änderung:** Der Abschluss-Report zeigt jetzt auch die generierte Spec-Datei:

```
Grilling + Spec-Generierung abgeschlossen für <TICKET_EXT_ID>:

✓ Spec-Material als Kommentar hinterlegt (author: feature-intake/grilling)
✓ Auto-Spec generiert: docs/superpowers/specs/<dateiname>
✓ Spec als Ticket-Kommentar hinterlegt (author: feature-intake/spec-generator)
✓ Readiness-Flags aktualisiert: spec_skizziert=true, offene_fragen_geklaert=true
✓ Handoff zu dev-flow-plan eingeleitet

[nur wenn noch Flags fehlen:]
Verbleibende offene Flags:
  🔴 abhaengigkeiten_klar — noch ausstehend
  🔴 aufwand_geschaetzt — noch ausstehend
```

### Task 7: Verifikation

```bash
# Offline-Tests + Freshness-Check
task test:all
task freshness:regenerate
task freshness:check
```

Manuelle Verifikation:
- feature-intake/SKILL.md manuell lesen: Schritte 5a–5f sind korrekt nummeriert und vollständig
- Spec-Format-Check: Alle 6 Abschnitte im Spec-Template vorhanden
- Vollständigkeits-Tabelle: Alle 6 Pflicht-Blöcke aufgeführt
- Handoff-Sektion: Export von TICKET_EXT_ID und dev-flow-plan Aufruf vorhanden

## Implementierungs-Reihenfolge

```
Task 2 (5b Vollständigkeits-Check einfügen)
  → Task 3 (5c Spec-Datei generieren einfügen)
  → Task 4 (5b→5d Readiness umbenennen + spec_skizziert)
  → Task 5 (5e Handoff einfügen)
  → Task 6 (5c→5f Abschluss-Report anpassen)
  → Task 7 (Verifikation: task test:all + freshness)
```

Alle Tasks sind reine SKILL.md-Edits — sequenziell, eine Datei, keine Parallelisierung nötig.

## Risiken & Guardrails

| Risiko | Mitigation |
|--------|-----------|
| Bestehende Schrittsnummern kollisionieren | Umbenennung von 5b→5d und 5c→5f explizit dokumentiert |
| Grilling-Rücklauf-Format ändert sich | Vollständigkeits-Check ist format-tolerant (sucht `### Block N —` Header) |
| dev-flow-plan ignoriert TICKET_EXT_ID | Bestehende Übergabe-Logik in feature-intake schon vorhanden (siehe Ende von Modus A/B) |
| spec_skizziert=true überschreibt vorhandenes Flag | Idempotent — flag kann beliebig oft auf true gesetzt werden |
