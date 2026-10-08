---
title: "cookie-contrast — Cookie-Banner Text-Kontrast auf AA"
ticket_id: T901370
domains: [website, a11y]
status: active
---

# cookie-contrast — Implementation Plan

## File Structure

- `components/website/src/components/CookieConsent.svelte`: fix, Banner-Texte auf AA-sicheren hellen Ton.
- `tests/spec/cookie-consent.bats`: RED-Guard T901370-1, bereits im Stage-Commit enthalten.
- `components/website/src/data/test-inventory.json`: generiert, Inventar für die neue Test-ID.

## Zweck

Der Cookie-Banner rendert Text in text-muted (#8c96a3) auf dunklem Grund
(#4a4438) — Kontrast 3.22 statt 4.5 (axe serious, alle Brands). Der Fix
stellt die Banner-Texte auf einen AA-sicheren hellen Ton um. Hue-neutral,
kein Re-Design, keine Bildsprachen-Änderung.

## Scope and evidence

Work only in `.worktrees/cookie-contrast` on `fix/cookie-contrast-T901370`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.

Triage, Symptom und Ursache getrennt: Symptom ist FA-65 A1 rot auf
/leistungen, /faq, /ueber-mich (intermittierend auch /) mit
color-contrast serious am Details-Button des Banners. Ursache: text-muted
auf dunklem Banner-Grund (3.22). Der Banner erscheint erst nach
Client-Hydration (onMount), daher flackert der Befund in Scans.
Evidenz: FA-65-Prod-Lauf, AxeBuilder-Node-Probe (Target, Werte),
Browser-Element-Identifikation.

Scope: nur CookieConsent.svelte. Keine Theme-Farbänderung (nur diese
Komponente liest den neuen Ton).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-banner-tone.md | impl | `components/website/src/components/CookieConsent.svelte` |  |
| p2 | tasks.d/p2-tests.md | tests | `tests/spec/cookie-consent.bats`, `components/website/src/data/test-inventory.json` | p1 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst** (`tasks.d/p2-tests.md`
  Schritt 1): Guard gegen den ungefixten Stand laufen lassen, Rot beobachten.
  Erst danach beginnt Partial p1.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-banner-tone.md`): Ton
  umstellen. Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-tests.md`): Guard grün
  beweisen, FA-65-Verhaltensprobe, Inventar regenerieren und mitcommitten.
  Verify pro Partial-Plan.
- [ ] **3. Abschluss-Verifikation.** Im Worktree ausführen:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein.
