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
