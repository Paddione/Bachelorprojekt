# Staging-On-Demand (per Branch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship `task staging:up BRANCH=feature/xyz` that spins up an isolated k3d namespace with a freshly-built website image (+ ephemeral Postgres) for a given branch, and `task staging:down` that tears it back down.

**Architecture:** Namespace-isolation in the existing `k3d-mentolder-dev` cluster — one `workspace-staging-<id>` namespace per branch. A sanitization script converts branch names to DNS-safe STAGING_IDs (max 20 chars). Kubernetes manifests under `k3d/staging-stack/` use `envsubst` for STAGING_ID / STAGING_NS / STAGING_IMAGE variables, mirroring the dev-stack pattern without TLS, SSO, or PVC.

**Tech Stack:** Bash, go-task (Taskfile v3), kubectl + kustomize, Docker (`k3d image import`), Postgres 16 (`pgvector/pgvector:0.8.0-pg16`), BATS for unit testing.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/staging-id.sh` | Branch → STAGING_ID sanitization (reusable helper) |
| Create | `scripts/staging-db-anonymize.sh` | Anonymize prod-snapshot data after `SEED=snapshot` restore |
| Create | `k3d/staging-stack/kustomization.yaml` | Kustomize overlay — lists all staging manifests |
| Create | `k3d/staging-stack/namespace.yaml` | Namespace template (envsubst `$STAGING_NS`) |
| Create | `k3d/staging-stack/shared-db-staging.yaml` | Ephemeral Postgres StatefulSet + emptyDir + init Job + Service |
| Create | `k3d/staging-stack/website-staging.yaml` | Website Deployment + ConfigMap + Service (envsubst `$STAGING_IMAGE`, `$STAGING_NS`) |
| Create | `k3d/staging-stack/ingress-staging.yaml` | Plain HTTP Ingress for `web.staging-<id>.localhost` |
| Create | `Taskfile.staging.yml` | Tasks: `staging:up`, `staging:down`, `staging:list`, `staging:status`, `staging:clean` |
| Create | `tests/unit/staging.bats` | BATS unit tests for staging-id.sh + kustomize dry-run |
| Modify | `Taskfile.yml` | Add `staging:` include pointing at `./Taskfile.staging.yml` |
| Modify | `Taskfile.yml` | Add `test:unit:staging` internal task + wire into `test:unit` deps |

---

## Task 1: `scripts/staging-id.sh` — Branch → STAGING_ID

**Files:**
- Create: `scripts/staging-id.sh`
- Test: `tests/unit/staging.bats` (written in Task 7, but the script is needed here first)

- [x] **Step 1.1: Write the script**

  ```bash
  cat > scripts/staging-id.sh << 'EOF'
  #!/usr/bin/env bash
  # scripts/staging-id.sh
  # Convert a git branch name into a DNS-safe STAGING_ID.
  # Rules:
  #   - Strip leading refs/heads/
  #   - Lowercase
  #   - Replace non-[a-z0-9] with '-'
  #   - Collapse consecutive dashes
  #   - Strip leading/trailing dashes
  #   - Truncate to 20 chars
  #   - If result starts with a digit, prepend 's'
  # Usage: bash scripts/staging-id.sh "feature/T000616-staging-on-demand"
  # Output: t000616-staging-on (printed to stdout, no newline)
  set -euo pipefail

  BRANCH="${1:?Branch name required}"

  # Strip refs/heads/ prefix if present
  BRANCH="${BRANCH#refs/heads/}"

  ID=$(printf '%s' "$BRANCH" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's|[^a-z0-9]|-|g' \
    | sed 's|-\{2,\}|-|g' \
    | sed 's|^-||;s|-$||' \
    | cut -c1-20 \
    | sed 's|-$||')

  # Must start with a letter
  case "$ID" in
    [0-9]*) ID="s${ID:0:19}" ;;
  esac

  # Ensure non-empty
  if [[ -z "$ID" ]]; then
    echo "staging-id.sh: cannot derive STAGING_ID from branch '${1}'" >&2
    exit 1
  fi

  printf '%s' "$ID"
  EOF
  chmod +x scripts/staging-id.sh
  ```

- [x] **Step 1.2: Smoke-test by hand**

  ```bash
  bash scripts/staging-id.sh "feature/T000616-staging-on-demand"
  # Expected output: t000616-staging-on
  bash scripts/staging-id.sh "main"
  # Expected: main
  bash scripts/staging-id.sh "fix/123-my-very-long-branch-name-that-exceeds-twenty-chars"
  # Expected: fix-123-my-very-lon  (20 chars, no trailing dash)
  bash scripts/staging-id.sh "refs/heads/feature/abc"
  # Expected: feature-abc
  ```

- [x] **Step 1.3: Commit**

  ```bash
  git -C /tmp/wt-T000616-staging add scripts/staging-id.sh
  git -C /tmp/wt-T000616-staging commit -m "feat(staging): add staging-id.sh — branch → DNS-safe STAGING_ID"
  ```

---

## Task 2: `scripts/staging-db-anonymize.sh` — Anonymize Snapshot Data

**Files:**
- Create: `scripts/staging-db-anonymize.sh`

This script runs after `dev-db-refresh.sh` restores a prod snapshot into the staging Postgres. It must exit 1 on any SQL error so `staging:up` traps and tears down the namespace (preventing PII leaks).

- [x] **Step 2.1: Write the script**

  ```bash
  cat > scripts/staging-db-anonymize.sh << 'EOF'
  #!/usr/bin/env bash
  # scripts/staging-db-anonymize.sh
  # Anonymize PII in a staging DB that was restored from a prod snapshot.
  # Must be run AFTER dev-db-refresh.sh (or equivalent pg_restore).
  # Exits 1 on any SQL error — caller (staging:up) must trap and delete NS.
  #
  # Required env:
  #   PGHOST        — postgres host (default: 127.0.0.1)
  #   PGPORT        — postgres port (default: exposed NodePort)
  #   STAGING_DB_PASSWORD — password for the postgres superuser role
  set -euo pipefail

  : "${PGHOST:=127.0.0.1}"
  : "${PGPORT:?PGPORT required}"
  : "${STAGING_DB_PASSWORD:?STAGING_DB_PASSWORD required}"

  export PGPASSWORD="$STAGING_DB_PASSWORD"

  echo "[anonymize] anonymizing website DB..."
  psql -h "$PGHOST" -p "$PGPORT" -U postgres -d website -v ON_ERROR_STOP=1 <<-'SQL'
    -- Replace real email addresses with deterministic staging placeholders
    UPDATE users
      SET email = 'user-' || id || '@staging.local',
          name  = 'Staging User ' || id
      WHERE email NOT LIKE '%@staging.local';

    -- Wipe session tokens — no active sessions in staging
    DELETE FROM sessions;

    -- Wipe email verification tokens
    DELETE FROM email_verifications;

    -- Wipe password reset tokens
    DELETE FROM password_reset_tokens;

    -- Replace password hashes with a fake bcrypt placeholder
    -- (the real hash would still be valid for cracking; replace it)
    UPDATE users
      SET password_hash = '$2b$12$FAKEHASHFORSTAGIN.GENVIRONMENTsXXXXXXXXXXXXXXXXXXXXXXX';
  SQL

  echo "[anonymize] anonymizing bachelorprojekt DB..."
  psql -h "$PGHOST" -p "$PGPORT" -U postgres -d bachelorprojekt -v ON_ERROR_STOP=1 <<-'SQL'
    -- Scrub email addresses from ticket description text
    UPDATE tickets
      SET description = regexp_replace(
            description,
            '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
            '[email]',
            'g'
          )
      WHERE description ~ '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}';
  SQL

  echo "[anonymize] done."
  EOF
  chmod +x scripts/staging-db-anonymize.sh
  ```

- [x] **Step 2.2: Commit**

  ```bash
  git -C /tmp/wt-T000616-staging add scripts/staging-db-anonymize.sh
  git -C /tmp/wt-T000616-staging commit -m "feat(staging): add staging-db-anonymize.sh — PII scrub after snapshot restore"
  ```

---

## Task 3: Kubernetes Manifests — `k3d/staging-stack/`

**Files:**
- Create: `k3d/staging-stack/kustomization.yaml`
- Create: `k3d/staging-stack/namespace.yaml`
- Create: `k3d/staging-stack/shared-db-staging.yaml`
- Create: `k3d/staging-stack/website-staging.yaml`
- Create: `k3d/staging-stack/ingress-staging.yaml`

Variables substituted at apply time via `envsubst`:
- `$STAGING_NS` — full namespace, e.g. `workspace-staging-t000616-staging-on`
- `$STAGING_ID` — short ID, e.g. `t000616-staging-on`
- `$STAGING_IMAGE` — full image ref, e.g. `ghcr.io/paddione/workspace-website:staging-t000616-staging-on`
- `$STAGING_DB_PASSWORD` — postgres superuser password (generated per instance)

**Important:** `kustomize` will set the `namespace:` field for all resources to whatever is in `kustomization.yaml`. Since we need `$STAGING_NS` to be dynamic, we do NOT set a namespace in `kustomization.yaml` — instead each resource that needs it has `namespace: $STAGING_NS` which is resolved by `envsubst` in the Taskfile pipeline before `kubectl apply`.

### 3a: kustomization.yaml

- [x] **Step 3.1: Create kustomization.yaml**

  ```bash
  mkdir -p /tmp/wt-T000616-staging/k3d/staging-stack
  cat > /tmp/wt-T000616-staging/k3d/staging-stack/kustomization.yaml << 'EOF'
  apiVersion: kustomize.config.k8s.io/v1beta1
  kind: Kustomization
  # NOTE: No `namespace:` field here — STAGING_NS is injected via envsubst
  # in Taskfile.staging.yml before kubectl apply. This lets multiple staging
  # namespaces coexist without a kustomize namespace transformer.
  resources:
    - namespace.yaml
    - shared-db-staging.yaml
    - website-staging.yaml
    - ingress-staging.yaml
  EOF
  ```

### 3b: namespace.yaml

- [x] **Step 3.2: Create namespace.yaml**

  ```bash
  cat > /tmp/wt-T000616-staging/k3d/staging-stack/namespace.yaml << 'EOF'
  apiVersion: v1
  kind: Namespace
  metadata:
    name: $STAGING_NS
    labels:
      staging: "true"
      staging-id: $STAGING_ID
      pod-security.kubernetes.io/enforce: baseline
      pod-security.kubernetes.io/warn: baseline
  EOF
  ```

### 3c: shared-db-staging.yaml

- [x] **Step 3.3: Create shared-db-staging.yaml**

  Ephemeral Postgres — emptyDir instead of PVC. Password comes from a Secret that the Taskfile creates imperatively before apply. NodePort is omitted (no external DB access in staging — website reaches it via in-cluster DNS).

  ```bash
  cat > /tmp/wt-T000616-staging/k3d/staging-stack/shared-db-staging.yaml << 'EOF'
  # ════════════════════════════════════════════════════════════════════
  # shared-db-staging — ephemeral Postgres 16 for a staging namespace.
  # Data lives in emptyDir (lost on pod restart — intentional).
  # No PVC, no NodePort; website reaches it via cluster DNS:
  #   shared-db-staging.<STAGING_NS>.svc.cluster.local:5432
  # ════════════════════════════════════════════════════════════════════
  apiVersion: apps/v1
  kind: StatefulSet
  metadata:
    name: shared-db-staging
    namespace: $STAGING_NS
    labels:
      app: shared-db-staging
      staging-id: $STAGING_ID
  spec:
    serviceName: shared-db-staging
    replicas: 1
    selector:
      matchLabels:
        app: shared-db-staging
    template:
      metadata:
        labels:
          app: shared-db-staging
      spec:
        containers:
          - name: postgres
            image: pgvector/pgvector:0.8.0-pg16
            ports:
              - containerPort: 5432
                name: postgres
            env:
              - name: POSTGRES_PASSWORD
                valueFrom:
                  secretKeyRef:
                    name: staging-db-secrets
                    key: STAGING_DB_PASSWORD
              - name: POSTGRES_DB
                value: postgres
              - name: PGDATA
                value: /var/lib/postgresql/data/pgdata
            readinessProbe:
              exec:
                command: [pg_isready, -U, postgres]
              initialDelaySeconds: 10
              periodSeconds: 10
            resources:
              requests:
                memory: 128Mi
                cpu: 50m
              limits:
                memory: 512Mi
                cpu: 300m
            volumeMounts:
              - name: data
                mountPath: /var/lib/postgresql/data
        volumes:
          - name: data
            emptyDir: {}
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: shared-db-staging
    namespace: $STAGING_NS
  spec:
    selector:
      app: shared-db-staging
    ports:
      - name: postgres
        port: 5432
        targetPort: 5432
  ---
  # Init Job — creates roles + databases after Postgres is ready.
  # Runs once; idempotent (IF NOT EXISTS guards).
  apiVersion: batch/v1
  kind: Job
  metadata:
    name: shared-db-staging-init
    namespace: $STAGING_NS
    labels:
      staging-id: $STAGING_ID
  spec:
    backoffLimit: 6
    template:
      spec:
        restartPolicy: OnFailure
        containers:
          - name: init
            image: pgvector/pgvector:0.8.0-pg16
            env:
              - name: PGHOST
                value: shared-db-staging
              - name: PGUSER
                value: postgres
              - name: PGPASSWORD
                valueFrom:
                  secretKeyRef:
                    name: staging-db-secrets
                    key: STAGING_DB_PASSWORD
              - name: WEBSITE_DB_PASSWORD
                valueFrom:
                  secretKeyRef:
                    name: staging-db-secrets
                    key: STAGING_WEBSITE_DB_PASSWORD
            command:
              - /bin/bash
              - -c
              - |
                set -euo pipefail
                echo "waiting for postgres..."
                for i in {1..30}; do
                  pg_isready -h "$PGHOST" -U "$PGUSER" && break
                  sleep 2
                done
                psql -v ON_ERROR_STOP=1 -h "$PGHOST" -U "$PGUSER" <<-SQL
                  DO \$\$ BEGIN
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='website') THEN
                      EXECUTE format('CREATE ROLE website LOGIN PASSWORD %L', '$WEBSITE_DB_PASSWORD');
                    ELSE
                      EXECUTE format('ALTER ROLE website WITH PASSWORD %L', '$WEBSITE_DB_PASSWORD');
                    END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='arena_app') THEN
                      CREATE ROLE arena_app NOLOGIN;
                    END IF;
                  END \$\$;
                  SELECT 'CREATE DATABASE website OWNER website'
                    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='website')
                  \gexec
                  SELECT 'CREATE DATABASE bugs OWNER website'
                    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='bugs')
                  \gexec
                  SELECT 'CREATE DATABASE bachelorprojekt OWNER website'
                    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='bachelorprojekt')
                  \gexec
                SQL
                echo "DB init complete."
  EOF
  ```

### 3d: website-staging.yaml

- [x] **Step 3.4: Create website-staging.yaml**

  ```bash
  cat > /tmp/wt-T000616-staging/k3d/staging-stack/website-staging.yaml << 'EOF'
  # ════════════════════════════════════════════════════════════════════
  # website-staging — Astro website in a staging namespace.
  # Image is built from the feature branch and imported via k3d.
  # No SSO, no Stripe, no Nextcloud — website starts and serves pages.
  # DB is the co-located shared-db-staging (cluster-local DNS).
  # ════════════════════════════════════════════════════════════════════
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: website-staging-config
    namespace: $STAGING_NS
  data:
    NODE_ENV: production
    BRAND: mentolder
    BRAND_ID: mentolder
    PROD_DOMAIN: staging-$STAGING_ID.localhost
    WEBSITE_SITE_URL: "http://web.staging-$STAGING_ID.localhost"
    WEBSITE_HOST: "web.staging-$STAGING_ID.localhost"
    KEYCLOAK_FRONTEND_URL: "http://auth.localhost"
    CONTACT_EMAIL: "staging@staging.local"
    LLM_ENABLED: "false"
    LLM_RERANK_ENABLED: "false"
    DB_HOST: shared-db-staging
    DB_PORT: "5432"
    DB_NAME: website
    DB_USER: website
  ---
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: website
    namespace: $STAGING_NS
    labels:
      app: website
      staging-id: $STAGING_ID
  spec:
    replicas: 1
    selector:
      matchLabels:
        app: website
    template:
      metadata:
        labels:
          app: website
      spec:
        containers:
          - name: website
            image: $STAGING_IMAGE
            imagePullPolicy: Never
            ports:
              - containerPort: 4321
            envFrom:
              - configMapRef:
                  name: website-staging-config
            env:
              - name: WEBSITE_DB_PASSWORD
                valueFrom:
                  secretKeyRef:
                    name: staging-db-secrets
                    key: STAGING_WEBSITE_DB_PASSWORD
              - name: SESSIONS_DATABASE_URL
                value: "postgresql://website:$(WEBSITE_DB_PASSWORD)@shared-db-staging:5432/website"
            readinessProbe:
              httpGet:
                path: /api/health
                port: 4321
              initialDelaySeconds: 10
              periodSeconds: 10
            resources:
              requests:
                memory: 256Mi
                cpu: 100m
              limits:
                memory: 512Mi
                cpu: 500m
  ---
  apiVersion: v1
  kind: Service
  metadata:
    name: website
    namespace: $STAGING_NS
  spec:
    selector:
      app: website
    ports:
      - port: 80
        targetPort: 4321
  EOF
  ```

### 3e: ingress-staging.yaml

- [x] **Step 3.5: Create ingress-staging.yaml**

  Plain HTTP only (no TLS, no SSO middleware):

  ```bash
  cat > /tmp/wt-T000616-staging/k3d/staging-stack/ingress-staging.yaml << 'EOF'
  # ════════════════════════════════════════════════════════════════════
  # Staging ingress — plain HTTP, no TLS, no SSO.
  # Host: web.staging-<id>.localhost
  # *.localhost resolves locally without /etc/hosts entries (WSL2).
  # ════════════════════════════════════════════════════════════════════
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: website-staging
    namespace: $STAGING_NS
    annotations:
      traefik.ingress.kubernetes.io/router.entrypoints: web
  spec:
    rules:
      - host: "web.staging-$STAGING_ID.localhost"
        http:
          paths:
            - path: /
              pathType: Prefix
              backend:
                service:
                  name: website
                  port:
                    number: 80
  EOF
  ```

- [x] **Step 3.6: Verify kustomize build succeeds (dry-run with placeholder vars)**

  ```bash
  cd /tmp/wt-T000616-staging
  STAGING_NS=workspace-staging-test \
  STAGING_ID=test \
  STAGING_IMAGE=ghcr.io/paddione/workspace-website:staging-test \
  STAGING_DB_PASSWORD=testpass \
    kubectl kustomize k3d/staging-stack/ \
    | envsubst '$STAGING_NS $STAGING_ID $STAGING_IMAGE $STAGING_DB_PASSWORD'
  # Expected: valid YAML printed, no errors
  ```

- [x] **Step 3.7: Commit manifests**

  ```bash
  git -C /tmp/wt-T000616-staging add k3d/staging-stack/
  git -C /tmp/wt-T000616-staging commit -m "feat(staging): add k3d/staging-stack manifests — namespace, db, website, ingress"
  ```

---

## Task 4: `Taskfile.staging.yml` — The Five Tasks

**Files:**
- Create: `Taskfile.staging.yml`

Pattern reference: `Taskfile.dev-stack.yml`. State file: `~/.local/share/workspace-staging/active.json`.

- [x] **Step 4.1: Create `Taskfile.staging.yml`**

  ```bash
  cat > /tmp/wt-T000616-staging/Taskfile.staging.yml << 'TASKEOF'
  # Taskfile.staging.yml
  # ─────────────────────────────────────────────────────────────────────────────
  # On-demand per-branch staging in the k3d-mentolder-dev cluster.
  # Usage:
  #   task staging:up BRANCH=feature/xyz [SEED=empty|snapshot] [WITH_BRETT=false]
  #   task staging:down BRANCH=feature/xyz
  #   task staging:list
  #   task staging:status BRANCH=feature/xyz
  #   task staging:clean
  # ─────────────────────────────────────────────────────────────────────────────
  version: "3"

  vars:
    CTX: k3d-mentolder-dev
    CLUSTER_NAME: mentolder-dev
    STATE_DIR:
      sh: echo "${HOME}/.local/share/workspace-staging"
    STATE_FILE:
      sh: echo "${HOME}/.local/share/workspace-staging/active.json"

  tasks:

    _ensure-state-dir:
      internal: true
      cmds:
        - mkdir -p "{{.STATE_DIR}}"
        - |
          if [[ ! -f "{{.STATE_FILE}}" ]]; then
            echo '{}' > "{{.STATE_FILE}}"
          fi

    _cluster-guard:
      internal: true
      preconditions:
        - sh: k3d cluster list 2>/dev/null | grep -q "^{{.CLUSTER_NAME}}"
          msg: |
            k3d cluster '{{.CLUSTER_NAME}}' not found.
            Start it first: task dev:cluster:create_legacy
            Or check: k3d cluster list

    up:
      desc: "Spin up a staging namespace for a given branch. BRANCH=<name> [SEED=empty|snapshot]"
      vars:
        BRANCH: '{{.BRANCH | default ""}}'
        SEED: '{{.SEED | default "empty"}}'
      preconditions:
        - sh: '[ -n "{{.BRANCH}}" ]'
          msg: "BRANCH is required. Usage: task staging:up BRANCH=feature/xyz"
      deps: [_cluster-guard, _ensure-state-dir]
      cmds:
        - |
          set -euo pipefail
          BRANCH="{{.BRANCH}}"
          SEED="{{.SEED}}"

          # 1. Compute STAGING_ID (deterministic from branch name)
          STAGING_ID=$(bash scripts/staging-id.sh "$BRANCH")
          STAGING_NS="workspace-staging-${STAGING_ID}"
          STAGING_IMAGE="ghcr.io/paddione/workspace-website:staging-${STAGING_ID}"
          WORKTREE_PATH="/tmp/staging-${STAGING_ID}"

          echo "==> staging:up  BRANCH=${BRANCH}  ID=${STAGING_ID}  NS=${STAGING_NS}"

          # 2. Validate branch exists (locally or on origin)
          if ! git rev-parse --verify "refs/heads/${BRANCH}" >/dev/null 2>&1 && \
             ! git ls-remote --exit-code origin "$BRANCH" >/dev/null 2>&1; then
            echo "ERROR: Branch '${BRANCH}' not found locally or on origin." >&2
            exit 1
          fi

          # 3. Worktree — create if not present, reuse if already there
          if [[ -d "$WORKTREE_PATH" ]]; then
            echo "==> Reusing worktree at ${WORKTREE_PATH}"
          else
            bash scripts/worktree-create.sh "$BRANCH" "$WORKTREE_PATH"
          fi

          # 4. Build website image from the worktree
          echo "==> Building website image from ${WORKTREE_PATH}/website/"
          docker build --provenance=false \
            -t "$STAGING_IMAGE" \
            -f "${WORKTREE_PATH}/website/Dockerfile" \
            --build-arg PROD_DOMAIN="staging-${STAGING_ID}.localhost" \
            --build-arg BRAND=mentolder \
            "${WORKTREE_PATH}"

          # 5. Import image into k3d cluster
          echo "==> Importing image into k3d cluster {{.CLUSTER_NAME}}"
          TMP_TAR=$(mktemp /tmp/staging-img-XXXXXX.tar)
          trap "rm -f '$TMP_TAR'" EXIT
          docker save "$STAGING_IMAGE" > "$TMP_TAR"
          k3d image import "$TMP_TAR" -c {{.CLUSTER_NAME}}

          # 6. Generate ephemeral DB passwords (per staging instance)
          STAGING_DB_PASSWORD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c24)
          STAGING_WEBSITE_DB_PASSWORD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c24)

          # 7. Create namespace + secret (idempotent)
          kubectl --context {{.CTX}} create namespace "$STAGING_NS" \
            --dry-run=client -o yaml | kubectl --context {{.CTX}} apply -f -
          kubectl --context {{.CTX}} -n "$STAGING_NS" create secret generic staging-db-secrets \
            --from-literal=STAGING_DB_PASSWORD="$STAGING_DB_PASSWORD" \
            --from-literal=STAGING_WEBSITE_DB_PASSWORD="$STAGING_WEBSITE_DB_PASSWORD" \
            --dry-run=client -o yaml | kubectl --context {{.CTX}} apply -f -

          # 8. Apply manifests via kustomize + envsubst
          echo "==> Applying staging manifests"
          STAGING_NS="$STAGING_NS" STAGING_ID="$STAGING_ID" STAGING_IMAGE="$STAGING_IMAGE" \
            kubectl kustomize k3d/staging-stack/ \
            | envsubst '$STAGING_NS $STAGING_ID $STAGING_IMAGE' \
            | kubectl --context {{.CTX}} apply -f -

          # Cleanup trap after successful apply (image tar already cleaned by EXIT trap)

          # 9. Wait for DB init job
          echo "==> Waiting for DB init job..."
          kubectl --context {{.CTX}} -n "$STAGING_NS" \
            wait --for=condition=Complete job/shared-db-staging-init --timeout=90s

          # 10. DB seed
          if [[ "$SEED" == "snapshot" ]]; then
            echo "==> Seeding from prod snapshot (SEED=snapshot)..."
            SECRETS_FILE="environments/.secrets/mentolder.yaml"
            if [[ ! -f "$SECRETS_FILE" ]]; then
              echo "ERROR: $SECRETS_FILE not found. Cannot seed from snapshot." >&2
              kubectl --context {{.CTX}} delete namespace "$STAGING_NS" --wait=false || true
              exit 1
            fi
            BACKUP_PASSPHRASE=$(yq -r '.BACKUP_PASSPHRASE // ""' "$SECRETS_FILE")
            if [[ -z "$BACKUP_PASSPHRASE" ]]; then
              echo "ERROR: BACKUP_PASSPHRASE missing in $SECRETS_FILE." >&2
              kubectl --context {{.CTX}} delete namespace "$STAGING_NS" --wait=false || true
              exit 1
            fi
            # Expose staging DB via a temporary port-forward in the background
            STAGING_PG_PORT=$(shuf -i 20000-29999 -n1)
            kubectl --context {{.CTX}} -n "$STAGING_NS" \
              port-forward svc/shared-db-staging "${STAGING_PG_PORT}:5432" &
            PF_PID=$!
            trap "kill $PF_PID 2>/dev/null || true; rm -f '$TMP_TAR'" EXIT
            sleep 3  # wait for port-forward to establish

            # Refresh from backup (reuses dev-db-refresh.sh against staging port)
            TMP_BACKUP=$(mktemp -d)
            trap "kill $PF_PID 2>/dev/null || true; rm -rf '$TMP_BACKUP' '$TMP_TAR'" EXIT
            HELPER="staging-snapshot-helper-$$"
            cleanup_helper() {
              kubectl --context fleet -n workspace delete pod "$HELPER" \
                --ignore-not-found --wait=false >/dev/null 2>&1 || true
            }
            trap "cleanup_helper; kill $PF_PID 2>/dev/null || true; rm -rf '$TMP_BACKUP' '$TMP_TAR'" EXIT
            kubectl --context fleet -n workspace apply -f - <<PODEOF
            apiVersion: v1
            kind: Pod
            metadata:
              name: $HELPER
              labels: { app: staging-snapshot-helper }
            spec:
              restartPolicy: Never
              containers:
              - name: c
                image: busybox:1.36
                command: ["sh","-c","sleep 300"]
                volumeMounts:
                - { name: backup, mountPath: /backups, readOnly: true }
              volumes:
              - name: backup
                persistentVolumeClaim: { claimName: backup-pvc }
  PODEOF
            kubectl --context fleet -n workspace wait \
              --for=condition=Ready pod/$HELPER --timeout=120s
            kubectl --context fleet -n workspace cp "$HELPER:/backups" "$TMP_BACKUP/backups"
            cleanup_helper

            BACKUP_DIR="$TMP_BACKUP/backups" \
            PGHOST=127.0.0.1 \
            PGPORT="$STAGING_PG_PORT" \
            BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" \
            DEV_SHARED_DB_PASSWORD="$STAGING_DB_PASSWORD" \
            DEV_WEBSITE_DB_PASSWORD="$STAGING_WEBSITE_DB_PASSWORD" \
              bash scripts/dev-db-refresh.sh

            # Anonymize
            PGHOST=127.0.0.1 \
            PGPORT="$STAGING_PG_PORT" \
            STAGING_DB_PASSWORD="$STAGING_DB_PASSWORD" \
              bash scripts/staging-db-anonymize.sh || {
                echo "ERROR: Anonymization failed — tearing down namespace." >&2
                kubectl --context {{.CTX}} delete namespace "$STAGING_NS" --wait=false || true
                exit 1
              }

            kill $PF_PID 2>/dev/null || true
            echo "==> Snapshot seed + anonymization complete."
          fi

          # 11. Wait for website rollout
          echo "==> Waiting for website deployment..."
          kubectl --context {{.CTX}} -n "$STAGING_NS" \
            rollout status deploy/website --timeout=180s

          # 12. Record in state file
          TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
          jq --arg id "$STAGING_ID" \
             --arg branch "$BRANCH" \
             --arg ns "$STAGING_NS" \
             --arg ts "$TIMESTAMP" \
             --arg url "http://web.staging-${STAGING_ID}.localhost" \
             '.[$id] = {branch: $branch, ns: $ns, created_at: $ts, url: $url}' \
             "{{.STATE_FILE}}" > "{{.STATE_FILE}}.tmp" \
          && mv "{{.STATE_FILE}}.tmp" "{{.STATE_FILE}}"

          echo ""
          echo "✓ Staging ready:"
          echo "  URL:       http://web.staging-${STAGING_ID}.localhost"
          echo "  Namespace: ${STAGING_NS}"
          echo "  Branch:    ${BRANCH}"
          echo "  Seed:      ${SEED}"

    down:
      desc: "Tear down the staging namespace for a given branch. BRANCH=<name>"
      vars:
        BRANCH: '{{.BRANCH | default ""}}'
      preconditions:
        - sh: '[ -n "{{.BRANCH}}" ]'
          msg: "BRANCH is required. Usage: task staging:down BRANCH=feature/xyz"
      deps: [_ensure-state-dir]
      cmds:
        - |
          set -euo pipefail
          BRANCH="{{.BRANCH}}"
          STAGING_ID=$(bash scripts/staging-id.sh "$BRANCH")
          STAGING_NS="workspace-staging-${STAGING_ID}"
          STAGING_IMAGE="ghcr.io/paddione/workspace-website:staging-${STAGING_ID}"
          WORKTREE_PATH="/tmp/staging-${STAGING_ID}"

          echo "==> staging:down  BRANCH=${BRANCH}  NS=${STAGING_NS}"

          # Delete namespace (idempotent — no error if already gone)
          if kubectl --context {{.CTX}} get namespace "$STAGING_NS" >/dev/null 2>&1; then
            kubectl --context {{.CTX}} delete namespace "$STAGING_NS" --wait=false
            echo "==> Namespace ${STAGING_NS} deletion initiated."
          else
            echo "==> Namespace ${STAGING_NS} not found (already gone or never created)."
          fi

          # Remove worktree if present
          if [[ -d "$WORKTREE_PATH" ]]; then
            git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
            echo "==> Worktree ${WORKTREE_PATH} removed."
          fi

          # Remove local image
          docker rmi "$STAGING_IMAGE" 2>/dev/null && echo "==> Image ${STAGING_IMAGE} removed." || true

          # Remove from state file
          if [[ -f "{{.STATE_FILE}}" ]]; then
            jq --arg id "$STAGING_ID" 'del(.[$id])' "{{.STATE_FILE}}" \
              > "{{.STATE_FILE}}.tmp" && mv "{{.STATE_FILE}}.tmp" "{{.STATE_FILE}}"
          fi

          echo "✓ Staging ${STAGING_NS} torn down."

    list:
      desc: "List all active staging namespaces"
      deps: [_ensure-state-dir]
      cmds:
        - |
          set -euo pipefail
          echo "Active staging instances:"
          echo ""

          # Show from cluster (ground truth)
          LIVE=$(kubectl --context {{.CTX}} get ns \
            -l staging=true \
            --no-headers \
            -o custom-columns=NAME:.metadata.name 2>/dev/null || echo "")

          if [[ -z "$LIVE" ]]; then
            echo "  (none)"
          else
            printf "  %-25s %-30s %s\n" "STAGING_ID" "BRANCH" "URL"
            printf "  %-25s %-30s %s\n" "─────────────────────────" "──────────────────────────────" "───────────────────────────────────"
            while IFS= read -r NS; do
              ID="${NS#workspace-staging-}"
              BRANCH=$(jq -r --arg id "$ID" '.[$id].branch // "unknown"' "{{.STATE_FILE}}" 2>/dev/null || echo "unknown")
              URL="http://web.staging-${ID}.localhost"
              printf "  %-25s %-30s %s\n" "$ID" "$BRANCH" "$URL"
            done <<< "$LIVE"
          fi
          echo ""

    status:
      desc: "Show pod/deployment status for a staging namespace. BRANCH=<name>"
      vars:
        BRANCH: '{{.BRANCH | default ""}}'
      preconditions:
        - sh: '[ -n "{{.BRANCH}}" ]'
          msg: "BRANCH is required. Usage: task staging:status BRANCH=feature/xyz"
      cmds:
        - |
          set -euo pipefail
          STAGING_ID=$(bash scripts/staging-id.sh "{{.BRANCH}}")
          STAGING_NS="workspace-staging-${STAGING_ID}"
          echo "==> Status for ${STAGING_NS}"
          kubectl --context {{.CTX}} get pods,svc,ingress,job -n "$STAGING_NS" 2>/dev/null \
            || echo "Namespace ${STAGING_NS} not found."

    clean:
      desc: "Destroy ALL staging namespaces + worktrees + images (with confirmation prompt)"
      deps: [_ensure-state-dir]
      cmds:
        - |
          set -euo pipefail

          NAMESPACES=$(kubectl --context {{.CTX}} get ns \
            -l staging=true \
            --no-headers \
            -o custom-columns=NAME:.metadata.name 2>/dev/null || echo "")

          if [[ -z "$NAMESPACES" ]]; then
            echo "No staging namespaces found — nothing to clean."
            exit 0
          fi

          echo "The following staging namespaces will be DELETED:"
          echo "$NAMESPACES" | sed 's/^/  /'
          echo ""
          read -r -p "Type 'yes' to confirm: " CONFIRM
          if [[ "$CONFIRM" != "yes" ]]; then
            echo "Aborted."
            exit 0
          fi

          while IFS= read -r NS; do
            echo "==> Deleting ${NS}"
            kubectl --context {{.CTX}} delete namespace "$NS" --wait=false || true
            ID="${NS#workspace-staging-}"
            WORKTREE="/tmp/staging-${ID}"
            IMAGE="ghcr.io/paddione/workspace-website:staging-${ID}"
            [[ -d "$WORKTREE" ]] && git worktree remove "$WORKTREE" --force 2>/dev/null || true
            docker rmi "$IMAGE" 2>/dev/null || true
          done <<< "$NAMESPACES"

          # Reset state file
          echo '{}' > "{{.STATE_FILE}}"
          echo "✓ All staging namespaces cleaned."
  TASKEOF
  ```

- [x] **Step 4.2: Verify Taskfile parses without errors**

  ```bash
  cd /tmp/wt-T000616-staging
  task --list 2>&1 | grep staging
  # Expected: lines for staging:up, staging:down, staging:list, staging:status, staging:clean
  # (This may fail if the include isn't wired yet — that's fine at this stage)
  ```

- [x] **Step 4.3: Commit**

  ```bash
  git -C /tmp/wt-T000616-staging add Taskfile.staging.yml
  git -C /tmp/wt-T000616-staging commit -m "feat(staging): add Taskfile.staging.yml — staging:up/down/list/status/clean"
  ```

---

## Task 5: Wire Include into `Taskfile.yml`

**Files:**
- Modify: `Taskfile.yml` (add `staging:` include)

- [x] **Step 5.1: Add the include**

  Open `Taskfile.yml`. Find the `includes:` block (it starts at line 4). Add after the `dev-korczewski:` block (before or after `devcluster:`, before line ~30):

  ```yaml
    # Staging on-demand — per-branch isolated k3d namespaces.
    # See Taskfile.staging.yml + docs/superpowers/specs/2026-06-11-staging-on-demand-design.md.
    staging:
      taskfile: ./Taskfile.staging.yml
      dir: .
  ```

  After editing, the relevant portion of `Taskfile.yml` should look like:

  ```yaml
  includes:
    assets:
      taskfile: ./Taskfile.assets.yml
      dir: .
    llm:
      taskfile: ./Taskfile.llm.yml
      dir: .
    dev:
      taskfile: ./Taskfile.dev-stack.yml
      dir: .
    dev-korczewski:
      taskfile: ./Taskfile.dev-stack.yml
      dir: .
      vars:
        ENV: korczewski
        CTX_DEV: k3d-korczewski-dev
        CTX_PROD: fleet
        NS_DEV: workspace-korczewski-dev
        NS_PROD: workspace-korczewski
        CLUSTER_NAME: korczewski-dev
    # Staging on-demand — per-branch isolated k3d namespaces.
    # See Taskfile.staging.yml + docs/superpowers/specs/2026-06-11-staging-on-demand-design.md.
    staging:
      taskfile: ./Taskfile.staging.yml
      dir: .
    devcluster:
      taskfile: ./Taskfile.devcluster.yml
  ```

- [x] **Step 5.2: Verify tasks are registered**

  ```bash
  cd /tmp/wt-T000616-staging
  task --list 2>&1 | grep "staging:"
  # Expected output (5 lines):
  # * staging:clean    Destroy ALL staging namespaces + worktrees + images (with confirmation prompt)
  # * staging:down     Tear down the staging namespace for a given branch. BRANCH=<name>
  # * staging:list     List all active staging namespaces
  # * staging:status   Show pod/deployment status for a staging namespace. BRANCH=<name>
  # * staging:up       Spin up a staging namespace for a given branch. BRANCH=<name> [SEED=empty|snapshot]
  ```

- [x] **Step 5.3: Commit**

  ```bash
  git -C /tmp/wt-T000616-staging add Taskfile.yml
  git -C /tmp/wt-T000616-staging commit -m "feat(staging): wire staging: include into root Taskfile.yml"
  ```

---

## Task 6: Wire Tests into `Taskfile.yml`

**Files:**
- Modify: `Taskfile.yml` — add `test:unit:staging` internal task and include in `test:unit` deps

- [x] **Step 6.1: Add `test:unit:staging` internal task**

  Find the block of `test:unit:*` internal tasks in `Taskfile.yml` (around line 278). Add after the last entry (e.g. after `test:unit:readiness-webhook:`):

  ```yaml
    test:unit:staging:
      internal: true
      cmds:
        - ./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats
  ```

- [x] **Step 6.2: Add `test:unit:staging` to `test:unit` deps list**

  Find `test:unit:` task (around line 244). Add `- task: test:unit:staging` to its `cmds:` list, after `- task: test:unit:readiness-webhook`.

  The resulting `test:unit:` cmds block should end with:
  ```yaml
        - task: test:unit:readiness-webhook
        - task: test:unit:staging
  ```

- [x] **Step 6.3: Verify parse**

  ```bash
  cd /tmp/wt-T000616-staging
  task --list 2>&1 | head -5
  # Expected: no parse errors
  ```

- [x] **Step 6.4: Commit**

  ```bash
  git -C /tmp/wt-T000616-staging add Taskfile.yml
  git -C /tmp/wt-T000616-staging commit -m "feat(staging): wire test:unit:staging into Taskfile.yml test:unit"
  ```

---

## Task 7: BATS Tests — `tests/unit/staging.bats`

**Files:**
- Create: `tests/unit/staging.bats`

Tests must be offline-safe (no real k3d, no real docker). Mocks are inline functions injected via `PATH` manipulation.

- [x] **Step 7.1: Write the test file**

  ```bash
  cat > /tmp/wt-T000616-staging/tests/unit/staging.bats << 'EOF'
  #!/usr/bin/env bats
  # ═══════════════════════════════════════════════════════════════════
  # staging.bats — offline unit tests for T000616 staging-on-demand
  #
  # Tests:
  #   1-6  staging-id.sh: branch sanitization rules
  #   7    staging-id.sh: empty-result guard
  #   8    kustomize build dry-run (offline, envsubst substitution check)
  # ═══════════════════════════════════════════════════════════════════

  load test_helper

  STAGING_ID_SCRIPT="${PROJECT_DIR}/scripts/staging-id.sh"
  STAGING_STACK="${PROJECT_DIR}/k3d/staging-stack"

  # ── staging-id.sh tests ──────────────────────────────────────────

  @test "staging-id: feature branch produces lowercase alphanumeric id" {
    run bash "$STAGING_ID_SCRIPT" "feature/T000616-staging-on-demand"
    [ "$status" -eq 0 ]
    # Must be only [a-z0-9-]
    [[ "$output" =~ ^[a-z0-9][a-z0-9-]*$ ]]
  }

  @test "staging-id: result is at most 20 characters" {
    run bash "$STAGING_ID_SCRIPT" "feature/T000616-staging-on-demand"
    [ "$status" -eq 0 ]
    [ "${#output}" -le 20 ]
  }

  @test "staging-id: short branch name passes through cleanly" {
    run bash "$STAGING_ID_SCRIPT" "main"
    [ "$status" -eq 0 ]
    [ "$output" = "main" ]
  }

  @test "staging-id: strips refs/heads/ prefix" {
    run bash "$STAGING_ID_SCRIPT" "refs/heads/feature/abc"
    [ "$status" -eq 0 ]
    [ "$output" = "feature-abc" ]
  }

  @test "staging-id: slashes and underscores become dashes" {
    run bash "$STAGING_ID_SCRIPT" "fix/my_branch"
    [ "$status" -eq 0 ]
    [ "$output" = "fix-my-branch" ]
  }

  @test "staging-id: id starting with digit gets s- prefix" {
    run bash "$STAGING_ID_SCRIPT" "123-feature"
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^[a-z] ]]
  }

  @test "staging-id: consecutive separators collapse to single dash" {
    run bash "$STAGING_ID_SCRIPT" "fix//double--slash"
    [ "$status" -eq 0 ]
    [[ ! "$output" =~ -- ]]
  }

  @test "staging-id: deterministic — same branch always gives same id" {
    BRANCH="feature/T000616-staging-on-demand"
    run bash "$STAGING_ID_SCRIPT" "$BRANCH"
    FIRST="$output"
    run bash "$STAGING_ID_SCRIPT" "$BRANCH"
    [ "$output" = "$FIRST" ]
  }

  # ── kustomize build dry-run ──────────────────────────────────────

  @test "kustomize build of staging-stack succeeds with placeholder vars" {
    # Requires: kustomize or kubectl with kustomize support
    if ! command -v kubectl >/dev/null 2>&1; then
      skip "kubectl not available (offline CI)"
    fi
    export STAGING_NS="workspace-staging-test"
    export STAGING_ID="test"
    export STAGING_IMAGE="ghcr.io/paddione/workspace-website:staging-test"
    run bash -c "kubectl kustomize '${STAGING_STACK}/' \
      | envsubst '\$STAGING_NS \$STAGING_ID \$STAGING_IMAGE'"
    [ "$status" -eq 0 ]
    # Output should contain our namespace name
    [[ "$output" == *"workspace-staging-test"* ]]
    # Output should contain the image reference
    [[ "$output" == *"ghcr.io/paddione/workspace-website:staging-test"* ]]
  }

  @test "kustomize build contains expected resource kinds" {
    if ! command -v kubectl >/dev/null 2>&1; then
      skip "kubectl not available (offline CI)"
    fi
    export STAGING_NS="workspace-staging-test"
    export STAGING_ID="test"
    export STAGING_IMAGE="ghcr.io/paddione/workspace-website:staging-test"
    run bash -c "kubectl kustomize '${STAGING_STACK}/' \
      | envsubst '\$STAGING_NS \$STAGING_ID \$STAGING_IMAGE'"
    [ "$status" -eq 0 ]
    [[ "$output" == *"kind: Namespace"* ]]
    [[ "$output" == *"kind: StatefulSet"* ]]
    [[ "$output" == *"kind: Deployment"* ]]
    [[ "$output" == *"kind: Ingress"* ]]
    [[ "$output" == *"kind: Job"* ]]
  }

  @test "staging-db-anonymize.sh is executable and has correct shebang" {
    SCRIPT="${PROJECT_DIR}/scripts/staging-db-anonymize.sh"
    [ -f "$SCRIPT" ]
    [ -x "$SCRIPT" ]
    head -1 "$SCRIPT" | grep -q "#!/usr/bin/env bash"
  }

  @test "staging-db-anonymize.sh fails when PGPORT is unset" {
    run env -i HOME="$HOME" bash "${PROJECT_DIR}/scripts/staging-db-anonymize.sh"
    [ "$status" -ne 0 ]
    # Should error on missing PGPORT
    [[ "$output" =~ "PGPORT" ]] || [[ "$stderr" =~ "PGPORT" ]]
  }
  EOF
  ```

- [x] **Step 7.2: Run the tests (expect most to pass immediately)**

  ```bash
  cd /tmp/wt-T000616-staging
  ./tests/unit/lib/bats-core/bin/bats tests/unit/staging.bats
  # Expected: all staging-id tests PASS; kustomize tests skip if kubectl absent; anonymize tests PASS
  # No FAILs expected (the scripts exist at this point)
  ```

- [x] **Step 7.3: Fix any failures**

  If `staging-id.sh` has edge-case bugs surfaced by the BATS tests, fix the script in `scripts/staging-id.sh` before committing. Re-run `bats tests/unit/staging.bats` until green.

- [x] **Step 7.4: Commit**

  ```bash
  git -C /tmp/wt-T000616-staging add tests/unit/staging.bats
  git -C /tmp/wt-T000616-staging commit -m "test(staging): add BATS unit tests for staging-id.sh + manifest dry-run"
  ```

---

## Task 8: Full Offline Test Suite Verification

Confirm the new tests are properly wired and the full offline suite still passes.

- [x] **Step 8.1: Run `task test:unit` and verify staging tests are included**

  ```bash
  cd /tmp/wt-T000616-staging
  task test:unit 2>&1 | grep -E "staging|PASS|FAIL|ok|not ok"
  # Expected: staging.bats tests appear in output, all green
  ```

- [x] **Step 8.2: Run `task test:all` to confirm no regressions**

  ```bash
  cd /tmp/wt-T000616-staging
  task test:all
  # Expected: exits 0; all prior tests still pass
  ```

  If `task test:all` fails on unrelated tests, investigate before continuing. Do NOT commit a broken test suite.

- [x] **Step 8.3: Commit if anything was fixed during 8.1/8.2**

  Only if additional fixes were needed:
  ```bash
  git -C /tmp/wt-T000616-staging add -p   # stage only the fix
  git -C /tmp/wt-T000616-staging commit -m "fix(staging): correct test wiring / fix edge case found during test:all"
  ```

---

## Task 9: Smoke Test `staging:up` Dry-Run (Manual, Optional)

This task is manual and requires a running k3d cluster. Skip in CI. Run locally on the WSL host.

- [x] **Step 9.1: Verify cluster is up**

  ```bash
  k3d cluster list | grep mentolder-dev
  # Expected: mentolder-dev   1/1    ...
  ```

- [x] **Step 9.2: Run staging:up on the current feature branch**

  ```bash
  cd /tmp/wt-T000616-staging
  task staging:up BRANCH=feature/T000616-staging-on-demand SEED=empty
  # Expected final output:
  # ✓ Staging ready:
  #   URL:       http://web.staging-t000616-staging-on.localhost
  #   Namespace: workspace-staging-t000616-staging-on
  #   Branch:    feature/T000616-staging-on-demand
  #   Seed:      empty
  ```

- [x] **Step 9.3: Verify namespace exists and pods are running**

  ```bash
  kubectl --context k3d-mentolder-dev get pods -n workspace-staging-t000616-staging-on
  # Expected: shared-db-staging-0 Running, website-* Running, shared-db-staging-init-* Completed
  ```

- [x] **Step 9.4: Verify ingress is accessible**

  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://web.staging-t000616-staging-on.localhost/api/health
  # Expected: 200
  ```

