# Fehlerbehebung

## Allgemeine Diagnose

```bash
# Cluster-Status pruefen
task cluster:status

# Pod-Status im Workspace
task workspace:status

# Logs eines Service ansehen
task workspace:logs -- <service>

# Ingress-Controller pruefen
task ingress:status

# Erreichbarkeit aller Services testen
scripts/check-connectivity.sh --local
```

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
- **shared-db noch nicht bereit:** Services starten vor der Datenbank. `workspace:deploy` wartet automatisch, aber bei manuellem Deploy auf `kubectl rollout status deployment/shared-db -n workspace` warten.
- **Fehlende Secrets:** `kubectl get secret workspace-secrets -n workspace` pruefen.
- **Fehlende ConfigMaps:** `kubectl get configmap -n workspace` pruefen.

### Keycloak Login funktioniert nicht

**Symptom:** Redirect-Loop oder 502 beim SSO-Login.

**Diagnose:**
```bash
# Keycloak-Logs pruefen
task workspace:logs -- keycloak

# Realm importiert?
kubectl exec -n workspace deploy/keycloak -- /opt/keycloak/bin/kcadm.sh get realms --server http://localhost:8080 --realm master --user admin --password devadmin

# Proxy-Logs pruefen (Mattermost)
kubectl logs -n workspace deploy/mm-keycloak-proxy
```

**Haeufige Ursachen:**
- **Realm nicht importiert:** `import-entrypoint.sh` Logs pruefen. Keycloak-Pod neu starten: `task workspace:restart -- keycloak`
- **mm-keycloak-proxy nicht erreichbar:** `kubectl get pods -n workspace -l app=mm-keycloak-proxy`
- **oauth2-proxy Fehler (Invoice Ninja):** `kubectl logs -n workspace deploy/oauth2-proxy-invoiceninja`
- **oauth2-proxy Fehler (Docs):** `kubectl logs -n workspace deploy/oauth2-proxy-docs`

### Nextcloud OIDC Login fehlerhaft

**Diagnose:**
```bash
# OIDC-Config pruefen
kubectl exec -n workspace deploy/nextcloud -- cat /var/www/html/config/oidc.config.php

# Nextcloud-Logs
task workspace:logs -- nextcloud
```

**Loesung:** OIDC-Plugin neu installieren:
```bash
task workspace:post-setup
```

### Docs SSO Login fehlerhaft (oauth2-proxy-docs)

**Symptom:** Login auf docs.korczewski.de oder docs.mentolder.de schlaegt fehl (500, "unauthorized_client", oder Redirect-Loop).

**Diagnose:**
```bash
# oauth2-proxy-docs Logs
kubectl logs -n workspace deploy/oauth2-proxy-docs

# Secret korrekt?
kubectl get secret workspace-secrets -n workspace -o jsonpath='{.data.DOCS_OIDC_SECRET}' | base64 -d
```

**Haeufige Ursachen:**
- **OIDC-Secret stimmt nicht:** Der Wert in `workspace-secrets.DOCS_OIDC_SECRET` muss mit dem Keycloak-Client-Secret des `docs`-Clients uebereinstimmen. Pruefen und korrigieren:
  ```bash
  kubectl patch secret workspace-secrets -n workspace --type=merge \
    -p '{"stringData":{"DOCS_OIDC_SECRET":"<richtiger-wert>"}}'
  kubectl rollout restart deployment/oauth2-proxy-docs -n workspace
  ```
- **Keycloak `docs`-Client fehlt:** Im Realm `workspace` muss ein OIDC-Client `docs` mit den korrekten Redirect-URIs existieren. Pruefen unter auth.{domain}/admin.
- **Cookie-Kollision:** Falls mehrere Browser-Sessions gemischt werden, Cookies fuer die Domain loeschen.

### Mattermost zeigt "Verbindung verloren"

**Diagnose:**
```bash
task workspace:logs -- mattermost

# WebSocket-Port erreichbar?
curl -v http://chat.localhost/api/v4/system/ping
```

**Loesung:** Pod neu starten:
```bash
task workspace:restart -- mattermost
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

### Talk HPB / Video funktioniert nicht

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

### billing-bot antwortet nicht auf /billing

**Diagnose:**
```bash
# Bot-Logs
task workspace:logs -- billing-bot

# Health-Check
kubectl exec -n workspace deploy/mattermost -- curl -s http://billing-bot:8090/healthz

