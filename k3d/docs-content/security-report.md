# Sicherheitsbericht — Workspace MVP

**Version:** 1.1
**Datum:** 2026-04-14
**Scope:** Kubernetes-basierter Collaboration-Stack (k3s/k3d), On-Premises

---

## 1. Executive Summary

Der Workspace MVP ist eine selbst-gehostete Kollaborationsplattform auf Kubernetes-Basis (Mattermost, Nextcloud, Keycloak, Vaultwarden, Invoice Ninja, Collabora, Claude Code MCP). Dieser Bericht analysiert den Sicherheitsstatus entlang aller 7 OSI-Schichten sowie der Kubernetes-spezifischen Sicherheitsebene und dokumentiert alle implementierten Schutzmaßnahmen.

**Gesamtbewertung vor Härtung:** MITTEL — grundlegende Schutzmechanismen vorhanden (TLS, OIDC SSO, Backup-Verschlüsselung), aber kritische Lücken bei Netzwerksegmentierung und Container-Härtung.

**Gesamtbewertung nach Härtung:** HOCH — alle identifizierten Lücken geschlossen. Verbleibende Risiken sind dokumentiert und mitigiert.

---

## 2. Scope & Methodik

**Stack:** k3s (Kubernetes 1.31), Traefik v3 Ingress, Keycloak 26, Mattermost 11, Nextcloud 31, Collabora, Vaultwarden 1.35, Invoice Ninja, PostgreSQL 16, Claude Code MCP, Flannel CNI.

**Methodik:** Statische Analyse aller Kubernetes-Manifeste, Konfigurationsdateien und CI/CD-Pipelines. Bewertung nach OSI-Modell (L1–L7) und OWASP-Grundsätzen. Mapping auf CIS Kubernetes Benchmark v1.8.

**Nicht im Scope:** Penetrationstests, dynamische Analyse, Netzwerk-Perimeter des physischen Servers.

---

## 3. OSI-Schichtanalyse

### Schicht 1 — Physical (Bitübertragung)

**Relevante Komponenten:** Hetzner-Dedicated-Server, Festplatten.

**Ist-Zustand:**
- Server im gesicherten Rechenzentrum (Hetzner SLA)
- Physischer Zugang liegt außerhalb Kubernetes-Kontrolle

**Risiko:** MITTEL ohne Disk-Encryption.

**Empfehlungen (außerhalb K8s-Scope):**
- LUKS Full-Disk-Encryption auf OS-Ebene
- SSH ausschließlich via Pubkey-Auth (kein Passwort-Login)
- BIOS/UEFI-Passwort, Secure Boot aktivieren

---

### Schicht 2 — Data Link (Sicherung)

**Relevante Komponenten:** Flannel CNI (k3s-Standard), VXLAN-Overlay.

**Ist-Zustand:**
- Flannel stellt VXLAN-Overlay-Netzwerk bereit
- Single-Node-Cluster: kein Inter-Node-Traffic
- Flannel unterstützt Kubernetes NetworkPolicies (über integrierten k3s-Controller)

**Risiko:** NIEDRIG (Single-Node, keine Inter-Node-Kommunikation).

**Empfehlung für Multi-Node:** Cilium mit WireGuard-Encryption für verschlüsselten Pod-zu-Pod-Traffic.

---

### Schicht 3 — Network (Vermittlung)

**Relevante Komponenten:** Kubernetes NetworkPolicies, CNI, Namespace-Isolation.

**Ist-Zustand vor Härtung:** Keine NetworkPolicies — vollständiger East-West-Traffic zwischen allen Pods erlaubt. Ein kompromittierter Pod hatte uneingeschränkten Zugriff auf PostgreSQL, Keycloak, Vaultwarden.

**Implementierte Maßnahmen:**

| Policy | Namespace | Effekt |
|--------|-----------|--------|
| `default-deny-ingress` | workspace, website | Alle eingehenden Verbindungen blockiert |
| `default-deny-egress` | workspace, website | Alle ausgehenden Verbindungen blockiert |
| `allow-dns-egress` | workspace, website | kube-dns Port 53 UDP/TCP erlaubt |
| `allow-intra-namespace-egress` | workspace, website | Pod-zu-Pod im Namespace erlaubt |
| `allow-intra-namespace-ingress` | website | Intra-Namespace Ingress (CronJob → Website) |
| `allow-traefik-ingress` | workspace, website | Traefik (kube-system) → alle Services |
| `allow-monitoring-ingress` | workspace | Prometheus-Scraping aus monitoring |
| `allow-mcp-external-egress` | workspace | mcp-github, mcp-stripe → HTTPS 443 extern |
| `allow-egress-to-workspace` | website | Website-Pod → workspace-Services |

