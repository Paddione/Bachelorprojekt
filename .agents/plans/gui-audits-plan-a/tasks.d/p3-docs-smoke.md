# p3 — docs Minimal-Suite (`docs-smoke.spec.ts`, neu)

## Ziel
Neue Spec `tests/e2e/specs/docs-smoke.spec.ts` (≈ 60 Zeilen): je Docs-Seite
`GET → 200`, kein `undefined`/`NaN`/`[object Object]` im sichtbaren Text
(Muster aus fa-66), interne Links (`<a href^="/">`) ohne 404 (per `request.head`
oder `fetch`, max. 20 Links/Seite — Deckel gegen Laufzeit-Explosion).

## Offene Erkundung (Executor, klein halten)
- Wo Docs-Seiten wohnen (Website-Routen? `docs/`? legacy-html?) und ihre
  kanonische Routenliste — Quelle im Code suchen (`public-routes.json`?
  Sidebar-Config?), Liste IN der Spec als Konstante (kein neues Config-File).
- Basis-URL per `WEBSITE_URL`-Muster (Default lokal `http://localhost:4321`,
  Override live erlaubt, kein Auth).
- Registrierung: EINE Zeile in `tests/e2e/playwright.local.config.ts`
  (Website-Projekt-`testMatch`, alphabetisch einsortiert). Haupt-Config NICHT
  anfassen (kein Nightly-Scope-Creep).

## Gates
- `npx playwright test docs-smoke --config playwright.local.config.ts`
  grün gegen lokalen Dev-Server; Befunde → B3 (Folge-PR).
