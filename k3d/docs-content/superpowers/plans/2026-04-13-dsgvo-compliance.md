# DSGVO-Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vollständige DSGVO-Compliance für Workspace MVP — Security Report um alle DSGVO-Artikel erweitern, Verarbeitungsverzeichnis erstellen, Compliance-Script um 4 neue Checks erweitern, Datenschutzerklärung auf der Website vollständig überarbeiten.

**Architecture:** Vier unabhängige Dateien werden bearbeitet. Security Report erhält ein komplett neues Kapitel 5 (DSGVO) mit Art. 5/25/32/33/34/35-Mapping + Betroffenenrechte-Matrix + VVT-Verweis. `docs/verarbeitungsverzeichnis.md` wird neu erstellt (Art. 30). Das Compliance-Script erhält 4 neue Checks (D09–D12). Die Datenschutzerklärung wird von Platzhalter auf Art. 13/14-konforme Vollversion überarbeitet und verwendet das gleiche `config`-Muster wie AGB/Impressum.

**Tech Stack:** Bash (dsgvo-compliance-check.sh), Markdown (security report, VVT), Astro/JSX (datenschutz.astro), TypeScript config pattern (website config).

**Branch:** `feature/security-hardening` (bereits vorhanden — alle Änderungen kommen auf diesen Branch)

---

## File Map

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `scripts/dsgvo-compliance-check.sh` | Modify (Zeilen 161–163) | Neue Checks D09–D12 zwischen D08 und Summary einfügen |
| `docs/security-report.md` | Modify (Zeilen 263–278) | Abschnitt 5 vollständig ersetzen |
| `docs/verarbeitungsverzeichnis.md` | Create | Neues Art.-30-Dokument |
| `website/src/pages/datenschutz.astro` | Modify (komplett) | Vollständige Überarbeitung |

---

## Task 1: DSGVO-Compliance-Script — Checks D09–D12

**Files:**
- Modify: `scripts/dsgvo-compliance-check.sh:161-163`

- [ ] **Step 1: Lese aktuelle Datei-Struktur**

Öffne `scripts/dsgvo-compliance-check.sh`. Suche nach dem Abschnitt direkt nach D08 (Ende bei `fi` nach Zeile ~161) und vor dem `# ── Summary` Kommentar (Zeile ~163). Dort werden die neuen Checks eingefügt.

- [ ] **Step 2: Füge Checks D09–D12 ein**

Füge folgenden Block zwischen dem schließenden `fi` von D08 und dem `# ── Summary` Kommentar ein:

