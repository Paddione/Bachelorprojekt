# PostgreSQL — Gemeinsame Datenbank (shared-db)

## Übersicht

```mermaid
flowchart TB
  PG[(PostgreSQL 16 · shared-db)]
  PG --> KCDB[(keycloak)]
  PG --> NCDB[(nextcloud)]
  PG --> VWDB[(vaultwarden)]
  PG --> WEBDB[(website)]
  PG --> DSDB[(docuseal)]
  PG --> TRDB[(tracking)]
  PG --> BRDB[(brett)]
  PG -.->|Backup| Cron[db-backup CronJob]
  Cron --> PVC[backup-pvc]
```

`shared-db` ist eine einzelne **PostgreSQL 16** Instanz für alle Services im `workspace`-Namespace. 
Jeder Service hat eine **separate Datenbank** und **separate Credentials** für Isolation.

- **Cluster-intern:** Nur über Kubernetes Service erreichbar, kein Ingress
- **TLS:** Opportunistisches TLS mit selbstsigniertem Zertifikat (rein intern)
- **Backup:** Automatische tägliche Dumps via CronJob (`backup-cronjob.yaml`)
- **Daten-Lebenszyklus:** Idempotente Initialisierung beim Pod-Start

---

## Datenbanken pro Service

| Datenbank | Service | User | Zweck |
|-----------|---------|------|-------|
| `keycloak` | Keycloak | `keycloak` | IAM/OIDC — User, Realm-Config, Sessions |
| `nextcloud` | Nextcloud | `nextcloud` | Dateiverwaltung, Contacts, Calendar, Talk-Metadaten |
| `vaultwarden` | Vaultwarden | `vaultwarden` | Password-Vault — Cipher, Attachments |
| `website` | Website (Astro) | `website` | Meetings, Transcripts, Inbox, Chat, Projekte, Kunden |
| `pentest` | Penetration Testing | `pentest` | Testziele (Credentials, Flags) |

---

## Architektur

### PostgreSQL Deployment

```yaml
# k3d/shared-db.yaml
Deployment:
  name: shared-db
  containers:
    - image: pgvector/pgvector:0.8.0-pg16
      ports: 5432
      volumeMounts:
        - name: shared-db-pvc
          mountPath: /var/lib/postgresql/data
        - name: tls-cert
          mountPath: /etc/ssl/certs/postgres
      env:
        - POSTGRES_PASSWORD: (aus workspace-secrets)
  initContainers:
    - generate-tls-cert: erstellt selbstsigniertes Zertifikat
    - init-databases: erzeugt Datenbanken und User (idempotent)
```

### Initialisierung

Beim Pod-Start führt der `init-databases` Init-Container folgende Schritte aus (idempotent):

1. **User erstellen** (falls nicht vorhanden)
   ```sql
   DO $$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') 
       THEN CREATE USER keycloak; 
     END IF;
   END $$;
   ```

2. **Passwörter synchronisieren** (aus `workspace-secrets`)
   ```sql
   ALTER USER keycloak WITH PASSWORD '...';
   ALTER USER nextcloud WITH PASSWORD '...';
   -- etc.
   ```

3. **Datenbanken erstellen** (falls nicht vorhanden)
   ```sql
   CREATE DATABASE keycloak OWNER keycloak;
   GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
   -- etc.
   ```

4. **Pentest-Daten seeden** (nur für `pentest`-DB)
   ```sql
   CREATE TABLE confidential_projects (
     id SERIAL PRIMARY KEY,
     project_name TEXT,
     secret_key TEXT
   );
   INSERT INTO confidential_projects VALUES 
     (1, 'PROJECT_NEBULA', 'FLAG{SHARED_DB_DATA_EXFILTRATION_SUCCESS}');
   ```

---

## Verbindung

### Entwicklung (k3d)

#### Direkt im Cluster (von Pod)

Keine besondere Konfiguration nötig — jeder Service in `workspace` sieht `shared-db` automatisch:

```bash
# Beispiel: Website-Pod zum Abfragen
kubectl exec -it deployment/website -c website -n workspace -- \
  PGPASSWORD=<website-password> psql -h shared-db -U website -d website
```

#### Lokal auf Host-Machine (localhost:5432)

```bash
# Port-Forward aktivieren
task workspace:port-forward
# oder manuell:
kubectl port-forward -n workspace svc/shared-db 5432:5432 &

# Dann verbinden (z.B. mit psql, DBeaver, IDE)
psql postgresql://website:<password>@localhost:5432/website
```

