---
title: "massage-a11y — Kontrast-Fehler und leere Platzhalter-Links"
ticket_id: T901312
domains: [website, a11y, massage-brand]
status: active
---

# massage-a11y — Implementation Plan

## File Structure

- `components/website/public/brand/massage/colors_and_type.css`: fix, on-brass-Token, color-fg-Leak schließen, Mute abdunkeln.
- `components/website/public/brand/mentolder/colors_and_type.css`: fix, nur on-brass-Token ergänzen (Render-identisch).
- `components/website/src/components/Navigation.svelte`: fix, CTA-Text auf on-brass umstellen.
- `components/website/src/components/CallToAction.svelte`: fix, Primary-Button auf on-brass umstellen.
- `components/website/src/components/Footer.astro`: fix, mailto-Guard, Footer-Heading auf Text-Brass.
- `components/website/src/components/ContactHub.svelte`: fix, mailto-Guard.
- `tests/spec/massage-a11y.bats`: RED-Guards T901312-1..5, bereits im Stage-Commit enthalten.
- `components/website/src/data/test-inventory.json`: generiert, Inventar für die neuen Test-IDs.

## Zweck

axe meldet auf allen fünf Massage-Seiten je zwei serious-Regeln:
color-contrast (Brass-Buttons, Angebots-Headlines, Mute-Texte) und link-name
(leere mailto-Platzhalter). Der Fix führt ein semantisches on-brass-Token ein,
schließt Token-Leaks ins helle Theme, dunkelt Mute-Text auf AA ab und rendert
mailto nur bei nicht-leerer Adresse. Hues bleiben (Ruhige Wärme), nur
Abdunklung und Guards — keine neue Bildsprache.

## Scope and evidence

Work only in `.worktrees/massage-a11y` on `fix/massage-a11y-T901312`.
Base ist origin/main. Der lokale Haupt-Checkout bleibt unangetastet.

Triage, Symptom und Ursache getrennt: Symptom sind FA-65-A1 rot auf allen
Routen (color-contrast + link-name, serious). Ursachen: erstens mappt Massage
--ink-900 auf hell, während Komponenten es als Textfarbe auf Brass lesen
(3.02 statt 4.5); zweitens fehlt --color-fg im Massage-Theme, sodass
global.css helle Mentolder-Textfarbe aufs helle Paper leckt (1.05);
drittens rendern Footer und ContactHub mailto unbedingt (leerer
E-Mail-Platzhalter wird link ohne Text), obwohl die Telefon-Links direkt
daneben Guards haben. Evidenz: FA-65-Lauf, AxeBuilder-Node-Probe mit
Kontrastwerten und Targets, Browser-Kaskadenmessung.

Scope: nur die gelisteten Dateien. Keine Mentolder-Value-Änderung (dort nur
 additives Token mit render-identischem Wert). Farbwerte (Mute-Hex etc.)
 sind bewusst nicht in BATS verankert — Oracle dafür ist FA-65.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-tokens.md | impl | `components/website/public/brand/massage/colors_and_type.css`, `components/website/public/brand/mentolder/colors_and_type.css` |  |
| p2 | tasks.d/p2-components.md | impl | `components/website/src/components/Navigation.svelte`, `components/website/src/components/CallToAction.svelte`, `components/website/src/components/Footer.astro`, `components/website/src/components/ContactHub.svelte` | p1 |
| p3 | tasks.d/p3-tests.md | tests | `tests/spec/massage-a11y.bats`, `components/website/src/data/test-inventory.json` | p1, p2 |

## Tasks

- [ ] **0. Rotphase: Failing-Test-Step zuerst** (`tasks.d/p3-tests.md`
  Schritt 1): Guards gegen den ungefixten Stand laufen lassen, Rot beobachten.
  Erst danach beginnt Partial p1.
- [ ] **1. Partial p1 ausführen** (`tasks.d/p1-tokens.md`): Tokens setzen.
  Verify pro Partial-Plan.
- [ ] **2. Partial p2 ausführen** (`tasks.d/p2-components.md`): Komponenten
  umstellen und Guards setzen. Verify pro Partial-Plan.
- [ ] **3. Partial p3 ausführen** (`tasks.d/p3-tests.md`): Guards grün
  beweisen, FA-65-Verhaltensprobe, Inventar regenerieren und mitcommitten.
  Verify pro Partial-Plan.
- [ ] **4. Abschluss-Verifikation.** Im Worktree ausführen:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Alle drei müssen grün sein.
