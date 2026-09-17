# Proposal: db-restore-verification

## Why

G-DB05 (Restore-Test-Frequenz) wurde im DB-Quality-Goals-Design ausgelagert
(docs/superpowers/specs/2026-07-09-db-quality-goals-design.md:36-38): Es existiert
keine Automatisierung, die einen Restore-Test protokolliert — ein Backup ohne
Restore-Nachweis ist eine Hypothese. Der `db-backup`-CronJob validiert seine Dumps
nur strukturell (PGDMP-Magic, Mindestgröße); ein echter `pg_restore` findet nie statt.

## What

Neuer wöchentlicher CronJob `db-restore-verify` (Sonntag 03:30), der das jüngste
verschlüsselte Dump-Set vom Backup-PVC (`/backups/$STAMP/*.dump.enc`) entschlüsselt,
in Wegwerf-DBs (`restore_verify_<db>` auf shared-db, Superuser-Credentials aus
`workspace-secrets:SHARED_DB_PASSWORD`, `--no-owner --no-privileges`) restored,
je DB verifiziert (Restore Exit 0 + Tabellen-Count > 0) und das Ergebnis als
maschinell auswertbares JSONL-Evidence auf dem PVC protokolliert
(`/backups/restore-verification.jsonl`: stamp, db, status, duration_s, tables_restored).
Wegwerf-DBs werden in jedem Lauf dropped (auch bei Teilerfolg) und akkumulieren nie.

Damit ist G-DB05 erstmals mit automatisiertem, dauerhaftem Restore-Evidence erfüllt;
ein Struktur-Guard (`tests/spec/db-restore-verification/`) hält den CronJob gegen
Regression fest (RED bei Auslieferung dieses Plans).

_Ticket: T014544_
