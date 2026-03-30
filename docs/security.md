# Sicherheit

## Grundregeln

1. **Keine echten Secrets committen** — `k3d/secrets.yaml` enthält nur Dev-Werte
2. **OIDC-Secrets vor dem ersten Start setzen** — werden in den Keycloak-Realm importiert
3. **Starke Passwörter verwenden** — siehe [Skripte → Passwörter generieren](scripts.md#passwörter-generieren)

## Netzwerksicherheit

### k3d-Cluster (Entwicklung)

In der lokalen k3d-Umgebung:

| Port | Service | Zugriff |
|------|---------|---------|
| 80/TCP | Traefik Ingress | `*.localhost` Domains |
| 3478/UDP+TCP | coturn (TURN/STUN) | NAT-Traversal für Talk |

Alle internen Services (Datenbanken, Signaling, NATS) sind nur innerhalb des Kubernetes-Clusters erreichbar.

## Authentifizierung

### Keycloak (SSO)

- **Brute-Force-Schutz** aktiviert
- **Selbstregistrierung** deaktiviert (nur Admin kann User anlegen)
- **Doppelte E-Mails** verboten

### OIDC

- Client-Secrets (`MATTERMOST_OIDC_SECRET`, `NEXTCLOUD_OIDC_SECRET`) werden nur server-seitig verwendet
- Authorization Code Flow (nicht Implicit) für maximale Sicherheit

## Secrets-Management

### Passwörter generieren

Für alle Passwort- und Secret-Felder starke Zufallswerte verwenden — siehe [Skripte → Passwörter generieren](scripts.md#passwörter-generieren).

### Secrets rotieren

1. Neues Passwort generieren
2. In `k3d/secrets.yaml` eintragen
3. Betroffenen Service neustarten:
   ```bash
   kubectl rollout restart deployment/<service> -n homeoffice
   ```

> **Ausnahme:** OIDC-Secrets können nach dem ersten Keycloak-Import nicht einfach in `secrets.yaml` geändert werden — sie müssen zusätzlich in der Keycloak Admin-Console aktualisiert werden.

## Bekannte Einschränkungen

### Mobile Push-Benachrichtigungen und DSGVO

Mattermost Team Edition verwendet den **Mattermost Test Push Notification Service (TPNS)** unter `https://push-test.mattermost.com` für mobile Push-Benachrichtigungen. Dieser Dienst wird von Mattermost Inc. in den USA betrieben.

**DSGVO-Einschätzung:** Für mobile Push-Benachrichtigungen verlassen Benachrichtigungsdaten kurzzeitig den europäischen Raum, da Apple (APNs) und Google (FCM) keine EU-exklusiven Relay-Dienste anbieten. Dies betrifft **nur** den Push-Kanal — alle gespeicherten Daten (Nachrichten, Dateien, Nutzerkonten) bleiben vollständig on-premises.

**Abgrenzung der DSGVO-Zusage:**

| Datentyp | Speicherort | DSGVO-konform |
|----------|-------------|---------------|
| Nachrichten, Dateien, Nutzerdaten | On-Premises (PostgreSQL, PVC) | ✅ Vollständig |
| Web- & Desktop-Benachrichtigungen | Browser/Electron (lokal) | ✅ Vollständig |
| E-Mail-Benachrichtigungen | Mailpit/eigener SMTP-Server | ✅ Vollständig |
| Mobile Push (iOS/Android) | Mattermost TPNS → APNs/FCM | ⚠️ US-Transit |

**Optionen zur vollständigen Konformität:**
1. **Eigener Push-Proxy:** [mattermost-push-proxy](https://github.com/mattermost/mattermost-push-proxy) selbst betreiben + eigene Mobile-Apps signieren
2. **Mobile Push deaktivieren:** In Mattermost System Console → Notifications → Push Notifications → "Do not send"
3. **Nur Web/Desktop nutzen:** Für maximale Datensouveränität keine Mobile-Apps verwenden

### Aufnahme von Videokonferenzen

Nextcloud Talk HPB unterstützt derzeit **keine serverseitige Aufnahme** von Videokonferenzen. Der Nextcloud Talk Recording Server befindet sich noch im experimentellen Stadium.

**Alternativen:**
- Teilnehmer können lokal per Browser-Funktion aufnehmen (z.B. OBS Studio)
- Bei Compliance-Anforderungen an Aufzeichnung: Dokumentation im Gesprächsprotokoll empfohlen

Diese Einschränkung ist in der Roadmap und wird bei Verfügbarkeit einer stabilen Recording-Lösung nachgerüstet.
