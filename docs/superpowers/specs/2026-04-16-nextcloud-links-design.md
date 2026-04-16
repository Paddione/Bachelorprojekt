# Design: Nextcloud-Quick-Links auf Portal & Admin

**Datum:** 2026-04-16  
**Status:** Genehmigt

## Ziel

Nutzer und Admin sollen direkte Links zu den vier Nextcloud-Diensten prominent auf der jeweiligen "Homepage" (Portal-Startseite bzw. Admin-Dashboard) sehen und per Klick in einem neuen Tab öffnen können.

## Umfang

- **User-Kontext:** `/portal` — zwischen Begrüßungsheader und Tab-Navigation  
  → Nextcloud-Dienste (4 Links)
- **Admin-Kontext:** `/admin` — zwischen KPI-Banner und Ende der Section  
  → Nextcloud-Dienste (4 Links) + Mattermost + Docs

## Komponente

Eine neue Astro-Komponente `website/src/components/ServiceLinks.astro`.  
Erhält ein Array von Links als Prop und rendert die Karten-Reihe.

### User-Portal: Nextcloud-Dienste

| Label     | Icon | Pfad              | Env-Variable              |
|-----------|------|-------------------|---------------------------|
| Dateien   | 📁   | `/apps/files/`    | `NEXTCLOUD_EXTERNAL_URL`  |
| Kalender  | 📅   | `/apps/calendar/` | `NEXTCLOUD_EXTERNAL_URL`  |
| Kontakte  | 👥   | `/apps/contacts/` | `NEXTCLOUD_EXTERNAL_URL`  |
| Talk      | 🎥   | `/apps/spreed/`   | `NEXTCLOUD_EXTERNAL_URL`  |

### Admin: Nextcloud-Dienste + weitere Tools

Alle vier Nextcloud-Links (s.o.) plus:

| Label      | Icon | URL                     | Env-Variable     |
|------------|------|-------------------------|------------------|
| Mattermost | 💬   | direkte URL             | `MATTERMOST_URL` |
| Docs       | 📖   | direkte URL             | `DOCS_URL` (neu) |

### URL-Erzeugung

- `NEXTCLOUD_EXTERNAL_URL` — bereits in `env.d.ts` definiert
- `MATTERMOST_URL` — bereits in `env.d.ts` definiert
- `DOCS_URL` — neu als optionale Variable in `env.d.ts` ergänzen

Ist eine Variable nicht gesetzt, wird der jeweilige Link weggelassen. Ist kein einziger Link verfügbar, wird die ganze Sektion ausgeblendet.

### Visueller Stil

Identisch zu den Admin-KPI-Kacheln: `bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors`.  
Karten in einer Reihe (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3`).  
Alle Links mit `target="_blank" rel="noopener noreferrer"`.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `website/src/components/ServiceLinks.astro` | Neu erstellen |
| `website/src/pages/portal.astro` | Komponente einbinden (nach Header, vor Tab-Nav) |
| `website/src/pages/admin.astro` | Komponente einbinden (nach KPI-Banner) |
| `website/src/env.d.ts` | `DOCS_URL?: string` ergänzen |

## Nicht im Scope

- Kein neuer API-Endpunkt
- Keine Datenbankänderungen
- Keine Kubernetes/SealedSecret-Änderungen (DOCS_URL optional, Default: ausgeblendet)
