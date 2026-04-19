# Backup & Wiederherstellung

## Uberblick

Automatische Datenbank-Backups werden uber einen Kubernetes CronJob ausgefuhrt (`k3d/backup-cronjob.yaml`):

- **Zeitplan:** Taglich um 02:00 UTC
- **Gesicherte Datenbanken:** `keycloak` und `nextcloud` (separate PostgreSQL-Instanzen per pg_dump)
- **Verschlusselung:** AES-256-CBC mit eigenem Passphrase-Secret
- **Aufbewahrung:** 30 Tage (altere Backups werden automatisch geloscht)
- **Speicherort:** PersistentVolumeClaim `backup-pvc` (1 Gi, ReadWriteOnce)
- **Sicherheitsanforderung:** SA-07 (tagliche Backups mit Verschlusselung)

---

## Backup-Konfiguration

**`k3d/backup-cronjob.yaml`** -- CronJob-Manifest:

- Zeitplan: `0 2 * * *` (02:00 UTC taglich)
- Image: `postgres:16.13-alpine`
- Pro Datenbank wird `pg_dump -Fc` (custom format, komprimiert) ausgefuhrt
- Nach dem Dump werden alle `.dump`-Dateien mit `openssl enc -aes-256-cbc -pbkdf2` verschlusselt
- Unverschlusselte `.dump`-Dateien werden unmittelbar nach der Verschlusselung geloscht
- Backups alter als 30 Tage werden automatisch bereinigt (`find /backups -mtime +30 -exec rm -rf`)
- Erfolgreiche/fehlgeschlagene Jobs: jeweils 3 Historieneintr age

**`k3d/backup-pvc.yaml`** -- PersistentVolumeClaim:

- Name: `backup-pvc`
- Kapazitat: 1 Gi
- AccessMode: `ReadWriteOnce`

**`k3d/backup-secrets.yaml`** -- Secret mit Passphrase:

- Secret-Name: `backup-passphrase`
- Key: `backup-passphrase` -- Passphrase fur die AES-256-Verschlusselung
- Wird als Datei unter `/secrets/backup-passphrase` im Container eingebunden
- Optional: Ohne dieses Secret werden Backups unverschlusselt gespeichert

---

## Was wird gesichert

| Datenbank | Host im Cluster | Benutzer | Inhalt |
|-----------|----------------|---------|--------|
| `keycloak` | `keycloak-db` | `keycloak` | SSO-Konfiguration, Benutzer, Realms, Clients |
| `nextcloud` | `nextcloud-db` | `nextcloud` | Nextcloud-Metadaten, Dateiindex, Kalender, Kontakte |

**Nicht gesichert:**

- **Nextcloud-Dateien** (PVC `nextcloud-data`) -- nur Datenbankmetadaten werden gesichert
- **Vaultwarden-Daten** -- separates Backup erforderlich
- **Website-Datenbank** -- separates Backup erforderlich

---

## Manuelles Backup

Um ein sofortiges Backup ausserhalb des Zeitplans auszufuhren:

```bash
# Keycloak-Datenbank manuell sichern
kubectl exec -n workspace deploy/keycloak-db -- \
  pg_dump -Fc -U keycloak -d keycloak | gzip > keycloak-backup-$(date +%Y%m%d).gz

# Nextcloud-Datenbank manuell sichern
kubectl exec -n workspace deploy/nextcloud-db -- \
  pg_dump -Fc -U nextcloud -d nextcloud | gzip > nextcloud-backup-$(date +%Y%m%d).gz
```

Oder uber die psql-Shell:

```bash
task workspace:psql -- keycloak   # Keycloak-DB-Shell
task workspace:psql -- nextcloud  # Nextcloud-DB-Shell
```

---

## Wiederherstellung

> **Achtung:** Eine Wiederherstellung uberschreibt alle vorhandenen Daten. Services vorher stoppen, um Datenkonsistenz zu gewahrleisten.

**Schritt 1: Backup-Datei identifizieren und entschlusseln**

```bash
# Verfugbare Backups auflisten
kubectl exec -n workspace <backup-pod> -- ls -lh /backups/

# Verschlusseltes Backup entschlusseln (lokale Kopie)
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in keycloak.dump.enc -out keycloak.dump \
  -pass pass:<PASSPHRASE>
```

**Schritt 2: Backup-Datei in Pod kopieren**

```bash
kubectl cp keycloak.dump workspace/<keycloak-db-pod>:/tmp/keycloak.dump
```

**Schritt 3: Datenbank wiederherstellen**

```bash
# Bestehende Datenbank leeren und neu erstellen
kubectl exec -n workspace deploy/keycloak-db -- \
  bash -c "dropdb -U keycloak keycloak && createdb -U keycloak keycloak"

# Backup einspielen (pg_restore fur custom format)
kubectl exec -n workspace deploy/keycloak-db -- \
  pg_restore -U keycloak -d keycloak /tmp/keycloak.dump
```

**Schritt 4: Abhangige Services neu starten**

```bash
task workspace:restart -- keycloak
task workspace:restart -- nextcloud
```

---

## Backup-Status pruefen

```bash
# CronJob-Ausfuhrungen anzeigen
kubectl get cronjobs -n workspace
kubectl get jobs -n workspace | grep db-backup

# Logs des letzten Backup-Jobs
kubectl logs -n workspace -l app=db-backup --tail=50

# Gespeicherte Backups auflisten (uber einen temporaren Pod)
kubectl run --rm -it backup-check --image=busybox \
  --overrides='{"spec":{"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"containers":[{"name":"c","image":"busybox","command":["ls","-lRh","/backups"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}' \
  --restart=Never -n workspace
```

---

## Nextcloud-Dateien sichern

Die Nextcloud-Dateidaten liegen auf einem separaten PVC (`nextcloud-data`) und werden vom automatischen Backup **nicht** erfasst. Fur eine vollstandige Sicherung:

**Option 1: kubectl cp (fur kleinere Datenmengen)**

```bash
kubectl cp workspace/<nextcloud-pod>:/var/www/html/data /lokal/nextcloud-backup/
```

**Option 2: Nextcloud-Wartungsmodus + Volume-Backup**

```bash
# Nextcloud in Wartungsmodus versetzen
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ maintenance:mode --on"

# Volume-Snapshot oder PVC-Backup mit eigenem Tool (z.B. Velero)

# Wartungsmodus beenden
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ maintenance:mode --off"
```

**Option 3: Nextcloud Admin-Oberflache**

Nextcloud -> Einstellungen -> Administration -> Grundeinstellungen -> Backup-App (falls installiert).

---

## Aufbewahrungsstrategie

| Kategorie | Aufbewahrung |
|-----------|-------------|
| Automatische Datenbank-Backups | 30 Tage (automatische Bereinigung) |
| Job-Historieneintrage (erfolgreich) | 3 Jobs |
| Job-Historieneintrage (fehlgeschlagen) | 3 Jobs |
| Nextcloud-Dateien | Manuell (kein automatisches Backup) |

Fur langerfristige Aufbewahrung empfiehlt sich ein externer Backup-Dienst (z.B. S3-kompatibel, Backblaze B2) mit regelmasiger Kopie der `/backups/`-Verzeichnisse.
