# Backup & Restore

## Uebersicht

Der CronJob `db-backup` sichert taeglich um 02:00 UTC die PostgreSQL-Datenbanken
(keycloak, mattermost, nextcloud). Dumps werden mit AES-256-CBC verschluesselt
und 30 Tage aufbewahrt.

## Backups auflisten

```bash
# Temporaeren Pod starten und Backup-Verzeichnisse anzeigen
kubectl run backup-ls --rm -it --restart=Never \
  --image=alpine \
  --overrides='{
    "spec": {
      "containers": [{
        "name": "ls",
        "image": "alpine",
        "command": ["ls", "-lt", "/backups"],
        "volumeMounts": [{"name": "b", "mountPath": "/backups"}]
      }],
      "volumes": [{
        "name": "b",
        "persistentVolumeClaim": {"claimName": "backup-pvc"}
      }]
    }
  }' \
  -n homeoffice
```

## Backup entschluesseln

```bash
# Einzelnen Dump entschluesseln
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in keycloak.dump.enc \
  -out keycloak.dump \
  -pass file:/pfad/zur/passphrase
```

Die Passphrase liegt im Secret `backup-passphrase` (Key: `backup-passphrase`).
Im Dev-Cluster:

```bash
kubectl get secret backup-passphrase -n homeoffice \
  -o jsonpath='{.data.backup-passphrase}' | base64 -d
```

## Datenbank wiederherstellen

```bash
# 1. Dump entschluesseln (siehe oben)

# 2. In den DB-Pod kopieren
kubectl cp keycloak.dump homeoffice/<keycloak-db-pod>:/tmp/keycloak.dump

# 3. Datenbank droppen und neu erstellen
kubectl exec -it deploy/keycloak-db -n homeoffice -- \
  psql -U keycloak -d postgres \
  -c "DROP DATABASE keycloak; CREATE DATABASE keycloak OWNER keycloak;"

# 4. Restore ausfuehren
kubectl exec -it deploy/keycloak-db -n homeoffice -- \
  pg_restore -U keycloak -d keycloak /tmp/keycloak.dump

# 5. Service neustarten
kubectl rollout restart deployment/keycloak -n homeoffice
```

Fuer `mattermost` oder `nextcloud` analog vorgehen (Datenbank-, User- und
Deployment-Name anpassen, z.B. `mattermost-db`, `nextcloud-db`).

## Manuelles Backup ausloesen

```bash
kubectl create job --from=cronjob/db-backup manual-backup-$(date +%Y%m%d) \
  -n homeoffice
```

## Konfiguration

| Parameter | Wert | Aenderbar in |
|-----------|------|-------------|
| Zeitplan | `0 2 * * *` (02:00 UTC) | `backup-cronjob.yaml` `.spec.schedule` |
| Ziel-Datenbanken | keycloak, mattermost, nextcloud | `backup-cronjob.yaml` Schleife im Script |
| Aufbewahrung | 30 Tage | `backup-cronjob.yaml` `-mtime +30` |
| Speicher (PVC) | 1 Gi (Dev) | `backup-pvc.yaml` |
| Verschluesselung | AES-256-CBC, PBKDF2 | Secret `backup-passphrase` |
