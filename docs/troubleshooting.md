# Fehlerbehebung

Alle hier referenzierten Befehle finden sich unter [Skripte](scripts.md).

## Pods starten nicht

### Allgemeine Diagnose

Pod-Status und Logs prüfen:

```bash
kubectl get pods -n homeoffice
kubectl describe pod -n homeoffice <pod-name>
kubectl logs -n homeoffice deploy/<service> --tail=50
```

### Pod bleibt in "Pending"

Meist fehlendes PersistentVolume oder ungenügend Ressourcen:

```bash
kubectl get events -n homeoffice --sort-by='.lastTimestamp' | tail -10
```

### Pod in "CrashLoopBackOff"

Container startet und stürzt sofort ab. Logs des letzten Starts prüfen:

```bash
kubectl logs -n homeoffice deploy/<service> --previous
```

## Keycloak

### Realm wurde nicht importiert

- **Ursache:** OIDC-Secrets waren beim ersten Start nicht in `k3d/secrets.yaml` gesetzt
- **Prüfen:** Keycloak Admin (http://auth.localhost) → Realms → "homeoffice" vorhanden?
- **Lösung:** Keycloak-PVC löschen und Deployment neustarten:
  ```bash
  kubectl delete pvc keycloak-db-data -n homeoffice
  kubectl rollout restart deployment/keycloak-db deployment/keycloak -n homeoffice
  ```

### Benutzer erscheinen nicht in Keycloak

- **Prüfen:** Keycloak Admin Console → Users → Benutzer suchen
- **Lösung:** Benutzer über Admin Console oder Import-Skript anlegen — siehe [Keycloak & SSO](keycloak.md)

### "Invalid redirect URI" beim Login

- **Ursache:** Domain in `k3d/configmap-domains.yaml` stimmt nicht mit Keycloak-Client überein
- **Prüfen:** `KC_DOMAIN` / `MM_DOMAIN` in ConfigMap mit Redirect-URIs in Keycloak vergleichen
- **Lösung:** ConfigMap anpassen und Keycloak neustarten

## Mattermost

### OIDC-Login funktioniert nicht

1. Keycloak erreichbar? `curl http://auth.localhost/health/ready`
2. Client "mattermost" in Keycloak vorhanden?
3. Secret in Mattermost = Secret in Keycloak?
4. Redirect-URI korrekt konfiguriert?

## Nextcloud

### "Access through untrusted domain"

- **Ursache:** Domain nicht als Trusted Domain konfiguriert
- **Lösung:** `NC_DOMAIN` in `k3d/configmap-domains.yaml` prüfen

### WebDAV-Fehler

```bash
curl -u admin:devnextcloudadmin http://files.localhost/remote.php/dav/files/admin/
```

## Nextcloud Talk

### Video/Audio funktioniert nicht

- Prüfen ob HPB (spreed-signaling) läuft: `kubectl get pods -n homeoffice | grep signaling`
- Prüfen ob coturn (TURN-Server) läuft: `kubectl get pods -n homeoffice | grep coturn`
- Browser-Konsole prüfen (F12) auf WebRTC-Fehler
- Talk-App muss installiert sein: `kubectl exec -n homeoffice deploy/nextcloud -- php occ app:list | grep spreed`

### Konferenz startet, aber kein Bild/Ton

- Meist ein NAT/Firewall-Problem mit dem TURN-Server
- Prüfen ob coturn korrekt konfiguriert ist

## Allgemeine Tipps

```bash
# Alles neustarten
kubectl rollout restart deployment --all -n homeoffice

# Einzelnen Service neustarten
kubectl rollout restart deployment/<service> -n homeoffice

# Shell in einem Pod öffnen
kubectl exec -it -n homeoffice deploy/<service> -- sh

# Alle Logs verfolgen
kubectl logs -n homeoffice -f --all-containers -l 'app in (mattermost,keycloak,nextcloud)'

# Komplett zurücksetzen (ALLE DATEN WEG!)
kubectl delete namespace homeoffice
task homeoffice:deploy
```
