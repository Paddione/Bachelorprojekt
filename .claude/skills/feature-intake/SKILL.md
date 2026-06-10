---
name: feature-intake
description: Use when the user wants to discover, brainstorm, or collect features before planning, OR when the user wants to clarify open questions on existing Planungsbüro tickets. Triggers on: "was könnten wir als nächstes bauen", "schick gekko einen Fragebogen", "feature-ideen sammeln", "klär die offenen Fragen im Planungsbüro", "planungsbüro tickets klären", "plan-ready machen", "offene Fragen", "gekkomode", "frag gekko", "interview gekko", "was braucht gekko", "gekko befragen", or any pre-planning feature-discovery or ticket-clarification session.
---

# feature-intake — Feature-Entdeckung, PM-Fragebogen & Planungsbüro-Klärung

## Überblick

Dieser Skill ist dem `dev-flow-plan` **vorgelagert**: er sammelt Feature-Ideen und überführt sie in plan-ready Tickets. Vier Modi:

| Modus | Wann | Ergebnis |
|-------|------|---------|
| **Planungsbüro-Klärung** | Bestehende `planning`-Tickets haben offene Fragen / fehlende Readiness-Flags | HTML-Klärungsformular pro Ticket → Antworten ins Ticket schreiben |
| **Brainstorm** | User will jetzt live mitreden / frei ideieren | Strukturierte Feature-Liste → direkt zu `dev-flow-plan` |
| **HTML-Formular** | Auswahl + Priorisierung neuer Ideen per Klick — **für Patrick oder gekko** | HTML-Formular → ausgefülltes Markdown → `dev-flow-plan` |
| **GekkoMode** | Offenes Entdeckungs-Interview mit gekko — Schmerzen + Wünsche herauskitzeln | Interview-HTML-Formular → strukturierter Rücklauf → neue `planning`-Tickets |

