# Mailpit — Entwicklungs-Mailserver

## Übersicht

Mailpit ist ein lokaler SMTP-Server mit Web-UI für E-Mail-Testing in der Entwicklungsumgebung. Alle Services (Keycloak, Nextcloud, Website, Vaultwarden) können E-Mails versenden — diese werden von Mailpit abgefangen und in der Web-UI angezeigt statt echte E-Mails zu versenden.

**Wichtig:** Mailpit ist **NUR für Entwicklung** relevant. In Produktion wird ein echter SMTP-Server (z.B. smtp.mailbox.org) verwendet.

| Parameter | Dev | Produktion |
|-----------|-----|-----------|
| Web-UI | `http://mail.localhost` | nicht vorhanden |
| SMTP-Server | `mailpit:1025` (intern) | echter SMTP-Server |
| Image | `axllent/mailpit:v1.29` | nicht verwendet |
| Speicherung | In-Memory / temp (optional) | nicht relevant |

**Abhängigkeiten:** keine (eigenständiger Service)

**Namespace:** `workspace`

---

## Funktionsweise

Mailpit funktioniert wie ein echter SMTP-Server mit zwei wichtigen Unterschieden:

1. **Keine echten E-Mails:** Statt E-Mails zu versenden, speichert Mailpit sie in-Memory ab
2. **Web-UI zur Inspektion:** Alle Mails sind in der Mailpit Web-UI einsehbar

### SMTP-Flow
```
┌─────────────────────┐
│  Service            │
│  (Keycloak, etc.)   │
└──────────┬──────────┘
           │
           │ SMTP Verbindung
           │ (mailpit:1025)
           │
      ┌────▼────────────┐
      │  Mailpit        │
      │  SMTP-Server    │
      │  (Port 1025)    │
      └────┬────────────┘
           │
           │ speichert Mail
           │
      ┌────▼────────────────┐
      │  In-Memory Storage  │
      │  (oder temp-DB)     │
      └─────────────────────┘
           │
           │ REST API + Web-UI
           │
      ┌────▼────────────┐
      │  Browser        │
      │  Web-UI         │
      │  (port 8025)    │
      └─────────────────┘
```

---

## Konfiguration in Services

### Keycloak
Mailpit ist in Keycloak als SMTP-Server konfiguriert. Im Keycloak-Realm-JSON (`k3d/realm-workspace-dev.json`):

```json
"smtpServer": {
  "host": "mailpit",
  "port": 1025,
  "ssl": false,
  "starttls": false,
  "auth": false,
  "from": "contact@mentolder.de"
}
```

### Nextcloud
In der Nextcloud ConfigMap:
```yaml
SMTP_HOST: "mailpit"
SMTP_PORT: "1025"
SMTP_SECURE: "false"
SMTP_USER: ""
SMTP_PASS: ""
FROM_EMAIL: "contact@mentolder.de"
```

### Website (Astro)
In der Website ConfigMap (`k3d/website.yaml`):
```yaml
SMTP_HOST: "mailpit"
SMTP_PORT: "1025"
SMTP_SECURE: "false"
SMTP_USER: ""
SMTP_PASS: ""
FROM_EMAIL: "contact@mentolder.de"
```

### Vaultwarden
Falls E-Mail-Benachrichtigungen aktiviert sind:
```yaml
MAIL_HOST: "mailpit"
MAIL_PORT: "1025"
MAIL_SECURITY: "none"
MAIL_USERNAME: ""
MAIL_PASSWORD: ""
MAIL_FROM: "contact@mentolder.de"
```

---

## Web-UI verwenden

### Mails anschauen
1. **URL öffnen:** `http://mail.localhost` (Dev k3d)
2. **Inbox sehen:** Alle eingegangenen Mails werden in einer Liste angezeigt
3. **Mail lesen:** Mail anklicken um Inhalt, Header, und Attachments zu sehen

### Mail-Details
Für jede Mail werden angezeigt:
- **From:** Absender
- **To:** Empfänger
- **Subject:** Betreff
- **Date:** Zeitstempel
- **Body:** HTML und Text-Version
- **Attachments:** Falls vorhanden

### API zum Abfragen
```bash
# Alle Mails auflisten (JSON)
curl http://mail.localhost/api/v1/messages

# Spezifische Mail abrufen
curl http://mail.localhost/api/v1/messages/<message-id>

# Mails löschen
curl -X DELETE http://mail.localhost/api/v1/messages

# Mails nach Absender filtern
curl http://mail.localhost/api/v1/messages | \
  jq '.[] | select(.From.Address | contains("keycloak"))'
```

---

## In Tests verwenden

### Test-Beispiel: E-Mail-Verifikation
```bash
# 1. Test-Aktion ausführen (z.B. Passwort-Reset)
curl -X POST http://keycloak.localhost/... -d '{...}'

# 2. Mailpit API abfragen
MAIL_COUNT=$(curl http://mail.localhost/api/v1/messages | jq 'length')
echo "Mails empfangen: $MAIL_COUNT"

# 3. Reset-Link aus Mail extrahieren
RESET_LINK=$(curl http://mail.localhost/api/v1/messages | \
  jq -r '.[] | select(.Subject | contains("Reset")) | .Body' | \
  grep -oP 'http[s]?://[^\s]+reset[^\s<]*')

echo "Reset-Link: $RESET_LINK"
```

### Test-Suite
Die Workspace-Tests (SA-06, FA-12, etc.) nutzen Mailpit zur Verifikation von:
- Passwort-Reset-Mails (Keycloak)
- Benutzer-Einladungs-Mails
- Nextcloud-Benachrichtigungen
- Website Fehlerberichte

