---
ticket_id: T016507
plan_ref: .agents/plans/repohealth-live-db/tasks.md
status: active
date: 2026-10-12
---

# repohealth-live-db — Design-Spec (T016507)

Ticket: T016507 (feat, hoch, major).
Ziel: Überführung des Repo-Health Dashboards von statischer `.claude/lib/goals.md`-Build-Generierung zu lebendiger PostgreSQL-Persistenz im Schema `quality` mit Multi-Trigger-Messungen und CI-Offline-Fallback.

---

## 1. Schema-Architektur (`quality`)

In der bestehenden PostgreSQL-Instanz `shared-db` (Datenbank `website`) wird das Schema `quality` angelegt.

### Tabellen

```sql
CREATE SCHEMA IF NOT EXISTS quality;

CREATE TABLE IF NOT EXISTS quality.repo_health_goals (
    id VARCHAR(32) PRIMARY KEY,             -- z. B. 'G-RH01', 'G-CQ02'
    title TEXT NOT NULL,
    category VARCHAR(32) NOT NULL,          -- 'Repo-Hygiene', 'Code-Qualität', etc.
    priority CHAR(1) NOT NULL,              -- 'A', 'B', 'C'
    direction VARCHAR(8) NOT NULL,          -- 'lower', 'higher'
    baseline NUMERIC,
    target NUMERIC,
    unit VARCHAR(32) DEFAULT '',
    measurement_cmd TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quality.repo_health_measurements (
    id BIGSERIAL PRIMARY KEY,
    goal_id VARCHAR(32) NOT NULL REFERENCES quality.repo_health_goals(id) ON DELETE CASCADE,
    current_value NUMERIC,
    status VARCHAR(16) NOT NULL,            -- 'achieved', 'on_track', 'at_risk', 'critical', 'unknown'
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    git_sha VARCHAR(64),
    git_branch VARCHAR(128),
    details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quality_measurements_goal_time 
    ON quality.repo_health_measurements(goal_id, measured_at DESC);
```

---

## 2. Seed & Migration

1. **Extraktor:** `scripts/sdlc/seed-quality-goals.py` liest die 103 Goals aus `.claude/lib/goals.md` (unter Nutzung der bestehenden Parser-Logik aus `scripts/gen-goals-data.mjs`).
2. **Datenbank-Import:** Einspielen der Goals in `quality.repo_health_goals` und der Initial-Messwerte in `quality.repo_health_measurements`.
3. **Archivierung:** `.claude/lib/goals.md` wird nach `docs/archive/health-goals-legacy.md` archiviert; ein Pointer verweist auf die Datenbank als neue SSOT.

---

## 3. Mess- und Schreib-Trigger

Drei Wege befüllen die Messhistorie in `quality.repo_health_measurements`:

1. **M1 (Host-Timer):** `scripts/sdlc/health-goals-daemon.sh` wird via `systemd` user service / timer (oder Taskfile `task quality:measure:cycle`) periodisch aufgerufen, führt `scripts/health-goals-check.sh` aus und schreibt die Resultate in `quality.repo_health_measurements`.
2. **M2 (Git-Hook / CI-Trigger):** Im Post-Commit-Hook sowie im CI-Workflow wird ein inkrementeller Mess-Runner aufgerufen, der aktuelle Werte zusammen mit `git rev-parse HEAD` und dem Branch-Namen persistiert.
3. **M3 (On-Demand API):** Die Astro-API-Route `POST /sdlc/api/health-goals/rescan` ruft für ausgewählte IDs `scripts/health-goals-scan.sh` auf, speichert das Ergebnis sofort in Postgres und liefert die frischen Daten an das Dashboard zurück.

---

## 4. Frontend- & API-Anbindung mit CI-Offline-Fallback

1. **API-Endpunkt `GET /sdlc/api/health-goals`:**
   - Versucht Verbindung zu `quality.repo_health_goals` und den neuesten Messwerten in `quality.repo_health_measurements`.
   - **Fallback-Mechanismus:** Kann keine Verbindung zur Datenbank aufgebaut werden (z. B. in isolierter Testumgebung, CI ohne Cluster oder Docker-Build), liest der Endpunkt aus dem statischen Fallback-Snapshot `components/website/src/lib/sdlc/goals-data.snapshot.json`.
2. **Dashboard (`GoalsDashboard.svelte`):**
   - Lädt beim Mounten die Daten per Fetch von `/sdlc/api/health-goals`.
   - Bei initialem SSR-Render wird der Fallback-Snapshot vorgerendert, sodass kein Flackern entsteht.

---

## 5. Test- und Guard-Absicherung

- Spec-Tests, die bisher hart `.claude/lib/goals.md` voraussetzten (`test_ci_cd_part2.py`, `test_repo_health_goals.py`), werden aktualisiert:
  - Sie prüfen die Integrität des Schemas `quality` und die API-Route mit Fallback-Mechanismus.
  - Regressionstests stellen sicher, dass Builds ohne Datenbankverbindung erfolgreich durchlaufen.