# Slash-Command konfiguriert?
kubectl exec -n workspace deploy/mattermost -- mmctl --local command list
```

**Loesung:**
```bash
# Image neu bauen und deployen
task workspace:billing-build
task workspace:restart -- billing-bot
```

### OpenSearch nicht erreichbar

**Diagnose:**
```bash
# OpenSearch-Logs
task workspace:logs -- opensearch

# Cluster-Health
kubectl exec -n workspace deploy/opensearch -- curl -s localhost:9200/_cluster/health
```

**Haeufige Ursachen:**
- **Zu wenig RAM:** OpenSearch benoetigt 512Mi. `kubectl describe pod -n workspace -l app=opensearch` fuer OOMKilled pruefen.
- **vm.max_map_count zu niedrig:** Auf dem Host `sysctl vm.max_map_count=262144` setzen.

### TLS-Zertifikat wird nicht ausgestellt

**Symptom:** `task cert:status` zeigt `READY: False`, Challenges bleiben `pending`.

**Diagnose:**
```bash
# Zertifikat-Status
task cert:status

# Challenge-Details
kubectl describe challenge -n workspace

# Webhook-Logs
kubectl logs -n cert-manager deploy/cert-manager-lego-webhook --tail=20
```

**Haeufige Ursachen:**

- **"some credentials information are missing: IPV64_API_KEY":** Der API-Key-Secret fehlt oder ist nicht korrekt konfiguriert. Loesung:
  ```bash
  task cert:secret -- <dein-ipv64-api-key>
  ```
  Dieser Befehl erstellt den Secret in `cert-manager` und `workspace` Namespaces und setzt die Umgebungsvariable auf dem Webhook-Pod.

- **Challenges bleiben in `pending` (DNS-Propagation):** TXT-Record-Propagation kann 1-5 Minuten dauern. Pruefen:
  ```bash
  nslookup -type=TXT _acme-challenge.<domain> 8.8.8.8
  ```

- **Ingress erstellt eigene Zertifikate:** Falls die Annotation `cert-manager.io/cluster-issuer` am Ingress gesetzt ist, erstellt cert-manager ein separates Zertifikat pro Subdomain statt das Wildcard zu nutzen. Die Annotation entfernen:
  ```bash
  kubectl annotate ingress workspace-ingress -n workspace cert-manager.io/cluster-issuer-
  ```

- **Orphan-Challenges mit Finalizer:** Stuck Challenges loeschen:
  ```bash
  kubectl get challenge -n workspace -o name | while read c; do
    kubectl patch "$c" -n workspace --type=merge -p '{"metadata":{"finalizers":null}}'
  done
  kubectl delete challenge --all -n workspace
  ```

### Mattermost OIDC-Login: "E-Mail bereits verknuepft"

**Symptom:** "Mit dieser E-Mail-Adresse ist bereits ein Konto verknuepft, das nicht die Anmeldemethode gitlab verwendet."

**Ursache:** Ein Mattermost-Account wurde mit E-Mail/Passwort erstellt, bevor OIDC (Keycloak) eingerichtet wurde.

**Loesung:** Authservice des Benutzers in der Datenbank umstellen:
```bash
# Keycloak User-ID ermitteln
task workspace:psql -- keycloak
SELECT id, username FROM user_entity WHERE email='<email>';

# Mattermost-User auf OIDC umstellen
task workspace:psql -- mattermost
UPDATE users
SET authservice='gitlab', authdata='<keycloak-user-id>', password=''
WHERE email='<email>';
```

Danach kann sich der Benutzer per Keycloak SSO anmelden.

### Website nicht erreichbar

**Diagnose:**
```bash
task website:status
task website:logs
```

**Loesung:** Image neu bauen:
```bash
task website:redeploy
```

### Manifeste sind ungueltig

**Diagnose:**
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

## Datenbank-Zugriff

```bash
# psql-Shell oeffnen
task workspace:psql -- keycloak
task workspace:psql -- mattermost
task workspace:psql -- nextcloud

# Port-Forward fuer externe Tools (DBeaver, pgAdmin)
task workspace:port-forward
# Dann: psql -h localhost -p 5432 -U postgres
```

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

## Vollstaendiger Reset

```bash
# Nur Workspace entfernen (Cluster bleibt)
task workspace:teardown
task workspace:deploy

# Alles zerstoeren und neu aufsetzen
task clean
task workspace:up
```