#### Schnelle Shell-Befehle

```bash
# Keycloak-Datenbank
task workspace:psql -- keycloak

# Nextcloud-Datenbank
task workspace:psql -- nextcloud

# Website-Datenbank (Standard)
task workspace:psql
```

### Production (Sealed Secrets)

Credentials liegen in **Sealed Secrets** (`prod/sealed-secrets/`):
- KEYCLOAK_DB_PASSWORD
- NEXTCLOUD_DB_PASSWORD
- VAULTWARDEN_DB_PASSWORD
- WEBSITE_DB_PASSWORD

Diese werden beim Deploy dekryptiert und in `workspace-secrets` eingetragen.

---

## Verbindungsstrings

### Cluster-intern (Standard)

```
postgresql://[user]:[password]@shared-db:5432/[database]
postgresql://keycloak:pwd@shared-db:5432/keycloak
postgresql://nextcloud:pwd@shared-db:5432/nextcloud
postgresql://website:pwd@shared-db:5432/website
```

### Lokal mit Port-Forward

```
postgresql://[user]:[password]@localhost:5432/[database]
postgresql://website:pwd@localhost:5432/website
```

---

## TLS & Sicherheit

### Opportunistisches TLS

PostgreSQL erzeugt beim Pod-Start ein **selbstsigniertes Zertifikat**:

```yaml
initContainers:
  - name: generate-tls-cert
    command: [bash, -c]
    args:
      - |
        openssl req -new -x509 -days 365 -nodes \
          -out /etc/ssl/certs/server.crt \
          -keyout /etc/ssl/certs/server.key \
          -subj "/CN=shared-db"
```

**Client-Seite:** Standard libpq-Behavior (`sslmode=prefer`)
- TLS wird verhandelt, aber nicht erzwungen
- Selbstsigniertes Cert wird akzeptiert
- Im Fehlerfall: Fallback zu unverschlüsselter Verbindung

### Network Policies

PostgreSQL ist durch **Kubernetes NetworkPolicies** geschützt:

```yaml
# k3d/network-policy.yaml (Standard: Default-Deny-Ingress)
# Nur Pods mit Label app=website, app=keycloak, etc. dürfen zu shared-db verbinden
```

---

## Backup & Recovery

### Automatische Backups

CronJob läuft **täglich um 02:00 UTC** (Requirement **SA-07**):

```bash
# k3d/backup-cronjob.yaml
schedule: "0 2 * * *"   # 02:00 UTC täglich
```

**Was wird gebackupt:**
- Alle Service-Datenbanken (keycloak, nextcloud, vaultwarden, website)
- Format: `pg_dump -Fc` (Custom Backup Format, schneller & komprimierter)
- Verschlüsselung: AES-256-CBC mit Salt (via openssl)
- Storage: `backup-pvc` (PersistentVolume, 50 GB Standard)
- Retention: 30 Tage (ältere Backups werden gelöscht)

**Struktur:**
```
/backups/
  20260420-020000/
    keycloak.dump.enc
    nextcloud.dump.enc
    vaultwarden.dump.enc
    website.dump.enc
  20260419-020000/
    ...
```

### Backup manuell auslösen

```bash
# CronJob sofort ausführen
kubectl create job --from=cronjob/db-backup db-backup-manual -n workspace

# Logs überprüfen
kubectl logs -n workspace job/db-backup-manual backup
```

### Wiederherstellen aus Backup

```bash
# 1. Backup-Datei dekryptieren
openssl enc -d -aes-256-cbc -in keycloak.dump.enc -out keycloak.dump -pass file:passphrase.txt

# 2. In PostgreSQL einspielen
pg_restore -Fc -d keycloak -h shared-db -U keycloak < keycloak.dump

# oder: Full-Database-Reset
dropdb -h shared-db -U keycloak keycloak
createdb -h shared-db -U keycloak keycloak
pg_restore -Fc -d keycloak -h shared-db -U keycloak < keycloak.dump
```

---

## Betrieb & Monitoring

### Pod-Status

```bash
kubectl get pods -n workspace | grep shared-db
kubectl describe pod -n workspace deployment/shared-db
```

### Logs

```bash
kubectl logs -n workspace deployment/shared-db
# Mit Fehlerfilter
kubectl logs -n workspace deployment/shared-db | grep -i "error"
```

### Neustart

**Warnung:** Alle Verbindungen werden unterbrochen!

