---
title: Staging-Umgebung On-Demand (per Branch) Implementation Plan
date: 2026-06-11
ticket_id: T000616
status: active
domains: [infra, db, test]
pr_number: null
spec: docs/superpowers/specs/2026-06-11-staging-on-demand-design.md
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Staging-Umgebung On-Demand (per Branch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per `task staging:up BRANCH=feature/xyz` eine isolierte, kurzlebige Staging-Instanz (eigener Namespace im bestehenden k3d-Cluster) mit dem aktuellen Stand eines Feature-Branches hochfahren und per `task staging:down` wieder abreißen — Website + Postgres, optional mit anonymisiertem prod-Snapshot.

**Architecture:** Namespace-Isolation im bestehenden `k3d-mentolder-dev`-Cluster (kein separater Cluster pro Branch). Ein schlankes Kustomize-Overlay `k3d/staging-stack/` (Postgres ephemeral via emptyDir + Website-Deployment + Traefik-IngressRoute) wird via `kubectl kustomize | envsubst | kubectl apply` mit drei Variablen (`STAGING_ID`, `STAGING_NS`, `STAGING_IMAGE`) instanziiert. Ein neues `Taskfile.staging.yml` orchestriert up/down/list/status/clean; Helper-Scripts erledigen Branch→ID-Sanitization und DB-Anonymisierung. State liegt lokal in `~/.local/share/workspace-staging/active.json`.

**Tech Stack:** k3d (lokaler k3s), Kustomize, `envsubst`, go-task (Taskfile), Bash, `kubectl`, `docker`, Postgres 16 (`pgvector/pgvector:0.8.0-pg16`), Traefik IngressRoute (CRD), BATS (`tests/unit/lib/bats-core`).

---

## File Structure

| Datei | Verantwortung | Aktion |
|------|---------------|--------|
| `scripts/staging-id.sh` | Branch-Name → deterministische, URL-sichere `STAGING_ID` (lowercase, `[a-z0-9-]`, max 20, beginnt mit Buchstabe). Pure Funktion, keine Seiteneffekte — wiederverwendbar von Taskfile + Tests. | Create |
| `scripts/staging-db-anonymize.sh` | Nach prod-Snapshot-Restore: PII in `website`/`bachelorprojekt` anonymisieren, Sessions/Tokens löschen, Passwort-Hashes ersetzen. `set -euo pipefail` → fail-closed. | Create |
| `k3d/staging-stack/namespace.yaml` | Namespace `workspace-staging-${STAGING_ID}` mit Label `staging=true`. | Create |
| `k3d/staging-stack/shared-db-staging.yaml` | Ephemeral Postgres (emptyDir, kein PVC) als StatefulSet + NodePort-Service + Init-Job (Rollen + leere DBs). | Create |
| `k3d/staging-stack/website-staging.yaml` | Website ConfigMap + Deployment (Image `${STAGING_IMAGE}`) + Service. | Create |
| `k3d/staging-stack/ingress-staging.yaml` | Traefik IngressRoute → `web.staging-${STAGING_ID}.localhost` (HTTP, kein TLS). | Create |
| `k3d/staging-stack/kustomization.yaml` | Bündelt die vier Manifeste; `namespace:` NICHT gesetzt (envsubst steuert NS). | Create |
| `Taskfile.staging.yml` | Tasks `staging:up`, `staging:down`, `staging:list`, `staging:status`, `staging:clean` + interne Helper. | Create |
| `tests/unit/staging.bats` | Offline-Tests für `staging-id.sh`, kustomize-build, State-JSON-Logik. | Create |
| `Taskfile.yml` | `include` für `staging: ./Taskfile.staging.yml`; `test:unit:staging` registrieren + in `test:unit` einhängen. | Modify |

**State-Datei (zur Laufzeit, nicht im Repo):** `~/.local/share/workspace-staging/active.json` — JSON-Map `STAGING_ID → {branch, namespace, image, url, created}`.

---

## Konventionen aus dem Bestand (verbindlich)

- **Cluster-Kontext:** immer `--context k3d-mentolder-dev` (siehe `Taskfile.dev-stack.yml`).
- **Postgres-Image:** `pgvector/pgvector:0.8.0-pg16` (identisch zu `k3d/dev-stack/shared-db-dev.yaml`).
- **Init-Job-Muster:** `DO $$ … CREATE ROLE … $$` + `SELECT 'CREATE DATABASE …' WHERE NOT EXISTS … \gexec` — übernommen aus `shared-db-dev.yaml`. In Kustomize-Manifesten müssen `$$` und `$DB`/`$PASSWORD` so escaped sein (`\$\$`, `\$VAR`), dass sie den `envsubst`-Schritt überleben — wir whitelisten in `envsubst` NUR `$STAGING_ID $STAGING_NS $STAGING_IMAGE`, deshalb bleiben Shell-`$`-Referenzen im Container-Script unangetastet, solange envsubst die Variablenliste-Form nutzt.
- **envsubst-Whitelist:** `envsubst '$STAGING_ID $STAGING_NS $STAGING_IMAGE'` — ohne Argument würde envsubst ALLE `$…` ersetzen und das Init-Script zerstören. Die Whitelist ist Pflicht.
- **BATS-Runner:** `./tests/unit/lib/bats-core/bin/bats tests/unit/<name>.bats` (siehe `test:unit:*` in `Taskfile.yml`).
- **Plan-Frontmatter:** valide Ticket-Typen sind nur `bug|feature|task|project` (aus MEMORY). Dieses Ticket ist `feature`.

---

## Task 1: `staging-id.sh` — Branch → STAGING_ID Sanitization (TDD)

**Files:**
- Create: `scripts/staging-id.sh`
- Test: `tests/unit/staging.bats`

- [ ] **Step 1: Write the failing test**

`tests/unit/staging.bats`:

```bash
#!/usr/bin/env bats
# tests/unit/staging.bats — offline tests for the staging-on-demand tooling.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  ID_SH="$REPO_ROOT/scripts/staging-id.sh"
}

@test "staging-id: feature branch → sanitized id" {
  run bash "$ID_SH" "feature/T000616-staging-on-demand"
  [ "$status" -eq 0 ]
  [ "$output" = "t000616-staging-on-de" ]
}

@test "staging-id: lowercases and strips slashes" {
  run bash "$ID_SH" "fix/ABC_def"
  [ "$status" -eq 0 ]
  [ "$output" = "fix-abc-def" ]
}

@test "staging-id: result is max 20 chars" {
  run bash "$ID_SH" "feature/this-is-a-really-long-branch-name-indeed"
  [ "$status" -eq 0 ]
  [ "${#output}" -le 20 ]
}

@test "staging-id: result starts with a letter" {
  run bash "$ID_SH" "123-numeric-start"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[a-z] ]]
}

@test "staging-id: only [a-z0-9-] in output" {
  run bash "$ID_SH" "feat/weird@chars#here!"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[a-z0-9-]+$ ]]
}

@test "staging-id: deterministic (same input → same output)" {
  run bash "$ID_SH" "feature/xyz"
  first="$output"
  run bash "$ID_SH" "feature/xyz"
  [ "$output" = "$first" ]
}

@test "staging-id: empty input fails" {
  run bash "$ID_SH" ""
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats`
Expected: FAIL — `scripts/staging-id.sh` does not exist (`No such file`).

- [ ] **Step 3: Write minimal implementation**

`scripts/staging-id.sh`:

```bash
#!/usr/bin/env bash
# scripts/staging-id.sh — turn a git branch name into a deterministic,
# URL-safe staging id: lowercase, only [a-z0-9-], max 20 chars, starts with
# a letter. Pure: prints the id to stdout, no side effects.
# Usage: scripts/staging-id.sh <branch-name>
set -euo pipefail

BRANCH="${1:?Usage: staging-id.sh <branch-name>}"

# 1. lowercase
id="$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')"
# 2. every run of non-[a-z0-9] becomes a single dash
id="$(printf '%s' "$id" | sed -E 's/[^a-z0-9]+/-/g')"
# 3. collapse repeated dashes, trim leading/trailing dashes
id="$(printf '%s' "$id" | sed -E 's/-+/-/g; s/^-+//; s/-+$//')"
# 4. truncate to 20 chars, then re-trim a trailing dash the cut may have left
id="${id:0:20}"
id="$(printf '%s' "$id" | sed -E 's/-+$//')"
# 5. guarantee a leading letter (prefix 's-' if it starts with digit/empty)
if [[ ! "$id" =~ ^[a-z] ]]; then
  id="s-${id}"
  id="${id:0:20}"
  id="$(printf '%s' "$id" | sed -E 's/-+$//')"
fi

if [[ -z "$id" ]]; then
  echo "staging-id: could not derive id from '$BRANCH'" >&2
  exit 1
fi

printf '%s\n' "$id"
```

- [ ] **Step 4: Make it executable and run the tests**

Run:
```bash
chmod +x scripts/staging-id.sh
./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats
```
Expected: All 7 `staging-id` tests PASS.

> Note: the expected value `t000616-staging-on-de` in test 1 is `feature/t000616-staging-on-demand` → strip `feature/`-dash → `feature-t000616-staging-on-demand`? No: the leading `feature/` becomes a dash too, yielding `feature-t000616-...`. **Correct the test's expected string after Step 4 by running the script once and pasting the real output** — do not guess. Run `bash scripts/staging-id.sh "feature/T000616-staging-on-demand"`, copy stdout verbatim into the test assertion, then re-run. (This is the one place where deriving the value by hand is error-prone; trust the script's deterministic output.)

