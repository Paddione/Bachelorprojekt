---
ticket_id: T000784
status: active
created: 2026-06-15
branch: feature/cockpit-feature-suggest
spec: docs/superpowers/specs/2026-06-15-cockpit-feature-suggest-design.md
domains: [website, db]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [2026-06-15-cockpit-ux-redesign]
---

# Plan: Cockpit Feature Suggestion Manager

## Ziel

Feature-Portfolio-Management im neuen Cockpit (T000786): Features als nächsten Schritt wählen,
verwerfen, zu Major upgraden, KI-gestütztes Rerollen mit DeepSeek. Integration in CockpitSidebar
(Hover-Aktionen auf Baum-Knoten + SuggestionBar am Sidebar-Ende).

**Voraussetzung:** T000786 (Cockpit UX Redesign) muss gemergt sein. Dieser Branch muss auf main
rebased werden, bevor die Frontend-Steps ausgeführt werden.

## Datei-Änderungen (S1-Budget)

| Datei | Baseline | Limit | Aktion |
|-------|----------|-------|--------|
| `website/src/lib/tickets/cockpit-types.ts` | 66 | 150 | Erweitern (+~30) |
| `website/src/lib/tickets/cockpit-db.ts` | 234 | 350 | Neue Funktionen (+~60) |
| `website/src/lib/tickets-db.ts` | ~1100 | 1200 | ALTER TABLE (+~15) |
| `website/src/components/admin/CockpitSidebar.svelte` | 0→~230 | 300 | Hover-Buttons + SuggestionBar (+~60) |
| Neu: `website/src/components/admin/SuggestionBar.svelte` | 0 | 130 | Neue Komponente (~100) |
| Neu: `website/src/pages/api/admin/cockpit/suggest.ts` | 0 | 80 | API-Route (~50) |
| Neu: `website/src/pages/api/admin/cockpit/feature-action.ts` | 0 | 60 | API-Route (~40) |

**Entfällt (von T000786 gelöscht):**
- `FeatureCard.svelte` — T000786 löscht diese Datei
- `PortfolioGrid.svelte` — T000786 löscht diese Datei
- Integration in `Cockpit.svelte` via Überblick-Linse — Lens-Konzept entfällt

## Steps

### Step 1: DB-Schema erweitern

**Datei:** `website/src/lib/tickets-db.ts`

In `initTicketsSchema()` vier neue Spalten per `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`:

```sql
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS next_step BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS discarded BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS major_feature BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS suggestion_comment TEXT;
```

**Datei:** `scripts/migrations/2026-06-15-cockpit-feature-suggest.sql` (neu)

### Step 2: Types erweitern

**Datei:** `website/src/lib/tickets/cockpit-types.ts`

```ts
// FeatureNode erweitern
export interface FeatureNode {
  // ...existing fields...
  nextStep: boolean;
  discarded: boolean;
  majorFeature: boolean;
  suggestionComment?: string;
}

// Neue Typen
export interface FeatureActionRequest {
  featureId: string;
  action: 'next_step' | 'discard' | 'major' | 'comment';
  value?: boolean | string;
}

export interface SuggestRequest {
  distribution?: 'equal' | 'manual';
  provider?: string;  // default: 'deepseek'
  model?: string;     // default: 'deepseek-chat'
}

export interface SuggestResponse {
  suggestions: Array<{
    featureId: string;
    nextStep: boolean;
    reason: string;
  }>;
}
```

### Step 3: DB-Layer erweitern

**Datei:** `website/src/lib/tickets/cockpit-db.ts`

- `getPortfolio()`: Query um `next_step`, `discarded`, `major_feature`, `suggestion_comment` erweitern, FeatureNode-Mapping anpassen
- `getFeatureTickets()`: dito
- Neue Funktion `setFeatureAction(brand, featureId, action, value)`: UPDATE mit Brand-Guard + Audit
- Neue Funktion `getSuggestions(brand)`: Features für Deepseek-Prompt sammeln (ohne discarded)

### Step 4: API-Routen

**Datei:** `website/src/pages/api/admin/cockpit/feature-action.ts` (neu)
- POST: Auth-Guard → `setFeatureAction(BRAND(), featureId, action, value)` → `{ ok: true }`

**Datei:** `website/src/pages/api/admin/cockpit/suggest.ts` (neu)
- POST: Auth-Guard → Features laden → Deepseek-Prompt bauen → API call → Response parsen
- Verwendet `OpenAICompatibleSessionAgent` aus `openai-compatible-session-agent.ts`
- Prompt-Template: "Verteile folgende Features gleichmäßig auf 'nächster Schritt'..."
- Fallback: Bei API-Fehler → `{ error: '...' }` mit 500

