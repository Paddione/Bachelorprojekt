---
title: "p2-home-services — Massage Home und Leistungskatalog"
ticket_id: T901028
slug: business-homepage
domains: [website, massage-frontend]
status: partial
---

# business-homepage — Implementation Plan

Partial `p2-home-services` zu T901028 (Slug business-homepage).
Scope: genau zwei Dateien, keine weiteren Dateien einplanen oder ändern.
Setzt das p1-Content-Bundle voraus (`content/massage/*.json`,
`src/config/brands/massage.ts`, `public/brand/massage/*` mit Tokens und
Favicon): dieses Partial liest das Bundle nur über die bestehenden
`getEffective*`-Getter, es legt keine Bundle-Dateien an. Alle Texte sind
Entwürfe; Stellen mit offenem Owner-Input werden im UI sichtbar als
Platzhalter gekennzeichnet.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur zwei Astro-Seiten um statisches Markup plus Brand-Branch erweitert und die Abdeckung über die BATS-Probe (Throwaway unter /tmp) sowie die committed Spec im Sibling-Partial läuft. -->

## File Structure

| Datei | Ist | Budget |
| `components/website/src/pages/index.astro` | 242 | 758 |
| `components/website/src/pages/leistungen.astro` | 161 | 839 |

S1-Notizen (verifiziert per `wc -l`, Baseline-Lookup, `gates.yaml`):

- `components/website/src/pages/index.astro` Ist 242, Status
  nicht-baselined, wirksame Schwelle `.astro`-Limit 1000 (Budget 758).
  Geplantes Wachstum ca. 180–260 Zeilen (Massage-Branch mit sechs
  Sections, statisches Astro-Markup) landet bei ca. 420–500 von 1000,
  unter 80 % der Schwelle — kein Split nötig.
- `components/website/src/pages/leistungen.astro` Ist 161, Status
  nicht-baselined, wirksame Schwelle `.astro`-Limit 1000 (Budget 839).
  Geplantes Wachstum ca. 100–160 Zeilen (Massage-Katalog-Branch aus
  Bundle) landet bei ca. 260–320 von 1000 — kein Split nötig.

Budget-Regel für die Ausführung: Netto-Wachstum in beiden Dateien zusammen
unter 420 Zeilen halten; keine Baseline-/Ignore-Ausnahme einplanen.

## Kontext (Einarbeitung, gelesen)

- `intel.json` des Plan-Ordners (Impact-Dateien, S1-Budgets, Bundle-Getter).
- `plan-quality-gates.md` (kanonisch): S1-Ratchet, S2-Zyklenverbot,
  S3-Hostnamenverbot, CQ02-`any`-Verbot, Verify-Kommandos.
- `pages/index.astro` (Ist 242): `BRAND_ID`-Weiche mit `isKore`-Branch,
  Bundle-Lesen via `getEffectiveHomepage`, `getEffectiveFaq`,
  `getEffectiveServices`, `getEffectiveStammdaten`, SEO via
  `bundleSeo(BRAND_ID)`; Sections Hero, Angebote, WhyMe, Process, FAQ,
  CTA. Der Massage-Branch folgt demselben Weichen-Muster.
- `pages/leistungen.astro` (Ist 161): Katalog via `getEffectiveLeistungen`
  plus `getPriceListUrl`, Bestand bleibt für andere Brands unverändert.
- `pages/kontakt.astro`: `isMassage`-Muster (`BRAND_ID === 'massage'`),
  statische `massageServices`-Liste mit den Keys `ruecken-30`,
  `ganzkoerper-60` (Highlight), `ganzkoerper-90`, Platzhalter-Preisen und
  `journeyEnabled`-Weitergabe an `ContactHub` (T901024-Journey).
- `FAQ.svelte`: Props `items`, `locale`, `title`; Akkordeon per nativem
  `button` mit `aria-expanded`, Tastatur ohne Zusatzarbeit.
- `CallToAction.svelte`: Props `eyebrow`, `title`, `titleEmphasis`,
  `subtitle`, `primaryText`, `primaryHref` (Default `/kontakt`),
  `secondaryText`, `secondaryHref`; wird mit Massage-Texten aus dem
  Bundle gespeist.
- T901021 `docs/website/massage-content-design/README.md` §1+§2+§7:
  Seitenstruktur (`/` mit Hero, Leistungen kurz, Vertrauen, Ablauf,
  FAQ-Auszug, CTA; `/leistungen` mit Katalog und Platzhalter-Preisen),
  Content-Entwürfe (Hero-Zeile, CTA-Paar „Termin anfragen“ /
  „Leistungen ansehen“, Entspannungs-Hinweis ohne Heilkunde-Claims,
  Telefon-Fallback „lieber anrufen?“), Anti-Slop-Filter (kein
  vollflächiges Creme, keine Gradient-Headlines, keine generischen
  3-Card-/Bento-Raster, `prefers-reduced-motion` respektiert).
