# Fehlerbehebung

## Allgemeine Diagnose

```bash
# Cluster-Status pruefen
task cluster:status

# Pod-Status im Workspace
task workspace:status

# Logs eines Service ansehen
task workspace:logs -- <service>

# Erreichbarkeit aller Services testen
scripts/check-connectivity.sh --local
```

---

## Haeufige Probleme

### Cluster startet nicht

**Symptom:** `task cluster:create` schlaegt fehl.

**Loesung:**
```bash
# Docker laeuft?
docker info

# Existiert der Cluster bereits?
k3d cluster list

# Falls ja: loeschen und neu erstellen
task cluster:delete
task cluster:create
```

### Pods starten nicht (CrashLoopBackOff)

**Diagnose:**
```bash
# Pod-Status pruefen
kubectl get pods -n workspace

# Events anzeigen
kubectl describe pod <pod-name> -n workspace

# Logs des fehlerhaften Containers
kubectl logs <pod-name> -n workspace --previous
```

**Haeufige Ursachen:**
- **shared-db noch nicht bereit:** Services starten vor der Datenbank. Auf `kubectl rollout status deployment/shared-db -n workspace` warten.
- **Fehlende Secrets:** `kubectl get secret workspace-secrets -n workspace` pruefen.
- **Fehlende ConfigMaps:** `kubectl get configmap -n workspace` pruefen.
- **Unzureichende Ressourcen:** `kubectl top nodes` und `kubectl top pods -n workspace` pruefen.

### Service nicht erreichbar (502 / Connection refused)

**Diagnose:**
```bash
# Ingress-Routing pruefen
kubectl get ingress -n workspace
kubectl describe ingress workspace-ingress -n workspace

# Traefik-Logs
kubectl logs -n kube-system -l app.kubernetes.io/name=traefik --tail=50

# Service-Endpunkte pruefen
kubectl get endpoints -n workspace
```

**Loesung:**
```bash
# Service neu starten
task workspace:restart -- <service>

# Erreichbarkeit pruefen
scripts/check-connectivity.sh --local
```

---

## Keycloak / SSO-Probleme

### Keycloak Login funktioniert nicht

**Symptom:** Redirect-Loop oder 502 beim SSO-Login.

**Diagnose:**
```bash
# Keycloak-Logs pruefen
task workspace:logs -- keycloak

# Realm importiert?
kubectl exec -n workspace deploy/keycloak -- \
  /opt/keycloak/bin/kcadm.sh get realms \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password devadmin

# oauth2-proxy-Logs (Docs SSO)
kubectl logs -n workspace deploy/oauth2-proxy-docs
```

**Haeufige Ursachen:**
- **Realm nicht importiert:** `import-entrypoint.sh`-Logs pruefen. Keycloak neu starten: `task workspace:restart -- keycloak`
- **OIDC-Client nicht konfiguriert:** In Keycloak Admin → Clients pruefen, ob Redirect-URIs korrekt sind

### Nextcloud OIDC Login fehlerhaft

**Diagnose:**
```bash
# OIDC-Config pruefen
kubectl exec -n workspace deploy/nextcloud -- cat /var/www/html/config/oidc.config.php

# Nextcloud-Logs
task workspace:logs -- nextcloud
```

**Loesung:**
```bash
# OIDC-Plugin und Nextcloud-Apps neu konfigurieren
task workspace:post-setup
```

### SSO-Secrets synchronisieren

Falls OIDC-Client-Secrets in Keycloak und Kubernetes-Secrets nicht uebereinstimmen:

```bash
bash scripts/keycloak-sync-secrets.sh
```

---

## Nextcloud

### Nextcloud friert ein oder reagiert langsam

```bash
# Neu starten
task workspace:restart -- nextcloud

# Falls das nicht hilft: Logs auf Datenbankfehler pruefen
task workspace:logs -- nextcloud
```

### occ-Befehl ausfuehren

```bash
kubectl exec -n workspace deploy/nextcloud \
  -c nextcloud -- \
  setpriv --reuid=999 --regid=999 --clear-groups \
  php occ <befehl>
```

### Collabora zeigt leeren Editor

**Symptom:** Dokument oeffnet sich in Nextcloud, aber der Editor ist leer.

**Diagnose:**
```bash
# Collabora-Logs
task workspace:logs -- collabora

# WOPI-Verbindung pruefen
kubectl exec -n workspace deploy/nextcloud -- su -s /bin/bash www-data -c \
  "php occ config:app:get richdocuments wopi_url"
```

**Loesung:**
```bash
# WOPI-URL setzen
kubectl exec -n workspace deploy/nextcloud -- su -s /bin/bash www-data -c \
  "php occ config:app:set richdocuments wopi_url --value=http://collabora:9980"

# Collabora neu starten
task workspace:restart -- collabora
```

---

## Talk HPB / Video

### Video-Call funktioniert nicht

