---
title: Plan: Website Bild-Upload direkt im HTML-Editor
ticket_id: 10283f10-e95c-49ce-ac50-726a107047ac
domains: [website, db]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: batch-2026-06-10
parent_feature: null
depends_on_plans: []
---

# Plan: Website Bild-Upload direkt im HTML-Editor

**Ticket:** 10283f10
**Branch:** feature/10283f10-image-upload-editor
**Datum:** 2026-06-10
**Status:** staged

---

## Ziel

Admins können Bilder direkt aus dem HTML-Editor hochladen (Drag & Drop oder Datei-Dialog). Bilder werden in `assets.registry` (Schema `assets`) gespeichert und als relative Pfade im HTML referenziert. Max. 10 MB, Formate: JPG, PNG, WebP.

Betrifft alle Editoren: `HtmlEditor.svelte` (genutzt von `NewsletterAdmin.svelte` und `VertragsvorlagenSection.svelte`) sowie `DokumentEditor.svelte` (eigene Textarea → Umstellung auf `HtmlEditor.svelte`).

---

## Architektur

### Neue Dateien

| Datei | Zweck |
|-------|-------|
| `website/src/pages/api/admin/assets/upload.ts` | Upload-Endpunkt: multipart/form-data, Admin-Auth, Validierung (10 MB, JPG/PNG/WebP), speichert in Nextcloud + schreibt `assets.registry` |
| `website/src/pages/api/assets/[...path].ts` | Proxy-Endpunkt: liefert hochgeladene Bilder aus Nextcloud an den Browser aus (öffentlich, mit Cache-Control) |

### Geaenderte Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/components/admin/HtmlEditor.svelte` | Upload-Toolbar (Button + Drop-Zone), Drag & Drop Handler, Datei-Dialog, Insert `<img>` an Cursor-Position |
| `website/src/components/admin/DokumentEditor.svelte` | Textarea in Vertragsvorlagen-Compose durch `<HtmlEditor>` ersetzen |

### Nicht geaendert

| Datei | Grund |
|-------|-------|
| `website/src/components/admin/InhalteEditor.svelte` | Nutzt HtmlEditor indirekt — profitiert automatisch |
| `website/src/components/admin/NewsletterAdmin.svelte` | Nutzt bereits HtmlEditor — profitiert automatisch |
| `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte` | Nutzt bereits HtmlEditor — profitiert automatisch |
| `website/src/db/migrations/*` | `assets.registry` existiert bereits, kein Schema-Change nötig |
| `website/src/lib/nextcloud-files.ts` | `uploadFile()`, `ensureFolder()`, `downloadFile()` sind bereits vorhanden |

---

## Tech-Stack

- **Frontend:** Svelte 5 (Runes: `$state`, `$derived`, `$props`, `$bindable`), Tailwind CSS
- **Backend:** Astro SSR Endpoints (`APIRoute`), `multipart/form-data` Parsing
- **Storage:** Nextcloud via WebDAV (`nextcloud-files.ts`), `assets.registry` (PostgreSQL)
- **Auth:** Session-basiert (`getSession` + `isAdmin` aus `lib/auth`)

---

## Tasks

- [ ] **T1 — Upload-API-Endpunkt erstellen:** `website/src/pages/api/admin/assets/upload.ts` anlegen. Pattern aus `upload-logo.ts` folgen: Admin-Auth via `getSession`/`isAdmin`, `request.formData()`, File-Validierung (MIME: `image/jpeg`, `image/png`, `image/webp`; Max: 10 MB). Dateiname sanitizen (Unicode→ASCII, Whitespace→`-`, max 120 Zeichen). UUID generieren für Storage-Pfad. Nextcloud-Folder `EditorImages/{YYYY-MM}` via `ensureFolder()` anlegen. Binärdaten via `uploadFile()` nach `EditorImages/{YYYY-MM}/{uuid}.{ext}` hochladen. Row in `assets.registry` inserten: `name`=Originalname, `type`='image', `file_path`=`editor-images/{YYYY-MM}/{uuid}.{ext}`, `metadata`=JSON mit `{ original_name, size_bytes, mime_type }`. Response: `{ url: "/api/assets/editor-images/{YYYY-MM}/{uuid}.{ext}", asset_id: uuid }`.

- [ ] **T2 — Asset-Proxy-Endpunkt erstellen:** `website/src/pages/api/assets/[...path].ts` anlegen. Liest `file_path` aus URL-Param, konstruiert Nextcloud-Pfad (`EditorImages/` + Rest), lädt via `downloadFile()` aus `nextcloud-files.ts`. Response: Binärdaten mit korrektem `Content-Type` (aus `assets.registry` metadata oder aus Nextcloud Content-Type Header). `Cache-Control: public, max-age=86400` Header setzen. Kein Auth erforderlich (Bilder müssen in HTML-Content embeddbar sein). 404 falls Asset nicht in Registry oder Nextcloud.