**Risiko nach Härtung:** NIEDRIG.

**Verbleibend:** Ein vollständiger `monitoring`-Namespace (Prometheus/Grafana) ist aktuell auf der Produktionsumgebung nicht deployed. Die bestehende `allow-monitoring-ingress`-Policy im `workspace`-Namespace ist zukunftssicher vorbereitet; beim späteren Deployment von Prometheus/Grafana per `task workspace:monitoring` muss der `monitoring`-Namespace gleichzeitig mit eigenen Default-Deny-Policies versehen werden.

---

### Schicht 4 — Transport (Transport)

**Relevante Komponenten:** TLS (Traefik/cert-manager), PostgreSQL-Verbindungen, coturn/TURN.

**Verbindungsmatrix:**

| Verbindung | Protokoll | Status |
|-----------|-----------|--------|
| Extern → Traefik | TLS 1.2/1.3 | ✓ Let's Encrypt Wildcard |
| Traefik → Services (intern) | HTTP | Akzeptabel (gleiches Namespace, NetworkPolicies) |
| Services → PostgreSQL | TCP (`sslmode=prefer`) mit Server-TLS | ✓ PG-TLS aktiv (self-signed, opportunistisch) |
| TURN-Verbindungen (coturn) | TLS | ✓ |
| Mattermost WebSocket extern | WSS (TLS) | ✓ |

**Implementierte Maßnahmen:**
- TLS-Terminierung an Traefik mit automatischer Zertifikatserneuerung (cert-manager, DNS-01)
- HSTS `max-age=31536000; includeSubDomains`
- HTTP → HTTPS Redirect (301 Permanent)
- Let's Encrypt ACME v2
- Explizite `TLSOption default` in Traefik: `minVersion: VersionTLS12`, `sniStrict: true`
- PostgreSQL-Server-TLS: Selbstsigniertes Zertifikat wird von einem initContainer bei jedem Pod-Start in ein `emptyDir` geschrieben; PG startet mit `ssl=on` + `ssl_cert_file` / `ssl_key_file`. Clients (Keycloak, Mattermost, Vaultwarden, Outline) nutzen `sslmode=prefer` und handeln TLS opportunistisch aus. Nextcloud und Meetings folgen später.

**Risiko:** NIEDRIG extern, NIEDRIG intern.

**Zukünftige Erweiterung:** Vollständige PKI via cert-manager mit Client-CA-Verifikation (`sslmode=verify-ca`) für alle Services — schrittweise Migration nach v1.1.

---

### Schicht 5 — Session (Kommunikationssteuerung)

**Relevante Komponenten:** Keycloak Session Management, OIDC-Tokens, Cookies.

**Konfiguration:**
- Keycloak verwaltet alle Sessions zentralisiert (Single Sign-On)
- Passwort-Richtlinie: ≥12 Zeichen, Groß-/Kleinbuchstaben, Ziffern, Sonderzeichen
- Hash-Algorithmus: PBKDF2-SHA512
- Brute-Force-Detection: aktiviert (Realm `workspace`)
- OIDC-Token-Lifetime: konfiguriert im Realm
- `Secure`-Cookie-Flag: durch HTTPS-Pflicht gesetzt
- `HttpOnly` + `SameSite=Lax`: Keycloak-Standard

**Risiko:** NIEDRIG.

---

### Schicht 6 — Presentation (Darstellung)

**Relevante Komponenten:** TLS-Zertifikate, Cipher Suites.

**Konfiguration:**
- TLS 1.2 und 1.3 (Traefik-Standard, kein TLS 1.0/1.1)
- Let's Encrypt Wildcard-Zertifikat: `*.korczewski.de` + `korczewski.de`
- Automatische Erneuerung: 30 Tage vor Ablauf (cert-manager)
- Cipher Suites: Traefik-Defaults (keine RC4, DES, 3DES)
- `TLSOption default` (workspace-Namespace) mit `minVersion: VersionTLS12` und `sniStrict: true` — wird von Traefik automatisch auf alle IngressRoutes im Namespace angewendet

