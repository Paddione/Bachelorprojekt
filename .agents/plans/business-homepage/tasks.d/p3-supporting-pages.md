---
title: "p3-supporting-pages — FAQ, Profil, 404, Pflichtseiten (Massage)"
ticket_id: T901028
slug: business-homepage
domains: [website, massage-frontend]
status: partial
---

# business-homepage — Implementation Plan

Partial `p3-supporting-pages` (FAQ, Profil, 404, Pflichtseiten) zu T901028.
Scope: genau fünf Dateien, keine weiteren Dateien einplanen oder ändern.
Setzt das p1-Bundle (`content/massage/*.json`, Brand-Config, Tokens) voraus
und nutzt es ausschließlich lesend. Alle Texte sind Entwürfe; Stellen mit
offenem Owner-Input werden im UI sichtbar als Platzhalter gekennzeichnet.
Keine Heilkunde-Claims, keine erfundenen Credentials, keine erfundenen
Steuer-/Kontaktdaten.

<!-- vitest: kein neuer Test nötig, weil dieses Partial nur fünf .astro-Seiten ändert und keine Logik in src/lib oder API-Routen anfasst; rot→grün läuft über eine temporäre, nicht committete BATS-Probe unter /tmp. -->

## File Structure

| Datei | Ist | Budget |
| `components/website/src/pages/ueber-mich.astro` | 92 | 908 |
| `components/website/src/pages/404.astro` | 24 | 976 |
| `components/website/src/pages/impressum.astro` | 50 | 950 |
| `components/website/src/pages/datenschutz.astro` | 51 | 949 |

Neue Datei `components/website/src/pages/faq.astro` (existiert noch nicht):
wirksame Schwelle ist das `.astro`-Limit 1000; geplant sind rund 60–90
Zeilen, also deutliche Reserve ohne Split-Bedarf.

S1-Notizen (verifiziert per `wc -l`, Baseline-Lookup, `gates.yaml`):

- `components/website/src/pages/ueber-mich.astro` Ist 92, Status
  nicht-baselined, wirksame Schwelle `.astro`-Limit 1000 (Budget 908).
  Geplantes Wachstum ca. 60–90 Zeilen (Massage-Zweig) landet bei ca.
  150–185 von 1000, deutlich unter 80 % der Schwelle — kein Split nötig.
- `components/website/src/pages/404.astro` Ist 24, Status nicht-baselined,
  wirksame Schwelle `.astro`-Limit 1000 (Budget 976). Geplantes Wachstum
  ca. 30–50 Zeilen (Massage-Zweig mit CTA) landet bei ca. 55–75 von 1000 —
  kein Split nötig.
- `components/website/src/pages/impressum.astro` Ist 50, Status
  nicht-baselined, wirksame Schwelle `.astro`-Limit 1000 (Budget 950).
  Geplantes Wachstum ca. 60–100 Zeilen (Inline-Massage-Text) landet bei ca.
  110–150 von 1000 — kein Split nötig.
- `components/website/src/pages/datenschutz.astro` Ist 51, Status
  nicht-baselined, wirksame Schwelle `.astro`-Limit 1000 (Budget 949).
  Geplantes Wachstum ca. 80–120 Zeilen (Inline-Massage-Text) landet bei ca.
  130–175 von 1000 — kein Split nötig.

Ausführungs-Regel: Netto-Wachstum über alle fünf Dateien zusammen unter
400 Zeilen halten; keine Baseline-/Ignore-Ausnahme einplanen. Nur bereits
existierende `src/lib`-Importe verwenden (S2: keine neuen Zyklen), keine
Hostnamen-Strings (S3: nur relative Links), keine neuen `any`-Typen (CQ02).

## Kontext (Einarbeitung, gelesen)

- `intel.json` des Plan-Ordners (Impact-Dateien, S1-Restwerte).
- `plan-quality-gates.md` (kanonisch): S1-Ratchet, S3-Hostnamenverbot,
  CQ02-`any`-Verbot, Verify-Kommandos.
- `ueber-mich.astro` (Ist 92): rendert `getEffectiveUebermich()` plus
  `getEffectiveStammdaten()`; Sections, Meilensteine, Privat-Text,
  Namens-Kasten, CTA. Massage-Zweig wird als Brand-Weiche ergänzt,
  Bestands-Markup bleibt unverändert.