- [ ] **T3 — HtmlEditor.svelte um Upload erweitern:** Props erweitern: `enableImageUpload?: boolean` (default `true`). State: `uploading: boolean`, `dragOver: boolean`. Toolbar-Row über dem Textarea einfügen (nur wenn `enableImageUpload`): Button "Bild" mit verstecktem `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`. Drop-Zone: `ondragover`/`ondragenter` auf Textarea → `preventDefault()`, `dragOver = true`. Overlay-Div (absolut positioniert, halbtransparent gold) erscheint wenn `dragOver`. `ondrop`: Files aus `DataTransfer.items` filtern (nur Images), `dragOver = false`, Upload-Loop starten. `ondragleave`: `dragOver = false`. Upload-Funktion: `FormData` bauen, `fetch('/api/admin/assets/upload', { method: 'POST', body: formData })`. Bei Erfolg: `<img src="{response.url}" alt="">` an aktueller Cursor-Position im `value`-String einfügen (oder am Ende appenden). `uploading` State für Spinner/Disabled-Status.

- [ ] **T4 — DokumentEditor.svelte auf HtmlEditor umstellen:** In `DokumentEditor.svelte` den `<textarea>` im Compose-Form (Zeilen ~246–251) durch `<HtmlEditor bind:value={composeHtml} rows={18} placeholder="<h1>Vertrag</h1>..." />` ersetzen. Import `HtmlEditor` hinzufügen. Die DIN-A4-Breite (794px) als Container-Style beibehalten. Preview-iframe kann entfallen da HtmlEditor eigenen Preview-Modus hat — oder `previewMode="direct"` nutzen.

- [ ] **T5 — Tests und Validierung:** BATS-Test oder manueller Test: Upload einer JPG-Datei → 200 Response mit `url` und `asset_id` → Eintrag in `assets.registry` sichtbar via `/api/admin/assets`. Upload einer zu großen Datei → 400. Upload eines nicht-bild MIME → 400. Drag & Drop im HtmlEditor → Bild wird eingefügt. Datei-Dialog → Bild wird eingefügt. Proxy-Endpunkt: `/api/assets/editor-images/...` liefert Bild mit korrektem Content-Type. `DokumentEditor` Compose-Form zeigt HtmlEditor mit Upload-Funktionalität. `task test:all` grün.

---

## Verifikation

### Lokal

1. `task dev:deploy` — Dev-Cluster mit Änderungen starten
2. Admin-Portal öffnen → Newsletter → Bild per Drag & Drop in Editor ziehen → Upload erfolgreich, `<img>` Tag im HTML
3. Admin-Portal → Dokumente → Vertragsvorlage → Neue Vorlage → Bild-Button → Datei auswählen → Bild im HTML eingefügt
4. Vorschau-Pane zeigt Bild korrekt an
5. `SELECT * FROM assets.registry WHERE type = 'image' ORDER BY created_at DESC LIMIT 5` — neue Einträge mit `file_path` wie `editor-images/2026-06/{uuid}.webp`
6. `/api/assets/editor-images/2026-06/{uuid}.webp` im Browser aufrufen → Bild wird ausgeliefert

### CI

- `task test:all` grün
- `npm --prefix website run build` erfolgreich
- Keine TypeScript-Fehler

### Akzeptanzkriterien-Checkliste

- [ ] Bilder können per Drag & Drop in HtmlEditor hochgeladen werden
- [ ] Bilder können per Datei-Dialog in HtmlEditor hochgeladen werden
- [ ] Upload-Endpunkt validiert Max-Größe 10 MB
- [ ] Upload-Endpunkt validiert Formate JPG, PNG, WebP
- [ ] Bilder werden in `assets.registry` (Schema `assets`) gespeichert
- [ ] Relative Pfade werden im HTML verwendet (`/api/assets/...`)
- [ ] `HtmlEditor.svelte` zeigt Upload-Button und Drop-Zone
- [ ] `DokumentEditor.svelte` nutzt `HtmlEditor.svelte` statt eigener Textarea
- [ ] `NewsletterAdmin.svelte` profitiert automatisch (nutzt bereits HtmlEditor)
- [ ] `VertragsvorlagenSection.svelte` profitiert automatisch (nutzt bereits HtmlEditor)
- [ ] Admin-Auth auf Upload-Endpunkt
- [ ] `task test:all` grün
