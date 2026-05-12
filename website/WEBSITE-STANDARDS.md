# mentolder.de – Website-Standards & Architektur

> Erstellt: 12. Mai 2026  
> Bezugspunkt: Session mit Gerald Korczewski – vollständige Standardisierung des Admin-Bereichs und der Website-Inhalte.

---

## 1. Grundprinzip: Zwei-Gruppen-Modell

Alle Inhalte der Website sind in zwei Gruppen eingeteilt:

### Gruppe A – Zentral (einmal ändern, wirkt überall)

| Inhalt | Wo pflegen | Technische Quelle |
|---|---|---|
| E-Mail, Telefon, Standort | Admin → Kontakt-Tab | `site_settings.kontakt` (JSONB) |
| Footer-Tagline | Admin → Kontakt-Tab | `kontaktOverride.footerTagline` |
| Copyright-Zeile | Admin → Kontakt-Tab | `kontaktOverride.footerCopyright` |
| Header-Standort (`Lüneburg, Hamburg und Umgebung · DE`) | Admin → Kontakt-Tab | `kontaktOverride.footerCity` |
| Footer-Angebotsliste (alle Links) | Admin → Angebote-Tab (Reihenfolge) | `getEffectiveServices()` automatisch |
| Footer-Rechtliches (Links) | Hardcoded in `mentolder.ts footer.columns` | `config.footer.columns` |
| Header-Navigation | Hardcoded in `mentolder.ts navigation` | `config.navigation` |
| SEO: Seitentitel & Meta-Description | Admin → SEO-Tab | `site_settings.seo_title_*` + `seo_meta_desc_*` |

### Gruppe B – Seitenspezifisch (pro Seite pflegen)

Jede Seite hat einen eigenen Admin-Tab mit:
- Seiten-Header (H1, Einleitung)
- Inhaltsblöcke (Für wen, Schwerpunkte, Investition etc.)
- CTA und FAQ

**Wichtig:** SEO (Titel + Meta-Description) ist immer über den **SEO-Tab** zu pflegen, nicht innerhalb der seitenspezifischen Tabs.

---

## 2. Admin-Tabs Übersicht

```
Website-Tab
├── SEO                  ← Gruppe A: alle Seiten-Titel + Meta-Descriptions
├── Startseite           ← Gruppe B: Hero, Stats, Warum-ich, Zitat, Prozess
├── Über mich           ← Gruppe B: Header, Intro, Meilensteine, Privat
├── Coaching             ← Gruppe B: Header, Für wen, Ablauf, CTA, FAQ
├── Führung & Pers.     ← Gruppe B: Header, pers. Notiz, Für wen, Schwerpunkte
├── 50+ digital         ← Gruppe B: Karte, Header, Für wen, Schwerpunkte, Preise
├── KI-Transition       ← Gruppe B: (identisch wie 50+ digital)
├── Beratung            ← Gruppe B: (identisch wie 50+ digital)
├── Angebote            ← Gruppe A+B: Reihenfolge der Karten = Footer-Liste
├── FAQ                 ← Gruppe B: globale FAQ-Seite
├── Kontakt             ← Gruppe A: E-Mail, Telefon, Standort, Tagline, Copyright
├── Referenzen          ← Gruppe B: Gruppen + Einträge
└── Rechtliches         ← Gruppe B: Impressum-Zusatz, Datenschutz, AGB, Barrierefreiheit
```

---

## 3. Datenfluss: Wie Inhalte auf die Website kommen

### Service-Seiten (`/coaching`, `/fuehrung-persoenlichkeit`, `/50plus-digital`, etc.)

```
Admin speichert → /api/admin/service-page/save?slug=<slug>
                → schreibt in service_config (brand, services_json JSONB)

Browser ruft /coaching auf
                → [service].astro → getEffectiveServices()
                → liest service_config aus DB
                → merged mit statischem Fallback aus mentolder.ts
                → rendert Seite
```

### Prioritätskette für jeden Inhalt

