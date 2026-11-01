# GUI-Audit-Evidenz — Staffel A (Plan `gui-audits-plan-a`)

Goal `frontend-domain-ssot`, Kriterium 6, Staffel A: Website-Beleg + sdlc/brett-axe
+ docs-Smoke. Messumgebung (B2): Website-Belege gegen live
(`https://web.mentolder.de`, öffentliche Routen, read-only, kein Auth);
sdlc/brett/docs gegen lokale Dev-Server bzw. deren öffentlich erreichbare
Dienst-URLs. Screenshots liegen dem PR als Anhang bei, nicht im Repo.

Commit-Stand der Belegläufe: `541f08c8d` (p3-Stand; fa-66/fa-24-Änderungen aus
p1/p2 bereits enthalten).

## Website (live, `https://web.mentolder.de`)

| Suite | Befehl | Ergebnis | Beleg |
|---|---|---|---|
| axe Kern-Routen (`a11y-axe`, 4 Tests) | `WEBSITE_URL=https://web.mentolder.de npx playwright test a11y-axe --config playwright.local.config.ts --project=website` | **grün** (4 passed, 2× hintereinander) | Erstlauf 4 failed war Infra-Flake (fehlende `chromium_headless_shell`-Binary, per `npx playwright install chromium` behoben) — siehe `phase-events.log` (`baseline-a11y-live`) |
| docs-smoke (12 Tests) | `WEBSITE_URL=https://web.mentolder.de npx playwright test docs-smoke --config playwright.local.config.ts --project=website` | **grün** (12 passed) | Render-200 + Platzhalter-Smoke + interne Links ≤ 20/Seite ohne 404 |
| public pages smoke (13 Tests) | `WEBSITE_URL=https://web.mentolder.de npx playwright test fa-public-pages --config playwright.local.config.ts --project=website` | **grün** (13 passed) | Smoke-Anteil der Website-Projekt-Suite |
| Lighthouse (`lighthouserc.json`) | `lhci autorun --collect.numberOfRuns=1` mit `CHROME_PATH` auf Playwright-Chromium (lokal, read-only gegen live) | **grün**: Performance **0.96** (≥ 0.9), Accessibility **1.0** (≥ 0.9); nur Warn-Level (network-dependency-tree, render-blocking) | `categories:performance`-, FCP/LCP/CLS/TBT/Speed-Index-Assertions alle bestanden |

## SDLC-Console (lokal, Dev-Server + Wegwerf-DB)

| Suite | Befehl | Ergebnis | Beleg |
|---|---|---|---|
| fa-66 Render-Sweep (T1–T5, Desktop + Mobil) | `SDLC_E2E_URL=http://127.0.0.1:4323 SDLC_E2E_SESSION=<id> npx playwright test fa-66-sdlc-frontend-sweep --config playwright.local.config.ts --project=sdlc-sweep` | **grün** (9/9 Mobil; Desktop-Render-Anteil T1–T5 ebenfalls grün) | Dev-Server `astro dev --port 4323` mit `BUILD_TARGET=sdlc`, Wegwerf-DB in Docker-Container (`postgres:16-alpine`, danach entsorgt), Admin-Session via `scripts/dev-admin-session.mjs` |
| fa-66 T6-axe (p1, Desktop, 9 Routen) | derselbe Lauf | **Befund (B3)**: 9/9 FAIL ausschließlich `color-contrast (serious)` — Admin-Sidebar (3.65:1) + Leitstand-Goal-Cards (2.35–3.75:1 statt 4.5:1) | Kein Trivial-Fix (Dark-Theme-Design-System) → **Folge-PR**, Details in `phase-events.log` (`p1-befund`) + PR-Body |

## Brett / Whiteboard (`https://board.mentolder.de`, Upstream-Container)

| Suite | Befehl | Ergebnis | Beleg |
|---|---|---|---|
| fa-24 T1–T5 | `BOARD_URL=https://board.mentolder.de npx playwright test fa-24-whiteboard` ( Minimal-Config ohne DB-Purge-Hooks) | **grün** (5 passed) | `board.localhost` lokal nicht erreichbar → CI-URL verwendet |
| fa-24 T-axe (p2) | derselbe Lauf | **Befund (B3)**: 2× serious — `document-title` (kein `<title>`), `html-has-lang` (kein `lang`-Attribut); Board-Version **2.0.0** | Upstream-Fremd-UI (Nextcloud Whiteboard), Test bewusst NICHT aufgeweicht → **Folge-Entscheidung**, Details in `phase-events.log` (`p2-befund`, `p2-befund-version`) + PR-Body |

## Docs (lokal + live)

| Suite | Befehl | Ergebnis | Beleg |
|---|---|---|---|
| docs-smoke neu (p3, 12 Content-Routen) | `WEBSITE_URL=http://127.0.0.1:4322 npx playwright test docs-smoke --config playwright.local.config.ts --project=website` (lokaler `astro dev`, danach gestoppt) | **grün** (12 passed) | Liste als Konstante in der Spec (öffentliche Seiten aus `public-routes.json` + `fa-public-pages`), 1 Match-Zeile im `website`-Projekt von `playwright.local.config.ts` (Haupt-Config unangetastet) |
| docs-smoke | derselbe Befehl gegen live | **grün** (12 passed) | siehe Website-Tabelle |

## Folge-Aktionen (Staffel B / Folge-PRs, nicht in diesem Plan)

1. SDLC-Dark-Theme-Kontraste anheben (Admin-Sidebar + Leitstand-Cards auf ≥ 4.5:1) — Befund + Screenshots im PR-Body.
2. Whiteboard-Upstream (`board` 2.0.0): `<title>` + `lang`-Attribut — Upstream-Issue oder eigene Hülle, Entscheidung offen.
3. Plan B (danach): mentolder-web reduzierte Suite (Redirect + Smoke + axe, D4).
