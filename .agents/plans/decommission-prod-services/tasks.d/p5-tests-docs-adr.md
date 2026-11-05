# p5 — E2E-Specs, Registry-Doku, ADR (hängt von p4 ab)

Ziel: Tests/Doku nachziehen, sobald der Code weg ist (Spec-Edits erst nach Code-Entfernung).

## Löschen

- `tests/e2e/specs/fa-24-whiteboard.spec.ts`
- `tests/local/FA-24.sh`

## Editieren

- `tests/e2e/playwright.config.ts`: `fa-24-*.spec.ts`-Eintrag (Z. ~161) streichen.
- `tests/e2e/specs/app-catalog.spec.ts`: Whiteboard-Card-Block (Z. ~26–36) streichen; falls die
  Spec danach leer/ziellos ist, Spec als Ganzes entfernen.
- `docs/agent-guide/registry/components.yaml`: `nextcloud`- und `nextcloud-talk-hpb`-Slugs
  (Z. ~28, ~64) entfernen; abhängige Querverweise prüfen.

## Neu: ADR

- `docs/adr/ADR-0xx-decommission-prod-services.md` anlegen: Entscheid (Eigner 2026-11-05),
  Umfang (Dienste + Dateien), Nicht-Ziele (DB-Schema, Archive), Verifikation (Abwesenheit
  auf devmesh/k3d/k3s-dev, Fleet-Abbau 2026-10-22). Nummer = nächste freie ADR-Nummer.

## Verify dieses Partials

Playwright-Config parst (`npx playwright test --list` ohne fa-24); Registry-YAML parst;
ADR liegt unter `docs/adr/` mit freier Nummer.