---

## Kubernetes-Konfiguration

### Deployment
Siehe `k3d/mailpit.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mailpit
  namespace: workspace
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: mailpit
          image: axllent/mailpit:v1.29
          ports:
            - containerPort: 1025
              name: smtp
            - containerPort: 8025
              name: http
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: data
              mountPath: /data
          resources:
            requests:
              memory: 64Mi
              cpu: "50m"
            limits:
              memory: 256Mi
              cpu: "200m"
      volumes:
        - name: tmp
          emptyDir: {}
        - name: data
          emptyDir: {}
```

**Wichtige Details:**
- **Port 1025:** SMTP (für Services)
- **Port 8025:** HTTP Web-UI (via Ingress)
- **Speicher:** EmptyDir (volatil — Mails gehen nach Pod-Neustart verloren)
- **Resources:** Minimal (64Mi Memory, 50m CPU)

### Service
```yaml
apiVersion: v1
kind: Service
metadata:
  name: mailpit
  namespace: workspace
spec:
  type: ClusterIP
  selector:
    app: mailpit
  ports:
    - port: 1025
      targetPort: 1025
      name: smtp
    - port: 8025
      targetPort: 8025
      name: http
```

### Ingress
Wird via `k3d/configmap-domains.yaml` konfiguriert:
```yaml
mail.localhost=mailpit:8025          # Dev
```

Traefik routet HTTP-Anfragen an `mail.localhost` zur Mailpit Web-UI weiter.

---

## Betrieb

### Status prüfen
```bash
task workspace:status
```
Suchen nach `mailpit`-Pod.

### Logs ansehen
```bash
task workspace:logs -- mailpit
```
Oder manuell:
```bash
kubectl logs -n workspace deployment/mailpit --tail=100 -f
```

### Pod neu starten
```bash
task workspace:restart -- mailpit
```

### Alle Mails löschen
```bash
curl -X DELETE http://mail.localhost/api/v1/messages
```

### Speicher prüfen
```bash
# Mailpit Pod-Ressourcen
kubectl top pod -n workspace | grep mailpit
```

---

## Fehlerbehebung

### Services können sich nicht mit Mailpit verbinden
**Problem:** `Connection refused` oder `Connection timeout` beim Versuch E-Mails zu versenden
**Ursachen:**
1. Mailpit-Pod läuft nicht
2. Service `mailpit` nicht erreichbar
3. Hostname `mailpit` wird nicht aufgelöst (DNS-Problem im Cluster)

**Lösung:**
```bash
# 1. Pod-Status
kubectl get pod -n workspace | grep mailpit

# 2. Service prüfen
kubectl get svc -n workspace | grep mailpit

# 3. Von Service aus testen
kubectl exec -n workspace pod/<service-pod> -- \
  curl telnet://mailpit:1025

# 4. Evtl. neu starten
task workspace:restart -- mailpit
```

### Web-UI antwortet nicht
**Problem:** `http://mail.localhost` zeigt `Connection refused`
**Ursachen:**
1. Port 8025 nicht erreichbar
2. Ingress nicht konfiguriert
3. Mailpit-Pod crashed

**Lösung:**
```bash
# 1. Logs prüfen
task workspace:logs -- mailpit

# 2. Ingress prüfen
kubectl get ingress -n workspace | grep mail

# 3. Service testen
kubectl port-forward -n workspace svc/mailpit 8025:8025
# Dann im Browser: http://localhost:8025
```

### Mails werden nicht empfangen
**Problem:** Keine Mails in Mailpit sichtbar trotz Test
**Ursachen:**
1. SMTP_HOST falsch konfiguriert (nicht `mailpit`)
2. Service SMTP-Versand fehlgeschlagen (siehe Logs)
3. E-Mail wurde nicht gesendet (z.B. Test-E-Mail nicht initiiert)

**Lösung:**
```bash
# 1. ConfigMaps überprüfen
kubectl get configmap -n workspace website-config -o yaml | grep SMTP

# 2. Service-Logs prüfen
task workspace:logs -- <service>

# 3. Manuell Test-Mail senden
kubectl exec -n workspace deployment/mailpit -- \
  swaks -t admin@example.com -f test@example.com \
        -h localhost -p 1025 -m "Test Mail"
```

### Mails bei Pod-Neustart weg
**Ursache:** EmptyDir-Storage ist volatil
**Workaround:** Falls Mails persistent sein sollen, kann man ein PVC mounten (nicht standard in k3d).

---

## Produktion

### In Produktion nicht vorhanden
Mailpit wird nur in Dev deployed (in `k3d/mailpit.yaml`). Im Production Overlay gibt es keine Mailpit-Ressourcen.

### Echter SMTP-Server
In Produktion wird ein echter SMTP-Server konfiguriert:
- **Anbieter:** z.B. mailbox.org, SendGrid, Postmark, AWS SES
- **Konfiguration:** Via Umgebungsvariablen oder Secrets
- **Services:** Keycloak, Nextcloud, Website verwenden den echten SMTP-Server

Beispiel für mailbox.org:
```yaml
SMTP_HOST: "smtp.mailbox.org"
SMTP_PORT: "587"
SMTP_SECURE: "starttls"
SMTP_USER: "contact@mentolder.de"
SMTP_PASS: "password"
```

---

## Weiterführend

- **Mailpit GitHub:** https://github.com/axllent/mailpit
- **Mailpit Dokumentation:** https://mailpit.axllent.org/
- **Email-Testing Best Practices:** https://www.mailpit.io/docs/