**Risiko:** NIEDRIG.

---

### Schicht 7 — Application (Anwendung)

**Relevante Komponenten:** HTTP-Security-Header, Rate-Limiting, Authentifizierung.

**Ist-Zustand vor Härtung:** Nur HSTS + HTTP→HTTPS. Mailpit/Docs/AI ohne Auth erreichbar. Kein Rate-Limiting.

**Implementierte Security-Header (Middleware `security-headers`, alle Prod-Services):**

| Header | Wert | Schutzwirkung |
|--------|------|---------------|
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking-Schutz |
| `X-Content-Type-Options` | `nosniff` | MIME-Sniffing verhindern |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS-Filter |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Datenleck via Referer verhindern |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Browser-Feature-Einschränkung |
| `X-Robots-Tag` | `noindex` | Suchmaschinen-Indexierung verhindern |

**Rate-Limiting (Traefik Middleware, Produktion):**

| Service | avg req/s | Burst | Schutzwirkung |
|---------|-----------|-------|---------------|
| Keycloak | 20 | 40 | Brute-Force-Schutz |
| Vaultwarden | 20 | 40 | Credential-Stuffing-Schutz |
| Invoice Ninja | 30 | 60 | API-Missbrauch verhindern |
| Nextcloud | 50 | 100 | Upload-Flood-Schutz |
| Mattermost | 100 | 200 | DoS-Mitigation |
| Website | 200 | 400 | Öffentlicher Zugriff |

**BasicAuth für interne Tools:**

| Service | Schutz |
|---------|--------|
| `mail.*` (Mailpit) | BasicAuth — kein öffentlicher Zugriff auf E-Mail-Inhalte |
| `docs.*` | BasicAuth — interne Dokumentation |
| `ai.*` (MCP-Status) | BasicAuth — KI-Infrastruktur-Status |

**Risiko nach Härtung:** NIEDRIG.

---

## 4. Kubernetes-Sicherheitsschicht (Querschnitt)

### 4.1 Pod Security Standards

```yaml
# k3d/namespace.yaml
pod-security.kubernetes.io/enforce: baseline   # erzwungen
pod-security.kubernetes.io/warn: restricted    # Warnung
```

- **baseline** verhindert bekannte Privilege-Escalation-Vektoren
- **restricted** auditiert nicht-konforme Pods

### 4.2 Container SecurityContexts

Alle Deployments haben nach Härtung mindestens:
- `allowPrivilegeEscalation: false`
- `capabilities: drop: [ALL]`
- `seccompProfile: type: RuntimeDefault`

**Volle Härtung** (`readOnlyRootFilesystem: true`, `runAsNonRoot: true`):

| Service | UID |
|---------|-----|
| billing-bot | 65534 |
| mailpit | 65534 |
| oauth2-proxy-invoiceninja | 65534 |
| docs | 1000 |
| mm-keycloak-proxy (nginx) | 101 + 3× emptyDir tmpfs |
| nextcloud-redis | 999 |

**Partielle Härtung** (`readOnlyRootFilesystem: false` — Applikation schreibt Dateien):

| Service | UID |
|---------|-----|
| mattermost | 2000 |
| keycloak | 1000 |
| nextcloud | 33 (www-data) |
| vaultwarden | 65534 |
| opensearch | 1000 |
| whiteboard | 65534 |

**Sonderfälle:**
- **Collabora:** SYS_ADMIN-Capability (LibreOffice-Kern) — isoliert in `workspace-office`-Namespace
- **PostgreSQL:** Non-Root UID 999 (bereits vor Härtung gesetzt)
- **Nextcloud/OpenSearch initContainers:** Laufen als root für Berechtigungs-Setup — bewusste Ausnahme

### 4.3 RBAC

Claude-Code-Agent (least-privilege ClusterRole):
- Read-only: Pods, Services, ConfigMaps, Events, Nodes, Ingresses, NetworkPolicies
- Kein Zugriff auf Secrets
- Kein `pods/exec`
- Nur `patch`/`update` auf Deployments (Restart + Scale)

