## Why

Prod-DB (`shared-db.workspace`, fleet-Cluster) fehlten mehrere `website/src/db/migrations/*.sql`-Migrationen
(zuletzt entdeckt: `ai_call_log`, verursachte 500er auf `/api/admin/ai-quality`; ebenfalls fehlend:
`error_log`, `sessions_templates`, `folder_templates`, `audit_log`, `platform_assets`,
`generation_jobs`). Root Cause: es gibt keinen automatisierten Migrations-Runner für dieses
Verzeichnis — andere Teilprojekte im Repo (`studio-server`, `brett`, `VideoVault`) haben je einen
eigenen `readdirSync`-basierten Runner, `website` nicht. Migrationen werden dadurch nur manuell
oder gar nicht gegen Prod angewendet.

## What Changes

- Neuer Migrations-Runner `website/src/db/migrate.ts`, der alle `website/src/db/migrations/*.sql`
  sortiert und idempotent gegen eine Ziel-DB anwendet, mit Tracking-Tabelle `schema_migrations`.
- Neue Bootstrap-Migration `20260708_create_schema_migrations.sql` für die Tracking-Tabelle.
- Backfill-Verhalten beim Erstlauf: bereits real angewendete (aber nicht getrackte) Migrationen
  werden anhand von "already exists"-Fehlern erkannt und nachträglich als applied markiert, statt
  den Lauf abzubrechen.
- Neue Task `website:migrate` (Taskfile.yml), eingebunden in den `workspace:deploy`-Ablauf vor dem
  Rollout der website-Deployment.

## Capabilities

### New Capabilities

(keine — dies ist eine Erweiterung der bestehenden Deploy-Capability)

### Modified Capabilities

- `workspace-deploy`: Der Deploy-Ablauf erhält einen expliziten, automatisierten Migrations-Schritt
  für `website/src/db/migrations/`, der vor dem website-Rollout läuft. Bisher gab es dafür keinen
  spezifizierten Schritt.

## Impact

- `website/src/db/migrate.ts` (neu)
- `website/src/db/migrations/20260708_create_schema_migrations.sql` (neu)
- `website/package.json` (neues Skript `db:migrate`)
- `Taskfile.yml` (neue Task `website:migrate`, Einbindung in Deploy-Kette)
- `website/src/db/migrate.test.ts` (neu)
- Keine Breaking Changes — additiv, bestehende manuelle Migrations-Anwendung bleibt als Fallback
  möglich.
