# Whiteboard — Kollaboratives Zeichnen

## Übersicht

Das Whiteboard ist ein WebSocket-basierter Backend-Service für die Nextcloud Whiteboard-App. Benutzer können in Nextcloud kollaborativ Diagramme, Notizen und Skizzen zeichnen — das Whiteboard speichert die Änderungen in Echtzeit und synchronisiert sie über WebSocket mit allen verbundenen Clients.

**Wichtig:** Das Whiteboard hat KEINE eigene Web-UI. Es ist ein reines Backend für die Nextcloud-App. Die gesamte Interaktion erfolgt über die Nextcloud Web-Oberfläche.

| Parameter | Dev | Produktion |
|-----------|-----|-----------|
| URL Backend | `http://board.localhost` | `https://board.mentolder.de` (intern) |
| Nextcloud App | `whiteboard` | `whiteboard` |
| Image | `ghcr.io/nextcloud-releases/whiteboard:v1.5.7` | gleich |
| Port (intern) | 3002 | 3002 |
| WebSocket | `ws://board.localhost` | `wss://board.mentolder.de` (Prod) |

**Abhängigkeiten:**
- Nextcloud (mit `whiteboard` App installiert)
- PostgreSQL (optional, falls Whiteboard-Dokumente persistent sein sollen)

**Namespace:** `workspace`

---

## Integration mit Nextcloud

### Nextcloud Whiteboard-App

Die Nextcloud Whiteboard-App (`whiteboard`) muss zunächst installiert werden:

```bash
task workspace:post-setup
```

Alternativ manuell im Nextcloud Admin-Panel:
1. **Nextcloud UI** → **Apps** → **Office & Text**
2. Suchen nach „Whiteboard" und installieren

### Konfiguration

Nach der Installation muss die Nextcloud Whiteboard-App die Backend-URL des Whiteboard-Services kennen. Dies geschieht über die Nextcloud-Config:

```bash
task workspace:whiteboard-setup
```

Oder manuell (via `occ` command in Nextcloud Pod):
```bash
kubectl exec -n workspace pod/nextcloud-<pod-id> -- \
  php occ config:app:set whiteboard \
  collabora_board_url "http://board" \
  --value=http://board
```

Die Konfiguration speichert:
- **Collabora Board URL (intern):** `http://board` (für Pod-zu-Pod-Kommunikation)
- **Collabora Board URL (extern):** `http://board.localhost` (für Browser-WebSocket)

### JWT-Authentifizierung

Das Whiteboard authentifiziert Anfragen von Nextcloud per JWT (JSON Web Token). Der JWT-Secret muss zwischen Nextcloud und Whiteboard identisch sein:

1. **In Nextcloud:**
   ```bash
   php occ config:app:set whiteboard jwt_secret_key "<secret>"
   ```

2. **Im Whiteboard Deployment (`k3d/whiteboard.yaml`):**
   ```yaml
   env:
     - name: JWT_SECRET_KEY
       valueFrom:
         secretKeyRef:
           name: workspace-secrets
           key: WHITEBOARD_JWT_SECRET
   ```

Falls die Secrets nicht übereinstimmen, zeigt die Whiteboard-App in Nextcloud die Fehlermeldung: **"Problem mit Authentifizierungskonfiguration"**.

---

## Betrieb

### Deployment prüfen
```bash
task workspace:status
```
Suchen Sie nach dem `whiteboard`-Pod.

### Logs ansehen
```bash
task workspace:logs -- whiteboard
```
Oder manuell:
```bash
kubectl logs -n workspace deployment/whiteboard --tail=100 -f
```

### Pod neu starten
```bash
task workspace:restart -- whiteboard
```

### WebSocket-Verbindung testen
```bash
# Im Pod
kubectl exec -n workspace deployment/whiteboard -- curl http://localhost:3002/

# Von außen (Browser Console)
const ws = new WebSocket('ws://board.localhost');
ws.onopen = () => console.log('Connected to Whiteboard');
ws.onerror = (e) => console.error('WebSocket error:', e);
```

### Service prüfen
```bash
kubectl get svc -n workspace | grep whiteboard
kubectl get endpoints -n workspace whiteboard
```

---

## Kubernetes-Konfiguration

