# p1 — Zonen-Shell (Z1-Z4 + Kontrakt A/B, FactoryFloor/PlanningOffice-Anpassung)

**Rolle:** website
**target_files:**
- `components/website/src/pages/sdlc/cockpit.astro` (Umbau)
- `components/website/src/components/leitstand/LeitstandStatusband.svelte` (neu, Z1)
- `components/website/src/components/leitstand/Kontextzone.svelte` (neu, Z4-Router)
- `components/website/src/components/sdlc/FactoryFloor.svelte` (Umbau)
- `components/website/src/components/sdlc/factory/ConveyorBelt.svelte` (Umbau, Z3)
- `components/website/src/components/sdlc/factory/StationColumn.svelte` (Umbau, Z3)
- `components/website/src/components/sdlc/factory/AttentionStrip.svelte` (Umbau, Z2)
- `components/website/src/components/sdlc/factory/MobileTabBar.svelte` (Umbau)
- `components/website/src/components/PlanningOffice.svelte` (Umbau)
- `components/website/src/lib/sdlc/leitstand-metrics.ts` (neu)
- `components/website/src/lib/sdlc/leitstand-url.ts` (neu)
- `components/website/src/lib/sdlc/leitstand-purpose-registry.ts` (neu)
- LÖSCHEN: `components/website/src/components/cockpit/{CommandBar,CockpitRail,OverviewDashboard}.svelte`
  (+ deren kollokierte `.test.ts`, siehe Task 9 — Begründung dort)

_Ticket: T007957 · Epic: T007553 · Partial p1. Implementiert Kontrakt A (purpose-Registry),
Kontrakt B (`leitstand-url.ts`) und Kontrakt C (Zonen-testids) **exakt** wie in
`tasks.d/p3-tests.md` verbindlich festgelegt — p3s Tests sind bereits geschrieben (RED) und
definieren hier die Form, nicht umgekehrt. p2 liefert `DeckLeiste.svelte` + `decks/*.svelte`
parallel; p1 seedet deren purpose-Registry-Einträge bereits vor (Task 2), damit Kontrakt A
sofort nach dem Merge von p1+p2 vollständig ist, ohne einen p1-Folge-PR zu brauchen._

## 1. `leitstand-url.ts` (Kontrakt B, wortgetreu)

Reines TS-Modul, kein DOM/Fetch in `parseLeitstandQuery`/`toLeitstandQuery` (muss per
`node --experimental-strip-types` UND Vitest importierbar bleiben, p3-Vorgabe).