### 4.4 Secret Management

| Umgebung | Methode |
|----------|---------|
| Entwicklung | `k3d/secrets.yaml` (Dev-Werte, nie real credentials) |
| Produktion | `prod/secrets.yaml` (Platzhalter, manuell befüllt) |
| GitOps | Sealed Secrets Controller deployed |

### 4.5 CI/CD-Sicherheitsprüfungen

| Prüfung | Tool |
|---------|------|
| Manifest-Validierung | kustomize + kubeconform (K8s 1.31.0) |
| YAML-Linting | yamllint |
| Shell-Linting | shellcheck |
| Image-Pinning | custom check |
| Secret-Detection | custom check |

---

## 5. DSGVO / Compliance-Status

Der Workspace MVP ist **DSGVO-konform by Design** — alle personenbezogenen Daten verbleiben vollständig on-premises. Kein Drittanbieter, keine Cloud-Registry, keine Telemetrie.

---

### 5.1 Art. 5 — Verarbeitungsgrundsätze

| Grundsatz | Nachweis im Stack |
|-----------|-------------------|
| **Rechtmäßigkeit** | Keycloak OIDC: jede Verarbeitung an authentifizierte Session gebunden; Rechtsgrundlagen in Datenschutzerklärung dokumentiert (Art. 6 I b/c/f) |
| **Zweckbindung** | Getrennte Services je Zweck (Mattermost = Kommunikation, Nextcloud = Dateien, Invoice Ninja = Rechnungen); keine Cross-Service-Datennutzung |
| **Datenminimierung** | Keycloak erhebt nur Name + E-Mail + Passwort-Hash; kein Tracking, kein Profiling, keine Analyse-Tools |
| **Richtigkeit** | Self-Service-Profil in Keycloak Account-Console und Nextcloud; Admin kann Daten auf Anfrage (Art. 16) korrigieren |
| **Speicherbegrenzung** | Definierte Löschfristen im Verarbeitungsverzeichnis; Backup-Retention 30 Tage; Admin-Prozess für Datenlöschung (Art. 17) dokumentiert |
| **Integrität & Vertraulichkeit** | TLS 1.2/1.3 extern, NetworkPolicies intern, AES-256 Backup, SecurityContexts, RBAC — vollständig in Art. 32 TOMs dokumentiert |
| **Rechenschaftspflicht** | Dieser Sicherheitsbericht, Verarbeitungsverzeichnis (`docs/verarbeitungsverzeichnis.md`), automatisiertes Compliance-Script (`scripts/dsgvo-compliance-check.sh`) |

---

### 5.2 Art. 25 — Datenschutz durch Technikgestaltung (Privacy by Design / by Default)

| Prinzip | Umsetzung |
|---------|-----------|
| **Privacy by Design** | On-premises-Architektur: kein Datentransfer zu Cloud-Anbietern (gcr.io, amazonaws, azurecr blockiert durch NetworkPolicies); FOSS-Only-Stack |
| **Privacy by Default** | Minimale Standard-Berechtigungen: neue Keycloak-User erhalten nur Basis-Rollen; keine optionalen Tracking-Features aktiviert |
| **Datenminimierung by Design** | Kontaktformular erhebt nur Name + E-Mail + Nachricht; Terminbuchung nur Name + E-Mail + Zeitslot |
| **Keine Profilbildung** | Kein Analytics-Tool, kein Behavioural Tracking, keine A/B-Test-Infrastruktur |
| **Segregation by Design** | Namespaces `workspace` / `website` getrennt mit NetworkPolicy Default-Deny; Claude Code MCP kein Zugriff auf Secrets |

---

### 5.3 Art. 32 — Technische und Organisatorische Maßnahmen (TOMs)

#### Technische Maßnahmen