**Diagnose:**
```bash
# Signaling-Server erreichbar?
curl -s http://signaling.localhost/api/v1/welcome

# Janus-Logs
kubectl logs -n workspace deploy/janus

# coturn-Logs
kubectl logs -n workspace deploy/coturn

# NATS-Logs
kubectl logs -n workspace deploy/nats
```

**Haeufige Ursachen:**
- **Janus nicht verbunden:** ConfigMap pruefen (`janus.jcfg`)
- **coturn nicht erreichbar:** Port 3478 muss fuer UDP/TCP offen sein
- **NATS nicht gestartet:** `kubectl get pods -n workspace -l app=nats`

---

## Vaultwarden

### Vaultwarden nicht erreichbar

```bash
# Pod-Status
kubectl get pods -n workspace -l app=vaultwarden

# Logs
task workspace:logs -- vaultwarden

# Datenbank-Verbindung pruefen
task workspace:psql -- vaultwarden
```

### Seed-Job fehlgeschlagen

```bash
# Job-Status
kubectl get jobs -n workspace | grep seed

# Logs des Seed-Jobs
kubectl logs -n workspace job/vaultwarden-seed

# Seed neu ausfuehren
task workspace:vaultwarden:seed
```

---

## PostgreSQL

### Datenbankverbindung fehlgeschlagen

```bash
# shared-db Pod-Status
kubectl get pods -n workspace -l app=shared-db

# psql-Shell oeffnen
task workspace:psql -- website
task workspace:psql -- keycloak
task workspace:psql -- nextcloud

# Port-Forward fuer externe Tools (DBeaver, pgAdmin)
task workspace:port-forward
# Dann: psql -h localhost -p 5432 -U postgres
```

### Datenbank-Tabellen fehlen

```bash
task workspace:psql -- website
\dt   # Alle Tabellen auflisten
```

Falls Website-Tabellen fehlen, Website-Deployment neu anstossen:
```bash
task workspace:restart -- website
```

---

## Website

### Website nicht erreichbar

```bash
task website:status
task website:logs
```

**Loesung:** Image neu bauen und deployen:
```bash
task website:redeploy
```

### Website-Admin-Panel zeigt 403

Keycloak-Rolle `workspace-admins` fuer den Benutzer pruefen:
1. `auth.{DOMAIN}/admin` aufrufen
2. Realm workspace → Benutzer → Rollen/Gruppen pruefen
3. Benutzer der Gruppe `workspace-admins` zuweisen

---

## TLS-Zertifikat wird nicht ausgestellt

**Symptom:** `task cert:status` zeigt `READY: False`, Challenges bleiben `pending`.

**Diagnose:**
```bash
task cert:status
kubectl describe challenge -n workspace
kubectl logs -n cert-manager deploy/cert-manager-lego-webhook --tail=20
```

**Haeufige Ursachen:**

- **API-Key fehlt:** `task cert:secret -- <dein-ipv64-api-key>`

- **DNS-Propagation:** TXT-Record-Propagation kann 1–5 Minuten dauern.
  ```bash
  nslookup -type=TXT _acme-challenge.<domain> 8.8.8.8
  ```

- **Stuck Challenges mit Finalizer:**
  ```bash
  kubectl get challenge -n workspace -o name | while read c; do
    kubectl patch "$c" -n workspace --type=merge -p '{"metadata":{"finalizers":null}}'
  done
  kubectl delete challenge --all -n workspace
  ```

---

## CI/CD-Probleme

### Manifeste sind ungueltig

```bash
task workspace:validate
```

**CI-Checks lokal ausfuehren:**
```bash
# Kustomize Build
kustomize build k3d/ | kubectl apply --dry-run=client -f -

# YAML-Lint
yamllint k3d/

# Shell-Lint
shellcheck scripts/*.sh
```

### ArgoCD synchronisiert nicht

```bash
# Sync-Status pruefen
task argocd:status

# Manuell synchronisieren
task argocd:sync -- workspace-hetzner

# Diff anzeigen
task argocd:diff -- workspace-hetzner
```

---

## Nuetzliche kubectl-Befehle

```bash
# Alle Ressourcen im Namespace
kubectl get all -n workspace

# Events (chronologisch)
kubectl get events -n workspace --sort-by='.lastTimestamp'

# Pod-Ressourcenverbrauch
kubectl top pods -n workspace

# ConfigMap anzeigen
kubectl get configmap domain-config -n workspace -o yaml

# Secret-Keys auflisten (nicht die Werte!)
kubectl get secret workspace-secrets -n workspace -o jsonpath='{.data}' | jq 'keys'

# In einen Pod einsteigen
kubectl exec -it -n workspace deploy/<service> -- sh

# Port-Forward fuer einzelnen Service
kubectl port-forward -n workspace svc/<service> <local-port>:<service-port>
```

---

## Vollstaendiger Reset

```bash
# Nur Workspace entfernen (Cluster bleibt)
task workspace:teardown
task workspace:deploy

# Alles zerstoeren und neu aufsetzen
task cluster:delete
task workspace:up
```
