# p2 — Z5 Deck-Leiste: die zwölf reaktivierten Karten in vier Nebendomänen-Decks

**Rolle:** website
**target_files:**
- `components/website/src/components/leitstand/DeckLeiste.svelte` (neu)
- `components/website/src/components/leitstand/decks/DeckQualitaet.svelte` (neu)
- `components/website/src/components/leitstand/decks/DeckPlattform.svelte` (neu)
- `components/website/src/components/leitstand/decks/DeckKi.svelte` (neu)
- `components/website/src/components/leitstand/decks/DeckWissen.svelte` (neu)
- `components/website/src/components/DevStatusTabs.svelte` (LÖSCHEN)

_Ticket: T007957 · Epic: T007553 · Partial p2, parallel zu p1 (Datei-Ownership disjunkt — p1 baut
die Z1–Z4-Zonen-Shell inkl. `leitstand-url.ts`/`leitstand-purpose-registry.ts`; p2 liefert
ausschließlich Z5). Design: `openspec/changes/sdlc-leitstand-e3-shell/design.md` § Zonen-Vertrag
Z5 + E3-Entscheidungsprotokoll. Test-Kontrakt: `tasks.d/p3-tests.md` (bereits committet) §
Kontrakt A/B/C — diese Regeln sind **bindend**, nicht neu verhandelbar._

Dieser Partial baut **keine** neue Datenlogik. Er reaktiviert die zwölf toten Karten aus
`sdlc/factory/*` + `GoalsDashboard` + `DispatchLogPanel` durch reinen Re-Import in vier neue
Deck-Container und ersetzt damit `DevStatusTabs.svelte` als deren einzigen (toten) Konsumenten.
Kein Kartenquelltext wird angefasst (Vorgabe der Aufgabe) — Wiring ausschließlich über Props auf
den neuen Deck-Containern, falls überhaupt nötig (siehe Befund 1: ist es nicht).

## Bindende Kontrakte (aus `tasks.d/p3-tests.md`, bereits committet — keine eigene Auslegung)

**Kontrakt A — purpose-Registry-Key je Datei** (Kebab-Case des Basisnamens; Präfix-Strip nur für
Dateien direkt unter `components/leitstand/`, betrifft `DeckLeiste.svelte` nicht, weil dessen
Kebab-Form nicht mit `leitstand-` beginnt):

| Datei | Registry-Key |
|---|---|
| `leitstand/DeckLeiste.svelte` | `deck-leiste` |
| `leitstand/decks/DeckQualitaet.svelte` | `deck-qualitaet` |
| `leitstand/decks/DeckPlattform.svelte` | `deck-plattform` |
| `leitstand/decks/DeckKi.svelte` | `deck-ki` |
| `leitstand/decks/DeckWissen.svelte` | `deck-wissen` |

Der p3-Vollständigkeits-Guard (`leitstand-purpose-registry.bats` T1) durchsucht
`components/leitstand/**/*.svelte` rekursiv und verlangt für **jede** dort gefundene Datei einen
Registry-Eintrag. Deshalb legt dieser Partial **ausschließlich** die fünf oben genannten Dateien
unter `components/leitstand/` an — keine weiteren Helfer-`.svelte`-Dateien in diesem Baum (auch
nicht für die neue OpenSpec-Suche in DeckWissen), sonst entsteht ein Registry-Eintrag, den p1
nicht kennt. Die zwölf reaktivierten Karten selbst liegen außerhalb dieses Baums
(`sdlc/factory/`, `sdlc/`, `cockpit/`) und sind vom Guard nicht erfasst.

**Kontrakt B — `leitstand-url.ts` (p1s Datei, hier nur konsumiert):** `toLeitstandQuery` liefert
**ohne** führendes `?`, Feldreihenfolge `station, ticket, deck`, leere Selektion → `''`. Gültige
Deck-IDs: `qualitaet`, `plattform`, `ki`, `wissen`. `parseLeitstandQuery` wirft nie; unbekannte
Werte werden zu `undefined`. DeckLeiste baut die URL deshalb defensiv:
`window.location.pathname + (qs ? '?' + qs : '')` — kein Split/Ersetzen eines evtl. vorhandenen
führenden `?` nötig, weil Kontrakt B keins liefert.

