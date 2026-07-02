---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-02
---

# Factory Floor: Provider-Status entfernen & Versand-Ticket-Reveal

## Kontext

Auf der Factory-Floor-Homepage (`website/src/components/FactoryFloor.svelte`) gibt es
zwei Elemente, die überarbeitet werden sollen:

1. Das **Provider-Status-Widget** (`website/src/components/ProviderStatus.svelte`),
   das LLM-Provider-Telemetrie (aktive Agents, Cooldowns, Modelle) anzeigt.
2. Die **Versand-Spalte** (`website/src/components/factory/ShippedColumn.svelte`),
   die aktuell pro Ticket Ticketnummer, Titel, relativen Zeit-Badge und optional
   einen PR-Badge zeigt.

## Anforderungen

### 1. Provider-Status-Widget entfernen

- Entfernen der Anzeige aus der Factory-Floor-Homepage: Import (`FactoryFloor.svelte:16`)
  und Rendering (`FactoryFloor.svelte:188`) löschen.
- `ProviderStatus.svelte` hat keine anderen Konsumenten im Repo (verifiziert per Grep)
  und wird nach dem Entfernen der Verwendung zu totem Code → Datei löschen.
- Die zugrundeliegende Server-Query `providerHealth` in `website/src/lib/factory-floor.ts`
  bleibt bestehen — sie wird weiterhin serverseitig für `buildAttention()` /
  `AttentionStrip`-Cooldown-Chips benötigt (unabhängig vom entfernten Widget).

### 2. Versand-Spalte: Ticketnummer-only mit Klick-Reveal

Aktueller Zustand (`ShippedColumn.svelte`): jede Zeile zeigt permanent Ticketnummer
(als Link zur Ticket-Übersicht, `ticketUrl`), Titel (als Button, öffnet über
`onOpenDetail` die Phasen-Timeline/Detail-Modal), relativen Zeit-Badge (`relTime`)
und optional einen PR-Badge (`prUrl`).

Neuer Zustand:

- **Ruhezustand:** Zeile zeigt nur die Ticketnummer, den Zeit-Badge (`relTime`) und
  den PR-Badge (falls vorhanden) — unverändert zur bisherigen Darstellung dieser
  beiden Elemente. Der Titel ist ausgeblendet.
- **Klick-Verhalten:** Klick auf die Ticketnummer togglet die Sichtbarkeit des
  Titels für *dieses* Ticket. Kein Aufruf von `onOpenDetail` mehr in dieser Spalte
  — die bisherige Detail-Modal-Öffnung entfällt für die Versand-Spalte.
- **Toggle-Modell:** Unabhängiger Zustand pro Ticket (kein Accordion). Mehrere
  Tickets können ihren Titel gleichzeitig eingeblendet haben. State: lokales
  `Set<string>` der offenen `extId`s in `ShippedColumn.svelte` (Svelte 5 `$state`).
- **Klick-Ziel-Kollision:** Die Ticketnummer ist aktuell ein `<a href={ticketUrl(extId)}>`
  zur externen Ticket-Übersicht. Dieser Link wird durch einen `<button>` ersetzt,
  der ausschließlich das Titel-Reveal togglet. Der Link zur Ticket-Übersicht entfällt
  in der Versand-Spalte vollständig (kein zusätzliches Icon/Klick-Ziel).

### 3. Aufräumen ungenutzter Props

Nach den obigen Änderungen werden zwei Props von `ShippedColumn.svelte` ungenutzt:

- `onOpenDetail` — nicht mehr aufgerufen (siehe oben).
- `ticketUrl` — nur für den entfernten `<a href>`-Link gebraucht.

Beide Props werden aus der `$props()`-Typsignatur von `ShippedColumn.svelte` entfernt.
Der Pass-through beim `<ShippedColumn>`-Aufruf in `FactoryFloor.svelte` (aktuell
Zeilen ~247-254: `onOpenDetail={openDetail}` und `{ticketUrl}`) wird entsprechend
gestrichen. `StagedColumn.svelte` und dessen `onOpenDetail`-Wiring bleiben
unverändert — beide Komponenten sind unabhängig voneinander.

## Nicht-Ziele

- Keine Änderung an `AttentionStrip.svelte`, `BudgetPanel.svelte` oder
  `FactoryBudgetPage.svelte` — diese zeigen Provider-Informationen in anderem
  Kontext (Cooldown-Chips, Budget-Aufschlüsselung) und sind von dieser Änderung
  nicht betroffen.
- Keine Änderung an der Server-Query/Datenstruktur (`factory-floor.ts`,
  `factory-floor-types.ts`) — nur Presentation-Layer-Änderungen.
- Keine Änderung am Verhalten der `StagedColumn` oder anderer Spalten.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `website/src/components/FactoryFloor.svelte` | Import + Rendering von `ProviderStatus` entfernen; `onOpenDetail`/`ticketUrl`-Pass-through beim `<ShippedColumn>`-Aufruf entfernen |
| `website/src/components/ProviderStatus.svelte` | Datei löschen (verwaist) |
| `website/src/components/factory/ShippedColumn.svelte` | Toggle-State einführen, Titel-Rendering bedingt machen, Ticketnummer-Link zu Toggle-Button umbauen, `onOpenDetail`/`ticketUrl`-Props entfernen |

## Tests

Bestehende Tests für `ShippedColumn`/`FactoryFloor` (falls vorhanden, z.B.
`website/src/lib/factory-floor.test.ts` oder Playwright-Specs unter
`tests/spec/`, sofern sie `floor-shipped` / `floor-provider-status`
(`data-testid`) referenzieren) müssen auf das neue Verhalten angepasst werden.
Der Plan-Subagent prüft dies explizit anhand des Plan Intel Bundle
(`impact_files`).

## Risiken

- Gering: reine Presentation-Layer-Änderung ohne DB-/API-Schema-Auswirkung.
- Zu prüfen: ob bestehende Playwright-E2E-Tests auf `data-testid="floor-shipped-item"`
  o.ä. mit fixen Selektoren (z.B. Klick auf `<a>`) arbeiten, die durch den
  Button-Umbau brechen könnten.
