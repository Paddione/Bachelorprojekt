---
title: "AI: Ticket-Auto-Triage (Severity-Erkennung)"
ticket_id: T000992
domains: [ops, website, db]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: AI-Ticket-Auto-Triage (T000992)

- [x] Task 1: scripts/triage/few-shot-examples.json — 20 kalibrierte Trainings-Tickets
- [x] Task 2: scripts/triage/heuristik.mjs — Regelwerk + Keyword-Matching + Confidence-Score
- [x] Task 3: Triage-Hook in scripts/vda/ticket/create.sh integrieren (Post-Create-Trigger)
- [x] Task 4: website/src/lib/tickets/triage-display.ts + Unit-Tests (Vorschlag-Comment-Rendering)
- [x] Task 5: Verifikation — task test:changed + task freshness:regenerate + task freshness:check

---

# AI: Ticket-Auto-Triage — Implementation Plan

Heuristik-basierte Severity-Erkennung beim Ticket-Create. Neues Ticket →
Regelwerk-Scan (Keywords + Bereichsgewichtung + Few-Shot-Kalibrierung) →
bei >90% Confidence Auto-Apply, bei 50–90% Vorschlag-Comment, bei <50% keine
Aktion. Latenz-SLA <30s pro Ticket.

---

## File Structure

```
scripts/triage/
  heuristik.mjs                ← NEU: Regelwerk + Keyword-Matching + Confidence-Score
  few-shot-examples.json       ← NEU: 20 vergangene Trainings-Tickets (statisch)
scripts/vda/ticket/
  create.sh                    ← ERWEITERT: Triage-Hook nach Create aufrufen
website/src/lib/tickets/
  triage-display.ts            ← NEU: Vorschlag-Comment + Bestätigungs-Button-Rendering
  triage-display.test.ts       ← NEU: Unit-Tests für Vorschlag-Comment-Rendering
```

---

## Aufgabe 1: `scripts/triage/few-shot-examples.json` erstellen

**Ziel:** Statischer Few-Shot-Datensatz aus 20 vergangenen, von Patrick manuell triagierten
Tickets. Liefert die Kalibrierungs-Baseline für das Heuristik-Regelwerk.

**Dateien:**

- `scripts/triage/few-shot-examples.json` — neu erstellen

**Implementierung:**

Das JSON enthält 20 Einträge mit Feldern: `title`, `description` (gekürzt auf 300 Zeichen),
`areas` (z. B. `infra`, `chat`, `docs`), `manual_severity` (Patricks Entscheidung:
`critical`/`high`/`medium`/`low`). Die Einträge werden aus der Postgres-Datenbank
(`tickets.ticket`-Tabelle, gefiltert auf `severity IS NOT NULL`, sortiert nach
`created_at DESC`, `LIMIT 20`) extrahiert und als statische Datei committet.

```json
[
  {
    "title": "Prod-Down nach Deploy",
    "description": "Produktivumgebung nach Deploy nicht erreichbar",
    "areas": "infra",
    "manual_severity": "critical"
  }
]
```

Die Datei wird per psql-Export generiert und als statisches Artefakt eingecheckt — kein
auto-update zur Laufzeit in v1 (Constraint aus Spec).

**Akzeptanzkriterium:**

- Datei enthält genau 20 Einträge
- Jeder Eintrag hat alle vier Felder (`title`, `description`, `areas`, `manual_severity`)
- `jq '. | length' scripts/triage/few-shot-examples.json` liefert `20`
- JSON ist valid: `jq empty scripts/triage/few-shot-examples.json` exit 0

---

## Aufgabe 2: `scripts/triage/heuristik.mjs` erstellen

**Ziel:** Heuristik-Regelwerk, das Titel, Beschreibung und Bereich (`areas`) eines Tickets
analysiert und `{ severity, confidence, reasoning, auto_apply }` zurückgibt. Kein
LLM-Aufruf — nur Regeln + Keyword-Matching, kalibriert gegen `few-shot-examples.json`.

**Dateien:**

- `scripts/triage/heuristik.mjs` — neu erstellen

**Implementierung:**

