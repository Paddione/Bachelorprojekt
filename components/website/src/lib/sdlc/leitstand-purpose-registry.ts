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
  'kpi-grid': {
    zweck: 'Im Leerlauf der Kontextzone die DORA-KPIs (Deployment-Frequenz, Lead Time, CFR) plus Factory-Kennzahlen als Live-Raster zeigen.',
    datenquelle: '/sdlc/api/delivery-metrics (summarize/aggregateDora aus delivery-metrics.ts)',
    aktionen: [],
  },
  'api-katalog': {
    zweck: 'Alle im Repo existierenden API-Endpunkte durchsuchbar nachschlagen — inklusive MCP-Server-Health (Browser prueft MCP-Ports nie direkt).',
    datenquelle: 'api-inventory.json (einziger Import), /sdlc/api/mcp-health',
    aktionen: [],
  },
};
