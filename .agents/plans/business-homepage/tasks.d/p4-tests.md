---
title: "p4-tests — Guards und Brand-Tests"
ticket_id: T901028
slug: business-homepage
domains: [website, massage-frontend]
status: partial
---

# business-homepage — Implementation Plan

Partial `p4-tests` (Guards + Brand-Tests) zu T901028.
Scope: genau zwei neue Dateien, keine weiteren Dateien einplanen oder ändern.
Stilvorlage BATS: `tests/spec/basic-invoices.bats` (T901027, Cases T901027-1..5).
Akzeptanz-Quelle: T901021 §7 (mobil lesbar, CTA erreichbar, keine
Heilkunde-Claims, Anti-Slop) aus `docs/website/massage-content-design/README.md`.

## File Structure

| Datei | Ist | Budget |
| `tests/spec/business-homepage.bats` | 0 | – (kein S1-Limit für `.bats`) |
| `components/website/src/lib/__tests__/massage-brand.test.ts` | 0 | 900 |

S1-Notizen (verifiziert per `intel.json`, `wc -l`, `gates.yaml`):

- `tests/spec/business-homepage.bats` ist neu (Ist 0). `gates.yaml` → `s1.limits`
  enthält keinen `.bats`-Key, daher greift S1 hier nicht; trotzdem schlank
  schneiden (Ziel unter 250 Zeilen, ein `@test`-Block pro Guard).
- `components/website/src/lib/__tests__/massage-brand.test.ts` ist neu
  (Ist 0), Status nicht-baselined, wirksame Schwelle `.ts`-Limit 900
  (Budget 900). Geplantes Wachstum ca. 150–220 Zeilen landet deutlich
  unter 80 % der Schwelle — kein Split nötig.
- Beide Dateien sind neu, daher keine Baseline-Einträge und kein
  Baseline-Wachstum (`freshness:check` Phase 3 bleibt grün).

Referenzierte, aber NICHT in diesem Partial geänderte Dateien (nur gelesen):

- `components/website/src/config/types.ts` (`BrandConfig`, Ist 188)
- `components/website/src/config/brands/massage.ts` (Sibling-Partial)
- `components/website/content/massage/*.json` (Sibling-Partial)
- `components/website/public/brand/massage/*` (Sibling-Partial)
- Die 7 Slug-Seiten: `index.astro`, `leistungen.astro`, `faq.astro`,
  `ueber-mich.astro`, `404.astro`, `impressum.astro`, `datenschutz.astro`
- `components/website/src/pages/kontakt.astro` (T901024-Journey, fremder Slug)

## Task 1 — BATS-Spec: Gerüst + Guards 1–3 (Brand, CTA, tote Links)

Lege `tests/spec/business-homepage.bats` nach Vorbild `basic-invoices.bats` an:
Shebang `#!/usr/bin/env bats`, Kopfkommentar mit Ticket `T901028` und IDs
`T901028-1..6` (füttern `test-inventory.json` via
`scripts/build-test-inventory.sh`), Pfad-Variablen relativ zu
`${BATS_TEST_DIRNAME}` (keine absoluten Pfade, keine Hostnamen-Literale — S3).

Implementiere die ersten drei Guards:

- `T901028-1` Brand-Ordner + Tokens vorhanden: `public/brand/massage/`
  enthält `colors_and_type.css` und `favicon.svg`; das CSS definiert die
  im Sibling-Partial gewählte Token-Richtung (Custom Properties für Farbe
  und Typo vorhanden, Datei nicht leer).
- `T901028-2` CTA-Link in T901024-Journey: jeder CTA-`href` der
  Homepage-Bundles (`leistungenCta.href`, Homepage-CTA aus
  `homepage.json`, CTA-Buttons in `index.astro`) zeigt auf den
  Journey-Einstieg `/kontakt` (T901024, `kontakt.astro` mit
  `?mode=`/`?service=`-Parametern); kein CTA ohne `href`, kein `href="#"`
  an CTA-Positionen.
- `T901028-3` keine toten internen Links der 7 Seiten: sammle alle
  internen `href="/…"` aus den 7 Slug-Seiten plus `navigation.json` und
  `footer.json`; jedes Ziel muss auf eine existierende Route mappen
  (`.astro`-Datei vorhanden oder explizit erlaubtes Fremd-Slug-Ziel
  `/kontakt` aus T901024); `404.astro` ist Quelle, aber kein Linkziel.

Akzeptanz: Datei ist ausführbar (`chmod +x`-Bit wie Sibling-Specs),
`bats --count` meldet mindestens 3 Tests, jeder Guard gibt bei
Fehlschlag die fehlende Datei oder den toten Link per `echo` aus.

## Task 2 — BATS-Spec: Guards 4–6 (Motion, Heilkunde, Anti-Slop) + Rot-Lauf

