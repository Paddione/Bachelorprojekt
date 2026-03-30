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
