# repohealth-live-db — Proposal (T016507)

## WARUM

Bisher wird das Repo-Health-Dashboard (`/sdlc/cockpit?deck=qualitaet`) statisch aus der Markdown-Datei `.claude/lib/goals.md` über einen Build-Schritt (`scripts/gen-goals-data.mjs` -> `goals-data.generated.json`) gefüttert.
Nach dem Cutover der SDLC- und Ticket-Infrastruktur auf die lokale PostgreSQL-Instanz (`shared-db` im `devmesh`-Cluster) sollen die Qualitäts- und Health-Ziele direkt und lebendig in einer Datenbank verwaltet werden.
Dadurch können kontinuierliche Messungen, historische Trendanalysen und On-Demand-Rescans ohne Rebuild der Website direkt in der Datenbank persistiert und im Dashboard dargestellt werden.

## WAS

- **Eigenes PostgreSQL-Schema `quality`:**
  - Tabellen: `quality.repo_health_goals` (Stammdaten der Ziele) und `quality.repo_health_measurements` (Historie und aktuelle Messwerte).
  - Migration & Seed-Skript: Einmalige Extraktion und Übernahme der 103 bestehenden Ziele aus `.claude/lib/goals.md` in die Datenbank; Archivierung der `goals.md`.
- **Drei Mess- und Schreib-Trigger:**
  - 1. Host-Daemon / systemd-Timer für zyklische Hintergrundmessung.
  - 2. Git-Hook / CI-Schritt zur Messwert-Aktualisierung bei Commits.
  - 3. On-Demand Rescan über `/sdlc/api/health-goals/rescan` mit direkter Speicherung in Postgres.
- **Frontend- & API-Anbindung:**
  - Neue API-Route `/sdlc/api/health-goals` zum dynamischen Abfragen der aktuellen Goals und Messwerte aus Postgres.
  - `GoalsDashboard.svelte` konsumiert die API dynamisch.
- **CI- & Offline-Fallback:**
  - Graceful Degradation: Ist die Datenbank nicht erreichbar (z. B. im isolierten CI-Runner oder Docker-Build ohne DB), fällt die Website auf ein mitgeführtes Snapshot-JSON zurück.
- **Anpassung der Guards:**
  - Aktualisierung der Spec-Tests, die bisher hart auf `goals.md` prüften.
