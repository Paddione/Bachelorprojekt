---
name: backup-check
description: Use when asked to audit, test, or fix the database backup/restore process on the Bachelorprojekt platform. Covers setup verification, triggering a live backup, verifying encrypted files, running a safe restore-to-temp-db test, and fixing any issues found.
---

# Backup Check

End-to-end audit of the backup system: verify setup → trigger live backup → verify files → test restore safely → fix issues.

## Databases in scope

| Database     | Owner role  | Contains                                       |
|--------------|-------------|------------------------------------------------|
| keycloak     | keycloak    | SSO users, realms, OAuth clients               |
| nextcloud    | nextcloud   | File index, calendar, contacts, metadata       |
| vaultwarden  | vaultwarden | Password vault structure (not file attachments)|
| website      | website     | App DB + bugs/bachelorprojekt/coaching schemas |
| docuseal     | docuseal    | Document signing workflows, templates          |

**Not backed up:** Nextcloud file PVC, Vaultwarden attachments, DocuSeal document files, LiveKit recordings.

## Cluster targets

| Cluster      | kubectl context | Namespace            |
|--------------|-----------------|----------------------|
| mentolder    | mentolder       | workspace            |
| korczewski-ha| korczewski-ha   | workspace-korczewski |

Always run the full check on **both clusters** unless the user specifies one.

---

## Phase 1 — Setup Audit

For each cluster, run these checks (use `--context <ctx>` and `-n <ns>`):

### 1.1 CronJob presence and name

```bash
kubectl get cronjob -n <ns> --context <ctx>
```

**Expected:** A CronJob named `db-backup` with schedule `0 2 * * *`.

**Known name-drift issue:** Early deployments created a `backup-postgres` CronJob (schedule `0 3 * * *`, age 84d+). If you see `backup-postgres` instead of (or alongside) `db-backup`:
- `backup-restore.sh trigger` will fail because it calls `kubectl create job --from=cronjob/db-backup`
- **Fix:** Apply the current manifest then delete the old one:
  ```bash
  task workspace:deploy ENV=<env>            # re-applies k3d/backup-cronjob.yaml
  kubectl delete cronjob backup-postgres -n <ns> --context <ctx>
  ```

### 1.2 CronJob not suspended

```bash
kubectl get cronjob db-backup -n <ns> --context <ctx> -o jsonpath='{.spec.suspend}'
```
Must be `false`. If `true`:
```bash
kubectl patch cronjob db-backup -n <ns> --context <ctx> -p '{"spec":{"suspend":false}}'
```

### 1.3 PVC exists and is bound

```bash
kubectl get pvc backup-pvc -n <ns> --context <ctx>
```
Must be `Bound`. If missing → `task workspace:deploy ENV=<env>` (applies `k3d/backup-pvc.yaml`).

### 1.4 BACKUP_PASSPHRASE secret present

```bash
kubectl get secret workspace-secrets -n <ns> --context <ctx> \
  -o jsonpath='{.data.BACKUP_PASSPHRASE}' | base64 -d | wc -c
```
Must be ≥ 32 bytes. If missing or short → rotate secrets: `task env:generate ENV=<env> && task env:seal ENV=<env> && task workspace:deploy ENV=<env>`.

### 1.5 backup-config ConfigMap present

```bash
kubectl get configmap backup-config -n <ns> --context <ctx>
```
If missing → `task workspace:deploy ENV=<env>`.

### 1.6 Last job history

```bash
kubectl get jobs -n <ns> --context <ctx> --sort-by=.metadata.creationTimestamp \
  -l app=db-backup
```
Verify at least one `Complete 1/1` in recent history.

---

## Phase 2 — Trigger a Live Backup

Trigger one backup per cluster and watch it complete:

```bash
bash scripts/backup-restore.sh trigger --context mentolder
bash scripts/backup-restore.sh trigger --context korczewski-ha --namespace workspace-korczewski
```

**If trigger fails with "cronjob not found":** the name-drift issue from 1.1 is present — fix it first, then retry.

**Wait for completion.** The job logs its own status. Expected tail:
```
Backup complete: /backups/YYYYMMDD-HHMMSS
...keycloak.dump.enc ...nextcloud.dump.enc ...vaultwarden.dump.enc ...website.dump.enc ...docuseal.dump.enc
✓ Backup complete
```

Then list backups to confirm the new timestamp appeared:
```bash
bash scripts/backup-restore.sh list --context mentolder
bash scripts/backup-restore.sh list --context korczewski-ha --namespace workspace-korczewski
```

---

## Phase 3 — Verify Encrypted Files

For the latest backup timestamp, verify all 5 encrypted files exist and are non-trivial in size. Spawn a busybox pod against backup-pvc:

```bash
STAMP=<latest-timestamp>   # from Phase 2 list output
kubectl run backup-verify-$$ -n <ns> --context <ctx> --restart=Never --image=busybox \
  --overrides='{"spec":{"restartPolicy":"Never","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"securityContext":{"runAsNonRoot":true,"runAsUser":65532,"runAsGroup":65532,"seccompProfile":{"type":"RuntimeDefault"}},"affinity":{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"kubernetes.io/hostname","operator":"NotIn","values":["k3s-1","k3s-2","k3s-3","k3w-1","k3w-2","k3w-3"]}]}]}}},"containers":[{"name":"c","image":"busybox","command":["/bin/sh","-c","ls -lh /backups/'"$STAMP"'/"],"securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},"volumeMounts":[{"name":"b","mountPath":"/backups","readOnly":true}]}]}}' \
  -- /bin/sh -c "ls -lh /backups/$STAMP/"
```

Wait for it, print logs, then delete. All 5 `.dump.enc` files must be present and > 1 KB.

---