```ts
export interface LeitstandSelection { station?: string; ticket?: string; deck?: string }

export const LEITSTAND_STATIONS = [
  'triage', 'planung', 'scout', 'design', 'plan', 'implement', 'verify', 'deploy', 'ship',
] as const;
export type LeitstandStation = (typeof LEITSTAND_STATIONS)[number];
export const LEITSTAND_DECKS = ['qualitaet', 'plattform', 'ki', 'wissen'] as const;
export type LeitstandDeck = (typeof LEITSTAND_DECKS)[number];

function isStation(v: string): v is LeitstandStation { return (LEITSTAND_STATIONS as readonly string[]).includes(v); }
function isDeck(v: string): v is LeitstandDeck { return (LEITSTAND_DECKS as readonly string[]).includes(v); }

// null = bewusst KEINE Station (bauen -- die Achse zeigt Fertigung ohnehin permanent).
const LEGACY_PHASE_TO_STATION: Record<string, LeitstandStation | null> = {
  triage: 'triage', planung: 'planung', deploy: 'deploy', ship: 'ship', review: 'verify', bauen: null,
};

export function parseLeitstandQuery(params: URLSearchParams): LeitstandSelection {
  const sel: LeitstandSelection = {};
  const rawStation = params.get('station');
  if (rawStation && isStation(rawStation)) sel.station = rawStation;
  if (!sel.station) {
    const rawPhase = params.get('phase');
    if (rawPhase && Object.prototype.hasOwnProperty.call(LEGACY_PHASE_TO_STATION, rawPhase)) {
      const mapped = LEGACY_PHASE_TO_STATION[rawPhase];
      if (mapped) sel.station = mapped;
    }
  }
  const rawTicket = params.get('ticket');
  if (rawTicket) sel.ticket = rawTicket;
  const rawDeck = params.get('deck');
  if (rawDeck && isDeck(rawDeck)) sel.deck = rawDeck;
  if (!sel.deck) {
    const rawMode = params.get('mode');
    if (rawMode === 'insights') sel.deck = 'ki'; // mode=overview -> keine Aenderung
  }
  return sel;
}

export function toLeitstandQuery(sel: LeitstandSelection): string {
  const params = new URLSearchParams();
  if (sel.station) params.set('station', sel.station);
  if (sel.ticket) params.set('ticket', sel.ticket);
  if (sel.deck) params.set('deck', sel.deck);
  return params.toString(); // kein fuehrendes '?', leere Selektion -> ''
}

// Navigations-Primitive ueber Kontrakt B hinaus (p2s DeckLeiste nutzt dieselben
// zwei Funktionen fuer die Deck-Umschaltung statt eine zweite History-Kopplung
// zu erfinden). Rein DOM-basiert, kein Svelte-Store -- jedes Zonen-Island ruft
// onLeitstandSelectionChange selbst auf.
const SELECTION_EVENT = 'leitstand-selectionchange';

export function pushLeitstandSelection(sel: LeitstandSelection): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.search = toLeitstandQuery(sel);
  window.history.pushState({}, '', url.toString());
  document.dispatchEvent(new CustomEvent(SELECTION_EVENT, { detail: sel }));
}

export function onLeitstandSelectionChange(cb: (sel: LeitstandSelection) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<LeitstandSelection>).detail);
  const onPop = () => cb(parseLeitstandQuery(new URLSearchParams(window.location.search)));
  document.addEventListener(SELECTION_EVENT, onCustom);
  window.addEventListener('popstate', onPop);
  return () => {
    document.removeEventListener(SELECTION_EVENT, onCustom);
    window.removeEventListener('popstate', onPop);
  };
}
```

Gegen jeden Fall in `p3-tests.md` § Kontrakt B durchgerechnet (Präzedenz neu-vor-legacy,
Legacy-Tabelle, unbekannte Werte werfen nie, Serialisierungs-Reihenfolge/kein `?`,
Round-Trip) — siehe Kommentar dort, hier 1:1 implementiert.

<!-- vitest: kein eigener p1-Test-Task -- components/website/src/lib/sdlc/__tests__/leitstand-url.test.ts
     und tests/spec/sdlc-cockpit/leitstand-url-scheme.bats liegen in p3s target_files (RED bereits committet). -->

## 2. `leitstand-purpose-registry.ts` (Kontrakt A, inkl. Vorab-Einträge für p2)

Key-Ableitung (von p3 verbindlich festgelegt): Datei-Basisname PascalCase→kebab-case;
liegt die Datei DIREKT unter `components/leitstand/`, wird ein `leitstand-`-Präfix entfernt.

