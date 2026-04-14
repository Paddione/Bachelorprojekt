# DSGVO-Compliance — Design Spec

**Datum:** 2026-04-13  
**Branch:** feature/agb (bestehend, wird erweitert)  
**Ziel:** Vollständige DSGVO-Compliance für Workspace MVP — sowohl akademisch (Bachelorarbeit) als auch rechtlich produktiv (korczewski.de).

---

## 1. Scope

Vier Arbeitspakete:

| # | Datei | Art der Änderung |
|---|-------|-----------------|
| 1 | `docs/security-report.md` | Abschnitt 5 zu vollem DSGVO-Kapitel erweitern |
| 2 | `docs/verarbeitungsverzeichnis.md` | Neues Dokument (Art. 30 DSGVO) |
| 3 | `scripts/dsgvo-compliance-check.sh` | 4 neue Checks D09–D12 |
| 4 | `website/src/pages/datenschutz.astro` | Vollständige Überarbeitung (Art. 13/14-konform) |

---

## 2. Security Report — DSGVO-Kapitel (Abschnitt 5)

Abschnitt 5 wird vollständig ersetzt. Struktur:

### 5.1 Art. 5 — Verarbeitungsgrundsätze

Sieben Grundsätze mit konkretem Stack-Nachweis je Grundsatz:
- Rechtmäßigkeit / Zweckbindung / Datenminimierung / Richtigkeit / Speicherbegrenzung / Integrität+Vertraulichkeit / Rechenschaftspflicht

### 5.2 Art. 25 — Privacy by Design / by Default

Nachweis über on-premises-Architektur, NetworkPolicies, minimale Container-Permissions, kein Tracking.

### 5.3 Art. 32 — Technische und Organisatorische Maßnahmen (TOMs)

Vollständige Tabelle aller implementierten Maßnahmen:

| Maßnahme | Kategorie | Umsetzung |
|----------|-----------|-----------|
| Verschlüsselung in Transit | Technisch | TLS 1.2/1.3, HSTS, Let's Encrypt Wildcard |
| Verschlüsselung at Rest | Technisch | AES-256-CBC Backup-Encryption (PBKDF2) |
| Zugriffskontrolle | Technisch | Keycloak OIDC SSO, RBAC, BasicAuth interne Tools |
| Netzwerksegmentierung | Technisch | NetworkPolicies Default-Deny (workspace + website NS) |
| Container-Isolation | Technisch | SecurityContexts: no-root, seccomp, capabilities drop ALL |
| Pseudonymisierung | Technisch | Keycloak User-IDs statt Klarnamen in Service-Logs |
| Audit-Logging | Technisch | Keycloak Audit Events, Mattermost /api/v4/audits |
| Backup & Recovery | Organisatorisch | Täglich 02:00 UTC, 30-Tage-Retention, verschlüsselt |
| Passwort-Policy | Organisatorisch | ≥12 Zeichen, Groß/Klein/Ziffer/Sonderzeichen, PBKDF2-SHA512 |
| Least Privilege | Organisatorisch | Claude Code RBAC: read-only, kein Secrets-Zugriff |
| Brute-Force-Schutz | Technisch | Keycloak Detection + Traefik Rate-Limiting |
| Pod Security Standards | Technisch | baseline enforced, restricted warned |

### 5.4 Art. 33/34 — Meldepflicht bei Datenpannen

Dokumentierter 3-Stufen-Ablauf:
1. **Erkennung** — Monitoring-Alert / manuell
2. **Bewertung** (≤72h) — Risikobewertung intern, Dokumentation
3. **Meldung** — An Aufsichtsbehörde (wenn Risiko für Betroffene); Benachrichtigung Betroffener (wenn hohes Risiko)

Kontaktpunkt: `${CONTACT_EMAIL}`.

### 5.5 Art. 35 — DPIA (Datenschutz-Folgenabschätzung)

Schwellwert-Check nach Art. 35 Abs. 3:
- Keine systematische Überwachung öffentlicher Bereiche
- Keine sensitiven Datenkategorien (Art. 9)
- Kein Profiling mit Rechtswirkung
- Weniger als 50 aktive Nutzer
- **Ergebnis: DPIA nicht zwingend erforderlich**

Vorsorglich: Mini-DPIA-Dokumentation (Zweck, Notwendigkeit, Verhältnismäßigkeit, Risiken, Maßnahmen).

### 5.6 Betroffenenrechte-Matrix (Art. 15–22)

| Art. | Recht | Technische Umsetzung |
|------|-------|----------------------|
| 15 | Auskunft | Keycloak Account-Console, Admin-Export |
| 16 | Berichtigung | Self-Service Keycloak + Nextcloud Profil |
| 17 | Löschung | Admin löscht Keycloak-User → OIDC-Cascade alle Services |
| 18 | Einschränkung der Verarbeitung | Keycloak User deaktivieren |
| 20 | Datenportabilität | Nextcloud-Export, Mattermost Data-Export-API |
| 21 | Widerspruch | Kontaktformular Website |
| 22 | Keine automatisierte Entscheidung | Keine automatisierten Einzelentscheidungen implementiert |