**Kontrakt C — Zonen-testid:** Z5s Wrapper trägt `data-testid="leitstand-deck-leiste"` (p3 hat
das bereits in `scripts/sdlc-cockpit-smoke.mjs` verdrahtet: `page.locator('[data-testid="leitstand-deck-leiste"]').count()`).
Das ist **nicht** derselbe String wie der Registry-Key `deck-leiste` — zwei getrennte
Namensräume (Registry-Key vs. DOM-testid), beide bindend, beide exakt so zu setzen.

## Kartenzuordnung je Deck (design.md § Zonen-Vertrag Z5, aufgelöst)

| Deck | Karten (Re-Import, unverändert) | Datenquelle je Karte (bleibt D12/D13-konform, unangetastet) |
|---|---|---|
| **Qualität** (`DeckQualitaet.svelte`) | `sdlc/GoalsDashboard.svelte` | `lib/sdlc/goals-data.ts` (statisch generiert) |
| **Plattform** (`DeckPlattform.svelte`) | `sdlc/factory/ControlPanel.svelte` (bündelt intern die 7 Toggle-Karten + `StatusStrip`), `sdlc/factory/KostenTab.svelte` (bündelt intern `FactoryObservability` + `FactoryBudgetPage`, die wiederum `FactoryKpiCard` zieht) | `/sdlc/api/factory-control` (PATCH), `/sdlc/api/factory-budget*`/Prometheus |
| **KI** (`DeckKi.svelte`) | `sdlc/factory/LlmProxyPanel.svelte`, `sdlc/factory/KiRoutingPanel.svelte`, `sdlc/factory/FactoryModelSlots.svelte`, `cockpit/DispatchLogPanel.svelte`, `sdlc/factory/InsightsTab.svelte` | `/sdlc/api/llm-proxy/*`, `/sdlc/api/ki/*`, `/sdlc/api/factory-model-slots`, `window.data`-Adapter (Dispatch-Stream), `floorStore`/`getSharedMetrics` |
| **Wissen** (`DeckWissen.svelte`) | API-Katalog-Kachel (neu, statischer Import von `data/api-inventory.json`), OpenSpec-Suche (neu, `GET /sdlc/api/openspec/search`) | statischer Build-Artefakt (E2) + bestehender Such-Endpunkt |

**Reorganisation gegenüber `DevStatusTabs`:** im alten Tab "Steuerung" standen `ControlPanel`,
`FactoryModelSlots`, `KiRoutingPanel`, `LlmProxyPanel` nebeneinander. Design.md trennt das jetzt
fachlich: `FactoryModelSlots`/`KiRoutingPanel`/`LlmProxyPanel` wandern ins KI-Deck,
`ControlPanel` bleibt mit den Kosten-/Observability-Karten im Plattform-Deck. Das ist eine
bewusste Neuzuordnung nach Zweck (Betriebsparameter vs. KI-Provider-/Modell-Verwaltung), keine
1:1-Portierung des alten Tabs — wird hier festgehalten, damit ein Reviewer die Verschiebung nicht
für einen Fehler hält.

## Befund 1 — keine Karte braucht einen von `DevStatusTabs` ererbten Pflicht-Prop

Geprüft: `ControlPanel`, `KillSwitchCard`…`LavishDelegationCard`, `StatusStrip`, `KostenTab`,
`FactoryObservability`, `FactoryBudgetPage`, `FactoryKpiCard`, `LlmProxyPanel`, `KiRoutingPanel`,
`FactoryModelSlots`, `InsightsTab`, `GoalsDashboard` — jede dieser Karten lädt ihre Daten
ausschließlich selbst per `onMount`/eigenem `fetch()` bzw. `getSharedMetrics()`; `DevStatusTabs`
reichte an keine von ihnen einen Prop durch (nur `PlanningOffice` bekam `{brand}`, das nicht Teil
dieses Partials ist). Einzige Ausnahme: `DispatchLogPanel` hat `export let initial: DispatchHead[]
= []` — optional, mit sinnvollem Default (siehe Befund 2). **Ergebnis: kein Deck-Container muss
einen Karten-Prop setzen; alle Imports sind parameterlos.** Damit entfällt die im Auftrag
vorgesehene "Karten-Anpassung über Deck-Props" ersatzlos — es gibt hier nichts zu verdrahten
außer dem Import selbst.