```bash
# ── Check 9: TLS-Zertifikat vorhanden (Art. 32) ──────────────────
echo "▸ Prüfe TLS-Zertifikat..."
TLS_SECRET=$(kubectl get secret workspace-wildcard-tls -n "$NAMESPACE" \
  --no-headers 2>/dev/null | wc -l | tr -d ' ' || echo "0")
if [[ "$TLS_SECRET" -gt 0 ]]; then
  _check "D09" "TLS-Zertifikat (workspace-wildcard-tls) vorhanden" "pass"
else
  _check "D09" "TLS-Zertifikat (workspace-wildcard-tls) vorhanden" "warn" \
    "Secret nicht gefunden (normal in Dev ohne cert-manager)"
fi

# ── Check 10: Passwortrichtlinie in Keycloak (Art. 32) ───────────
echo "▸ Prüfe Passwortrichtlinie..."
if [[ -n "$KC_TOKEN" ]]; then
  PWD_POLICY=$(kubectl exec -n "$NAMESPACE" deploy/keycloak -c keycloak -- \
    curl -s -H "Authorization: Bearer ${KC_TOKEN}" \
    "http://localhost:8080/admin/realms/workspace" 2>/dev/null \
    | jq -r '.passwordPolicy // empty' 2>/dev/null || echo "")
  if [[ -n "$PWD_POLICY" ]]; then
    _check "D10" "Passwortrichtlinie in Keycloak-Realm konfiguriert" "pass" \
      "Policy: ${PWD_POLICY}"
  else
    _check "D10" "Passwortrichtlinie in Keycloak-Realm konfiguriert" "warn" \
      "passwordPolicy ist leer"
  fi
else
  _check "D10" "Passwortrichtlinie in Keycloak-Realm konfiguriert" "warn" \
    "Keycloak-Token nicht verfügbar (siehe D04)"
fi

# ── Check 11: Backup-CronJob aktiv (Art. 32 — Verfügbarkeit) ─────
echo "▸ Prüfe Backup-CronJob..."
BACKUP_JOB=$(kubectl get cronjob -n "$NAMESPACE" --no-headers 2>/dev/null \
  | grep -c "backup" || echo "0")
if [[ "$BACKUP_JOB" -gt 0 ]]; then
  _check "D11" "Backup-CronJob aktiv (Art. 32 — Datenverfügbarkeit)" "pass"
else
  _check "D11" "Backup-CronJob aktiv (Art. 32 — Datenverfügbarkeit)" "fail" \
    "Kein Backup-CronJob im Namespace ${NAMESPACE} gefunden"
fi

# ── Check 12: NetworkPolicy Default-Deny aktiv (Art. 32) ─────────
echo "▸ Prüfe NetworkPolicy Default-Deny..."
NP_DENY=$(kubectl get networkpolicy default-deny-ingress -n "$NAMESPACE" \
  --no-headers 2>/dev/null | wc -l | tr -d ' ' || echo "0")
if [[ "$NP_DENY" -gt 0 ]]; then
  _check "D12" "NetworkPolicy Default-Deny-Ingress aktiv (Art. 32 — Netzwerksegmentierung)" "pass"
else
  _check "D12" "NetworkPolicy Default-Deny-Ingress aktiv (Art. 32 — Netzwerksegmentierung)" "fail" \
    "NetworkPolicy 'default-deny-ingress' fehlt in Namespace ${NAMESPACE}"
fi
```

- [ ] **Step 3: Aktualisiere Header-Kommentar**

Ändere im Kommentarblock oben (Zeilen 8–14) die Zeile `#   5. Audit logging enabled across services` und füge darunter hinzu:

```bash
#   9. TLS certificate present
#  10. Password policy configured in Keycloak
#  11. Backup CronJob active
#  12. NetworkPolicy Default-Deny active
```

- [ ] **Step 4: Prüfe Syntax**

```bash
bash -n scripts/dsgvo-compliance-check.sh
```

Erwartete Ausgabe: keine Fehler (kein Output = OK)

- [ ] **Step 5: Commit**

```bash
git add scripts/dsgvo-compliance-check.sh
git commit -m "feat(dsgvo): add compliance checks D09-D12 (TLS, password policy, backup, network)"
```

---

## Task 2: Security Report — Vollständiges DSGVO-Kapitel

**Files:**
- Modify: `docs/security-report.md:263-278`

- [ ] **Step 1: Ersetze Abschnitt 5 komplett**

Ersetze den gesamten Block von `## 5. DSGVO / Compliance-Status` bis (nicht einschließlich) `## 6. Risikomatrix` mit folgendem Inhalt:

```markdown
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
- Wenn **kein Risiko** für Betroffene: interne Dokumentation ausreichend (Art. 33 Abs. 1 Satz 2)
- Wenn **Risiko** besteht: Meldung an zuständige Aufsichtsbehörde innerhalb 72 Stunden

**Stufe 3 — Meldung (sofern erforderlich):**
- Meldung an Datenschutz-Aufsichtsbehörde (Art. 33): Name/Kontakt des Verantwortlichen, Art der Panne, betroffene Datenkategorien, Anzahl betroffene Personen, voraussichtliche Folgen, ergriffene Maßnahmen
- Benachrichtigung der Betroffenen (Art. 34): wenn voraussichtlich **hohes Risiko** für persönliche Rechte

**Kontaktpunkt:** `CONTACT_EMAIL` (Verantwortlicher lt. Impressum)

---

### 5.5 Art. 35 — Datenschutz-Folgenabschätzung (DPIA)

**Schwellwert-Prüfung nach Art. 35 Abs. 3 DSGVO:**

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
| 15 | **Auskunft** | Keycloak Account-Console zeigt alle gespeicherten Profildaten; Admin kann vollständigen Export erstellen | E-Mail an `CONTACT_EMAIL` |
| 16 | **Berichtigung** | Self-Service in Keycloak Account-Console (Name, E-Mail); Nextcloud-Profil; Admin-Korrektur auf Anfrage | Self-Service oder E-Mail |
| 17 | **Löschung** | Admin löscht Keycloak-User → OIDC-Session-Cascade beendet Zugang zu allen Services; Dateien in Nextcloud werden separat gelöscht | E-Mail an `CONTACT_EMAIL` |
| 18 | **Einschränkung** | Admin deaktiviert Keycloak-User → Zugang gesperrt, Daten erhalten | E-Mail an `CONTACT_EMAIL` |
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

```

- [ ] **Step 2: Verifikation**

```bash
grep -n "## 5\." docs/security-report.md
```

Erwartete Ausgabe:
```
263:## 5. DSGVO / Compliance-Status
```

```bash
grep -n "### 5\." docs/security-report.md
```

Erwartete Ausgabe sollte 8 Treffer zeigen (5.1 bis 5.8).

- [ ] **Step 3: Commit**

```bash
git add docs/security-report.md
git commit -m "docs(security): expand DSGVO section with Art. 5/25/32/33/34/35 mapping and TOMs"
```

---

## Task 3: Verarbeitungsverzeichnis (Art. 30)

**Files:**
- Create: `docs/verarbeitungsverzeichnis.md`

- [ ] **Step 1: Erstelle Verarbeitungsverzeichnis**

Erstelle `docs/verarbeitungsverzeichnis.md` mit folgendem Inhalt:

````markdown
# Verarbeitungsverzeichnis (Art. 30 DSGVO)

**Verantwortlicher:** Gemäß Impressum (`/impressum`)  
**Letzte Aktualisierung:** 2026-04-13  
**Plattform:** Workspace MVP — selbst-gehostete Kollaborationsplattform (On-Premises)

> Dieses Verzeichnis wird geführt gemäß Art. 30 Abs. 1 DSGVO. Es dokumentiert alle Verarbeitungstätigkeiten, bei denen personenbezogene Daten verarbeitet werden.

---

## VT-01: Nutzer-Authentifizierung

