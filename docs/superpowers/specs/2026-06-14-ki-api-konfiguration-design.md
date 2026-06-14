---
ticket_id: T000707
plan_ref: docs/superpowers/plans/2026-06-14-ki-api-konfiguration.md
status: active
date: 2026-06-14
---

# KI-API-Konfiguration — Spec

Zentrale Admin-Seite unter `/admin/ki-konfiguration`, auf der eingestellt werden kann, welche KI-API-Schnittstelle für welche Aktionen verwendet wird.

## Kontext & Motivation

Die Website nutzt bereits eine `tickets.provider_config`-Tabelle mit Fallback-Routing für Chat-, Ticket- und Meeting-Aktionen (`website/src/lib/provider-config.ts`). Bisher ist diese Konfiguration nur über direkte DB-Zugriffe änderbar. Ziel ist eine Admin-UI, die:

- die Fallback-Kette pro Aktionstyp sichtbar macht
- Provider hinzufügen, bearbeiten, deaktivieren und löschen erlaubt
- den Live-Status (Health) der Provider anzeigt
- die Embedding-Konfiguration (bge-m3 vs. Voyage) zugänglich macht

API-Keys bleiben in Sealed Secrets — über die UI sind sie nicht editierbar, nur der Konfigurationsstatus (gesetzt / fehlt) wird angezeigt.

## Architektur

### Neue Dateien

```
website/src/pages/admin/ki-konfiguration.astro       — Admin-Seite
website/src/components/admin/KiKonfiguration.svelte  — interaktive UI
website/src/pages/api/admin/ki/providers.ts          — GET + POST
website/src/pages/api/admin/ki/providers/[id].ts     — PUT + DELETE
website/src/pages/api/admin/ki/env-status.ts         — GET (Key-Status)
website/src/pages/api/admin/ki/embeddings.ts         — GET + PUT
```

### Bestehende Dateien (keine Änderung nötig)

- `website/src/lib/provider-config.ts` — bleibt unverändert; liest weiterhin aus DB
- `tickets.provider_config` / `tickets.provider_health` — Schema bereits vorhanden (Migration `scripts/migrations/2026-06-10-provider-routing.sql`)

## UI-Struktur

### Übersicht: Dashboard-Karten

Die Seite zeigt ein 2×2-Grid mit vier Karten:

| Karte | Source-Pattern | Routing-Quelle |
|---|---|---|
| 💬 Chat | `chat/*`, `*` | `tickets.provider_config` |
| 🎫 Tickets | `tickets/classify` | `tickets.provider_config` |
| 📅 Meetings | `meetings/*` | `tickets.provider_config` |
| 🔢 Embeddings | — | `site_settings` Keys `ki_embed_primary` / `ki_embed_fallback` |