## Befund 2 — `DispatchLogPanel`s SSR-`initial` wird bewusst nicht durchgereicht

Das aktuelle `cockpit.astro` übergibt `dispatchInitial` (serverseitig vorab geladen) direkt an
`DispatchLogPanel`. Nach dem Umbau ist `DispatchLogPanel` nur noch sichtbar, wenn Z5 das
KI-Deck zeigt — ein serverseitiger Pre-Fetch wäre in den drei anderen Fällen verschwendet, und
welches Deck initial aktiv ist, hängt vom `?deck=`-Query-Param ab (Kontrakt B, p1). Deshalb
verzichtet `DeckKi.svelte` auf einen `initial`-Prop und nutzt `DispatchLogPanel`s eigenen
Leer-Default; die Komponente lädt beim eigenen `onMount` nach (`if (items.length === 0) void
reload();`, bereits vorhandenes Verhalten der Karte). Das kostet nur dann einen zusätzlichen
Client-Roundtrip, wenn `deck=ki` tatsächlich initial aktiv ist — kein Regressionsrisiko, keine
Prop-Änderung an `DispatchLogPanel.svelte` nötig. Optional für p1: falls das initiale
`dispatchInitial` weiterhin serverseitig geladen wird, kann `cockpit.astro` es undokumentiert
ungenutzt lassen oder streichen — außerhalb der `target_files` dieses Partials, hier nur als
Hinweis vermerkt.

## Befund 3 — OpenSpec-Suche in `DeckWissen` nutzt direkten `fetch()`, nicht den K1-Adapter

`openspec/specs/sdlc-cockpit.md` Requirement "Daten-Adapter — Kein direkter fetch() aus Panels"
deckt sechs benannte Domänen ab (Tickets, Agents, CI, Cluster, Factory, Modelle) über
`window.data` (K1-Kit, siehe `DispatchLogPanel`s Kommentarkopf). OpenSpec-Suche ist eine siebte,
dort nicht genannte Domäne. Alle acht wiederverwendeten Karten in Plattform/KI/Qualität rufen
ohnehin bereits direkt `/sdlc/api/*` auf (eigenes, älteres Subsystem, laut design.md als
INVARIANT/unangetastet klassifiziert) — die neue Such-Kachel folgt demselben, bereits etablierten
Muster ihrer Geschwister-Karten im selben Deck, statt eine achte Adapter-Domäne für eine einzige
Kachel neu einzuführen. `GET /sdlc/api/openspec/search?q=…` existiert bereits
(`components/website/src/pages/sdlc/api/openspec/search.ts`, liefert `{ query, results }` mit
`results: OpenspecHit[]` = `{ slug, ticket_id, section_title, file_type, snippet, similarity }`,
oder `{ error }` bei Fehler — D13-konform).

## Schritte

- [ ] **Task 1 — `components/website/src/components/leitstand/decks/DeckQualitaet.svelte`
      anlegen.** Reiner Re-Export: importiert `../../../sdlc/GoalsDashboard.svelte` und rendert
      es ohne Props in einem Wrapper `<section class="deck-qualitaet" data-testid="deck-panel-qualitaet">`.
      Kein State, kein Fetch — die Karte ist vollständig selbstständig (Befund 1). `<style>`
      begrenzt sich auf Innenabstand (`padding: var(--ls-space-6, 1.5rem)`), damit das Deck
      optisch zur Statusband/Achse passt, ohne `GoalsDashboard`s eigenes Markup zu verändern.
      `data-testid="deck-panel-qualitaet"` ist eine eigene, über Kontrakt C hinausgehende
      Ergänzung (nicht von p3 verlangt, kollidiert nicht mit ihr) — nützlich für spätere
      feingranulare Tests, kein Blocker, wenn p3 sie nicht aufgreift.

- [ ] **Task 2 — `components/website/src/components/leitstand/decks/DeckPlattform.svelte`
      anlegen.** Importiert `../../../sdlc/factory/ControlPanel.svelte` und
      `../../../sdlc/factory/KostenTab.svelte`, rendert beide untereinander in
      `<section class="deck-plattform" data-testid="deck-panel-plattform">` mit einer
      `<h3>`-Zwischenüberschrift vor `KostenTab` ("Kosten & Observability"), damit die visuelle
      Trennung zwischen Steuerungs-Karten und Kennzahlen erhalten bleibt (im alten `DevStatusTabs`
      lagen sie auf getrennten Tabs). Kein State, keine Props — beide Karten laden sich selbst.

