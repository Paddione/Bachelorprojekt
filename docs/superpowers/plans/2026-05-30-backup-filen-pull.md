---
title: Backup Filen-Pull Implementation Plan
ticket_id: T000331
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Backup Filen-Pull Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `filen-pull <timestamp>` capability that downloads encrypted backup archives from Filen cloud into the in-cluster `backup-pvc`, so a freshly-deployed cluster can restore content using the existing restore tasks.

**Architecture:** New subcommand in `scripts/backup-restore.sh` that spawns a one-shot Kubernetes `Job` (same pattern as the existing `pvc-restore` block) mirroring the `filen-upload` container in `k3d/backup-cronjob.yaml` — `node:22-alpine` + `@filen/cli`, credentials from `workspace-secrets` — but inverted to *download* into `backup-pvc` mounted **writable**. An ENV-aware Taskfile wrapper exposes it as `workspace:backup:filen-pull`.

**Tech Stack:** Bash, kubectl, Kubernetes Job, `@filen/cli` (Node), BATS unit tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `tests/unit/backup-restore-filen-pull.bats` | Unit test: arg validation, Job manifest shape, remote-path resolution, usage text |
| Modify | `scripts/backup-restore.sh` | Add `--remote-path` flag parse, `filen-pull` case, usage doc |
| Modify | `Taskfile.yml` | Add `workspace:backup:filen-pull` ENV-aware task |

---

## Task 1: filen-pull subcommand (TDD)

**Files:**
- Create: `tests/unit/backup-restore-filen-pull.bats`
- Modify: `scripts/backup-restore.sh` (flag loop ~line 48–58; usage ~line 9–41; new case before final `esac` ~line 455)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/backup-restore-filen-pull.bats`:

```bash
#!/usr/bin/env bats
# backup-restore-filen-pull.bats — unit tests for `backup-restore.sh filen-pull`
# Stubs kubectl so no live cluster/Filen is required; captures the applied Job YAML.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/backup-restore.sh"

setup() {
  FAKE_BIN=$(mktemp -d)
  export CAPTURE="${BATS_TEST_TMPDIR}/applied.yaml"
  cat > "${FAKE_BIN}/kubectl" <<EOF
#!/usr/bin/env bash
# Capture 'apply -f -' stdin; answer configmap lookups; succeed on wait/logs.
args="\$*"
case "\$args" in
  *"apply"*) cat > "${CAPTURE}" ; exit 0 ;;
  *"get configmap backup-config"*) echo "/Backup" ; exit 0 ;;
  *"wait"*) exit 0 ;;
  *"logs"*) exit 0 ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${FAKE_BIN}/kubectl"
  export PATH="${FAKE_BIN}:${PATH}"
}

teardown() {
  rm -rf "$FAKE_BIN"
}

@test "filen-pull without timestamp fails with usage" {
  run bash "$SCRIPT" filen-pull
  assert_failure
  assert_output --partial "Usage"
}

@test "filen-pull renders a Job mounting backup-pvc writable" {
  run bash "$SCRIPT" filen-pull 20260530-020001
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "kind: Job"
  assert_output --partial "claimName: backup-pvc"
  assert_output --partial "node:22-alpine"
  assert_output --partial "/backups/20260530-020001/"
  # The backups volume must be writable — no readOnly mount anywhere in the Job.
  refute_output --partial "readOnly: true"
}

@test "filen-pull resolves remote base path from backup-config configmap" {
  run bash "$SCRIPT" filen-pull pvc-20260530-030001
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "/Backup/pvc-20260530-030001/"
}

@test "filen-pull honours --remote-path override" {
  run bash "$SCRIPT" filen-pull 20260530-020001 --remote-path /custom/path
  assert_success
  run cat "$CAPTURE"
  assert_output --partial "/custom/path/20260530-020001/"
}

@test "usage lists filen-pull" {
  run bash "$SCRIPT" --help
  assert_success
  assert_output --partial "filen-pull"
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /tmp/wt-backup-filen-pull && bats tests/unit/backup-restore-filen-pull.bats`
Expected: FAIL — `filen-pull` is an unknown command (script falls through to its default `*)` case / usage), captured file never written.

- [ ] **Step 3: Add the `--remote-path` flag to the parse loop**

In `scripts/backup-restore.sh`, the flag loop currently reads:

```bash
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)   CTX_FLAG="--context $2"; shift 2 ;;
    --namespace) NS="$2"; shift 2 ;;
    -y|--yes)    YES=true; shift ;;
    -h|--help)   usage; exit 0 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