| Feld | Wert |
|------|------|
| **Zweck** | Identifikation und Zugriffskontrolle für die Plattform |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung / vorvertragliche Maßnahmen) |
| **Betroffene Personen** | Registrierte Nutzer der Plattform |
| **Datenkategorien** | Name, E-Mail-Adresse, Passwort-Hash (PBKDF2-SHA512), Rollen/Berechtigungen, letzte Anmeldezeit |
| **Empfänger** | Keine Dritten — On-Premises-Verarbeitung (Keycloak im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Bis zur Löschung des Nutzerkontos (Art. 17-Anfrage oder Admin-Aktion) |
| **Technische Schutzmaßnahmen** | TLS in Transit, PBKDF2-SHA512 Passwort-Hashing, OIDC-Token (kurzlebig), Brute-Force-Detection, Rate-Limiting |

---

## VT-02: Teamkommunikation (Chat)

| Feld | Wert |
|------|------|
| **Zweck** | Interne Kommunikation zwischen Teammitgliedern |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene Personen** | Nutzer der Mattermost-Instanz |
| **Datenkategorien** | Nachrichteninhalte, Zeitstempel, Absender-User-ID, Kanal-Zugehörigkeit, Anhänge |
| **Empfänger** | Keine Dritten — On-Premises (Mattermost im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Konfigurierbar (Standard: unbegrenzt); auf Anfrage (Art. 17) löschbar |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO, NetworkPolicy-Isolation, Audit-Log `/api/v4/audits` |

---

## VT-03: Dateiablage und Dokumentenverwaltung

| Feld | Wert |
|------|------|
| **Zweck** | Speicherung und gemeinsame Bearbeitung von Dateien und Dokumenten |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene Personen** | Nutzer der Nextcloud-Instanz |
| **Datenkategorien** | Dateien (beliebige Inhalte), Dateinamen, Metadaten (Erstellungs-/Änderungsdatum, Eigentümer-ID), Freigabe-Links |
| **Empfänger** | Keine Dritten — On-Premises (Nextcloud im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Bis zur Löschung durch den Nutzer oder Administrator |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO, Nextcloud-Berechtigungssystem (Owner/Share), PVC-lokaler Storage |

---

## VT-04: Terminbuchung

| Feld | Wert |
|------|------|
| **Zweck** | Entgegennahme und Verwaltung von Buchungsanfragen für Dienstleistungen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Durchführung vorvertraglicher Maßnahmen) |
| **Betroffene Personen** | Interessenten und Auftraggeber (Website-Besucher) |
| **Datenkategorien** | Name, E-Mail-Adresse, gewählter Termin/Zeitslot, optionale Nachricht |
| **Empfänger** | Keine Dritten — Weiterleitung intern via Mattermost-Webhook; CalDAV-Eintrag in Nextcloud |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | 3 Jahre (handelsrechtliche Aufbewahrungsfrist für vorvertragliche Korrespondenz) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Mattermost-Webhook nur intern erreichbar (NetworkPolicy), keine externe Weitergabe |

---

## VT-05: Rechnungsstellung und Buchführung

| Feld | Wert |
|------|------|
| **Zweck** | Erstellung, Verwaltung und Archivierung von Rechnungen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung: § 238 HGB, § 14 UStG) |
| **Betroffene Personen** | Auftraggeber (Rechnungsempfänger) |
| **Datenkategorien** | Name, Unternehmensname, Rechnungsadresse, E-Mail, Leistungsbeschreibung, Beträge, Rechnungsnummer, Datum |
| **Empfänger** | Keine Dritten — On-Premises (Invoice Ninja im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | 10 Jahre (§ 257 HGB — gesetzliche Aufbewahrungspflicht für Buchungsbelege) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO + OAuth2-Proxy, Rate-Limiting (30 req/s), NetworkPolicy-Isolation |

---

## VT-06: Kontaktformular

| Feld | Wert |
|------|------|
| **Zweck** | Bearbeitung von Anfragen über das Website-Kontaktformular |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen), hilfsweise Art. 6 Abs. 1 lit. f (berechtigtes Interesse an Anfragenbearbeitung) |
| **Betroffene Personen** | Website-Besucher, die das Kontaktformular nutzen |
| **Datenkategorien** | Name, E-Mail-Adresse, Nachrichteninhalt |
| **Empfänger** | Keine Dritten — Weiterleitung intern via Mattermost-Webhook in den Kanal `anfragen` |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | 3 Jahre (Verjährungsfrist für Ansprüche aus vorvertraglichen Verhältnissen, § 195 BGB) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Mattermost-Webhook nur intern erreichbar, keine Speicherung in externer Datenbank |

---

## Keine Drittlandübermittlung

Es findet **keine Übermittlung personenbezogener Daten in Drittländer** (außerhalb der EU/EWR) statt. Die gesamte Plattform wird vollständig on-premises betrieben. Alle Komponenten sind Open-Source-Software, die ohne externe Datenübertragung betrieben wird.

## Auftragsverarbeiter

Keine Auftragsverarbeiter (Art. 28 DSGVO) — die Verarbeitung erfolgt vollständig durch den Verantwortlichen selbst auf eigener Infrastruktur.
````

- [ ] **Step 2: Verifikation**

```bash
grep -c "^## VT-" docs/verarbeitungsverzeichnis.md
```

Erwartete Ausgabe: `6`

- [ ] **Step 3: Commit**

```bash
git add docs/verarbeitungsverzeichnis.md
git commit -m "docs(dsgvo): add Verarbeitungsverzeichnis Art. 30 with 6 processing activities"
```

---

## Task 4: Datenschutzerklärung — Vollständige Überarbeitung

**Files:**
- Modify: `website/src/pages/datenschutz.astro` (kompletter Ersatz)

**Kontext:** Die aktuelle Datei hat einen "Platzhalter"-Hinweis und ist Art. 13-unvollständig. Sie wird vollständig durch eine konforme Version ersetzt. Muster-Pattern: `website/src/pages/agb.astro` — verwendet `import { config } from '../config/index'` und `const { contact, legal } = config;` um Kontaktdaten zu injizieren.

- [ ] **Step 1: Ersetze datenschutz.astro vollständig**

```astro
---
import Layout from '../layouts/Layout.astro';
import { config } from '../config/index';

const { contact, legal } = config;
---

<Layout title="Datenschutzerklärung">
  <section class="pt-28 pb-20">
    <div class="max-w-3xl mx-auto px-6 prose prose-lg prose-slate">
      <h1>Datenschutzerklärung</h1>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:
      </p>
      <p>
        <strong>{contact.name}</strong><br />
        {legal.tagline}<br />
        {contact.city}<br />
        E-Mail: <a href={`mailto:${contact.email}`}>{contact.email}</a><br />
        {contact.phone && <>Telefon: {contact.phone}</>}
      </p>

      <h2>2. Grundsätze der Datenverarbeitung</h2>
      <p>
        Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung
        unserer Dienste erforderlich ist. Alle Daten verbleiben vollständig auf
        eigener Infrastruktur (On-Premises). Es findet keine Übermittlung an
        Cloud-Anbieter oder Dritte statt.
      </p>
      <p>
        Rechtsgrundlagen der Verarbeitung: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung
        und vorvertragliche Maßnahmen), Art. 6 Abs. 1 lit. c DSGVO (gesetzliche
        Verpflichtung), Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen).
      </p>

      <h2>3. Datenerfassung auf dieser Website</h2>

      <h3>Server-Log-Dateien</h3>
      <p>
        Beim Aufruf dieser Website werden automatisch technische Zugriffsdaten
        erfasst: IP-Adresse, Browsertyp, Betriebssystem, Referrer-URL, aufgerufene
        Seite, Zeitpunkt des Zugriffs. Diese Daten werden ausschließlich zur
        technischen Bereitstellung der Website benötigt und nach 7 Tagen automatisch
        gelöscht. Eine Zuordnung zu bestimmten Personen ist nicht beabsichtigt.
      </p>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am
        sicheren Betrieb der Website).
      </p>

      <h3>Cookies</h3>
      <p>
        Diese Website verwendet ausschließlich technisch notwendige Cookies. Es
        werden keine Tracking-, Analyse- oder Werbe-Cookies eingesetzt. Technisch
        notwendige Cookies erfordern keine Einwilligung (§ 25 Abs. 2 TTDSG).
      </p>

      <table>
        <thead>
          <tr>
            <th>Cookie / Storage-Eintrag</th>
            <th>Zweck</th>
            <th>Speicherdauer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>session</code></td>
            <td>Authentifizierung und Sitzungsverwaltung</td>
            <td>Sitzungsende</td>
          </tr>
          <tr>
            <td><code>KEYCLOAK_*</code></td>
            <td>Single Sign-On Session (Keycloak OIDC)</td>
            <td>Sitzungsende</td>
          </tr>
          <tr>
            <td><code>cookie_consent_v1</code> (localStorage)</td>
            <td>Speichert Cookie-Einwilligung lokal im Browser</td>
            <td>Bis zur manuellen Löschung (wird nicht an Server übertragen)</td>
          </tr>
        </tbody>
      </table>

      <h3>Kontaktformular</h3>
      <p>
        Wenn Sie das Kontaktformular nutzen, werden Ihr Name, Ihre E-Mail-Adresse
        und der Nachrichteninhalt verarbeitet, um Ihre Anfrage zu bearbeiten.
        Die Daten werden intern über einen verschlüsselten Kanal weitergeleitet
        und nicht an Dritte weitergegeben.
      </p>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Speicherdauer: 3 Jahre.
      </p>

      <h3>Terminbuchung</h3>
      <p>
        Bei der Buchung eines Termins werden Name, E-Mail-Adresse und der gewählte
        Zeitslot verarbeitet. Die Daten werden ausschließlich zur Terminorganisation
        genutzt und auf eigener Infrastruktur gespeichert.
      </p>
      <p>
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen).
        Speicherdauer: 3 Jahre.
      </p>

      <h3>Hosting</h3>
      <p>
        Diese Website wird vollständig auf eigener Infrastruktur (On-Premises)
        betrieben. Es werden keine Hosting-Dienste von Drittanbietern (AWS, Azure,
        Google Cloud o. Ä.) genutzt. Es findet keine Übermittlung personenbezogener
        Daten in Drittländer statt.
      </p>

      <h2>4. Ihre Rechte als betroffene Person</h2>
      <p>
        Sie haben nach der DSGVO folgende Rechte gegenüber uns als Verantwortlichem:
      </p>

      <table>
        <thead>
          <tr>
            <th>Recht</th>
            <th>Rechtsgrundlage</th>
            <th>Beschreibung</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Auskunft</strong></td>
            <td>Art. 15 DSGVO</td>
            <td>Sie können Auskunft über die von uns verarbeiteten personenbezogenen Daten verlangen.</td>
          </tr>
          <tr>
            <td><strong>Berichtigung</strong></td>
            <td>Art. 16 DSGVO</td>
            <td>Sie können die Berichtigung unrichtiger Daten verlangen.</td>
          </tr>
          <tr>
            <td><strong>Löschung</strong></td>
            <td>Art. 17 DSGVO</td>
            <td>Sie können die Löschung Ihrer Daten verlangen, sofern keine gesetzliche Aufbewahrungspflicht besteht.</td>
          </tr>
          <tr>
            <td><strong>Einschränkung</strong></td>
            <td>Art. 18 DSGVO</td>
            <td>Sie können die Einschränkung der Verarbeitung Ihrer Daten verlangen.</td>
          </tr>
          <tr>
            <td><strong>Datenportabilität</strong></td>
            <td>Art. 20 DSGVO</td>
            <td>Sie können Ihre Daten in einem strukturierten, maschinenlesbaren Format erhalten.</td>
          </tr>
          <tr>
            <td><strong>Widerspruch</strong></td>
            <td>Art. 21 DSGVO</td>
            <td>Sie können der Verarbeitung Ihrer Daten auf Basis von Art. 6 Abs. 1 lit. f DSGVO widersprechen.</td>
          </tr>
          <tr>
            <td><strong>Widerruf</strong></td>
            <td>Art. 7 Abs. 3 DSGVO</td>
            <td>Erteilte Einwilligungen können Sie jederzeit mit Wirkung für die Zukunft widerrufen.</td>
          </tr>
        </tbody>
      </table>

      <p>
        Zur Ausübung Ihrer Rechte wenden Sie sich bitte per E-Mail an:{' '}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </p>

      <h2>5. Keine automatisierten Entscheidungen</h2>
      <p>
        Es finden keine automatisierten Entscheidungen im Sinne von Art. 22 DSGVO
        statt. Es wird kein Profiling betrieben.
      </p>

      <h2>6. Beschwerderecht bei der Aufsichtsbehörde</h2>
      <p>
        Sie haben das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde
        zu beschweren. Die zuständige Behörde richtet sich nach Ihrem Wohnort bzw.
        dem Sitz des Verantwortlichen. Eine Liste der Datenschutzbehörden in
        Deutschland finden Sie auf der Website der Bundesbeauftragten für den
        Datenschutz und die Informationsfreiheit (BfDI):
        <a href="https://www.bfdi.bund.de" target="_blank" rel="noopener noreferrer">www.bfdi.bund.de</a>.
      </p>

      <h2>7. Aktualität dieser Erklärung</h2>
      <p class="text-sm text-slate-500 mt-8">
        Stand: April 2026. Diese Datenschutzerklärung wird bei Änderungen der
        Verarbeitungstätigkeiten oder der Rechtslage aktualisiert.
      </p>
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Verifikation — kein Platzhalter-Hinweis mehr**

```bash
grep -i "platzhalter\|rechtsanwalt\|angepasst werden" website/src/pages/datenschutz.astro
```

Erwartete Ausgabe: *kein Output* (keine Treffer)

- [ ] **Step 3: Verifikation — alle DSGVO-Artikel vorhanden**

```bash
grep -o "Art\. [0-9]\+" website/src/pages/datenschutz.astro | sort -u
```

Erwartete Ausgabe enthält mindestens: `Art. 6`, `Art. 7`, `Art. 15`, `Art. 16`, `Art. 17`, `Art. 18`, `Art. 20`, `Art. 21`, `Art. 22`

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/datenschutz.astro
git commit -m "feat(website): overhaul Datenschutzerklärung — Art. 13/14 compliant, no placeholder"
```

---

## Task 5: Sidebar + Security Report — Datei-Verweise aktualisieren

**Files:**
- Modify: `docs/_sidebar.md`
- Modify: `docs/security-report.md` (Abschnitt 7 Implementierte Änderungen)

- [ ] **Step 1: Füge Verarbeitungsverzeichnis zur Sidebar hinzu**

Lies `docs/_sidebar.md`. Suche nach dem Eintrag für `security.md` oder `security-report.md` und füge darunter einen Eintrag für das Verarbeitungsverzeichnis ein:

```markdown
  - [Verarbeitungsverzeichnis (Art. 30)](verarbeitungsverzeichnis.md)
```

- [ ] **Step 2: Aktualisiere Abschnitt 7 im Security Report**

Im Security Report in Abschnitt 7 (Implementierte Änderungen), füge folgende Zeilen zur Tabelle hinzu:

```markdown
| `docs/verarbeitungsverzeichnis.md` | Neu: Verarbeitungsverzeichnis Art. 30 (6 VTs) |
| `docs/security-report.md` | Erweitert: DSGVO-Kapitel (Art. 5/25/32/33/34/35) |
| `scripts/dsgvo-compliance-check.sh` | Ergänzt: D09–D12 (TLS, Passwort-Policy, Backup, NetworkPolicy) |
| `website/src/pages/datenschutz.astro` | Ersetzt: vollständige Art. 13/14-konforme Datenschutzerklärung |
```

- [ ] **Step 3: Commit**

```bash
git add docs/_sidebar.md docs/security-report.md
git commit -m "docs: add VVT to sidebar, update security report change log"
```

---

## Selbst-Review

**Spec-Coverage:**
- ✅ Art. 5 Grundsätze → Task 2 Abschnitt 5.1
- ✅ Art. 25 Privacy by Design → Task 2 Abschnitt 5.2
- ✅ Art. 32 TOMs → Task 2 Abschnitt 5.3
- ✅ Art. 33/34 Meldeverfahren → Task 2 Abschnitt 5.4
- ✅ Art. 35 DPIA → Task 2 Abschnitt 5.5
- ✅ Betroffenenrechte Art. 15–22 → Task 2 Abschnitt 5.6
- ✅ Verarbeitungsverzeichnis Art. 30 → Task 3
- ✅ Compliance-Script D09–D12 → Task 1
- ✅ Datenschutzerklärung Art. 13/14 → Task 4

**Placeholder-Scan:** Keine TBD/TODO/Platzhalter-Muster gefunden.

**Konsistenz:** Alle Art.-Nummern konsistent. VVT-Dateiname `verarbeitungsverzeichnis.md` konsistent in allen Tasks. `feature/security-hardening` Branch wird konsistent verwendet.