```ts
export interface LeitstandPurpose { zweck: string; datenquelle: string; aktionen: string[] }

export const leitstandPurposes: Record<string, LeitstandPurpose> = {
  statusband: {
    zweck: 'Gesamtzustand des Leitstands (Cluster, Watchdog, Slots, naechster Tick) permanent zeigen und den Hilfe-Zugang bieten.',
    datenquelle: 'floorStore (acquireFloor) + /sdlc/api/factory/parallel-status + window.data.streamState()',
    aktionen: ['Hilfe-Overlay oeffnen'],
  },
  kontextzone: {
    zweck: 'Den zur aktuellen Auswahl passenden Inhalt zeigen: KPI-Leerlaufraster, Stationsliste/Planungsbuero oder Ticket-Detail.',
    datenquelle: 'floorStore, /sdlc/api/planungsbuero, /sdlc/api/cockpit/portfolio, /sdlc/api/factory-floor/:id',
    aktionen: ['Ticket injizieren', 'Ticket aus Kommissionierung freigeben', 'DoR-Kriterium togglen'],
  },
  // Vorab-Eintraege fuer p2 (gleicher Epic, andere target_files) -- siehe Begruendung
  // im Partial-Header. Harmlos, solange die Dateien noch nicht existieren: der p3-Guard
  // markiert nur FEHLENDE Eintraege als Fehler, nie ueberschuessige.
  'deck-leiste': {
    zweck: 'Zwischen den Nebendomaenen-Decks Qualitaet, Plattform, KI und Wissen umschalten, ohne Z1-Z4 zu veraendern.',
    datenquelle: 'leitstand-url.ts (deck-Selektion)',
    aktionen: ['Deck wechseln'],
  },
  'deck-qualitaet': {
    zweck: 'Repo-Gesundheitsziele als eigenes Nebendomaenen-Deck zeigen.',
    datenquelle: 'GoalsDashboard-Datenpfad',
    aktionen: [],
  },
  'deck-plattform': {
    zweck: 'Factory-Steuerkarten fuer Kill-Switch, Budgets und Observability buendeln.',
    datenquelle: 'Control-/Budget-/Observability-Endpunkte der Plattform-Karten',
    aktionen: ['Kill-Switch umschalten', 'DryRun umschalten'],
  },
  'deck-ki': {
    zweck: 'LLM-Routing, Modell-Slots, Dispatch-Mitschnitt und Insights an einem Ort buendeln.',
    datenquelle: 'LlmProxyPanel/KiRoutingPanel/FactoryModelSlots-Adapter, listDispatches, leitstand-metrics.ts',
    aktionen: ['Routing-Regel aendern', 'Modell-Slot zuweisen'],
  },
  'deck-wissen': {
    zweck: 'API-Katalog und OpenSpec-Suche als Nachschlage-Deck anbieten.',
    datenquelle: 'api-inventory.json, OpenSpec-Suchindex',
    aktionen: [],
  },
};
```

Alle sieben `zweck`-Strings paarweise verschieden (Guard-Pflicht). Nach p1 allein deckt die
Registry bereits beide real existierenden Dateien ab (0 `missing`); nach p1+p2-Merge sind es
alle sieben.

<!-- vitest: kein eigener p1-Test-Task -- __tests__/leitstand-purpose-registry.test.ts und
     tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats liegen in p3s target_files. -->

## 3. `leitstand-metrics.ts` (Extraktion aus `CockpitRail.svelte` vor dessen Löschung)

1:1-Port von `buildSections()` (CockpitRail Z.53-192) als reine, parametrisierte Funktion
`buildRailSections(mode, phase, metrics)` — p3s exakte Vorgabe für Name/Signatur/Typen.
Kein DOM/Fetch; `formatCycleTime`/`DerivedMetrics` bleiben aus `factory-metrics-derive.ts`
importiert (keine Duplizierung der Formatierlogik).