```

Add a `--remote-path` case directly after `--namespace`:

```bash
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)     CTX_FLAG="--context $2"; shift 2 ;;
    --namespace)   NS="$2"; shift 2 ;;
    --remote-path) REMOTE_PATH="$2"; shift 2 ;;
    -y|--yes)      YES=true; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done
```

- [ ] **Step 4: Document `filen-pull` in `usage()`**

In the `usage()` heredoc, after the `pvc-restore` line in the "Commands (PVC file data)" block, add a new section. Locate:

```
  pvc-restore <service> <timestamp> Restore PVC data from a backup
    service:   nextcloud-files | vaultwarden-data | docuseal-data | all
    timestamp: directory from 'pvc-list' (e.g. pvc-20260427-030001)
    IMPORTANT: scale down the target service before restoring, e.g.:
      kubectl scale deploy/nextcloud -n workspace --replicas=0 --context <ctx>
```

Add immediately below it (still inside the heredoc):

```
Commands (disaster recovery — fresh cluster):
  filen-pull <timestamp> [--remote-path <path>]
                             Download a backup timestamp from Filen cloud into
                             the in-cluster backup-pvc, so the existing
                             'restore' / 'pvc-restore' commands can run on a
                             freshly-deployed cluster (where backup-pvc is empty).
                             Remote path defaults to backup-config's
                             FILEN_DEFAULT_UPLOAD_PATH. Timestamps are discovered
                             out-of-band (Filen web/desktop app or 'filen ls').
```

- [ ] **Step 5: Add the `filen-pull` case block**

In `scripts/backup-restore.sh`, find the final `esac` (~line 455) that closes the main `case "$CMD" in` dispatch. Add this new case immediately **before** that closing `esac` (after the `pvc-restore)` block ends):

```bash
  filen-pull)
    TS="${1:-}"
    [[ -n "$TS" ]] || _die "Usage: $SCRIPT filen-pull <timestamp> [--remote-path <path>]"

    # Resolve the Filen remote base path: --remote-path wins, else the
    # backup-config ConfigMap default (mirrors what the upload side uploads to).
    if [[ -z "${REMOTE_PATH:-}" ]]; then
      REMOTE_PATH=$($KC get configmap backup-config -n "$NS" \
        -o jsonpath='{.data.FILEN_DEFAULT_UPLOAD_PATH}' 2>/dev/null || echo "")
    fi
    [[ -n "$REMOTE_PATH" ]] || _die "Could not resolve Filen remote path — pass --remote-path <path> or ensure backup-config has FILEN_DEFAULT_UPLOAD_PATH"

    echo "Pulling ${TS} from Filen (${REMOTE_PATH}/${TS}/) into backup-pvc (ns=${NS})..."
    JOB="filen-pull-$$"

    $KC apply -n "$NS" -f - <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB}
  namespace: ${NS}
  labels:
    app: filen-pull
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        fsGroup: 65532
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: filen-pull
          # Mirrors the filen-upload container in k3d/backup-cronjob.yaml,
          # inverted to download. @filen/cli is the only working Filen client
          # (rclone has no Filen backend; webdav.filen.io is desktop-only).
          image: node:22-alpine
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              if [ -z "\$FILEN_EMAIL" ] || [ -z "\$FILEN_PASSWORD" ]; then
                echo "ERROR: FILEN_EMAIL/FILEN_PASSWORD not set in workspace-secrets"; exit 1
              fi
              export HOME=/tmp
              echo "Installing Filen CLI..."
              npm install -g @filen/cli --prefix /tmp/npm-global --silent 2>&1 | tail -3
              export PATH="/tmp/npm-global/bin:\$PATH"
              mkdir -p "/backups/${TS}"
              echo "Downloading ${REMOTE_PATH}/${TS}/ -> /backups/${TS}/ ..."
              filen --email "\$FILEN_EMAIL" --password "\$FILEN_PASSWORD" \\
                download "${REMOTE_PATH}/${TS}/" "/backups/${TS}/"
              echo "Pulled ${TS} into backup-pvc:/backups/${TS}/"
              ls -la "/backups/${TS}/"
          env:
            - name: FILEN_EMAIL
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: FILEN_EMAIL
            - name: FILEN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: FILEN_PASSWORD
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 1Gi
              cpu: "1"
      volumes:
        - name: backup-storage
          persistentVolumeClaim:
            claimName: backup-pvc
