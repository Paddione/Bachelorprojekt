# Proposal: fix/e2e-mentolder-nightly-11 — Nightly E2E (mentolder) 14/14 rot, 11 failing Specs

## Symptom (Fakt, verifiziert 2026-11-04)
- `e2e.yml` / Job `mentolder` (Playwright gegen live `https://web.mentolder.de`): 14/14 Läufe rot (27.10.–04.11., alle auf `main`, täglich 03:00 UTC).
- Test-Ebene: **404 passed / 11 failed** (Run 41815883961, 04.11.). Die Suite ist zu ~97 % grün — der Run ist rot, nicht das Produkt als Ganzes.
- Live-Site ist UP (alle Kernrouten 200 in <130 ms, OIDC-Discovery am Auth-Host 200). Kein Outage.
- Setup-Auffälligkeit: `POST /sdlc/api/systemtest/purge-all-test-data → 403 „Test-Schnittstellen sind auf diesem Server gesperrt"` — Test-Isolation auf Prod deaktiviert (erwartbar, aber dokumentiert).

## Die 11 Failures (Run-Summary 04.11.)
| # | Spec | Verdacht |
|---|------|----------|
| 1–3 | `fa-21-billing` T3 + 2× PR-A Invoice-Lifecycle | API verlangt jetzt `klientId` („Rechnungen gibt es nur noch aus der Klientenakte") → 400 statt erwartet 401/201. Tests rufen alten Flow ohne `klientId`. Produkt-Change mit intentionaler UX-Copy → **Test stale?** (Offen: 401-vs-400-Ordering in T3.) |
| 4 | `fa-16-booking` T6 | Non-whitelisted Slot → erwartet 409, bekommt anderes. API-Verhalten geändert? |
| 5–11 | `mentolder-web-smoke` (Overflow `/`, axe critical/serious auf `/`, `/leistungen`, `/kontakt`, `/impressum`, `/barrierefreiheit`) + `fa-24-whiteboard` T-axe | Echte Frontend-Regressionen auf Prod (horizontaler Overflow, axe-Criticals). **Produkt-Befunde**, keine Test-Artefakte. |

## Hypothesen-Trennung (T002448-M5)
- Beobachtet: 11 rote Specs, stabile Live-Site, 403 im Test-Setup.
- Hypothese H1 (stale Tests): Billing/Booking-Specs kennen das aktuelle API-Verhalten nicht → Plan: Specs + Helper (`tests/e2e/helpers/billing.ts`) auf `klientId`-Flow heben.
- Hypothese H2 (echte Regressionen): a11y/Overflow auf 6 Routen + Whiteboard → Plan: Produkt-Fix in `apps/mentolder-web` (Layout/ARIA), verifiziert durch dieselben Specs.
- Offen bis Explore-Rückmeldung: exakte Handler-Dateien, Change-Zeitpunkte (`git log` auf Routen/Layouts), 401-vs-400-Ordering, pytest-Coverage unter `tests/py/spec/` für RED-Test-Platzierung.

## Scope / Nicht-Ziele
- Scope: 11 rote Specs grün, ohne die 404 grünen zu brechen. Kein Infra-Umbau (SVC/INF-Goals sind separat stale, nicht Teil dieses Fixes).
- Nicht-Ziel: `korczewski`-Matrix (quarantäniert, eigener Vorgang), Test-Setup-403 (Prod-Sperre ist Policy, kein Bug).
- RED-Test: primär die 11 Playwright-Specs (bereits rot, nightly belegt). pytest-RED nur dort, wo `tests/py/spec/` das betroffene Verhalten lokal abdeckt (Explore klärt) — kein pytest gegen live Prod.

## Nächste Schritte (Fix-Pfad)
Worktree `fix/e2e-mentolder-nightly-11` → claim → Brainstorming (H1 vs H2 pro Cluster, mit Explore-Evidenz) → `design.md` → RED-Test-Festlegung → `tasks.md` (Partials pro Cluster) → plan-lint → Commit+Push → STOPP (Übergabe an dev-flow-execute).