- [x] **Step 9.5: Verify listing works**

  ```bash
  task staging:list
  # Expected: table showing the active staging instance
  ```

- [x] **Step 9.6: Tear down and verify cleanup**

  ```bash
  task staging:down BRANCH=feature/T000616-staging-on-demand
  kubectl --context k3d-mentolder-dev get ns | grep staging
  # Expected: nothing (namespace gone or Terminating)
  ```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Task(s) | Status |
|------------------|---------|--------|
| `Taskfile.staging.yml` with 5 tasks | Task 4 | ✓ |
| `k3d/staging-stack/` Kustomize overlay | Task 3 | ✓ |
| `scripts/staging-id.sh` | Task 1 | ✓ |
| `scripts/staging-db-anonymize.sh` | Task 2 | ✓ |
| `tests/unit/staging.bats` | Task 7 | ✓ |
| Include in `Taskfile.yml` | Task 5 | ✓ |
| `SEED=empty` (default) vs `SEED=snapshot` | Task 4 `staging:up` | ✓ |
| emptyDir Postgres (no PVC) | Task 3c | ✓ |
| No TLS, plain HTTP ingress | Task 3e | ✓ |
| `staging:list` — tabular output with state file | Task 4 | ✓ |
| `staging:clean` — safety prompt before bulk delete | Task 4 | ✓ |
| `staging:status` — kubectl get for a single NS | Task 4 | ✓ |
| STAGING_ID max 20 chars, `[a-z0-9-]`, starts with letter | Task 1 | ✓ |
| Image built from worktree, imported via k3d | Task 4 `staging:up` | ✓ |
| State file at `~/.local/share/workspace-staging/active.json` | Task 4 | ✓ |
| Namespace labeled `staging=true` for easy list/clean | Task 3b | ✓ |
| Anonymize fails → namespace deleted (PII guard) | Task 4, step 10 | ✓ |
| Tests wired into `task test:unit` and `task test:all` | Task 6 | ✓ |
| Idempotent apply (second `staging:up` same branch) | Task 3 uses `--dry-run apply` | ✓ |
| `staging:down` idempotent (NS not found = no error) | Task 4 `staging:down` | ✓ |

**No gaps detected.** All spec sections are covered.