| Maßnahme | Implementierung | Nachweis |
|----------|----------------|---------|
| Verschlüsselung in Transit | TLS 1.2/1.3 (Traefik), HSTS max-age=31536000 + includeSubDomains | `prod/traefik-middlewares.yaml`: `hsts-headers` |
| Verschlüsselung at Rest | AES-256-CBC + PBKDF2 (Backup-CronJob, täglich 02:00 UTC, 30-Tage-Retention) | `k3d/backup-cronjob.yaml` |
| Zugriffskontrolle | Keycloak OIDC SSO für alle Services; BasicAuth für interne Tools (Mailpit, Docs, MCP-Status) | `prod/ingress.yaml`, `prod/traefik-middlewares.yaml` |
| Netzwerksegmentierung | NetworkPolicy Default-Deny-Ingress + Default-Deny-Egress in `workspace` + `website` Namespace | `k3d/network-policies.yaml`, `k3d/website.yaml` |
| Container-Isolation | `allowPrivilegeEscalation: false`, `capabilities: drop: [ALL]`, `seccompProfile: RuntimeDefault` auf allen Deployments | Alle `k3d/*.yaml` Deployments |
| Pseudonymisierung | Keycloak User-IDs (UUID) statt Klarnamen in Service-Logs; Mattermost-Nachrichten referenzieren User-ID | Keycloak-Standard |
| Audit-Logging | Keycloak Audit Events (Login, Logout, Passwort-Änderung); Mattermost `/api/v4/audits` | Keycloak Realm-Config + D04/D05 |
| Brute-Force-Schutz | Keycloak Brute-Force-Detection (Realm `workspace`) + Traefik Rate-Limiting (Keycloak: 20 req/s, Vaultwarden: 20 req/s) | `prod/traefik-middlewares.yaml` |
| Pod Security Standards | `baseline` enforced, `restricted` warned im `workspace`-Namespace | `k3d/namespace.yaml` |
| Secret-Isolierung | `k3d/secrets.yaml` (Dev), `prod/secrets.yaml` (Prod Platzhalter); Claude Code RBAC: kein Secrets-Zugriff | `k3d/mcp.yaml` ClusterRole |

#### Organisatorische Maßnahmen

| Maßnahme | Implementierung |
|----------|----------------|
| Passwort-Policy | Keycloak: ≥12 Zeichen, Groß-/Kleinbuchstaben, Ziffer, Sonderzeichen; PBKDF2-SHA512 |
| Least-Privilege-Prinzip | Claude Code MCP: read-only auf Pods/Services/ConfigMaps; kein `pods/exec`, kein Secrets-Zugriff |
| CI/CD-Sicherheitsprüfungen | GitHub Actions: kustomize-Validierung, kubeconform, yamllint, shellcheck, Secret-Detection, Image-Pinning |
| Backup & Recovery | Tägliche verschlüsselte Backups (keycloak, mattermost, nextcloud); 30-Tage-Retention |
| Automatisierte Compliance-Prüfung | `scripts/dsgvo-compliance-check.sh` — 12 Checks (D01–D12), Grafana-Dashboard-Integration |

---

### 5.4 Art. 33/34 — Meldepflicht bei Datenpannen

Bei Feststellung einer Datenpanne gilt folgendes Verfahren:

**Stufe 1 — Erkennung (0–4 Stunden):**
- Monitoring-Alert (Grafana/Prometheus) oder manuelle Meldung
- Erstbewertung: welche Daten betroffen, Umfang, potenzielle Ursache
- Sofortmaßnahme: betroffenen Service isolieren (NetworkPolicy oder Deployment stoppen)
- Dokumentation: Zeitpunkt, Art, erste Einschätzung

**Stufe 2 — Bewertung (4–72 Stunden):**
- Vollständige Analyse: welche personenbezogenen Daten, wie viele Betroffene, Risiko für Rechte und Freiheiten
- Wenn **kein Risiko** für Betroffene: interne Dokumentation ausreichend (Art. 33 Abs. 1)
- Wenn **Risiko** besteht: Meldung an zuständige Aufsichtsbehörde innerhalb 72 Stunden

**Stufe 3 — Meldung (sofern erforderlich):**
- Meldung an Datenschutz-Aufsichtsbehörde (Art. 33): Name/Kontakt des Verantwortlichen, Art der Panne, betroffene Datenkategorien, Anzahl betroffene Personen, voraussichtliche Folgen, ergriffene Maßnahmen
- Benachrichtigung der Betroffenen (Art. 34): wenn voraussichtlich **hohes Risiko** für persönliche Rechte

**Kontaktpunkt:** Verantwortlicher lt. Impressum (/impressum)

---

### 5.5 Art. 35 — Datenschutz-Folgenabschätzung (DPIA)

