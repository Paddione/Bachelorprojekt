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