**Standard-Annahme:** Patrick füllt lieber ein **HTML-Formular** aus als inline zu tippen (siehe Memory „Grilling via HTML form"). Im Zweifel **generiere das Formular** und liefere es per `SendUserFile`.

---

## Modus-Wahl

```
User nennt "gekkomode" / "frag gekko" / "interview gekko" / "was braucht gekko"
  → GekkoMode (Modus D) — PRIORITÄT vor B und A

User spricht von "Planungsbüro", "klären", "offene Fragen", "plan-ready",
"Readiness", oder will bestehende planning-Tickets vorbereiten?
  → Planungsbüro-Klärung (Modus C) — PRIORITÄT vor B und A

User will Features nur auswählen + priorisieren (wenig tippen),
ODER "schick gekko einen Fragebogen" / "PM soll entscheiden" / "mach mir ein Formular"
  OHNE Entdeckungscharakter (Ideen bereits bekannt)?
  → HTML-Formular-Modus (Modus B) — Empfänger = Patrick oder gekko

User will JETZT frei mitdenken / Cluster live durchgehen?
  → Brainstorm-Modus (Modus A)
```

---

## Modus C: Planungsbüro-Klärungsrunde

**Sage:** "Ich lade alle Planungsbüro-Tickets und leite offene Fragen ab."

### Schritt 1 — Tickets laden

```bash
PLANNING_ROWS=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
"SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''),
 array_to_string(areas,','), COALESCE(description,''), readiness::text,
 COALESCE(array_to_string(depends_on,','),'')
 FROM tickets.tickets WHERE status='planning'
 ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null)

if [[ -z "$PLANNING_ROWS" ]]; then
  echo "ℹ️  Keine planning-Tickets vorhanden. Modus C entfällt — stattdessen Modus A oder B starten?"
  exit 0
fi
```

### Schritt 2 — Offene Fragen pro Ticket ableiten

Für jedes Ticket prüfe die Readiness-Flags und leite daraus konkrete Fragen ab:

#### Gültige Readiness-Schlüssel (alle 4 Pflicht-Flags)

| Schlüssel | Bedeutung | Abzuleitende Frage wenn `false` |
|-----------|-----------|--------------------------------|
| `spec_skizziert` | Kernfunktionalität beschrieben | Beschreibe die Kernfunktionalität in 2-3 Sätzen. Was ist explizit NICHT im Scope? |
| `abhaengigkeiten_klar` | Blockierende Tickets/Dienste bekannt | Welche anderen Tickets / Features müssen VORHER fertig sein? Welche externen Dienste werden benötigt? |
| `offene_fragen_geklaert` | Domain-Fragen beantwortet | → Domain-spezifische Fragen (siehe unten) |
| `aufwand_geschaetzt` | Aufwand grob geschätzt | Wie groß schätzt du den Aufwand? (klein ≤1d / mittel 2-4d / groß ≥1W) |

> **Wichtig:** Nur diese exakten Schlüssel in `--readiness` verwenden — `ticket.sh` parst sie als freeform JSON, falsch geschriebene Keys werden stillschweigend ignoriert.

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

## Modus D: GekkoMode — Entdeckungs-Interview

**Zweck:** Nicht aus einer vordefinierten Liste wählen, sondern *unbekannte* Schmerzen und Wünsche von gekko herauskitzeln — offener Entdeckungscharakter. Das Interview generiert Rohideen, die Claude anschließend in vollständige `planning`-Tickets überführt.

**Sage:** "Ich erstelle ein Entdeckungs-Interview-Formular für gekko."

### Schritt 1 — Bestehende Tickets laden (Duplikatschutz)

```bash
EXISTING=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, status FROM tickets.tickets
   WHERE status NOT IN ('done','archived')
   ORDER BY created_at DESC LIMIT 60;" 2>/dev/null)
```

Halte diese Liste im Arbeitsgedächtnis — sie dient später beim Ticket-Anlegen zum Duplikatcheck.

### Schritt 2 — Interview-HTML-Formular generieren

Erstelle `/tmp/gekko-interview-<DATUM>.html` mit dem `Write`-Tool. Das Formular ist ein **eigenständiges, backend-freies HTML**, läuft via `file://`.

**Formular-Design:** Dark Theme (`#0d1117` / `#c9d1d9`), große Schrift, viel Weißraum — entspannt ausfüllbar, kein Zeitdruck. Überschrift: „Hey gekko — was brauchst du?" Introtext: „5–10 Minuten. Keine falschen Antworten. Deine Inputs landen direkt im Planungsbüro."

#### Frageblöcke (in dieser Reihenfolge)

**Block 1 — Schnell-Check: Was nutzt du gerade aktiv?**
Checkboxen (Mehrfachauswahl):
- Brett (3D-Board)
- Website / Admin-Bereich
- Chat / Messaging
- Nextcloud (Dateien / Office)
- Vaultwarden (Passwörter)
- DocuSeal (Verträge)
- Keycloak / Login
- Etwas anderes: `<text input>`

> Ziel: Scope einschränken — nur aktiv genutzte Bereiche werden in Block 2 vertieft.

**Block 2 — Schmerzen (dynamisch nach Block-1-Auswahl)**

Für jeden in Block 1 angehakten Bereich erscheint ein Fieldset. Die Fragen sind **bereichsspezifisch**:

*Brett:*
- Was nervt dich am meisten, wenn du Brett benutzt? `<textarea rows=2>`
- Gibt es Situationen, wo du Brett *nicht* benutzt, obwohl du es könntest — warum? `<textarea rows=2>`
- Was fehlt dir, damit Brett auch auf dem Handy gut funktioniert? `<textarea rows=2>`

*Website / Admin:*
- Was machst du umständlich, weil es kein gutes Tool gibt? `<textarea rows=2>`
- Welche Inhalte pflegst du regelmäßig — und was davon ist mühsam? `<textarea rows=2>`
- Gibt es etwas, das du *anderen* zeigen willst, aber die Website das noch nicht hergibt? `<textarea rows=2>`

*Chat / Messaging:*
- Wann greifst du auf ein anderes Tool zurück, weil der Chat nicht reicht? `<textarea rows=2>`
- Was fehlt dir im Vergleich zu anderen Messengern, die du kennst? `<textarea rows=2>`

*Nextcloud / Dateien:*
- Was machst du manuell, das automatisch sein sollte? `<textarea rows=2>`
- Gibt es Zusammenarbeits-Szenarien, die noch nicht funktionieren? `<textarea rows=2>`

*Vaultwarden / Passwörter:*
- Hast du Passwörter, die du noch nicht migriert hast — warum nicht? `<textarea rows=2>`
- Was wäre nötig, dass Vaultwarden dein einziger Passwort-Manager wird? `<textarea rows=2>`

*DocuSeal / Verträge:*
- Welcher Schritt im Vertragsworkflow kostet dich am meisten Zeit? `<textarea rows=2>`
- Gibt es Dokumenttypen, die noch nicht abgedeckt sind? `<textarea rows=2>`

*Keycloak / Login:*
- Gab es Login-Probleme, über die du einfach drübergestrichen hast? `<textarea rows=2>`
- Wie läuft dein Onboarding neuer Nutzer — was ist hakelig? `<textarea rows=2>`

**Block 3 — Wunschzettel (offen)**

Drei Freitext-Felder, betitelt:
- „Wenn ich eine Sache sofort hätte, wäre es…" `<textarea rows=2>`
- „In 6 Monaten würde ich mir wünschen, dass…" `<textarea rows=2>`
- „Andere Plattformen haben X, das vermisse ich hier…" `<textarea rows=2>`

**Block 4 — Quick-Ranking**

5 vorgefertigte Ideen (dynamisch aus den aktuellen Planungsbüro-Einträgen oder Standardkandidaten), präsentiert als **Drag-and-Drop-Rangliste** (oder Fallback: 1–5 Nummern-Dropdowns). Überschrift: „Bring diese Ideen in deine Reihenfolge (1 = zuerst):"

Standard-Kandidaten (falls keine planning-Tickets vorhanden):
1. Brett: Board-Export als PNG/PDF
2. Website: Bild-Upload im HTML-Editor
3. Chat: Push-Notifications (PWA)
4. Allgemein: Performance-Dashboard
5. AI: Ticket-Auto-Triage

Falls planning-Tickets existieren: erste 5 davon als Ranking-Items verwenden.

**Block 5 — Kontext & Timing**

Radio-Buttons:
- „Wie oft nutzt du die Plattform?" → Täglich / Mehrmals/Woche / Seltener
- „Was ist dein primäres Gerät?" → Desktop / Laptop / Tablet / Handy
- „Hast du konkrete Deadlines, auf die du wartest?" → Ja (Freitext) / Nein

**[FOOTER]**
- Absende-Info: „Markdown kopieren"-Button + Fallback-Textarea
- Hinweis: „Patrick schaut sich das innerhalb von 24h an."

#### Technische Anforderungen

- `name`-Attribute: `block1_<bereich>`, `block2_<bereich>_<nr>`, `block3_<nr>`, `block4_rank_<nr>`, `block5_freq`, `block5_device`, `block5_deadline`
- Block 2 Fieldsets initial `display:none`; JS zeigt sie an, wenn der Block-1-Checkbox aktiviert wird
- Drag-and-Drop-Ranking: HTML5 draggable, Fallback: Nummern-Dropdowns (1–5, keine Doppelwahl)
- `buildMarkdown()` erzeugt das Ausgabeformat (siehe unten)
- `navigator.clipboard` mit Fallback-Textarea

### Schritt 3 — Formular liefern

Liefere `/tmp/gekko-interview-<DATUM>.html` per `SendUserFile`. Sage Patrick: „Schick das an gekko — ausfüllen → ‚Markdown kopieren' → dir zurückschicken → du gibst es mir hier."

### Schritt 4 — Rücklauf verarbeiten

Wenn das ausgefüllte Markdown zurückkommt:

#### Markdown-Ausgabeformat (was der Button erzeugt)

```markdown
## GekkoMode Interview: <Datum>
Eingereicht von: gekko

### Block 1 — Aktiv genutzte Bereiche
- Brett
- Website / Admin-Bereich
- Chat

### Block 2 — Schmerzen

**Brett:**
- Nervt: "Figuren lassen sich nicht gruppieren"
- Nicht genutzt weil: "Auf Handy zu fummelig"
- Handy-Problem: "Buttons zu klein, kein Touch-Drag"

**Website / Admin:**
- Umständlich: "Newsletter-Bilder muss ich extern hochladen"
- Mühsam: "Vertragsvorlagen jedes Mal neu tippen"
- Zeigen will: "Referenzen-Galerie fehlt"

### Block 3 — Wunschzettel
- Sofort: "Brett auf Handy benutzbar machen"
- In 6 Monaten: "Newsletter komplett in der Plattform"
- Vermisse: "Notion-ähnliche Datenbanken"

### Block 4 — Ranking
1. Chat: Push-Notifications
2. Website: Bild-Upload
3. Brett: Board-Export
4. AI: Auto-Triage
5. Allgemein: Performance-Dashboard

### Block 5 — Kontext
- Nutzungsfrequenz: Täglich
- Primärgerät: Handy
- Deadline: "Vertrags-Feature bis Ende Juli"
```

#### Tickets anlegen

Pro Schmerz-Nennung + Wunsch aus Block 3 (der noch kein Ticket hat):

```bash
# 1. Duplikatcheck gegen $EXISTING — nur anlegen wenn kein ähnlicher Titel
TICKET_RESULT=$(bash scripts/ticket.sh create \
  --type feature \
  --brand mentolder \
  --title "<destillierter Titel>" \
  --priority <hoch|mittel|niedrig — abgeleitet aus Ranking+Intensität der Nennung> \
  --description "<Originalzitat aus dem Interview in Anführungszeichen>" \
  --status planning)

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)

bash scripts/ticket.sh plan-meta set --id "$TICKET_EXT_ID" \
  --value-prop "<kern-nutzen für gekko>" \
  --effort <klein|mittel|gross> \
  --areas <normalisierter-areas-key>

# Originalzitat als Kommentar hinterlegen
bash scripts/ticket.sh add-comment \
  --id "$TICKET_EXT_ID" \
  --author "feature-intake/gekkomode" \
  --body "## GekkoMode-Rücklauf $(date +%F)

**Originalzitat:** \"<exaktes Zitat aus Interview>\"
**Kontext:** Primärgerät: <gerät>, Nutzung: <frequenz>
**Ranking-Position:** <1-5 oder 'unranked'>"
```

#### Priorisierungslogik für `--priority`

| Signal | Priorität |
|--------|-----------|
| Im Block-4-Ranking auf Platz 1–2 | `hoch` |
| Block-4-Rang 3–4 + Schmerz-Nennung | `mittel` |
| Block-4-Rang 5 oder nur Wunsch ohne Schmerz | `niedrig` |
| Konkrete Deadline in Block 5 genannt | Upgrade um eine Stufe |
| Primärgerät = Handy + Usability-Problem | Upgrade um eine Stufe |

#### Readiness-Flags für GekkoMode-Tickets

GekkoMode-Tickets starten mit partieller Readiness — setze direkt was bekannt ist:

```bash
bash scripts/ticket.sh plan-meta set --id "$TICKET_EXT_ID" \
  --readiness offene_fragen_geklaert=true
# spec_skizziert=false (muss Patrick noch verfeinern)
# abhaengigkeiten_klar=false (unbekannt aus Interview)
# aufwand_geschaetzt=false (muss geschätzt werden, es sei denn Zitat gibt Hinweis)
```

### Schritt 5 — Abschluss-Report

Nach dem Anlegen:

```
GekkoMode-Ergebnis:
  Neue Tickets: <n>
  Duplikate übersprungen: <m> (bereits als TXXXxxx vorhanden)

Neu angelegt:
  • T000xxx [hoch] <Titel> — "<Originalzitat>"
  • T000xxx [mittel] <Titel> — "<Originalzitat>"

Deadline-Flag: T000xxx erwartet bis <datum> (aus Block 5)

→ Planungsbüro öffnen? Oder direkt T000xxx zu dev-flow-plan?
```

---

## Modus A: Interaktiver Brainstorm

**Sage:** "Ich führe einen Feature-Brainstorm durch."

### Schritt 1 — Kontext laden

Lies die planning-Tickets und offene Backlog-Einträge (nicht alle open-Tickets):
```bash
bash scripts/ticket.sh list --status planning --limit 20 2>/dev/null | head -40 || true
bash scripts/ticket.sh list --status backlog  --limit 10 2>/dev/null | head -20 || true
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

> **Vor der Formular-Generierung:** Prüfe, welche Kandidaten bereits als Ticket existieren, um Duplikate zu vermeiden:
> ```bash
> kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -c \
>   "SELECT external_id, title, status FROM tickets.tickets WHERE status NOT IN ('done','archived') ORDER BY created_at DESC LIMIT 40;" 2>/dev/null
> ```
> Bereits vorhandene Einträge aus den Kandidaten-Listen entfernen oder als „(bereits geplant: TXXXxxx)" markieren.

**Brett:**
- Figuren-Animationen / Gesten
- Board-Export (PNG / PDF)
- Zuschauer-Modus (read-only)
- Board-Templates
- Mobile-Touch-Optimierung

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
- Staging-Umgebung (k3d-isoliert)
- Performance-Dashboard
- Alert-Regeln (Grafana)
- Automated Rollback bei Failed Deploy

**AI / Factory:**
- Ticket-Auto-Triage (Severity-Erkennung)
- Factory-Qualitäts-Ratchet (Scout-Output-Bewertung)
- DeepSeek Scout-Qualität verbessern (touched_files Coverage)

### Areas-Normalisierung (für `--areas`-Parameter)

Formular-Output verwendet deutsche/kapitalisierte Namen — vor `plan-meta set` auf lowercase-Keys normalisieren:

| Formular-Ausgabe | `--areas`-Wert |
|-----------------|---------------|
| `Brett` | `brett` |
| `Website / Content-Hub` | `website` |
| `Chat / Messaging` | `chat` |
| `Infra / DevEx` | `infra` |
| `AI / Factory` | `ai/factory` |
| `Keycloak / Auth` | `auth` |
| `Nextcloud / Files` | `nextcloud` |

### Übergabe nach Rücklauf

Wenn das ausgefüllte Markdown zurückkommt (egal ob von Patrick oder gekko):
1. Parse die Feature-Liste (Abschnitte Hohe/Mittlere Priorität + Freie Ideen)
2. Erstelle für jedes ausgewählte Feature ein Ticket **mit** plan-meta:

```bash
# Pro Feature aus dem Rücklauf:
TICKET_RESULT=$(bash scripts/ticket.sh create \
  --type feature \
  --brand mentolder \
  --title "<titel>" \
  --priority <kritisch|hoch|mittel|niedrig> \
  --description "<kommentar aus Formular>" \
  --status planning)

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)