- `404.astro` (Ist 24): aktuell Wartungsseite für alle Brands.
  Massage-Zweig wird echte ruhige Fehlerseite mit CTA.
- `impressum.astro` (Ist 50) / `datenschutz.astro` (Ist 51): Muster
  `getLegalPage` (Admin-Override) → Fallback `getDefault*()` →
  `resolveTokens(html, sd)`; `legal-defaults.ts` und `legal-tokens.ts`
  liegen außerhalb des Scopes und bleiben unverändert — Massage-Texte
  deshalb als Inline-Konstanten in den Seiten.
- `FAQ.svelte`: Akkordeon mit `items` (`question`/`answer`), Tastatur-
  und Screenreader-Markup vorhanden; `index.astro` zeigt das
  Verdrahtungsmuster (`getEffectiveFaq()`, `{city}`-Ersetzung,
  `client:visible`).
- T901021 `docs/website/massage-content-design/README.md` §2: FAQ-Entwürfe
  (Mindestvorlauf/Vortag, Bestätigung, Hausbesuche nur bekannte Kunden,
  Zahlung vor Ort mit Rechnung, Absage-Regel offen), Profil als
  Kurzporträt-Platzhalter, Besuchsinfos (Vögelsen bei Lüneburg, Anfahrt
  erst nach Bestätigung, Kernzeiten Mo–Fr plus flexible Slots).
- T901019 `docs/website/massage-privacy-requirements/README.md` §1/§3:
  keine Heilkunde-Claims, keine erfundenen Berufsangaben; Impressum nach
  DDG §5 (Name/Anschrift, empfangsbereite E-Mail, Register/USt-IdNr. falls
  vorhanden, Aufsichtsbehörde bei zulassungspflichtigen Tätigkeiten),
  Datenschutzerklärung mit Art.-13/14-Inhalten, Consent-Hinweis (TTDSG).

## Task 1 — Rot→Grün-Probe anlegen (Failing-Test-Step)

Schreibe eine temporäre, nicht zu committende BATS-Probe nach
`/tmp/p3-supporting-probe.bats`, die die Massage-Marker in allen fünf
Target-Dateien per `grep` assertiert (Brand-Weiche `massage`, FAQ-Bundle-
Anbindung, Profil-Platzhalter, 404-CTA, Pflichtseiten-Platzhalter für
Steuer-/Kontaktdaten, keine Heilkunde-Begriffe).

Steps:

1. Probe-Datei unter `/tmp/p3-supporting-probe.bats` anlegen (Inhalt in
   ```-Fences dokumentieren, keine Repo-Datei anlegen). Assertions:
   `faq.astro` importiert `FAQ.svelte` und ruft `getEffectiveFaq()` auf;
   `ueber-mich.astro` enthält `massage`-Weiche plus sichtbaren
   Profil-Platzhalter; `404.astro` enthält `massage`-Weiche plus Links auf
   `/` und `/kontakt`; `impressum.astro`/`datenschutz.astro` enthalten
   `massage`-Weiche plus Platzhalter für USt-IdNr./Anschrift; keine der
   fünf Dateien enthält Heilkunde-Begriffe wie `Heilung`, `Therapie`,
   `Behandlung von`.
2. Ausführen: `bats /tmp/p3-supporting-probe.bats` — expected: FAIL
   (Marker fehlen vor der Implementierung; `faq.astro` existiert noch
   nicht).

Akzeptanzkriterien:

- Die Probe läuft mit dem `bats`-Runner und meldet vor der Änderung
  fehlgeschlagene Assertions.
- Die Probe referenziert ausschließlich die fünf Target-Dateien.

Verify:

- `bats /tmp/p3-supporting-probe.bats` zeigt Fehlschlag vor der Änderung.

## Task 2 — faq.astro neu (Massage-FAQ aus Bundle)

Lege `components/website/src/pages/faq.astro` als neue Seite an. Die
Fragen/Antworten kommen aus dem p1-Bundle (`content/massage/faq.json`
mit den T901021-Entwürfen: Vorlauf, Bestätigung, Hausbesuche, Zahlung,
Absage-Regel offen) via `getEffectiveFaq()`; keine Q&A-Texte in der
Seite hartcodieren. Darstellung als Akkordeon via `FAQ.svelte`.

Steps:

1. Frontmatter: `Layout`, `FAQ.svelte`, `CallToAction.svelte`,
   `getEffectiveFaq()` und `getEffectiveStammdaten()` importieren;
   Bundle gemäß `index.astro`-Muster laden, `{city}` in Antworten gegen
   Stammdaten-Stadt ersetzen. SEO-Titel/Beschreibung mit Entwurfs-
   Fallbacks, wenn das Bundle keinen Wert liefert.
2. Seitenkopf (H1 „Häufige Fragen“, kurze Einleitung als Entwurf),
   danach `<FAQ items={...} client:visible />`.
3. Abschluss-Block mit `CallToAction` (E-Mail aus Stammdaten) und
   Rück-Link auf `/kontakt` für offene Fragen. Nur relative Links (S3).
4. Keine Heilkunde-Formulierungen in Einleitung und Fallbacks; nur
   Entspannung/Wohlbefinden-Wording.

Akzeptanzkriterien:

- Die Seite rendert alle Bundle-Einträge als Akkordeon; leeres Bundle
  zeigt einen lesbaren Leer-Hinweis statt einer leeren Seite.
- Akkordeon ist per Tastatur bedienbar und meldet offenen Zustand
  (Nutzung der vorhandenen `FAQ.svelte`-A11y-Attribute).
- Auf 360 px Breite kein Horizontal-Scroll; CTA ist erreichbar.
- Neue Datei bleibt deutlich unter dem `.astro`-Limit (Ziel unter 100
  Zeilen).

Verify:

- `bats /tmp/p3-supporting-probe.bats` (FAQ-Assertions werden grün).
- Seite rendern, Akkordeon nur mit Tastatur öffnen/schließen.

## Task 3 — ueber-mich.astro: Massage-Profil brand-conditional

Ergänze in `components/website/src/pages/ueber-mich.astro` einen
Massage-Zweig per `BRAND_ID === 'massage'`-Weiche: Kurzporträt als
sichtbarer Platzhalter, Qualifikations-Block nur aus Bundle-Werten oder
als Platzhalter, Besuchsinfos, CTA. Das Bestands-Markup für andere
Brands bleibt unverändert.

Steps:

1. `isMassage`-Konstante im Frontmatter nach dem Muster der
   bestehenden `layoutBrand`-Weiche definieren.
2. Massage-Zweig: H1 plus Kurzporträt-Platzhalter (sichtbar als Entwurf
   gekennzeichnet, z. B. sinngemäß „Profiltext der Inhaberin folgt“);
   Qualifikations-Block rendert ausschließlich Bundle-Werte aus
   `getEffectiveUebermich()` und fällt bei fehlenden Werten auf einen
   Platzhalter zurück — keine Credentials erfinden.
3. Besuchsinfos-Block (Entwürfe aus T901021 §2): Vögelsen bei Lüneburg,
   genaue Anfahrt erst nach bestätigter Buchung, Kernzeiten Mo–Fr plus
   flexible Slots. CTA mit Stammdaten-E-Mail analog Bestand.
4. Wording-Prüfung: nur Wellness-Formulierungen (Entspannung,
   Wohlbefinden), keine Diagnosen, keine Heilungs- oder
   Linderungsversprechen, keine reglementierten Berufsbezeichnungen.

Akzeptanzkriterien:

- Massage-Brand zeigt Profil-Platzhalter, Qualifikations-Platzhalter
  und Besuchsinfos; kein erfundener Name, keine erfundene Qualifikation.
- Andere Brands rendern exakt wie bisher (Weiche berührt deren Pfad
  nicht).
- Datei bleibt unter ihrer wirksamen Schwelle 1000 (Ziel unter 200
  Zeilen).

Verify:

- `bats /tmp/p3-supporting-probe.bats` (Profil-Assertions werden grün).
- Seite für Massage-Brand und einen Bestands-Brand rendern und
  vergleichen.

## Task 4 — 404.astro: ruhige Fehlerseite mit CTA

Ergänze in `components/website/src/pages/404.astro` einen Massage-Zweig:
ruhige Fehlerseite („Seite nicht gefunden“) mit kurzer Erklärung und
zwei CTAs (primär Startseite, sekundär Terminanfrage). Die
Wartungs-Darstellung für andere Brands bleibt unverändert.

Steps:

1. `isMassage`-Weiche im Frontmatter nach dem bestehenden
   `BRAND_ID`-Muster definieren.
2. Massage-Zweig: ruhige Typografie im Bestand-Stil (CSS-Variablen des
   Layouts, keine neuen Farbcodes), H1, ein kurzer Erklärungssatz als
   Entwurf, zwei Links (`/` primär, `/kontakt` sekundär) als gut
   erreichbare Touch-Targets (mindestens 44 px).
3. `prefers-reduced-motion` beachten (keine Animation ohne Media-Query-
   Guard); keine Hostnamen, nur relative Links.

Akzeptanzkriterien:

- Massage-Brand zeigt Fehlerseite mit beiden CTAs; Links führen auf
  `/` und `/kontakt`.
- Andere Brands zeigen weiterhin die Wartungs-Darstellung.
- Mobil (360 px) lesbar ohne Horizontal-Scroll.

Verify:

- `bats /tmp/p3-supporting-probe.bats` (404-Assertions werden grün).
- Unbekannte URL für beide Brand-Pfade aufrufen und Darstellung prüfen.

## Task 5 — impressum.astro + datenschutz.astro: Massage-Varianten

Ergänze in beiden Dateien einen Massage-Zweig mit Inline-Texten nach
T901019 §3. Das Override-Muster bleibt erhalten: gespeicherter
Admin-Text gewinnt, sonst Massage-Text für den Massage-Brand, sonst
bisheriger Fallback. `legal-defaults.ts` und `legal-tokens.ts` werden
nicht angefasst. Offene Steuer-/Kontaktdaten sind sichtbare Platzhalter.

Steps:

1. Je Datei `isMassage`-Weiche und eine Inline-HTML-Konstante
   (`massageImpressum` / `massageDatenschutz`) im Frontmatter definieren;
   Auswahl: `stored?.trim() ? stored : (isMassage ? massage* :
   getDefault*())`, danach `resolveTokens(html, sd)` wie bisher.
2. Impressum-Text (Entwurf): Name/Anschrift mit Platzhaltern für offene
   Felder (ladungsfähige Anschrift, c/o-Entscheidung offen), E-Mail aus
   `{{stammdaten.email}}`, Hinweis auf USt-IdNr./Steuernummer nur als
   Platzhalter „falls vorhanden“, Aufsichtsbehörde nur als bedingter
   Platzhalter-Hinweis. Keine Adresse, keine Nummer erfinden.
3. Datenschutz-Text (Entwurf): Verantwortlicher mit Platzhaltern,
   Verarbeitungszwecke/Rechtsgrundlagen (Art. 6), Speicherdauer mit
   Steuerfristen-Vorbehalt als Platzhalter-Text, Betroffenenrechte,
   Cookie-/Consent-Hinweis (TTDSG), Hosting nur als Platzhalter
   („Anbieter folgt“) — keinen Anbieter erfinden.
4. Layout-Schale und Druck-Button analog Bestand übernehmen;
   Massage-Zweig nutzt die vorhandene nicht-Kore-Schale.

Akzeptanzkriterien:

- Massage-Brand zeigt die neuen Texte mit sichtbaren Platzhaltern für
  alle offenen Steuer-/Kontakt-/Hosting-Angaben; kein erfundener Wert.
- Admin-Override (`getLegalPage`) gewinnt weiterhin, wenn Text
  gespeichert ist.
- Andere Brands rendern exakt wie bisher.
- Beide Dateien bleiben unter ihrer wirksamen Schwelle 1000.

Verify:

- `bats /tmp/p3-supporting-probe.bats` vollständig grün.
- `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`.

## Task 6 — Finale Verifikation

Führe die drei mandatory Verify-Kommandos aus und bestätige
S1/CQ02-Stände sowie die grüne Probe.

Steps:

1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
4. S1-Nachweis: `wc -l` aller fünf Dateien gegen ihre Schwelle 1000
   prüfen (Zielwerte: faq unter 100, ueber-mich unter 200, 404 unter
   100, impressum/datenschutz je unter 200), `bats
   /tmp/p3-supporting-probe.bats` grün bestätigen.

Akzeptanzkriterien:

- Alle drei Kommandos laufen fehlerfrei durch.
- Alle fünf Dateien bleiben unter ihrer wirksamen Schwelle 1000.
- Die `/tmp`-Probe wird nicht committet (Throwaway-Artefakt).
