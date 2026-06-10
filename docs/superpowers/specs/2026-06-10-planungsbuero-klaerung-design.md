# Spec: Planungsbüro — Inline-Klärungsrunde

**Datum:** 2026-06-10  
**Branch:** feature/planungsbuero-klaerung  
**Slug:** planungsbuero-klaerung

---

## Problem

Alle 8 `planning`-Tickets haben `abhaengigkeiten_klar: false` und `offene_fragen_geklaert: false`. Die Klärung läuft aktuell via externem HTML-Formular + Copy-Paste. Das ist umständlich. Die Fragen sollten direkt im Planungsbüro-UI beantwortet werden können.

---

## Ziel

Jede Karte im Planungsbüro kann aufgeklappt werden. Im aufgeklappten Bereich erscheinen die generierten Klärungsfragen als ausfüllbares Formular. Nach dem Speichern werden die Antworten als `ticket_comment` hinterlegt und die `readiness`-Flags aktualisiert.

---

## UI-Verhalten (Feature-Anforderungen)

### Kartenstruktur

```
┌──────────────────────────────────────────────────────┐
│ ▲▼  [T000571] Brett Lobby-Fix   klein  brett  2/4  ▼ │  ← Expand-Button
└──────────────────────────────────────────────────────┘
    ↓ aufgeklappt:
┌──────────────────────────────────────────────────────┐
│ 📎 Kern-Nutzen: Behebt kritischen Bug-Cluster…       │
│                                                      │
│ 🔴 Abhängigkeiten unklar                             │
│   Welche Tickets müssen vorher fertig sein?          │
│   [________________________________] ← input[text]   │
│   Externe Dienste nötig? ○ Keine ○ DB-Schema ○ …    │
│                                                      │
│ 🔴 Offene Fragen (brett)                             │
│   Betroffene Rollen? ☐ Leiter ☐ Teilnehmer ☐ …     │
│   Mobile-Support? ○ Pflicht ○ Nice-to-have ○ Nein   │
│   Verbindungsabbruch-Verhalten? ○ Auto-Retry ○ …    │
│                                                      │
│               [✓ Antworten speichern]                │
└──────────────────────────────────────────────────────┘
```

### Regeln

- **Expand-Toggle:** Klick auf einen `▼`/`▲`-Button rechts an jeder Karte (nicht der ganze Card-Click, der öffnet weiterhin den rechten Detail-Editor)
- **Nur offene Fragen zeigen:** Flag `true` → kein Formularblock für diesen Bereich
- **Alle Felder optional:** User muss nicht alle beantworten vor dem Speichern
- **Mehrere Karten gleichzeitig aufklappen:** erlaubt (kein Mutex)
- **Nach Speichern:** Formular kollabiert, `readiness`-Flags aktualisieren sich sichtbar, DoR-Zähler springt hoch
- **Ladezustand:** "Speichern…"-Button während Fetch

---

## Fragen-Ableitung (Frontend-Funktion)

```typescript
// website/src/lib/clarification-questions.ts
export interface ClarificationField {
  key: string;       // e.g. "abhaengigkeiten"
  label: string;     // Fragentext
  type: 'text' | 'radio' | 'checkboxes';
  options?: string[];  // für radio/checkboxes
  dorFlag?: string;  // wenn beantwortet: diesen readiness-key auf true setzen
}

export interface ClarificationSection {
  title: string;      // "Abhängigkeiten" / "Spec-Skizze" / "Brett-Fragen"
  dorFlag: string;    // welcher readiness-flag ist unklar
  fields: ClarificationField[];
}

export function deriveSections(item: OfficeItem): ClarificationSection[]
```

Ableitung-Regeln:
- `abhaengigkeiten_klar: false` → Section "Abhängigkeiten" (immer 2 Felder: Text-Input für IDs, Radio für externe Dienste)
- `spec_skizziert: false` → Section "Spec-Skizze" (Textarea Kernflow, Textarea Not-Scope)
- `offene_fragen_geklaert: false` → Section pro `area` mit domain-spezifischen Fragen (brett / website / chat / infra / auth / ai)
- `aufwand_geschaetzt: false` → einzelne Radio-Frage "Aufwand?" (klein/mittel/groß) + ggf. PATCH effort direkt

---

## API: POST `/api/planning-office/[extId]/clarify`

**Request:**
```json
{
  "answers": {
    "abhaengigkeiten": "T000573",
    "externe_abh": "keine",
    "brett_rollen": ["leiter", "teilnehmer"],
    "brett_mobile": "pflicht"
  },
  "readinessUpdates": {
    "abhaengigkeiten_klar": true,
    "offene_fragen_geklaert": true
  },
  "dependsOn": ["T000573"],
  "effort": "klein"
}
```

**Verarbeitung (Reihenfolge):**
1. Ticket in DB suchen (extId → uuid)
2. Comment-Body aus `answers` zusammenbauen (Markdown-Tabelle)
3. `INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)` → `'planning-office'`, `'internal'`
4. `UPDATE tickets.tickets SET readiness = readiness || $readinessUpdates` falls `readinessUpdates` nicht leer
5. `UPDATE tickets.tickets SET depends_on = $dependsOn` falls nicht leer
6. `UPDATE tickets.tickets SET effort = $effort` falls angegeben
7. Response: `{ ok: true }`

