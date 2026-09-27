# p1 — Langfuse-Manifeste für devmesh

Target files: `dev-local/components/langfuse/{kustomization,langfuse,clickhouse,valkey,minio,db-init,otel-redact}.yaml`,
`dev-local/core/kustomization.yaml`, `dev-local/core/ingress.yaml`.

Vorlage für Env und Ports: offizielles `https://raw.githubusercontent.com/langfuse/langfuse/main/docker-compose.yml`
(vor dem Schreiben frisch abrufen, Langfuse-Skill Prinzip „Documentation First"). Alle Secrets per
`secretKeyRef` aus `workspace-secrets` (Keys aus p2). Namespace setzt `dev-local/core` (`workspace`).
Keine Brand-Domain-Literale: Hosts ausschließlich über `${DEVMESH_DOMAIN}` (envsubst in
`scripts/devmesh/render-stack.sh`).

### Task 1: Component-Gerüst

`dev-local/components/langfuse/kustomization.yaml`, `kind: Component` (Muster
`dev-local/components/llm-services/kustomization.yaml`), `resources:` listet die sechs Dateien unten.

### Task 2: Datenhaltung

- `db-init.yaml`: ConfigMap `langfuse-db-init-sql` + Job `langfuse-db-init` nach dem Muster
  `k3d/pocket-id-db-init-sql.yaml`: idempotent `CREATE ROLE langfuse` / `CREATE DATABASE langfuse OWNER langfuse`
  in `shared-db`, Passwort per `psql -v pw="$LANGFUSE_DB_PASSWORD"`, nie im YAML.
- `clickhouse.yaml`: StatefulSet `langfuse-clickhouse` (1 Replika, `clickhouse/clickhouse-server:25.12`),
  PVC 20Gi, Ports 8123/9000, Env `CLICKHOUSE_DB=default`, `CLICKHOUSE_USER=clickhouse`,
  `CLICKHOUSE_PASSWORD` aus Secret-Key `LANGFUSE_CLICKHOUSE_PASSWORD`, Requests 500m/2Gi, Limit 4Gi.
  Readiness `GET /ping` auf 8123. Service `langfuse-clickhouse`.
- `valkey.yaml`: Deployment + Service `langfuse-valkey` (`valkey/valkey:8`), Start mit
  `--requirepass $(LANGFUSE_REDIS_AUTH) --maxmemory-policy noeviction`, Requests 50m/128Mi.
- `minio.yaml`: StatefulSet + Service `langfuse-minio` (`cgr.dev/chainguard/minio`), PVC 10Gi,
  Befehl `server /data --console-address :9001`, `MINIO_ROOT_USER=langfuse`,
  `MINIO_ROOT_PASSWORD` aus `LANGFUSE_S3_SECRET`; Bucket `langfuse` per Init-Container
  (`mkdir -p /data/langfuse`, wie im Compose-Entrypoint).

Alle drei zustandsbehafteten Workloads tragen `nodeSelector: {storage: "true"}` (Muster
`dev-local/core/kustomization.yaml` Zeile 34ff, SP-2 D4).

### Task 3: Langfuse Web und Worker

`langfuse.yaml`: Deployments `langfuse-web` (`docker.langfuse.com/langfuse/langfuse:4.46.0`, Port 3000)
und `langfuse-worker` (`docker.langfuse.com/langfuse/langfuse-worker:4.46.0`, Port 3030), Services
gleichen Namens. Gemeinsame Env (YAML-Anker nicht verwenden, kustomize löst sie nicht auf, Env
explizit doppelt schreiben):

- `LANGFUSE_DB_PASSWORD` aus Secret und `DATABASE_URL` per Kubernetes-Env-Expansion
  `postgresql://langfuse:$(LANGFUSE_DB_PASSWORD)@shared-db:5432/langfuse` (kein URL-Secret)
- `NEXTAUTH_URL=https://langfuse.${DEVMESH_DOMAIN}`, `NEXTAUTH_SECRET`, `SALT`, `ENCRYPTION_KEY` aus Secret
- `CLICKHOUSE_URL=http://langfuse-clickhouse:8123`, `CLICKHOUSE_MIGRATION_URL=clickhouse://langfuse-clickhouse:9000`,
  `CLICKHOUSE_USER=clickhouse`, `CLICKHOUSE_CLUSTER_ENABLED=false`
- `REDIS_HOST=langfuse-valkey`, `REDIS_PORT=6379`, `REDIS_AUTH` aus Secret
- `LANGFUSE_S3_EVENT_UPLOAD_*` und `LANGFUSE_S3_MEDIA_UPLOAD_*`: Bucket `langfuse`, Region `auto`,
  Endpoint `http://langfuse-minio:9000`, Force-Path-Style `true`, Prefix `events/` bzw. `media/`
- `TELEMETRY_ENABLED=false`, `AUTH_DISABLE_SIGNUP=true`
- nur `langfuse-web`: Headless-Init `LANGFUSE_INIT_ORG_ID=bachelorprojekt`, `LANGFUSE_INIT_PROJECT_ID=agent-tracing`,
  `LANGFUSE_INIT_PROJECT_NAME=agent-tracing`, `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` / `_SECRET_KEY`,
  `LANGFUSE_INIT_USER_EMAIL` / `_NAME` / `_PASSWORD` aus Secret (Doku:
  `https://langfuse.com/self-hosting/administration/headless-initialization.md`, frisch abrufen)

Probes: web `GET /api/public/health`, worker `GET /api/health` (Port 3030). Requests web 250m/1Gi,
worker 250m/1Gi.

### Task 4: Redaction-Collector

`otel-redact.yaml`: ConfigMap `langfuse-otel-redact-config`, Deployment + Service `langfuse-otel-redact`
(`otel/opentelemetry-collector-contrib:0.137.0`, Port 4318). Pipeline `traces`:
`receivers: [otlp]` (nur HTTP, 4318, `include_metadata: true`) → `processors: [memory_limiter, transform/redact, batch]`
→ `exporters: [otlphttp/langfuse]`.

- `transform/redact`: `trace_statements` mit `replace_all_patterns(span.attributes, "value", "<regex>", "[REDACTED:<typ>]")`
  und dasselbe für `resource.attributes`, eine Zeile je Muster aus `design.md` §Masking-Muster.
  Muster `kv-secret` mit Capture-Gruppen so, dass der Schlüssel erhalten bleibt (`"$$1$$2[REDACTED:kv-secret]"`,
  `$$` wegen envsubst in `render-stack.sh`; mit `kubectl kustomize dev-local/core | grep REDACTED` prüfen).
- `otlphttp/langfuse`: `traces_endpoint: http://langfuse-web:3000/api/public/otel/v1/traces`,
  `headers_setter`-Extension reicht den eingehenden `Authorization`-Header durch
  (`from_context: authorization`). Kein eigener Key im Collector.

### Task 5: Einhängen in core

- `dev-local/core/kustomization.yaml`: `components:` um `../components/langfuse` ergänzen, Kommentar
  mit Ticket `T900688`.
- `dev-local/core/ingress.yaml`: Host `langfuse.${DEVMESH_DOMAIN}` in `tls.hosts` und als Rule mit
  zwei Paths: `/api/public/otel` (Prefix) → `langfuse-otel-redact:4318`, `/` (Prefix) → `langfuse-web:3000`.
  Kopfkommentar um den Host ergänzen.

### Task 6: Render-Check

```bash
bash scripts/devmesh/render-stack.sh core | yq ea -r 'select(.metadata.name | test("^langfuse")) | .kind + "/" + .metadata.name'
bash scripts/devmesh/render-stack.sh core | grep -c 'REDACTED:'
```

Erwartet: alle Objekte aus Task 2–4, `REDACTED:`-Zähler ≥ 9 (acht Muster, GitHub doppelt).
