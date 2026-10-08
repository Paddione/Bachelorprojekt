# p1 — Ensure-Abdeckung für admin_actions + error_log (impl)

## Ziel

`public.admin_actions` und `error_log` als idempotente Ensure-Blöcke ins
`ensure-meetings-schema.sh`-Segment von `k3d/website-schema.yaml` aufnehmen, damit
jeder `shared-db`-postStart sie auf frischen wie restaurierten DBs herstellt —
unabhängig vom manuellen `pnpm db:migrate`.

## Steps

- [ ] In `k3d/website-schema.yaml`, Segment `ensure-meetings-schema.sh`, nach den
  `messages`-Blöcken (Nachbarschaft als Stilanker: `CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`, `OWNER TO website`, Grants an `website`) je einen
  Block ergänzen:
  - `public.admin_actions` — DDL wortgleich zu
    `components/website/src/db/migrations/20260525_admin_actions.sql`
    (Tabelle + 3 Indexe + Grants + Sequence-Grant).
  - `error_log` — DDL wortgleich zu
    `components/website/src/db/migrations/20260703_create_error_log.sql`
    (Tabelle + `OWNER TO website` + Index + Grants).
  - Beide Blöcke strikt idempotent (`IF NOT EXISTS` überall, kein `SELECT *`,
    keine Brand-Domain-Literale — S3 unberührt, keine Env-/Config-Änderung).
- [ ] ConfigMap-Syntax prüfen: `task workspace:validate` (Kustomize dry-run muss
  grün sein). Kein `kubectl apply` — Rollout läuft über die normale Pipeline.
- [ ] Relevanten Manifest-Test laufen lassen:
  `bash ./tests/runner.sh local <TEST-ID für shared-db/website-schema>`
  (ID per `bash scripts/vda.sh oracle 'validate website-schema configmap'` auflösen,
  nie raten).

## Akzeptanz

- `tests/spec/workspace-staging-db-tables.bats` Tests 1+2 (admin_actions- /
  error_log-Ensure) sind grün; Anker-Tests 5+6 bleiben grün.
- `task workspace:validate` grün.
