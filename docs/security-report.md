# Sicherheitsbericht — Workspace MVP

**Version:** 1.0
**Datum:** 2026-04-13
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

**Verbleibend:** PostgreSQL intern ohne TLS — mitigiert durch NetworkPolicy-Isolation. Monitoring-Namespace ohne eigene Policies (Helm-verwaltet).

---

### Schicht 4 — Transport (Transport)

**Relevante Komponenten:** TLS (Traefik/cert-manager), PostgreSQL-Verbindungen, coturn/TURN.

**Verbindungsmatrix:**

| Verbindung | Protokoll | Status |
|-----------|-----------|--------|
| Extern → Traefik | TLS 1.2/1.3 | ✓ Let's Encrypt Wildcard |
| Traefik → Services (intern) | HTTP | Akzeptabel (gleiches Namespace, NetworkPolicies) |
| Services → PostgreSQL | TCP (sslmode=disable) | Mitigiert durch NetworkPolicies |
| TURN-Verbindungen (coturn) | TLS | ✓ |
| Mattermost WebSocket extern | WSS (TLS) | ✓ |

**Implementierte Maßnahmen:**
- TLS-Terminierung an Traefik mit automatischer Zertifikatserneuerung (cert-manager, DNS-01)
- HSTS `max-age=31536000; includeSubDomains`
- HTTP → HTTPS Redirect (301 Permanent)
- Let's Encrypt ACME v2

**Risiko:** NIEDRIG extern, NIEDRIG intern (mitigiert durch L3-Policies).

**Zukünftige Erweiterung:** PostgreSQL-TLS intern via cert-manager.

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

**Risiko:** NIEDRIG.

**Empfehlung:** `minVersion: VersionTLS12` explizit in Traefik-Config setzen.

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

| ID | Prüfung | Status |
|----|---------|--------|
| D01 | Keine US-Cloud-Registry-Images | ✓ |
| D02 | Keine externen Tracking-Domains | ✓ |
| D03 | Lokaler Storage (keine Cloud-Klassen) | ✓ |
| D04 | Keycloak Audit Events aktiviert | ✓ |
| D05 | Mattermost Audit-Log erreichbar | ✓ |
| D06 | Keine proprietäre Telemetrie | ✓ |
| D07 | Alle Images Open-Source | ✓ |
| D08 | SMTP intern (Mailpit) | ✓ |

**Backup-Verschlüsselung:** AES-256-CBC + PBKDF2, täglich 02:00 UTC, 30-Tage-Retention.

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

---

## 8. Empfehlungen — Zukünftige Erweiterungen

| Priorität | Maßnahme | Aufwand |
|-----------|---------|---------|
| HOCH | PostgreSQL-TLS intern (cert-manager) | MITTEL |
| HOCH | TLS minVersion: VersionTLS12 explizit in Traefik | NIEDRIG |
| MITTEL | Cilium mit WireGuard für Pod-to-Pod-TLS (Service Mesh) | HOCH |
| MITTEL | Monitoring-Namespace NetworkPolicies | NIEDRIG |
| MITTEL | OPA Gatekeeper / Kyverno für Policy-Enforcement | MITTEL |
| NIEDRIG | LUKS Full-Disk-Encryption auf Host-Ebene | MITTEL |
| NIEDRIG | SBOM + Image-Vulnerability-Scanning (Trivy) | NIEDRIG |
