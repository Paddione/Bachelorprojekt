# Skripte

Referenz aller Skripte und Hilfsbibliotheken.

## scripts/migrate.sh — Migration Assistant

Interaktives Menü für Datenimport und -export.

```bash
./scripts/migrate.sh              # Vollversion
./scripts/migrate.sh --dry-run    # Nur Vorschau
```

### Menüoptionen

| Option | Funktion |
|--------|----------|
| 1 | Slack → Mattermost |
| 2 | Teams → Mattermost + Nextcloud |
| 3 | Benutzer → Keycloak (CSV/LDIF) |
| 4 | Google → Mattermost + Nextcloud |
| 5 | Daten exportieren |

Details: [Migration](migration.md)

## scripts/import-users.sh — Benutzer-Import

Massenimport von Benutzern in Keycloak via Admin REST API.

```bash
# CSV-Import
./scripts/import-users.sh --csv users.csv \
  --url http://auth.localhost \
  --pass devadmin

# LDIF-Import
./scripts/import-users.sh --ldif export.ldif \
  --url http://auth.localhost \
  --pass devadmin

# Vorschau
./scripts/import-users.sh --csv users.csv --dry-run
```

### CSV-Format

```csv
username,email,display_name,groups,first_name,last_name
anna.schmidt,anna@example.com,Anna Schmidt,"homeoffice_users;admins",Anna,Schmidt
```

Beispiel: `scripts/users-example.csv`

## scripts/import-entrypoint.sh — Realm-Import

Ersetzt Umgebungsvariablen in `realm-homeoffice-dev.json` und startet Keycloak mit automatischem Realm-Import. Wird als ConfigMap im Keycloak-Pod gemountet.

**Ablauf:**
1. `envsubst` ersetzt `${VARIABLE}` Platzhalter in der Realm-JSON
2. Aufbereitete JSON wird als Import-Datei bereitgestellt
3. Keycloak startet mit `--import-realm`

## scripts/check-connectivity.sh — Erreichbarkeitstest

Prüft Erreichbarkeit aller Dienste.

```bash
./scripts/check-connectivity.sh          # Alle Dienste prüfen
./scripts/check-connectivity.sh --local  # Nur lokale Ports prüfen
```

## tests/runner.sh — Test-Runner

Orchestriert alle automatisierten Tests und erzeugt Ergebnis-Reports.

```bash
./tests/runner.sh local                  # Alle Tests gegen k3d-Cluster
./tests/runner.sh local FA-01 SA-03      # Nur bestimmte Tests ausführen
./tests/runner.sh local --verbose        # Verbose-Ausgabe
./tests/runner.sh report                 # Markdown-Reports aus vorhandenen JSON neu generieren
```

### Parameter

| Parameter | Beschreibung | Pflicht |
|-----------|-------------|---------|
| `local` | Tests gegen lokalen k3d-Cluster | Ja (oder `report`) |
| `report` | Reports aus vorhandenen Ergebnissen generieren | Ja (oder `local`) |
| `--verbose` | Detaillierte Ausgabe aller Assertions | Nein |
| `<REQ-ID>` | Nur bestimmte Tests ausführen (z.B. `FA-01 SA-03`) | Nein |

Details: [Tests](tests.md)

---

## Kubernetes (k3d) — Allgemeine Befehle

Häufig verwendete Befehle zur Verwaltung des Stacks. Alternativ via `task` (siehe Taskfile.yml).

```bash
# Stack deployen
task homeoffice:deploy

# Pod-Status prüfen
kubectl get pods -n homeoffice

# Logs eines Services anzeigen
kubectl logs -n homeoffice deploy/<service-name> -f --tail=50

# Alle Pods beobachten
kubectl get pods -n homeoffice -w

# Einzelnen Service neustarten
kubectl rollout restart deployment/<service-name> -n homeoffice

# Manifeste validieren
kubectl kustomize k3d/ | kubectl apply --dry-run=client -f -

# Shell in einem Pod öffnen
kubectl exec -it -n homeoffice deploy/<service-name> -- sh

# Alles entfernen (ALLE DATEN WEG!)
kubectl delete namespace homeoffice
```

---

## Datenbank-Backup

PostgreSQL-Datenbanken liegen in PersistentVolumeClaims. Manueller Export:

```bash
# Einzelne Datenbank sichern
kubectl exec -n homeoffice deploy/<service>-db -- pg_dump -U <service> <service> > <service>-backup.sql

# Alle Datenbanken sichern
for svc in keycloak mattermost nextcloud; do
  kubectl exec -n homeoffice deploy/${svc}-db -- pg_dump -U ${svc} ${svc} > ${svc}-backup.sql
done
```

---

## Diagnose

Nützliche Befehle zur Fehlersuche.

```bash
# Alle Pods mit Status
kubectl get pods -n homeoffice -o wide

# Events anzeigen (letzte Fehler)
kubectl get events -n homeoffice --sort-by='.lastTimestamp' | tail -20

# Pod-Details (Restart-Gründe, Mount-Fehler)
kubectl describe pod -n homeoffice <pod-name>

# Keycloak zurücksetzen (Realm-Neuimport erzwingen)
kubectl delete pvc keycloak-db-data -n homeoffice
kubectl rollout restart deployment/keycloak-db deployment/keycloak -n homeoffice

# Env-Variablen eines Pods prüfen
kubectl exec -n homeoffice deploy/<service> -- env | sort
```

---

## Passwörter generieren

```bash
# Einzelnes Passwort
openssl rand -base64 32

# Dev-Secrets liegen in k3d/secrets.yaml — nur für lokale Entwicklung.
```

---

## Hilfsbibliotheken (scripts/lib/)

Diese Dateien werden von `migrate.sh` geladen und nicht direkt aufgerufen.

| Datei | Funktion |
|-------|----------|
| `scan.sh` | OS-spezifische Erkennung von Slack/Teams/Google-Exports und lokalen Caches |
| `slack-import.sh` | Konvertiert Slack-Export-ZIP oder lokalen Cache in Mattermost-JSONL |
| `teams-import.sh` | Parst Teams-GDPR-Export (Chats, Dateien, Kalender, Kontakte) |
| `google-import.sh` | Parst Google-Takeout-Export (Chat, Drive, Kalender, Kontakte) |
| `nextcloud-api.sh` | WebDAV-, CalDAV- und CardDAV-Helfer für Nextcloud-Uploads |
| `export.sh` | Selektiver Export aus allen Services in ein ZIP-Archiv |
