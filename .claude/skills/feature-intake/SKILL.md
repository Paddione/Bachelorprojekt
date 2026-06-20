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

**Standard-Annahme:** Patrick füllt lieber ein **HTML-Formular** aus als inline zu tippen (siehe Memory „Grilling via HTML form"). Im Zweifel **generiere das Formular**, starte den **Session-Hub** (`bash scripts/session-hub.sh start-form`) und liefere es zusätzlich per `SendUserFile`. Die URL `https://session-intake.sessions.mentolder.de` erscheint als Karte im Mediaviewer — immer, in allen Modi.

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

**MCP-Schnellweg (read-only).** Wenn `mcp-postgres` erreichbar, lade die planning-Tickets via
`mcp__mcp-postgres__query`:
> `sql:` `SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''), array_to_string(areas,','), COALESCE(description,''), readiness::text, COALESCE(array_to_string(depends_on,','),'') FROM tickets.tickets WHERE status='planning' ORDER BY planning_rank ASC NULLS LAST, created_at DESC;`

Belege `PLANNING_ROWS` aus dem Ergebnis (leeres Ergebnis → Modus C entfällt, wie unten). **Fallback:**
der kubectl-Block. Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

_Fallback:_

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

**Datei:** `/tmp/klaerung-<DATUM>.html`

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

**Immer:** Session-Hub starten (lokaler HTTP-Server + fleet-Upload → sessions.mentolder.de + Mediaviewer-Karte):

```bash
HTML_FILE="/tmp/klaerung-$(date +%F).html"
bash scripts/session-hub.sh start-form --file "$HTML_FILE" --name "intake"
```

Das Formular ist dann öffentlich erreichbar unter `https://session-intake.sessions.mentolder.de` und erscheint als Karte im Mediaviewer-Panel. Danach **zusätzlich** per `SendUserFile` liefern. Sage: "Ausfüllen → 'Markdown kopieren' → hier einfügen. Oder direkt öffnen: https://session-intake.sessions.mentolder.de"

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
plan_ref: openspec/changes/<SPEC_SLUG>/tasks.md
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

#### 5d — Readiness-Flags aktualisieren

Setze einen Flag auf `true` nur wenn die zugehörige Frage tatsächlich beantwortet wurde:

```bash
bash scripts/ticket.sh plan-meta set \
  --id <external_id> \
  --readiness offene_fragen_geklaert=true,abhaengigkeiten_klar=true,spec_skizziert=true
```

#### 5e — Abhängigkeiten eintragen (wenn konkrete IDs genannt)

```bash
bash scripts/ticket.sh plan-meta set \
  --id <external_id> \
  --depends-on T000571,T000573
```

#### 5f — Automatischer Handoff zu dev-flow-plan

Nach vollständiger Spec-Generierung übergib direkt an dev-flow-plan — kein STOP, kein manueller Eingriff:

```bash
export TICKET_EXT_ID="<TICKET_EXT_ID>"
# dev-flow-plan erkennt TICKET_EXT_ID und überspringt Ticket-Erstellung
```

Sage: "Spec generiert ✓ — übergebe direkt an dev-flow-plan für die Implementierungsplanung."

Rufe dann `dev-flow-plan` auf.

#### 5g — Abschluss-Report

Gib folgende Zusammenfassung aus:

```
Grilling + Spec-Generierung abgeschlossen für <TICKET_EXT_ID>:

✓ Spec-Material als Kommentar hinterlegt (author: feature-intake/grilling)
✓ Auto-Spec generiert: docs/superpowers/specs/<dateiname>
✓ Spec als Ticket-Kommentar hinterlegt (author: feature-intake/spec-generator)
✓ Readiness-Flags aktualisiert: spec_skizziert=true, offene_fragen_geklaert=true, abhaengigkeiten_klar=true
✓ Handoff zu dev-flow-plan eingeleitet

[nur wenn noch Flags fehlen:]
Verbleibende offene Flags:
  🔴 abhaengigkeiten_klar — noch ausstehend
  🔴 aufwand_geschaetzt — noch ausstehend
```

Zeige welche Tickets jetzt vollständig readiness-ready sind (alle 4 Flags true).

---

## Modus D: GekkoMode — Entdeckungs-Interview

**Zweck:** Nicht aus einer vordefinierten Liste wählen, sondern *unbekannte* Schmerzen und Wünsche von gekko herauskitzeln — offener Entdeckungscharakter. Das Interview generiert Rohideen, die Claude anschließend in vollständige `planning`-Tickets überführt.

**Bekannter Kontext über gekko (nicht abfragen):**
- Nutzt die Plattform täglich
- Primärgerät: Android-Smartphone → Handy-Usability ist implizit hochpriorisiert
- Deadlines sind nebensächlich — kein Deadline-Block im Formular
- Kein DocuSeal — Verträge werden intern selbst gebaut, also kein DocuSeal-Fieldset

**Formular-Leitprinzipien:**
- Kein "Was nutzt du aktiv?"-Filter (Block-1 ist weggefallen) — alle Schmerz-Bereiche direkt zeigen
- Kein Ranking-Block — Priorität wird beim Ticket-Anlegen von Claude abgeleitet, nicht von gekko bewertet
- Kein Kontext-/Timing-Block
- Kernfokus: **Feature-Vorschläge mit Würfeln** + **Schmerz-Freitext** + **Wunschzettel**

**Sage:** "Ich erstelle ein Entdeckungs-Interview-Formular für gekko."

### Schritt 1 — Bestehende Tickets laden (Duplikatschutz)

**MCP-Schnellweg (read-only) — beide Reads.** Wenn `mcp-postgres` erreichbar, hole sie via
`mcp__mcp-postgres__query`:
> bestehende Tickets — `sql:` `SELECT external_id, title, status FROM tickets.tickets WHERE status NOT IN ('done','archived') ORDER BY created_at DESC LIMIT 60;`
> Spec-Pool — `sql:` `SELECT d.title, left(kc.text, 300), d.source_uri FROM knowledge.documents d JOIN knowledge.collections c ON c.id = d.collection_id JOIN knowledge.chunks kc ON kc.document_id = d.id AND kc.position = 0 WHERE c.source = 'specs_plans' AND d.source_uri LIKE 'file:openspec/changes/%/proposal.md' ORDER BY d.created_at DESC LIMIT 30;`

Belege `EXISTING` und `SPEC_POOL` aus den Ergebnissen. **Fallback:** die zwei kubectl-Blöcke unten.

_Fallback:_

```bash
EXISTING=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, status FROM tickets.tickets
   WHERE status NOT IN ('done','archived')
   ORDER BY created_at DESC LIMIT 60;" 2>/dev/null)
```

Halte diese Liste im Arbeitsgedächtnis — sie dient später beim Ticket-Anlegen zum Duplikatcheck.

Lade außerdem die indizierten Proposal-Dokumente als dynamischen Feature-Pool:

```bash
SPEC_POOL=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT d.title, left(kc.text, 300), d.source_uri
   FROM knowledge.documents d
   JOIN knowledge.collections c  ON c.id = d.collection_id
   JOIN knowledge.chunks kc      ON kc.document_id = d.id AND kc.position = 0
   WHERE c.source = 'specs_plans'
     AND d.source_uri LIKE 'file:openspec/changes/%/proposal.md'
   ORDER BY d.created_at DESC
   LIMIT 30;" 2>/dev/null)
```

Halte `$SPEC_POOL` im Arbeitsgedächtnis — er wird in Schritt 2 Block 1 als dritte Karten-Gruppe „Aus eigenen Specs" verwendet. Wenn `$SPEC_POOL` leer ist (keine Proposals indiziert), entfällt diese Gruppe; die hardcodierten Einträge bleiben als Fallback.

### Schritt 2 — Interview-HTML-Formular generieren

Erstelle `/tmp/gekko-<DATUM>.html` mit dem `Write`-Tool. Das Formular ist ein **eigenständiges, backend-freies HTML**, läuft via `file://`.

**Formular-Design:** Dark Theme (`#0d1117` / `#c9d1d9`), große Schrift, viel Weißraum. Überschrift: „Hey gekko — was brauchst du?" Introtext: „5 Minuten. Keine falschen Antworten. Deine Inputs landen direkt im Planungsbüro."

#### Formular-Blöcke (genau diese 3, keine anderen)

**Block 1 — Feature-Vorschläge mit Würfeln**

- Zeige **12 zufällige Features** aus einem großen Pool (~60 Einträge) als anklickbare Karten
- Jede Karte: Bereichs-Tag + Feature-Text, Klick = auswählen/abwählen
- **„🎲 Neu würfeln"-Button**: lädt 12 neue Karten aus dem Pool — bereits ausgewählte Karten bleiben erhalten und werden als Chips unterhalb angezeigt
- Auswahlzähler: „Ausgewählt: N"

Feature-Pool — Bereiche und Einträge:

| Bereich | Beispiel-Einträge |
|---------|------------------|
| Brett | Board-Export PNG/PDF, Touch-Drag Android, Figuren-Animationen, Gruppen-Lobby, Zuschauer-Modus, Board-Templates, Verbindungslinien, Figuren filtern, Undo/Redo, Board-Kommentare, Board teilen (Link), Offline-Modus |
| Website | Bild-Upload im Editor, Newsletter-Vorlagen, Referenzen-Galerie, SEO-Editor, Zeitgesteuertes Veröffentlichen, Vertrags-PDF-Preview, Kontaktformular-Admin, Mehrsprachigkeit DE/EN, Bewertungs-Modul, Content-Kalender |
| Chat | Push-Notifications Android, Emoji-Reaktionen, Thread-Antworten, Datei-Anhänge >10 MB, Gelesen-Bestätigungen, Sprachnachrichten, Nachrichten bearbeiten, DMs, @mention, Link-Vorschau, Kanal-Archiv, Videoanruf |
| Nextcloud | Auto-Backup Ordner, Gemeinsames Bearbeiten stabil, Offline Mobile, Ordner-Freigabe vereinfachen, Bilder-Sync |
| Vaultwarden | Android Autofill zuverlässiger, Import aus anderem Manager, Ordner teilen, Passwort-Stärke-Bericht |
| Login | Self-Service Passwort-Reset, Einladungs-Link, Login-Verlauf, Längere Session |
| Allgemein | Plattformweite Suche, Benachrichtigungs-Zentrale, Performance-Dashboard, Kalender-Integration, To-do-Liste, Android-Widget |
| AI | KI-Textzusammenfassung, Chat-Bot, Ticket-Auto-Triage, KI schlägt Newsletter vor |

Wenn `$SPEC_POOL` nicht leer ist, rendere in Block 1 zusätzlich eine dritte Karten-Gruppe unterhalb der hardcodierten Pool-Tabelle:

**Karten-Gruppe „Aus eigenen Specs" (dynamisch, nur wenn `$SPEC_POOL` gefüllt):**

- Überschrift: „Aus eigenen Specs" mit `(aus Knowledge-Base)` Badge
- Eine Karte pro psql-Zeile aus `$SPEC_POOL` (`title | snippet_300 | source_uri`)
- Karten-Text: `title` als Haupt-Label; erste 100 Zeichen des Snippets grau/klein darunter
- Bereichs-Tag: „Spec" (neutral)
- Gleiche Klick-/Auswahl-Logik wie hardcodierte Einträge
- Würfel-Button mischt NUR in hardcodierten Einträgen; Spec-Karten bleiben vollständig sichtbar
- `buildMarkdown()` gibt Spec-Karten mit Präfix `[Spec]` aus: `- [Spec] <title>`
- Wenn `$SPEC_POOL` leer → kein leerer Platzhalter, Gruppe wird nicht gerendert

**Block 2 — Schmerzen**

Alle Bereiche direkt anzeigen (kein Filter). Bereich **DocuSeal weglassen** — wird intern selbst gebaut.

Bereiche: Brett (2 Fragen inkl. Handy), Website / Admin (2), Chat (1), Vaultwarden (1), Nextcloud (1), Keycloak / Login (1)

**Block 3 — Wunschzettel**

Drei Freitext-Felder: „Sofort hätte ich…", „In 6 Monaten…", „Vermisse von anderen Apps…"

**Block 4 — Große Vision (Major-Feature)**

Ein Freitext-Feld mit Leitfrage: „Wenn du die Plattform komplett neu erfinden könntest — was wäre anders?"

Darunter eine Checkbox: „Ich bin offen, dass dieses Feature in mehrere unabhängige Teile zerlegt und parallel entwickelt wird."

Dieser Block identifiziert Major-Features die via `dev-flow-batch` zerlegt werden können.

**[FOOTER]** „Markdown kopieren"-Button + Fallback-Textarea

#### Technische Anforderungen

- Kein Block-1-Filter, kein Ranking, kein Kontext-Block
- Feature-Karten: `display:grid`, anklickbar, selected-State via CSS-Klasse
- Würfel-Button: Fisher-Yates shuffle auf verbleibenden Pool-Einträgen
- `buildMarkdown()` erzeugt das Ausgabeformat (siehe unten)
- `navigator.clipboard` mit `document.execCommand('copy')` Fallback-Textarea

### Schritt 3 — Formular liefern

**Immer:** Session-Hub starten (lokaler HTTP-Server + fleet-Upload → sessions.mentolder.de + Mediaviewer-Karte):

```bash
bash scripts/session-hub.sh start-form --file "/tmp/gekko-<DATUM>.html" --name "gekko"
```

Das Formular ist dann öffentlich erreichbar unter `https://session-gekko.sessions.mentolder.de` und erscheint als Karte im Mediaviewer-Panel. Danach **zusätzlich** per `SendUserFile` liefern. Sage Patrick: „Schick den Link an gekko: https://session-gekko.sessions.mentolder.de — ausfüllen → ‚Markdown kopieren' → dir zurückschicken → du gibst es mir hier."

### Schritt 4 — Rücklauf verarbeiten

Wenn das ausgefüllte Markdown zurückkommt:

#### Markdown-Ausgabeformat (was der Button erzeugt)

```markdown
## GekkoMode Interview: <Datum>
Eingereicht von: gekko

### Block 1 — Ausgewählte Feature-Vorschläge
- [Brett] Touch-Drag & Drop auf Android verbessern
- [Chat] Push-Notifications auf Android (PWA)
- [Website] Bild-Upload direkt im HTML-Editor

### Block 2 — Schmerzen

**Brett:**
- Nervt: "Figuren lassen sich nicht gruppieren"
- Handy-Problem: "Buttons zu klein, kein Touch-Drag"

**Website / Admin:**
- Umständlich: "Newsletter-Bilder muss ich extern hochladen"
- Zeigen will: "Referenzen-Galerie fehlt"

**Chat:**
- Greift auf anderes Tool zurück weil: "Datei-Anhänge > 5 MB"

**Vaultwarden:**
- Bremst Nutzung: "Android Autofill klappt nicht immer"

**Nextcloud:**
- Manuell statt automatisch: "Ordner-Struktur händisch anlegen"

**Keycloak / Login:**
- Probleme ignoriert: "Token läuft nach 30 min ab, nervt"

### Block 3 — Wunschzettel
- Sofort: "Brett auf Handy benutzbar machen"
- In 6 Monaten: "Newsletter komplett in der Plattform"
- Vermisse: "Notion-ähnliche Datenbanken"

### Block 4 — Große Vision
- Vision: "Eine App für alles — Brett, Chat, Dateien, Verträge in einem Flow"
- Parallel-Entwicklung: ✓ (Checkbox gesetzt)
```

#### Tickets anlegen

Pro Schmerz-Nennung + Wunsch aus Block 3 (der noch kein Ticket hat):

```bash
# 1. Duplikatcheck gegen $EXISTING — nur anlegen wenn kein ähnlicher Titel

# 2. Semantischer Duplikatcheck via pgvector (neu)
SEARCH_RESULT=$(task knowledge:search ENV=mentolder \
  QUERY="<destillierter Titel>" \
  SOURCE=specs_plans \
  LIMIT=3 \
  THRESHOLD=0.65 2>/dev/null || echo '{"results":[]}')

TOP_SCORE=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['score'] if r else 0)" 2>/dev/null || echo 0)
TOP_TITLE=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['title'] if r else '')" 2>/dev/null || echo "")
TOP_URI=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['source_uri'] if r else '')" 2>/dev/null || echo "")
HAS_ERROR=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('error') else 'no')" 2>/dev/null || echo "yes")

if [ "$HAS_ERROR" = "yes" ]; then
  echo "⚠️  Semantischer Check übersprungen (VOYAGE_API_KEY fehlt oder Fehler) — Ticket wird trotzdem angelegt."
elif python3 -c "exit(0 if float('$TOP_SCORE') >= 0.80 else 1)" 2>/dev/null; then
  echo "🛑 Duplikat wahrscheinlich — Spec \"${TOP_TITLE}\" ähnlich (Score: ${TOP_SCORE})."
  echo "   Quelle: ${TOP_URI}"
  echo "   → Ticket NICHT angelegt. Bestehende Spec prüfen oder verknüpfen."
  # KEIN ticket.sh create — zur nächsten Feature-Nennung
elif python3 -c "exit(0 if float('$TOP_SCORE') >= 0.65 else 1)" 2>/dev/null; then
  echo "⚠️  Ähnliche Spec: \"${TOP_TITLE}\" (Score: ${TOP_SCORE}) — Ticket trotzdem anlegen + Hinweis im Kommentar."
fi

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
**Ranking-Position:** <1-5 oder 'unranked'>

$([ "$(python3 -c "exit(0 if float('$TOP_SCORE') >= 0.65 else 1)" 2>/dev/null && echo yes || echo no)" = "yes" ] && echo "**Ähnliche Spec:** \"${TOP_TITLE}\" (Score: ${TOP_SCORE})
**Spec-Quelle:** ${TOP_URI}")"
```

> **Hinweis:** Wenn `TOP_SCORE >= 0.65`, füge in den `add-comment`-Body folgende Zeile ein: `**Ähnliche Spec:** "<TOP_TITLE>" (Score: <TOP_SCORE>)` und `**Spec-Quelle:** <TOP_URI>`.

#### Major-Feature aus Block 4

Wenn Block 4 "Große Vision" ausgefüllt ist und die "Parallel-Entwicklung"-Checkbox gesetzt:

```bash
# Major-Feature-Ticket mit speziellem Kommentar
TICKET_RESULT=$(bash scripts/ticket.sh create \
  --type feature \
  --brand mentolder \
  --title "<destillierte Vision>" \
  --priority hoch \
  --description "<Vision-Text aus Block 4>" \
  --status planning)

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)

bash scripts/ticket.sh plan-meta set --id "$TICKET_EXT_ID" \
  --value-prop "<Hauptnutzen der Vision>" \
  --effort gross \
  --areas <bereich>

bash scripts/ticket.sh add-comment \
  --id "$TICKET_EXT_ID" \
  --author "feature-intake/gekkomode" \
  --body "## Major-Feature aus GekkoMode $(date +%F)

**Vision:** \"<exakte Vision aus Block 4>\"
**Parallel-Entwicklung:** ✓ (vom User bestätigt)
**Nächster Schritt:** via dev-flow-batch in Sub-Features zerlegen"
```

Nach dem Anlegen aller Tickets: Schlage vor, das Major-Feature via `dev-flow-batch` zu zerlegen.

#### Priorisierungslogik für `--priority`

Kein Ranking-Block — Claude leitet Priorität aus Kombination folgender Signale ab:

| Signal | Priorität |
|--------|-----------|
| Feature aus Block 1 ausgewählt **und** passendes Schmerz-Zitat in Block 2 | `hoch` |
| Feature aus Block 1 ausgewählt, aber kein Schmerz-Zitat | `mittel` |
| Schmerz-Zitat in Block 2 ohne passende Block-1-Auswahl | `mittel` |
| Nur Wunschzettel-Nennung (Block 3), kein Schmerz | `niedrig` |
| Feature betrifft Handy / Android-Usability | Upgrade um eine Stufe (bekannter Kontext) |

#### Readiness-Flags für GekkoMode-Tickets

GekkoMode-Tickets starten mit partieller Readiness — setze direkt was bekannt ist:

```bash
bash scripts/ticket.sh plan-meta set --id "$TICKET_EXT_ID" \
  --readiness offene_fragen_geklaert=true
# spec_skizziert=false (muss Patrick noch verfeinern)
# abhaengigkeiten_klar=false (unbekannt aus Interview)
# aufwand_geschaetzt=false (muss geschätzt werden, es sei denn Zitat gibt Hinweis)
```

> **Zusätzlich strukturiert ablegen:** Neben dem Klärungs-Kommentar die Antworten mit
> `scripts/ticket.sh grill --id <ext-id> …` ans Ticket senden (akkumulierend, panel-fähig).
> Siehe `.claude/skills/references/grilling-to-ticket.md`.

### Schritt 5 — Abschluss-Report

Nach dem Anlegen:

```
GekkoMode-Ergebnis:
  Neue Tickets: <n>
  Duplikate übersprungen: <m> (bereits als TXXXxxx vorhanden)

Neu angelegt:
  • T000xxx [hoch] <Titel> — "<Originalzitat>"
  • T000xxx [mittel] <Titel> — "<Originalzitat>"

🏗️ Major-Feature erkannt:
  • T000xxx [hoch/gross] <Vision-Titel>
    → via dev-flow-batch in Sub-Features zerlegen?

Deadline-Flag: T000xxx erwartet bis <datum> (aus Block 5)

→ Planungsbüro öffnen? Oder direkt T000xxx zu dev-flow-plan?
→ Major-Feature via dev-flow-batch starten?
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

### Schritt 1.5 — Major-Feature-Frage

Bevor du in die Ideation gehst, frage:

```
Möchtest du auch Major-Features in Betracht ziehen? Das sind große Features
die in 2-6 unabhängige Sub-Features zerlegt und parallel entwickelt werden
können (z.B. "Komplette Plattform-Überholung", "Neues Abrechnungssystem",
"Mobile-First Redesign"). Die Sub-Features werden via dev-flow-batch parallel
geplant und können unabhängig voneinander deployed werden.

→ Ja, zeig mir Major-Feature-Ideen
→ Nein, nur einzelne Features
```

Wenn **Ja**: Präsentiere nach den normalen Clustern einen zusätzlichen Block:

```
🏗️ Major-Feature-Kandidaten (zerlegbar in 2-6 Sub-Features):

• Plattform-Modernisierung — Neues UI-Framework, API v2, Mobile-First
  → Sub-Features: UI-Redesign, API-Migration, Responsive-Layout, PWA-Shell

• Billing-Revolution — Abo-Modelle, Usage-Based, Invoice-Automation
  → Sub-Features: Abo-Engine, Usage-Tracking, Invoice-Gen, Payment-Integration

• Collaboration-Suite — Echtzeit-Edit, Comments, Presence, Versioning
  → Sub-Features: CRDT-Editor, Comment-System, Presence-Indicator, Version-History

→ Interessiert dich ein Major-Feature? Welches?
```

Nutze diese Major-Feature-Vorlagen als Inspiration, aber passe sie an den Projekt-Kontext an. Wenn der User ein eigenes Major-Feature beschreibt, zerlege es in Sub-Features.

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
cp .claude/skills/feature-intake/pm-form-template.html /tmp/intake-$(date +%F).html
```

Dann **nur den `FEATURES`-Block anpassen** (JS-Objekt im `<script>`): die Kandidaten-Listen aktualisieren, falls neue Projektbereiche/Tickets relevant sind (siehe „Vorausgefüllte Feature-Kandidaten" unten). Layout/Copy-Logik nicht neu erfinden.

> Nur falls das Template fehlt oder grundlegend anders sein soll, baue von Grund auf neu — dann gelten die „Formular-Anforderungen" und „Formular-Struktur" unten als Spezifikation.

### Schritt 2 — An den Empfänger liefern

**Immer zuerst:** Session-Hub starten (lokaler HTTP-Server + fleet-Upload → sessions.mentolder.de + Mediaviewer-Karte):

```bash
HTML_FILE="/tmp/intake-$(date +%F).html"
bash scripts/session-hub.sh start-form --file "$HTML_FILE" --name "intake"
```

Das Formular erscheint als Karte im Mediaviewer-Panel unter `https://session-intake.sessions.mentolder.de`. Danach **zusätzlich** per `SendUserFile` liefern.

- **Empfänger Patrick (Standard):** Sag ihm: „Ausfüllen → ‚Markdown kopieren' → hier einfügen. Oder direkt im Browser: https://session-intake.sessions.mentolder.de"
- **Empfänger gekko:** Sage Patrick: „Schick den Link an gekko: https://session-intake.sessions.mentolder.de — ausfüllen → ‚Markdown kopieren' → dir zurückschicken."

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

[ABSCHNITT: Major-Feature]
  Checkbox: "Ich habe eine große Vision die in mehrere Teile zerlegt werden kann"
  Textarea: "Beschreibe dein Major-Feature (2-3 Sätze)"
  Hinweis: "Z.B. 'Komplettes Redesign der Plattform' oder 'Neues Abrechnungssystem'"
  → Wenn Checkbox gesetzt: wird via dev-flow-batch in Sub-Features zerlegt

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

### Major-Feature
- [x] **Major-Feature gewünscht**
- Beschreibung: "Komplette Plattform-Modernisierung — neues UI, API v2, Mobile-First"
- Parallel-Entwicklung: ✓

### Freie Ideen
> "Export-Funktion für Brett-Sessions als PDF"
```

### Vorausgefüllte Feature-Kandidaten je Bereich

> **MCP-Schnellweg (read-only):** `mcp__mcp-postgres__query` mit
> `sql:` `SELECT external_id, title, status FROM tickets.tickets WHERE status NOT IN ('done','archived') ORDER BY created_at DESC LIMIT 40;`
> — sonst der kubectl-Befehl unten (Fallback).
>
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
# Semantischer Duplikatcheck via pgvector (wie Modus D)
SEARCH_RESULT=$(task knowledge:search ENV=mentolder \
  QUERY="<titel>" SOURCE=specs_plans LIMIT=3 THRESHOLD=0.65 2>/dev/null \
  || echo '{"results":[]}')
TOP_SCORE=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['score'] if r else 0)" 2>/dev/null || echo 0)
TOP_TITLE=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['title'] if r else '')" 2>/dev/null || echo "")
HAS_ERROR=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('error') else 'no')" 2>/dev/null || echo "yes")

# Score >= 0.80 → KEIN ticket.sh create, nächstes Feature
# Score 0.65–0.80 → Advisory + Ticket anlegen (Hinweis im Kommentar)
# Fehler/fehlender Key → Advisory + Ticket anlegen

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

3. **Major-Feature erkennen:** Wenn der Abschnitt "Major-Feature" vorhanden und die Checkbox gesetzt ist:
   - Erstelle ein Ticket mit `--effort gross` und `--priority hoch`
   - Setze im Kommentar: `major_feature: true`
   - Schlage nach der normalen Feature-Liste vor: `→ Major-Feature via dev-flow-batch zerlegen?`

4. Schlage vor, welches Feature als erstes zu `dev-flow-plan` gehen soll (höchste Priorität → kleinster Aufwand als Tiebreaker)

---

## Übergabe an dev-flow-plan / dev-flow-batch

Nach Brainstorm oder Rücklauf, wenn eines oder mehrere Features als nächstes gebaut werden sollen:

**Ein Feature:** Rufe `dev-flow-plan` direkt auf und übergib die bestehende Ticket-ID, damit kein Duplikat erstellt wird:

```bash
# TICKET_EXT_ID aus dem feature-intake Schritt übernehmen
export TICKET_EXT_ID="<external_id>"

# dev-flow-plan aufrufen — es erkennt die Variable und wiederverwendet das Ticket
# (dev-flow-plan prüft: if [[ -z "${TICKET_EXT_ID:-}" ]]; then ... create ... fi)
```

**Mehrere Features:** Präsentiere eine sortierte Liste und lass den User wählen oder bestätige die Reihenfolge:
```
Nächste Features (sortiert: Priorität ↓, Aufwand ↑):
1. [hoch/klein]  T000xxx <Titel A> — <Kern-Nutzen>
2. [hoch/mittel] T000yyy <Titel B> — <Kern-Nutzen>
3. [mittel/groß] T000zzz <Titel C> — <Kern-Nutzen>

→ Mit welchem soll dev-flow-plan starten?
  (Standard: Nummer 1 — bestätige oder nenne eine andere Nummer)
```

Starte **immer nur ein** `dev-flow-plan` zur Zeit — parallele Feature-Worktrees kollidieren
auf `k3d/configmap-domains.yaml` und `environments/schema.yaml` (siehe CLAUDE.md Gotcha
„Parallel plans share registry files"). Restliche Features bleiben im Planungsbüro mit
`status=planning` und warten dort auf Freigabe.

### Major-Feature → dev-flow-batch

Wenn ein **Major-Feature** ausgewählt wurde (aus Schritt 1.5 oder Block 4 GekkoMode):

```
🏗️ Major-Feature erkannt: <Titel>

Dieses Feature wird in 2-6 unabhängige Sub-Features zerlegt und parallel geplant.
Die Sub-Features können unabhängig voneinander deployed werden.

→ dev-flow-batch starten? (zerlegt das Feature und plant alle Sub-Features parallel)
```

Wenn der User bestätigt, rufe `dev-flow-batch` auf mit dem Major-Feature als Argument:

```
dev-flow-batch "<Major-Feature Beschreibung>"
```

Der Batch-Skill:
1. Zerlegt das Feature in ≤6 Sub-Features (Decompose-Subagent)
2. Erstellt für jedes Sub-Feature einen eigenen Branch + Spec + Plan (parallel)
3. Alle fertigen Pläne landen in `status=plan_staged` in der Kommissionierung
4. Factory kann die Sub-Features parallel implementieren

**Größenordnung:** Ein Major-Feature kann 2-6 Wochen Arbeit umfassen, verteilt auf
parallele Workstreams. Beispiel: "Plattform-Modernisierung" = 4 Sub-Features × ~1 Woche
= 1 Woche real (bei voller Parallelität).
