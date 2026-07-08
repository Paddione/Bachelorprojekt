## Why

Das zentrale Logging im Sidekick-Widget (`LogsSidekickView.svelte`) ist rein
In-Memory (Ringpuffer, mengenbasiert gekappt) und nur über einen Live-SSE-Stream
sichtbar. Ein Server-Neustart oder Browser-Reload löscht die Historie
vollständig, und eine verlässliche Ansicht "Fehler der letzten 24h" ist damit
aktuell nicht möglich. Admins brauchen eine echte, persistierte Rückschau auf
Fehler — keine Mock-/Platzhalterdaten.

## What Changes

- Neue Postgres-Tabelle `error_log` persistiert `level=error`-Einträge aus drei
  Quellen: Server (Pino), Browser (`window.onerror`/`unhandledrejection`), Pod
  (nur während aktiv im Sidekick beobachteter Pod-Log-Streams).
- Neuer Endpoint `POST /api/admin/ops/error-log` (admin-gegated) nimmt
  Fehler-Einträge von Browser- und Pod-Quelle entgegen; Server-Fehler werden
  direkt über einen zusätzlichen Pino-Stream persistiert.
- Neuer Endpoint `GET /api/admin/ops/error-log?since=24h` (admin-gegated)
  liefert die persistierten Fehler der letzten 24h.
- `LogsSidekickView.svelte` erhält einen Moduswechsel "Live" / "Letzte 24h".
- Neuer CronJob (`k3d/error-log-retention-cronjob.yaml`) löscht automatisiert
  Einträge älter als 7 Tage — echtes, durchgesetztes Retention statt einer nur
  dokumentierten Absicht (Gegenbeispiel im Repo: `ai_call_log` hat nur einen
  manuellen Taskfile-Task ohne Scheduler).

## Capabilities

### New Capabilities

(keine — dies ist eine Erweiterung der bestehenden `centralized-logging`-Fähigkeit)

### Modified Capabilities

- `centralized-logging`: neue Requirement, dass Fehler-Einträge (Level `error`)
  aus Server-, Browser- und Pod-Quelle persistiert und über eine 24h-Historie
  im Sidekick abrufbar sind (bisher nur Live-Stream ohne Persistenz).

## Impact

- **DB:** neue Migration `website/src/db/migrations/20260703_create_error_log.sql`.
- **Server:** `website/src/lib/logger.ts`, neues Modul
  `website/src/lib/logging/error-log-store.ts`.
- **API:** neuer/erweiterter Endpoint `website/src/pages/api/admin/ops/error-log.ts`.
- **Browser:** `website/src/lib/logging/browser-collector.ts`.
- **UI:** `website/src/components/assistant/LogsSidekickView.svelte`.
- **Infra:** neuer CronJob `k3d/error-log-retention-cronjob.yaml` + Kustomize-Referenz.
- **Tests:** Vitest (Store, API-Auth, 24h-Fensterung), BATS/Kustomize-Struktur-Test
  für den neuen CronJob.
