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
| **Zweck** | Interne Kommunikation zwischen Teammitgliedern sowie zwischen Kunden und Administratoren |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) |
| **Betroffene Personen** | Registrierte Nutzer des Website-Portals (Mitarbeiter und Kunden) |
| **Datenkategorien** | Nachrichteninhalte, Zeitstempel, Absender-User-ID, Raum-Zugehörigkeit, Gelesen-Status |
| **Empfänger** | Keine Dritten — On-Premises (Messaging-System im `website`-Namespace, PostgreSQL `shared-db`) |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | Auf Anfrage (Art. 17) löschbar; ansonsten unbegrenzt gespeichert |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO, NetworkPolicy-Isolation, Zugriff nur nach Authentifizierung |

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
| **Empfänger** | Keine Dritten — Weiterleitung intern in die Admin-Inbox (`/admin/termine`); CalDAV-Eintrag in Nextcloud |
| **Drittlandübermittlung** | Keine |
| **Speicherdauer** | 3 Jahre (handelsrechtliche Aufbewahrungsfrist für vorvertragliche Korrespondenz) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO für Admin-Zugriff, NetworkPolicy-Isolation, keine externe Weitergabe |

---

## VT-05: Rechnungsstellung und Zahlungsabwicklung

| Feld | Wert |
|------|------|
| **Zweck** | Erstellung, Verwaltung und Archivierung von Rechnungen sowie Abwicklung von Online-Zahlungen |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung: § 257 HGB, § 14 UStG); Art. 6 Abs. 1 lit. b (Vertragserfüllung) |
| **Betroffene Personen** | Auftraggeber (Rechnungsempfänger, Zahlende) |
| **Datenkategorien** | Name, Unternehmensname, Rechnungsadresse, E-Mail, Leistungsbeschreibung, Beträge, Rechnungsnummer, Datum; Stripe-Checkout-Sitzungs-ID |
| **Empfänger** | Rechnungsdaten: On-Premises (Website `website`-Namespace, PostgreSQL). Zahlungsabwicklung: **Stripe Inc.** (Auftragsverarbeiter gemäß Art. 28 DSGVO, EU-Standardvertragsklauseln) |
| **Drittlandübermittlung** | Stripe: Datenübertragung in die USA auf Basis von EU-Standardvertragsklauseln (SCC) |
| **Speicherdauer** | 10 Jahre (§ 257 HGB — gesetzliche Aufbewahrungspflicht für Buchungsbelege) |
| **Technische Schutzmaßnahmen** | TLS in Transit, Keycloak OIDC SSO für Admin-Zugriff, Stripe Hosted Checkout (keine Kartenddaten on-premises), Webhook-Signaturprüfung |

---

## VT-06: Kontaktformular

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

## Keine Drittlandübermittlung

Es findet **keine Übermittlung personenbezogener Daten in Drittländer** (außerhalb der EU/EWR) statt. Die gesamte Plattform wird vollständig on-premises betrieben. Alle Komponenten sind Open-Source-Software, die ohne externe Datenübertragung betrieben wird.

## Auftragsverarbeiter

| Auftragsverarbeiter | Sitz | Zweck | Rechtsgrundlage |
|---------------------|------|-------|-----------------|
| **Stripe Inc.** | USA (EU-Niederlassung: Irland) | Online-Zahlungsabwicklung (Kreditkarte, SEPA) | EU-Standardvertragsklauseln (SCC) gem. Art. 46 Abs. 2 lit. c DSGVO |

Alle übrigen Verarbeitungen erfolgen vollständig durch den Verantwortlichen selbst auf eigener On-Premises-Infrastruktur (kein weiterer Auftragsverarbeiter).
