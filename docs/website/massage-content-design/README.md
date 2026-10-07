# Website-Content und visuelle Richtung (Massagepraxis)

**Ticket:** T901021 · **Epic:** T901016 Homepagedesign · **Stand:** 2026-10-07
**Vorgänger:** T901018, T901019, T901020 (alle done)
**Status:** Content-Entwurf + zwei Richtungen — Auswahl und Owner-Review offen.
Dies ist eine Doku-Chore: Der klickbare Astro-Prototyp ist als Bauspec
beschrieben (Abschnitt 7), seine Implementierung gehört in ein Folge-Feat.

## 1. Seitenstruktur (MVP, klar unter Mentolder-Umfang)

| Seite | Zweck |
|---|---|
| `/` | Hero, Leistungen kurz, Vertrauen, Ablauf, FAQ-Auszug, CTA |
| `/leistungen` | Katalog (T901018-Vorlage), Dauer, Platzhalter-Preise, Hinweise |
| `/ueber-mich` | Profil der Inhaberin (Text/Qualifikation noch offen) |
| `/kontakt` (Anfrage) | Anfrage-Formular + Offline-Alternativen |
| `/faq` | Vorlauf, Bestätigung, Storno (offen), Hausbesuche, Zahlung |
| `/impressum`, `/datenschutz` | Pflichtseiten (T901019) |
| `/404` | Ruhige Fehlerseite mit CTA zurück |

Kein Portal, kein Login, kein Newsletter, keine Mehrsprachigkeit im MVP.

## 2. Content-Entwürfe (alle Texte Entwürfe, keine Heilkunde-Claims)

- **Hero:** „Massagepraxis Vögelsen — Auszeit für Rücken und Schultern.“
  Subline: Termine auf Anfrage, Bestätigung durch die Inhaberin.
  CTA primär „Termin anfragen“, sekundär „Leistungen ansehen“.
- **Leistungen:** Rückenmassage 30 Min., Ganzkörper 60/90 Min.
  (Preise Platzhalter); Hinweis: Entspannung/Wohlbefinden, keine
  Behandlung von Krankheiten (T901019).
- **Profil:** Kurzporträt + Qualifikation — Platzhalter bis Nachweis;
  keine Credentials erfinden.
- **Vertrauen:** Praxis vor Ort, feste Hände, ruhige Atmosphäre;
  Ablauf-Anfrage→Bestätigung→Besuch in drei Schritten.
- **Besuchsinfos:** Vögelsen bei Lüneburg; genaue Anfahrt/Zugang erst
  nach bestätigter Buchung (T901019); Kernzeiten Mo–Fr + flexible Slots.
- **FAQ:** Warum erst am Vortag? (Mindestvorlauf), Wann ist der Termin
  fix? (erst nach Bestätigung), Hausbesuche? (nur bekannte Kunden),
  Wie zahlen? (vor Ort, Rechnung), Absagen? (Regel offen).
- **Offline-Alternativen:** Telefonnummer (offen) + Rückruf-Zusage;
  Formular-Hinweis „lieber anrufen?“ direkt neben dem CTA.

## 3. Journeys und Buchungszustände

- **Erstbesucherin (mobil):** Hero → Leistungen → FAQ → Anfrage →
  Bestätigungsmail („wir melden uns“) → Zusage → Anfahrt → Besuch.
- **Stammkundin:** Direkt Anfrage mit Wunschtermin; keine Auto-Freigabe.
- **Nicht-online-Bucher:** Telefon → Inhaberin trägt manuell ein.
- **Zustände:** `offen` (unbestätigt) → `bestätigt` / `abgelehnt`;
  später `erinnert`, `abgeschlossen`, `storniert`. Jede Zustandsänderung
  ist Inhaber-Aktion mit Nachricht an den Kunden.

## 4. Zwei visuelle Richtungen (Auswahl offen)

### Richtung A — „Ruhige Wärme“ (Tendenz)

- Stimmung: warm, ruhig, persönlich; viel Weißraum, weiche Radien.
- Palette: warmes Papierweiß `#FDFCF9` als Seitenbasis (kein
  vollflächiges Creme), Tinte `#2A2620`, Salbei `#7D9B76`,
  Messing-Akzent `#B98A3E`; Creme-Ton `#F1EAD9` nur für
  alternierende Sektionsflächen. Serifen-Headlines (Fraunces,
  selbst-gehostet), Grotesk-Body (Karla, selbst-gehostet).
- Passt zu Wellness-Positionierung und Profil-Fotografie.

### Richtung B — „Klare Ordnung“