### 5.7 Verarbeitungsverzeichnis (Art. 30) — Verweis

Vollständiges Verarbeitungsverzeichnis: `docs/verarbeitungsverzeichnis.md`

### 5.8 Automatisierte DSGVO-Prüfung

Verweis auf `scripts/dsgvo-compliance-check.sh` (jetzt 12 Checks D01–D12).

---

## 3. Verarbeitungsverzeichnis (`docs/verarbeitungsverzeichnis.md`)

Art. 30 DSGVO: Verantwortlicher muss Verzeichnis aller Verarbeitungstätigkeiten führen.

### Struktur je Eintrag

- Nr., Name der Tätigkeit
- Zweck der Verarbeitung
- Rechtsgrundlage (Art. 6 DSGVO)
- Kategorien betroffener Personen
- Kategorien personenbezogener Daten
- Empfänger (intern: on-premises, keine Dritten)
- Drittlandübermittlung: keine
- Speicherdauer / Löschfristen
- Technische Schutzmaßnahmen (Verweis auf TOMs Art. 32)

### 6 Verarbeitungstätigkeiten

| VT | Tätigkeit | Rechtsgrundlage | Speicherdauer |
|----|-----------|-----------------|---------------|
| VT-01 | Nutzer-Authentifizierung (Keycloak) | Art. 6 I b | Bis Kontolöschung |
| VT-02 | Teamkommunikation (Mattermost) | Art. 6 I b | Konfigurierbar (Standard: unbegrenzt) |
| VT-03 | Dateiablage (Nextcloud) | Art. 6 I b | Bis Nutzer-Löschung |
| VT-04 | Terminbuchung (Website) | Art. 6 I b | 3 Jahre |
| VT-05 | Rechnungsstellung (Invoice Ninja) | Art. 6 I c (§ 238 HGB) | 10 Jahre |
| VT-06 | Kontaktformular (Website) | Art. 6 I b / f | 3 Jahre |

---

## 4. DSGVO-Compliance-Script — Neue Checks

`scripts/dsgvo-compliance-check.sh` erhält 4 zusätzliche Checks:

| ID | Check | Methode |
|----|-------|---------|
| D09 | TLS-Zertifikat vorhanden | `kubectl get secret workspace-wildcard-tls -n workspace` |
| D10 | Passwortrichtlinie konfiguriert | Keycloak-Realm-API: `passwordPolicy` nicht leer |
| D11 | Backup-CronJob aktiv | `kubectl get cronjob -n workspace` nach backup-job |
| D12 | NetworkPolicies Default-Deny aktiv | `kubectl get networkpolicy default-deny-ingress -n workspace` |

---

## 5. Datenschutzerklärung — Vollständige Überarbeitung

`website/src/pages/datenschutz.astro` — Art. 13/14-konforme Vollversion.

### Parameterisierung

Alle personenbezogenen Angaben werden aus ConfigMap-Umgebungsvariablen injiziert (analog AGB/Impressum):
- `CONTACT_NAME`, `CONTACT_EMAIL`, `CONTACT_PHONE`
- `LEGAL_STREET`, `LEGAL_ZIP`, `CONTACT_CITY`
- `SITE_URL`, `BRAND_NAME`

### Pflichtabschnitte (Art. 13 DSGVO)

1. Verantwortlicher (mit vollständigen Kontaktdaten)
2. Verarbeitungszwecke und Rechtsgrundlagen je Vorgang
3. Speicherdauer je Vorgang
4. Empfänger / Drittlandübermittlung (keine)
5. Betroffenenrechte Art. 15–22 (vollständig, mit Kontaktweg)
6. Beschwerderecht bei Aufsichtsbehörde
7. Keine automatisierten Entscheidungen (Art. 22)

### Abschnitte

- Cookies (nur technisch notwendige, keine Tracking-Cookies)
- Kontaktformular (Mattermost-Webhook intern, keine Weitergabe)
- Terminbuchung (Nextcloud CalDAV, keine Weitergabe)
- Server-Log-Dateien (Traefik, 7-Tage-Retention)
- Hosting (on-premises, kein Cloud-Anbieter)
- Kein Platzhalter-Hinweis

---

## 6. Nicht im Scope

- Auftragsverarbeitungsvertrag (AVV) mit Dritten: keine Dritten vorhanden (on-premises)
- Cookie-Consent-Banner: nur technisch notwendige Cookies → kein Consent-Banner erforderlich (§ 25 TTDSG)
- Datenschutzbeauftragter: nicht erforderlich (< 20 Personen, keine systematische Verarbeitung sensibler Daten)

---

## 7. Selbst-Review

**Placeholder-Scan:** Keine TBD/TODO-Einträge.  
**Konsistenz:** Artikel-Nummern konsistent über alle Abschnitte.  
**Scope:** Ein Plan, vier Dateien — fokussiert genug.  
**Ambiguität:** Speicherdauern konkret angegeben; Aufsichtsbehörde nicht hardcoded (variiert nach Bundesland).
