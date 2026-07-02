## Context

Presentation-only Svelte-Änderung an der Factory-Floor-Homepage (`FactoryFloor.svelte`,
`ShippedColumn.svelte`, `ProviderStatus.svelte`). Kein neuer Dienst, keine Datenmodell-Änderung,
keine Migration. Ausführliche Herleitung und abgewogene Alternativen (Toggle-pro-Ticket vs.
Accordion, Klick-Ziel-Kollision mit dem bisherigen `ticketUrl`-Link) stehen bereits im
Brainstorming-Spec: `docs/superpowers/specs/2026-07-02-factory-floor-versand-reveal-design.md`.
Dieses Dokument fasst nur die für die Umsetzung relevanten Entscheidungen zusammen.

## Goals / Non-Goals

**Goals:**
- Provider-Status-Widget vollständig aus der Floor-Homepage entfernen (Komponente + Referenzen).
- Versand-Spalte zeigt im Ruhezustand nur Ticketnummer + relTime-Badge + PR-Badge; Titel erst
  nach Klick, unabhängig pro Ticket.

**Non-Goals:**
- Keine Änderung an `AttentionStrip`, `BudgetPanel`, `FactoryBudgetPage` oder der Server-Query
  `providerHealth` in `factory-floor.ts`.
- Keine Änderung am Hall-/Workpiece-Detail-Panel-Verhalten (`floor-workpiece` → `floor-detail`).
- Keine Änderung an `StagedColumn` oder deren `onOpenDetail`-Wiring.

## Decisions

1. **Toggle-Modell: unabhängiger Zustand pro Ticket** (nicht Accordion). Ein lokales
   `Set<string>` (Svelte 5 `$state`) der offenen `extId`s in `ShippedColumn.svelte`. Einfachster
   State, kein Koordinationsaufwand zwischen Zeilen; User-Entscheidung im Brainstorming bestätigt.
2. **Ticketnummer wird Toggle-Button statt Link.** Der bisherige `<a href={ticketUrl(extId)}>`
   entfällt vollständig zugunsten eines `<button>`, der den Titel-Reveal togglet — vermeidet
   eine Kollision zwischen zwei Klick-Zielen auf demselben Element (User-Entscheidung).
3. **`onOpenDetail` und `ticketUrl` als Props aus `ShippedColumn` entfernen.** Beide werden nach
   den obigen Änderungen ungenutzt; toter Code wird nicht stehen gelassen. Pass-through beim
   `<ShippedColumn>`-Aufruf in `FactoryFloor.svelte` wird gestrichen. `StagedColumn` bleibt
   unabhängig und unverändert.
4. **`ProviderStatus.svelte` löschen statt nur die Verwendung zu entfernen.** Grep bestätigt
   keine anderen Konsumenten — ein toter Datei-Rest wäre unnötiger Ballast.
5. **Server-Query `providerHealth` bleibt unangetastet.** Sie wird serverseitig weiterhin für
   `buildAttention()`/`AttentionStrip`-Cooldown-Chips gebraucht — nur die Client-Darstellung im
   dedizierten Widget entfällt.

## Risks / Trade-offs

- [Risk] `floor-provider-status`-Testid verschwindet, SSOT-Requirement listet Testids mit "…"
  (nicht abschließend) → Mitigation: Delta-Spec dokumentiert die Entfernung explizit als
  Requirement-Änderung (siehe `specs/software-factory.md` in diesem Change).
- [Risk] Bestehende Playwright-Selektoren könnten auf das alte `<a>`-Element oder
  `onOpenDetail`-Verhalten in der Versand-Spalte zielen → Mitigation: verifiziert, dass
  `tests/e2e/specs/fa-factory-floor.spec.ts` nur `floor-shipped`-Sichtbarkeit prüft, kein
  spezifisches Klick-Verhalten der Versand-Zeilen referenziert.
- [Trade-off] Keine Migration/Rollback nötig — reine Presentation-Änderung, revert via normalem
  Git-Revert des PRs möglich.
