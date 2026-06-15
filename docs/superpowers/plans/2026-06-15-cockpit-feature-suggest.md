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
depends_on_plans: []
---

# Plan: Cockpit Feature Suggestion Manager

## Ziel

Die Überblick-Linse des `/admin/cockpit` um Feature-Portfolio-Management erweitern:
Features für nächsten Schritt wählen, verwerfen, zu Major upgraden, KI-gestütztes Rerollen mit Deepseek.

## Datei-Änderungen (S1-Budget)

| Datei | Baseline | Limit | Aktion |
|-------|----------|-------|--------|
| `website/src/lib/tickets/cockpit-types.ts` | 66 | 150 | Erweitern (+~30) |
| `website/src/lib/tickets/cockpit-db.ts` | 234 | 350 | Neue Funktionen (+~60) |
| `website/src/lib/tickets-db.ts` | ~1100 | 1200 | ALTER TABLE (+~15) |
| `website/src/components/admin/FeatureCard.svelte` | 66 | 150 | Action-Buttons (+~60) |
| `website/src/components/admin/PortfolioGrid.svelte` | 42 | 120 | Props durchreichen (+~10) |
| `website/src/components/admin/Cockpit.svelte` | 106 | 180 | SuggestionBar integrieren (+~20) |
| Neu: `website/src/components/admin/SuggestionBar.svelte` | 0 | 130 | Neue Komponente (~100) |
| Neu: `website/src/pages/api/admin/cockpit/suggest.ts` | 0 | 80 | API-Route (~50) |
| Neu: `website/src/pages/api/admin/cockpit/feature-action.ts` | 0 | 60 | API-Route (~40) |

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

### Step 6: FeatureCard erweitern

**Datei:** `website/src/components/admin/FeatureCard.svelte`

Zusätzliche Props und Events:
- `onNextStep`, `onDiscard`, `onMajor`, `onComment` callbacks
- Visual States:
  - `nextStep`: grüner Left-Border-Streifen + "Nächster Schritt" Badge
  - `discarded`: ausgegraut (opacity: 0.4), durchgestrichener Titel, unten sortiert
  - `majorFeature`: goldener Left-Border-Streifen + "Major" Badge
- Action-Buttons (nur sichtbar bei Hover/Fokus):
  - [▶] Nächster Schritt toggle
  - [🗑] Verwerfen toggle
  - [★] Major Feature toggle
- Kommentar-Feld:
  - Kleiner "💬" Button → klappt Textarea aus
  - Textarea mit Placeholder "Kontext für Reroll..."
  - Save-On-Blur oder dedizierter Save-Button

### Step 7: PortfolioGrid + Cockpit integrieren

**Datei:** `website/src/components/admin/PortfolioGrid.svelte`
- Neue Props: `onFeatureAction(featureId, action, value)`, `onFeatureComment(featureId, comment)`
- An FeatureCard durchreichen

**Datei:** `website/src/components/admin/Cockpit.svelte`
- SuggestionBar über dem PortfolioGrid einbinden
- Handler für feature-action API calls
- Handler für suggest API call
- Portfolio nach Aktionen neu laden

### Step 8: Sortierung

Discarded Features ans Ende der Feature-Liste sortieren.
Next-Step Features nach oben (optional, per Konfiguration).

### Step 9: Tests

- `cockpit-types.test.ts`: Neue Typen prüfen (structure check)
- `cockpit-db.test.ts`: `setFeatureAction()` + erweiterte Portfolio-Query testen
- `FeatureCard.test.ts`: Neue Props + visuelle States testen
- `PortfolioGrid.test.ts`: Neue Props-Durchreichung testen
- `SuggestionBar.test.ts` (neu): Render, Provider-Wechsel, Roll-Button
- `cockpit-api.test.ts`: Neue Endpunkte testen

### Step 10: Finale Verifikation

```bash
# Im Worktree
cd /tmp/wt-cockpit-feature-suggest/website
npm run test:unit              # Alle Vitest-Tests
npm run typecheck              # TypeScript-Prüfung
npm run build                  # Build-Prüfung

# Im Haupt-Repo
task freshness:regenerate
task freshness:check
task test:changed
task test:all
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
