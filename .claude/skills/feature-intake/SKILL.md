---
name: feature-intake
description: Use when the user wants to discover, brainstorm, or collect features before planning. Triggers on requests like "was könnten wir als nächstes bauen", "schick gekko einen Fragebogen", "feature-ideen sammeln", "was wäre sinnvoll", or any pre-planning feature-discovery session.
---

# feature-intake — Feature-Entdeckung & PM-Fragebogen

## Überblick

Dieser Skill ist dem `dev-flow-plan` **vorgelagert**: er sammelt Feature-Ideen und überführt sie in plan-ready Tickets. Zwei Modi:

| Modus | Wann | Ergebnis |
|-------|------|---------|
| **Brainstorm** | User will jetzt live mitreden / frei ideieren | Strukturierte Feature-Liste → direkt zu `dev-flow-plan` |
| **HTML-Formular** | Auswahl + Priorisierung soll bequem per Klick statt Tippen erfolgen — **für Patrick selbst ODER für gekko** | Leicht ausfüllbares HTML-Formular → ausgefülltes Markdown → `dev-flow-plan` |

**Standard-Annahme:** Patrick füllt Auswahl/Priorisierung lieber in einem **HTML-Formular** aus als in einer Inline-Text-Frage-Antwort-Runde (siehe Memory „Grilling via HTML form"). Im Zweifel **generiere das Formular** und liefere es per `SendUserFile` — nicht für gekko, sondern für ihn selbst.

---

## Modus-Wahl

```
User will JETZT frei mitdenken / Cluster live durchgehen?
  → Brainstorm-Modus (Modus A)

User will Features nur auswählen + priorisieren (wenig tippen),
ODER sagt "schick gekko einen Fragebogen" / "PM soll entscheiden",
ODER "mach mir ein Formular"?
  → HTML-Formular-Modus (Modus B) — Empfänger = Patrick oder gekko
```

---

## Modus A: Interaktiver Brainstorm

**Sage:** "Ich führe einen Feature-Brainstorm durch."

### Schritt 1 — Kontext laden

Lies die aktiven Tickets kurz:
```bash
bash scripts/ticket.sh list --status open --limit 20 2>/dev/null | head -40 || true
```

### Schritt 2 — Ideation-Runden

Präsentiere Feature-Kandidaten in Clustern. Pro Cluster eine kurze Frage:

```
Cluster: [Bereich, z.B. "Brett / Gruppenarbeit"]
Kandidaten:
  • <Feature A> — <Nutzen in einem Satz>
  • <Feature B> — <Nutzen in einem Satz>

→ Welche davon sind interessant? Gibt es Varianten oder andere Ideen?
```

Nutze bekannte Projektbereiche als Cluster-Vorlage:
- **Brett** (3D-Board, Gruppenarbeit, Figuren, Animation)
- **Website / Content-Hub** (Newsletter, Verträge, CMS)
- **Chat / Messaging** (Kanäle, Notifications, Media)
- **Infra / DevEx** (CI, Factory, Monitoring, Deployment)
- **Keycloak / Auth** (SSO, Rollen, Onboarding)
- **Nextcloud / Files** (Kollaboration, Office, Backup)
- **AI / Factory** (Autopilot, Code-Review, Dispatcher)

### Schritt 3 — Priorisieren

Für jeden ausgewählten Kandidaten:
```
Feature: <Titel>
Typ: feature | fix | task
Brand: mentolder | korczewski | beide
Priorität: kritisch | hoch | mittel | niedrig
Aufwand (geschätzt): klein (≤1d) | mittel (2-4d) | groß (≥1W)
Kern-Nutzen: <ein Satz>
Abhängigkeiten: <andere Tickets/Features, falls bekannt>
```

### Schritt 4 — Tickets erstellen (optional, auf Anfrage)

```bash
bash scripts/ticket.sh create \
  --type <typ> \
  --brand <brand> \
  --title "<titel>" \
  --priority <prio> \
  --description "<beschreibung>"
```

Danach: direkt zu **`dev-flow-plan`** für den gewählten Kandidaten.

---

## Modus B: HTML-Formular (für Patrick oder gekko)

**Sage:** "Ich generiere ein HTML-Formular zum Ausfüllen." (Bei Empfänger gekko: "… für gekko.")

### Schritt 1 — Template nutzen, NICHT neu bauen

Es gibt ein fertiges, getestetes Template: **`.claude/skills/feature-intake/pm-form-template.html`** (selbst-enthalten, dark theme, Bereich-Chips → Feature-Listen → Prio/Aufwand-Dropdowns → robuster "Markdown kopieren"-Button mit Fallback-Textfeld).

```bash
cp .claude/skills/feature-intake/pm-form-template.html /tmp/feature-intake-$(date +%F).html
```

Dann **nur den `FEATURES`-Block anpassen** (JS-Objekt im `<script>`): die Kandidaten-Listen aktualisieren, falls neue Projektbereiche/Tickets relevant sind (siehe „Vorausgefüllte Feature-Kandidaten" unten). Layout/Copy-Logik nicht neu erfinden.

> Nur falls das Template fehlt oder grundlegend anders sein soll, baue von Grund auf neu — dann gelten die „Formular-Anforderungen" und „Formular-Struktur" unten als Spezifikation.

### Schritt 2 — An den Empfänger liefern

- **Empfänger Patrick (Standard):** Liefere die Datei direkt per `SendUserFile` (`/tmp/feature-intake-<datum>.html`), damit er sie mit einem Klick im Browser öffnen kann. Sag ihm: ausfüllen → „Markdown kopieren" → hier einfügen.
- **Empfänger gekko:** Nenne den `/tmp/`-Pfad und beschreibe den Versandweg (z.B. anhängen/teilen). Gleiche Ausfüll-Anleitung.

### Formular-Anforderungen

Das Formular muss:
- **Kein Backend** benötigen (läuft lokal im Browser via `file://`)
- Überwiegend **Checkboxen / Radio-Buttons / Dropdowns** verwenden (minimales Tippen)
- Einen **"Markdown kopieren"**-Button haben, der strukturierten Output in die Zwischenablage legt — **mit Fallback-Textfeld**, falls `navigator.clipboard` auf `file://` scheitert (Template hat das bereits)
- Das kopierte Markdown muss **direkt von Claude** lesbar/verarbeitbar sein

### Formular-Struktur

```
[ABSCHNITT: Feature-Bereiche]
  Checkboxen pro Bereich (Brett, Website, Chat, Infra, …)

[ABSCHNITT: Feature-Details — ein Block pro Bereich]
  Für jeden aktivierten Bereich erscheinen:
  • Feature-Ideen als Checkboxen (vorausgefüllt mit häufigen Kandidaten)
  • Priorität: Dropdown (Kritisch / Hoch / Mittel / Niedrig)
  • Aufwand: Dropdown (Klein / Mittel / Groß)
  • Kommentar: textarea (klein, optional — NICHT Pflicht)

[ABSCHNITT: Freie Ideen]
  2-3 Zeilen Freitext (für Ideen, die keine Checkbox abdeckt)

[FOOTER]
  "Markdown kopieren" Button → clipboard
```

### Markdown-Output-Format (was der Button erzeugt)

Das kopierte Markdown muss dieses Format erzeugen — eine Zeile pro Feature:

```markdown
## Feature-Intake: <Datum>
Eingereicht von: gekko

### Hohe Priorität
- [ ] **[Brett] Gruppen-Lobby** | Priorität: Hoch | Aufwand: Groß | Kommentar: "mit Avatar-Auswahl"
- [ ] **[Website] Newsletter-Vorlagen** | Priorität: Hoch | Aufwand: Mittel

### Mittlere Priorität
- [ ] **[Chat] Reaktionen** | Priorität: Mittel | Aufwand: Klein

### Freie Ideen
> "Export-Funktion für Brett-Sessions als PDF"
```

### Vorausgefüllte Feature-Kandidaten je Bereich

Nutze diese als Checkbox-Vorschläge im Formular:

**Brett:**
- Gruppen-Lobby (mehrere Boards gleichzeitig)
- Figuren-Animationen / Gesten
- Board-Export (PNG / PDF)
- Zuschauer-Modus (read-only)
- Board-Templates

**Website / Content-Hub:**
- Newsletter-Vorlagen-Bibliothek
- Vertrags-PDF-Preview
- Bild-Upload im HTML-Editor
- Mehrsprachigkeit (DE/EN)
- SEO-Metadaten-Editor

**Chat / Messaging:**
- Emoji-Reaktionen
- Thread-Antworten
- Datei-Anhänge (>10 MB)
- Gelesen-Bestätigungen
- Push-Notifications (PWA)

**Infra / DevEx:**
- Auto-Deploy bei Merge (GitOps)
- Staging-Umgebung
- Performance-Dashboard
- Alert-Regeln (Grafana)

**AI / Factory:**
- Autopilot-Qualitäts-Ratchet
- Ticket-Auto-Triage
- PR-Summary-Bot
- Code-Review DeepSeek-Qualität verbessern

### Übergabe nach Rücklauf

Wenn das ausgefüllte Markdown zurückkommt (egal ob von Patrick oder gekko):
1. Parse die Feature-Liste (Abschnitte Hohe/Mittlere Priorität + Freie Ideen)
2. Schlage vor, welches Feature als erstes zu `dev-flow-plan` gehen soll
3. Erstelle auf Anfrage Tickets für alle Features der Liste

---

## Übergabe an dev-flow-plan

Nach Brainstorm oder Rücklauf:

```
Nächster Schritt: dev-flow-plan für "<Feature-Titel>"
→ Skill: dev-flow-plan
```

Übergib den Feature-Titel + Kern-Nutzen + Priorität als Kontext.
