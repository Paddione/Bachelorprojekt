# p4 — NEXTCLOUD_DB_HOST in Staging auf den Staging-Namespace

Target files: `environments/staging.yaml`. Design: `design.md` RC6, D5. Keine anderen Dateien ändern.

### Task 1: Host ändern

Ist:

```yaml
  NEXTCLOUD_DB_HOST: nextcloud-db.workspace.svc.cluster.local
```

Soll:

```yaml
  NEXTCLOUD_DB_HOST: nextcloud-db.workspace-staging.svc.cluster.local
```

Der Service existiert (`kubectl --context fleet -n workspace-staging get svc nextcloud-db`).

### Prüfung

```bash
task env:validate ENV=staging
tests/unit/lib/bats-core/bin/bats -f 'NEXTCLOUD_DB_HOST' tests/spec/staging-stack-repair.bats   # ok
```
