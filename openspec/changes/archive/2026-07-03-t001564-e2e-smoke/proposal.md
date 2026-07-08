## Why

Der E2E-Smoke-Test FA-10 T5/T6 gegen web.mentolder.de ist rot. Der Test klickt auf den Tab "02 — Nachricht" im ContactHub (role="tab", accessible name /Nachricht/i) und erwartet danach sichtbare Formularfelder (combobox, textboxes). Die Fehlermeldung lautet sinngemäß, dass der Tab "Nachricht" nicht erreichbar ist — Playwright findet oder interagiert nicht mit dem Tab-Element.

Die SSR-Seite rendert alle drei Tabs korrekt (Termin/Nachricht/Rückruf). Der Tab "02 — Nachricht" ist im DOM sichtbar. Die Ursache liegt entweder im Hydration-Timing (Client-load vs. Playwright-Action), in der Accessible-Name-Computation (role="tab" auf button-Element), oder im `activeMode`-Initialisierungs-Edge-Case.

Betroffen: `@smoke`-Tag, d.h. dieser Test läuft bei jedem PR auf main und blockiert den E2E-Green-Gate.

## What Changes

1. **Diagnose**: Konkrete Error-Message aus den CI-Artifakten extrahieren (Trace/JSON/Log).
2. **Fix**: Je nach Diagnose entweder:
   - `waitForHydration`-Timeout erhöhen oder auf Hydration des ContactHub-spezifischen Islands warten
   - Oder Tab-Selektor robuster machen (data-testid oder aria-label)
   - Oder Komponenten-Fix (activeMode-Init, Svelte-5-onclick-Kompatibilität)
3. **Failing-Test-Sanity**: Vor dem Fix sicherstellen, dass der Test den Bug reproduziert.
4. **Verifikation**: Nach dem Fix läuft der Test grün gegen web.mentolder.de.

## Capabilities

### New Capabilities

- `fix-e2e-smoke-contact-tab`: Stabilisiert den FA-10 Smoke-Test durch robustere Tab-Interaktion im ContactHub.

### Modified Capabilities

- `website/kontakt` — möglicherweise ContactHub.svelte (aria/role/data-testid)
- `tests/e2e/specs/fa-10-website.spec.ts` — möglicherweise Test-Selektor oder Hydration-Warte-Logik

## Impact

- `website/src/components/ContactHub.svelte` — möglicherweise ARIA-Attribut oder data-testid
- `tests/e2e/specs/fa-10-website.spec.ts` — möglicherweise Test-Selektor oder Timeout
- `tests/e2e/specs/fa-admin-inbox.spec.ts` — könnte ebenfalls Tab-Selektor verwenden (prüfen)
- CI-Gate: `@smoke`-Tests müssen grün sein

Ticket: T001564
