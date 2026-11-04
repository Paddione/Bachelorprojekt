---
ticket_id: null
plan_ref: null
status: active
date: 2026-11-04
---

# Design: fix/e2e-mentolder-nightly-11 — Brainstorming-Entscheidungen

Stand: 2026-11-04. Evidenz: Run 41815883961 (404 passed / 11 failed), Live-Probes gegen `https://web.mentolder.de` (UP, <130 ms),
Code-Evidenz auf `main` @ `1a8c2909d` (read-only Explore). Kein offenes Goal verlinkt (E2E bekommt per dev-flow-plan 0.5 kein eigenes Goal).

## D1 — RED-Test: die 11 Playwright-Specs (Abweichung vom pytest-RED begründet)
Fix-Pfad verlangt rot→grün. Ein pytest-RED ist hier nicht möglich: Das SUT ist live Prod, `tests/py/spec/`
deckt keines der drei Verhalten ab (Billing nur purge-Guards, Booking nur Struktur-Asserts auf `main`-Code,
a11y nur Playwright-Ebene — Explore belegt). pytest gegen Prod wäre Konventionsbruch.
Daher RED = die bereits roten Specs, nightly belegt:
`fa-21-billing.spec.ts` (3), `fa-16-booking.spec.ts` T6 (1), `mentolder-web-smoke.spec.ts` (6),
`fa-24-whiteboard.spec.ts` T-axe (1). Jede impl-Partial startet mit lokalem RED-Lauf (`expected: FAIL`).

## D2 — Billing (H1: stale Tests, nicht Produkt-Bug)
Live antwortete zur Nightly-Zeit `400 klientId fehlt` (vor Auth → T3 bekam 400 statt 401, PR-A 400 statt 201);
aktuell antwortet live wieder 401 wie `main`. In beiden Fällen gilt: **Prod läuft/lief Code, der nicht auf
`main` steht** (`klientId`/`Klientenakte` hat 0 Treffer im Produkt-Code, nur UX-Copy im Fehlertext).
Die Test-Seite ist stale: `billing.ts` sendet kein `klientId`, T3/PR-A kennen den Klientenakte-Flow nicht.
Zusatzbefund: T3 testet `/api/billing/…` (Stripe), der Helper `/api/admin/billing/…` (nativ) — zwei Pipelines,
ein Spec-File. Entscheidung: Specs + Helper auf Klientenakte-Flow heben (Feld-Shape aus Discovery, P1);
401-vs-400-Ordering folgt live (aktuell Auth-zuerst = 401, passend zu Handler auf `main`).
Kein Produkt-Fix auf `main` in dieser Partial — der Produkt-Change lebt außerhalb des Repos.

## D3 — Booking T6 (H1: stale Test)
Live verlangt neu serverseitig AGB-Bestätigung (`400 „Bitte bestätigen Sie die AGB."`) vor den 409-Slot-Checks;
der String existiert nicht auf `main`, kein Client sendet das Feld. `main`-Handler gäbe weiter 409.
Entscheidung: T6-Payload um das AGB-Feld erweitern (exakter Name aus Discovery, P1). Kein Handler-Change.

## D4 — Smoke-Specs retiren (Suite-Entscheidung, kein Produkt-Fix möglich)
`mentolder-web-smoke.spec.ts` testet `react.mentolder.de` — dessen Quelle (`components/mentolder-web/`) wurde
am 01.11. per #7055 (Markentrennung) von `main` gelöscht; es gibt nichts zu fixen. Die 6 Failures sind echte
Befunde gegen ein totes Artefakt. Entscheidung: **Spec-File löschen + `testMatch`-Eintrag in
`playwright.config.ts` entfernen**. Korrespondiert mit brand-trennung (korczewski-only); kein Restore der SPA.
`a11y-axe.spec.ts` (Astro, brand-geroutet) bleibt unangetastet.

## D5 — Whiteboard T-axe ausnehmen (Upstream, kein In-Repo-Fix)
T-axe läuft gegen den Nextcloud-Whiteboard-Collaboration-Server (Upstream-Image); im Repo liegt nur
`apps/whiteboard/app.yaml`. axe-Criticals im Upstream-UI kann dieser Fix nicht patchen.
Entscheidung: T-axe per Kommentar + Tag vom Nightly-Gate ausnehmen (oder Board-Image pinnen, falls Ops das
will — als Alternative im Partial vermerkt, Default: exempt). Kein Produkt-Code-Change.

## D6 — Verify ohne Prod-Schäden
Impl-Partials verifizieren per gezieltem `npx playwright test <spec>` (schreibt wie nightly Testdaten auf
Prod — etabliertes Muster, kein neuer Schaden). Finaler Gate-Lauf ist die nächste Nightly (G-E2E01);
der Plan schließt mit `task test:changed` + Freshness (`generated_artifacts: true`).

## Verworfene Alternativen
- Produkt-Fix auf `main` für Billing/Booking: kein abweichender Handler auf `main` gefunden — nichts zu fixen.
- SPA restaurieren: widerspricht #7055 Eigner-Entscheidung.
- pytest-RED gegen live Prod: Konventionsbruch, kein Mehrwert gegenüber den bereits roten Specs.