ES-Module-Script (analog `scripts/knowledge/search-similar.mjs`). Liest Ticket-Input
über CLI-Args oder Stdin-JSON, gibt Triage-Ergebnis als JSON auf stdout aus.

```javascript
#!/usr/bin/env node
/**
 * heuristik.mjs — Heuristic severity triage for new tickets.
 *
 * CLI args:  --title <text> --description <t> --areas <key>
 * Stdin:     JSON { title, description, areas }
 * Output:    JSON { severity, confidence, reasoning, auto_apply }
 * Exit:      0 ok, 1 input invalid, 2 heuristik threw (caller: no-triage)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AREA_WEIGHTS = { infra: 1.0, chat: 0.9, ops: 0.8, db: 0.8, ai: 0.7,
                       factory: 0.6, website: 0.5, docs: 0.3 };
const CRITICAL_KEYWORDS = ['kritisch', 'prod-down', 'datenverlust', 'ausfall',
                           'notfall', 'severe', 'down', 'offline'];
const HIGH_KEYWORDS     = ['fehler', 'bug', 'kaputt', 'broken', 'failing'];
const MEDIUM_KEYWORDS   = ['verbesserung', 'refactor', 'optimierung'];

function loadFewShot() {
  try {
    return JSON.parse(readFileSync(join(__dirname, 'few-shot-examples.json'), 'utf8'));
  } catch {
    return [];
  }
}

function scoreText(text) {
  const lc = (text || '').toLowerCase();
  return {
    criticalHits: CRITICAL_KEYWORDS.filter(k => lc.includes(k)).length,
    highHits:     HIGH_KEYWORDS.filter(k => lc.includes(k)).length,
    mediumHits:   MEDIUM_KEYWORDS.filter(k => lc.includes(k)).length,
  };
}

function triage({ title, description, areas }) {
  if (!title) throw new Error('title is required');
  const text = `${title} ${description || ''}`;
  const { criticalHits, highHits, mediumHits } = scoreText(text);
  const areaWeight = AREA_WEIGHTS[areas] ?? 0.5;
  let score = 0;
  if (criticalHits > 0)      score = 0.95;
  else if (highHits > 0)     score = 0.75;
  else if (mediumHits > 0)   score = 0.55;
  score *= areaWeight;
  const fewShot = loadFewShot();
  if (fewShot.length >= 20 && score > 0 && score < 0.4) score = 0.4;
  let severity = 'low';
  if (score >= 0.85)      severity = 'critical';
  else if (score >= 0.65) severity = 'high';
  else if (score >= 0.40) severity = 'medium';
  const confidence = Math.min(1, Math.max(0, score));
  return {
    severity,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `criticalHits=${criticalHits} highHits=${highHits} mediumHits=${mediumHits} areaWeight=${areaWeight}`,
    auto_apply: confidence > 0.90,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      out[args[i].slice(2)] = args[++i];
    }
  }
  return out;
}

async function main() {
  const cli = parseArgs();
  let input;
  if (Object.keys(cli).length > 0) {
    input = { title: cli.title, description: cli.description, areas: cli.areas };
  } else {
    const stdin = readFileSync(0, 'utf8');
    input = JSON.parse(stdin || '{}');
  }
  if (!input.title) {
    process.stderr.write('ERROR: title is required\n');
    process.exit(1);
  }
  const result = triage(input);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ severity: null, confidence: 0,
    reasoning: `heuristik threw: ${err.message}`, auto_apply: false }) + '\n');
  process.exit(2);
});
```

**Fehlerbehandlung:** `triage()` wirft bei fehlendem Titel — der äußere `catch` fängt das
und gibt `{severity:null, auto_apply:false}` zurück (exit 2), damit `create.sh` das
Ticket trotzdem anlegt.

**Akzeptanzkriterium:**

- `node --check scripts/triage/heuristik.mjs` grün
- `node scripts/triage/heuristik.mjs --title "Prod-Down nach Deploy" --areas infra`
  liefert `severity:"critical"` und `auto_apply:true`
- `node scripts/triage/heuristik.mjs --title "Tippfehler in Doku" --areas docs`
  liefert `severity:"low"` und `auto_apply:false`

