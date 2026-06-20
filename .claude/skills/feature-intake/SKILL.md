---
name: feature-intake
description: Use when the user wants to collect or select features via form before planning, OR when the user wants to clarify open questions on existing Planungsbüro tickets. Triggers on: "was könnten wir als nächstes bauen", "schick gekko einen Fragebogen", "feature-ideen sammeln", "klär die offenen Fragen im Planungsbüro", "planungsbüro tickets klären", "plan-ready machen", "offene Fragen", or any pre-planning feature-discovery or ticket-clarification session.
---

# feature-intake — PM-Fragebogen & Planungsbüro-Klärung

## Überblick

Dieser Skill ist dem `dev-flow-plan` **vorgelagert**: er sammelt Feature-Ideen und überführt sie in plan-ready Tickets. Drei Modi:

| Modus | Wann | Ergebnis |
|-------|------|---------|
| **Planungsbüro-Klärung** | Bestehende `planning`-Tickets haben offene Fragen / fehlende Readiness-Flags | HTML-Klärungsformular pro Ticket → Antworten ins Ticket schreiben |
| **Brainstorm** | User will jetzt live mitreden / frei ideieren | Strukturierte Feature-Liste → direkt zu `dev-flow-plan` |
| **HTML-Formular** | Auswahl + Priorisierung neuer Ideen per Klick — **für Patrick oder gekko** | HTML-Formular → ausgefülltes Markdown → `dev-flow-plan` |

**Standard-Annahme:** Patrick füllt lieber ein **HTML-Formular** aus als inline zu tippen (siehe Memory „Grilling via HTML form"). Im Zweifel **generiere das Formular**, starte den **Session-Hub** (`bash scripts/session-hub.sh start-form`) und liefere es zusätzlich per `SendUserFile`. Die URL `https://session-intake.sessions.mentolder.de` erscheint als Karte im Mediaviewer — immer, in allen Modi.

---

## Modus-Wahl

```
User spricht von "Planungsbüro", "klären", "offene Fragen", "plan-ready",
"Readiness", oder will bestehende planning-Tickets vorbereiten?
  → Planungsbüro-Klärung (Modus C) — PRIORITÄT vor B und A

Sonst (Features auswählen + priorisieren, bekannte Ideen, wenig tippen,
ODER "schick gekko einen Fragebogen" / "PM soll entscheiden" / "mach mir ein Formular"):
  → HTML-Formular-Modus (Modus B) — Empfänger = Patrick oder gekko
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

### Schritt 1.5 — Spec-Kontext pro Ticket laden (lazy, nur wenn nötig)

Für Tickets mit `offene_fragen_geklaert: false` lade die SSOT-Spec des primären `areas`-Feldes — **nicht alle 35 Specs**, nur die passende(n). Damit basieren die Klärungsfragen in Schritt 2 auf dem echten Spec-Stand statt auf generischen Blanko-Fragen.

**Areas → Spec-Slug Lookup** lebt in [references/spec-slug-lookup.md](references/spec-slug-lookup.md) (35 Zeilen — aus dem SKILL.md extrahiert).

**Abruf-Befehl** (gibt vorformatierten Markdown-Block aus):

```bash
# areas-Wert des Tickets → Slug auflösen → Spec laden
# Beispiel: areas="website,chat" → SPEC_SLUGS="website-core chat-inbox"
SPEC_SLUGS="<aufgelöste Slugs aus Lookup-Tabelle>"

SPEC_CONTEXT=$(bash scripts/openspec-context.sh --specs $SPEC_SLUGS 2>/dev/null || echo "")
```

**Regeln:**
- Nur laden wenn `offene_fragen_geklaert: false` — sonst nicht nötig
- Bei mehreren `areas`: nur die **ersten 1-2 Slugs** laden (Kontextbudget schonen)
- Leerer Output (kein Match) → statische Fragen aus Schritt 2 als Fallback
- `$SPEC_CONTEXT` enthält die Requirements & Scenarios der Spec → in Schritt 2 nutzen, um ticket-spezifische Fragen abzuleiten: "Welche Scenarios sind in diesem Ticket noch nicht abgedeckt?"

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

> **Wenn `$SPEC_CONTEXT` befüllt ist (aus Schritt 1.5):** Leite die Fragen primär aus den Scenarios der Spec ab — "Welches Scenario fehlt noch für dieses Ticket?". Die statischen Fragen unten sind der **Fallback** wenn kein Spec-Kontext geladen wurde.

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
# Kein --ticket-id hier: Klärungsformular enthält mehrere Tickets (kein single ticket_id)
bash scripts/session-hub.sh start-form --file "$HTML_FILE" --name "intake"
# Zum Aktualisieren: bash scripts/session-hub.sh regen --name intake
```

Das Formular ist dann öffentlich erreichbar unter `https://session-intake.sessions.mentolder.de` und erscheint als Karte im Mediaviewer-Panel. Das Formular hat einen **„Im Ticket speichern"-Button** — dieser erstellt ein neues Ticket wenn kein `--ticket-id` gesetzt war. Danach **zusätzlich** per `SendUserFile` liefern. Sage: "Ausfüllen → 'Im Ticket speichern' (spart das Kopieren) oder 'Markdown kopieren' → hier einfügen. Oder direkt: https://session-intake.sessions.mentolder.de"

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

**Kandidaten-Listen + Areas-Normalisierung** leben in [references/feature-candidates.md](references/feature-candidates.md) (5 Bereiche × 3-5 Items + 7-Zeilen-Normalisierungstabelle — aus dem SKILL.md extrahiert).

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

Nach Rücklauf, wenn eines oder mehrere Features als nächstes gebaut werden sollen:

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

Wenn ein **Major-Feature** erkannt wurde (Major-Feature-Sektion in Modus B):

```
🏗️ Major-Feature erkannt: <Titel>

Dieses Feature wird in 2-6 unabhängige Sub-Features zerlegt und parallel geplant.
Die Sub-Features können unabhängig voneinander deployed werden.

→ dev-flow-batch starten? (zerlegt das Feature und plant alle Sub-Features parallel)
```

Wenn der User bestätigt: `dev-flow-batch "<Major-Feature Beschreibung>"` aufrufen.
