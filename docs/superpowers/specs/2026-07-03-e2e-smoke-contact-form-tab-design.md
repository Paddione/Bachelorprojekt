---
ticket_id: T001564
plan_ref: openspec/changes/t001564-e2e-smoke/tasks.md
status: active
date: 2026-07-03
---

# Design: E2E-Smoke Kontaktformular-Tab stabilisieren

## Goals

1. FA-10 T5/T6 laufen grün gegen web.mentolder.de
2. Der Tab "Nachricht" ist per Playwright zuverlässig klickbar
3. Die Lösung ist entweder ein Test-Fix (robusterer Selektor) oder ein Component-Fix (accessibility/hydration)

## Non-Goals

- Kein Redesign des ContactHub/der Kontaktseite
- Keine Änderung des Formular-Verhaltens
- Keine neuen E2E-Tests (nur bestehende reparieren)

## Root-Cause-Hypothesen

### H1: Accessible-Name-Computation

`page.getByRole('tab', { name: /Nachricht/i })` matcht gegen den computed accessible name.
Der button-Element mit role="tab" hat `type="button"` und keinen expliziten `aria-label`.
Der accessible name wird aus dem Text-Content der child-spans berechnet: "02 — Nachricht Eine Frage stellen. ..."

**Mögliches Problem:** Wenn Playwrights accessible-name-Computation vom Browser abweicht
oder der `/Nachricht/i`-Regex die Kombination "02 — Nachricht" nicht matched.

**Lösung:** data-testid-Attribut auf dem Tab-Button verwenden oder aria-label hinzufügen.

### H2: Hydration-Timing

`waitForHydration()` wartet auf alle `astro-island[ssr]`-Elemente. Wenn die Navigation
oder der Sidekick länger brauchen, könnten sie die 8s-Timeout überschreiten.

**Mögliches Problem:** waitForFunction wirft Timeout → Test schlägt fehl, bevor es zum
Tab-Klick kommt. Oder: das ContactHub-Island hydriert, aber der Svelte-5-onclick-
Handler ist noch nicht aktiv.

**Lösung:** Statt globalem waitForHydration auf das ContactHub-Island-spezifische
`[ssr]`-Attribut warten, oder Hydration-Indikator-Klasse beobachten.

### H3: Svelte-5-onclick-Kompatibilität

`onclick={() => (activeMode = 'message')}` in Svelte 5 (Runes-Mode) verwendet
die neue Event-Handler-Syntax. Nach der Hydration wird der Handler per `addEventListener`
angebunden.

**Mögliches Problem:** Der Handler wird in bestimmten Edge-Cases nicht korrekt
angebunden (z.B. wenn die Component-Props sich während der Hydration ändern).

**Lösung:** Auf data-testid umstellen und mit dispatchEvent testen, ggf.
`on:click|preventDefault` (Svelte 4 compat) als Fallback.

### H4: Zeitgeber im CI

Der CI-Runner kann unter Last langsamer sein. Der Test hat `test.setTimeout(120000)` in T2
aber nicht in T5/T6 (der Default 30s aus playwright.pr.config.ts gilt).

**Mögliches Problem:** 30s reichen nicht auf dem CI-Runner für Page-Load + Hydration +
Tab-Klick + Formular-Erwartung auf web.mentolder.de.

**Lösung:** Timeout in T5/T6 auf 60s erhöhen.

## Entscheidungen

1. **Diagnose zuerst:** CI-Artifakte (trace.json) analysieren, bevor ein Fix gewählt wird.
2. **Minimaler Eingriff:** Bevorzugt Test-Selektor anpassen (data-testid), nicht Component-Struktur ändern.
3. **Regression sichern:** Alle anderen FA-10-Tests und der korczewski-home.spec.ts (der auch "Nachricht"-Tab nutzt) müssen grün bleiben.

## Subsysteme

- `tests/e2e/specs/fa-10-website.spec.ts` — der rote Test
- `website/src/components/ContactHub.svelte` — die Komponente mit role="tab"
- `website/src/pages/kontakt.astro` — Seite, die ContactHub einbindet