```bash
kubectl rollout restart deployment/shared-db -n workspace
```

Betroffene Services starten automatisch neu (über Deployment-Abhängigkeiten).

### Datenbankgröße

```bash
# Im Pod
kubectl exec -it deployment/shared-db -n workspace -- \
  PGPASSWORD=postgres psql -U postgres -d postgres -c \
  "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database ORDER BY pg_database_size(datname) DESC;"
```

### Verbindungen überprüfen

```bash
kubectl exec -it deployment/shared-db -n workspace -- \
  PGPASSWORD=postgres psql -U postgres -d postgres -c \
  "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"
```

### Performance-Monitoring

```bash
# Langsame Queries (pg_stat_statements muss aktiviert sein)
SELECT query, calls, mean_exec_time FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;

# Aktive Queries
SELECT datname, usename, query FROM pg_stat_activity WHERE state = 'active';

# Index-Nutzung
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes ORDER BY idx_scan DESC;
```

---

## Fehlerbehebung

### Verbindung schlägt fehl

```
psql: error: could not translate host name "shared-db" to address
```

**Behebung:**
- Befindet sich Pod im gleichen Namespace (`workspace`)?
- Service existiert? `kubectl get svc -n workspace | grep shared-db`
- DNS funktioniert im Pod? `kubectl exec -it <pod> -n workspace -- nslookup shared-db`

### Authentifizierung schlägt fehl

```
psql: error: FATAL: Passwort für Benutzer "website" falsch
```

**Behebung:**
- Credentials in `workspace-secrets` stimmen? 
  ```bash
  kubectl get secret -n workspace workspace-secrets -o yaml | grep WEBSITE_DB_PASSWORD
  ```
- Init-Container hat Passwörter synchronisiert?
  ```bash
  kubectl logs -n workspace deployment/shared-db init-databases
  ```

### Datenbank existiert nicht

```
psql: error: FATAL: Datenbank "website" existiert nicht
```

**Behebung:**
- Init-Container-Logs: `kubectl logs -n workspace deployment/shared-db -c init-databases`
- Manuell erstellen:
  ```bash
  kubectl exec -it deployment/shared-db -n workspace -- \
    PGPASSWORD=postgres psql -U postgres -c "CREATE DATABASE website OWNER website;"
  ```

### PVC voll (Disk full)

```
ERROR: could not write block 12345 of relation base/16384/12345: No space left on device
```

**Behebung:**
```bash
# PVC-Größe prüfen
kubectl get pvc -n workspace shared-db-pvc

# Größe erhöhen (muss StorageClass `local-path` sein)
kubectl patch pvc shared-db-pvc -n workspace -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'

# Oder: Pod neu starten (tigert Bereinigung)
kubectl rollout restart deployment/shared-db -n workspace

# Oder: Alte Backups löschen
kubectl exec -it deployment/shared-db -n workspace -- rm -rf /backups/20260101-*
```

### Langsame Queries

**Behebung:**
```bash
# Slow Query Log aktivieren
SHOW log_min_duration_statement;
ALTER DATABASE website SET log_min_duration_statement = 1000;  -- 1s

# Indexes prüfen
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;  -- Ungenutzte Indexes

# EXPLAIN ANALYZE Queries ausführen
EXPLAIN ANALYZE SELECT * FROM transcripts WHERE meeting_id = '...';
```

---

## Migration von Datenbanken

Falls Sie Datenbanken (z.B. von Entwicklung zu Produktion) migrieren:

```bash
# 1. Dump auf Entwicklung
pg_dump -Fc -h localhost -U website -d website > website-backup.dump

# 2. Zu Produktion kopieren (z.B. über Git/Secrets)
# WARNUNG: Niemals Backups in Git committen!
# Verwende stattdessen: S3, Sealed Secrets, oder externe Backup-Lösung

# 3. Auf Produktion einspielen
kubectl port-forward -n workspace svc/shared-db 5432:5432 &
pg_restore -Fc -d website -h localhost -U website < website-backup.dump
```

---

## Weitere Ressourcen

- **Datenbank-Schemas:** [Datenbankmodelle](database.md)
- **Backup-Details:** [backup-cronjob.yaml](../k3d/backup-cronjob.yaml)
- **Init-Skript:** [shared-db.yaml](../k3d/shared-db.yaml) (ConfigMap `shared-db-init`)
- **Sicherheit:** [Security](security.md)
- **PostgreSQL Dokumentation:** https://www.postgresql.org/docs/16/
