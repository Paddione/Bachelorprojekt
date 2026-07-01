## ADDED Requirements

### Requirement: REQ-RUSTDESK-CLIENT-001 — Automatisch vorkonfigurierter Windows-Installer
Das System SHALL einen Windows-MSI-Installer bereitstellen, der beim Setup automatisch den
RustDesk-Client mit ID-Server, Relay-Server und Public Key vorkonfiguriert, sodass keine
manuelle Eingabe dieser Werte auf dem Zielrechner nötig ist.

#### Scenario: Silent Install konfiguriert den Client automatisch
- **GIVEN** ein frisches Windows-System ohne installiertes RustDesk
- **WHEN** die bereitgestellte MSI silent installiert wird (`msiexec /i ... /qn`)
- **THEN** verbindet sich der RustDesk-Client ohne weitere manuelle Konfiguration mit
  `rustdesk.mentolder.de`

### Requirement: REQ-RUSTDESK-CLIENT-002 — Unattended-Access ohne manuelle Passworteingabe
Das System SHALL denselben Installer nutzen, um ein vorab festgelegtes, gemeinsames
Unattended-Access-Passwort zu setzen, sodass passwortloser Fernzugriff ohne manuelle
Konfiguration pro Rechner möglich ist.

#### Scenario: Unattended-Zugriff funktioniert nach Installation
- **GIVEN** ein Rechner, auf dem der Installer ausgeführt wurde
- **WHEN** ein zweiter RustDesk-Client versucht, sich unattended mit diesem Rechner zu verbinden
- **THEN** wird das vorab gesetzte Passwort akzeptiert, ohne dass am Zielrechner etwas manuell
  konfiguriert wurde

### Requirement: REQ-RUSTDESK-CLIENT-003 — Private Distribution, kein öffentliches Artifact
Das System SHALL den Installer ausschließlich über eine SSO-gated (OIDC/Pocket ID)
Downloads-Fläche verteilen und SHALL NOT ein öffentlich zugängliches GitHub Release oder ein
öffentlich einsehbares GitHub-Actions-Artifact dafür nutzen, da das Repository öffentlich ist
und der Installer ein sensibles Unattended-Passwort im Klartext enthält.

#### Scenario: Download erfordert Authentifizierung
- **GIVEN** ein nicht authentifizierter Nutzer im offenen Internet
- **WHEN** er versucht, die MSI von der Downloads-URL herunterzuladen
- **THEN** wird er zur Pocket-ID-Anmeldung umgeleitet und erhält die Datei nicht ohne gültige
  Session

### Requirement: REQ-RUSTDESK-CLIENT-004 — Kontrollierter, manueller Build-Trigger
Das System SHALL den Installer-Build ausschließlich über einen manuell ausgelösten
CI-Workflow (`workflow_dispatch`) erzeugen und SHALL NOT automatisch bei jedem Push bauen, um
die Exposition des gebackenen Passworts im Build-Kontext zu minimieren.

#### Scenario: Kein Build bei normalem Push
- **GIVEN** ein Commit wird auf einen beliebigen Branch gepusht
- **WHEN** die CI-Pipeline durchläuft
- **THEN** wird der Windows-Installer-Build NICHT automatisch ausgelöst, sondern nur bei
  explizitem manuellem Trigger
