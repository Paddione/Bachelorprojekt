<div class="page-hero">
  <span class="page-hero-icon">📋</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Sicherheitsbericht</div>
    <p class="page-hero-desc">Sicherheitsbericht zum Workspace MVP: Penetrationstest-Grundlagen, CTF-Objectives, Angriffsvektoren und SA-Testergebnisse.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Sicherheit</span>
      <span class="page-hero-tag">SA-01–SA-10</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Sicherheitsbericht — Workspace MVP

**Version:** 2.0
**Datum:** 2026-04-20
**Scope:** Kubernetes-basierter Collaboration-Stack (k3s/k3d), On-Premises

---

## 1. Systemübersicht

Das Workspace MVP ist eine Kubernetes-basierte Kollaborationsumgebung (K3s/K3d), die verschiedene Dienste (Chat/Messaging, Dateiverwaltung, IAM, Office, Passwort-Manager, KI-Assistent) integriert.

**Kernkomponenten:**

- **Orchestrierung:** Kubernetes (K3s/K3d)
- **Ingress-Controller:** Traefik v3 (Port 80/443)
- **Zentrales IAM:** Keycloak (OIDC/SSO) — `auth.korczewski.de`
- **Datenbank:** PostgreSQL 16 (`shared-db`) — separate Datenbanken und Zugangsdaten pro Dienst
- **Isolierung:** Kubernetes NetworkPolicies (Default-Deny für Ingress und Egress)

**Deploymentstruktur:**
- Alle Services laufen als Kubernetes Deployments im Namespace `workspace`
- Website/Messaging läuft im Namespace `website`
- Collabora im isolierten Namespace `workspace-office`

---

## 2. Externe Endpunkte (Scope)

Alle Dienste sind über Subdomains erreichbar. Ein Fokus des Tests sollte auf der Umgehung von Authentifizierungs-Layern liegen.

| Dienst | URL | Primärer Schutzmechanismus |
|--------|-----|---------------------------|
| **Keycloak (IAM)** | `auth.korczewski.de` | Zentraler OIDC-Provider |
| **Nextcloud** | `files.korczewski.de` | Native Auth + OIDC (Keycloak) |
| **Vaultwarden** | `vault.korczewski.de` | Native Bitwarden-API |
| **Collabora** | `office.korczewski.de` | OIDC (Keycloak) + WOPI-Protokoll |
| **Claude Code** | `ai.korczewski.de` | **Traefik Basic Auth** |
| **Mailpit** | `mail.korczewski.de` | **Traefik Basic Auth** |
| **Dokumentation** | `docs.korczewski.de` | **oauth2-proxy** (Keycloak OIDC Gateway) |
| **Website/Chat** | `web.korczewski.de` | Keycloak OIDC SSO |
| **Whiteboard** | `board.korczewski.de` | Keycloak OIDC SSO |
| **Nextcloud Talk HPB** | `signaling.korczewski.de` | Shared-Secret-Authentifizierung |

---

## 3. Sicherheitsrelevante Konfigurationen

### 3.1 Authentifizierungs-Flows

**Keycloak OIDC (Force-SSO):**
Alle Services ohne native OIDC-Unterstützung sind hinter einem `oauth2-proxy` gekapselt. Der Proxy validiert JWT-Tokens von Keycloak und setzt `X-Auth-Request`-Header. Zugriff ohne gültiges Keycloak-Token wird direkt zum Login-Flow weitergeleitet.

**Vaultwarden:**
Nutzt die native Bitwarden-API-Authentifizierung. Zusätzlich kann OIDC für den Admin-Bereich konfiguriert werden.

**Basic Auth (interne Tools):**
Mailpit und Claude Code MCP-Status sind über Traefik Basic Auth (`basic-auth-internal`) geschützt. Der Basic-Auth-Mechanismus ist eine zweite Verteidigungslinie für Dienste, die keine eigene Authentifizierung haben.

**Keycloak Brute-Force-Schutz:**
Aktiviert im Realm `workspace`. Passwort-Policy: mind. 12 Zeichen, Groß-/Kleinbuchstaben, Ziffern, Sonderzeichen. Hash-Algorithmus: PBKDF2-SHA512.