YAML

    echo "Waiting for filen-pull job to complete (up to 10 min)..."
    if ! $KC wait -n "$NS" job/"$JOB" --for=condition=Complete --timeout=600s 2>/dev/null; then
      echo "ERROR: filen-pull job did not complete"
      $KC logs -n "$NS" -l "job-name=${JOB}" --tail=50 2>/dev/null || true
      exit 1
    fi
    $KC logs -n "$NS" -l "job-name=${JOB}" --tail=20 2>/dev/null || true
    echo ""
    echo "✓ filen-pull complete. Confirm and restore:"
    echo "    $SCRIPT list ${CTX_FLAG}        # DB backups now in backup-pvc"
    echo "    $SCRIPT pvc-list ${CTX_FLAG}    # PVC backups now in backup-pvc"
    echo "    $SCRIPT restore <db> ${TS} ${CTX_FLAG}"
    echo "    $SCRIPT pvc-restore <svc> ${TS} ${CTX_FLAG}"
    ;;

```

> **Note on `filen download` arg order:** the upload side uses
> `filen ... upload <local> <cloud>`. The download is `filen ... download <cloud> <local>`,
> which is what is written above. Verify against the installed `@filen/cli`
> (`filen download --help`) during the first live run; if the CLI expects a
> different flag form, adjust only the `args:` heredoc line — the Job shape and
> tests are unaffected.

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd /tmp/wt-backup-filen-pull && bats tests/unit/backup-restore-filen-pull.bats`
Expected: PASS (6/6).

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-backup-filen-pull
git add scripts/backup-restore.sh tests/unit/backup-restore-filen-pull.bats
git commit -m "feat(backup): add filen-pull to download backups from Filen into backup-pvc"
```

---

## Task 2: Taskfile wrapper `workspace:backup:filen-pull`

**Files:**
- Modify: `Taskfile.yml` (add task next to `workspace:backup:pvcs:list`, ~line 1047)

- [ ] **Step 1: Add the ENV-aware task**

In `Taskfile.yml`, after the `workspace:backup:pvcs:list:` task (ends ~line 1047, before `workspace:pvc:restore:`), insert:

```yaml
  workspace:backup:filen-pull:
    desc: "Download a backup timestamp from Filen cloud into backup-pvc (usage: task workspace:backup:filen-pull -- <timestamp> [--remote-path <p>]) [ENV=dev|mentolder|korczewski]"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        ctx_arg=""
        [ "{{.ENV}}" != "dev" ] && ctx_arg="--context $ENV_CONTEXT"
        ns_arg="--namespace ${WORKSPACE_NAMESPACE:-workspace}"
        bash scripts/backup-restore.sh filen-pull {{.CLI_ARGS}} $ctx_arg $ns_arg
```

- [ ] **Step 2: Verify the task is registered and dry-runs**

Run: `cd /tmp/wt-backup-filen-pull && task --list 2>/dev/null | grep filen-pull`
Expected: the `workspace:backup:filen-pull` line appears.

Run: `cd /tmp/wt-backup-filen-pull && task workspace:backup:filen-pull --dry 2>&1 | head -5`
Expected: prints the resolved command without error (no execution).

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-backup-filen-pull
git add Taskfile.yml
git commit -m "feat(backup): expose workspace:backup:filen-pull task"
```

---

## Task 3: Full offline suite + inventory

**Files:**
- Possibly Modify: `website/src/data/test-inventory.json` (if the new BATS file is inventoried)

- [ ] **Step 1: Run the full offline test suite**

Run: `cd /tmp/wt-backup-filen-pull && task test:all`
Expected: all pass (dev-cluster-dependent tests may skip — that is OK).

- [ ] **Step 2: Regenerate test inventory and check for drift**

Run:
```bash
cd /tmp/wt-backup-filen-pull
task test:inventory
git diff --exit-code website/src/data/test-inventory.json
```
Expected: exit 0 (no diff). If there IS a diff (the new bats file got inventoried), stage and commit it:

```bash
git add website/src/data/test-inventory.json
git commit -m "chore(tests): refresh test-inventory for filen-pull"
```

- [ ] **Step 3: Push the branch**

```bash
cd /tmp/wt-backup-filen-pull
git push
```

---

## Verification (post-merge, live — for dev-flow-execute / operator)

Not part of the offline plan, but the real acceptance check. On a cluster that
*has* Filen backups uploaded:

```bash
task workspace:backup:filen-pull -- <known-timestamp> ENV=korczewski
task workspace:backup:list ENV=korczewski        # timestamp now present locally
# then the standard restore flow:
kubectl scale deploy/nextcloud -n workspace-korczewski --replicas=0 --context korczewski
task workspace:pvc:restore -- all <known-timestamp> ENV=korczewski
```

Expected: the pulled archives appear in `backup-pvc`, and `list`/`pvc-list`
report the timestamp that was empty before.
