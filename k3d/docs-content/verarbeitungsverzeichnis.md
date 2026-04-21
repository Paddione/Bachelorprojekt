<div class="page-hero">
  <span class="page-hero-icon">📎</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Verarbeitungsverzeichnis (Art. 30 DSGVO)</div>
    <p class="page-hero-desc">Dokumentation aller Verarbeitungstätigkeiten personenbezogener Daten: Verantwortlicher, Zweck, Datenkategorien, Empfänger und Löschfristen.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">DSGVO Art. 30</span>
      <span class="page-hero-tag">Für Administratoren</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# Verarbeitungsverzeichnis (Art. 30 DSGVO)

**Verantwortlicher:** Gemäß Impressum (`/impressum`)  
**Letzte Aktualisierung:** 2026-04-20  
**Plattform:** Workspace MVP — selbst-gehostete Kollaborationsplattform (On-Premises)

> Dieses Verzeichnis wird geführt gemäß Art. 30 Abs. 1 DSGVO. Es dokumentiert alle Verarbeitungstätigkeiten, bei denen personenbezogene Daten verarbeitet werden.

---

## VT-01: Nutzer-Authentifizierung

| Feld | Wert |
|------|------|
| **Zweck** | Identifikation und Zugriffskontrolle für die Plattform |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung / vorvertragliche Maßnahmen) |
| **Betroffene Personen** | Registrierte Nutzer der Plattform |
| **Datenkategorien** | Name, E-Mail-Adresse, Passwort-Hash (PBKDF2-SHA512), Rollen/Berechtigungen, letzte Anmeldezeit, optionaler TOTP-Secret |
| **Empfänger** | Keine Dritten — On-Premises-Verarbeitung (Keycloak im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Bis zur Löschung des Nutzerkontos (Art. 17-Anfrage oder Admin-Aktion) |
| **Technische Schutzmaßnahmen** | TLS in Transit, PBKDF2-SHA512 Passwort-Hashing, OIDC-Token (kurzlebig), Brute-Force-Detection, Rate-Limiting |

---

## VT-02: Teamkommunikation (Chat)

| Feld | Wert |
|------|------|
| **Zweck** | Interne Kommunikation zwischen Teammitgliedern sowie zwischen Kunden und Administratoren |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene Personen** | Registrierte Nutzer des Website-Portals (Mitarbeiter und Kunden) |
| **Datenkategorien** | Nachrichteninhalte, Zeitstempel, Absender-User-ID, Raum-Zugehörigkeit, Gelesen-Status |
| **Empfänger** | Keine Dritten — On-Premises (Messaging-System im `website`-Namespace, PostgreSQL `shared-db`) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Auf Anfrage (Art. 17) löschbar; ansonsten bis zur Löschung des Nutzerkontos gespeichert |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO, NetworkPolicy-Isolation, Zugriff nur nach Authentifizierung |

---

## VT-03: Dateiablage und Dokumentenverwaltung

| Feld | Wert |
|------|------|
| **Zweck** | Speicherung und gemeinsame Bearbeitung von Dateien und Dokumenten |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene Personen** | Nutzer der Nextcloud-Instanz |
| **Datenkategorien** | Dateien (beliebige Inhalte), Dateinamen, Metadaten (Erstellungs-/Änderungsdatum, Eigentümer-ID), Freigabe-Links, Kalendereinträge, Kontaktdaten |
| **Empfänger** | Keine Dritten — On-Premises (Nextcloud im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Bis zur Löschung durch den Nutzer oder Administrator |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO, Nextcloud-Berechtigungssystem (Owner/Share), PVC-lokaler Storage, verschlüsselte Backups (AES-256) |

---

## VT-04: Terminbuchung

| Feld | Wert |
|------|------|
| **Zweck** | Entgegennahme und Verwaltung von Buchungsanfragen für Dienstleistungen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Durchführung vorvertraglicher Maßnahmen) |
| **Betroffene Personen** | Interessenten und Auftraggeber (Website-Besucher) |
| **Datenkategorien** | Name, E-Mail-Adresse, gewählter Termin/Zeitslot, optionale Nachricht |
| **Empfänger** | Keine Dritten — Weiterleitung intern in die Admin-Inbox (`/admin/termine`); optionaler CalDAV-Eintrag in Nextcloud |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | 3 Jahre (handelsrechtliche Aufbewahrungsfrist für vorvertragliche Korrespondenz) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO für Admin-Zugriff, NetworkPolicy-Isolation, keine externe Weitergabe |

---

## VT-05: Kontaktformular

| Feld | Wert |
|------|------|
| **Zweck** | Bearbeitung von Anfragen über das Website-Kontaktformular |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (vorvertragliche Maßnahmen), hilfsweise Art. 6 Abs. 1 lit. f (berechtigtes Interesse an Anfragenbearbeitung) |
| **Betroffene Personen** | Website-Besucher, die das Kontaktformular nutzen |
| **Datenkategorien** | Name, E-Mail-Adresse, Nachrichteninhalt |
| **Empfänger** | Keine Dritten — Weiterleitung intern in die Admin-Inbox (`/admin/inbox`, PostgreSQL `website`-Datenbank) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | 3 Jahre (Verjährungsfrist für Ansprüche aus vorvertraglichen Verhältnissen, § 195 BGB) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO für Admin-Zugriff auf Inbox, keine Speicherung in externer Datenbank, NetworkPolicy-Isolation |

---

## VT-06: Passwort-Verwaltung (Vaultwarden)

| Feld | Wert |
|------|------|
| **Zweck** | Sicheres Speichern und Verwalten von Zugangsdaten und Geheimnissen für das Team |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung — Bereitstellung von Team-Infrastruktur) |
| **Betroffene Personen** | Registrierte Nutzer der Vaultwarden-Instanz (Teammitglieder) |
| **Datenkategorien** | Verschlüsselte Passwort-Einträge (Ende-zu-Ende-verschlüsselt durch Bitwarden-Client), Organisations-Metadaten, E-Mail-Adresse des Kontos |
| **Empfänger** | Keine Dritten — On-Premises (Vaultwarden im `workspace`-Namespace, PostgreSQL `vaultwarden`-DB) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Bis zur Löschung des Nutzerkontos oder der Einträge durch den Nutzer bzw. Administrator |
| **Technische Schutzmaßnahmen** | TLS in Transit, Ende-zu-Ende-Verschlüsselung (Bitwarden-Protokoll, AES-256), Keycloak OIDC SSO möglich, Admin-Token für Verwaltungszugriff |

