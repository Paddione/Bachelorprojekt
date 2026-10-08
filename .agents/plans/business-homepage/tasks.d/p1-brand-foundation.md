# p1-brand-foundation — Partial-Plan (T901028, Slug business-homepage)

Brand-Fundament der Massage-Website: `BrandConfig`-Union, neue Brand-Konfig
`massage`, Richtung-A-Token-Satz, Favicon und alle neun Content-Bundles.
Content-Entwürfe aus T901021 §2, Richtung A „Ruhige Wärme“ aus §4+§5.

## Target-Files (exklusiv, 13 Dateien)

| Datei | Stand | S1-Budget |
|---|---|---|
| `components/website/src/config/types.ts` | Ist 188 | 712 |
| `components/website/src/config/brands/massage.ts` | neu | Limit 900, Ziel 450 oder weniger |
| `components/website/public/brand/massage/colors_and_type.css` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/public/brand/massage/favicon.svg` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/seo.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/homepage.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/leistungen.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/faq.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/kontakt.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/navigation.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/footer.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/stammdaten.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |
| `components/website/content/massage/ueber-mich.json` | neu | kein S1-Limit (Extension nicht in gates.yaml) |

Vorlagen: `config/types.ts` (Union), `config/brands/mentolder.ts` (428 Zeilen
Strukturvorlage), `public/brand/mentolder/colors_and_type.css` (213 Zeilen
Token-Struktur), `public/brand/korczewski/favicon.svg` (SVG-Aufbau 32x32),
`content/mentolder/*.json` (Bundle-Schemas).

## Slot-Register (stabile Platzhalter-IDs, geschlossen)

Konvention: `slot:<id>` in URL-/ID-Feldern, `[slot:<id>]` inline in
Fließtext. Jede Referenz muss exakt eine ID aus diesem Register tragen,
jede ID muss mindestens einmal referenziert sein:

- `slot-portrait-inhaberin` (Foto Hochformat)
- `slot-praxis-raum` (Foto Querformat)
- `slot-stimmung-01` (Foto Stimmungsbild)
- `slot-inhaberin-name` (Text, Name der Inhaberin)
- `slot-inhaberin-qualifikation` (Text, Qualifikation mit Nachweis)
- `slot-telefon` (Kontakt, Rufnummer plus Rückruf-Zusage)
- `slot-storno-regel` (Text, Absage-/No-Show-Regel)

<!-- vitest: kein neuer Test nötig in diesem Partial, weil die Tests für
diese Dateien der Test-Partial mit eigenen Target-Files liefert
(massage-brand.test.ts, business-homepage.bats). -->

## Task 1 — BrandConfig-Union um `massage` erweitern

Steps:

1. In `components/website/src/config/types.ts` Zeile 107 die Union
   `brand: 'mentolder' | 'korczewski';` um `'massage'` erweitern.
   Genau eine Zeile ändern, keine Zeile hinzufügen oder entfernen.
2. `grep -n "brand:" components/website/src/config/types.ts` muss die
   erweiterte Union zeigen.
3. `wc -l components/website/src/config/types.ts` muss weiterhin 188
   melden (Budget 712 bleibt unangetastet).

Akzeptanz: Union enthält alle drei Brands, Zeilenzahl unverändert 188,
kein neuer `any`-Typ (CQ02-Zählung unverändert).

## Task 2 — Brand-Konfig `massage.ts` anlegen

Analog `config/brands/mentolder.ts` aufbauen, alle Inhalte aus T901021
§1+§2, keine erfundenen Credentials, keine Heilkunde-Claims:

- `brand: 'massage'`.
- `meta`: siteTitle `Massagepraxis Vögelsen`, siteDescription aus §2
  (Auszeit für Rücken und Schultern, Termine auf Anfrage in Vögelsen
  bei Lüneburg, Entspannung und Wohlbefinden).
- `contact`: name/email/phone strikt über `process.env` mit
  Leerstring-Fallback (S3, keine hartcodierten Domains), city über
  `process.env.CONTACT_CITY` mit Default `Vögelsen bei Lüneburg`.
  Einzige öffentlich sichtbare Ortsangabe im ganzen Partial.
- `legal`: alle Felder über `process.env` mit Leerstring-Fallback,
  tagline `Massagepraxis Vögelsen`. Keine Kammer-, USt- oder
  Adressangaben erfinden.
- `navigation` nach §1 (kein Referenzen-Eintrag): Leistungen
  (`/leistungen`), Über mich (`/ueber-mich`), Häufige Fragen (`/faq`),
  Kontakt (`/kontakt`).
- `footer`: eine Spalte `Rechtliches` mit Impressum und Datenschutz
  (MVP-Umfang aus §1, keine weiteren Links), copyright-Zeile mit
  dynamischem Jahr wie in der Vorlage.
- `homepage`: stats aus §2-Fakten (30 Min. Rückenmassage, 60/90 Min.
  Ganzkörpermassage, 3 Schritte Anfrage bis Besuch, Mo–Fr Kernzeiten
  plus flexible Slots); servicesHeadline/-subheadline,
  whyMeHeadline/-intro/-points aus §2 Vertrauen (Praxis vor Ort,
  feste Hände, ruhige Atmosphäre, Ablauf in drei Schritten);
  `avatarType: 'initials'` mit Initiale `M`; `identityImage` auf
  `slot:slot-portrait-inhaberin`; quote als kurzer Entwurf aus §2-Ton,
  quoteName `Massagepraxis Vögelsen`; `timeline: false`.
- `services`: zwei Einträge `rueckenmassage` (30 Min.) und
  `ganzkoerpermassage` (60/90 Min.), jedes `price` exakt
  `Preis folgt`, `icon` als Emoji ohne `iconSpriteId` (kein
  Massage-Sprite vorhanden, Emoji-Fallback greift), `pageContent`
  mit headline/intro/forWhom/sections/pricing/faq aus §2 plus
  Disclaimer-Satz `Zur Entspannung und für das Wohlbefinden —
  keine Behandlung von Krankheiten.`, kein `stripeServiceKey`.
- `leistungen`: eine Kategorie `Massage-Anwendungen` mit drei
  Services (Rücken 30 mit `durationMin: 30`, Ganzkörper 60/90 mit
  `durationMin: 60/90`), jeder `price` exakt `Preis folgt`.
- `leistungenPricingHighlight`: Hinweis auf Zahlung vor Ort mit
  Rechnung, Preis exakt `Preis folgt`.
- `uebermich`: pageHeadline `Über mich`, introParagraphs als
  Kurzporträt-Entwurf mit `[slot:slot-inhaberin-name]` und
  `[slot:slot-inhaberin-qualifikation]`, milestones ohne erfundene
  Daten (genau ein Eintrag Praxis in Vögelsen bei Lüneburg),
  `notDoing` mit Eintrag gegen Krankheitsbehandlung (Wortlaut mit
  Verneinung, siehe Task 7), privateText kurz mit fester Ortsangabe
  `Vögelsen bei Lüneburg`, kein `warumdieserName`.
- `kontakt`: intro/sidebarTitle/sidebarText/sidebarCta aus §2
  (Anfrage, Bestätigung durch die Inhaberin, Rückruf-Zusage,
  Hinweis `lieber anrufen?` neben dem CTA), `showPhone: false`
  (Nummer ist `slot:slot-telefon`), footerCity
  `Vögelsen bei Lüneburg`.
- `faq`: fünf Einträge aus §2 (Mindestvorlauf, Bestätigung,
  Hausbesuche nur für bekannte Kunden, Zahlung vor Ort mit
  Rechnung, Absage mit Verweis auf `[slot:slot-storno-regel]`).
- `leistungenCta`: `{ href: '/kontakt', text: 'Termin anfragen' }`.
- `features`: alle vier Flags `false` (kein Portal, Login,
  Newsletter — §1).
- Kein `referenzen`, kein `i18n` (keine Mehrsprachigkeit im MVP).
- Nur ein Type-Import aus `../types`, keine weiteren Importe (S2,
  keine Zyklen).

Akzeptanz: Datei kompiliert im Projektverbund (`eslint` ohne Fehler),
bleibt bei 450 Zeilen oder darunter, enthält keine Zeichenkette
`mentolder.de` oder `korczewski.de`, enthält kein `any`, alle Preise
lauten exakt `Preis folgt`, alle Slot-Referenzen stammen aus dem
Register.

## Task 3 — Richtung-A-Token-Satz `colors_and_type.css`

Die Struktur der Vorlage übernehmen (Token-Blöcke, Typ-Skala, Radien,
Abstände, Layout, Motion, semantische Klassen), Werte aus Richtung A
(T901021 §4, gewählt): Seitenbasis Papierweiß `#FDFCF9`, Tinte
`#2A2620`, Salbei `#7D9B76`, Messing-Akzent `#B98A3E`, Creme
`#F1EAD9` ausschließlich für alternierende Sektionsflächen.

Steps:

1. Verzeichnis `components/website/public/brand/massage/` anlegen.
2. Datei schreiben: helles Theme (`body`-Hintergrund Papierweiß,
   Text Tinte), Variablen `--paper`, `--paper-2` (Creme),
   `--fg`/`--fg-soft`/`--mute` auf Tinte-Abstufungen, `--sage`,
   `--brass`/`--brass-2`, dazu `--line`/`--line-2` als dunkle
   Haarlinien auf hellem Grund. Skala, Radien, Abstände, Layout
   und Motion aus der Vorlage übernehmen.
3. Fonts: `--serif: "Fraunces", Georgia, serif`,
   `--sans: "Karla", ui-sans-serif, system-ui, sans-serif`, Mono
   aus der Vorlage. Die woff2-Dateien selbst gehören nicht zu
   diesem Partial; eine markierte `@font-face`-Sektion als
   Anschlussstelle mit Fallback-Hinweis vorsehen.
4. Anti-Slop-Regeln aus §7 fest verdrahten: kein vollflächiges
   Creme (`body`-Hintergrund ist Papierweiß, Creme nur über
   Sektionsklasse), keine Gradient-Headlines, `h1 em`-Akzent in
   Messing statt Verlauf, `prefers-reduced-motion`-Block wie in
   der Vorlage.

Akzeptanz: Datei parst als CSS (kein Linter-Fehler im
Projekt-Check), `body`-Hintergrund ist exakt `#FDFCF9`, alle fünf
Richtungs-Hexwerte kommen vor, die `prefers-reduced-motion`-Regel
ist enthalten.

## Task 4 — `favicon.svg` anlegen

Aufbau nach `public/brand/korczewski/favicon.svg` (32x32,
`viewBox="0 0 32 32"`, abgerundetes Quadrat): Grundfläche Tinte
`#2A2620`, schlichtes Zeichen aus Salbei `#7D9B76` und Messing
`#B98A3E` (flache Formen, kein Text, keine Verläufe nötig).

Steps:

1. Datei schreiben, nur absolut notwendige Elemente.
2. XML-Gültigkeit prüfen:
   `python3 -c "import xml.etree.ElementTree as x;
   x.parse('components/website/public/brand/massage/favicon.svg')"`.

Akzeptanz: SVG parst, misst 32x32, verwendet ausschließlich die
Richtungs-Palette, enthält kein Textelement.

## Task 5 — Struktur-Bundles (seo, navigation, footer, stammdaten)

Schemas aus `content/mentolder/*.json` übernehmen, Inhalte aus
T901021 §1+§2:

- `seo.json`: `titles`/`descriptions` für home, leistungen, kontakt,
  faq, ueber-mich mit Praxisnamen und Ort, `ogImages` als leeres
  Objekt (Karte folgt später, kein Scope).
- `navigation.json`: dieselben vier Links wie `massage.ts`-Navigation
  (Leistungen, Über mich, Häufige Fragen, Kontakt) mit
  aufsteigendem `order`.
- `footer.json`: Spalte `Rechtliches` mit Impressum und Datenschutz,
  copyright-Zeile mit Jahr 2026.
- `stammdaten.json`: name `[slot:slot-inhaberin-name]`, role
  `Massagepraxis`, email/phone über Slot (`slot:slot-telefon` für
  phone, email leer lassen), city `Vögelsen bei Lüneburg`, street
  und zip leer (Anfahrt erst nach bestätigter Buchung), ustId und
  website leer, `avatarInitials: 'M'`.

Akzeptanz: alle vier Dateien parsen mit `jq`, Pflichtkeys je Schema
vorhanden (`jq -e` je Datei), einzige Ortsangabe ist
`Vögelsen bei Lüneburg`, keine Slot-ID außerhalb des Registers.

## Task 6 — Inhalts-Bundles (homepage, leistungen, faq, kontakt, ueber-mich)

Schemas aus den Mentolder-Bundles, alle Texte aus T901021 §2:

- `homepage.json`: hero mit Titel `Massagepraxis Vögelsen — Auszeit
  für Rücken und Schultern.`, Subline zu Anfrage und Bestätigung,
  CTA-Texte `Termin anfragen` / `Leistungen ansehen`; stats wie in
  Task 2; `processSteps` mit genau drei Schritten
  (Anfrage, Bestätigung, Besuch); whyMe-Punkte aus §2 Vertrauen;
  `avatarType: 'image'` mit `avatarSrc: 'slot:slot-portrait-inhaberin'`.
- `leistungen.json`: eine Kategorie wie in Task 2, jeder `price`
  exakt `Preis folgt`, Hinweis-Satz zu Entspannung und
  Wohlbefinden in der Kategorie-`description`, Disclaimer in jedem
  Service-`desc` oder einmalig in der Kategorie (einmalig reicht,
  dann aber exakt der Task-2-Wortlaut).
- `faq.json`: fünf Frage-Antwort-Paare wie in Task 2.
- `kontakt.json`: Felder wie in der Vorlage, Werte wie Task 2
  (`showPhone: false`, footerCity `Vögelsen bei Lüneburg`).
- `ueber-mich.json`: Felder wie Task 2 (`introParagraphs` mit den
  beiden Text-Slots, genau ein Milestone ohne erfundene Daten,
  `notDoing` mit verneinter Krankheitsbehandlung, `privateText`
  mit fester Ortsangabe, kein `warumdieserName`).

Akzeptanz: alle fünf Dateien parsen mit `jq`, jeder Preis im Partial
lautet exakt `Preis folgt`, Profil- und Foto-Felder verweisen nur auf
Register-Slots, kein Text enthält einen Heilkunde-Claim (Nachweis in
Task 7).

## Task 7 — Verify: Claims, Slots, Budgets, Gates

Steps (alle Befehle laufen im Worktree-Root, JSON-Pfad kurz als
`M=components/website/content/massage`):

1. JSON-Gültigkeit plus Anker:
   ```bash
   for f in components/website/content/massage/*.json; do jq -e . "$f" >/dev/null; done
   echo "Anker: dateien=$(ls components/website/content/massage/*.json | wc -l)"
   ```
   Erwartet: kein Fehler, Anker meldet 9.
2. Claim-Filter (Stämme nur in verneinten Sätzen erlaubt):
   ```bash
   grep -rniE 'heil|therap|diagnos|linder|behandl' \
     components/website/content/massage \
     components/website/src/config/brands/massage.ts \
     | grep -viE 'keine? |ohne |nicht ' ; test $? -eq 1
   echo "Anker: geprüft=$(grep -rli . components/website/content/massage | wc -l)"
   ```
   Erwartet: kein Treffer außerhalb verneinter Sätze, Anker über 0.
3. Slot-Register-Abgleich (exakte Übereinstimmung gefordert):
   ```bash
   grep -rhoE 'slot:[a-z0-9-]+' components/website/content/massage \
     components/website/src/config/brands/massage.ts | sort -u > /tmp/slots-ist.txt
   printf '%s\n' slot-inhaberin-name slot-inhaberin-qualifikation \
     slot-portrait-inhaberin slot-praxis-raum slot-stimmung-01 \
     slot-storno-regel slot-telefon | sed 's/^/slot:/' | sort -u > /tmp/slots-soll.txt
   diff /tmp/slots-soll.txt /tmp/slots-ist.txt
   echo "Anker: soll=$(wc -l < /tmp/slots-soll.txt) ist=$(wc -l < /tmp/slots-ist.txt)"
   ```
   Erwartet: kein Diff, Anker meldet beidseitig 7.
4. S1-Budgets:
   ```bash
   wc -l components/website/src/config/types.ts
   wc -l components/website/src/config/brands/massage.ts
   jq -r '."S1:components/website/src/config/types.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
   ```
   Erwartet: types.ts 188 Zeilen, massage.ts 450 oder weniger,
   types.ts nicht-baselined (Restbudget 712 gegen Limit 900).
5. S3 plus CQ02:
   ```bash
   grep -rn 'mentolder\.de\|korczewski\.de' components/website/content/massage \
     components/website/src/config/brands/massage.ts \
     components/website/public/brand/massage/ ; test $? -eq 1
   grep -n ': any\|<any>\|as any' components/website/src/config/brands/massage.ts ; test $? -eq 1
   echo "Anker: suchraum=$(find components/website/content/massage components/website/public/brand/massage -type f | wc -l)"
   ```
   Erwartet: keine Hostnamen, kein `any`, Anker über 0.
6. Lint plus Pflicht-Trio:
   ```bash
   (cd components/website && npx eslint src/config/brands/massage.ts src/config/types.ts --max-warnings 0)
   task test:changed
   task freshness:regenerate
   task freshness:check
   ```
   Erwartet: alles grün.

Akzeptanz: alle sechs Steps grün, keine Baseline-Änderung, keine neue
Test-Inventar-Datei nötig (keine Test-Target-Files in diesem Partial).

## S1-Budget-Notizen

- `components/website/src/config/types.ts` Ist 188, nicht-baselined,
  `.ts`-Limit 900 → Restbudget 712. Task 1 ist zeilenneutral
  (eine Zeile geändert), das Budget bleibt 712.
- `components/website/src/config/brands/massage.ts` ist neu gegen
  Limit 900; Ziel 450 oder weniger lässt über 50 Prozent Reserve
  (Vorlage 428 Zeilen). Kein Split nötig.
- CSS-, SVG- und JSON-Dateien fallen unter kein S1-Extension-Limit
  (`gates.yaml` listet nur Code-Extensions); trotzdem schlank
  halten (CSS in Vorlage-Größenordnung, JSON ein Eintrag pro
  Bundle-Schema ohne Dubletten).
- Baseline-Wachstum ist verboten: Dieser Partial fügt keinen
  Baseline-Key hinzu und ändert keine baselined Datei.

## Scope-Grenzen (gehört explizit nicht zu diesem Partial)

- `src/config/index.ts` (Brand-Auswahl per `BRAND`-Env, 6 Zeilen):
  Die Verdrahtung des `massage`-Zweigs übernimmt der Page-Partial.
- Pages (`index.astro`, `leistungen.astro`, `faq.astro`,
  `ueber-mich.astro`, `404.astro`, `impressum.astro`,
  `datenschutz.astro`): eigener Partial.
- Tests (`tests/spec/business-homepage.bats`,
  `src/lib/__tests__/massage-brand.test.ts`) inklusive
  rot→grün-Nachweis (`expected: FAIL`): Test-Partial.
- Font-woff2-Dateien, `og-card.png`, echte Fotos und finale
  Rechtstexte: Anschlussarbeiten nach Owner-Entscheidungen aus
  T901021 §8.

