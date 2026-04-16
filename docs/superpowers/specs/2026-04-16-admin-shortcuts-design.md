---
title: Admin Shortcuts — Eigene externe Links im Dashboard
date: 2026-04-16
status: approved
---

# Admin Shortcuts — Eigene externe Links im Dashboard

## Überblick

Der Admin kann im Dashboard eine persönliche Shortcut-Leiste mit externen HTTPS-Links verwalten. Jeder Link zeigt das echte Favicon der Zielseite. Links können inline hinzugefügt und gelöscht werden.

## Komponenten

### Datenbank

Neue Tabelle `admin_shortcuts` in der bestehenden PostgreSQL-Datenbank (`website-db`):

```sql
CREATE TABLE IF NOT EXISTS admin_shortcuts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url        TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Initialisierung über die bestehende `initDb`-Infrastruktur in `website-db.ts`.

### API-Endpunkte

| Methode | Pfad | Funktion |
|---------|------|----------|
| `GET` | `/api/admin/shortcuts/fetch-title?url=<url>` | Ruft `<title>` der Ziel-URL ab (server-seitig, CORS-frei) |
| `POST` | `/api/admin/shortcuts/create` | Erstellt neuen Shortcut `{ url, label }` |
| `DELETE` | `/api/admin/shortcuts/delete` | Löscht Shortcut `{ id }` |

Alle Endpunkte prüfen `isAdmin(session)` und geben `403` bei unberechtigtem Zugriff.

**`fetch-title`-Logik:**
1. URL validieren: muss mit `https://` beginnen
2. `fetch(url)` mit kurzem Timeout (3 s) und `User-Agent`-Header
3. HTML parsen, `<title>`-Tag extrahieren, trimmen und auf 80 Zeichen kürzen
4. Bei Fehler (Timeout, nicht erreichbar): leeren String zurückgeben — kein harter Fehler

### Svelte-Komponente `AdminShortcuts.svelte`

Interaktive Komponente für Darstellung und Verwaltung der Shortcuts.

**Zustände:**
- `links` — geladene Shortcuts (übergeben als Prop vom Astro-Server)
- `showForm` — steuert Sichtbarkeit des Inline-Formulars
- `form.url`, `form.label` — Formular-Felder
- `fetching` — true während Titel-Fetch läuft
- `hoveredId` — welcher Link gerade gehovt wird (für ×-Button)

**Verhalten:**
- Favicon: `https://www.google.com/s2/favicons?domain=<hostname>&sz=64` (client-seitig)
- Nach URL-Eingabe + `blur`: automatisch `fetch-title` aufrufen, Label befüllen
- Label bleibt manuell editierbar
- Speichern: `POST /api/admin/shortcuts/create` → Link wird zur lokalen Liste hinzugefügt (kein Page-Reload)
- Löschen: ×-Button erscheint beim Hover, `DELETE`-Request → Link wird aus lokaler Liste entfernt
- Formular schließen: ✕-Button oder nach erfolgreichem Speichern

**Favicon-Fallback:** Falls Google-Service kein Icon liefert, wird ein neutrales Link-Icon (SVG) angezeigt.

### Astro-Integration (`admin.astro`)

1. `listAdminShortcuts()` in den bestehenden `Promise.allSettled`-Block aufnehmen
2. `<AdminShortcuts client:load links={shortcuts} />` unterhalb von `<ServiceLinks />` einfügen

## Datenfluss

```
admin.astro
  └── listAdminShortcuts() → DB → shortcuts[]
  └── <AdminShortcuts links={shortcuts} />
        ├── Render: favicon + label pro Link
        ├── Hover → ×-Button sichtbar
        │     └── click → DELETE /api/admin/shortcuts/delete → local state update
        ├── + Button → showForm = true
        │     └── URL blur → GET /api/admin/shortcuts/fetch-title → label befüllen
        │     └── Speichern → POST /api/admin/shortcuts/create → local state update
        └── Favicon: Google Favicon Service (client-seitig)
```

## Dateien

**Neu:**
- `website/src/components/admin/AdminShortcuts.svelte`
- `website/src/pages/api/admin/shortcuts/create.ts`
- `website/src/pages/api/admin/shortcuts/delete.ts`
- `website/src/pages/api/admin/shortcuts/fetch-title.ts`

**Geändert:**
- `website/src/lib/website-db.ts` — `listAdminShortcuts`, `createAdminShortcut`, `deleteAdminShortcut`, DB-Init
- `website/src/pages/admin.astro` — Shortcut-Daten laden + Komponente einbinden

## Sicherheit

- Alle API-Endpunkte erfordern Admin-Session
- URL muss mit `https://` beginnen (client- und server-seitig validiert)
- Titel-Fetch läuft server-seitig (kein SSRF über localhost/private IPs — URL-Validierung gegen RFC-1918-Ranges)
- Favicon-URL wird nur aus dem Hostname konstruiert, niemals direkt aus User-Input

## Edge Cases

| Szenario | Verhalten |
|----------|-----------|
| Seite nicht erreichbar | Label-Feld bleibt leer, Admin gibt manuell ein |
| Kein `<title>` vorhanden | Label-Feld bleibt leer |
| Kein Favicon gefunden | Fallback: generisches Link-Icon |
| Doppelter URL-Eintrag | Kein DB-Constraint — Admin kann doppelte Links anlegen |
| Reihenfolge | Links erscheinen in Erstellungsreihenfolge (`created_at ASC`); `sort_order` ist für späteres Drag-to-Reorder reserviert, wird initial auf `0` gesetzt |
