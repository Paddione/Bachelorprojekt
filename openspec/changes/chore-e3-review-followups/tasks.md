---
slug: chore-e3-review-followups
ticket: T008721
status: active
---

# Chore: E3-Review-Follow-ups

## Problem

Follow-ups aus dem E3-Review (T007957, PR #4674) — von Review/Minors, bewusst nicht im E3-PR gelöst.

## Tasks

### Task 1: fa-58 E2E-Anpassung

`tests/e2e/specs/fa-58-admin-cockpit.spec.ts` assertet Heading "SDLC Cockpit" + `#panel-pipeline` auf `/sdlc/cockpit` bzw. die tote Route `/admin/tickets`. Der E3-Leitstand trägt jetzt title "SDLC Leitstand" (cockpit.astro Z.33).

**Optionen:**
- Assertions auf den neuen Titel / die Zonen-testids umstellen
- Tests ersatzlos entfernen mit Begründung (dev-flow-e2e-Pass)

Empfehlung: Assertions anpassen (Low effort, bewahrt Testabdeckung).

### Task 2: leitstand-metrics.ts verdrahten oder entfernen

`src/lib/sdlc/leitstand-metrics.ts` ist aktuell nur vitest-abgedeckt, kein Produktions-Import. E4-Entscheidung: Z1-Statusband-Livedaten kommen erst mit E4-Observability.

**Optionen:**
- Datei belassen (E4 wartet)
- Datei entfernen (YAGNI)

Empfehlung: Belassen — E4 wird sie brauchen.

**Entscheidung (T008721):** Belassen. Header-Kommentar in `leitstand-metrics.ts`
dokumentiert: kein Produktions-Import bis E4-Observability die Z1-Statusband-
Livedaten verdrahtet; vitest-Test bleibt der einzige Konsument.

### Task 3: Async-Races beheben

DetailPanel-$effect-Fetch und DeckWissen-OpenSpec-Suche ohne AbortController — out-of-order-Auflösung bei schneller Selektion.

**Fix:** One-Liner-Pattern nachrüsten:
```typescript
const controller = new AbortController();
// ... fetch mit signal: controller.signal
return () => controller.abort();
```

## Acceptance Criteria

- [x] fa-58 Assertions passen neuen Titel "SDLC Leitstand"
- [x] Async-Races mit AbortController behoben
- [x] leitstand-metrics.ts Entscheidung dokumentiert