- Stimmung: sachlich, aufgeräumt, praxisnah; Raster, Karten, klare Kanten.
- Palette: kühles Weiß `#F7F9FA`, Tinte `#16202A`, Petrol `#2E7D74`,
  Sand-Akzent `#D9C9A8`; Archivo (Headlines, semibold) + Atkinson
  Hyperlegible (Body, selbst-gehostet), wenig Deko.
- Passt zu Termin- und Info-Dichte, wirkt distanzierter.

### Auswahl-Checkliste für Owner/Abstimmung

- [ ] Welche Richtung fühlt sich „nach uns“ an? (je 1 Satz begründen)
- [ ] Profilfoto-Stil dazu passend? (warm/porträt vs. neutral/sachlich)
- [ ] Lesbarkeit mobil auf 360px geprüft?
- [ ] Entscheidung + Datum dokumentiert (Kommentar an dieses Ticket)

## 5. Design-Tokens (Vorschlag, neuer Brand-Ordner)

Analog zu `components/website/public/brand/mentolder/colors_and_type.css`
(einzige Token-Quelle je Brand, verifiziert 2026-10-07):

- Neuer Ordner `components/website/public/brand/massage/` mit
  `colors_and_type.css`, `favicon.svg`, `og-card.png` (später),
  `BrandConfig`-Eintrag analog `src/config/brands/mentolder.ts`.
- Tokens je Richtung als CSS-Variablen (`--bg`, `--ink`, `--fg`,
  `--accent`, `--accent-2`, Fonts); Auswahl aus Abschnitt 4 legt fest,
  welcher Satz gebaut wird.
- Fotos: nur lizenzierte Bilder (Quelle/Owner/Lizenz pro Datei, T901020);
  bis zur Auswahl Platzhalter-Slots mit IDs wie im Korczewski-Brief.

## 6. Komponenten-Provenienz

- **HyperUI Marketing (MIT, Tailwind v4, Copy-Paste):** Header, Hero,
  CTA, FAQ, Pricing, Footer, Kontakt-Formular — als statische Stücke
  übernehmen und auf Brand-Tokens mappen; Lizenzhinweis beilegen.
  Tailwind v4 ist im Website-Stack vorhanden (`@tailwindcss/vite` 4.3.3).
- **Repo-Bestand wiederverwenden:** `Layout.astro`, `Footer.astro`,
  `FAQ.svelte`, `CallToAction.svelte`, `CookieConsent.svelte`;
  `BookingForm.svelte`/`ContactForm.svelte` auf MVP-Zuschnitt prüfen.
- **Svelte nur bei Interaktion:** Formular-Validierung, FAQ-Akkordeon,
  Consent — statische Sections bleiben Astro.
- **Fotos/Grafiken:** keine Auswahl getroffen; Slots + Lizenzfelder
  kommen aus dem Design-Repo-Plan (T901020), nicht aus diesem Ticket.

## 7. Prototyp-Bauspec (Folge-Feat, hier nur beschrieben)

- Repräsentativer Prototyp: Header, Hero, Leistungs-Sektion, CTA —
  responsiv (360/768/1280px), mit echten Content-Entwürfen aus
  Abschnitt 2 und Token-Satz der gewählten Richtung.
- Akzeptanz: mobil lesbar ohne Horizontal-Scroll, CTA immer erreichbar,
  Lighthouse ohne neue Fehler, keine Heilkunde-Claims im Text,
  Anti-Slop-Filter (kein vollflächiges Creme, keine Gradient-Headlines,
  keine generischen 3-Card-/Bento-Raster, `prefers-reduced-motion`
  respektiert).
- Umsetzung erst nach Richtungs-Auswahl (Abschnitt 4) — nicht Teil
  dieser Chore (kein UI-Code hier).

## 8. Offene Punkte

- Richtungs-Auswahl mit Owner (Abschnitt 4).
- Finaler Name, echte Preise, Profiltext + Qualifikationsnachweis.
- Lizenzierte Fotos (Porträt, Praxis, Stimmungsbilder).
- Adressdetails öffentlich, Telefonnummer, Storno-/No-Show-Regeln.
- Fragebogen-Antworten der Inhaberin (stehen weiter aus).

## Referenzen

- T901018 Business-Brief, T901019 Anforderungen, T901020 Reuse-Bewertung.
- Format-Vorbild: `docs/website/korczewski-design-brief/README.md`.
- Tokens: `components/website/public/brand/mentolder/colors_and_type.css`.
- HyperUI: MIT, Marketing-Kollektion (Header/Hero/CTA/FAQ/Pricing/Footer),
  verifiziert per Web-Recherche 2026-10-07; Lizenz-Evidenz siehe T901020.