---

## Aufgabe 3: Triage-Hook in `scripts/vda/ticket/create.sh` integrieren

**Ziel:** Nach erfolgreichem Ticket-Create wird `heuristik.mjs` aufgerufen. Bei
`auto_apply:true` wird die Severity direkt gesetzt. Bei `confidence >= 0.50` und
`auto_apply:false` wird ein Vorschlag-Comment hinterlegt. Bei `confidence < 0.50` passiert
nichts. Heuristik-Fehler (exit 2) werden geloggt, aber das Ticket wird normal angelegt.

**Dateien:**

- `scripts/vda/ticket/create.sh` — erweitern

**Implementierung:**

Am Ende der `create`-Funktion (nach erfolgreichem DB-Insert), vor dem `echo` des
Ticket-IDs-Abschlusses, diesen Block einfügen:

```bash
# === Triage-Hook (Auto-Triage via Heuristik) ===
TRIAGE_RESULT=""
if [ -f "scripts/triage/heuristik.mjs" ]; then
  TRIAGE_RESULT=$(node scripts/triage/heuristik.mjs \
    --title "$TITLE" \
    --description "$DESCRIPTION" \
    --areas "$AREAS" 2>/tmp/triage-error.log) || TRIAGE_RESULT=""
fi

if [ -n "$TRIAGE_RESULT" ]; then
  AUTO_APPLY=$(echo "$TRIAGE_RESULT" | jq -r '.auto_apply' 2>/dev/null || echo "false")
  CONFIDENCE=$(echo "$TRIAGE_RESULT" | jq -r '.confidence' 2>/dev/null || echo "0")
  SUGGESTED_SEVERITY=$(echo "$TRIAGE_RESULT" | jq -r '.severity' 2>/dev/null || echo "")

  if [ "$AUTO_APPLY" = "true" ]; then
    # >90% Confidence → Severity direkt setzen
    bash scripts/vda/ticket/update.sh --id "$TICKET_ID" --severity "$SUGGESTED_SEVERITY" 2>/dev/null || true
  elif (( $(echo "$CONFIDENCE >= 0.50" | bc -l 2>/dev/null || echo 0) )); then
    # 50–90% → Vorschlag-Comment hinterlegen
    PCT=$(python3 -c "print(f'{float('$CONFIDENCE')*100:.0f}')" 2>/dev/null || echo "$CONFIDENCE")
    bash scripts/vda/ticket/add-comment.sh \
      --id "$TICKET_ID" \
      --author "auto-triage" \
      --body "## Vorgeschlagene Severity: ${SUGGESTED_SEVERITY} (Confidence: ${PCT}%)" 2>/dev/null || true
  fi
  # <50% → keine Aktion
fi
```

Der Hook läuft synchron, aber Heuristik-Fehler fallen nicht auf den Ticket-Create zurück
(`|| true`, Error-Log nach `/tmp/triage-error.log`).

**Akzeptanzkriterium:**

- Ticket mit Titel „Prod-Down nach Deploy" + `areas=infra`: Severity wird nach Create
  gesetzt (auto-apply)
- Ticket mit Titel „Tippfehler in Doku" + `areas=docs`: kein Comment, keine Severity-Änderung
- Heuristik-Script wirft Exception: Ticket wird trotzdem angelegt, `/tmp/triage-error.log`
  enthält die Fehlermeldung

---

## Aufgabe 4: `website/src/lib/tickets/triage-display.ts` + Unit-Tests erstellen

**Ziel:** Frontend-Helper, der den Vorschlag-Comment rendert und den
Bestätigungs-Button-Handler bereitstellt. Patrick klickt „Bestätigen" → Severity wird
per Server-Action gesetzt, der Comment wird als resolved markiert.

**Dateien:**

- `website/src/lib/tickets/triage-display.ts` — neu erstellen
- `website/src/lib/tickets/triage-display.test.ts` — neu erstellen (Unit-Tests, vitest)

**Implementierung:**

`triage-display.ts` exportiert drei reine Funktionen (kein React-Import, bleibt
Framework-agnostisch wie die anderen `tickets/*.ts`-Helpers):

