---
title: "tel-link-a11y-t901448 — Massage Telefon-Links Axe-Fix"
ticket_id: T901448
domains: [website, massage]
status: staged
---

# tel-link-a11y-t901448 — Implementation Plan

## File Structure

- `components/website/src/pages/index.astro`: `.mg-fallback a` bekommt Unterstreichung als Nicht-Farb-Merkmal.
- `components/website/src/pages/leistungen.astro`: `.mg-note a` bekommt dieselbe Regel.

## Budgets

| `components/website/src/pages/index.astro` | 432 | 568 |
| `components/website/src/pages/leistungen.astro` | 266 | 734 |

Beide Dateien sind nicht-baselined, wirksam ist das statische Limit. Keine Datei liegt über achtzig Prozent ihrer Schwelle, kein Split nötig.

## Zweck

Seit T901429 echte Telefonnummern rendern, fallen die Massage-Seiten `/` und `/leistungen` im Axe-Lauf mit `link-in-text-block (serious)` — die `tel:`-Links im Fließtext („Lieber anrufen? …") tragen nur `color: var(--brass-2)` ohne Nicht-Farb-Merkmal. Der Fix gibt beiden Stellen eine sichtbare Unterstreichung und prüft den `--brass-2`-Kontrast gegen den Seitenhintergrund.

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst.** Pilot-Instanz aus dem Worktree starten (`BRAND/BRAND_ID/BRAND_NAME=massage`, `SESSIONS_DATABASE_URL` auf lokales docker-Postgres mit `brands`+`massage` und `inbox_items`-Minimal-DDL, `CRON_SECRET=e2e-pilot-secret`, Fenster für +2/+3/+4 seeden), dann:
  ```bash
  cd tests/e2e && SKIP_DB_PURGE=1 WEBSITE_URL=http://localhost:PORT A11Y_ROUTES='/, /leistungen' ./node_modules/.bin/playwright test specs/a11y-axe.spec.ts --project website
  ```
  Ergebnis vor dem Fix: expected: FAIL (`link-in-text-block (serious) x1` auf `/` und auf `/leistungen`, je der `tel:`-Link). Erst danach beginnt Task 1.
- [ ] **1. Unterstreichung für Telefon-Links im Fließtext.** In `index.astro` die Regel `.mg-fallback a` um `text-decoration: underline` plus `text-underline-offset: 2px` erweitern; in `leistungen.astro` die Regel `.mg-note a` identisch erweitern. Keine anderen Selektoren anfassen, keine Layout-Änderung.
- [ ] **2. Kontrast von `--brass-2` prüfen.** Den gerenderten Link-Farbwert gegen den tatsächlichen Seitenhintergrund messen (Axe-Regel `color-contrast`, Beitrag des Links). Liegt der Link-Text unter 4.5:1 zum Hintergrund, die Link-Farbe in beiden Regeln auf einen dunkleren Bestandswert aus der Palette ziehen (kein neuer Farbwert erfinden). Bleibt der Kontrast grün, keine Farbänderung.
- [ ] **3. Grün-Phase.** Denselben Axe-Lauf aus Task 0 wiederholen: `/` und `/leistungen` müssen je 0 critical/serious melden. Zusätzlich `fa-62`, `fa-63`, `fa-64` gegen die Pilot-Instanz laufen lassen (Regressionsschutz, alle grün erwartet).
- [ ] **4. Abschluss-Verifikation.** Im Worktree ausführen: `task test:changed`, `task freshness:regenerate`, `task freshness:check`. Alle drei müssen grün sein (bekannt pre-existing rot und zu ignorieren: genau die vier Fehler in `notifications.test.ts`, `planning-office.test.ts`, `llm-proxy/status.test.ts`).
