---
title: Plan: Website SEO-Metadaten-Editor
ticket_id: 3e6d6927-09eb-4fb7-b236-cc6ce734f07d
domains: [website]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: batch-2026-06-10
parent_feature: null
depends_on_plans: []
---

# Plan: Website SEO-Metadaten-Editor

**Ticket:** 3e6d6927
**Branch:** feature/3e6d6927-seo-metadata-editor
**Datum:** 2026-06-10
**Status:** staged

---

## Ziel

Den bestehenden SEO-Editor von einer hartkodierten 10-Seiten-Liste auf ein dynamisches System umstellen, das alle öffentlichen Seiten unterstützt. Pro Seite: Meta-Title, Meta-Description (mit Zeichenzähler) und OG-Bild (Upload mit Brand-Default-Fallback) editierbar im Admin-UI. Zusätzlich eine dynamische Sitemap-Route (`/sitemap.xml`) für beide Brands.

## Architektur

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `website/src/pages/api/admin/seo/pages.ts` | Liefert dynamische Seitenliste (statisch + Services + Custom) |
| `website/src/pages/api/admin/seo/upload-og-image.ts` | Multipart-Upload für OG-Bilder (base64 Data URL) |
| `website/src/pages/sitemap.xml.ts` | Dynamische Sitemap-Generierung (SSR endpoint) |

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `website/src/components/admin/SeoEditor.svelte` | PAGES-Array entfernen, dynamisch laden, OG-Bild-Upload pro Seite, Titel-Zeichenzaehler |
| `website/src/pages/api/admin/seo/index.ts` | Query um `seo_og_image_%` erweitern, `ogImages` im Response |
| `website/src/pages/api/admin/seo/save.ts` | `ALLOWED_PAGE_KEYS` entfernen, `ogImage`-Feld unterstuetzen |
| `website/src/layouts/Layout.astro` | Neuer Prop `ogImage?: string`, og:image/twitter:image dynamisch |
| `website/src/lib/website-db.ts` | Neue Helper: `getSeoOgImage()`, `getSeoMeta()` (sammelt Title+Desc+OgImage) |
| `website/src/pages/index.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/kontakt.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/ueber-mich.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/[service].astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/referenzen.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/leistungen.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/impressum.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/datenschutz.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/agb.astro` | OG-Bild aus DB laden, an Layout uebergeben |
| `website/src/pages/barrierefreiheit.astro` | OG-Bild aus DB laden, an Layout uebergeben |

### Nicht geaendert

- `site_settings` Tabelle (kein DDL-Change, Key-Value-Store reicht)
- `config/brands/*.ts` (keine Brand-Config-Aenderungen)
- `InhalteEditor.svelte` (SeoEditor wird weiterhin via `activeSection === 'seo'` gerendert)
- `website/src/lib/admin/schemas/seo.ts` (wird vom SeoEditor nicht genutzt)
- `astro.config.mjs` (kein @astrojs/sitemap Plugin, output: 'server')

## Tech Stack

- Svelte 5 (Runes: `$state`, `$effect`, `$props`)
- TypeScript
- PostgreSQL via `pg` pool (site_settings Tabelle)
- Astro SSR endpoints (output: 'server', adapter: node standalone)
- Tailwind CSS (bestehende Dark-Theme-Klassen)
- Multipart FormData Upload (base64 Data URL Pattern)

## Tasks

- [ ] **T1 — Helper-Funktionen in website-db.ts:** `getSeoOgImage(brand, pageKey)` und `getSeoMeta(brand, pageKey)` hinzufuegen. `getSeoMeta` lädt `seo_title_<key>`, `seo_meta_desc_<key>`, `seo_og_image_<key>` in einem DB-Call und gibt `{ title, description, ogImage }` zurueck (alle nullbar). Insert nach `getSeoTitle()` bei Zeile ~1073.

- [ ] **T2 — API: /api/admin/seo/pages.ts:** Neuer GET-Endpunkt der die dynamische Seitenliste liefert. Statische Seiten (hardcoded Array: home, kontakt, ueber-mich, leistungen, referenzen, impressum, datenschutz, agb, barrierefreiheit, termin, cookie-einstellungen, 404) + `getEffectiveServices()` fuer Service-Slugs + `listCustomSections()` fuer Custom Pages. Auth: `getSession` + `isAdmin`. Response: `{ pages: Array<{ key, label, path, fallbackTitle?, fallbackDesc? }> }`.

- [ ] **T3 — API: /api/admin/seo/upload-og-image.ts:** Multipart-Upload analog `upload-logo.ts`. Max 2 MB, MIME: jpeg/png/webp. Gibt `{ src: "data:..." }` zurueck. Kein DB-Schreibvorgang — der Client speichert den Data-URL ueber `/api/admin/seo/save`.

- [ ] **T4 — API: /api/admin/seo/index.ts erweitern:** SQL-Query um `OR key LIKE 'seo_og_image_%'` ergaenzen. Loop erweitert um `ogImages` Record. Response: `{ descriptions, titles, ogImages }`.