### Step 5: SuggestionBar-Komponente

**Datei:** `website/src/components/admin/SuggestionBar.svelte` (neu)

- Provider-Selector (Dropdown: Deepseek, Anthropic, Local Cluster)
- Model-Selector (abhängig vom Provider)
- "Rollen" Button → triggert `POST /api/admin/cockpit/suggest`
- "Übernehmen" Button → wendet Suggestions an (batch feature-action calls)
- "Zurücksetzen" Button → cleared alle next_step flags
- Status-Anzeige: "X Features für nächsten Schritt | Y verworfen | Z Major"
- Verteilungs-Modus: "Gleichverteilung" Toggle

### Step 6: CockpitSidebar erweitern — Hover-Aktionen

**Datei:** `website/src/components/admin/CockpitSidebar.svelte`

Voraussetzung: T000786 muss gemergt und dieser Branch auf main rebased sein.

Props erweitern:
```ts
onFeatureAction?: (featureId: string, action: 'next_step'|'discard'|'major'|'comment', value?: boolean|string) => void
```

Feature-Knoten im Baum erhalten einen Hover-Overlay mit drei Buttons:
- `[▶]` — next_step toggle (grüner Akzent wenn aktiv)
- `[🗑]` — discard toggle (rot wenn aktiv, Text durchgestrichen)
- `[★]` — major toggle (gold wenn aktiv)

Visual States per Feature-Knoten:
- `nextStep`: 3px grüner Left-Border, zarter `rgba(34,197,94,0.08)` Hintergrund
- `discarded`: `opacity: 0.45`, `text-decoration: line-through`
- `majorFeature`: 3px goldener `#f59e0b` Left-Border

Kommentar-Inline-Edit:
- `[💬]`-Button klappt eine einzeilige Textarea direkt unter dem Knoten aus
- Save-on-blur → `onFeatureAction(id, 'comment', text)`

Sortierung innerhalb eines Produkts:
1. `majorFeature = true` (oben)
2. normale Features
3. `discarded = true` (ganz unten)

SuggestionBar einbinden (unter dem Baum, über der Sidebar-Footer-Linie):
```svelte
<SuggestionBar features={allFeatures} {isRolling}
  on:roll={handleRoll} on:apply={handleApply} on:reset={handleReset} />
```

Handler in CockpitSidebar (nicht in Cockpit.svelte):
- `handleRoll`: POST `/api/admin/cockpit/suggest` → batch featureAction calls → reload portfolio
- `handleApply`: reload portfolio
- `handleReset`: alle next_step flags clearen via batch feature-action calls

### Step 7: Cockpit.svelte anpassen

**Datei:** `website/src/components/admin/Cockpit.svelte` (aus T000786)

`featureAction(id, action, value)` als Callback an `CockpitSidebar` übergeben, damit dieser seine
eigenen Handlers verdrahten kann. Cockpit hält den `portfolio`-State und reloaded nach Mutationen.

### Step 8: Tests

- `cockpit-db.test.ts`: `setFeatureAction()` + erweiterte Portfolio-Query testen
- `SuggestionBar.test.ts` (neu): Render, Provider-Wechsel, Roll-Button
- `CockpitSidebar.test.ts`: Hover-Buttons sichtbar, Visual-States korrekt (next/discard/major)
- `cockpit-api.test.ts`: Neue Endpunkte testen

**Entfällt:**
- `FeatureCard.test.ts` — Datei wird gelöscht
- `PortfolioGrid.test.ts` — Datei wird gelöscht

### Step 9: Finale Verifikation

```bash
task test:all
task freshness:regenerate
task freshness:check
task test:inventory
pnpm build
```

## Deepseek Integration

Der Suggest-Endpoint nutzt die existierende `OpenAICompatibleSessionAgent`-Klasse:
- Provider `deepseek` → `https://api.deepseek.com/v1`
- Model `deepseek-chat`
- API-Key aus `process.env.DEEPSEEK_API_KEY`

Prompt-Template (System):
```
Du bist ein Feature-Portfolio-Manager. Verteile die folgenden Features auf "nächster Schritt".
Regeln:
1. Gleichverteilung über Produkte (ungefähr gleiche Anzahl pro Produkt)
2. Features mit "discarded=true" nicht vorschlagen
3. Features mit "major_feature=true" bevorzugen
4. Falls ein suggestion_comment vorhanden ist, diesen als Kontext berücksichtigen
5. Antworte NUR mit JSON: [{"featureId":"...","nextStep":true/false,"reason":"..."}]
```
