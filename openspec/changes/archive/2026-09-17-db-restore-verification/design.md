---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-23
---

# Design: db-restore-verification

## Why

G-DB05 (Restore-Test-Frequenz) wurde im DB-Quality-Goals-Design
(docs/superpowers/specs/2026-07-09-db-quality-goals-design.md:36-38) ausgelagert:
es existiert keine Automatisierung, die einen Restore-Test protokolliert. Ein Backup
ohne Restore-Nachweis ist eine Hypothese. Der bestehende `db-backup`-CronJob
(k3d/backup-cronjob.yaml, 02:00 täglich) validiert Dumps nur strukturell
(PGDMP-Magic + Größe) — ein echter `pg_restore` findet nie statt.

## What

Neuer CronJob `db-restore-verify` (k3d/, wöchentlich So 03:30), der das jüngste
verschlüsselte Dump-Set vom Backup-PVC in Wegwerf-DBs restored, verifiziert und
protokolliert.

## Decisions

| Frage | Entscheidung | Begründung |
|---|---|---|
| Quelle | Jüngstes `/backups/$STAMP/*.dump.enc` vom Backup-PVC | Gleiche Artefakte wie der spätere Ernstfall; kein separater Dump nötig |
| Ziel | `restore_verify_<db>` auf derselben shared-db-Instanz | Ticket-Wortlaut „Wegwerf-DB"; Isolation über DB-Grenze; danach DROP DATABASE — keine Berührung der Produktivdaten |
| Credentials | Postgres-Superuser (`SHARED_DB_PASSWORD`, workspace-secrets) mit `pg_restore --no-owner --no-privileges` | Rollen im Dump gehören den Produktiv-Usern; Superuser + no-owner umgeht fehlende Rollen in der Wegwerf-DB |
| Schedule | `30 3 * * 0` (Sonntag 03:30) | Nach dem täglichen Backup (02:00); wöchentlich reicht für Frequenz-Evidence, Last minimal |
| Verifikation je DB | Decrypt → pg_restore Exit 0 → `information_schema.tables`-Count > 0 | Reine Exit-Code-Prüfung allein könnte leeres Schema durchlassen |
| Protokollierung | JSONL-Append `/backups/restore-verification.jsonl` (stamp, brand_db, status, duration_s, tables_restored) | Maschinell auswertbares G-DB05-Evidence, überlebt Pod-Neustarts (PVC) |
| Aufräumen | DROP DATABASE mit IF EXISTS auch bei Teilerfolg (deferred cleanup step) | Wegwerf-DBs dürfen nie akkumulieren |

## Non-Goals

- Kein Point-in-Time-Recovery/WAL-Archiv-Test (nur pg_dump -Fc Roundtrip).
- Kein Restore auf fremdem Host/Cluster (später erweiterbar).
- Keine Alert-Integration über den JSONL-Log hinaus (Job scheitert laut via BackoffLimit).
