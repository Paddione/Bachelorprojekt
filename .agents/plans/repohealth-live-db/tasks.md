---
title: Repo-Health Dashboard aus Live-Postgres-DB speisen
ticket_id: T016507
domains:
  - website
  - db
  - ops
status: active
---

# repohealth-live-db — Implementation Plan

Single-Plan zur Verlagerung des Repo-Health Dashboards von statischer Markdown-Generierung zu PostgreSQL-Persistenz im Schema `quality` mit Multi-Trigger-Messungen und CI-Offline-Fallback.

## File Structure

| Datei | Änderung |
|---|---|
| `scripts/migrations/2026-10-12-quality-schema-T016507.sql` | Neues PostgreSQL-Schema `quality` mit Tabellen `repo_health_goals` und `repo_health_measurements` |
| `scripts/sdlc/seed-quality-goals.py` | Seed- und Migrations-Skript zur Übernahme der 103 Goals aus `.claude/lib/goals.md` |
| `scripts/sdlc/health-goals-daemon.sh` | Runner-Skript für zyklische Host-Messungen via Timer |
| `components/website/src/lib/sdlc/goals-data-db.ts` | Datenbank-Client und Loader mit Graceful-Degradation-Fallback |
| `components/website/src/pages/sdlc/api/health-goals.ts` | Astro API-Route zur dynamischen Abfrage von Goals und Messwerten |
| `components/website/src/components/sdlc/GoalsDashboard.svelte` | Umstellung auf dynamisches Nachladen per Fetch mit SSR-Fallback |
| `tests/py/spec/health-goals/test_quality_db_schema.py` | Neuer Spec-Test zur Verifikation von Schema, Migration und Fallback-Verhalten |

`components/website/src/components/sdlc/GoalsDashboard.svelte` hat aktuell 608 Zeilen bei einem Limit von 1100 (effektives Restbudget: 493 Zeilen). Alle neu angelegten Dateien liegen weit unter ihren jeweiligen Extension-Limits.

<!-- vitest: kein neuer Test nötig, weil die API- und DB-Logik durch Pytest-Specs in tests/py/spec abgedeckt wird -->

## Task 1 — RED-Test Bestätigung

Neuen Spec-Test `tests/py/spec/health-goals/test_quality_db_schema.py` anlegen und Fehlschlag vor der Implementierung verifizieren:

- Step: `pytest tests/py/spec/health-goals/test_quality_db_schema.py`
- Result: expected: fail, da das Schema `quality` und die Tabellen noch nicht existieren.

## Task 2 — PostgreSQL-Schema `quality` anlegen

Migration `scripts/migrations/2026-10-12-quality-schema-T016507.sql` implementieren:

- DDL für `CREATE SCHEMA IF NOT EXISTS quality;`
- Tabelle `quality.repo_health_goals` mit Spalten `id`, `title`, `category`, `priority`, `direction`, `baseline`, `target`, `unit`, `measurement_cmd`, `active`, `created_at`, `updated_at`.
- Tabelle `quality.repo_health_measurements` mit Spalten `id`, `goal_id`, `current_value`, `status`, `measured_at`, `git_sha`, `git_branch`, `details`.
- Index `idx_quality_measurements_goal_time` auf `(goal_id, measured_at DESC)`.
- Ausführung gegen die lokale PostgreSQL-Instanz (`shared-db` via `psql`).

## Task 3 — Seed & Migrations-Skript aus `.claude/lib/goals.md`

`scripts/sdlc/seed-quality-goals.py` implementieren:

- Liest die bestehenden Goals und Werte aus `.claude/lib/goals.md`.
- Führt Upsert in `quality.repo_health_goals` aus.
- Schreibt die Initialmessung mit aktuellem Zeitstempel und Git-Commit nach `quality.repo_health_measurements`.
- Legt einen Snapshot `components/website/src/lib/sdlc/goals-data.snapshot.json` an, der als Offline-Fallback dient.

## Task 4 — Mess-Daemon & Hook-Trigger

`scripts/sdlc/health-goals-daemon.sh` implementieren:

- Führt `scripts/health-goals-check.sh` aus.
- Schreibt die ermittelten Messwerte mit Git-SHA (`git rev-parse HEAD`) und Branch-Name direkt in `quality.repo_health_measurements`.
- Ermöglicht zyklische Ausführung via Host-Timer sowie Aufruf im Git-Hook.

## Task 5 — Web-API & Dashboard-Anbindung mit Offline-Fallback

1. `components/website/src/lib/sdlc/goals-data-db.ts`:
   - Stellt Funktionen bereit, um aktuelle Goals und letzte Messwerte aus `quality` abzufragen.
   - Bei Verbindungsfehler (Timeout / Host unreachable) automatischer Fallback auf den statischen Snapshot.
2. `components/website/src/pages/sdlc/api/health-goals.ts`:
   - Astro-API-Route (`GET`), die Goals im JSON-Format ausliefert.
3. `components/website/src/components/sdlc/GoalsDashboard.svelte`:
   - Ruft `/sdlc/api/health-goals` beim Mounten auf und aktualisiert die reaktiven Stores.
   - Rendert beim SSR initial die Snapshot-Daten.

## Task 6 — GREEN-Verifikation

- Step: `PYTEST_JOBS=0 bash scripts/pytest-run.sh tests/py/spec/health-goals/test_quality_db_schema.py`
- Acceptance: Alle Tests in der Suite sind grün (PASS), Schema und Fallback sind nachgewiesen.

## Task 7 — Verifikation & Freshness

- Step:
  ```bash
  task test:changed; task freshness:regenerate; task freshness:check;
  ```
- Acceptance: Alle geänderten Tests bestehen, Freshness-Artefakte sind konsistent und grün.