- [ ] **Step 5: Commit**

```bash
git add scripts/staging-id.sh tests/unit/staging.bats
git commit -m "feat(staging): add deterministic branch→staging-id sanitizer + tests"
```

---

## Task 2: `k3d/staging-stack/` — Namespace + ephemeral Postgres

**Files:**
- Create: `k3d/staging-stack/namespace.yaml`
- Create: `k3d/staging-stack/shared-db-staging.yaml`

- [ ] **Step 1: Write the namespace manifest**

`k3d/staging-stack/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: workspace-staging-${STAGING_ID}
  labels:
    staging: "true"
    staging-id: "${STAGING_ID}"
    pod-security.kubernetes.io/enforce: baseline
    pod-security.kubernetes.io/warn: baseline
```

- [ ] **Step 2: Write the ephemeral Postgres manifest**

`k3d/staging-stack/shared-db-staging.yaml` — StatefulSet on `emptyDir` (data is throwaway), NodePort, and an init Job. The init Job creates roles + empty DBs with a fixed dev-only password (staging is local-only, no secret indirection needed). The `\$` escapes survive `envsubst '$STAGING_ID $STAGING_NS $STAGING_IMAGE'` because none of those three tokens appear in the script body.

```yaml
# Ephemeral Postgres for a staging instance. emptyDir → data is discarded
# on pod restart; staging is throwaway by design. Local-only credentials.
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: shared-db-staging
  labels: { app: shared-db-staging, staging: "true" }
spec:
  serviceName: shared-db-staging
  replicas: 1
  selector:
    matchLabels: { app: shared-db-staging }
  template:
    metadata:
      labels: { app: shared-db-staging }
    spec:
      containers:
        - name: postgres
          image: pgvector/pgvector:0.8.0-pg16
          ports: [{ containerPort: 5432, name: postgres }]
          env:
            - { name: POSTGRES_PASSWORD, value: "staging-local-pw" }
            - { name: POSTGRES_DB, value: postgres }
            - { name: PGDATA, value: /var/lib/postgresql/data/pgdata }
          readinessProbe:
            exec: { command: [pg_isready, -U, postgres] }
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests: { memory: 256Mi, cpu: 100m }
            limits: { memory: 1Gi, cpu: 500m }
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
      volumes:
        - name: data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: shared-db-staging
spec:
  selector: { app: shared-db-staging }
  type: NodePort
  ports:
    - { name: postgres, port: 5432, targetPort: 5432, nodePort: 30016 }
---
apiVersion: batch/v1
kind: Job
metadata:
  name: shared-db-staging-init
spec:
  backoffLimit: 6
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: init
          image: pgvector/pgvector:0.8.0-pg16
          env:
            - { name: PGHOST, value: shared-db-staging }
            - { name: PGUSER, value: postgres }
            - { name: PGPASSWORD, value: "staging-local-pw" }
            - { name: WEBSITE_DB_PASSWORD, value: "staging-website-pw" }
          command:
            - /bin/bash
            - -c
            - |
              set -euo pipefail
              echo "waiting for postgres..."
              for i in {1..30}; do
                pg_isready -h "\$PGHOST" -U "\$PGUSER" && break
                sleep 2
              done
              psql -v ON_ERROR_STOP=1 -h "\$PGHOST" -U "\$PGUSER" <<-SQL
                DO \$\$ BEGIN
                  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='website') THEN
                    EXECUTE format('CREATE ROLE website LOGIN PASSWORD %L', '\$WEBSITE_DB_PASSWORD');
                  ELSE
                    EXECUTE format('ALTER ROLE website WITH PASSWORD %L', '\$WEBSITE_DB_PASSWORD');
                  END IF;
                  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='arena_app') THEN
                    CREATE ROLE arena_app NOLOGIN;
                  END IF;
                END \$\$;
                SELECT 'CREATE DATABASE website OWNER website' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='website')
                \gexec
                SELECT 'CREATE DATABASE bugs OWNER website' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='bugs')
                \gexec
                SELECT 'CREATE DATABASE bachelorprojekt OWNER website' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='bachelorprojekt')
                \gexec
              SQL
              echo "ok."
```