```ts
import { formatCycleTime } from './factory-metrics-derive';
import type { DerivedMetrics } from './factory-metrics-derive';

export type Phase = 'triage' | 'planung' | 'bauen' | 'review' | 'deploy' | 'ship';
export type CockpitMode = 'overview' | 'fokus' | 'insights';
export interface RailSection { id: string; label: string; items: RailItem[] }
export interface RailItem { key: string; label: string; value: string; status?: 'green' | 'amber' | 'red'; href?: string }
export const METRICS_WINDOW_DAYS = 7;

export function buildRailSections(mode: CockpitMode, phase: Phase, metrics: DerivedMetrics | null): RailSection[] {
  switch (mode) {
    case 'overview':
      return [
        { id: 'attention', label: 'Aufmerksamkeit', items: [
          { key: 'blocked', label: 'Blockiert', value: '—' },
          { key: 'stuck', label: 'Festgefahren', value: '—' },
          { key: 'cooldown', label: 'Cooldown', value: '—' },
        ] },
        { id: 'epics', label: 'Laufende Epics', items: [] },
        { id: 'agents', label: 'Aktive Agenten', items: [{ key: 'count', label: 'Agenten aktiv', value: '—' }] },
        { id: 'models', label: 'Modell-Server', items: [
          { key: 'factory', label: 'Factory (8091)', value: '—', status: 'green' },
          { key: 'throughput', label: 'Throughput (8092)', value: '—', status: 'green' },
        ] },
      ];
    case 'fokus':
      switch (phase) {
        case 'planung': return [{ id: 'planning', label: 'Planung', items: [
          { key: 'dor', label: 'DoR-Score Ø', value: '—' }, { key: 'queue', label: 'Queue-Tiefe', value: '—' }, { key: 'ready', label: 'Ready', value: '—' },
        ] }];
        case 'bauen': return [
          { id: 'factory', label: 'Factory', items: [
            { key: 'slots', label: 'Slots belegt', value: '—' }, { key: 'active', label: 'Aktive Workpieces', value: '—' }, { key: 'lastTick', label: 'Letzter Tick', value: '—' },
          ] },
          { id: 'models', label: 'Modelle', items: [
            { key: 'factory', label: 'Factory (8091)', value: '—', status: 'green' }, { key: 'throughput', label: 'Throughput (8092)', value: '—', status: 'green' },
          ] },
        ];
        case 'review': return [{ id: 'prs', label: 'Pull Requests', items: [
          { key: 'open', label: 'Offen', value: '—' }, { key: 'ci_pass', label: 'CI bestanden', value: '—' }, { key: 'ci_fail', label: 'CI fehlgeschlagen', value: '—' },
        ] }];
        case 'deploy': return [{ id: 'deploy', label: 'Deployment', items: [
          { key: 'awaiting', label: 'Awaiting Deploy', value: '—' }, { key: 'flux', label: 'FluxCD Status', value: '—', status: 'green' },
        ] }];
        case 'ship': return [{ id: 'shipped', label: 'Ausgeliefert', items: [
          { key: 'this_week', label: 'Diese Woche', value: '—' }, { key: 'last_week', label: 'Letzte Woche', value: '—' },
        ] }];
        default: return [];
      }
    case 'insights':
      return [
        { id: 'metrics', label: 'Metriken', items: [
          { key: 'throughput', label: `Ausgeliefert (${METRICS_WINDOW_DAYS}d)`, value: metrics ? String(metrics.shipped) : '—' },
          { key: 'avg_time', label: 'Ø Zeit plan→done', value: formatCycleTime(metrics?.avgCycleTimeH ?? null) },
          { key: 'escalations', label: `Eskalationen (${METRICS_WINDOW_DAYS}d)`, value: metrics ? String(metrics.escalations) : '—' },
        ] },
        { id: 'traces', label: 'Traces', items: [{ key: 'recorded', label: 'Aufgezeichnet', value: '—' }, { key: 'today', label: 'Heute', value: '—' }] },
      ];
  }
}
```

Konsument von `buildRailSections` ist in p1 noch offen (Kandidat: KI-Deck-Insights, p2/E4) —
die Funktion existiert primär als gesicherter Extraktionspunkt vor der CockpitRail-Löschung
(Task 9), verifiziert durch p3s `leitstand-metrics.test.ts` (RED bereits committet).

## 4. `LeitstandStatusband.svelte` (Z1, neu)