### 3.2 Netzwerk-Segmentierung (NetworkPolicies)

Alle Kubernetes NetworkPolicies sind in `k3d/network-policies.yaml` definiert:

- **Default-Deny:** Alle Pods blockieren standardmäßig Ingress und Egress
- **Intra-Namespace:** Kommunikation zwischen Pods im Namespace `workspace` ist erlaubt
- **Traefik-Ingress:** Traefik (kube-system) darf alle Services im workspace-Namespace erreichen
- **Egress-Kontrolle:** Nur spezifische Pods (mcp-github, claude-code-mcp-stripe) dürfen Verbindungen ins öffentliche Internet (Port 443) aufbauen
- **Collabora:** Nextcloud → Collabora (Port 9980, WOPI-Protokoll) explizit erlaubt
- **Signaling:** spreed-signaling → Janus MCU (coturn-Namespace, Port 8188) explizit erlaubt

### 3.3 Datenbank-Sicherheit

- Alle Dienste teilen sich eine PostgreSQL-Instanz (`shared-db`), nutzen aber **getrennte Datenbank-User und Passwörter**
- Verbindungen erfolgen ausschließlich cluster-intern (NetworkPolicy)
- Opportunistisches TLS mit selbst-signierten Zertifikaten (bei jedem Pod-Restart neu generiert)
- Port-Forwarding (`task workspace:port-forward`) erfordert kubectl-Zugriff (Kubernetes-API-Authentifizierung)

### 3.4 Container-Härtung

Pod Security Standards im `workspace`-Namespace (`k3d/namespace.yaml`):

```yaml
pod-security.kubernetes.io/enforce: baseline
pod-security.kubernetes.io/warn: restricted
```

Alle Container haben mindestens:
- `allowPrivilegeEscalation: false`
- `capabilities: drop: [ALL]`
- `seccompProfile: type: RuntimeDefault`

---

## 4. CTF-Objectives (Capture The Flag)

Zur objektiven Messung eines Angriffserfolgs wurden strategische Flags in der Infrastruktur platziert:

| Kategorie | Zielobjekt | Erwarteter Flag-Inhalt | Nachweis von... |
|-----------|------------|----------------------|-----------------|
| **Datenbank** | DB `pentest`, Tabelle `confidential_projects`, Spalte `secret_key` | `FLAG{SHARED_DB_DATA_EXFILTRATION_SUCCESS}` | SQL-Injection oder DB-Kompromittierung |
| **Dateisystem** | Pfad `/var/www/html/pentest_flag.txt` (im Nextcloud-Pod) | `FLAG{NEXTCLOUD_FILESYSTEM_BREACH_2026}` | RCE oder File-Read-Schwachstelle |
| **Kubernetes** | K8s Secret `pentest-internal-vault`, Key `secret-token` | `FLAG{K8S_API_ACCESS_GRANTED}` | Privilege Escalation in der K8s-API |

Die CTF-Ressourcen sind in `k3d/pentest-flags.yaml` definiert und werden nur in der Entwicklungsumgebung deployed.

---

## 5. Priorisierte Test-Szenarien (Angriffsvektoren)

1. **SSO Bypass:** Versuch, die Traefik-Middlewares zu umgehen, um unauthentifizierten Zugriff auf Backend-Dienste zu erlangen. Ziel: direkter Aufruf eines Backend-Services ohne gültiges Keycloak-Token.

2. **Identity Provider Exploitation:** Angriffe auf Keycloak — Realm-Konfiguration, Brute-Force auf `/auth/realms/workspace/protocol/openid-connect/token`, Token-Forging.

3. **Lateral Movement:** Kompromittierung eines Web-Dienstes (z.B. Nextcloud via App-Exploit) und anschließender Scan des internen Netzwerks (shared-db, andere Service-Pods). NetworkPolicies begrenzen mögliche Bewegungsfreiheit.

4. **Header Injection:** Prüfung, ob der `oauth2-proxy` durch manipulierte Header (`X-Forwarded-Groups`, `X-Auth-Request-User`) getäuscht werden kann, um unauthorized access zu erlangen.