---

## VT-07: KI-Assistent (Claude Code)

| Feld | Wert |
|------|------|
| **Zweck** | KI-gestützte Entwicklungsunterstützung für Administratoren und Entwickler |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung — Bereitstellung von Entwicklungswerkzeugen) |
| **Betroffene Personen** | Administratoren und Entwickler, die Claude Code nutzen |
| **Datenkategorien** | Prompts und Antworten (innerhalb der Session); kein persistentes Logging von Nutzerinteraktionen im Cluster |
| **Empfänger** | **Anthropic Inc.** (USA) — Prompts werden zur Verarbeitung an die Anthropic API übertragen |
| **Drittlandübermittlung** | Anthropic Inc. (USA): Datenübertragung auf Basis von EU-Standardvertragsklauseln (SCC) gemäß Art. 46 Abs. 2 lit. c DSGVO |
| **Speicherdauer** | Session-gebunden — keine persistente Speicherung im Cluster nach Session-Ende |
| **Technische Schutzmaßnahmen** | TLS in Transit (Anthropic API), OIDC-Authentifizierung für Claude Code Web UI, Basic Auth für AI-Status-Seite, RBAC (kein Zugriff auf Kubernetes Secrets) |

> **Hinweis:** Claude Code ist ein **internes Werkzeug für Administratoren** — keine Nutzerdaten der Plattform werden automatisch an Anthropic übertragen. Nur explizit eingefügte Inhalte in Prompts werden verarbeitet.

---

## VT-08: Whiteboard

| Feld | Wert |
|------|------|
| **Zweck** | Kollaborative visuelle Zusammenarbeit (Skizzen, Diagramme, Brainstorming) |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene Personen** | Registrierte Nutzer, die das Whiteboard nutzen |
| **Datenkategorien** | Whiteboard-Zeichendaten (Striche, Formen, Texte), Session-ID, Nutzer-ID (aus Keycloak JWT) |
| **Empfänger** | Keine Dritten — On-Premises (Whiteboard im `workspace`-Namespace) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Session-gebunden oder bis zur manuellen Löschung durch den Nutzer |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO, JWT-Signaturprüfung (HS256), NetworkPolicy-Isolation |

---

## Keine Drittlandübermittlung (Standardbetrieb)

Im Standardbetrieb findet **keine Übermittlung personenbezogener Daten in Drittländer** (außerhalb der EU/EWR) statt. Die gesamte Plattform wird vollständig on-premises betrieben.

**Ausnahme: VT-07 (Claude Code / Anthropic)** — Prompts werden an Anthropic Inc. (USA) übertragen. Dies betrifft ausschließlich Administratoren und Entwickler als interne Werkzeugnutzer (kein öffentlicher Dienst).

## Auftragsverarbeiter

| Auftragsverarbeiter | Sitz | Zweck | Rechtsgrundlage |
|---------------------|------|-------|-----------------|
| **Anthropic Inc.** | USA | KI-Sprachmodell (Claude Code — internes Entwicklungswerkzeug) | EU-Standardvertragsklauseln (SCC) gem. Art. 46 Abs. 2 lit. c DSGVO |

Alle übrigen Verarbeitungen erfolgen vollständig durch den Verantwortlichen selbst auf eigener On-Premises-Infrastruktur (kein weiterer Auftragsverarbeiter).