## Phase 4 — Safe Restore Test (no production data destroyed)

**NEVER drop+restore a production database during a test.** Instead, decrypt and restore into a temporary database, then drop it.

Test against **one database** (use `website` — most comprehensive, schema covers bugs+bachelorprojekt+coaching):

```bash
STAMP=<latest-timestamp>
NS=<namespace>
CTX=<context>

kubectl apply -n $NS --context $CTX -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: backup-restore-test-$$
  namespace: $NS
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: shared-db
              topologyKey: kubernetes.io/hostname
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: restore-test
          image: pgvector/pgvector:0.8.0-pg16
          imagePullPolicy: IfNotPresent
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -euo pipefail
              sleep 10
              ENC="/backups/$STAMP/website.dump.enc"
              [ -f "\$ENC" ] || { echo "FATAL: \$ENC not found"; exit 1; }
              echo "Decrypting \$ENC..."
              openssl enc -d -aes-256-cbc -pbkdf2 -in "\$ENC" -out /tmp/website_test.dump \
                -pass env:BACKUP_PASSPHRASE
              SIZE=\$(wc -c < /tmp/website_test.dump)
              echo "Decrypted: \${SIZE} bytes"
              [ "\$SIZE" -gt 1000 ] || { echo "FATAL: dump too small (\$SIZE bytes)"; exit 1; }
              head -c 5 /tmp/website_test.dump | grep -q '^PGDMP' || { echo "FATAL: not a valid pg_dump archive"; exit 1; }
              echo "Magic bytes OK"
              PGPASSWORD="\$SHARED_DB_PASSWORD" createdb -h shared-db -U postgres website_restore_test 2>/dev/null || true
              PGPASSWORD="\$SHARED_DB_PASSWORD" pg_restore -h shared-db -U postgres \
                -d website_restore_test --no-owner --exit-on-error /tmp/website_test.dump
              echo "Restore succeeded. Table count:"
              PGPASSWORD="\$SHARED_DB_PASSWORD" psql -h shared-db -U postgres -d website_restore_test \
                -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');"
              PGPASSWORD="\$SHARED_DB_PASSWORD" dropdb -h shared-db -U postgres website_restore_test
              rm /tmp/website_test.dump
              echo "Cleanup done. Restore test PASSED."
          env:
            - name: BACKUP_PASSPHRASE
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: BACKUP_PASSPHRASE
            - name: SHARED_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: SHARED_DB_PASSWORD
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
            runAsUser: 65534
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: backup-storage
              mountPath: /backups
              readOnly: true
          resources:
            requests:
              memory: 256Mi
              cpu: "200m"
            limits:
              memory: 512Mi
              cpu: "1"
      volumes:
        - name: backup-storage
          persistentVolumeClaim:
            claimName: backup-pvc
EOF
```

Wait for the job:
```bash
kubectl wait -n $NS --context $CTX job/backup-restore-test-$$ --for=condition=Complete --timeout=300s
kubectl logs -n $NS --context $CTX -l job-name=backup-restore-test-$$
```

**PASS criteria:** logs show `Restore test PASSED.` and a table count > 0.
**FAIL criteria:** any FATAL line, job fails, or table count = 0.

---

## Phase 5 — Issue Reporting and Fixes

After running all phases, produce a table:

| Check | mentolder | korczewski | Fix applied |
|-------|-----------|------------|-------------|
| CronJob name correct (`db-backup`) | ✓ / ✗ | ✓ / ✗ | yes/no |
| CronJob schedule (`0 2 * * *`) | ✓ / ✗ | ✓ / ✗ | yes/no |
| CronJob not suspended | ✓ / ✗ | ✓ / ✗ | yes/no |
| PVC bound | ✓ / ✗ | ✓ / ✗ | yes/no |
| BACKUP_PASSPHRASE ≥ 32 bytes | ✓ / ✗ | ✓ / ✗ | yes/no |
| backup-config ConfigMap present | ✓ / ✗ | ✓ / ✗ | yes/no |
| Live backup triggered + completed | ✓ / ✗ | ✓ / ✗ | n/a |
| All 5 .enc files present & > 1 KB | ✓ / ✗ | ✓ / ✗ | n/a |
| Restore test PASSED | ✓ / ✗ | ✓ / ✗ | n/a |
| Filen upload configured (optional) | ✓ / ✗ / n/a | ✓ / ✗ / n/a | yes/no |

**Apply all automatable fixes inline** (CronJob name, schedule, suspension). Fixes that require secret rotation flag them clearly and give the exact commands.

---

## Real Restore Runbook (incident reference)

When an actual outage occurs and you need to restore production:

```bash
# 1. List available backups
task workspace:backup:list -- --context mentolder

# 2. Stop affected services (example: nextcloud)
kubectl scale deployment/nextcloud -n workspace --replicas=0 --context mentolder

# 3. Restore (replace <db> and <timestamp>)
task workspace:restore -- nextcloud 20260514-020001 -- --context mentolder -y

# 4. Restart
kubectl scale deployment/nextcloud -n workspace --replicas=1 --context mentolder

# For all databases at once:
task workspace:restore -- all 20260514-020001 -- --context mentolder -y
```

Script: `scripts/backup-restore.sh restore <db> <timestamp> --context <ctx>`
- Decrypts with `BACKUP_PASSPHRASE` from `workspace-secrets`
- Drops DB, recreates, `pg_restore --no-owner --exit-on-error`
- Cleans up temp decrypt file
- Requires `SHARED_DB_PASSWORD` (postgres superuser) in `workspace-secrets`

**Gotcha:** `backup-restore.sh trigger` creates jobs from `cronjob/db-backup`. If the old `backup-postgres` CronJob is the only one present, trigger fails silently. Fix Phase 1.1 first.
