---
ticket_id: T000994
status: archived
title: "Proposal: sessions-history-archive"
date: 2026-06-20
spec_ref: docs/superpowers/specs/2026-06-20-sessions-history-archive.md
openspec_ref: openspec/changes/sessions-history-archive/
---

# Proposal: sessions-history-archive

## Why

Aktive Entwicklungs-Sessions (HTML-Formulare, Brainstorm-Boards, Visual Companion) werden in
der `active-sessions.json`-Registry geführt (T000975 Active Sessions Hub). Sobald eine Session
endet oder älter als 30 Tage wird, verschwindet sie aus dem Mediaviewer — ihr Ergebnis-Markdown
ist danach nicht mehr auffindbar. Patrick muss für eine vergangene Session manuell in lokalen
Dateien suchen, und Gekko hat gar keinen Zugriff auf abgelaufene Ergebnisse.

Eine chronologische History-View im Mediaviewer macht alle vergangenen Sessions an einem Ort
sichtbar: Typ-Icon, Titel, Datum, Teilnehmer. Der Klick öffnet das gespeicherte Ergebnis-Markdown
(read-only). Sessions älter als 30 Tage werden aus der aktiven JSON-Datei entfernt, aber das
Ergebnis-Markdown bleibt als Flat-File unter `~/.local/share/bachelorprojekt/sessions-archive/`
erhalten. Ein täglicher Purge-Cronjob (in `k3d/admin-actions-cronjobs.yaml`) trägt die
30-Tage-Grenze automatisch nach.

## What

- **`website/src/components/sessions/SessionsHistory.svelte`** — Listen-UI: chronologische Liste
  mit Typ-Icon, Titel, Datum, Teilnehmern; optionaler Typ-Filter; Pagination in 50er-Schritten;
  Klick öffnet das Ergebnis-Markdown read-only.
- **`website/src/lib/sessions/archive.ts`** — Purge-Logik und Flat-File-Verwaltung:
  `purgeOldSessions` (Entry >30 Tage → Markdown + Meta-Sidecar in `sessions-archive/`, dann aus
  JSON entfernen), `listArchivedSessions` (mit Admin/Gekko-Sichtbarkeit + Pagination),
  `getArchivedMarkdown`.
- **`scripts/sessions-purge.sh`** — Cronjob-Script für den 30-Tage-Purge; ruft den
  Purge-Endpoint der Website mit einem Cron-Token auf (Host-seitig und im k3d-CronJob nutzbar).
- **`k3d/admin-actions-cronjobs.yaml`** — neuer `sessions-purge` CronJob (täglich 04:00), der das
  Purge-Script bzw. einen inline-curl gegen den in-cluster-Website-Service ausführt. Geteilt mit
  den bestehenden `admin-actions-*` CronJobs (shared_changes: true).
- Begleitende API-Endpunkte unter `/api/admin/sessions/history` (Liste + Markdown-Abruf) und
  `/api/admin/sessions/purge` (Cron-Token- oder Admin-guarded).
- Sichtbarkeit: Admin sieht alle archivierten Sessions, Gekko sieht nur seine eigenen
  (Filter via `preferred_username`).

## Kern-Nutzerflow

Patrick oder Gekko öffnet die neue Sessions-History-View. Er sieht eine chronologische Liste aller
vergangenen Sessions (Typ-Icon, Titel, Datum, Teilnehmer). Klick auf einen Eintrag öffnet das
gespeicherte Ergebnis-Markdown (read-only). Sessions älter als 30 Tage werden aus der JSON-Datei
gelöscht, aber das Ergebnis-Markdown bleibt als Flat-File unter
`~/.local/share/bachelorprojekt/sessions-archive/` erhalten. Keine Volltext-Suche — nur
chronologische Liste mit optionalem Typ-Filter.

Admin sieht alle Sessions, Gekko sieht nur seine eigenen.

## Akzeptanzkriterien

1. Neue SessionsHistory-View im Mediaviewer-Panel (oder eigene Route)
2. Chronologische Liste mit Typ-Icon, Titel, Datum
3. Klick öffnet Ergebnis-Markdown (read-only)
4. Sessions >30 Tage aus aktiver JSON-Datei entfernt, Markdown in `sessions-archive/` Flat-Files
   behalten
5. Sichtbarkeit: Admin = alle, Gekko = nur eigene

## Edge Cases

- JSON-Datei korrupt: Hinweis, History-Anzeige leer, aber Archiv-Flat-Files bleiben lesbar
- Sessions-Registry-Eintrag ohne zugehöriges Markdown: Platzhalter „Inhalt nicht verfügbar"
- Sehr viele archivierte Sessions (>500): Pagination 50er-Steps

## Fehlerfall-Behandlung

- Flat-File nicht lesbar (Permissions): Hinweis im UI, Patrick kann per CLI wiederherstellen
- 30-Tage-Purge läuft nicht (Cronjob kaputt): Warning-Log, keine Blockade

## Erfolgsmetrik

- Patrick findet eine vergangene Session in ≤30s
- 30-Tage-Purge läuft erfolgreich täglich (Telemetrie)

## Technische Constraints

- JSON-Datei als primärer Speicher (wie active-sessions.json)
- 30 Tage aktiv, danach Markdown-only in Flat-Files
- Keine Volltext-Suche (nur chronologisch + Typ-Filter)
- Admin + Gekko (nicht öffentlich), Gekko nur eigene

## Betroffene Dateien

- Neue `website/src/components/sessions/SessionsHistory.svelte` — Listen-UI
- Neue `website/src/lib/sessions/archive.ts` — Purge-Logik, Flat-File-Verwaltung
- Neue `scripts/sessions-purge.sh` — Cronjob-Script für 30-Tage-Purge
- `k3d/admin-actions-cronjobs.yaml` — Purge-Cronjob eintragen

_Ticket: T000994_
_Spec: docs/superpowers/specs/2026-06-20-sessions-history-archive.md_