```
DB-Override (Admin gespeichert)
  > pageContent.seoTitle/seoDescription (in service_config)
    > config.services[].pageContent (mentolder.ts Fallback)
```

### Kontakt/Footer-Daten

```
Admin → Kontakt-Tab → /api/admin/kontakt/save
       → site_settings (brand='mentolder', key='kontakt', value=JSON)

Footer.astro beim Rendern:
  getEffectiveKontakt() → liest site_settings
  Fallback: config.contact / config.legal (mentolder.ts)
```

### Copyright-Prioritätskette

```
kontaktOverride.footerCopyright (Admin → Kontakt-Tab)
  > config.footer.copyright (mentolder.ts, dynamisch: new Date().getFullYear())
    > Hardcoded Fallback: `© ${Jahr} mentolder — Alle Rechte vorbehalten`
```

---

## 4. Service-Seiten-Architektur

### Seitenstruktur `[service].astro` (Reihenfolge der Blöcke)

```
1. Hero (Eyebrow + H1 + Intro-Text)
2. Persönliche Notiz (__introNote__) – kursiv mit Goldbalken, nur wenn vorhanden
3. "Für wen ist das?" – Grid mit Checkmark-Karten
4. "Schwerpunkte" – Grid der sections (früher: "Leistungsumfang")
5. "Investition" – Preis-Boxen
6. FAQ – nur wenn vorhanden
7. Navigation Prev/Next
8. CallToAction
```

### Das `__introNote__` Muster

Für persönliche, kursiv gesetzte Texte **vor** dem "Für wen"-Block:

```typescript
// In mentolder.ts oder via Admin gespeichert:
sections: [
  {
    title: '__introNote__',  // Spezieller Marker
    items: [
      'Erster Absatz des persönlichen Textes.',
      'Zweiter Absatz (optional).',
    ],
  },
  // ... normale Schwerpunkte folgen
]
```

`[service].astro` filtert `__introNote__` aus den sichtbaren sections heraus und rendert es separat zwischen Intro und "Für wen".

### Statischer Fallback vs. DB-Override

Jede Service-Seite hat zwei Ebenen:

1. **Statischer Fallback** in `website/src/config/brands/mentolder.ts` – wird genutzt solange kein DB-Override existiert
2. **DB-Override** in `service_config` – wird durch Admin-Speichern angelegt, hat immer Vorrang

**Wichtig:** Nach einem Deploy (neues Image) müssen neue Seiten einmal im Admin gespeichert werden, um den DB-Override zu aktivieren.

---

## 5. Admin-Interface Standards

### Einheitliche Tab-Struktur (Reihenfolge von oben nach unten)

```
1. Header-Zeile: Titel + Beschreibung + [Speichern]-Button (rechts, gold)
2. Fehlermeldung/Erfolgsmeldung (wenn vorhanden)
3. Hinweis-Block: zentrale Elemente (goldener Rahmen)
4. Seitenspezifische Inhaltsblöcke
5. (Kein SEO-Block mehr – der gehört in den SEO-Tab)
```

### Hinweis-Block (Standard)

Jeder Admin-Tab zeigt oben einen Hinweis-Block mit Links zu zentralen Bereichen:

```svelte
<div class="p-4 bg-dark-light rounded-xl border border-gold/20 space-y-1">
  <p class="text-xs font-mono uppercase tracking-widest text-gold mb-2">
    Zentral gepflegte Elemente
  </p>
  <p class="text-sm text-muted">
    🔒 <strong class="text-light">SEO (Seitentitel & Meta-Description)</strong>
    → <a href="/admin/inhalte?tab=website&section=seo" class="text-gold hover:underline">SEO-Tab</a>
  </p>
  <p class="text-sm text-muted">
    🔒 <strong class="text-light">Footer & Header-Standort</strong>
    → <a href="/admin/inhalte?tab=website&section=kontakt" class="text-gold hover:underline">Kontakt-Tab</a>
  </p>
</div>
```

### Button-Standards