### Deployment
Siehe `k3d/whiteboard.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whiteboard
  namespace: workspace
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: whiteboard
          image: ghcr.io/nextcloud-releases/whiteboard:v1.5.7
          ports:
            - containerPort: 3002
          env:
            - name: NEXTCLOUD_URL
              value: "http://nextcloud"
            - name: JWT_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: WHITEBOARD_JWT_SECRET
          readinessProbe:
            httpGet:
              path: /
              port: 3002
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3002
            initialDelaySeconds: 10
            periodSeconds: 20
```

**Wichtige Umgebungsvariablen:**
- `NEXTCLOUD_URL`: Interne Kubernetes Service-URL (`http://nextcloud`)
- `JWT_SECRET_KEY`: Geheimer Schlüssel für JWT-Validierung (aus Secret)

### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: whiteboard
  namespace: workspace
spec:
  type: ClusterIP
  selector:
    app: whiteboard
  ports:
    - port: 80
      targetPort: 3002
```

### Ingress
Wird automatisch via `k3d/configmap-domains.yaml` konfiguriert:
```yaml
board.localhost=whiteboard:80          # Dev
```

Traefik routet alle WebSocket-Anfragen an `board.localhost` zum Whiteboard-Service weiter.

---

## Betrieb in Produktion

### TLS/HTTPS
In der Produktion wird Whiteboard über HTTPS (WSS für WebSocket) erreichbar sein. Das wird durch cert-manager automatisch konfiguriert.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: whiteboard
  namespace: workspace
spec:
  tls:
    - hosts:
        - board.mentolder.de
      secretName: whiteboard-tls
  rules:
    - host: board.mentolder.de
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: whiteboard
                port:
                  number: 80
```

### Nextcloud extern konfigurieren
Falls Nextcloud auf einem anderen Host läuft, wird die externe URL benötigt:
```bash
php occ config:app:set whiteboard \
  collabora_board_url_external "https://board.mentolder.de"
```

---

## Fehlerbehebung

### Whiteboard-App zeigt "Problem mit Authentifizierungskonfiguration"
**Ursachen:**
1. JWT-Secret stimmt nicht überein (Nextcloud ≠ Whiteboard)
2. Whiteboard-Pod läuft nicht (CrashLoopBackOff)
3. WebSocket-Verbindung wird blockiert (Firewall/Proxy)

**Lösung:**
```bash
# 1. Secrets überprüfen
kubectl get secret workspace-secrets -n workspace -o jsonpath='{.data.WHITEBOARD_JWT_SECRET}' | base64 -d

# 2. In Nextcloud vergleichen
kubectl exec -n workspace pod/nextcloud-<pod-id> -- \
  php occ config:app:get whiteboard jwt_secret_key

# 3. Werte müssen identisch sein. Falls nicht:
task workspace:whiteboard-setup
```

### Whiteboard-App lädt nicht
**Ursachen:**
1. Nextcloud ist nicht erreichbar
2. Whiteboard-Backend antwortet nicht (Port 3002)
3. NEXTCLOUD_URL im Whiteboard falsch konfiguriert

**Lösung:**
```bash
# Pod-Status
kubectl get pod -n workspace | grep whiteboard

# Logs
task workspace:logs -- whiteboard

# Verbindung testen (vom Pod aus)
kubectl exec -n workspace deployment/whiteboard -- \
  curl -v http://nextcloud/
```

### WebSocket-Fehler in Browser-Console
**Fehler:** `WebSocket connection to 'ws://board.localhost' failed`

**Ursachen:**
1. Whiteboard nicht über Ingress erreichbar
2. Browser unterstützt WebSocket nicht
3. Proxy blockiert WebSocket-Upgrade

**Lösung:**
```bash
# Ingress prüfen
kubectl get ingress -n workspace | grep board

# Service erreichbar?
kubectl get svc -n workspace | grep whiteboard

# Manuell testen
curl http://board.localhost/
```

### Performance-Probleme
- Whiteboard wird langsam mit vielen Clients
- Große Zeichnungen frieren ein

**Lösungen:**
1. Pod-Ressourcen erhöhen (CPU/Memory Limits)
2. Mehr Replicas (mit Load-Balancer)
3. Whiteboard-Version upgraden

---

## Weiterführend

- **Nextcloud Whiteboard:** https://apps.nextcloud.com/apps/whiteboard
- **Nextcloud Talk HPB (für Video):** [Talk HPB](talk-hpb.md)
- **Nextcloud-Integration:** [Nextcloud](nextcloud.md)
