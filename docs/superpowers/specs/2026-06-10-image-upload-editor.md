# Bild-Upload direkt im HTML-Editor — Design Spec
**Datum:** 2026-06-10  
**Branch:** feature/10283f10-image-upload-editor  
**Ticket:** 10283f10

---

## Ziel

Admins können Bilder direkt aus dem HTML-Editor heraus hochladen — per Drag & Drop auf das Editor-Feld oder über einen Datei-Dialog-Button. Die Bilder werden in `assets.registry` (Schema `assets`) gespeichert und als relative Pfade im HTML eingebettet.

**Geltungsbereich:** Alle drei Editoren die `HtmlEditor.svelte` nutzen:
- `NewsletterAdmin.svelte` (Newsletter-HTML)
- `VertragsvorlagenSection.svelte` (Vertrags-HTML)
- `DokumentEditor.svelte` (Vertragsvorlagen-Compose, nutzt eigene Textarea — wird auf `HtmlEditor.svelte` umgestellt)

Zusätzlich nutzt `InhalteEditor.svelte` indirekt diese Editoren.

---

## Design

### 1. API-Endpunkt: `/api/admin/assets/upload`

Neuer Astro-SSR-Endpunkt für Bild-Uploads.

**Request:** `multipart/form-data` mit Feld `file`  
**Auth:** Admin-Session erforderlich (Pattern aus `upload-logo.ts`)  
**Validierung:**
- Max. 10 MB
- Erlaubte MIME-Types: `image/jpeg`, `image/png`, `image/webp`
- Dateiname wird sanitized (Unicode → ASCII, Whitespace → `-`)

**Speicher-Flow:**
1. Binärdaten in Nextcloud hochladen via `uploadFile()` aus `nextcloud-files.ts`
   - Pfad: `EditorImages/{YYYY-MM}/{uuid}.{ext}`
   - Nextcloud-Folder wird via `ensureFolder()` angelegt
2. Eintrag in `assets.registry` schreiben:
   - `name`: Original-Dateiname
   - `type`: `'image'`
   - `file_path`: `editor-images/{YYYY-MM}/{uuid}.{ext}` (relativ, ohne führendes `EditorImages/`)
   - `metadata`: `{ original_name, size_bytes, mime_type, uploaded_by }`
3. Response: `{ url: "/editor-images/{YYYY-MM}/{uuid}.{ext}", asset_id: "<uuid>" }`

**Warum Nextcloud?** Das Projekt nutzt bereits Nextcloud als persistenten Dateispeicher (siehe `projekte/attachments/upload.ts`). Die Bilder sind dann über die Nextcloud-WebDAV-URL oder einen Proxy-Endpunkt erreichbar.

**Alternative — lokaler Datei-Store:** Falls Nextcloud nicht gewünscht ist, könnte ein `EDITOR_IMAGES_ROOT` env-var (analog zu `EVIDENCE_ROOT`) verwendet werden. Die spec unterstützt beide Varianten; die Implementierung wählt Nextcloud als Default, da die Infrastruktur vorhanden ist.

### 2. Proxy-Endpunkt: `/api/assets/[...path]`

Da Nextcloud-Dateien nicht direkt öffentlich erreichbar sein sollen, liefert ein Astro-Endpunkt die Bilder aus:
- Liest aus Nextcloud via `downloadFile()` 
- Cached optional via `Cache-Control` Header
- Auth: öffentlich (Bilder sollen in HTML-Content embeddbar sein)

**Pfad-Mapping:** `file_path` in `assets.registry` ist `editor-images/2026-06/abc123.webp` → Proxy route `/api/assets/editor-images/2026-06/abc123.webp` → Nextcloud-Pfad `EditorImages/2026-06/abc123.webp`.

### 3. HtmlEditor.svelte — Upload-Integration

Die bestehende `HtmlEditor.svelte` Komponente wird erweitert:

**Neue Props:**
```typescript
{
  enableImageUpload?: boolean;  // default: true
  onImageUploaded?: (url: string, assetId: string) => void;  // optional callback
}
```

**UI-Änderungen:**
- Toolbar-Zeile über dem Textarea mit einem "Bild hochladen"-Button
- Drop-Zone-Overlay: Wenn eine Datei über das Textarea gezogen wird, erscheint ein halbtransparentes Overlay mit "Bild hier ablegen"
- Upload-Status: Kleiner Spinner/Progress-Indicator während des Uploads
- Nach erfolgreichem Upload: `<img src="/api/assets/editor-images/...">` wird an der Cursor-Position (oder am Ende) in den HTML-Content eingefügt

**Drag & Drop Implementierung:**
- `ondragover` / `ondragenter` auf dem Textarea: `preventDefault()`, Overlay anzeigen
- `ondrop`: File aus `DataTransfer` lesen, Upload starten
- `ondragleave`: Overlay verstecken

**Datei-Dialog:**
- Verstecktes `<input type="file" accept="image/jpeg,image/png,image/webp">`
- Button triggert `.click()` auf dem Input
- `onchange`: Upload starten

### 4. DokumentEditor.svelte — Umstellung auf HtmlEditor

Der `DokumentEditor.svelte` nutzt aktuell eine eigene `<textarea>` für `composeHtml`. Diese wird durch `<HtmlEditor>` ersetzt, damit auch dort Bild-Upload verfügbar ist.

**Besonderheit:** Der DokumentEditor hat eine feste DIN-A4-Breite (794px). Der HtmlEditor muss die `rows`- und `style`-Props unterstützen, was er bereits tut.

### 5. Asset-Galerie Integration (optional, Phase 2)

Die bestehende `AssetGallery.svelte` zeigt bereits `assets.registry`-Einträge an. Neue Editor-Bilder erscheinen automatisch in der Galerie. In Phase 2 könnte man einen "Aus Galerie einfügen"-Dialog im Editor ergänzen.

---

## Datenmodell

Keine Schema-Änderung nötig — `assets.registry` hat bereits alle benötigten Felder:
- `id` (UUID)
- `name` (TEXT)
- `type` (asset_type ENUM — `'image'` ist bereits definiert)
- `file_path` (TEXT UNIQUE)
- `metadata` (JSONB)
- `tags` (TEXT[])
- `created_at`, `updated_at`

---

## Sicherheit

- Admin-Auth auf Upload-Endpunkt (Session + `isAdmin()`)
- MIME-Type-Validierung serverseitig (nicht nur `accept`-Attribut)
- Dateigröße serverseitig geprüft
- Dateiname wird sanitized (keine Path-Traversal)
- Nextcloud-Pfad ist deterministisch (UUID-basiert), kein User-Input im Pfad

---

## Offene Fragen

- **Proxy vs. direkter Nextcloud-Zugriff:** Wenn die Nextcloud-Instanz öffentlich erreichbar ist, könnte man die direkte WebDAV-URL als `src` verwenden. Der Proxy-Endpunkt ist die sicherere Alternative.
- **Bild-Optimierung:** Skalierung/Compression serverseitig? V1 macht kein Resizing — die Bilder werden 1:1 gespeichert.