# Areas-Wert aus Formular-Ausgabe normalisieren (siehe Tabelle oben)
bash scripts/ticket.sh plan-meta set --id "$TICKET_EXT_ID" \
  --value-prop "<kern-nutzen>" \
  --effort <klein|mittel|gross> \
  --areas <normalisierter-areas-key>
```

3. Schlage vor, welches Feature als erstes zu `dev-flow-plan` gehen soll (höchste Priorität → kleinster Aufwand als Tiebreaker)

---

## Übergabe an dev-flow-plan

Nach Brainstorm oder Rücklauf, wenn eines oder mehrere Features als nächstes gebaut werden sollen:

**Ein Feature:** Rufe `dev-flow-plan` direkt auf, übergib Titel + Kern-Nutzen + Priorität als Kontext.

**Mehrere Features:** Präsentiere eine sortierte Liste und lass den User wählen oder bestätige die Reihenfolge:
```
Nächste Features (sortiert: Priorität ↓, Aufwand ↑):
1. [hoch/klein]  <Titel A> — <Kern-Nutzen>
2. [hoch/mittel] <Titel B> — <Kern-Nutzen>
3. [mittel/groß] <Titel C> — <Kern-Nutzen>

→ Mit welchem soll dev-flow-plan starten?
  (Standard: Nummer 1 — bestätige oder nenne eine andere Nummer)
```

Starte **immer nur ein** `dev-flow-plan` zur Zeit — parallele Feature-Worktrees kollidieren
auf `k3d/configmap-domains.yaml` und `environments/schema.yaml` (siehe CLAUDE.md Gotcha
„Parallel plans share registry files"). Restliche Features bleiben im Planungsbüro mit
`status=planning` und warten dort auf Freigabe.
