---
type: note
tags: [software, capabilities]
status: active
source:: Bachelorprojekt README.md docs/agent-guide/registry/components.yaml
---
# Software-Capabilities — Was die Plattform kann

Dieses Dokument beschreibt die Kernkomponenten der Workspace-Plattform und deren tatsächliche Fähigkeiten (Capabilities) in den Umgebungen Development (k3d) und Produktion (fleet).

---

## 🌐 1. Website (Astro + Svelte)
Das öffentliche Web-Frontend und das geschützte Kundenportal (Portal) der jeweiligen Marke (Mentolder / Korczewski).
* **Marken-Identität (Brand-awareness):** Dynamische Anpassung von Layouts, Texten und Preisen per `BRAND_ID` (mentolder / korczewski).
* **Kunden-Portal (Customer Portal):** Profilverwaltung, Terminbuchungs-Kalender (Calendar Booking Flow) und Vertragsübersichten.
* **Support-Chat:** Integriertes Website-Messaging für Echtzeit-Kundenanfragen (Chat-System).

## 🔑 2. Keycloak SSO (Single Sign-On)
Zentraler Identity Provider (Identitätsdienst) für das gesamte Workspace-Ökosystem.
* **Pro-Brand Realms:** Eigenständige Realms für Mentolder und Korczewski zur sauberen Mandantentrennung.
* **Protokolle:** Standardkonforme Authentifizierung über OpenID Connect (OIDC) und SAML.
* **Single Sign-On (SSO):** Einmaliges Einloggen gewährt sicheren Zugriff auf Nextcloud, Vaultwarden, DocuSeal, Brett und das Portal.

## ☁️ 3. Nextcloud + Talk
Zentrale Kollaborations- und Dateiablage-Plattform (Groupware).
* **Datei-Management:** Dateiversionierung, Freigaben (Shares), Synchronisation.
* **Kalender & Kontakte:** Standardkonforme CalDAV- und CardDAV-Synchronisierung.
* **Nextcloud Talk:** Integrierter Chat, Kanäle (Channels) und Video-Telefonie (Nextcloud Talk HPB).

## 📄 4. Collabora Online
WOPI-integrierte (Web Application Open Platform Interface) Online-Office-Suite.
* **Dokumentenbearbeitung:** Direktes, kollaboratives Editieren von Texten, Tabellen und Präsentationen im Browser innerhalb von Nextcloud.

## 📡 5. Talk HPB (High-Performance Backend)
Skalierbarer Signaling-Server (Vermittlungsdienst) für Nextcloud Talk.
* **Gruppen-Anrufe:** Ermöglicht performante Video-Konferenzen mit vielen Teilnehmern durch Janus WebRTC Gateway und NATS-Messaging.

## 🔒 6. Vaultwarden
Ressourcenschonende, Bitwarden-kompatible Passwort-Verwaltung.
* **Passwort-Tresor:** Verschlüsseltes Speichern und Teilen von Anmeldedaten und Geheimnissen.
* **Client-Kompatibilität:** Kompatibel mit allen offiziellen Bitwarden-Browser-Erweiterungen und Apps.

## 📝 7. DocuSeal
Plattform für digitale Dokumenten-Unterschriften (E-Signaturen).
* **Vertragsmanagement:** Online-Erstellung, Ausfüllen und rechtssicheres Signieren von Verträgen und PDFs.

## 🧩 8. Brett (Systembrett)
Digitales 3D-Aufstellungsboard (Systembrett) für systemische Familien- und Organisationsaufstellungen.
* **3D-Sitzungen:** Interaktives Platzieren und Ausrichten von Figuren im dreidimensionalen Raum direkt im Browser (Brett 3D).

## 🎨 9. Whiteboard
Kollaborative Echtzeit-Zeichenfläche für Brainstorming und visuelle Skizzen.

## 📡 10. LiveKit Stack
Hochperformante Audio/Video-Infrastruktur für Streaming-Dienste.
* **WebRTC Server:** Ermöglicht Live-Übertragungen und Raum-Verwaltung.
* **Ingress / Egress:** RTMP- und WHIP-Einspeisung sowie automatisierte Aufzeichnung (Egress) und Ablage von Streams.

## 🤖 11. Claude Code MCP Gateway
Schnittstelle für KI-Assistenten (Model Context Protocol).
* **Tool-Integration:** Bietet sicheren Zugriff für LLMs auf Cluster-Metadaten, PostgreSQL shared-db, Kubernetes-Ressourcen und Aufgaben (mcp-task-runner).

## 🗄️ 12. PostgreSQL shared-db
Zentrale, hochverfügbare PostgreSQL-Datenbankinstanz (shared-db) mit dedizierten Schemata und Rollen zur Daten-Isolation pro Dienst und Brand.

## 📬 13. Mailpit
Dev-Mailserver zum Abfangen ausgehender E-Mails im Entwicklungsmodus, um versehentliche Mail-Zustellungen an echte Empfänger zu verhindern.

---
Siehe auch: [[index-moc]] · [[usage]] · [[quality-goals]].