| Funktion | Style |
|---|---|
| Hauptaktion speichern | `bg-gold text-dark font-semibold` |
| Hinzufügen (+ Frage, + Schritt, etc.) | `bg-gold text-dark rounded-lg text-xs font-semibold` |
| Entfernen | `text-red-400 hover:text-red-300` |
| Pfeile (Reihenfolge) | `text-muted hover:text-light disabled:opacity-30` |
| + Abschnitt (neuer Custom-Tab) | `bg-gold text-dark font-semibold rounded-md` |

### Inhalte immer sichtbar (kein Details/Summary)

Alle Felder werden direkt angezeigt, nicht hinter einem ausklappbaren Element versteckt. Ausnahme: Der "Seiteninhalte (pageContent)"-Bereich in der Angebote-Karte ist als `<details>` versteckt mit dem Hinweis, dass der jeweilige Tab besser geeignet ist.

---

## 6. SEO-Standards

### Seiten im SEO-Tab (alle pflegbar)

| Seite | Key | Hat Titel-Feld |
|---|---|---|
| Startseite | `home` | Ja |
| Kontakt | `kontakt` | Nein |
| Über mich | `ueber-mich` | Ja |
| Angebote | `leistungen` | Nein |
| /coaching | `coaching` | Ja |
| /50plus-digital | `50plus-digital` | Ja |
| /beratung | `beratung` | Ja |
| /ki-transition | `ki-transition` | Ja |
| /fuehrung-persoenlichkeit | `fuehrung-persoenlichkeit` | Ja |
| /referenzen | `referenzen` | Nein |

### Format-Vorgaben

- **Seitentitel:** 50–70 Zeichen, Format: `{Beschreibung} | mentolder.de`
- **Meta-Description:** 120–160 Zeichen, mit Ortsangabe (Lüneburg, Hamburg)
- Der SEO-Editor zeigt einen Zeichenzähler mit Ampel-Farben (grün = gut, gelb = zu kurz, rot = zu lang)

### Korrekte Zahlenwerte

- Führungserfahrung: **30+ Jahre** (nicht 40+)
- IT & Sicherheit-Praxis: **40 Jahre** (korrekt für IT-spezifische Angaben)
- Begleitete Teilnehmer: **50+**

---

## 7. Inhalts-Standards

### Standort
- Korrekt: **"Lüneburg, Hamburg und Umgebung"**
- Im Header: `Lüneburg, Hamburg und Umgebung · DE`
- Im Footer: `Gestaltet in Lüneburg, Hamburg und Umgebung · DE`

### Copyright
- Einheitlich: **`© 2026 mentolder`** (kleines m, wie das Logo)
- Vollständig: `© 2026 mentolder — Alle Rechte vorbehalten`
- Pflegbar über Admin → Kontakt-Tab → "Copyright-Zeile"

### Formulierungen (verifiziert)
- Digital Café: "verantwortlich mitgestaltet" (nicht "geleitet")
- Führungserfahrung: "30+ Jahre" (nicht "40+ Jahre")
- Technische Erfahrung IT/Sicherheit: "40 Jahre"

### Brand-Name
- Immer: **mentolder** (kleines m)
- Nie: Mentolder (großes M) außer am Satzanfang

---

## 8. Footer-Architektur

### Spalten (von links nach rechts)

1. **Brand-Spalte**: Logo + Tagline (aus `kontaktOverride.footerTagline` oder `config.legal.tagline`)
2. **Kontakt-Spalte**: Telefon, E-Mail, Standort (aus `kontaktOverride.*` oder `config.contact.*`)
3. **Angebote-Spalte**: automatisch aus `getEffectiveServices()` – alle nicht-versteckten Services in der Reihenfolge des Angebote-Tabs
4. **Rechtliches-Spalte**: aus `mentolder.ts footer.columns` (hardcoded, ändert sich selten)

### Angebote-Reihenfolge im Footer

Die Reihenfolge der Footer-Links entspricht exakt der Reihenfolge der Leistungskarten im **Angebote-Tab** (Pfeile nutzen). Aktuell:
1. 50+ digital
2. Coaching für Führungskräfte und Menschen in Verantwortung
3. Führung & Persönlichkeit
4. Unternehmensberatung
5. KI-Transition Coaching

