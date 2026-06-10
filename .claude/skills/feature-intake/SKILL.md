---
name: feature-intake
description: Use when the user wants to discover, brainstorm, or collect features before planning, OR when the user wants to clarify open questions on existing Planungsbüro tickets. Triggers on: "was könnten wir als nächstes bauen", "schick gekko einen Fragebogen", "feature-ideen sammeln", "klär die offenen Fragen im Planungsbüro", "planungsbüro tickets klären", "plan-ready machen", "offene Fragen", or any pre-planning feature-discovery or ticket-clarification session.
---

# feature-intake — Feature-Entdeckung, PM-Fragebogen & Planungsbüro-Klärung

## Überblick

Dieser Skill ist dem `dev-flow-plan` **vorgelagert**: er sammelt Feature-Ideen und überführt sie in plan-ready Tickets. Drei Modi:

| Modus | Wann | Ergebnis |
|-------|------|---------|
| **Planungsbüro-Klärung** | Bestehende `planning`-Tickets haben offene Fragen / fehlende Readiness-Flags | HTML-Klärungsformular pro Ticket → Antworten ins Ticket schreiben |
| **Brainstorm** | User will jetzt live mitreden / frei ideieren | Strukturierte Feature-Liste → direkt zu `dev-flow-plan` |
| **HTML-Formular** | Auswahl + Priorisierung neuer Ideen per Klick — **für Patrick oder gekko** | HTML-Formular → ausgefülltes Markdown → `dev-flow-plan` |