Ergänze in derselben Datei die Guards 4–6 aus T901021 §7:

- `T901028-4` reduced-motion-Media-Query: `prefers-reduced-motion` kommt
  im Brand-CSS (oder dem globalen Website-CSS, falls dort zentral
  geregelt) vor und schaltet Animationen/Transitionen ab
  (`animation: none` oder `transition: none` im Query-Block).
- `T901028-5` keine Heilkunde-Claim-Phrasen: Negativsuche über
  `content/massage/*.json` und die 7 Slug-Seiten auf eine feste
  Phrasenliste (mindestens: `heilt`, `Heilung`, `garantiert`,
  `schmerzfrei`, `beseitigt Schmerzen`, `medizinisch nachgewiesen`);
  Treffer lassen den Test mit Fundstelle fehlschlagen.
- `T901028-6` keine vollflächigen Creme-/Gradient-Muster: Negativsuche
  über Brand-CSS und Slug-Seiten — kein vollflächiger Creme-Body
  (`body`-Hintergrund auf Creme-Token), keine Gradient-Headlines
  (`linear-gradient` an `h1`/Headline-Klassen), keine generischen
  3-Card-/Bento-Raster-Klassen aus der Slop-Liste des Sibling-Partials.

Failing-Test-Step (rot, bevor Sibling-Partials mergen):

```bash
bats tests/spec/business-homepage.bats
# expected: FAIL — Brand-Ordner, Bundles und Seiten existieren noch nicht,
# alle Guards mit Dateiexistenz-Prüfung schlagen fehl (Nachweis, dass die
# Spec ohne Implementierung rot ist).
```

Akzeptanz: 6 `@test`-Blöcke mit IDs `T901028-1..6`, Rot-Lauf belegt,
Grün wird nach Merge der Content-/Brand-Partials erwartet.

## Task 3 — Vitest: massage-brand.test.ts (Config, Bundles, Platzhalter)

Lege `components/website/src/lib/__tests__/massage-brand.test.ts` an
(Stil: bestehende `__tests__`-Dateien, `describe`/`it`/`expect` aus
`vitest`, relative Imports mit `.js`-Suffix). Drei Blöcke:

- `BrandConfig`-Vollständigkeit: importiere die Massage-Brand-Config,
  prüfe alle Pflichtfelder aus `BrandConfig` (`meta`, `contact`,
  `legal`, `navigation`, `footer`, `homepage`, `services`,
  `leistungen`, `uebermich`, `kontakt`, `faq`, `leistungenCta`,
  `features`); Arrays nicht leer, `leistungenCta.href` zeigt auf
  `/kontakt`, E-Mail-/URL-Formate per Regex plausibel.
- Bundle-JSONs valide + referenzierte IDs auflösbar: `JSON.parse` über
  alle `content/massage/*.json` (seo, homepage, leistungen, faq,
  kontakt, navigation, footer, stammdaten, ueber-mich); jede
  bundle-übergreifende Referenz löst auf (Navigations-`href`s auf
  Routen, Leistungs-IDs aus `homepage.json` in `leistungen.json`,
  `seo.json`-Einträge pro Seite).
- Platzhalter-Slots markiert: jeder offene Owner-Input aus T901021 §8
  (Preise, Profiltext, Fotos, Telefonnummer) ist im Bundle explizit als
  Platzhalter gekennzeichnet (Marker-Feld, z. B. `placeholder: true`,
  statt stiller Leerstrings); der Test listet alle markierten Slots und
  schlägt fehl, wenn ein Slot weder echten Inhalt noch Marker trägt.

Failing-Test-Step:

```bash
npx vitest run components/website/src/lib/__tests__/massage-brand.test.ts
# expected: FAIL — Brand-Config und Bundles fehlen noch (Import-Fehler),
# Nachweis des Rot-Zustands vor den Sibling-Partials.
```

Akzeptanz: alle drei Blöcke vorhanden, kein `any` in der Datei (CQ02:
kein `: any`, `<any>`, `as any`), keine Hostnamen-Literale (S3),
nur Imports auf Brand-Config und JSON-Bundles (S2: keine Zyklen).

## Task 4 — Verify: Inventar, CQ02, Projekt-Gates

Steps in dieser Reihenfolge:

```bash
bats tests/spec/business-homepage.bats
npx vitest run components/website/src/lib/__tests__/massage-brand.test.ts
bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"
task test:inventory
task test:changed
task freshness:regenerate
task freshness:check
```

Hinweise: `task test:inventory` regeneriert `test-inventory.json`
(Pflicht bei neuen Tests, Datei mitcommitten). `bats`/`vitest` bleiben
rot, bis die Sibling-Partials (Brand, Bundles, Seiten) mergen — das ist
erwartetes Rot→Grün, kein Plan-Fehler. `freshness:check` muss grün sein
(S1–S4-Ratchet, Baseline-Key-Count unverändert).
