# SEO-Metadaten-Editor — Design Spec
**Datum:** 2026-06-10
**Branch:** feature/3e6d6927-seo-metadata-editor
**Ticket:** 3e6d6927

---

## Ziel

Der bestehende SEO-Editor (`SeoEditor.svelte`) wird von einer hartkodierten Seitenliste auf ein dynamisches, seitenagnostisches System umgestellt. Pro Seite können Admins im Admin-UI bearbeiten:

- **Meta-Title** (bereits vorhanden, erweitert für alle Seiten)
- **Meta-Description** mit Zeichenzähler (120–160 Zeichen Zielbereich, bereits vorhanden)
- **OG-Bild** als Upload pro Seite mit Default-Fallback auf `/brand/<brand>/og-image.png`

OG-Title ist identisch mit Meta-Title (kein separates Feld). Eine dynamische Sitemap-Route (`/sitemap.xml`) generiert automatisch alle öffentlichen Seiten für beide Brands.

---

## Design

### 1. Dynamische Seiten-Erkennung

Der SeoEditor lädt die Liste aller SEO-relevanten Seiten vom Server statt sie hartzukodieren.

**API: `GET /api/admin/seo/pages`**

Liefert alle Seiten mit Slug, Label und optionalem Fallback-Titel/Description. Quellen:

1. Statische Seiten: `index`, `kontakt`, `ueber-mich`, `leistungen`, `referenzen`, `impressum`, `datenschutz`, `agb`, `barrierefreiheit`, `termin`, `cookie-einstellungen`, `404`
2. Dynamische Service-Seiten: aus `getEffectiveServices()` — alle nicht-hidden Services mit Slug
3. Custom Sections: aus `listCustomSections()` — für benutzerdefinierte öffentliche Seiten

Response-Shape:
```json
{
  "pages": [
    { "key": "home", "label": "Startseite", "path": "/", "fallbackTitle": "...", "fallbackDesc": "..." },
    { "key": "coaching", "label": "/coaching", "path": "/coaching", "fallbackTitle": "...", "fallbackDesc": "..." }
  ]
}
```

### 2. OG-Bild Upload

**API: `POST /api/admin/seo/upload-og-image`**

Multipart-Upload analog zu `upload-logo.ts`:
- Max. 2 MB
- Erlaubte MIME-Types: `image/jpeg`, `image/png`, `image/webp`
- Rückgabe: `{ src: "data:image/...;base64,..." }` (base64 Data URL)

**Speicherung:** Der Data-URL wird als `site_settings` key `seo_og_image_<pageKey>` gespeichert (identisch zum Portrait/Logo-Pattern).

**Default-Fallback:** Wenn kein per-page OG-Bild gesetzt ist, verwendet `Layout.astro` den Brand-Default:
- Mentolder: `/brand/mentolder/og-image.png`
- Korczewski: `/brand/korczewski/og-image.png`

### 3. SeoEditor.svelte — Erweiterung

Die bestehende Komponente wird refactored:

- **PAGES-Array entfernen** — stattdessen `load()` ruft `/api/admin/seo/pages` ab
- **OG-Bild-Sektion pro Seite** hinzufügen:
  - Upload-Button mit Vorschau des aktuellen Bildes
  - "Default verwenden"-Hinweis wenn kein Bild gesetzt
  - Entfernen-Button um auf Default zurückzufallen
- **Zeichenzähler** bleibt unverändert (120–160 Zeichen für Description)
- **Titel-Zeichenzähler** hinzufügen (50–70 Zeichen Zielbereich)

### 4. Layout.astro — OG-Bild Props

`Layout.astro` erhält einen neuen optionalen Prop `ogImage?: string`.

- Wenn `ogImage` gesetzt: verwendet diesen Wert für `og:image` und `twitter:image`
- Wenn nicht gesetzt: verwendet den Brand-Default (`/brand/<brand>/og-image.png`)

### 5. Seiten — OG-Bild aus DB laden

Jede öffentliche Seite lädt das OG-Bild aus der DB:
```typescript
const ogImage = await getSiteSetting(BRAND_ID, 'seo_og_image_<pageKey>').catch(() => null);
```

und reicht es an `Layout` weiter:
```html
<Layout title={seoTitle} description={seoDesc} ogImage={ogImage} brand={layoutBrand}>
```

Für `[service].astro` (dynamische Service-Seiten) wird der Key `seo_og_image_<slug>` verwendet.

### 6. Helper-Funktion

Neue Funktion in `website-db.ts`:
```typescript
export async function getSeoOgImage(brand: string, pageKey: string): Promise<string | null> {
  return getSiteSetting(brand, `seo_og_image_${pageKey}`).catch(() => null);
}
```

Optional: Sammel-Funktion die Title, Description und OG-Image in einem DB-Call lädt (Performance-Optimierung für Seiten die alle drei Werte brauchen).

### 7. Sitemap-Generierung

**Route: `/sitemap.xml`** (SSR, Astro endpoint)

Generiert eine XML-Sitemap dynamisch aus:
1. Alle statischen Seiten (index, kontakt, ueber-mich, etc.)
2. Alle sichtbaren Service-Seiten aus `getEffectiveServices()`
3. Alle Custom Sections aus `listCustomSections()`

XML-Format: Standard sitemap.xml mit `<url>`, `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>`.

Domain basiert auf Brand:
- Mentolder: `https://web.mentolder.de`
- Korczewski: `https://web.korczewski.de`

`robots.txt` wird nicht benötigt (kein @astrojs/sitemap Plugin, da `output: 'server'`).

### 8. API: `/api/admin/seo/save` — Erweiterung

- `ALLOWED_PAGE_KEYS` entfernen — stattdessen Validierung gegen die dynamische Seitenliste
- Neues optionales Feld `ogImage` im Request-Body (Data-URL-String)
- Wenn `ogImage` leer/null: `seo_og_image_<pageKey>` aus `site_settings` löschen (Reset auf Default)

### 9. API: `/api/admin/seo/index.ts` — Erweiterung

Erweitert die Query um `seo_og_image_%` Keys:
```sql
SELECT key, value FROM site_settings WHERE brand = $1
  AND (key LIKE 'seo_meta_desc_%' OR key LIKE 'seo_title_%' OR key LIKE 'seo_og_image_%')
```

Response erweitert um `ogImages: Record<string, string>`.

---

## Nicht geändert

- `site_settings` Tabelle — kein Schema-Change nötig (Key-Value-Store)
- `config/brands/*.ts` — keine Änderungen an Brand-Configs
- `InhalteEditor.svelte` — SeoEditor wird weiterhin über `activeSection === 'seo'` gerendert
- `seoSchema` in `lib/admin/schemas/seo.ts` — wird nicht aktiv genutzt (SeoEditor hat eigene Logik)

---

## Beide Brands

Alle Änderungen sind bereits brand-scoped durch `BRAND_ID` / `BRAND` Environment-Variable. Die `site_settings` Tabelle hat eine `brand`-Spalte. Der SeoEditor lädt/speichert immer brand-spezifisch. Die Sitemap wird pro Brand generiert (basierend auf der aktuellen Request-Domain oder `BRAND` env).