- [ ] **Step 3: Commit (validated together with Task 3 in Task 4)**

```bash
git add k3d/staging-stack/namespace.yaml k3d/staging-stack/shared-db-staging.yaml
git commit -m "feat(staging): add namespace + ephemeral postgres manifests for staging-stack"
```

---

## Task 3: `k3d/staging-stack/` — Website + Ingress + kustomization

**Files:**
- Create: `k3d/staging-stack/website-staging.yaml`
- Create: `k3d/staging-stack/ingress-staging.yaml`
- Create: `k3d/staging-stack/kustomization.yaml`

- [ ] **Step 1: Write the website manifest**

`k3d/staging-stack/website-staging.yaml` — points `DB_HOST` at the in-namespace Postgres; image tag is injected via `${STAGING_IMAGE}`.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: website-staging-config
data:
  NODE_ENV: production
  BRAND: mentolder
  BRAND_ID: mentolder
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  DB_HOST: shared-db-staging
  DB_PORT: "5432"
  DB_NAME: website
  DB_USER: website
  WEBSITE_HOST: "web.staging-${STAGING_ID}.localhost"
  WEBSITE_SITE_URL: "http://web.staging-${STAGING_ID}.localhost"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: website
  labels: { app: website, staging: "true" }
spec:
  replicas: 1
  selector:
    matchLabels: { app: website }
  template:
    metadata:
      labels: { app: website }
    spec:
      containers:
        - name: website
          image: ${STAGING_IMAGE}
          imagePullPolicy: IfNotPresent
          ports: [{ containerPort: 4321 }]
          envFrom:
            - configMapRef: { name: website-staging-config }
          env:
            - { name: WEBSITE_DB_PASSWORD, value: "staging-website-pw" }
            - name: SESSIONS_DATABASE_URL
              value: "postgresql://website:staging-website-pw@shared-db-staging:5432/website"
          readinessProbe:
            httpGet: { path: /api/health, port: 4321 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests: { memory: 256Mi, cpu: 100m }
            limits: { memory: 512Mi, cpu: 500m }
---
apiVersion: v1
kind: Service
metadata:
  name: website
spec:
  selector: { app: website }
  ports:
    - { port: 80, targetPort: 4321 }
```

- [ ] **Step 2: Write the Traefik IngressRoute manifest**

`k3d/staging-stack/ingress-staging.yaml` — HTTP only (`web` entrypoint), no TLS.

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: website-staging
  labels: { staging: "true" }
spec:
  entryPoints: [web]
  routes:
    - kind: Rule
      match: Host(`web.staging-${STAGING_ID}.localhost`)
      services:
        - name: website
          port: 80
```

- [ ] **Step 3: Write the kustomization**

`k3d/staging-stack/kustomization.yaml` — deliberately NO `namespace:` key; the namespace is set by the rendered `namespace.yaml` and every other resource lands in it because the apply pipeline targets `${STAGING_NS}`.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - shared-db-staging.yaml
  - website-staging.yaml
  - ingress-staging.yaml
```

- [ ] **Step 4: Verify kustomize build succeeds (pre-envsubst)**

Run: `kubectl kustomize k3d/staging-stack/`
Expected: YAML stream printed, exit 0. The `${…}` placeholders are still literal at this stage — that is correct; `envsubst` runs after.

- [ ] **Step 5: Commit**

```bash
git add k3d/staging-stack/website-staging.yaml k3d/staging-stack/ingress-staging.yaml k3d/staging-stack/kustomization.yaml
git commit -m "feat(staging): add website + ingress + kustomization for staging-stack"
```

---

## Task 4: kustomize-build BATS test

**Files:**
- Modify: `tests/unit/staging.bats`

- [ ] **Step 1: Add the kustomize-build test**

Append to `tests/unit/staging.bats`:

```bash
@test "staging-stack: kustomize build succeeds" {
  run kubectl kustomize "$REPO_ROOT/k3d/staging-stack/"
  [ "$status" -eq 0 ]
  [[ "$output" =~ "kind: Namespace" ]]
  [[ "$output" =~ "kind: StatefulSet" ]]
  [[ "$output" =~ "kind: IngressRoute" ]]
}

@test "staging-stack: kustomization has no hardcoded namespace key" {
  run grep -E '^namespace:' "$REPO_ROOT/k3d/staging-stack/kustomization.yaml"
  [ "$status" -ne 0 ]   # grep finds nothing → exit 1 → good
}

@test "staging-stack: render contains the three envsubst placeholders" {
  run kubectl kustomize "$REPO_ROOT/k3d/staging-stack/"
  [[ "$output" =~ '${STAGING_ID}' ]]
  [[ "$output" =~ '${STAGING_IMAGE}' ]]
}
```

- [ ] **Step 2: Run tests**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats`
Expected: all tests PASS (requires `kubectl` on PATH; the runner host has it).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/staging.bats
git commit -m "test(staging): assert staging-stack kustomize build + placeholder integrity"
```

---

## Task 5: `staging-db-anonymize.sh` — PII scrub after snapshot restore

**Files:**
- Create: `scripts/staging-db-anonymize.sh`
- Modify: `tests/unit/staging.bats`

- [ ] **Step 1: Write the failing test (syntax + dry-run-safety)**

Append to `tests/unit/staging.bats`:

```bash
@test "staging-anonymize: script has valid bash syntax" {
  run bash -n "$REPO_ROOT/scripts/staging-db-anonymize.sh"
  [ "$status" -eq 0 ]
}

@test "staging-anonymize: refuses to run without PGHOST/PGPORT" {
  run env -u PGHOST -u PGPORT bash "$REPO_ROOT/scripts/staging-db-anonymize.sh"
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats`
Expected: the two new tests FAIL — script missing.

- [ ] **Step 3: Write the implementation**

`scripts/staging-db-anonymize.sh`:

```bash
#!/usr/bin/env bash
# scripts/staging-db-anonymize.sh — scrub PII from a freshly-restored prod
# snapshot in a STAGING postgres. Fail-closed: any error aborts so that
# staging:up can tear the namespace down rather than serve real PII.
# Connects via PGHOST/PGPORT (the staging NodePort, e.g. 127.0.0.1:30016
# forwarded, or the in-cluster service). Runs as the postgres superuser.
set -euo pipefail

: "${PGHOST:?PGHOST required}"
: "${PGPORT:?PGPORT required}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=staging-local-pw}"
export PGHOST PGPORT PGUSER PGPASSWORD

echo "[anonymize] scrubbing website DB"
psql -v ON_ERROR_STOP=1 -d website <<'SQL'
UPDATE users
   SET email = 'user-' || id || '@staging.local',
       name  = 'Staging User ' || id
 WHERE email NOT LIKE '%@staging.local';

-- Wipe everything session/credential-shaped. IF EXISTS guards keep this
-- working across schema drift between snapshots.
DELETE FROM sessions WHERE true;
SQL

# Token tables may not exist in every snapshot — guard each independently so a
# missing table does not abort the whole scrub (still fail-closed on real errors).
for tbl in email_verifications password_reset_tokens; do
  psql -v ON_ERROR_STOP=1 -d website -c \
    "DO \$\$ BEGIN IF EXISTS (SELECT FROM information_schema.tables WHERE table_name='${tbl}') THEN EXECUTE 'DELETE FROM ${tbl}'; END IF; END \$\$;"
done

# Replace password hashes with a known-invalid bcrypt placeholder.
psql -v ON_ERROR_STOP=1 -d website -c \
  "DO \$\$ BEGIN IF EXISTS (SELECT FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN EXECUTE 'UPDATE users SET password_hash = ''\$2b\$12\$stagingplaceholderhashstagingplaceholderhash''''''; END IF; END \$\$;" \
  || psql -v ON_ERROR_STOP=1 -d website -c \
       "UPDATE users SET password_hash = '\$2b\$12\$stagingplaceholderhashxxxxxxxxxxxxxxxxxxxxxxxx' WHERE password_hash IS NOT NULL;"

echo "[anonymize] scrubbing bachelorprojekt DB"
psql -v ON_ERROR_STOP=1 -d bachelorprojekt <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.columns
             WHERE table_name='tickets' AND column_name='description') THEN
    EXECUTE $sql$
      UPDATE tickets
         SET description = regexp_replace(
               description, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '[email]', 'g')
       WHERE description ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+'
    $sql$;
  END IF;
END $$;
SQL

echo "[anonymize] done."
```

> Implementation note for the executor: the `password_hash` line is finicky to quote in a `-c` one-liner. If the dollar-quoted `DO` block proves brittle, replace it with a heredoc that uses a column-existence check the same way the `bachelorprojekt` block does (dollar-quoted `$sql$ … $sql$`). The requirement is only: (a) hashes are replaced with a non-functional placeholder, (b) a missing column/table does not crash the run, (c) a real SQL error DOES crash the run (fail-closed). Prefer the heredoc form if unsure.

- [ ] **Step 4: chmod + run tests**

Run:
```bash
chmod +x scripts/staging-db-anonymize.sh
bash -n scripts/staging-db-anonymize.sh
./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats
```
Expected: syntax check exits 0; all BATS tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/staging-db-anonymize.sh tests/unit/staging.bats
git commit -m "feat(staging): add fail-closed PII anonymizer for snapshot-seeded staging DBs"
```

---

## Task 6: `Taskfile.staging.yml` — up / down / list / status / clean

**Files:**
- Create: `Taskfile.staging.yml`

- [ ] **Step 1: Write the Taskfile**

`Taskfile.staging.yml`:

```yaml
# Taskfile.staging.yml
# On-demand, per-branch staging instances inside the local k3d cluster.
# Namespace isolation (workspace-staging-<id>) — Website + ephemeral Postgres.
# Local-only (WSL host / k3d-mentolder-dev). Never touches fleet/prod.
version: "3"

vars:
  CTX: '{{.CTX | default "k3d-mentolder-dev"}}'
  CLUSTER: '{{.CLUSTER | default "k3d-mentolder-dev"}}'
  REGISTRY: '{{.REGISTRY | default "localhost:5000"}}'
  STATE_DIR: '{{.STATE_DIR | default "$HOME/.local/share/workspace-staging"}}'

tasks:

  _precheck:
    internal: true
    cmds:
      - |
        set -euo pipefail
        if ! k3d cluster list 2>/dev/null | grep -qiE '^(k3d-)?mentolder-dev '; then
          echo "✗ k3d cluster 'mentolder-dev' not found. Run task dev:cluster:create_legacy first." >&2
          exit 1
        fi
        mkdir -p "{{.STATE_DIR}}"
        [ -f "{{.STATE_DIR}}/active.json" ] || echo '{}' > "{{.STATE_DIR}}/active.json"

  up:
    desc: "[staging] Bring up a branch as an isolated staging instance. BRANCH=feature/x [SEED=empty|snapshot]"
    deps: [_precheck]
    requires:
      vars: [BRANCH]
    cmds:
      - |
        set -euo pipefail
        BRANCH='{{.BRANCH}}'
        SEED='{{.SEED | default "empty"}}'
        STAGING_ID="$(bash scripts/staging-id.sh "$BRANCH")"
        STAGING_NS="workspace-staging-${STAGING_ID}"
        STAGING_IMAGE="{{.REGISTRY}}/website:staging-${STAGING_ID}"
        WT="/tmp/staging-${STAGING_ID}"
        echo "▶ staging:up branch=$BRANCH id=$STAGING_ID ns=$STAGING_NS seed=$SEED"

        # Trap: on any failure, tear the half-built namespace down.
        cleanup() {
          echo "✗ staging:up failed — cleaning up $STAGING_NS" >&2
          kubectl --context {{.CTX}} delete namespace "$STAGING_NS" --wait=false 2>/dev/null || true
        }
        trap cleanup ERR

        # 1. branch must exist on origin
        git ls-remote --exit-code origin "$BRANCH" >/dev/null \
          || { echo "✗ branch '$BRANCH' not found on origin" >&2; exit 1; }

        # 2. worktree (reuse if present)
        if [ ! -d "$WT" ]; then
          bash scripts/worktree-create.sh "$BRANCH" "$WT" origin/main 2>/dev/null \
            || git worktree add "$WT" "$BRANCH"
        fi

        # 3. build + import website image into the k3d cluster
        docker build -t "$STAGING_IMAGE" "$WT/website/"
        k3d image import "$STAGING_IMAGE" -c {{.CLUSTER}}

        # 4. render + apply manifests
        STAGING_ID="$STAGING_ID" STAGING_NS="$STAGING_NS" STAGING_IMAGE="$STAGING_IMAGE" \
          kubectl kustomize k3d/staging-stack/ \
          | envsubst '$STAGING_ID $STAGING_NS $STAGING_IMAGE' \
          | kubectl --context {{.CTX}} -n "$STAGING_NS" apply -f -

        # 5. wait for DB init
        kubectl --context {{.CTX}} -n "$STAGING_NS" wait --for=condition=Complete \
          job/shared-db-staging-init --timeout=120s

        # 6. optional snapshot seed
        if [ "$SEED" = "snapshot" ]; then
          : "${BACKUP_PASSPHRASE:?SEED=snapshot needs BACKUP_PASSPHRASE}"
          echo "▶ seeding snapshot + anonymizing"
          kubectl --context {{.CTX}} -n "$STAGING_NS" port-forward svc/shared-db-staging 35432:5432 &
          PF_PID=$!; sleep 4
          PGHOST=127.0.0.1 PGPORT=35432 \
          DEV_SHARED_DB_PASSWORD=staging-local-pw \
          DEV_WEBSITE_DB_PASSWORD=staging-website-pw \
            bash scripts/dev-db-refresh.sh
          PGHOST=127.0.0.1 PGPORT=35432 PGPASSWORD=staging-local-pw \
            bash scripts/staging-db-anonymize.sh
          kill "$PF_PID" 2>/dev/null || true
        fi

        # 7. wait for website
        kubectl --context {{.CTX}} -n "$STAGING_NS" rollout status deploy/website --timeout=180s

        # 8. record state
        URL="http://web.staging-${STAGING_ID}.localhost"
        TMP="$(mktemp)"
        jq --arg id "$STAGING_ID" --arg b "$BRANCH" --arg ns "$STAGING_NS" \
           --arg img "$STAGING_IMAGE" --arg url "$URL" --arg t "$(date -u +%FT%TZ)" \
           '.[$id] = {branch:$b, namespace:$ns, image:$img, url:$url, created:$t}' \
           "{{.STATE_DIR}}/active.json" > "$TMP" && mv "$TMP" "{{.STATE_DIR}}/active.json"

        trap - ERR
        echo "✓ Staging bereit: $URL"
        echo "  Namespace: $STAGING_NS"
        echo "  Branch:    $BRANCH"

  down:
    desc: "[staging] Tear down a branch's staging instance. BRANCH=feature/x [PURGE_WORKTREE=true]"
    deps: [_precheck]
    requires:
      vars: [BRANCH]
    cmds:
      - |
        set -euo pipefail
        STAGING_ID="$(bash scripts/staging-id.sh "{{.BRANCH}}")"
        STAGING_NS="workspace-staging-${STAGING_ID}"
        echo "▶ staging:down id=$STAGING_ID ns=$STAGING_NS"
        kubectl --context {{.CTX}} delete namespace "$STAGING_NS" --wait=false --ignore-not-found
        if [ '{{.PURGE_WORKTREE | default "false"}}' = "true" ]; then
          git worktree remove "/tmp/staging-${STAGING_ID}" --force 2>/dev/null || true
        fi
        TMP="$(mktemp)"
        jq --arg id "$STAGING_ID" 'del(.[$id])' \
           "{{.STATE_DIR}}/active.json" > "$TMP" && mv "$TMP" "{{.STATE_DIR}}/active.json"
        echo "✓ Staging $STAGING_NS wird abgerissen."

  list:
    desc: "[staging] List active staging instances"
    deps: [_precheck]
    cmds:
      - |
        set -euo pipefail
        echo "STAGING_ID            BRANCH                              NAMESPACE                             URL"
        jq -r 'to_entries[] | "\(.key)\t\(.value.branch)\t\(.value.namespace)\t\(.value.url)"' \
          "{{.STATE_DIR}}/active.json" \
          | awk -F'\t' '{printf "%-22s%-36s%-38s%s\n", $1,$2,$3,$4}'
        echo "--- live namespaces (label staging=true) ---"
        kubectl --context {{.CTX}} get ns -l staging=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null || true

  status:
    desc: "[staging] Show pod status for a branch's instance. BRANCH=feature/x"
    deps: [_precheck]
    requires:
      vars: [BRANCH]
    cmds:
      - |
        set -euo pipefail
        STAGING_ID="$(bash scripts/staging-id.sh "{{.BRANCH}}")"
        kubectl --context {{.CTX}} -n "workspace-staging-${STAGING_ID}" get pods,svc,ingressroute 2>/dev/null \
          || echo "No such staging namespace."

  clean:
    desc: "[staging] DESTRUCTIVE — remove ALL staging namespaces + worktrees + state. CONFIRM=yes"
    deps: [_precheck]
    cmds:
      - |
        set -euo pipefail
        if [ '{{.CONFIRM | default "no"}}' != "yes" ]; then
          echo "Refusing without CONFIRM=yes. This deletes every workspace-staging-* namespace." >&2
          exit 1
        fi
        for ns in $(kubectl --context {{.CTX}} get ns -l staging=true --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null); do
          echo "deleting $ns"
          kubectl --context {{.CTX}} delete namespace "$ns" --wait=false
        done
        for wt in /tmp/staging-*; do
          [ -d "$wt" ] && git worktree remove "$wt" --force 2>/dev/null || true
        done
        echo '{}' > "{{.STATE_DIR}}/active.json"
        echo "✓ all staging instances cleaned."
```

- [ ] **Step 2: Validate the Taskfile parses**

Run: `task -t Taskfile.staging.yml --list`
Expected: lists `up`, `down`, `list`, `status`, `clean` with their descriptions; exit 0.

- [ ] **Step 3: Commit**

```bash
git add Taskfile.staging.yml
git commit -m "feat(staging): add staging:up/down/list/status/clean orchestration tasks"
```

---

## Task 7: Wire the include + register the BATS test in CI

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add the include**

In `Taskfile.yml`, under the top-level `includes:` block (after the `dev-korczewski:` entry), add:

```yaml
  # On-demand per-branch staging instances (local k3d only). See Taskfile.staging.yml.
  staging:
    taskfile: ./Taskfile.staging.yml
    dir: .
```

- [ ] **Step 2: Register the BATS test task**

In `Taskfile.yml`, add a new internal task next to the other `test:unit:*` entries:

```yaml
  test:unit:staging:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats
```

- [ ] **Step 3: Hook it into `test:unit`**

In the `test:unit:` task's `cmds:` list, add after `- task: test:unit:scripts`:

```yaml
      - task: test:unit:staging
```

- [ ] **Step 4: Verify the include and test wiring**

Run:
```bash
task --list 2>/dev/null | grep -E 'staging:(up|down|list)'
task test:unit:staging
```
Expected: the `staging:*` tasks are listed; `test:unit:staging` runs the bats file and all tests PASS.

- [ ] **Step 5: Run the full offline suite to confirm no regression**

Run: `task test:all`
Expected: green (or at least no NEW failures attributable to staging — note any pre-existing reds from MEMORY such as `secrets-sync.bats`).

- [ ] **Step 6: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(staging): wire Taskfile.staging include + register staging.bats in test:all"
```

---

## Task 8: Idempotency + state-roundtrip BATS coverage

**Files:**
- Modify: `tests/unit/staging.bats`

- [ ] **Step 1: Add state-JSON roundtrip tests (jq-based, no cluster)**

Append to `tests/unit/staging.bats`:

```bash
@test "state: jq add + delete roundtrip" {
  command -v jq >/dev/null || skip "jq not installed"
  tmp="$(mktemp)"; echo '{}' > "$tmp"
  jq '.["abc"] = {branch:"feature/x", namespace:"workspace-staging-abc"}' "$tmp" > "$tmp.2" && mv "$tmp.2" "$tmp"
  run jq -r '.abc.namespace' "$tmp"
  [ "$output" = "workspace-staging-abc" ]
  jq 'del(.["abc"])' "$tmp" > "$tmp.2" && mv "$tmp.2" "$tmp"
  run jq -r 'keys | length' "$tmp"
  [ "$output" = "0" ]
  rm -f "$tmp"
}

@test "staging-id: idempotent id reused for same branch (down matches up)" {
  a="$(bash "$ID_SH" "feature/T000616-staging-on-demand")"
  b="$(bash "$ID_SH" "feature/T000616-staging-on-demand")"
  [ "$a" = "$b" ]
}
```

- [ ] **Step 2: Run tests**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats`
Expected: all PASS (state tests skip cleanly if `jq` absent).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/staging.bats
git commit -m "test(staging): cover state-json roundtrip + id idempotency"
```

---

## Task 9: Live smoke (manual, requires k3d) — documented, not automated

**Files:** none (operational verification)

> This task is NOT offline-safe; run it manually on the WSL host when k3d is up. It is the acceptance gate before the PR is considered functionally complete.

- [ ] **Step 1: Bring up this very branch as staging**

Run:
```bash
task staging:up BRANCH=feature/T000616-staging-on-demand
```
Expected: ends with `✓ Staging bereit: http://web.staging-<id>.localhost`, namespace `workspace-staging-<id>` created, website pod `1/1 Ready`.

- [ ] **Step 2: Hit the URL**

Run: `curl -sS -o /dev/null -w '%{http_code}\n' http://web.staging-<id>.localhost/api/health`
Expected: `200`.

- [ ] **Step 3: Idempotency — re-run up**

Run: `task staging:up BRANCH=feature/T000616-staging-on-demand`
Expected: succeeds again (apply is idempotent; worktree + image reused), still `1/1`.

- [ ] **Step 4: List shows the instance**

Run: `task staging:list`
Expected: one row with the branch + URL.

- [ ] **Step 5: Tear down**

Run: `task staging:down BRANCH=feature/T000616-staging-on-demand PURGE_WORKTREE=true`
Expected: `✓ Staging workspace-staging-<id> wird abgerissen.`; `kubectl get ns` no longer lists it after a few seconds; state JSON no longer contains the id.

- [ ] **Step 6: down is idempotent**

Run: `task staging:down BRANCH=feature/T000616-staging-on-demand`
Expected: exits 0 (namespace already gone, `--ignore-not-found`).

---

## Final Verification & PR

- [ ] **Step 1: Full offline suite**

Run: `task test:all`
Expected: green / no new failures.

- [ ] **Step 2: Manifest validation**

Run: `kubectl kustomize k3d/staging-stack/ >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 3: Open the PR with auto-merge** (per project convention)

```bash
gh pr create --fill --base main
gh pr merge --squash --auto
```

---

## Spec-Coverage-Matrix (Self-Review)

| Spec-Abschnitt | Task |
|----------------|------|
| A. Namespace-Isolation im k3d-Cluster | Task 2 (namespace), Task 6 (`--context`) |
| B. Lean `k3d/staging-stack/` Overlay | Task 2 + Task 3 |
| C. Image-Build on the fly | Task 6 (`up` Steps 2–4) |
| D. Seeding `empty` (default) / `snapshot` | Task 2 (init-Job=empty), Task 5 + Task 6 (snapshot) |
| E. Ingress HTTP, kein TLS | Task 3 (IngressRoute, entrypoint `web`) |
| F. Teardown + Worktree-Bereinigung | Task 6 (`down`) |
| G. Nur lokaler WSL-Host | Task 6 (`_precheck`, `--context k3d-mentolder-dev`) |
| State-Tracking `active.json` | Task 6 (jq up/down/list) + Task 8 |
| `staging:list` / `staging:clean` | Task 6 |
| DB-Anonymisierung Scope | Task 5 |
| BATS-Tests + `test:all`-Integration | Task 1, 4, 5, 7, 8 |
| STAGING_ID URL-sicher, ≤20, Buchstabe vorn | Task 1 |
| Risiko: Build-Fail → trap cleanup | Task 6 (`trap cleanup ERR`) |
| Risiko: k3d fehlt → precheck | Task 6 (`_precheck`) |
| Risiko: Anonymisierung unvollständig → fail-closed | Task 5 (`set -euo pipefail`, ON_ERROR_STOP) |

**Explizit NICHT in Scope** (Spec bestätigt): Remote-Staging auf Fleet, CI-Auto-Trigger, TLS/öffentliche URLs, Multi-Service (Nextcloud/Keycloak/Collabora), Fixture-Seeding, Brett-im-Staging (Default aus). Keine Tasks dafür — bewusst.