```typescript
export interface TriageSuggestion {
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  reasoning: string;
  auto_apply: boolean;
  comment_id: string;
}

export function parseTriageComment(body: string): TriageSuggestion | null {
  const match = body.match(/Vorgeschlagene Severity:\s*(critical|high|medium|low)\s*\(Confidence:\s*(\d+)%\)/i);
  if (!match) return null;
  const severity = match[1].toLowerCase() as TriageSuggestion['severity'];
  const confidence = parseInt(match[2], 10) / 100;
  return { severity, confidence, reasoning: '', auto_apply: false, comment_id: '' };
}

export function renderTriageSuggestionHTML(suggestion: TriageSuggestion): string {
  const pct = Math.round(suggestion.confidence * 100);
  return `<div class="triage-suggestion" data-severity="${suggestion.severity}">` +
    `<p>Vorgeschlagene Severity: <strong>${suggestion.severity}</strong> (Confidence: ${pct}%)</p>` +
    `<button type="button" class="triage-confirm-btn" data-severity="${suggestion.severity}">Bestätigen</button>` +
    `</div>`;
}

export function buildConfirmActionPayload(suggestion: TriageSuggestion, ticketId: string) {
  return {
    ticketId,
    severity: suggestion.severity,
    resolveCommentId: suggestion.comment_id,
  };
}
```

Unit-Tests (`triage-display.test.ts`) decken alle drei Funktionen ab:

- `parseTriageComment`: gültiger Body → `TriageSuggestion`; ungültiger Body → `null`;
  verschiedene Severity-Werte
- `renderTriageSuggestionHTML`: HTML enthält `data-severity`-Attribut, Confidence-Prozentsatz
  und Button
- `buildConfirmActionPayload`: Payload enthält `ticketId`, `severity`, `resolveCommentId`

**Akzeptanzkriterium:**

- `npm --prefix website run test:unit -- triage-display` grün
- Alle drei Funktionen werden in den Tests abgedeckt

---

## Aufgabe 5: Verifikation

**Dateien:** keine neuen

**Implementierung:**

```bash
# 1. Syntaxcheck neue Scripts
node --check scripts/triage/heuristik.mjs

# 2. Few-Shot-Dataset validieren
jq empty scripts/triage/few-shot-examples.json

# 3. Heuristik-Smoke: kritischer Treffer
node scripts/triage/heuristik.mjs --title "Prod-Down nach Deploy" --areas infra \
  | jq -e '.auto_apply == true and .severity == "critical"'

# 4. Heuristik-Smoke: niedriger Treffer
node scripts/triage/heuristik.mjs --title "Tippfehler in Doku" --areas docs \
  | jq -e '.auto_apply == false'

# 5. Heuristik-Offline-Test — expected: fail
#    (Test läuft gegen noch nicht implementierte Schwelle; schlägt fehl bis
#     Heuristik-Schwellen final kalibriert sind.)
node scripts/triage/heuristik.mjs --title "irrelevanter text" --areas docs \
  | jq -e '.confidence == 0.99'
# expected: fail (jq -e exit 1 weil confidence != 0.99 bei Low-Ticket)

# 6. Website Unit-Tests
npm --prefix website run test:unit -- triage-display

# 7. Smart-Selection Test-Gate
task test:changed

# 8. Freshness
task freshness:regenerate
task freshness:check
```

**Akzeptanzkriterium:**

- `node --check` grün
- `jq empty scripts/triage/few-shot-examples.json` exit 0
- `task test:changed` grün
- `task freshness:check` grün
- Heuristik-Smokes liefern erwartete Severity + `auto_apply`-Werte

---

## Implementierungsreihenfolge

1. Aufgabe 1 (Few-Shot-Dataset) — Basis für Heuristik-Kalibrierung
2. Aufgabe 2 (Heuristik-Script) — nach Aufgabe 1
3. Aufgabe 3 (Triage-Hook in `create.sh`) — nach Aufgabe 2
4. Aufgabe 4 (Website-Rendering + Tests) — parallel zu Aufgabe 3
5. Aufgabe 5 (Verifikation) — abschließend