Jede Karte zeigt:
- Aktionsname + Icon
- Anzahl aktiver Provider
- Kurzübersicht der Fallback-Kette (z. B. „sonnet → anthropic | haiku → deepseek")
- Grüner/roter Status-Punkt aus `provider_health` (falls alle Provider in cooldown: rot)

Oben auf der Seite: schmales Status-Banner mit API-Key-Status (`ANTHROPIC_API_KEY ✓ / ⚠ fehlt` etc.) — read-only, keine Bearbeitung.

### Detail: Side-Drawer

Klick auf eine Karte öffnet ein Drawer-Panel (rechts, 400 px) ohne Seitenwechsel.

**Für Chat / Tickets / Meetings:**

- Fallback-Kette als geordnete Liste, Reihenfolge entspricht `priority ASC`
- Priorität änderbar per Pfeil-Buttons (↑ ↓) oder direkter Zahl-Eingabe
- Je Eintrag: Provider-Name · Modell-ID · Tier · Status-Badge (`● live` / `● cooldown` / `● off`)
- ✏️ Edit-Button klappt Inline-Formular auf:
  - `provider` (Text, z. B. `anthropic`, `deepseek`, `openai`, `ollama-local`)
  - `model_id` (Text)
  - `base_url` (Text, optional — leer = Standard-Endpunkt des Providers)
  - `tier` (Select: `sonnet` | `haiku`)
  - `source` (Text, vorbelegt mit Karten-Default, z. B. `chat/*`)
  - `max_concurrent` (Zahl, Default 3)
  - Toggle `enabled`
- 🗑️ Löschen mit Bestätigungs-Tooltip
- `+ Provider hinzufügen` → leeres Inline-Formular am Ende der Liste

**Für Embeddings:**

- Radio-Gruppe: `bge-m3 (lokal)` / `voyage` / `beide (lokal primär, voyage fallback)`
- Schreibt `ki_embed_primary` und `ki_embed_fallback` in `site_settings`
- Hinweis: Embedding-Wechsel gilt erst beim nächsten Pod-Restart (ENV-basiert)

### Drawer-Schließen

Klick außerhalb des Drawers oder ✕-Button schließt ihn. Ungespeicherte Änderungen zeigen einen Bestätigungs-Dialog.

## API-Endpunkte

Alle Endpunkte sind hinter `isAdmin()` Guard (identisch zu anderen Admin-API-Routes in `website/src/pages/api/admin/`).

```
GET  /api/admin/ki/providers
     → { entries: ProviderConfigEntry[], health: ProviderHealth[] }

POST /api/admin/ki/providers
     Body: { source, tier, priority, provider, model_id, base_url?, max_concurrent?, enabled }
     → { id: number }

PUT  /api/admin/ki/providers/[id]
     Body: Partial<{ source, tier, priority, provider, model_id, base_url, max_concurrent, enabled }>
     → 200 OK

DELETE /api/admin/ki/providers/[id]
     → 200 OK

GET  /api/admin/ki/env-status
     → { ANTHROPIC_API_KEY: boolean, VOYAGE_API_KEY: boolean, LLM_ENABLED: boolean, LLM_HOST_IP: string | null }

GET  /api/admin/ki/embeddings
     → { primary: string, fallback: string | null }

PUT  /api/admin/ki/embeddings
     Body: { primary: 'bge-m3' | 'voyage', fallback: 'voyage' | null }
     → 200 OK
```

## Datenfluss

```
KiKonfiguration.svelte
  ├── mount: GET /api/admin/ki/providers + /env-status
  ├── Karte klicken: öffnet Drawer mit gefiltertem Datensatz
  ├── ✏️ Edit → PUT /api/admin/ki/providers/[id]
  ├── 🗑️ Delete → DELETE /api/admin/ki/providers/[id]
  ├── + Hinzufügen → POST /api/admin/ki/providers
  └── Embeddings-Tab: GET + PUT /api/admin/ki/embeddings
```

Nach jeder Mutation wird der lokale State optimistisch aktualisiert und ein Refetch angestoßen.

## Fehlerbehandlung

- HTTP 4xx vom API → Toast-Benachrichtigung mit Fehlermeldung (keine Silent Failures)
- Netzwerkfehler → Fehlerstatus im Drawer, Retry-Button
- Löschen des letzten aktiven Providers einer Aktion → API gibt 409 zurück mit Hinweis-Text
- Prioritäts-Konflikt (UNIQUE constraint) → API gibt 409 zurück, UI schlägt nächst-freie Prio vor

## Sidebar-Eintrag

In `AdminLayout.astro` wird ein neuer Eintrag `🤖 KI-Konfiguration` in die Sidebar aufgenommen (Abschnitt „Plattform" oder gleichwertig).

## Testing

- Manuell: Golden-Path (Eintrag bearbeiten, Priority ändern, Embedding wechseln)
- Manuell: Fehlerfall (letzten Provider löschen → 409-Toast)
- Kein E2E-Test in diesem Ticket (bestehende KI-Tests nicht berührt)
- Nach Änderung: `task test:all` + `task freshness:regenerate` + `task freshness:check`
