# Proposal: sdlc-leitstand-e4-livedaten

## Why

Etappe E4 des Leitstand-Epics (T007553, Design:
`docs/superpowers/specs/2026-08-15-sdlc-leitstand-design.md` §S6/S8). Die E3-Shell (T007957)
liefert Zonen, Decks und purpose-Registry als Struktur — aber drei dokumentierte Lücken bleiben
offen: `observability.astro` zeigt hartcodierte Fake-Uptimes ohne Datenquelle und ohne
Auth-Guard, die DORA-/Delivery-Auswertung ist verwaiste UI (`DeliveryHistory.svelte` hängt nur
am toten `DevStatusTabs`, das E3 löscht), und der Factory-Floor-SSE-Stream
(`pages/sdlc/api/factory-floor/stream.ts`) pollt per `setInterval`, obwohl der
`cockpit-listen-hub` (LISTEN/NOTIFY) existiert. Zusätzlich wird das in E2 erzeugte
`api-inventory.json` (1781 Zeilen, Drift-Gate aktiv) noch von keiner UI konsumiert.

## What

1. **Plattform-Deck live:** `DeckPlattform.svelte` speist sich aus echten Quellen
   (`FactoryObservability.svelte` remounten, K8s-Status über bestehende `/sdlc/api/`-Routen);
   `observability.astro` stirbt und redirectet via `middleware/redirect-map.ts` auf
   `/sdlc/cockpit?deck=plattform`. Verwaiste Reste (`KostenTab.svelte`) fallen weg.
2. **DORA-KPIs in der Kontextzone:** neues `KpiGrid.svelte` als Leerlauf-Zustand der Z4,
   gespeist aus `/sdlc/api/delivery-metrics` über Aggregations-Extrakt
   `lib/sdlc/leitstand-kpi.ts`; `DeliveryHistory.svelte` (verwaist) wird gelöscht.
3. **LISTEN statt Poll:** `factory-floor/stream.ts` abonniert den `cockpit-listen-hub`;
   der `refreshMs`-Fallback-Poll bleibt nur für den Fall fehlender PG-NOTIFY-Verbindung.
4. **API-Katalog-UI im Wissen-Deck:** `ApiKatalog.svelte` liest `api-inventory.json`
   (Suche, Gruppierung nach Pfadpräfix, Methoden-Badges, Backend-Kennzeichnung) plus
   Live-Health-Punkt für die vier HTTP-MCPs über eine neue server-seitige Route
   `/sdlc/api/mcp-health`.

Unangetastet: Adapter-Muster, `fetchedAt` + explizites `error`-Feld (D12/D13), fail-soft pro
Sektion, Schreibaktionen nur via Website-Admin-API, Build-Target-Isolation (ADR-006).

## Abhängigkeiten

Baut auf E2 (T007559, done) und E3 (T007957, `blocked_by`-Link gesetzt) auf — die
Deck-/Kontextzonen-Dateien entstehen erst mit dem E3-Merge; dieser Plan wird danach ausgeführt.

_Ticket: T008016_