**Schwellwert-Prüfung nach Art. 35 Abs. 1 i.V.m. Abs. 3 DSGVO:**

| Kriterium | Bewertung |
|-----------|-----------|
| Systematische umfangreiche Verarbeitung besonderer Kategorien (Art. 9/10) | Nein — keine Gesundheits-, Bio- oder Strafverfolgungsdaten |
| Systematische Überwachung öffentlich zugänglicher Bereiche | Nein — geschlossene Plattform, nur authentifizierte Nutzer |
| Umfangreiches Profiling | Nein — kein Profiling, kein Tracking |
| Neue Technologien mit hohem Risiko | Bedingt — KI (Claude Code MCP), aber: read-only, kein Zugriff auf Nutzerdaten |
| Anzahl betroffener Personen | < 50 Nutzer (kleines Team) |

**Ergebnis: DPIA nicht zwingend erforderlich.**

**Vorsorglich dokumentiert (Mini-DPIA):**
- **Verarbeitungszweck:** Kollaborationsplattform für kleine Teams (Kommunikation, Dateiablage, Rechnungsstellung)
- **Notwendigkeit/Verhältnismäßigkeit:** Vollständig on-premises, minimale Datenerhebung, FOSS-Stack, keine Drittanbieter
- **Identifizierte Risiken:** Unbefugter Zugriff bei kompromittiertem Container — mitigiert durch NetworkPolicies + SecurityContexts; Datenverlust — mitigiert durch verschlüsselte Backups
- **Verbleibende Risiken:** Physischer Serverzugang (Hetzner-RZ, außerhalb K8s-Scope) — NIEDRIG

---

### 5.6 Betroffenenrechte-Matrix (Art. 15–22)

| Art. | Recht | Technische Umsetzung | Kontaktweg |
|------|-------|----------------------|------------|
| 15 | **Auskunft** | Keycloak Account-Console zeigt alle gespeicherten Profildaten; Admin kann vollständigen Export erstellen | E-Mail an Verantwortlichen (lt. Impressum) |
| 16 | **Berichtigung** | Self-Service in Keycloak Account-Console (Name, E-Mail); Nextcloud-Profil; Admin-Korrektur auf Anfrage | Self-Service oder E-Mail |
| 17 | **Löschung** | Admin löscht Keycloak-User → OIDC-Session-Cascade beendet Zugang zu allen Services; Dateien in Nextcloud werden separat gelöscht | E-Mail an Verantwortlichen (lt. Impressum) |
| 18 | **Einschränkung** | Admin deaktiviert Keycloak-User → Zugang gesperrt, Daten erhalten | E-Mail an Verantwortlichen (lt. Impressum) |
| 19 | **Mitteilung an Empfänger** | Admin benachrichtigt bekannte Empfänger (andere Services/Nutzer) bei Berichtigung oder Löschung | E-Mail an Verantwortlichen (lt. Impressum) |
| 20 | **Datenportabilität** | Nextcloud: Dateien über WebDAV/Download exportierbar; Mattermost: Data-Export-API (`/api/v4/compliance/reports`) | Self-Service oder E-Mail |
| 21 | **Widerspruch** | Kontaktformular auf Website oder E-Mail; keine automatisierten Entscheidungen auf Basis der Daten | Kontaktformular Website |
| 22 | **Keine Automatisierung** | Keine automatisierten Einzelentscheidungen mit Rechtswirkung implementiert | Nicht anwendbar |

---

### 5.7 Verarbeitungsverzeichnis (Art. 30)

Vollständiges Verarbeitungsverzeichnis: [`docs/verarbeitungsverzeichnis.md`](verarbeitungsverzeichnis.md)

---

### 5.8 Automatisierte DSGVO-Prüfung

```bash
scripts/dsgvo-compliance-check.sh           # Menschenlesbar (12 Checks D01–D12)
scripts/dsgvo-compliance-check.sh --json    # JSON-Ausgabe für Grafana-Dashboard
task workspace:dsgvo-check                  # Kurzbefehl
```

