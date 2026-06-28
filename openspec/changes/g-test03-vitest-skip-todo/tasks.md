---
title: "G-TEST03: Vitest skip/todo-Suiten aufräumen (3→0)"
ticket_id: T001287
domains: ["tests","website"]
status: plan_staged
---

# g-test03-vitest-skip-todo — Implementation Plan

## File Structure

| File | Status |
|------|--------|
| `website/src/lib/factory-floor.order.test.ts` | Changed |

## Task 0: Baseline messen (RED)

- [x] Measure-Command ausführen:
  ```bash
  grep -rnE "(describe|it|test)\.(skip|todo)\b" website/src --include="*.ts" --include="*.svelte" | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//" | wc -l
  ```
  expected: FAIL (aktueller Wert: 3 — drei `it.todo` in `website/src/lib/factory-floor.order.test.ts`, Zeilen 71–73; Ziel: 0 nicht-ausgeführte Test-Direktiven)

## Task 1: TABS-Reihenfolge-Assertion implementieren

Die erste `it.todo` testet, ob `MobileTabBar.TABS` die korrekte Schlüssel-Reihenfolge hat — abgeleitet von `PIPELINE_LANES` und `PHASE_ORDER`, genau wie es `MobileTabBar.svelte` zur Laufzeit berechnet.

- [x] Import von `TABS` aus `../../components/factory/MobileTabBar.svelte` am Anfang von `factory-floor.order.test.ts` ergänzen:
  ```ts
  import { TABS, MOBILE_COL_INDEX } from '../components/factory/MobileTabBar.svelte';
  ```
- [x] Import von `PHASE_ORDER` aus `./factory-floor-types` ergänzen:
  ```ts
  import { PHASE_ORDER } from './factory-floor-types';
  ```
- [x] `it.todo('SP4: MobileTabBar.TABS order matches the SSOT-derived lane/phase order')` ersetzen durch:
  ```ts
  it('SP4: MobileTabBar.TABS order matches the SSOT-derived lane/phase order', () => {
    const linearLanes = PIPELINE_LANES.filter(l => !l.side && l.key !== 'planning');
    const keyMap: Record<string, string> = { loadingDock: 'backlog', qa: 'qs', shipped: 'done' };
    const expectedKeys = linearLanes.flatMap(l =>
      l.key === 'hall'
        ? [...PHASE_ORDER]
        : [keyMap[l.key] || l.key]
    );
    expect(TABS.map(t => t.key)).toEqual(expectedKeys);
  });
  ```

## Task 2: MOBILE_COL_INDEX-Konsistenz-Assertion implementieren

Die zweite `it.todo` prüft, ob `MOBILE_COL_INDEX` eine konsistente Rückwärts-Abbildung von `TABS` ist.

- [x] `it.todo('SP4: MOBILE_COL_INDEX order matches the SSOT-derived lane/phase order')` ersetzen durch:
  ```ts
  it('SP4: MOBILE_COL_INDEX order matches the SSOT-derived lane/phase order', () => {
    for (let i = 0; i < TABS.length; i++) {
      expect(MOBILE_COL_INDEX[TABS[i].key]).toBe(i);
    }
    expect(Object.keys(MOBILE_COL_INDEX)).toHaveLength(TABS.length);
  });
  ```

## Task 3: FactoryFloor-Makrolane-DOM-Reihenfolge-Assertion implementieren

Die dritte `it.todo` enkodiert die Invariante, dass in `PIPELINE_LANES` die Lane mit `key === 'qa'` vor der Lane mit `key === 'shipped'` steht — exakt die Reihenfolge, die das `FactoryFloor.svelte`-Template im DOM hartcodiert.

- [x] `it.todo('SP4: FactoryFloor macro-lane DOM order matches PIPELINE_LANES (qa before done)')` ersetzen durch:
  ```ts
  it('SP4: FactoryFloor macro-lane DOM order matches PIPELINE_LANES (qa before done)', () => {
    const nonSide = PIPELINE_LANES.filter(l => !l.side);
    const qaIdx = nonSide.findIndex(l => l.key === 'qa');
    const shippedIdx = nonSide.findIndex(l => l.key === 'shipped');
    expect(qaIdx).toBeGreaterThanOrEqual(0);
    expect(shippedIdx).toBeGreaterThanOrEqual(0);
    expect(qaIdx).toBeLessThan(shippedIdx);
  });
  ```

## Task 4: Lokale Verifikation der neuen Tests

- [x] Tests im `components`-Projekt lokal ausführen:
  ```bash
  cd website && pnpm vitest run --project=components src/lib/factory-floor.order.test.ts
  ```
  Erwartetes Ergebnis: alle 9 Tests bestehen, 0 skipped, 0 todo.
- [x] Measure-Command erneut ausführen:
  ```bash
  grep -rnE "(describe|it|test)\.(skip|todo)\b" website/src --include="*.ts" --include="*.svelte" | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//" | wc -l
  ```
  Erwartetes Ergebnis: `0`

## Task 5 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-TEST03` → Ziel-Status grün
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
