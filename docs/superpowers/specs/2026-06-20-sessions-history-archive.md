---
ticket_id: T000994
plan_ref: openspec/changes/sessions-history-archive/tasks.md
status: active
date: 2026-06-20
---

# Spec: Sessions: History / Archiv vergangener Sessions

## Kern-Nutzerflow

Patrick oder gekko öffnet die neue Sessions-History-View. Er sieht eine chronologische Liste aller vergangenen Sessions (Typ-Icon, Titel, Datum, Teilnehmer). Klick auf einen Eintrag öffnet das gespeicherte Ergebnis-Markdown (read-only). Sessions älter als 30 Tage werden aus der JSON-Datei gelöscht, aber das Ergebnis-Markdown bleibt als Flat-File unter `~/.local/share/bachelorprojekt/sessions-archive/` erhalten. Keine Volltext-Suche — nur chronologische Liste mit optionalem Typ-Filter.

Admin sieht alle Sessions, gekko sieht nur seine eigenen.

## Akzeptanzkriterien

1. Neue SessionsHistory-View im Mediaviewer-Panel (oder eigene Route)
2. Chronologische Liste mit Typ-Icon, Titel, Datum
3. Klick öffnet Ergebnis-Markdown (read-only)
4. Sessions >30 Tage aus aktiver JSON-Datei entfernt, Markdown in `sessions-archive/` Flat-Files behalten
5. Sichtbarkeit: Admin = alle, gekko = nur eigene

## Edge Cases

- JSON-Datei korrupt: Hinweis,History-Anzeige leer, aber Archiv-Flat-Files bleiben lesbar
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
- Admin + gekko (nicht öffentlich), gekko nur eigene

## Betroffene Dateien

- Neue `website/src/components/sessions/SessionsHistory.svelte` — Listen-UI
- Neue `website/src/lib/sessions/archive.ts` — Purge-Logik, Flat-File-Verwaltung
- Neue `scripts/sessions-purge.sh` — Cronjob-Script für 30-Tage-Purge
- `k3d/admin-actions-cronjobs.yaml` — Purge-Cronjob eintragen