| Check | Beschreibung |
|-------|-------------|
| D01 | Keine Container-Images von US-Cloud-Anbietern (gcr.io, amazonaws, azurecr) |
| D02 | Keine externen Tracking-Domains auflösbar (google-analytics, sentry.io, telemetry.mattermost) |
| D03 | Alle PersistentVolumes nutzen lokalen Storage (keine Cloud-StorageClasses) |
| D04 | Keycloak Audit-Events aktiviert |
| D05 | Mattermost Audit-Log abrufbar |
| D06 | Keine proprietären Telemetrie-Dienste im Cluster (datadog, newrelic, splunk) |
| D07 | Alle Container-Images sind Open-Source-Projekte |
| D08 | SMTP-Server ist cluster-intern (Mailpit, kein externer Mail-Relay) |
| D09 | TLS-Zertifikat (workspace-wildcard-tls) vorhanden (Art. 32) |
| D10 | Passwortrichtlinie in Keycloak-Realm konfiguriert (Art. 32) |
| D11 | Backup-CronJob aktiv (Art. 32 — Datenverfügbarkeit) |
| D12 | NetworkPolicy Default-Deny-Ingress aktiv (Art. 32 — Netzwerksegmentierung) |

---

## 6. Risikomatrix

| Risiko | W-keit | Auswirkung | Priorität | Status |
|--------|--------|-----------|-----------|--------|
| Unkontrollierter East-West-Traffic | MITTEL | HOCH | KRITISCH | ✓ NetworkPolicies |
| Privilege Escalation im Container | NIEDRIG | HOCH | HOCH | ✓ SecurityContexts |
| Brute-Force auf Keycloak | MITTEL | HOCH | HOCH | ✓ Rate-Limiting + Detection |
| Clickjacking / XSS via fehlende Header | NIEDRIG | MITTEL | MITTEL | ✓ Security-Header |
| Unauthentifizierter Zugriff auf interne Tools | MITTEL | MITTEL | MITTEL | ✓ BasicAuth |
| PostgreSQL ohne TLS intern | NIEDRIG | MITTEL | NIEDRIG | ~ Mitigiert (NetworkPolicies) |
| Physischer Server-Zugang | SEHR NIEDRIG | SEHR HOCH | MITTEL | Doku-Empfehlung |

---

## 7. Implementierte Änderungen

### 7.1 Sicherheitshärtung v1.0 (2026-04-13)

| Datei | Änderung |
|-------|---------|
| `k3d/network-policies.yaml` | Neu: 7 NetworkPolicies workspace |
| `k3d/website.yaml` | Ergänzt: 7 NetworkPolicies website |
| `prod/traefik-middlewares.yaml` | Ergänzt: security-headers, 6× rate-limit, basic-auth |
| `prod/ingress.yaml` | Ersetzt: 11 per-Service-Ingresses |
| `k3d/ingress.yaml` | Aufgeteilt: BasicAuth für Mailpit/Docs/AI |
| `k3d/traefik-middlewares-dev.yaml` | Neu: basic-auth-internal für Dev |
| `k3d/secrets.yaml` | Ergänzt: traefik-basic-auth |
| 13× Deployment-YAMLs | SecurityContexts |
| `docs/verarbeitungsverzeichnis.md` | Neu: Verarbeitungsverzeichnis Art. 30 (6 VTs) |
| `docs/security-report.md` | Erweitert: DSGVO-Kapitel (Art. 5/25/32/33/34/35) |
| `scripts/dsgvo-compliance-check.sh` | Ergänzt: D09–D12 (TLS, Passwort-Policy, Backup, NetworkPolicy) |
| `website/src/pages/datenschutz.astro` | Ersetzt: vollständige Art. 13/14-konforme Datenschutzerklärung |

### 7.2 Finalisierung v1.1 (2026-04-14)

| Datei | Änderung |
|-------|---------|
| `prod/tlsoption.yaml` | Neu: Traefik `TLSOption default` (`minVersion: VersionTLS12`, `sniStrict: true`) |
| `prod/kustomization.yaml` | Ergänzt: `tlsoption.yaml` als Resource |
| `k3d/shared-db.yaml` | Ergänzt: initContainer `generate-tls-cert` (self-signed Cert in `emptyDir`), PG-Args `ssl=on` + `ssl_cert_file` / `ssl_key_file` |
| `k3d/keycloak.yaml` | `KC_DB_URL` um `?sslmode=prefer` erweitert |
| `k3d/vaultwarden.yaml` | `DATABASE_URL` um `?sslmode=prefer` erweitert |
| `k3d/outline.yaml` | `PGSSLMODE=prefer` (vorher `disable`) |
| `k3d/mattermost.yaml` | `MM_SQLSETTINGS_DATASOURCE` auf `sslmode=prefer` (vorher `disable`) |
| `docs/security-report.md` | §3 Verbleibend, §4 Transport-Matrix, §6 Presentation, §7 Änderungen, §9 Fazit + Versionshistorie + Freigabe |
| `docs/superpowers/specs/2026-04-14-security-report-finalization-design.md` | Neu: Design-Spec für diese Finalisierung |