- [ ] **T5 — API: /api/admin/seo/save.ts erweitern:** `ALLOWED_PAGE_KEYS`-Array und Validierung entfernen (alle pageKeys akzeptieren). Neues optionales Feld `ogImage` im Body. Wenn `ogImage` als String vorhanden und nicht-leer: `setSiteSetting(BRAND, 'seo_og_image_<pageKey>', ogImage)`. Wenn `ogImage` null oder leer: `DELETE FROM site_settings WHERE brand=$1 AND key='seo_og_image_<pageKey>'` (Reset auf Default).

- [ ] **T6 — Layout.astro: ogImage-Prop:** Neuen optionalen Prop `ogImage?: string` zum Interface hinzufuegen. In beiden Brand-Branches (isKore/mentolder): wenn `ogImage` gesetzt, diesen Wert fuer `og:image` und `twitter:image` verwenden; sonst Brand-Default (`/brand/<brand>/og-image.png`).

- [ ] **T7 — SeoEditor.svelte refactoren:** (a) `PAGES`-Array und `PageDef`-Type entfernen. (b) `load()` ruft `/api/admin/seo/pages` ab und speichert Seitenliste in `$state`. (c) Zusaetzlicher fetch von `/api/admin/seo` fuer bestehende descriptions/titles/ogImages. (d) Pro Seite: OG-Bild-Sektion mit Upload-Button, Vorschau (Thumbnail wenn gesetzt), Entfernen-Button. (e) Titel-Zeichenzaehler (50–70 Zeichen Ziel) hinzufuegen. (f) `save()` sendet `ogImage`-Feld mit. Upload-Flow: User klickt Upload-Button → File-Dialog → `/api/admin/seo/upload-og-image` → Data-URL in state → "Speichern" schreibt via `/api/admin/seo/save`.

- [ ] **T8 — Statische Seiten: OG-Bild laden und an Layout uebergeben:** In `index.astro`, `kontakt.astro`, `ueber-mich.astro`, `referenzen.astro`, `leistungen.astro`, `impressum.astro`, `datenschutz.astro`, `agb.astro`, `barrierefreiheit.astro`: `getSeoOgImage(BRAND_ID, '<pageKey>')` aufrufen und als `ogImage`-Prop an `<Layout>` uebergeben. Fuer Seiten die bereits `getSeoTitle`/`getSiteSetting` fuer SEO nutzen, kann `getSeoMeta()` verwendet werden um DB-Calls zu bündeln.

- [ ] **T9 — [service].astro: OG-Bild laden:** In `website/src/pages/[service].astro`: `getSeoOgImage(BRAND_ID, service)` aufrufen und an Layout uebergeben.

- [ ] **T10 — Sitemap-Route: /sitemap.xml.ts:** Neuer Astro-Endpoint `website/src/pages/sitemap.xml.ts`. Export `GET`. Generiert XML-Sitemap aus: (1) Statische Seiten-Liste, (2) `getEffectiveServices()` (nicht-hidden), (3) `listCustomSections()`. Domain aus `BRAND` env: mentolder → `https://web.mentolder.de`, korczewski → `https://web.korczewski.de`. Content-Type: `application/xml`. Kein Auth noetig (oeffentlich).

- [ ] **T11 — Verifikation: task test:all und manuelle Checks:** `task test:all` muss gruen sein. Manuell: Admin → Inhalte → SEO-Tab: Seitenliste wird dynamisch geladen, OG-Bild-Upload funktioniert, Zeichenzaehler korrekt. `/sitemap.xml` im Browser oeffnen: alle Seiten aufgelistet. Beide Brands testen.

## Verifikation

### Lokal

- `task test:all` gruen
- `npm --prefix website run test:unit` gruen (falls Unit-Tests betroffen)
- Admin → Inhalte → SEO: Dynamische Seitenliste sichtbar (mehr als die alten 10)
- OG-Bild Upload: Datei auswaehlen → Vorschau erscheint → Speichern → Bild bleibt nach Reload
- OG-Bild Entfernen: "Entfernen" klicken → Speichern → Default-Bild wird wieder verwendet
- Zeichenzaehler: Title 50–70 gruen, Description 120–160 gruen
- `/sitemap.xml` oeffnen: Gueltiges XML mit allen Seiten
- Layout `<head>`: `og:image` zeigt per-page Bild wenn gesetzt, sonst Brand-Default

### CI

- `task test:all` gruen
- `task workspace:validate` gruen (Manifest-Validierung)
- PR-Titel: Conventional Commit Format

### Akzeptanzkriterien-Checkliste

- [ ] Meta-Title pro Seite editierbar (alle Seiten, nicht nur die alten 9)
- [ ] Meta-Description pro Seite editierbar mit Zeichenzaehler (160 Zeichen Ziel)
- [ ] OG-Title = Meta-Title (kein separates Feld)
- [ ] OG-Bild Upload pro Seite mit Default-Fallback auf `/brand/<brand>/og-image.png`
- [ ] Sitemap-Generierung via `/sitemap.xml` (dynamisch, SSR)
- [ ] Beide Brands unterstuetzt (mentolder + korczewski)
- [ ] Bestehende SEO-Werte bleiben erhalten (backward-compatible)
