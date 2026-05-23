<div class="page-hero">
  <span class="page-hero-icon">💾</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Daten · Wiederherstellung</div>
    <div class="page-hero-title">Backup & Wiederherstellung</div>
    <p class="page-hero-desc">Tägliche verschlüsselte DB-Snapshots, Restore-Workflow und Backup-Monitoring.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">SA-07</span>
      <span class="page-hero-tag">AES-256</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Backup & Wiederherstellung

## Überblick

Automatische Datenbank-Backups laufen täglich als Kubernetes CronJob (`k3d/backup-cronjob.yaml`):

- **Zeitplan:** Täglich um 02:00 UTC
- **Gesicherte Datenbanken:** `keycloak`, `nextcloud`, `vaultwarden`, `website`, `docuseal`
- **Verschlüsselung:** AES-256-CBC mit PBKDF2 (Passphrase aus `workspace-secrets`)
- **Aufbewahrung:** 30 Tage (automatische Bereinigung)
- **Speicherort:** PVC `backup-pvc` (1 Gi, ReadWriteOnce) im Namespace `workspace`
- **Sicherheitsanforderung:** SA-07 (tägliche Backups mit Verschlüsselung)

<div class="callout callout-warn">
<strong>Datei-PVCs werden NICHT gesichert.</strong> Nextcloud-Dateien, Vaultwarden-Anhänge und DocuSeal-Dokumente liegen im Dateisystem — nur die Datenbankdaten sind im Backup enthalten.
</div>

```mermaid
sequenceDiagram
  participant Cron as Backup CronJob
  participant DB as shared-db
  participant PVC as Backup PVC
  participant Off as Off-Site
  Note over Cron: Täglich 02:30
  Cron->>DB: pg_dump --all
  DB-->>Cron: SQL-Stream
  Cron->>PVC: gzip + verschlüsseln
  PVC-->>Cron: Snapshot abgelegt
  Cron->>Off: rsync (nur Diff)
  Off-->>Cron: OK
  Cron->>Cron: alte Snapshots > 30 Tage löschen
```

---

## Was wird gesichert

| Datenbank    | Inhalt                                              |
|--------------|-----------------------------------------------------|
| `keycloak`   | SSO-Konfiguration, Benutzer, Realms, Clients        |
| `nextcloud`  | Datei-Index, Kalender, Kontakte, Metadaten          |
| `vaultwarden`| Passwort-Vault-Struktur (nicht: Datei-Anhänge)      |
| `website`    | Website-Anwendungsdatenbank                         |
| `docuseal`   | Signaturprozesse, Vorlagen (nicht: Dokumentendateien)|

---

## Backup-Status prüfen

```bash
# Verfügbare Backup-Zeitstempel anzeigen
task workspace:backup:list

# Oder mit Prod-Context
task workspace:backup:list -- --context mentolder

# CronJob- und Job-Status
kubectl get cronjobs -n workspace
kubectl get jobs -n workspace | grep db-backup
kubectl logs -n workspace -l app=db-backup --tail=50
```

---

## Manuelles Backup auslösen

```bash
# Sofort-Backup starten (außerhalb des Zeitplans)
task workspace:backup

# Prod-Cluster
task workspace:backup -- --context mentolder
task workspace:backup -- --context korczewski
```

Das Skript erstellt einen Job aus dem CronJob-Template und folgt den Logs.

---

## Wiederherstellung

> **Achtung:** Die Wiederherstellung **löscht** die Datenbank und stellt sie neu auf.
> Alle aktuellen Daten gehen verloren. Services vorher stoppen, um inkonsistente
> Schreibvorgänge zu vermeiden.

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-brass">1</div>
    <span class="phase-title">Verfügbare Backups auflisten</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

```bash
task workspace:backup:list
# Ausgabe: Zeitstempel, z.B. 20260427-020001
```

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-sage">2</div>
    <span class="phase-title">Service stoppen (empfohlen)</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

```bash
kubectl scale deployment/<service> -n workspace --replicas=0
# z.B. für nextcloud:
kubectl scale deployment/nextcloud -n workspace --replicas=0
```

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-blue">3</div>
    <span class="phase-title">Datenbank wiederherstellen</span>
    <span class="phase-desc">~2 min</span>
  </div>
  <div class="phase-body">

```bash
# Einzelne Datenbank
task workspace:restore -- nextcloud 20260427-020001

# Alle Datenbanken auf einmal
task workspace:restore -- all 20260427-020001

# Prod-Cluster (mit Context + ohne Bestätigungsprompt)
task workspace:restore -- nextcloud 20260427-020001 --context mentolder -y
```

Das Restore-Skript (`scripts/backup-restore.sh restore`) führt folgende Schritte durch:

1. Entschlüsselt die `.dump.enc`-Datei mit dem `BACKUP_PASSPHRASE`-Secret
2. Trennt aktive Verbindungen zur Zieldatenbank
3. Löscht die bestehende Datenbank (`dropdb`)
4. Erstellt eine neue leere Datenbank (`createdb`)
5. Spielt das Dump ein (`pg_restore --no-owner --exit-on-error`)
6. Löscht die temporäre entschlüsselte Dump-Datei

  </div>
</div>

<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-brass">4</div>
    <span class="phase-title">Service neu starten</span>
    <span class="phase-desc">~1 min</span>
  </div>
  <div class="phase-body">

```bash
task workspace:restart -- nextcloud
# oder: kubectl scale deployment/nextcloud -n workspace --replicas=1
```

  </div>
</div>

---

## Direktzugriff auf Backup-PVC

Für manuelle Inspektion der gespeicherten Backups:

```bash
kubectl run --rm -it backup-check --image=busybox \
  --overrides='{"spec":{"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}],"containers":[{"name":"c","image":"busybox","command":["ls","-lRh","/backups"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}' \
  --restart=Never -n workspace
```

---

## Nextcloud-Dateien sichern (manuell)

Nextcloud-Benutzerdaten liegen auf `nextcloud-data-pvc` und werden **nicht** automatisch gesichert.
Für eine vollständige Sicherung:

```bash
# Nextcloud in Wartungsmodus
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ maintenance:mode --on"

# Datei-Backup per kubectl cp
kubectl cp workspace/$(kubectl get pod -n workspace -l app=nextcloud -o name | head -1 | cut -d/ -f2):/var/www/html/data ./nextcloud-data-backup-$(date +%Y%m%d)/

# Wartungsmodus beenden
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ maintenance:mode --off"
```

---

## Aufbewahrungsstrategie

| Kategorie                          | Aufbewahrung                    |
|------------------------------------|----------------------------------|
| Automatische DB-Backups            | 30 Tage (automatische Bereinigung) |
| Job-Historieneinträge (erfolgreich) | 3 Jobs                          |
| Job-Historieneinträge (fehlgeschlagen) | 3 Jobs                       |
| Nextcloud-Dateien                  | Manuell (kein Automatik-Backup) |

---

## Backup-Passphrase verwalten

- **Dev:** Platzhalter in `k3d/secrets.yaml` (`BACKUP_PASSPHRASE: "devbackuppassphrase1234567890abcd"`)
- **Prod:** Versiegelt in `environments/sealed-secrets/<env>.yaml`, angewendet vor dem Deploy
- **Rotation:** `task env:generate ENV=<env>` → `task env:seal ENV=<env>` → Deploy

Die Passphrase wird ausschließlich aus `workspace-secrets` gelesen — nie im Klartext in Logs oder Manifesten.