- Annahme an p1: Die Bundle-Auflösung greift unter dem Massage-Brand;
  p2 ruft nur die bestehenden Getter auf und baut keine eigene
  Env-Logik. Task 1 prüft die p1-Artefakte vorab lesend.

## Task 1 — Voraussetzung prüfen, Rot→Grün-Probe anlegen (Failing-Test-Step)

Prüfe zuerst lesend, dass die p1-Artefakte existieren; lege danach eine
temporäre, nicht zu committende BATS-Probe an, die die Massage-Marker in
beiden Target-Dateien per `grep` assertiert (`isMassage`-Branch, beide
CTA-Ziele, drei Service-Keys, Entspannungs-Hinweis, Telefon-Fallback,
FAQ-Auszug, `prefers-reduced-motion`, Anti-Slop-Negativmarker).

Steps:

1. Lesend prüfen: `content/massage/homepage.json`,
   `content/massage/leistungen.json`, `content/massage/faq.json`,
   `content/massage/stammdaten.json`, `content/massage/navigation.json`,
   `src/config/brands/massage.ts`, `public/brand/massage/colors_and_type.css`
   existieren. Fehlt eines, Ausführung stoppen und an p1 zurückgeben.
2. Probe-Datei unter `/tmp/p2-home-services-probe.bats` anlegen (alles in
   ```-Fences, keine Repo-Datei anlegen).
3. Ausführen: `bats /tmp/p2-home-services-probe.bats` — expected: FAIL
   (Marker fehlen vor der Implementierung).

Akzeptanzkriterien:

- Die Probe läuft mit dem `bats`-Runner und meldet vor der Änderung
  fehlgeschlagene Assertions.
- Die Probe referenziert ausschließlich die zwei Target-Dateien.
- Kein p1-Artefakt wird in diesem Partial angelegt oder geändert.

Verify:

- `bats /tmp/p2-home-services-probe.bats` meldet Fehlschlag vor der
  Implementierung, alle Assertions sind begründet (kein Anker ohne
  Trefferwartung).

## Task 2 — index.astro: Massage-Sections im Brand-Branch

Erweitere `components/website/src/pages/index.astro` um einen
`isMassage`-Branch analog zur bestehenden `isKore`-Weiche (`const isMassage =
BRAND_ID === 'massage'`, Muster aus `kontakt.astro`). Alle Texte kommen aus
dem p1-Bundle (`getEffectiveHomepage`, `getEffectiveFaq`,
`getEffectiveServices`, `getEffectiveStammdaten`, `bundleSeo`); statische
Sections bleiben Astro-Markup, Svelte nur für FAQ-Akkordeon und CTA
(T901021 §6).

Steps:

1. Frontmatter: `isMassage`-Konstante, Bundle-Daten filtern (Services ohne
   `hidden`, FAQ-Auszug erste Einträge, `processSteps` aus
   `getEffectiveHomepage`), SEO-Titel/Beschreibung/OG-Bild via
   `bundleSeo(BRAND_ID)` für `home`.
2. Hero als statisches Astro-Markup: Bundle-Headline/Subline, primärer CTA
   „Termin anfragen“ nach `/kontakt` (Massage startet dort per
   `journeyEnabled` im T901024-Anfrage-Modus), sekundärer CTA „Leistungen
   ansehen“ nach `/leistungen`; Telefon-Fallback „lieber anrufen?“ mit
   `tel:`-Link aus `stammdaten.phone`, als Platzhalter gekennzeichnet
   solange Owner-Input offen ist.
3. Leistungen kurz: die drei Bundle-Services als statische Editorial-Liste
   (kein generisches Kartenraster), je mit Name, Dauer, Platzhalter-Preis
   und Link auf `/kontakt` mit `service`-Query (`ruecken-30`,
   `ganzkoerper-60`, `ganzkoerper-90`).
4. Vertrauen: Bundle-Texte (Praxis vor Ort, feste Hände, ruhige
   Atmosphäre) als einspaltige Editorial-Section mit Eyebrow, kein
   Bento-Raster; Profil-/Praxis-Slots nur als Platzhalter-IDs, kein Bild
   erfinden.
5. Ablauf: `Process.astro` mit den drei Bundle-Schritten
   (Anfrage, Bestätigung, Besuch), Eyebrow/Headline aus dem Bundle.
6. FAQ-Auszug: `FAQ.svelte` (Wiederverwendung, `client:visible`) mit den
   ersten Bundle-Einträgen plus Link „Alle Fragen“ nach `/faq`.
7. CTA: `CallToAction.svelte` (Wiederverwendung, `client:visible`) mit
   Massage-Texten aus dem Bundle, `primaryHref` nach `/kontakt`.
8. Stil/Barriere: Seitenbasis Papierweiß aus den p1-Brand-Tokens, Creme
   nur für alternierende Flächen, Headlines solide ohne Gradient;
   sichtbare Fokus-Zustände, Landmarks mit `aria-labelledby`,
   `prefers-reduced-motion`-Block deaktiviert Reveal/Transition;
   Tastaturpfad Hero, Links, FAQ, CTA ohne Maus nutzbar.
9. Mobile Nav und 360 px: keine Layout-/Nav-Änderung (außerhalb Scope);
   sicherstellen, dass beide CTA im ersten Viewport erreichbar sind und
   kein Horizontal-Scroll auftritt (Nav-Items liefert
   `content/massage/navigation.json` aus p1).

Akzeptanzkriterien:

- Andere Brands rendern exakt wie bisher (Branch berührt nur
  `isMassage`-Pfad).
- Beide Hero-CTAs führen auf die korrekten Ziele, Journey-Einstieg ohne
  `service`-Parameter startet den Anfrage-Modus.
- Preise und Telefonnummer sind als Platzhalter erkennbar, kein
  erfundener Euro-Betrag, keine Heilkunde-Claims.
- Anti-Slop-Filter erfüllt: kein vollflächiges Creme, keine
  Gradient-Headlines, keine generischen 3-Card-/Bento-Raster,
  `prefers-reduced-motion` respektiert.
- Bedienung per Tastatur und auf 360 px Breite ohne Horizontal-Scroll.

Verify:

- `bats /tmp/p2-home-services-probe.bats` (index-Assertions werden grün).
- Seite mit Massage-Brand rendern, Tastatur-Tour und 360-px-Viewport
  prüfen; Gegenprobe mit Mentolder-Brand ohne sichtbare Änderung.

## Task 3 — leistungen.astro: Katalog aus Bundle

Erweitere `components/website/src/pages/leistungen.astro` um einen
`isMassage`-Branch, der den Leistungskatalog aus `getEffectiveLeistungen`
(Massage-Bundle) rendert: `ruecken-30`, `ganzkoerper-60` (Highlight),
`ganzkoerper-90` mit Dauer, Platzhalter-Preisen und Entspannungs-Hinweis
ohne Heilkunde-Claims. Bestand (Erstgespräch-Hero, Vergleichstabelle,
Kategorien, Preislisten-Download) bleibt für andere Brands unverändert.

Steps:

1. Frontmatter: `isMassage`-Konstante, Katalog aus
   `getEffectiveLeistungen`, SEO via `bundleSeo(BRAND_ID)` für
   `leistungen` (Fallback auf Bestandstexte nur für andere Brands).
2. Katalog-Markup als statische Liste: je Leistung Name, Dauer,
   Platzhalter-Preis sichtbar als Entwurf, Kurzbeschreibung aus dem
   Bundle, CTA „Termin anfragen“ nach `/kontakt` mit passender
   `service`-Query.
3. Hinweis-Block: Entspannung/Wohlbefinden, keine Behandlung von
   Krankheiten (Wortlaut aus T901021 §2 als Entwurf), Storno-Regel als
   Platzhalter bis Owner-Input.
4. Telefon-Fallback „lieber anrufen?“ mit `tel:`-Link aus
   `getEffectiveStammdaten` (Platzhalter-Kennzeichnung wie in Task 2).
5. `CallToAction.svelte` (Wiederverwendung) als Abschluss mit
   Massage-Texten, `primaryHref` nach `/kontakt`.
6. Stil/Barriere wie Task 2 Schritt 8: Token-Basis, keine
   Gradient-Headlines, kein generisches Kartenraster,
   `prefers-reduced-motion`, sichtbare Fokus-Zustände, Tastaturpfad.
7. Typisierung ohne `any` (CQ02); keine Hostnamen-Literale (S3), nur
   relative Links; keine neuen Imports außer Bundle-Getter und
   bereits genutzten Komponenten (S2).

Akzeptanzkriterien:

- Alle drei Katalog-Leistungen rendern mit korrekter Dauer, Highlight
  auf `ganzkoerper-60`, alle Preise als Platzhalter erkennbar.
- Jede Leistung verlinkt mit ihrem Service-Key in die T901024-Journey.
- Entspannungs-Hinweis vorhanden, keine Heilkunde-Claims, keine
  erfundenen Credentials oder Preise.
- Andere Brands: kein sichtbarer Unterschied zu vorher.
- Anti-Slop-Filter und 360-px-Regel wie in Task 2 erfüllt.

Verify:

- `bats /tmp/p2-home-services-probe.bats` vollständig grün.
- `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`.
- Seite mit Massage-Brand rendern, Katalog-Links und Hinweis-Block
  prüfen; Gegenprobe mit Mentolder-Brand.

## Task 4 — Finale Verifikation

Führe die drei mandatory Verify-Kommandos aus und bestätige S1/CQ02-Stände.

Steps:

1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
4. S1-Nachweis: `wc -l` beider Dateien gegen Budgets (758 / 839) prüfen,
   `bats /tmp/p2-home-services-probe.bats` grün bestätigen.

Akzeptanzkriterien:

- Alle drei Kommandos laufen fehlerfrei durch.
- Beide Dateien bleiben unter ihrer wirksamen Schwelle (1000 / 1000).
- Die `/tmp`-Probe wird nicht committet (Throwaway-Artefakt).