### Fußzeile (unterste Zeile)

```
© 2026 mentolder — Alle Rechte vorbehalten    Gestaltet in Lüneburg, Hamburg und Umgebung · DE
```

---

## 9. Datei-Karte

### Konfiguration (statische Fallbacks)

```
website/src/config/
  index.ts                    ← exportiert config = mentolderConfig
  types.ts                    ← TypeScript-Interfaces (BrandConfig, etc.)
  brands/
    mentolder.ts              ← HAUPT-KONFIGURATION: alle Fallback-Inhalte
```

### Öffentliche Seiten

```
website/src/pages/
  index.astro                 ← Startseite (liest getEffectiveHomepage())
  ueber-mich.astro            ← Über-mich-Seite
  referenzen.astro            ← Referenzen
  kontakt.astro               ← Kontakt
  leistungen.astro            ← Angebots-Übersicht
  [service].astro             ← UNIVERSAL-TEMPLATE für alle Service-Seiten
                               (coaching, fuehrung-persoenlichkeit, 50plus-digital,
                                ki-transition, beratung)
  impressum.astro             ← Rechtliches
  datenschutz.astro
  agb.astro
  barrierefreiheit.astro
```

### Admin-Seite

```
website/src/pages/admin/
  inhalte.astro               ← Lädt alle Daten, übergibt an InhalteEditor

website/src/components/admin/
  InhalteEditor.svelte        ← Tab-Router: Website/Newsletter/Fragebögen/etc.
  SeoEditor.svelte            ← SEO-Tab: alle Seiten-Titel + Meta-Descriptions
  inhalte/
    StartseiteSection.svelte
    UebermichSection.svelte
    CoachingSection.svelte
    FuehrungSection.svelte
    ServicePageSection.svelte   ← UNIVERSELL: 50+, KI-Transition, Beratung
    AngeboteSection.svelte
    FaqSection.svelte
    KontaktSection.svelte       ← Gruppe-A-Felder + Copyright
    ReferenzenSection.svelte
    RechtlichesSection.svelte
```

### API-Routen (Admin Save)

```
website/src/pages/api/admin/
  service-page/save.ts        ← UNIVERSAL: speichert für jeden slug in service_config
  coaching/save.ts            ← speichert Coaching in service_config
  fuehrung/save.ts            ← speichert Führung in service_config
  angebote/save.ts            ← speichert Reihenfolge + Karten-Inhalte
  kontakt/save.ts             → speichert in site_settings key='kontakt'
  seo/save.ts                 → speichert in site_settings key='seo_title_*'
  startseite/save.ts
  uebermich/save.ts
  faq/save.ts
  referenzen/save.ts
  legal/{key}/save.ts
```

### Zentrale Lib-Funktionen

```
website/src/lib/
  content.ts                  ← getEffectiveServices(), getEffectiveKontakt(), etc.
  website-db.ts               ← PostgreSQL-Funktionen: getServiceConfig(), saveServiceConfig()
  coaching-content.ts         ← getEffectiveCoaching() – liest aus service_config
  fuehrung-content.ts         ← getEffectiveFuehrung() – liest aus service_config

website/src/components/
  Footer.astro                ← ZENTRAL: rendert alle Footer-Daten dynamisch
  Navigation.svelte           ← ZENTRAL: Header mit Standort-Anzeige
```

### Datenbank-Tabellen

```
service_config              ← brand + services_json (alle Service-Overrides)
site_settings               ← brand + key + value (Kontakt, SEO, Homepage, etc.)
legal_pages                 ← brand + page_key + content_html
referenzen_config           ← brand + items_json
```

---

## 10. CI/CD Pipeline

### Workflow: `.github/workflows/build-website.yml`

Trigger: Jeder Push auf `main` mit Änderungen in `website/**`

```yaml
CONTACT_CITY: "Lüneburg, Hamburg und Umgebung"  # ← kritisch: nicht "Hamburg"
```

### Build-Args (werden als Umgebungsvariablen im Container verfügbar)

