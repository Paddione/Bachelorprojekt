# Proposal: e2e-hydration-timeout

## Why

FA-10 T5/T6 (Kontaktformular) scheitern konsistent mit `waitForHydration()`-Timeout
auf `web.mentolder.de`. Das Problem wurde in **T001748 (#2715)** testseitig adressiert
(Tablist-basierter Wait statt globalem `astro-island[ssr]`-Wait, Timeouts von 8 s
auf 15 s erhöht) — dennoch treten die Failures weiterhin auf, reproduziert in PR #2737
(Run 29104527737) **und** im nightly e2e.yml (Run 29100595050, 2026-07-10T14:38) der
kein Code-Changes enthält. Das bestätigt: es ist ein **pre-existing Live-Site-Problem**
mit der Astro-Hydration, kein Test-Flake und kein PR-spezifischer Regression.

Die Seite `/kontakt` enthält vier `client:load`-Inseln (Navigation, CookieConsent,
PortalSidekick, ContactHub). Der PortalSidekick öffnet WebSocket-/log-bus-Abhängigkeiten
und die `agent-guide-harness` Patches — wenn eine dieser Inseln auf dem Live-Server
nicht hydratet (fehlerhaftes JS-Bundle, 404 auf Chunk, Syntax-Error in prod-Build),
liegt `astro-island[ssr]` ewig im DOM.

**Laut T001785-Beschreibung:** Site selbst liefert HTTP 200 in <1 s, das Problem
liegt im Client-JS. Discord-Console-Logs vom Live-Server (via `agent-guide-harness`)
sind nötig, um zu sehen, ob ein Chunk 404'd, ein Import scheitert oder ein
Runtime-Error in einer Insel die gesamte Hydration blockiert.

## What

1. **Diagnose Phase:** Via Browser-Konsole (Playwright) oder `agent-guide-harness`
   die clientseitigen Console-/Network-Errors auf `web.mentolder.de/kontakt` erfassen.
   Ziel: feststellen, WELCHE Insel nicht hydratet und WARUM.
2. **Fix Phase (abhängig von Diagnose):**
   - Option A: Fehlerhaftes JS-Bundle → Astro-Build-Konfiguration prüfen, Chunk-Splitting
     anpassen, fehlende Importe ergänzen.
   - Option B: Runtime-Error in einer shared Dependency (Sidekick, agent-guide-harness) →
     isolieren und fixen.
   - Option C: CSP/Network-Restriktion blockiert JS-Chunk → Helmet-Header/CSP anpassen.
   - Option D: Astro-Island SSR-Attribut wird nie entfernt, weil eine Insel vor der
     Hydration crasht → Error-Boundary in die Insel einbauen.
3. **Verifikation:** 10×-Stabilitätslauf von T5/T6 gegen `web.mentolder.de` nach Fix.
4. **Regression:** T1–T4, T7 müssen weiterhin grün bleiben.

**Out of scope:**
- Umbau von `client:load` auf `client:idle`/`client:visible` (eigenständige Optimierung)
- Entfernen oder Deaktivieren der Tests
- Korczewski-Brand (separater Follow-up falls nötig)

## Impact

- **Test-Datei (geändert):** `tests/e2e/specs/fa-10-website.spec.ts` — ggf. Debug-Ausgaben
  oder resilienteren Wait.
- **Website-Dateien (möglicherweise):** `website/src/layouts/Layout.astro`,
  `website/src/components/PortalSidekick.svelte`, `website/src/components/ContactHub.svelte`,
  Astro-Build-Config oder agent-guide-harness — abhängig von Diagnose.
- **CI-Workflows:** keine Änderung an `.github/workflows/e2e-pr.yml` oder `e2e.yml`.
