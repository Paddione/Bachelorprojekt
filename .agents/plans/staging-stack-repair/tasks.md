---
title: "staging-stack-repair — Implementation Plan"
ticket_id: T900806
domains: [infra, database, security, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# staging-stack-repair — Implementation Plan

Repariert den degradierten workspace-staging-Stack auf `fleet`: fehlende Secrets (RC1),
Tabellen-Ownership, an der die Schema-Hooks scheitern (RC2), schreibgeschütztes Backup-Volume
(RC3), fehlender `UPDATE`-Grant (RC5) und ein Staging-Verweis auf die Prod-Nextcloud-DB (RC6).
Befunde mit Belegbefehlen und Entscheidungen D1–D5: `design.md`.

_Ticket: T900806_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `environments/.secrets/staging.yaml` | git-crypt | n/a (S1-ungated) |
| `environments/sealed-secrets/staging.yaml` | 255 | n/a (S1-ungated) |
| `k3d/shared-db.yaml` | 342 | n/a (S1-ungated) |
| `scripts/migrations/2026-08-10-llm-proxy-request-log.sql` | 77 | n/a (S1-ungated) |
| `environments/staging.yaml` | 104 | n/a (S1-ungated) |
| `tests/spec/staging-stack-repair.bats` | 48 | n/a (S1-ungated) |

Ist-Zeilen gegen `origin/main` gemessen (`git show origin/main:<pfad> | wc -l`). Keine Datei ist
gebaselined, `.yaml`, `.sql` und `.bats` haben kein S1-Limit (`yq '.s1.limits' docs/code-quality/gates.yaml`).
Keine neuen Manifeste oder Skripte, daher kein S4-Risiko.

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-secrets.md | impl | environments/.secrets/staging.yaml, environments/sealed-secrets/staging.yaml | |
| p2 | tasks.d/p2-shared-db-owner.md | impl | k3d/shared-db.yaml | p1 |
| p3 | tasks.d/p3-llm-proxy-grant.md | impl | scripts/migrations/2026-08-10-llm-proxy-request-log.sql | p1 |
| p4 | tasks.d/p4-nextcloud-host.md | impl | environments/staging.yaml | p1 |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/staging-stack-repair.bats | p1, p2, p3, p4 |

p1 zieht den Branch zuerst auf `origin/main` nach. Deshalb hängen p2 bis p4 von p1 ab.

## Task: Rot-Grün-Anker

Der Test ist mit dem Plan committet und läuft vor p2 bis p4 rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/staging-stack-repair.bats
# expected: FAIL — Tests 1 bis 4 (Owner-Normalisierung, || true, UPDATE-Grant, NEXTCLOUD_DB_HOST)
```

Test 5 (Pflicht-Keys) ist auf diesem Branch schon grün, weil `f970659911` hier liegt. Gegen die
versiegelte Datei von `main` ist er rot (geprüft am 2026-10-07: `fehlt …: FILEN_EMAIL`).

## Task: Live-Reparatur nach dem Merge

Erst ausführen, wenn der PR gemergt ist und `flux-staging`, `flux-sealed-secrets-staging` und
`flux-website-staging` die neue Revision gemeldet haben
(`kubectl --context fleet -n flux-system get kustomizations | grep staging`).

1. **RC1 prüfen:**
   ```bash
   kubectl --context fleet -n workspace-staging get secret workspace-secrets -o json | jq '.data|keys|length'   # erwartet ≥ 97
   kubectl --context fleet -n website-staging get secret website-secrets -o json | jq -r '.data.POCKET_ID_WEBSITE_SECRET|@base64d|length'   # erwartet > 0
   kubectl --context fleet -n website-staging rollout restart deploy/website
   ```
2. **RC2 reparieren:** `shared-db` in Staging neu starten, damit der neue postStart läuft, dann prüfen:
   ```bash
   kubectl --context fleet -n workspace-staging rollout restart deploy/shared-db
   kubectl --context fleet -n workspace-staging rollout status deploy/shared-db --timeout=300s
   P=$(kubectl --context fleet -n workspace-staging get pods -l app=shared-db -o name | head -1)
   kubectl --context fleet -n workspace-staging exec $P -c postgres -- psql -U postgres -d website -At \
     -c "select count(*) from pg_tables where schemaname='public' and tableowner='postgres'" \
     -c "select to_regclass('knowledge.collections') is not null, to_regclass('tickets.tickets') is not null"
   # erwartet: 0, dann t|t (tickets.tickets entsteht beim ersten Request an die Website)
   kubectl --context fleet -n workspace-staging logs $P -c postgres | grep 'shared-db postStart' || echo "keine postStart-Fehler"
   ```
3. **RC5 einspielen:**
   ```bash
   kubectl --context fleet -n workspace-staging exec -i $P -c postgres -- psql -U postgres -d website -v ON_ERROR_STOP=1 \
     < scripts/migrations/2026-08-10-llm-proxy-request-log.sql
   ```
4. **RC3 reparieren:** zuerst den PV-Inhalt prüfen. Ist er nicht leer, abbrechen und den Operator fragen.
   ```bash
   kubectl --context fleet -n workspace-staging run pv-inspect --rm -i --restart=Never --image=busybox:1.37 \
     --overrides='{"spec":{"nodeName":"pk-hetzner-8","volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"containers":[{"name":"c","image":"busybox:1.37","command":["sh","-c","ls -la /b; find /b -mindepth 1 | wc -l"],"volumeMounts":[{"name":"b","mountPath":"/b"}]}]}}'
   # erwartet: 0 Einträge
   kubectl --context fleet -n workspace-staging delete pvc backup-pvc
   kubectl --context fleet delete pv backup-pvc-pkh8
   flux --context fleet reconcile kustomization flux-staging --with-source
   kubectl --context fleet -n workspace-staging get pvc backup-pvc   # erwartet: Bound, storageclass local-path
   ```
5. **Abnahme:** jeden betroffenen CronJob einmal anstoßen, danach die alten Failed-Jobs löschen.
   ```bash
   for cj in sessions-purge db-backup pvc-backup knowledge-ingest-prs knowledge-ingest-bugs knowledge-reindex-all llm-proxy-log-retention billing-dunning-detection admin-actions-cleanup; do
     kubectl --context fleet -n workspace-staging create job --from=cronjob/$cj $cj-t900806
   done
   kubectl --context fleet -n workspace-staging wait --for=condition=complete --timeout=900s \
     $(for cj in sessions-purge db-backup pvc-backup knowledge-ingest-prs knowledge-ingest-bugs knowledge-reindex-all llm-proxy-log-retention billing-dunning-detection admin-actions-cleanup; do echo job/$cj-t900806; done)
   kubectl --context fleet -n workspace-staging create job --from=cronjob/db-restore-verify db-restore-verify-t900806
   kubectl --context fleet -n workspace-staging wait --for=condition=complete job/db-restore-verify-t900806 --timeout=900s
   kubectl --context fleet -n workspace-staging get jobs -o json | jq -r '.items[]|select(.status.failed>0)|.metadata.name' | xargs -r kubectl --context fleet -n workspace-staging delete job
   ```
   `monthly-billing` läuft monatlich und wird nicht manuell angestoßen. Er teilt die Ursache mit
   `billing-dunning-detection`.
6. **24-h-Kontrolle** am Folgetag: `kubectl --context fleet -n workspace-staging get jobs --no-headers | awk '$2=="Failed"'` ist leer.

## Task: Verifikation

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/staging-stack-repair.bats
task env:validate ENV=staging
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