Diese Werte sind Build-Zeit-Konstanten und können **nicht** über den Admin geändert werden:
- `CONTACT_EMAIL`, `CONTACT_PHONE`, `CONTACT_NAME`
- `LEGAL_STREET`, `LEGAL_ZIP`, `LEGAL_JOBTITLE`, `LEGAL_UST_ID`

Diese Werte können über den **Admin → Kontakt-Tab** überschrieben werden (DB hat Vorrang):
- `CONTACT_CITY` → `footerCity`
- Footer-Tagline → `footerTagline`
- Copyright → `footerCopyright`

---

## 11. Checkliste für eine neue Service-Seite

```
[ ] 1. Eintrag in mentolder.ts unter services[] hinzufügen:
       - slug (URL-Pfad)
       - title (= Footer-Link-Text)
       - description (kurze Beschreibung)
       - icon (Emoji)
       - features[], price
       - pageContent mit headline, intro, forWhom, sections, pricing
       - seoTitle + seoDescription in pageContent

[ ] 2. Nach Deploy: Im Admin → jeweiliger Tab → einmal Speichern
       ⇒ Aktiviert den DB-Override

[ ] 3. Im Admin → SEO-Tab: Title + Description prüfen/anpassen

[ ] 4. Im Admin → Angebote-Tab: Reihenfolge der Karte prüfen
       ⇒ Steuert Footer-Reihenfolge

[ ] 5. Sicherstellen dass die Seite nicht hidden=true ist
```

---

## 12. Bekannte Fallstricke

### Altes Image nach Deploy
Die Website läuft im Kubernetes-Cluster. Nach einem Code-Commit startet GitHub Actions automatisch einen Build. Bis der neue Pod läuft (∼3-4 Min.) zeigt die Website noch das alte Image. **Im Inkognito-Modus prüfen** um Cache-Effekte auszuschließen.

### CONTACT_CITY im Workflow
Die Datei `.github/workflows/build-website.yml` muss `CONTACT_CITY: "Lüneburg, Hamburg und Umgebung"` enthalten. War früher falsch auf `Hamburg` gesetzt.

### Erster Save nach Deploy
Wenn eine neue Service-Seite in `mentolder.ts` hinzugefügt wurde, muss im Admin einmal Speichern gedrückt werden um den DB-Override anzulegen. Erst dann ist die Seite vollständig über den Admin pflegbar.

### `__introNote__` bleibt unsichtbar im Angebote-Tab
Der Angebote-Tab zeigt alle sections inkl. `__introNote__`. Das ist korrekt – der Marker-Titel wird auf der öffentlichen Seite herausgefiltert und separat gerendert.

### Copyright mit großem M
Früher: `© 2026 Mentolder` (großes M, falsch).  
Jetzt: `© 2026 mentolder` (kleines m, korrekt). Der `brandWord`-Wert in `Footer.astro` wird automatisch aus `config.meta.siteTitle` in Kleinbuchstaben umgewandelt.

---

## 13. Admin-Schnellreferenz

```
URL: https://web.mentolder.de/admin/inhalte

Zentrale Änderungen:
  Standort/E-Mail/Telefon/Tagline/Copyright  → ?tab=website&section=kontakt
  SEO aller Seiten                           → ?tab=website&section=seo
  Footer-Angebotsliste (Reihenfolge)         → ?tab=website&section=angebote

Seitenspezifisch:
  Startseite                                 → ?tab=website&section=startseite
  Über mich                                  → ?tab=website&section=uebermich
  Coaching                                   → ?tab=website&section=coaching
  Führung & Persönlichkeit                   → ?tab=website&section=fuehrung-persoenlichkeit
  50+ digital                                → ?tab=website&section=50plus-digital
  KI-Transition                              → ?tab=website&section=ki-transition
  Beratung                                   → ?tab=website&section=beratung
  FAQ                                        → ?tab=website&section=faq
  Referenzen                                 → ?tab=website&section=referenzen
  Rechtliches (Datenschutz, AGB etc.)        → ?tab=website&section=rechtliches
```