**Standard-Annahme:** Patrick füllt lieber ein **HTML-Formular** aus als inline zu tippen (siehe Memory „Grilling via HTML form"). Im Zweifel **generiere das Formular** und liefere es per `SendUserFile`.

---

## Modus-Wahl

```
User spricht von "Planungsbüro", "klären", "offene Fragen", "plan-ready",
"Readiness", oder will bestehende planning-Tickets vorbereiten?
  → Planungsbüro-Klärung (Modus C) — PRIORITÄT vor B und A

User will Features nur auswählen + priorisieren (wenig tippen),
ODER "schick gekko einen Fragebogen" / "PM soll entscheiden" / "mach mir ein Formular"?
  → HTML-Formular-Modus (Modus B) — Empfänger = Patrick oder gekko

User will JETZT frei mitdenken / Cluster live durchgehen?
  → Brainstorm-Modus (Modus A)
```

---

## Modus C: Planungsbüro-Klärungsrunde

**Sage:** "Ich lade alle Planungsbüro-Tickets und leite offene Fragen ab."

### Schritt 1 — Tickets laden

```bash
kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
"SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''),
 array_to_string(areas,','), COALESCE(description,''), readiness::text,
 COALESCE(array_to_string(depends_on,','),'')
 FROM tickets.tickets WHERE status='planning'
 ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null
```

### Schritt 2 — Offene Fragen pro Ticket ableiten

Für jedes Ticket prüfe die Readiness-Flags und leite daraus konkrete Fragen ab:

#### Universelle Fragen (wenn Flag false)

| Readiness-Flag | Abzuleitende Frage |
|---------------|-------------------|
| `spec_skizziert: false` | Beschreibe die Kernfunktionalität in 2-3 Sätzen. Was ist explizit NICHT im Scope? |
| `abhaengigkeiten_klar: false` | Welche anderen Tickets / Features müssen VORHER fertig sein? Welche externen Dienste werden benötigt? |
| `offene_fragen_geklaert: false` | → Domain-spezifische Fragen (siehe unten) |
| `aufwand_geschaetzt: false` | Wie groß schätzt du den Aufwand? (klein ≤1d / mittel 2-4d / groß ≥1W) |

#### Domain-spezifische Fragen nach `areas`

**brett:** Welche Benutzerrollen sind betroffen? Soll das Feature auf Mobilgeräten vollständig funktionieren? Wie verhält sich das Feature bei Verbindungsunterbrechungen? Gibt es Abhängigkeiten zu bestehenden Brett-Figuren oder Board-States?

**website:** Für welche Benutzergruppe? (Admin / Endkunde / beide) — Beide Brands oder nur eine? — Sollen Änderungen versioniert werden? — SEO-relevant?

**chat:** Real-time (WebSocket) oder darf kurze Verzögerung akzeptabel sein? — Benachrichtigungen: E-Mail, Push oder nur in-App? — DSGVO-Löschkonzept nötig?

**infra:** Beide Brands deployen oder nur eine? — Breaking Change? Rollout-Strategie? — Ressourcenschätzung bekannt?

**auth:** Betrifft beide Keycloak-Realms? — Opt-in für bestehende User oder erzwungen? — Rollback-Plan?

**ai/factory:** Welche Modelle (Claude / DeepSeek) betroffen? — Dry-run-Modus nötig? — Wie messen wir Erfolg?

### Schritt 3 — HTML-Klärungsformular generieren

Generiere ein **eigenständiges HTML-Formular** (kein Backend, läuft via `file://`) direkt mit dem `Write`-Tool — **nicht** das pm-form-template.html kopieren (das ist Modus B). Dieses Formular wird **dynamisch aus den Ticket-Daten** aufgebaut.

**Datei:** `/tmp/planungsbuero-klaerung-<DATUM>.html`

**Formular-Struktur pro Ticket-Section:**
```
<section data-ticket="T000xxx">
  Ticket-Header: ID + Titel + Priorität-Badge
  Metadaten: Bereich, Aufwand, value_prop
  Readiness-Ampel: 🟢 true / 🔴 false pro Flag
  <fieldset legend="Abhängigkeiten"> — nur wenn abhaengigkeiten_klar: false
    Text-Input "Welche Tickets müssen vorher fertig sein?" + structured follow-ups
  <fieldset legend="Spec-Skizze"> — nur wenn spec_skizziert: false
    Textarea für Kernflow-Beschreibung + Not-Scope
  <fieldset legend="Domain-Fragen"> — immer wenn offene_fragen_geklaert: false
    Domain-spezifische Radio/Checkbox-Fragen basierend auf areas
</section>
```

**Technische Anforderungen:**
- Dark Theme (`background: #0d1117; color: #c9d1d9`)
- Alle Form-Felder mit `name="<external_id>_<schlüssel>"` — Ticket-Bezug für `buildMarkdown()`
- Structured fields bevorzugen: Radio/Checkbox für Ja/Nein/Optionen, Textarea nur für Freitext
- „Markdown kopieren"-Button mit `navigator.clipboard` + Fallback-Textarea für `file://`
- Fortschrittsbalken (wie viele Tickets ausgefüllt)
- `buildMarkdown()` erzeugt `### <ID> — <Titel>` pro Ticket mit allen `- **Frage**: Antwort`-Zeilen

### Schritt 4 — Formular liefern

Liefere die Datei per `SendUserFile`. Sage: "Ausfüllen → ‚Markdown kopieren' → hier einfügen."

### Schritt 5 — Antworten verarbeiten (nach Rücklauf)

Wenn das ausgefüllte Markdown zurückkommt, verarbeite **pro Ticket**:

#### 5a — Kommentar im Ticket hinterlegen

```bash
bash scripts/ticket.sh add-comment \
  --id <external_id> \
  --author "feature-intake" \
  --body "## Klärungsrunde $(date +%F)

**Abhängigkeiten:** <wert>
**Brand-Scope:** <wert>
**Spec-Skizze:** <freitext>
**Domain-Fragen:**
- <frage>: <antwort>"
```

#### 5b — Readiness-Flags aktualisieren

Setze einen Flag auf `true` nur wenn die zugehörige Frage tatsächlich beantwortet wurde:

```bash
bash scripts/ticket.sh plan-meta set \
  --id <external_id> \
  --readiness offene_fragen_geklaert=true,abhaengigkeiten_klar=true
```

#### 5c — Abhängigkeiten eintragen (wenn konkrete IDs genannt)

```bash
bash scripts/ticket.sh plan-meta set \
  --id <external_id> \
  --depends-on T000571,T000573
```

#### 5d — Status-Report ausgeben

Kurze Zusammenfassung: welche Tickets sind jetzt vollständig readiness-ready (alle 4 Flags true), welche bleiben offen. Tickets mit allen Flags auf `true` → proaktiv vorschlagen: „T000xxx ist plan-ready → `dev-flow-plan` starten?"

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

Lege ein neues Ticket mit `status=planning` an (statt `triage`), damit es im
Planungsbüro landet:

```bash
bash scripts/ticket.sh create \
  --type <typ> \
  --brand <brand> \
  --title "<titel>" \
  --priority <prio> \
  --description "<beschreibung>" \
  --status planning
```

Nach dem Anlegen die Büro-Metadaten setzen:

```bash
bash scripts/ticket.sh plan-meta set --id <ext-id> \
  --value-prop "<kern-nutzen>" --effort <klein|mittel|gross> --areas <Bereich>
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
  2-3 Zeilen Freitext (für Ideen, keine Checkbox abdeckt)

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
