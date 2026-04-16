# Design: Nextcloud-Quick-Links auf Portal & Admin

**Datum:** 2026-04-16  
**Status:** Genehmigt

## Ziel

Nutzer und Admin sollen direkte Links zu den vier Nextcloud-Diensten prominent auf der jeweiligen "Homepage" (Portal-Startseite bzw. Admin-Dashboard) sehen und per Klick in einem neuen Tab öffnen können.

## Umfang

- **User-Kontext:** `/portal` — zwischen Begrüßungsheader und Tab-Navigation
- **Admin-Kontext:** `/admin` — zwischen KPI-Banner und Ende der Section

## Komponente

Eine neue Astro-Komponente `website/src/components/NextcloudLinks.astro`.

### Verlinktte Dienste

| Label     | Icon | Pfad              |
|-----------|------|-------------------|
| Dateien   | 📁   | `/apps/files/`    |
| Kalender  | 📅   | `/apps/calendar/` |
| Kontakte  | 👥   | `/apps/contacts/` |
| Talk      | 🎥   | `/apps/spreed/`   |

### URL-Erzeugung

Basis-URL: `process.env.NEXTCLOUD_EXTERNAL_URL` (bereits in `env.d.ts` definiert).  
Ist die Variable nicht gesetzt, wird die Sektion nicht gerendert (graceful hide).

### Visueller Stil

Identisch zu den Admin-KPI-Kacheln: `bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors`.  
4 Karten in einer Reihe (`grid grid-cols-4 gap-3`), auf kleinen Bildschirmen 2 Spalten.  
Alle Links mit `target="_blank" rel="noopener noreferrer"`.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/components/NextcloudLinks.astro` | Neu erstellen |
| `website/src/pages/portal.astro` | Komponente einbinden (nach Header, vor Tab-Nav) |
| `website/src/pages/admin.astro` | Komponente einbinden (nach KPI-Banner) |

## Nicht im Scope

- Kein neuer API-Endpunkt
- Keine Datenbankänderungen
- Kein SSO-Token-Passing (Nextcloud nutzt bereits Keycloak OIDC)