5. **Sensitive Data Exposure:** Prüfung auf unzureichende Absicherung von `mail.korczewski.de` (Mailpit) oder `docs.korczewski.de`. Ziel: Zugriff auf E-Mail-Inhalte oder interne Dokumentation ohne Authentifizierung.

### Administrative Zugänge (Break-Glass — Testziele)

Im Falle eines Fehlers existieren folgende administrativen Möglichkeiten, die im Test auf Missbrauch geprüft werden sollten:

- Zugriff auf die `shared-db` via Port-Forwarding (erfordert K8s-API-Zugriff und `kubectl`)
- Nutzung von CLI-Tools innerhalb der Pods (`occ` für Nextcloud, Admin-Panel Vaultwarden)
- Kubernetes Dashboard / API-Server (kein Dashboard deployed — nur kubectl via kubeconfig)

---

## 6. SA-Test-Ergebnisse

Die Tests SA-01 bis SA-10 der Testsuite decken alle Sicherheitsebenen ab. Testergebnisse werden bei jedem Deployment automatisch validiert.

| Test-ID | Bereich | Prüfziel |
|---------|---------|---------|
| SA-01 | Transport | TLS-Verschlüsselung aller externen Verbindungen (HTTPS) |
| SA-02 | Authentifizierung | Login-Flow, Brute-Force-Lockout, Session-Invalidierung |
| SA-03 | Passwort-Sicherheit | PBKDF2-SHA512 Hashing in Keycloak |
| SA-04 | Injection | SQL-Injection-Schutz (Website-API, Nextcloud) |
| SA-05 | Netzwerk | NetworkPolicy Default-Deny aktiv |
| SA-06 | Container | Keine privilegierten Container (`privileged: true`) |
| SA-07 | Secrets | Keine Klartext-Credentials in ConfigMaps oder Logs |
| SA-08 | Header | OWASP Security-Header auf allen Services |
| SA-09 | Zugangskontrolle | Unauthentifizierter Zugriff auf geschützte Dienste blockiert |
| SA-10 | Backups | Verschlüsselte Backups vorhanden (AES-256) |

**Tests ausführen:**

```bash
# Einzelnen Test ausführen
./tests/runner.sh local SA-01

# Alle Sicherheitstests
./tests/runner.sh local SA-01
./tests/runner.sh local SA-05

# Mit detaillierter Ausgabe
./tests/runner.sh local --verbose SA-08
```

Vollständige Testspezifikationen und Acceptance-Kriterien: [tests.md](tests.md)

---

## 7. Risikomatrix

| Risiko | Wahrscheinlichkeit | Auswirkung | Priorität | Mitigation |
|--------|--------------------|-----------|-----------|------------|
| SSO-Bypass via Header-Manipulation | MITTEL | HOCH | KRITISCH | oauth2-proxy validiert JWT-Signatur; `removeHeader: true` in BasicAuth |
| Unkontrollierter East-West-Traffic | (vor Härtung: MITTEL) | HOCH | KRITISCH | NetworkPolicies Default-Deny implementiert |
| Brute-Force auf Keycloak | MITTEL | HOCH | HOCH | Rate-Limiting (20 req/s) + Brute-Force-Detection |
| Privilege Escalation im Container | NIEDRIG | HOCH | HOCH | SecurityContexts, Pod Security Standards |
| PostgreSQL ohne TLS (intern) | NIEDRIG | MITTEL | MITTEL | Mitigiert durch NetworkPolicy-Isolation |
| Unauthentifizierter Zugriff auf interne Tools | MITTEL | MITTEL | MITTEL | Basic Auth auf Mailpit, Docs, AI-Status |
| K8s-API-Zugriff ohne kubectl-Auth | SEHR NIEDRIG | SEHR HOCH | MITTEL | kubeconfig erforderlich, kein Dashboard deployed |

---

*Erstellt: 2026-04-20 | Quelle: PENTEST_OVERVIEW.md, k3d/network-policies.yaml, k3d/namespace.yaml*
