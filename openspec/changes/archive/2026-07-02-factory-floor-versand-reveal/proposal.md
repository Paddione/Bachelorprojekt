## Why

Die Factory-Floor-Homepage zeigt aktuell ein Provider-Status-Widget (LLM-Provider-Telemetrie) und in
der Versand-Spalte permanent Ticketnummer + Titel für jedes fertige Ticket. Beides soll aufgeräumt
werden: das Provider-Status-Widget ist Betriebs-Telemetrie ohne Mehrwert für die öffentliche
Factory-Floor-Ansicht, und die Versand-Spalte soll kompakter werden (nur Ticketnummer sichtbar,
Titel erst auf Klick).

## What Changes

- Entfernen des Provider-Status-Widgets (`website/src/components/ProviderStatus.svelte`) aus der
  Factory-Floor-Homepage — Komponente wird gelöscht (keine anderen Konsumenten), das
  `data-testid="floor-provider-status"`-Element existiert danach nicht mehr. **BREAKING** für
  E2E-Selektoren, die dieses Testid referenzieren (keine gefunden, siehe Impact).
- Umbau der Versand-Spalte (`website/src/components/factory/ShippedColumn.svelte`): Titel ist
  standardmäßig ausgeblendet, Klick auf die Ticketnummer togglet die Sichtbarkeit des Titels für
  genau dieses Ticket (unabhängiger Zustand pro Ticket, kein Accordion). Der bisherige Klick-Pfad
  (Link zur Ticket-Übersicht via `ticketUrl`, Öffnen der Detail-Modal via `onOpenDetail`) entfällt
  in dieser Spalte vollständig. **BREAKING** für das bisherige Klick-Verhalten in dieser Spalte.
- relTime-Badge und PR-Badge bleiben unverändert immer sichtbar.

## Capabilities

### New Capabilities

(keine)

### Modified Capabilities

- `software-factory`: Requirement "FA-SF: Factory Floor Hallendarstellung" ändert sich in zwei
  Punkten: (1) das `data-testid="floor-provider-status"`-Element wird aus der Floor-UI entfernt
  (die testid-Liste "SHALL remain unchanged" gilt weiterhin für die dort explizit genannten
  Landmarken — `floor-provider-status` wird explizit als entfernt dokumentiert); (2) die Versand-
  Spalte erhält ein neues, abweichendes Klick-Verhalten (Titel-Toggle statt Detail-Panel/Ticket-
  Link) — die bestehende Detail-Panel-Klick-Scenario bezieht sich auf `floor-workpiece` (Hall) und
  bleibt unberührt.

## Impact

- Betroffene Dateien: `website/src/components/FactoryFloor.svelte`,
  `website/src/components/ProviderStatus.svelte` (gelöscht),
  `website/src/components/factory/ShippedColumn.svelte`.
- Keine DB-/API-Schema-Änderung. Die Server-Query `providerHealth` in
  `website/src/lib/factory-floor.ts` bleibt bestehen (weiterhin genutzt von `AttentionStrip`).
- E2E-Test `tests/e2e/specs/fa-factory-floor.spec.ts` prüft nur `floor-shipped`-Sichtbarkeit,
  referenziert weder `floor-provider-status` noch das bisherige Shipped-Klick-Verhalten — kein
  Konflikt gefunden.
- Design-Referenz: `docs/superpowers/specs/2026-07-02-factory-floor-versand-reveal-design.md`.
