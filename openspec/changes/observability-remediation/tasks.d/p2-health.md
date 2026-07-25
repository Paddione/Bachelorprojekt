# Partial 2: Service Health Goals & Metrics Persistence

Implements PostgreSQL schema for service health checks/goals, periodic K8s CronJob trigger, and Admin UI visualization.

## Target Files
`website/src/lib/db/schema-health-goals.sql`
`scripts/health-goals-check.sh`
`k3d/monitoring/health-goals-cronjob.yaml`
`website/src/pages/admin/observability.astro`

## Tasks

- [ ] Task 2.1: Create SQL migration `website/src/lib/db/schema-health-goals.sql` defining `service_health_checks` and `service_health_goals` tables.
- [ ] Task 2.2: Implement `scripts/health-goals-check.sh` for evaluating service health thresholds and inserting metrics into PostgreSQL.
- [ ] Task 2.3: Create K8s CronJob manifest `k3d/monitoring/health-goals-cronjob.yaml` for automated execution.
- [ ] Task 2.4: Update Admin UI `website/src/pages/admin/observability.astro` to display health goals, historical trends, and status indicators.