- [ ] **Task 3 — `components/website/src/components/leitstand/decks/DeckKi.svelte` anlegen.**
      Importiert `../../../sdlc/factory/LlmProxyPanel.svelte`,
      `../../../sdlc/factory/KiRoutingPanel.svelte`,
      `../../../sdlc/factory/FactoryModelSlots.svelte`, `../../../cockpit/DispatchLogPanel.svelte`,
      `../../../sdlc/factory/InsightsTab.svelte`. Rendert alle fünf vertikal gestapelt in
      `<section class="deck-ki" data-testid="deck-panel-ki">`, je eine `<h3>`-Zwischenüberschrift
      ("LLM-Proxy", "KI-Routing", "Modell-Slots", "Dispatch-Mitschnitt", "Insights") — keine
      Unter-Tabs (YAGNI, design.md hält an keiner Stelle eine Sub-Navigation für Deck-Inhalte
      fest, und keine der fünf Karten pollt im Hintergrund, siehe D11-Analyse unten). Erfüllt
      damit auch das ADDED Requirement "Insights-Tab mit Trace-Recording" (Zugang zur
      Insights-Ansicht aus dem KI-Deck). `DispatchLogPanel` **ohne** `initial`-Prop (Befund 2).

- [ ] **Task 4 — `components/website/src/components/leitstand/decks/DeckWissen.svelte`
      anlegen** (einzige Deck-Datei mit eigenem Script-Inhalt statt reinem Re-Export).

  Statischer Import: `import apiInventory from '../../../../data/api-inventory.json';` — Pfad
  ist vier Ebenen aus `leitstand/decks/` heraus (`decks` → `leitstand` → `components` → `src` →
  `data`). Typisierung ohne `any` (CQ02):
  ```ts
  interface ApiRoute {
    path: string; file: string; methods: string[]; backend: string[];
    description: string | null; tier: string | null; deprecated: string | null;
  }
  interface ApiInventory { routes: ApiRoute[]; mcpServers: unknown[]; factoryTools: unknown[] }
  const inventory = apiInventory as ApiInventory;
  const routeCount = inventory.routes.length;
  const byBackend = inventory.routes.reduce<Record<string, number>>((acc, r) => {
    for (const b of r.backend) acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  const PREVIEW_LIMIT = 8;
  const preview = inventory.routes.slice(0, PREVIEW_LIMIT);
  ```
  Kachel zeigt: Gesamtzahl (`routeCount`), Backend-Aufschlüsselung (`byBackend` als kleine
  Chip-Liste), eine Vorschautabelle der ersten `PREVIEW_LIMIT` Routen (`path`, `methods.join(',
  ')`, `backend.join(', ')`) und einen erklärenden Hinweis „Vollständiger, filterbarer Katalog
  folgt in E4" — **statische Vorstufe**, kein eigener API-Aufruf für diesen Teil (der Import ist
  Build-Zeit, kein Runtime-Fetch, also ohnehin außerhalb der Adapter-Frage aus Befund 3).

  OpenSpec-Suche darunter, eigener `$state`-Block:
  ```ts
  interface OpenspecHit {
    slug: string; ticket_id: string | null; section_title: string | null;
    file_type: string | null; snippet: string; similarity: number;
  }
  let query = $state('');
  let results = $state<OpenspecHit[] | null>(null);
  let searchError = $state<string | null>(null);
  let searching = $state(false);

  async function search() {
    const q = query.trim();
    if (q.length < 2) { searchError = 'Mindestens 2 Zeichen.'; results = null; return; }
    searching = true;
    searchError = null;
    try {
      const res = await fetch(`/sdlc/api/openspec/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      if (!res.ok || body.error) { searchError = body.error ?? `HTTP ${res.status}`; results = null; return; }
      results = body.results ?? [];
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Suche fehlgeschlagen';
      results = null;
    } finally {
      searching = false;
    }
  }
  ```
  Markup: `<input>` + Submit-Button (`onsubmit|preventDefault={search}` auf einem `<form>`),
  Ergebnisliste zeigt `slug`, `ticket_id` (oder `—` wenn `null`, D13-Stil — kein stiller
  Leerwert), `section_title`, `snippet` (gekürzt via CSS `-webkit-line-clamp` statt
  JS-Truncation, um `similarity` nicht zu verlieren), `similarity` als Prozent
  (`Math.round(similarity * 100)}%`). Bei `searchError` ein sichtbarer Fehlertext statt einer
  leeren Liste (D13 — kein stiller Ersatzwert). Root-Element
  `<section class="deck-wissen" data-testid="deck-panel-wissen">`.

  Kein `any`, kein direkter Import weiterer `.svelte`-Dateien unter `components/leitstand/`
  (Kontrakt A — siehe oben).

- [ ] **Task 5 — `components/website/src/components/leitstand/DeckLeiste.svelte` anlegen** (der
      Z5-Umschalter selbst; letzter Deck-Task, weil er die vier vorherigen importiert).

  ```ts
  import { parseLeitstandQuery, toLeitstandQuery } from '../../lib/sdlc/leitstand-url';
  import DeckQualitaet from './decks/DeckQualitaet.svelte';
  import DeckPlattform from './decks/DeckPlattform.svelte';
  import DeckKi from './decks/DeckKi.svelte';
  import DeckWissen from './decks/DeckWissen.svelte';

  type DeckId = 'qualitaet' | 'plattform' | 'ki' | 'wissen';
  const DECKS: { id: DeckId; label: string }[] = [
    { id: 'qualitaet', label: 'Qualität' },
    { id: 'plattform', label: 'Plattform' },
    { id: 'ki',        label: 'KI' },
    { id: 'wissen',    label: 'Wissen' },
  ];
  const DEFAULT_DECK: DeckId = 'qualitaet';
  const isDeckId = (v: string | undefined): v is DeckId =>
    v === 'qualitaet' || v === 'plattform' || v === 'ki' || v === 'wissen';

  let { initialDeck }: { initialDeck?: string } = $props();
  let active = $state<DeckId>(isDeckId(initialDeck) ? initialDeck : DEFAULT_DECK);

  function pushDeck(next: DeckId) {
    active = next;
    const current = parseLeitstandQuery(new URLSearchParams(window.location.search));
    const qs = toLeitstandQuery({ ...current, deck: next });
    const url = window.location.pathname + (qs ? `?${qs}` : '');
    history.pushState({}, '', url);
  }

  onMount(() => {
    window.addEventListener('popstate', () => {
      const sel = parseLeitstandQuery(new URLSearchParams(window.location.search));
      active = isDeckId(sel.deck) ? sel.deck : DEFAULT_DECK;
    });
  });
  ```
  Markup: `<nav class="deck-leiste" data-testid="leitstand-deck-leiste">` (Kontrakt C — exakt
  dieser String, nicht `deck-leiste`) mit vier Umschalt-Buttons
  (`data-testid="deck-switch-{id}"`, `aria-pressed={active === id}`, `onclick={() =>
  pushDeck(id)}`), darunter genau ein aktives Deck via `{#if active === 'qualitaet'}<DeckQualitaet
  />{:else if …}…{/if}` — die drei inaktiven Decks werden **nicht** gemountet (kein `{#if}`-Block
  bleibt im DOM hängen), wodurch keine ihrer `onMount`-Fetches feuert. Das ist die vollständige
  D11-Erfüllung für dieses Partial: keine der zwölf Karten pollt per `setInterval` (verifiziert,
  siehe unten), „kein Polling unsichtbarer Panels" reduziert sich hier auf „kein Mount
  unsichtbarer Panels", was die `{#if}`-Kette bereits liefert — kein zusätzlicher
  `document.hidden`-Wächter nötig, weil es kein wiederkehrendes Polling gibt, das man pausieren
  müsste.

  Styling ausschließlich über `var(--ls-*, <Fallback>)` (z. B.
  `background: var(--ls-surface-base, #0e1117)`) mit inline gesetztem Fallback-Wert, damit die
  Zone auch dann korrekt aussieht, wenn `sdlc-leitstand.css` aus irgendeinem Grund noch nicht
  geladen ist (p1 bindet die Datei in `cockpit.astro` ein — dieser Partial verlässt sich nicht
  stillschweigend darauf).

- [ ] **Task 6 — `components/website/src/components/DevStatusTabs.svelte` löschen.** Die Datei
      hat aktuell **keinen** Importer mehr im Quellbaum (`/dev-status` ist bereits ein
      permanenter 301-Redirect auf `/admin/cockpit`, T001433/T002531 — die Komponente ist toter
      Code, kein aktiver Konsument existiert). Löschen ohne Ersatz.

      ```bash
      git rm components/website/src/components/DevStatusTabs.svelte
      ```

- [ ] **Task 7 — lokale Absicherung vor Übergabe** (informell, kein Ersatz für p3s
      `leitstand-purpose-registry.bats`/Smoke-Erweiterung — die tragen das mandatory Gate).

      ```bash
      # Kein Panel unter den fünf neuen Dateien pollt im Hintergrund (D11-Argument oben) —
      # Positiv-Anker: der Kandidatensatz ist nicht leer, bevor die Abwesenheit geprüft wird.
      files="components/website/src/components/sdlc/factory/ControlPanel.svelte
      components/website/src/components/sdlc/factory/KostenTab.svelte
      components/website/src/components/sdlc/factory/LlmProxyPanel.svelte
      components/website/src/components/sdlc/factory/KiRoutingPanel.svelte
      components/website/src/components/sdlc/factory/FactoryModelSlots.svelte
      components/website/src/components/cockpit/DispatchLogPanel.svelte
      components/website/src/components/sdlc/factory/InsightsTab.svelte
      components/website/src/components/sdlc/GoalsDashboard.svelte"
      count=$(echo "$files" | wc -l); echo "Anker: geprüfte Karten=$count"
      [ "$count" -eq 8 ]
      ! grep -l 'setInterval' $files
      # Kontrakt C: der neue Zonen-testid ist im Quelltext vorhanden.
      grep -qF 'leitstand-deck-leiste' components/website/src/components/leitstand/DeckLeiste.svelte
      # Kein zusätzlicher .svelte-Importer unter components/leitstand/ außer den fünf geplanten.
      find components/website/src/components/leitstand -name '*.svelte' | wc -l   # erwartet: 5
      # CQ02: keine neuen any-Typen.
      grep -rn ': any\|<any>\|as any' components/website/src/components/leitstand | wc -l   # erwartet: 0
      ```

<!-- vitest: kein neuer Test nötig, weil dieser Partial ausschließlich bestehende, bereits
     abgedeckte Karten neu verdrahtet und keine neue Logik in lib/** oder pages/api/** einführt;
     DeckWissen.svelte enthält zwar neuen Script-Code (Aggregation + Suche), das ist aber
     UI-Komposition ohne exportierte Funktion — die einzige neue Fach-Logik (leitstand-url.ts)
     liegt in p1 und trägt dort ihre eigene Vitest-Pflicht laut plan-quality-gates.md. Abdeckung
     für dieses Partial läuft über tasks.d/p3-tests.md: die Registry-Vollständigkeits-Guard
     (BATS) und die Smoke-Erweiterung (testid-Präsenz) sind die für Svelte-Komposition
     angemessene Prüfebene. -->

## Purpose-Registry — Übergabe-Liste für p1

p1 besitzt `leitstand-purpose-registry.ts` und trägt diese fünf Einträge ein (Keys exakt nach
Kontrakt A oben). Alle `zweck`-Strings sind gegen die restlichen p1-Einträge (`statusband`,
`attention`, `achse`, `kontextzone`, …) auf Eindeutigkeit zu prüfen — hier so formuliert, dass
keine Überschneidung mit den in design.md genannten Zonen-Zwecken entsteht:

```ts
'deck-leiste': {
  zweck: 'Schaltet zwischen den vier Nebendomänen-Decks (Qualität/Plattform/KI/Wissen) um, ohne Z1–Z4 zu beeinflussen.',
  datenquelle: 'URL-Query ?deck= via leitstand-url.ts (parseLeitstandQuery/toLeitstandQuery)',
  aktionen: ['deck-wechsel (history.pushState, kein Reload)'],
},
'deck-qualitaet': {
  zweck: 'Zeigt Health-Goals und Qualitäts-Gates der Codebasis (ehemals /sdlc/repohealth).',
  datenquelle: 'lib/sdlc/goals-data.ts (statisch generierte Health-Goal-Werte)',
  aktionen: [],
},
'deck-plattform': {
  zweck: 'Steuert Factory-Betriebsparameter (Kill-Switch, Dry-Run, Slot-/Tages-Caps, Kontext-Budget, Spawn-Harness, Lavish-Delegation) und zeigt Kosten-/Observability-Kennzahlen.',
  datenquelle: '/sdlc/api/factory-control, /sdlc/api/factory-budget*, Prometheus (via FactoryObservability/FactoryBudgetPage/KostenTab)',
  aktionen: ['factory-control PATCH (7 Steuerungsfelder)'],
},
'deck-ki': {
  zweck: 'Verwaltet LLM-Proxy-Backends und KI-Routing-Provider, zeigt Modell-Slot-Belegung, Dispatch-Mitschnitt und Agenten-Insights.',
  datenquelle: '/sdlc/api/llm-proxy/*, /sdlc/api/ki/*, /sdlc/api/factory-model-slots, window.data-Adapter (Dispatch-Stream), floorStore/getSharedMetrics (Insights)',
  aktionen: ['llm-proxy reload/backend enable-disable', 'ki-provider create/update/delete', 'model-slot re-assign'],
},
'deck-wissen': {
  zweck: 'Zeigt den API-Endpunkt-Katalog als statische Vorstufe (volle Katalog-UI folgt in E4) und erlaubt Volltextsuche über OpenSpec-Changes.',
  datenquelle: 'data/api-inventory.json (statischer E2-Build-Artefakt), GET /sdlc/api/openspec/search',
  aktionen: [],
},
```

Falls p1 einen der `zweck`-Texte gegen einen eigenen Z1–Z4-Eintrag kollidieren sieht: der Text
gehört zu p2, p1 justiert dann seinen EIGENEN Eintrag, nicht diesen — sonst driftet die
Übergabe-Liste hier von der tatsächlich implementierten Registry ab.

## Koordination mit p3 (bereits committet, nicht Teil dieses Partials)

`tasks.d/p3-tests.md` legt Kontrakt A/B/C bereits verbindlich fest (siehe oben) und ergänzt
`scripts/sdlc-cockpit-smoke.mjs` um eine Prüfung auf `[data-testid="leitstand-deck-leiste"]`.
Dieser Partial hält sich exakt an beide Vorgaben (Registry-Key-Ableitung, DOM-testid-String) —
keine Abweichung, kein Vorschlag einer alternativen Form. Die zusätzlichen
`data-testid="deck-panel-<id>"`/`deck-switch-<id>"`-Attribute aus den Tasks oben sind eine
freiwillige Ergänzung dieses Partials, nicht Teil von Kontrakt C — p3 kann sie aufgreifen, muss
aber nicht.

## Index-Konflikt (melden, nicht fixen)

`tests/spec/pipeline-interface.bats` (SSOT `openspec/specs/pipeline-interface.md`) enthält
Test `"D7.2: DevStatusTabs prefers the URL tab over localStorage"`
(`grep -q "urlTab" "components/website/src/components/DevStatusTabs.svelte"`). Diese Datei ist
**in keinem** der drei Partials (p1/p2/p3) als `target_files` gelistet, wird aber durch Task 6
dieses Partials gelöscht — der Test bricht danach mit „Datei nicht gefunden" statt einem echten
Assertion-Fehlschlag. Weder p1 noch p2 noch p3 haben diese `.bats`-Datei in ihren `target_files`;
der Index-Plan (`tasks.md`) muss vor der Ausführung entweder `tests/spec/pipeline-interface.bats`
einem Partial zuweisen (Entfernen der D7.2-Zeile, die anderen sechs Assertions bleiben gültig)
oder diesen Konflikt anderweitig auflösen. Dieser Partial nimmt die Datei **nicht** eigenmächtig
in seine `target_files` auf (außerhalb des erteilten Auftrags) — reine Meldung.

## Abgrenzung

Keine Änderung an einer der zwölf reaktivierten Kartendateien selbst, an `cockpit.astro`, an
`leitstand-url.ts`/`leitstand-purpose-registry.ts`/`leitstand-metrics.ts` (p1), an
`tests/spec/pipeline-interface.bats` (siehe Index-Konflikt oben) und keine neue
K1-Adapter-Domäne. Die drei mandatory Verify-Commands (`task test:changed`, `task
freshness:regenerate`, `task freshness:check`) stehen im Index-Plan `tasks.md` und in
`tasks.d/p3-tests.md` — hier nicht dupliziert.