Portiert `CommandBar.svelte`s `onMount`-Logik (floorStore-Subscribe für
`watchdogStale`/`slotUsed`/`slotCap`, `/sdlc/api/factory/parallel-status`-Fetch für
`nextTickAt`, Countdown via `deriveCountdownSec` aus `lib/parallel-status.ts` — **unverändert
wiederverwendet**, nicht dupliziert). Cluster-Health/Agenten-/PR-Badges bleiben exakt wie in
CommandBar Platzhalter (`green`/`—`) — keine Regression, keine neue Datenanbindung in diesem
Ticket. Root-Element trägt `data-testid="leitstand-statusband"` (Kontrakt C) sowie ein Kind-
Element `id="leitstand-stream-state"` (Live/Fixtures-Badge, wird von cockpit.astro's
Inline-`<script>` per `window.data.streamState()` aktualisiert — Requirement "Header-Status
spiegelt Livedaten statt Fixtures", Ort wandert vom alten Header nach Z1). Help-Toggle: lokaler
`$state<boolean>` schaltet einen minimalen Platzhalter-Hinweis ("Hilfe-Overlay folgt in E5")
ein/aus, **ohne** `station`/`ticket`/`deck` in der URL zu ändern (Scenario "Help toggle opens
without changing the selection"). Nutzt `PilotLight` (wie bisher) — **nicht** `StatusStrip.svelte`
(das ist eine andere Komponente, Ziel des Plattform-Decks in p2, reiner Namenszufall).
Styling ausschließlich über `--ls-*`-Tokens aus `sdlc-leitstand.css` (E1-Pflicht).

## 5. `AttentionStrip.svelte` (Z2, Umbau — "hochgezogen")

Wird selbstständig: eigener `onMount` mit `acquireFloor()` + `floorStore.subscribe(...)`
(exakt das Muster aus `CommandBar.svelte`/`FactoryFloor.svelte`), liest `payload.attention`
selbst statt eine `attention`-Prop von `FactoryFloor` zu erwarten (`attention`-Prop bleibt als
optionaler Override für Tests erhalten, Default `undefined` → Store gewinnt). Rendert seinen
Wrapper **immer** (nicht mehr `{#if !attention.isEmpty}` um die ganze Komponente), mit
explizitem Leerzustand ("Keine offenen Punkte") statt komplett zu verschwinden — Requirement
"persistent ... never covered". **Kein neuer `data-testid`** (Kontrakt C: Z2 bekommt keinen).
Bestehende Chip-Logik (`.chip-blocked`/`.chip-stuck`/`.chip-cool`, `role="alert"`) unverändert.

## 6. `ConveyorBelt.svelte` + `StationColumn.svelte` (Z3, Umbau — kompakte Achse)

`StationColumn.svelte`: neue Prop `compact?: boolean` (Default `false`, bestehendes Verhalten
unverändert bei `false` — wird so weiterhin von `FactoryFloorLane.svelte`/`FactoryFloor.svelte`
für die Bauen-Detailansicht in Z4 genutzt). Bei `compact=true`: nur `station-node-row` +
`station-header` (Nummer/Anzahl/Label) rendern, **keine** `station-cards`/Badge-Sektion; der
ganze Header wird klickbar (`<button>`), ruft eine neue Prop `onStationSelect?: (key: string) =>
void` auf statt `onSelect` (Ticket-Klick bleibt getrennt).

`ConveyorBelt.svelte`: neue Props `compact?: boolean`, `selectedStation?: string | null`
(Highlight-Klasse durchgereicht an `StationColumn`), `onStationSelect?: (key: string) => void`.
Bei `compact=true` rendert die Komponente zusätzlich zu den 6 Fertigungs-`StationColumn`s zwei
kompakte Kapsel-Knoten davor/danach für Intake (`triage`, `planung` — je ein eigener Knoten,
Zähler aus einer neuen Prop `intakeCounts?: { triage: number | null; planung: number | null }`)
und Ausgang (`ship`, Zähler aus `ausgangCount?: number | null`), stilistisch an `.station-node`
angelehnt, ebenfalls über `onStationSelect` klickbar. `.belt`-Grid wird bei `compact` auf 9
Spalten erweitert (CSS, `grid-template-columns: repeat(9, minmax(96px, 1fr))`).
`data-testid="leitstand-achse"` **nur** auf dem Root-`.belt`-Div, **nur wenn `compact === true`**
(sonst würde die Z4-Bauen-Instanz denselben testid ein zweites Mal im DOM tragen — Kontrakt C
verlangt Eindeutigkeit implizit über den Smoke-Check `count() > 0`, zwei Treffer sind
unproblematisch für `count()`, aber semantisch falsch: nur die Z3-Instanz *ist* die Achse).
`ConveyorBelt` selbst bleibt bei `compact=true` presentational für Ticket-/Config-Props (leer
lassen), holt sich `hall`/`officeWaiting`/`stagedWaiting`/`shipped.length` und die aktuelle
`station`-Selektion selbst via `acquireFloor()`/`floorStore.subscribe` bzw.
`onLeitstandSelectionChange` (aus `leitstand-url.ts`, Task 1) statt sie von `cockpit.astro`
durchgereicht zu bekommen — dieselbe Selbstständigkeit wie bei `AttentionStrip` (Task 5),
notwendig weil Z3 unabhängig vom Astro-Island für Z4 aktualisiert werden muss.

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/components/sdlc/factory/ConveyorBelt.svelte` | 60 | 1040 |
| `components/website/src/components/sdlc/factory/StationColumn.svelte` | 261 | 839 |

## 7. `FactoryFloor.svelte` (Umbau, minimal)

Entfernt nur den `AttentionStrip`-Import und dessen Render-Zeile (`<AttentionStrip
attention={data.attention} />`) — die Komponente ist jetzt in Z2 hochgezogen (Task 5) und wird
nicht mehr innerhalb von `FactoryFloor` doppelt gerendert. Sonst **keine** strukturelle
Änderung: bleibt die Bauen-Stations-Inhaltskomponente, jetzt gemountet von `Kontextzone.svelte`
(Task 10) statt direkt von `cockpit.astro`; alle sieben Floor-testids
(`factory-floor`/`floor-leitstand`/`floor-hall`/`floor-shipped`/`floor-slots`/
`floor-workpiece`/`floor-detail`) bleiben unverändert (INVARIANT laut `software-factory.md`).

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/components/sdlc/FactoryFloor.svelte` | 332 | 768 |

## 8. `PlanningOffice.svelte` (Umbau, Stations-Filter-Prop)

Neue optionale Prop `stationFilter?: 'triage' | 'planung' | null` (Default `null` =
bestehendes ungefiltertes Verhalten, additiv/rückwärtskompatibel). Vor dem Rendern von
`PlanningOfficeQueue`/`PlanningOfficeTriage` (Zeile ~380+) `items` clientseitig filtern:
`stationFilter === 'triage'` zeigt nur Items mit gesetztem `item.triage`-Feld (noch nicht
übernommene Vorschläge), `stationFilter === 'planung'` zeigt den Rest (bereits triagiert,
in Planung). Vor der Implementierung `PlanningOfficeQueue.svelte`/`PlanningOfficeTriage.svelte`
auf das exakte `triage`-Feld-Schema prüfen (`TriageSuggestion | null`).

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/components/PlanningOffice.svelte` | 433 | 667 |

## 9. `MobileTabBar.svelte` (Umbau, minimal — Koexistenz mit dem Zonen-Stapel)

Funktional unverändert (bleibt die interne Lane-Navigation der Bauen-Stationsansicht,
`TABS`/`MOBILE_COL_INDEX` aus `mobile-tab-bar-constants.ts` unangetastet) — das entfernte
Requirement "Mobile Bottom-Sheet + Swipe-Navigation" betrifft die **Stationsauswahl auf
Z3-Ebene**, die es vorher nicht gab, nicht diese Halleninterne Navigation. Einzige Änderung:
`z-index`/`position: fixed`-Koordination gegen Z5s neu mobil gestapelte Deck-Leiste prüfen und
bei Überlappung anpassen (visuelle Verifikation nach Umsetzung von p2 nachholen, kein
struktureller Umbau in p1 allein nötig).

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/components/sdlc/factory/MobileTabBar.svelte` | 84 | 1016 |

## 10. `Kontextzone.svelte` (Z4-Router, neu)

Root-Element trägt `data-testid="leitstand-kontextzone"` (Kontrakt C). Abonniert
`onLeitstandSelectionChange` (Task 1) für die aktuelle `LeitstandSelection`, verzweigt:

- **Ticket gesetzt** (`sel.ticket`): eigener Fetch `/sdlc/api/factory-floor/${sel.ticket}`
  (analog `FactoryFloor.openDetail`, bewusst kleine Dopplung statt einer größeren
  Extraktion — siehe Konflikt-Hinweis in der Abschluss-Antwort), rendert
  `factory/DetailPanel.svelte` (trägt `floor-detail` bereits selbst, INVARIANT).
- **Station in `['scout','design','plan','implement','verify','deploy']`**: rendert
  `<FactoryFloor {initial} />` (Task 7) — alle sechs Fertigungsstationen zeigen dieselbe
  Bauen-Ansicht (keine Einzel-Phasen-Filterung von `FactoryFloor` in diesem Ticket, siehe
  Konflikt-Hinweis).
- **Station `triage`/`planung`**: rendert `<PlanningOffice {brand} stationFilter={sel.station}
  />` (Task 8).
- **Station `ship`**: kompakte Shipped-Liste — `factory/ShippedColumn.svelte`
  wiederverwendet (bereits mit `relTime`/`prUrl`-Props typisiert, siehe `FactoryFloor.svelte`
  Z.245-250 für die exakte Prop-Form).
- **Keine Auswahl** (Idle): KPI-Raster über die sechs SDLC-Stationen (Scout/Triage/Planung/
  Bauen/Review/Deploy-Ship) — Datenpfad aus `OverviewDashboard.svelte`s `load()` (Fetch
  `/sdlc/api/cockpit/portfolio`, `phaseMap`-Aggregation) **portiert, nicht importiert**
  (Komponente stirbt in Task 11), ohne die alte Attention-Sektion (redundant zu Z2). PR-Sektion
  (offene PRs + CI-Status) rendert strukturell, zeigt aber mangels einer im Index deklarierten
  PR-Listen-API einen Leerzustand — siehe Konflikt-Hinweis.

`initial`/`brand`/`slotsCap` als Props von `cockpit.astro` durchgereicht (SSR-Erstzustand).

## 11. `cockpit.astro` (Umbau, finale Montage)

SSR: `const initialSelection = parseLeitstandQuery(Astro.url.searchParams);` ersetzt die alten
`CockpitMode`/`Phase`/`ALLOWED_MODES`/`ALLOWED_PHASES`-Deklarationen vollständig. `getFloor`-
und `listDispatches`-SSR-Fetches bleiben (Props für Z3/Z4 bzw. für p2s `DeckLeiste` — Kontrakt
für p2: erwartet Props `{ brand, initialSelection, dispatchInitial }`, mountet
`data-testid="leitstand-deck-leiste"`). Layout: `<link rel="stylesheet"
href="/styles/sdlc-leitstand.css">`-Äquivalent — **korrekt** per `import
'../../styles/sdlc-leitstand.css';` im Frontmatter (E1-Token-Pflicht, aktuell nicht importiert).
Template fünf Zonen senkrecht gestapelt (Z1 oben, Z2/Z3 darunter, Z4+Z5 als CSS-Grid
`grid-template-columns: 1fr minmax(240px, 320px)` nebeneinander), alle `client:load`:

```astro
<LeitstandStatusband client:load {brand} />
<AttentionStrip client:load />
<ConveyorBelt client:load compact stations={STATIONS} hallItems={[]} mobileColIndex={0} onSelect={() => {}} />
<div class="ls-main">
  <Kontextzone client:load {brand} {initial} initialSelection={initialSelection} slotsCap={slotsCap} />
  <DeckLeiste client:load {brand} initialSelection={initialSelection} dispatchInitial={dispatchInitial} />
</div>
```

(`STATIONS` weiterhin aus `FactoryFloor.svelte`s Modul-Export, unverändert.) Inline
`<script>`: `cockpit-modechange`-Listener + `window.location.reload()` **entfernen** (Kein-
Voll-Reload-Pflicht). `cockpitAct`/`window.cockpitAct` bleibt unverändert (Kit-Panel-
Bestätigungen, unabhängig vom Zonen-Umbau). `updateHeader()`-IIFE bleibt, Ziel-Element-ID auf
`#leitstand-stream-state` umstellen (siehe Task 4). Alte `.cockpit`/`.cockpit-body`/
`.cockpit-main`/`.fokus-phase__*`-Styles durch `--ls-*`-Token-basierte Zonen-Stack-Regeln
ersetzen. Imports von `CommandBar`/`CockpitRail`/`OverviewDashboard`/`InsightsTab`/
`DispatchLogPanel` entfernen (Insights/Dispatch wandern über `DeckLeiste`→`DeckKi` in p2).

| Datei | Ist | Budget |
|---|---|---|
| `components/website/src/pages/sdlc/cockpit.astro` | 226 | 774 |

## 12. Löschungen (erst nach Task 1-11, Extrakte sind gesichert)

`git rm components/website/src/components/cockpit/{CommandBar,CockpitRail,OverviewDashboard}.svelte`
sowie die kollokierten `CommandBar.test.ts` (129 Z.) und `CockpitRail.test.ts` (76 Z.) — beide
importieren die gelöschten Komponenten direkt und würden sonst `task test:changed` mit einem
Modul-Auflösungsfehler brechen; das ist zwingende Folge der Löschung, keine Erweiterung von
`target_files` (kein neuer Produktionscode, reines Aufräumen kollokierter Testdateien
derselben gelöschten Quelle). Danach `grep -rn "cockpit/CommandBar\|cockpit/CockpitRail\|
cockpit/OverviewDashboard" components/website/src tests` erneut laufen lassen — muss leer
sein bis auf die in der Abschluss-Antwort gemeldeten Altlasten (siehe dort).

<!-- vitest: keine neue lib-/api-Datei in dieser Task-Gruppe, nur Löschungen -- kein Test-Task. -->