**Fehler:** 404 wenn Ticket nicht gefunden, 400 bei malformed body.

---

## DAL: `website/src/lib/planning-office.ts`

Neue Funktion:
```typescript
export async function clarifyItem(
  extId: string,
  answers: Record<string, string | string[]>,
  readinessUpdates: Partial<Record<DorKey, boolean>>,
  opts?: { dependsOn?: string[]; effort?: string }
): Promise<void>
```

Nutzt denselben `pool` wie alle anderen DAL-Funktionen.

---

## Comment-Body-Format

```markdown
## Klärungsrunde 2026-06-10

| Frage | Antwort |
|-------|---------|
| Welche Tickets müssen vorher fertig sein? | T000573 |
| Externe Dienste nötig? | keine |
| Betroffene Rollen? | Leiter, Teilnehmer |
| Mobile-Support? | Pflicht |
```

---

## Svelte-Implementierung (Überblick)

```svelte
<!-- PlanningOffice.svelte Erweiterungen -->
<script lang="ts">
  import { deriveSections, type ClarificationSection } from '$lib/clarification-questions';

  // Pro Karte: ist sie aufgeklappt?
  let expanded: Record<string, boolean> = {};
  // Pro Karte: Formular-Answers
  let answers: Record<string, Record<string, any>> = {};
  // Pro Karte: Speichern läuft
  let clarifying: Record<string, boolean> = {};

  function toggleExpand(extId: string) {
    expanded[extId] = !expanded[extId];
  }

  async function saveClarification(it: any) {
    clarifying[it.extId] = true;
    const itemAnswers = answers[it.extId] ?? {};
    // Readiness-Flags ableiten: welche Sections hatten Antworten?
    const readinessUpdates = deriveReadinessUpdates(it, itemAnswers);
    const body = buildRequestBody(itemAnswers, readinessUpdates, it);

    await fetch(`/api/planning-office/${it.extId}/clarify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

    clarifying[it.extId] = false;
    expanded[it.extId] = false;
    await load(); // readiness-flags refreshen
  }
</script>

<!-- In der Karten-Liste: Expand-Button + Klärungsformular -->
{#each items as it (it.extId)}
  <div class="po-card" on:click={() => selected = it} ...>
    <!-- bestehender Card-Content -->
    <button class="po-expand" on:click|stopPropagation={() => toggleExpand(it.extId)}
            aria-expanded={expanded[it.extId] ?? false}>
      {expanded[it.extId] ? '▲' : '▼'}
    </button>
  </div>

  {#if expanded[it.extId]}
    <div class="po-clarify" data-testid="office-clarify-{it.extId}">
      {#each deriveSections(it) as section}
        <fieldset>
          <legend>🔴 {section.title}</legend>
          {#each section.fields as field}
            <!-- field rendering basierend auf field.type -->
          {/each}
        </fieldset>
      {/each}
      <button on:click={() => saveClarification(it)} disabled={clarifying[it.extId]}>
        {clarifying[it.extId] ? 'Speichern…' : '✓ Antworten speichern'}
      </button>
    </div>
  {/if}
{/each}
```

---

## Dateien (erstellen / ändern)

| Datei | Aktion |
|-------|--------|
| `website/src/lib/clarification-questions.ts` | **neu** — Fragen-Ableitung + Typen |
| `website/src/lib/planning-office.ts` | **erweitern** — `clarifyItem()` |
| `website/src/pages/api/planning-office/[extId]/clarify.ts` | **neu** — POST-Endpoint |
| `website/src/components/PlanningOffice.svelte` | **erweitern** — Expand-Toggle + Klärungsformular |
| `website/tests/e2e/planning-office.spec.ts` | **erweitern** — E2E für Expand + Save |
| `website/src/data/test-inventory.json` | **regenerieren** |

---

## In-Scope / Out-of-Scope

**In-Scope:**
- Expand-Toggle pro Karte
- Fragen-Ableitung aus `readiness` + `areas` im Frontend
- Antworten als `ticket_comment` speichern
- Readiness-Flags + `depends_on` + `effort` aktualisieren
- DoR-Zähler-Refresh nach Speichern
- E2E-Test für den Happy Path

**Out-of-Scope:**
- Neue DB-Tabelle für Klärungsfragen
- Antwort-History / Versionierung
- Mobile-optimiertes Layout (responsive Grundstruktur genügt)
- KI-generierte Vorschläge für Antworten
- Echtzeit-Updates zwischen Tabs

---

## DoR-Kriterien

- [x] Spec skizziert
- [x] Aufwand geschätzt (mittel, ~3-4d)
- [x] Abhängigkeiten klar (keine — bestehende Endpoints reichen)
- [x] Offene Fragen geklärt (Fragen-Ableitung im Frontend, kein neues DB-Schema)