---

## 8. Empfehlungen — Zukünftige Erweiterungen

| Priorität | Maßnahme | Aufwand |
|-----------|---------|---------|
| HOCH | PostgreSQL cert-manager PKI + Client-CA-Verifikation (`sslmode=verify-ca`) | MITTEL |
| HOCH | Nextcloud + Meetings auf `sslmode=prefer` umstellen (Config-Dateien statt Env) | NIEDRIG |
| MITTEL | Cilium mit WireGuard für Pod-to-Pod-TLS (Service Mesh) | HOCH |
| MITTEL | Monitoring-Stack auf korczewski deployen (Prometheus/Grafana) + Default-Deny-Policies im `monitoring`-Namespace | MITTEL |
| MITTEL | OPA Gatekeeper / Kyverno für Policy-Enforcement | MITTEL |
| NIEDRIG | LUKS Full-Disk-Encryption auf Host-Ebene | MITTEL |
| NIEDRIG | SBOM + Image-Vulnerability-Scanning (Trivy) | NIEDRIG |

---

## 9. Fazit, Versionshistorie und Freigabe

### 9.1 Fazit

Der Workspace MVP erreicht nach der zweistufigen Härtung (v1.0 Netzwerk- und Container-Härtung, v1.1 Transport-Layer-Finalisierung) ein durchgängiges Sicherheitsniveau auf allen sieben OSI-Schichten sowie der Kubernetes-Querschnittsebene. Alle in §3 identifizierten kritischen Lücken (East-West-Traffic, Container-Privilegien, unauthentifizierte interne Tools) sind geschlossen; PostgreSQL-Server-TLS und explizite Traefik-TLS-Mindestversion vervollständigen den Transport-Layer. Die DSGVO-Kapitel (Art. 5, 25, 32, 33/34, 35 sowie die vollständige Betroffenenrechte-Matrix Art. 15–22) sind inhaltlich und technisch mit konkreten Nachweisen unterlegt. Die verbleibenden Restrisiken (Nextcloud/Meetings-Client-TLS, cert-manager-PKI, Monitoring-Stack-Deployment, physische Server-Absicherung) sind dokumentiert, priorisiert und in §8 als geplante Erweiterungen ausgewiesen. **Gesamtbewertung: HOCH.**

### 9.2 Versionshistorie

| Version | Datum | Änderungen |
|---------|-------|-----------|
| 1.0 | 2026-04-13 | Erstveröffentlichung. OSI-Schichtanalyse L1–L7, Kubernetes-Querschnitt, DSGVO Art. 5/25/32/33/34/35, Risikomatrix, Änderungs- und Empfehlungsliste. |
| 1.1 | 2026-04-14 | PostgreSQL-Server-TLS (self-signed, opportunistisch), Traefik `TLSOption default` mit expliziter `minVersion: VersionTLS12`, Client-`sslmode=prefer` für Keycloak/Mattermost/Vaultwarden/Outline, Korrektur §3 (Monitoring-Namespace), neues Kapitel §9 (Fazit, Versionshistorie, Freigabe). Gesamtbewertung von HOCH bestätigt. |

### 9.3 Freigabe

| Rolle | Name | Datum | Unterschrift |
|-------|------|-------|--------------|
| Verantwortlicher (lt. Impressum) |   |   |   |
| Technische Umsetzung (DevOps) |   |   |   |
| Datenschutzkoordination |   |   |   |

*Dieser Bericht dient als Nachweis der technischen und organisatorischen Maßnahmen gemäß Art. 32 DSGVO und ergänzt das Verarbeitungsverzeichnis (`docs/verarbeitungsverzeichnis.md`).*
