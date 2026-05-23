# Systemtest-Protokoll — Workspace Collaboration Platform

**Projekt:** Workspace — Self-Hosted Collaboration Platform (Bachelorarbeit)  
**Dokument-Version:** 2.0  
**Stand:** Mai 2026  
**Testrahmen:** BATS, Bash, Playwright (E2E)

---

## Testdurchführung

| Feld | Wert |
|------|------|
| **Tester** | |
| **Datum Testbeginn** | |
| **Datum Testabschluss** | |
| **Cluster / Umgebung** | ☐ dev (k3d)  ☐ mentolder  ☐ korczewski |
| **Git-Revision (SHA)** | |
| **Betriebssystem** | |

---

## Kurzanleitung

1. Stellen Sie sicher, dass der Ziel-Cluster läuft (`task cluster:status` oder `task workspace:status ENV=<env>`).
2. Führen Sie jeden Test gemäß den angegebenen Schritten durch.
3. Tragen Sie das tatsächliche Ergebnis in das Feld **Tatsächliches Ergebnis** ein.
4. Kreuzen Sie den **Status** an: `Bestanden`, `Fehlgeschlagen` oder `Übersprungen`.
5. Notieren Sie Abweichungen oder Hinweise im Feld **Bemerkungen**.
6. Für automatisierte Tests kann der Befehl `./tests/runner.sh local <TEST-ID>` verwendet werden.

### Statusdefinitionen

| Status | Bedeutung |
|--------|-----------|
| **Bestanden** | Tatsächliches Ergebnis entspricht dem erwarteten Ergebnis vollständig. |
| **Fehlgeschlagen** | Das erwartete Ergebnis wurde nicht erzielt; Fehler dokumentiert. |
| **Übersprungen** | Test konnte aufgrund fehlender Vorbedingungen nicht ausgeführt werden. |
| **Entfällt** | Test ist für diese Konfiguration nicht anwendbar (z. B. Mattermost entfernt). |

---

## Testzusammenfassung

| Test-ID | Titel | Status |
|---------|-------|--------|
| FA-01 | Messaging (Echtzeit) — Direktnachrichten | Entfällt |
| FA-02 | Kanäle / Workspaces | Entfällt |
| FA-03 | Videokonferenzen (Nextcloud Talk HPB) | |
| FA-04 | Dateiablage | Entfällt |
| FA-05 | Nutzerverwaltung | Entfällt |
| FA-06 | Benachrichtigungen | Entfällt |
| FA-07 | Suche | Entfällt |
| FA-08 | Workspace-spezifisch | Entfällt |
| FA-09 | Billing-Infrastruktur | Entfällt |
| FA-10 | Kundenanfragen-Kontaktformular | |
| FA-11 | Kunden-Portal | |
| FA-12 | Claude Code AI Assistant (MCP) | |
| FA-13 | Dokumentations-Service | |
| FA-14 | User Registration Flow | |
| FA-15 | OIDC Website Login | |
| FA-16 | Calendar Booking | |
| FA-17 | Meeting Lifecycle | |
| FA-18 | Meeting Transcription (Whisper) | |
| FA-20 | Meeting Finalization Pipeline | |
| FA-21 | Service Catalog | |
| FA-23 | Vaultwarden Passwort-Manager | |
| FA-24 | Kollaboratives Whiteboard | |
| FA-25 | Mailpit E-Mail-Server | |
| FA-26 | Bug Report Form | |
| FA-27 | Systemisches Brett | |
| FA-28 | Website-Messaging (Chat-System) | |
| FA-30 | E-Rechnung / XRechnung (einvoice-sidecar) | |
| FA-31 | Admin-Monitoring Auth-Gate (Prod) | |
| FA-32 | LLM-Router bge-m3 Embeddings | |
| FA-33 | LLM-Router voyage-multilingual-2 | |
| FA-34 | LLM-Router strict-fail (kein silent fallback) | |
| FA-35 | LLM MixedEmbeddingModelError | |
| FA-36 | Rerank-Endpunkt | |
| FA-37 | workspace-chat Roundtrip | |
| FA-39 | Arena DB-Schema und Service-Health | |
| FA-40 | Arena Spectator-join Smoke | |
| SA-01 | Transportverschlüsselung | |
| SA-02 | Authentifizierung | |
| SA-03 | Passwörter (Hash, Policy) | |
| SA-04 | Session-Timeout | |
| SA-05 | Audit-Log | |
| SA-07 | Backup (pg_dump, PVCs) | |
| SA-08 | SSO-Integration (Keycloak OIDC) | |
| SA-10 | MCP-Endpunkt-Absicherung (ForwardAuth) | |
| SA-11 | Arena non-admin 403 | |
| SA-12 | Korczewski-Realm JWT-Akzeptanz | |
| SA-13 | Untrusted JWT abgelehnt | |
| NFA-01 | Datenschutz / DSGVO | |
| NFA-02 | Performance / Antwortzeiten | |
| NFA-03 | Verfügbarkeit / Neustart-Resilienz | |
| NFA-04 | Skalierbarkeit | |
| NFA-05 | Usability / Deutsche Lokalisierung | |
| NFA-06 | Website Neustart-Resilienz | |
| NFA-07 | Open-Source-Lizenz | |
| NFA-08 | Produktions-Deployment (Hetzner) | |
| NFA-09 | Statisches DNS | |
| NFA-10 | Arena Health-Endpoint Performance | |
| NFA-11 | GPU-VRAM nach Modell-Rotation | |
| NFA-12 | Brainstorm-Tunnel ConfigMap-Persistenz | |
| AK-03 | Technische Machbarkeit | |
| AK-04 | Prototyp-Betrieb | |

---

# Abschnitt 1: Funktionale Tests (FA)

---

## Entfallene Tests (Mattermost-Entfernung)

Die folgenden Tests wurden ursprünglich für die Mattermost-Integration konzipiert. Da Mattermost aus dem Stack entfernt wurde, sind diese Tests nicht mehr anwendbar. Messaging-Funktionalität wird durch **FA-28** (Website-internes Chat-System) abgedeckt.

| Test-ID | Ursprünglicher Titel | Begründung |
|---------|---------------------|------------|
| FA-01 | Messaging (Echtzeit) | Mattermost entfernt; ersetzt durch FA-28 |
| FA-02 | Kanäle / Workspaces | Mattermost entfernt |
| FA-04 | Dateiablage | Mattermost entfernt; Dateiablage via Nextcloud |
| FA-05 | Nutzerverwaltung | Mattermost entfernt; Nutzerverwaltung via Keycloak |
| FA-06 | Benachrichtigungen | Mattermost entfernt |
| FA-07 | Suche | Mattermost entfernt |
| FA-08 | Workspace-spezifisch | Mattermost entfernt |
| FA-09 | Billing-Infrastruktur | Billing nicht mehr aktiv im Stack |

---

### FA-03: Videokonferenzen (Nextcloud Talk HPB)

> **Beschreibung:** Prüft die Videokonferenz-Infrastruktur über Nextcloud Talk mit dem High-Performance-Backend (HPB), inklusive Janus WebRTC Gateway, Signaling-Server und coturn TURN-Server.

**Vorbedingungen:** Workspace-Stack deployed, Nextcloud-Pod läuft, coturn-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Talk-API-Endpunkt intern ansprechen: `GET /ocs/v2.php/apps/spreed/api/v4/room` | HTTP 200 oder 401 (Endpunkt existiert) |
| T2 | Janus WebRTC Gateway auf Port 8188 ansprechen | HTTP-Antwort (kein Timeout) |
| T3 | Nextcloud Talk-App in Nextcloud-Admin prüfen: Apps → Talk → aktiviert | Talk als aktiv gelistet |
| T4 | Signaling-Server-Konfiguration prüfen: `occ talk:signaling:list` | Signaling-Server eingetragen |
| T5 | coturn-Service im Namespace prüfen: `kubectl get svc -n workspace \| grep coturn` | coturn Service vorhanden |
| T6 | Vom Browser aus Nextcloud Talk öffnen und Sprach-/Videoraum anlegen | Raum wird erstellt, Video-/Audiozugang möglich |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-10: Kundenanfragen-Kontaktformular

> **Beschreibung:** Prüft das Kontaktformular auf der Website sowie die Admin-Inbox für eingehende Kundenanfragen.

**Vorbedingungen:** Website-Pod im Namespace `website` läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Website-Deployment prüfen: `kubectl get deploy website -n website -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Website intern ansprechen: HTTP-Anfrage auf `http://localhost:4321/` | HTTP 200 |
| T3 | Kontaktformular-API prüfen: `GET /api/contact` | Endpunkt antwortet (kein 404) |
| T4 | Admin-Inbox-API prüfen: `GET /api/admin/contact` | Endpunkt antwortet (401 ohne Auth oder 200) |
| T5 | Im Browser `https://web.{DOMAIN}/kontakt` öffnen und Formular ausfüllen | Formular wird angezeigt, Absenden erfolgreich |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-11: Kunden-Portal

> **Beschreibung:** Prüft die Kunden-Portal-Infrastruktur: Bereitstellungsskript für Gast-Accounts, Keycloak-Realm und Domain-Konfiguration.

**Vorbedingungen:** Workspace-Stack deployed, Keycloak läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1a | Vorhandensein von `scripts/create-customer-guest.sh` prüfen | Datei existiert |
| T1b | Ausführbarkeit prüfen: `test -x scripts/create-customer-guest.sh` | Datei ist ausführbar |
| T2 | Keycloak-Deployment prüfen: `kubectl get deploy keycloak -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T3 | KEYCLOAK_ADMIN_PASSWORD im Secret prüfen: `kubectl get secret workspace-secrets -n workspace` | Secret enthält KEYCLOAK_ADMIN_PASSWORD |
| T4 | KC_DOMAIN in ConfigMap prüfen: `kubectl get configmap domain-config -n workspace -o jsonpath='{.data.KC_DOMAIN}'` | Wert enthält Domain |
| T5 | Im Browser `https://web.{DOMAIN}/portal` öffnen (eingeloggt) | Portal-Seite wird angezeigt |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-12: Claude Code AI Assistant (MCP-Infrastruktur)

> **Beschreibung:** Prüft die Model Context Protocol (MCP) Infrastruktur für den Claude Code AI Assistant, inklusive Core-, Apps- und Auth-Pods sowie ForwardAuth-Proxy.

**Vorbedingungen:** MCP-Stack deployed (`task mcp:deploy`), Keycloak läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | MCP-Core-Pod prüfen: `kubectl get deploy claude-code-mcp-core -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | MCP-Apps-Pod prüfen: `kubectl get deploy claude-code-mcp-apps -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T3 | MCP-Auth-Pod prüfen: `kubectl get deploy claude-code-mcp-auth -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T4 | ForwardAuth-Proxy prüfen: `kubectl get deploy mcp-auth-proxy -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T5 | Anfrage ohne Token an MCP-Auth-Proxy: `curl -i http://mcp-auth-proxy.workspace.svc/auth` | HTTP 401 |
| T6 | `task mcp:status` ausführen | Alle MCP-Container als `Running` gelistet |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-13: Dokumentations-Service

> **Beschreibung:** Prüft den internen Dokumentations-Dienst (Docsify), der auf `docs.{DOMAIN}` erreichbar ist.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Docs-Deployment prüfen: `kubectl get deploy docs -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Docs-Service intern ansprechen: HTTP-Anfrage auf `http://docs.workspace.svc.cluster.local` | HTTP-Antwort (kein Timeout) |
| T3 | DOCS_DOMAIN in ConfigMap prüfen: `kubectl get configmap domain-config -n workspace -o jsonpath='{.data.DOCS_DOMAIN}'` | Wert enthält Domain |
| T4 | Im Browser `https://docs.{DOMAIN}` öffnen | Docsify-Startseite wird geladen |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-14: User Registration Flow

> **Beschreibung:** Prüft den Benutzerregistrierungs-Flow auf der Website: Registrierungsseite erreichbar, Formularfelder vorhanden.

**Vorbedingungen:** Website-Pod läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Website-Deployment prüfen | readyReplicas > 0 |
| T2 | Registrierungsseite ansprechen: `GET /registrieren` | HTTP 200 |
| T3 | HTML auf Formularfelder prüfen: Name, E-Mail, Passwort vorhanden | Felder im HTML-Body gefunden |
| T4 | Im Browser `https://web.{DOMAIN}/registrieren` öffnen | Registrierungsformular wird angezeigt |
| T5 | Registrierungsformular mit Testdaten ausfüllen und abschicken | Bestätigungsmeldung oder Weiterleitung |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-15: OIDC Website Login

> **Beschreibung:** Prüft den Single-Sign-On-Login-Flow der Website via Keycloak OIDC.

**Vorbedingungen:** Website und Keycloak laufen, OIDC-Client konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Login-Endpunkt prüfen: `GET /api/auth/login` (ohne Redirect-Follow) | HTTP 302 (Redirect zu Keycloak) |
| T2 | Me-Endpunkt prüfen: `GET /api/auth/me` (unauthentifiziert) | `authenticated: false` in JSON-Antwort |
| T3 | Keycloak OIDC Discovery-Endpunkt prüfen: `GET /realms/workspace/.well-known/openid-configuration` | JSON mit OIDC-Metadaten, HTTP 200 |
| T4 | Im Browser `https://web.{DOMAIN}/portal` ohne Login öffnen | Weiterleitung zu Keycloak-Loginseite |
| T5 | Mit gültigen Credentials einloggen | Weiterleitung zurück zum Portal, Login erfolgreich |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-16: Calendar Booking

> **Beschreibung:** Prüft die Terminbuchungs-Funktionalität: Slots-API, Buchungs-API und CalDAV-Konfiguration.

**Vorbedingungen:** Website läuft, Nextcloud für CalDAV konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Slots-API ansprechen: `GET /api/calendar/slots` | HTTP 200 |
| T2 | Antwortformat prüfen | JSON-Array (auch wenn leer) |
| T3 | Buchungs-API validiert Eingabe: `POST /api/calendar/book` mit leerem Body | HTTP 400 (Validierungsfehler) |
| T4 | CalDAV-Konfiguration prüfen: CALDAV_URL in Website-ConfigMap vorhanden | Konfiguration gesetzt |
| T5 | Im Browser `/portal/termin-buchen` öffnen | Terminbuchungs-Widget wird angezeigt |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-17: Meeting Lifecycle

> **Beschreibung:** Prüft den vollständigen Meeting-Lebenszyklus: Erinnerungen, CronJob und Nextcloud Talk-Integration.

**Vorbedingungen:** Website und Nextcloud laufen, CronJobs deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Reminder-Endpunkt ansprechen: `POST /api/reminders/process` | HTTP 200 |
| T2 | CronJob prüfen: `kubectl get cronjob meeting-reminders -n website` | CronJob definiert |
| T3 | Nextcloud Talk-Endpunkt intern ansprechen | HTTP 200 oder 401 (erreichbar) |
| T4 | Im Browser ein Meeting anlegen und Erinnerung konfigurieren | Meeting gespeichert, Erinnerung eingetragen |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-18: Meeting Transcription (Whisper)

> **Beschreibung:** Prüft den Whisper-basierten Transkriptions-Dienst für Meeting-Aufzeichnungen.

**Vorbedingungen:** Workspace-Stack deployed, Whisper-Pod läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Whisper-Deployment prüfen: `kubectl get deploy whisper -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Whisper Health-Endpunkt: `GET http://localhost:8000/health` via Pod-Exec | Antwort enthält "OK" |
| T3 | Whisper-Version prüfen: `kubectl logs deploy/whisper -n workspace \| grep faster-whisper` | faster-whisper in Logs sichtbar |
| T4 | Transkriptions-Endpunkt mit Test-Audio-Datei aufrufen | Transkript zurückgegeben |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-20: Meeting Finalization Pipeline

> **Beschreibung:** Prüft den Meeting-Abschluss-Workflow, der Transkripte zusammenführt und Ergebnisse verschickt.

**Vorbedingungen:** Website läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Finalize-Endpunkt ohne Daten: `POST /api/meeting/finalize` mit leerem Body `{}` | HTTP 400 (Validierungsfehler) |
| T2 | Finalize-Endpunkt mit Mindestdaten: `POST /api/meeting/finalize` mit `{"customerName":"Test","customerEmail":"test@example.com"}` | HTTP 200, Antwort enthält `results`-Array |
| T3 | Meeting in der Browser-UI abschließen | Meeting als abgeschlossen markiert, Zusammenfassung sichtbar |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-21: Service Catalog

> **Beschreibung:** Prüft die Leistungsübersicht (Service Catalog) auf der Website.

**Vorbedingungen:** Website läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Leistungsseite ansprechen: `GET /leistungen` | HTTP 200 |
| T2 | Billing-API validiert Eingabe: `POST /api/billing/create-invoice` mit leerem Body | HTTP 400 oder 401 (kein 500) |
| T3 | Im Browser `https://web.{DOMAIN}/leistungen` öffnen | Leistungsübersicht wird angezeigt, keine Buchungs-Buttons (Stripe entfernt) |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-23: Vaultwarden Passwort-Manager

> **Beschreibung:** Prüft den Vaultwarden Passwort-Manager: Deployment, Health-Endpunkt, Datenbank und SSO-Konfiguration.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Vaultwarden-Pod prüfen: `kubectl get deploy vaultwarden -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Vaultwarden Health-Endpunkt: `GET http://vaultwarden:80/alive` | HTTP 200 |
| T3 | Datenbank prüfen: `psql -U postgres -c "SELECT 1 FROM pg_database WHERE datname='vaultwarden'"` | Gibt 1 zurück |
| T4 | SSO-Konfiguration prüfen: Env-Variable `SSO_ENABLED` im Deployment | Wert `true` |
| T5 | Im Browser `https://vault.{DOMAIN}` öffnen | Vaultwarden-Login-Seite angezeigt; SSO-Login-Button vorhanden |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-24: Kollaboratives Whiteboard

> **Beschreibung:** Prüft den Nextcloud Whiteboard-Dienst: Deployment, Service-Port und Anbindung an Nextcloud.

**Vorbedingungen:** Office-Stack deployed (`task workspace:office:deploy`)

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Whiteboard-Pod prüfen: `kubectl get deploy whiteboard -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Service-Port prüfen: `kubectl get svc whiteboard -n workspace -o jsonpath='{.spec.ports[0].port}'` | Port 3002 |
| T3 | Whiteboard-Startseite ansprechen: `GET http://whiteboard:3002/` | HTTP 200 |
| T4 | NEXTCLOUD_URL-Konfiguration prüfen: Env-Variable im Deployment | Enthält Nextcloud-URL |
| T5 | In Nextcloud eine `.whiteboard`-Datei anlegen und öffnen | Whiteboard-Editor öffnet sich im Browser |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-25: Mailpit E-Mail-Server

> **Beschreibung:** Prüft den Mailpit SMTP-Relay-Dienst für ausgehende E-Mails und die Web-UI.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Mailpit-Pod prüfen: `kubectl get deploy mailpit -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Mailpit Web-UI ansprechen: `GET http://mailpit:8025/` | HTTP 200 |
| T3 | SMTP-Port-Erreichbarkeit: `echo QUIT \| nc -w 2 mailpit 1025 \| head -1` | Antwort beginnt mit `220` |
| T4 | Service-Ports prüfen: `kubectl get svc mailpit -n workspace -o jsonpath='{.spec.ports[*].port}'` | Ports 1025 und 8025 vorhanden |
| T5 | Im Browser `https://mail.{DOMAIN}` öffnen | Mailpit-Web-UI angezeigt |
| T6 | Über die Website eine Kontaktanfrage absenden | E-Mail erscheint in Mailpit-Inbox |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-26: Bug Report Form

> **Beschreibung:** Prüft das Bug-Report-Formular auf der Website und den Admin-Inbox-Endpunkt.

**Vorbedingungen:** Website läuft, Bug-Kanal/Schema konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Website-Deployment prüfen | readyReplicas > 0 |
| T2 | Bug-Report-Endpunkt: `POST /api/bug-report` mit leerem Body | HTTP 400 oder 422 (Validierungsfehler, kein 404) |
| T3 | Bugs-Kanal oder Anfragen-Kanal in DB prüfen: `SELECT COUNT(*) FROM messaging.rooms WHERE slug IN ('bugs','anfragen')` | Mindestens 1 Zeile |
| T4 | ConfigMap für Website auf Bug-Report-Env-Variable prüfen | Variable gesetzt |
| T5 | Im Browser Bug-Report-Formular öffnen und ausfüllen | Formular abgesendet, Bestätigung angezeigt |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-27: Systemisches Brett (3D Multiplayer)

> **Beschreibung:** Prüft den Systemisches-Brett-Dienst: Pod, REST API, Snapshot-CRUD und WebSocket-Synchronisation.

**Vorbedingungen:** Workspace-Stack deployed, Brett-Pod läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Brett-Pod prüfen: `kubectl get deploy brett -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Health-Endpunkt: `GET http://brett/healthz` | HTTP 200 |
| T3 | Statische Datei ausliefern: `GET http://brett/three.min.js` | HTTP 200, JavaScript-Datei |
| T4 | Raumzustand abrufen: `GET http://brett/api/state?room=<TESTROOM>` | JSON `{figures: []}` (leerer Raum) |
| T5 | Snapshot anlegen: `POST http://brett/api/snapshots` mit `{"name":"Test","room":"<TESTROOM>","figures":[]}` | HTTP 201, Snapshot-ID in Antwort |
| T6 | Snapshot abrufen: `GET http://brett/api/snapshots/<ID>` | JSON mit `name: "Test"` |
| T7 | Snapshot-Liste abrufen: `GET http://brett/api/snapshots?room=<TESTROOM>` | Angelegter Snapshot in Liste |
| T8 | WebSocket-Verbindung: `ws://brett/sync` Upgrade | Connection Upgrade erfolgreich (HTTP 101) |
| T9 | Im Browser `https://brett.{DOMAIN}` öffnen und 3D-Brett laden | 3D-Ansicht wird gerendert |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-28: Website-Messaging (internes Chat-System)

> **Beschreibung:** Prüft das in die Website integrierte Chat-System mit Direktnachrichten, Gruppenräumen und Portal-Nachrichten.

**Vorbedingungen:** Website läuft, PostgreSQL-Schema für Messaging vorhanden

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Website-Deployment prüfen | readyReplicas > 0 |
| T2 | Portal-Nachrichten-Endpunkt (unauthentifiziert): `GET /api/portal/messages` | HTTP 401 |
| T3 | Admin-Nachrichten-Endpunkt (unauthentifiziert): `GET /api/admin/messages` | HTTP 401 |
| T4 | Admin-Räume-Endpunkt (unauthentifiziert): `GET /api/admin/rooms` | HTTP 401 |
| T5 | Nachricht ohne Auth senden: `POST /api/portal/messages` mit leerem Body | HTTP 400 oder 401 |
| T6 | DB-Konfiguration prüfen: `SESSIONS_DATABASE_URL` in ConfigMap | Variable konfiguriert |
| T7 | Messaging-Tabellen in DB prüfen: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'messaging'` | Tabellen `messages`, `rooms`, `room_members` vorhanden |
| T8 | Im Browser als eingeloggter Nutzer Chat öffnen und Nachricht schicken | Nachricht wird gesendet und empfangen |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-30: E-Rechnung / XRechnung (einvoice-sidecar)

> **Beschreibung:** Prüft den einvoice-sidecar-Service zum Einbetten von XRechnung-/ZUGFeRD-XML in PDF/A-3-Dokumente.

**Vorbedingungen:** einvoice-sidecar deployed, Test-Fixtures vorhanden (`website/test/fixtures/einvoice/`)

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Service erreichbar: `kubectl -n workspace get svc einvoice-sidecar` | Service mit ClusterIP vorhanden |
| T2 | /embed-Endpunkt: `POST http://einvoice-sidecar/embed` mit Base64-kodiertem PDF und XRechnung-XML | Gibt PDF/A-3 zurück, enthält `factur-x.xml`-Anhang |
| T3 | /validate-Endpunkt: `POST http://einvoice-sidecar/validate` mit dem erzeugten PDF | Gibt `{"ok": true}` zurück |
| T4 | Erzeugtes PDF im Browser öffnen | PDF öffnet sich, Anhang `factur-x.xml` vorhanden |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-31: Admin-Monitoring Auth-Gate (Produktionstest)

> **Beschreibung:** Prüft, dass das Admin-Monitoring-Dashboard unter `/admin/monitoring` durch Keycloak OIDC geschützt ist. Nur im Produktions-Tier (mentolder/korczewski) durchführbar.

**Vorbedingungen:** Produktionscluster läuft, `PROD_DOMAIN` gesetzt

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | URL ansprechen: `curl -sk -o /dev/null -w '%{http_code}' https://web.{DOMAIN}/admin/monitoring` | HTTP 200, 301, 302 oder 307 (erreichbar) |
| T2 | Unauthentifizierte Anfrage: Redirect-URL prüfen | Redirect zu `auth.{DOMAIN}/realms/workspace` |
| T3 | Im Browser `/admin/monitoring` ohne Login öffnen | Weiterleitung zur Keycloak-Loginseite |
| T4 | Als Admin einloggen und auf `/admin/monitoring` zugreifen | Dashboard wird angezeigt |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein Produktionscluster)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-32: LLM-Router bge-m3 Embeddings

> **Beschreibung:** Prüft, dass der LLM-Router 1024-dimensionale bge-m3-Vektoren liefert, wenn der TEI-Dienst aktiv ist.

**Vorbedingungen:** llm-router deployed (`prod/` Overlay), TEI-Dienst (llm-gateway-embed) erreichbar

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | llm-router-Pod prüfen: `kubectl get deploy llm-router -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert 1 |
| T2 | Embedding-Anfrage: `POST http://localhost:4000/v1/embeddings` mit `{"model":"bge-m3","input":"test"}` | Gibt 1024-dimensionalen Vektor zurück |
| T3 | Vektor-Dimension prüfen: `jq '.data[0].embedding \| length'` auf Antwort | Wert 1024 |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein LLM-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-33: LLM-Router voyage-multilingual-2

> **Beschreibung:** Prüft, dass voyage-multilingual-2-Embeddings über den LLM-Router verfügbar sind, unabhängig vom TEI-Status.

**Vorbedingungen:** llm-router deployed, Voyage-API-Key konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Embedding-Anfrage: `POST http://localhost:4000/v1/embeddings` mit `{"model":"voyage-multilingual-2","input":"capital of germany"}` | Gibt 1024-dimensionalen Voyage-Vektor zurück |
| T2 | Funktionalität auch bei deaktiviertem TEI prüfen | Voyage-Vektor wird trotzdem geliefert |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein LLM-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-34: LLM-Router strict-fail (kein silent fallback)

> **Beschreibung:** Prüft, dass der LLM-Router bei deaktiviertem TEI und Modell `bge-m3` einen 5xx-Fehler zurückgibt — kein stiller Fallback auf Voyage.

**Vorbedingungen:** llm-router deployed, Simulierter TEI-Ausfall möglich

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | TEI-Service (llm-gateway-embed Endpoints) deaktivieren/leer setzen | Endpoints leer |
| T2 | bge-m3-Embedding-Anfrage mit `purpose: index` senden | HTTP 5xx (kein 200, kein Voyage-Fallback) |
| T3 | TEI-Endpoints wiederherstellen | Endpoints wieder vorhanden |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein LLM-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-35: LLM MixedEmbeddingModelError

> **Beschreibung:** Prüft, dass gemischte Embedding-Modell-Collections (bge-m3 + voyage in einer Abfrage) explizit abgelehnt werden.

**Vorbedingungen:** Website läuft, `queryNearest`-Funktion im Website-Code

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | `MixedEmbeddingModelError`-Klasse im Website-Code prüfen | Klasse exportiert und benannt |
| T2 | Gemischte Multi-Collection-Abfrage (bge-m3 + voyage) ausführen | Fehler `MixedEmbeddingModelError` wird geworfen |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein LLM-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-36: Rerank-Endpunkt

> **Beschreibung:** Prüft den Reranking-Endpunkt des LLM-Routers: sortierte Ergebnisse, korrektes Top-1-Dokument.

**Vorbedingungen:** llm-router deployed, Rerank-Modell konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Rerank-Anfrage: `POST http://localhost:4000/v1/rerank` mit Query `"capital of germany"` und Dokumenten `["paris","berlin","hamburg","munich"]` | `berlin` auf Position 0 (Index 1) |
| T2 | Sortierung prüfen: `jq '.results[0].index'` | Wert 1 (`berlin`) |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein LLM-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-37: workspace-chat Roundtrip

> **Beschreibung:** Prüft den vollständigen Chat-Roundtrip über den LLM-Router mit einem 200-Token-Deutschen Prompt.

**Vorbedingungen:** llm-router deployed, Ollama mit Chat-Modell aktiv

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Chat-Anfrage (max. 90s Timeout): `POST http://localhost:4000/v1/chat/completions` mit Prompt `"Beschreibe die Stadt Hamburg in zwei Sätzen."` | Nicht-leere Antwort > 30 Zeichen |
| T2 | Antwortinhalt prüfen: `jq '.choices[0].message.content'` | Sinnvoller deutscher Text |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein LLM-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### FA-39: Arena DB-Schema und Service-Health

> **Beschreibung:** Prüft den Arena-Server: Pod-Status, Health-Endpunkt und Datenbank-Schema-Bootstrap.

**Vorbedingungen:** Arena-Server deployed (korczewski), PostgreSQL mit Arena-Schema

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Arena-Server-Pod prüfen: `kubectl get deploy arena-server -n workspace -o jsonpath='{.status.readyReplicas}'` | Wert > 0 |
| T2 | Health-Endpunkt: `GET /healthz` via Pod-Exec | `{"ok": true}` |
| T3 | Arena-Datenbank-Schema prüfen: `psql arena -c '\dt arena.*'` | Tabellen `arena.lobbies`, `arena.players` vorhanden |
| T4 | `task arena:status ENV=korczewski` ausführen | Status: Running |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### FA-40: Arena Spectator-join Smoke

> **Beschreibung:** Prüft, dass ein Spectator dem Arena-Server beitreten kann und das Protokoll valide ist.

**Vorbedingungen:** Arena-Server läuft, WebSocket-Client verfügbar

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Arena-Server-Pod prüfen | readyReplicas > 0 |
| T2 | WebSocket-Verbindung aufbauen und `{"type":"spectator:join","lobbyId":"smoke-test"}` senden | Server antwortet mit gültigem Protokoll-Paket |
| T3 | Verbindung ohne Fehler schließen | WebSocket trennt sauber |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

# Abschnitt 2: Sicherheitstests (SA)

---

### SA-01: Transportverschlüsselung

> **Beschreibung:** Prüft Ingress-Routing, Security-Header und TLS-Readiness. Vollständige TLS-Tests laufen im Produktions-Tier.

**Vorbedingungen:** Workspace-Stack deployed, Ingress konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Ingress für alle Services prüfen: `kubectl get ingress -n workspace` | Ingress für `auth`, `files`, `vault`, `board`, `meet` vorhanden |
| T2 | Services intern erreichbar (via Ingress oder Port-Forward) | HTTP 200, 302 oder 303 |
| T3 | Security-Header prüfen (Produktion): `curl -I https://web.{DOMAIN}` | `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` gesetzt |
| T4 | TLS-Zertifikat im Produktionscluster prüfen: `kubectl get cert -n workspace` | Zertifikat im Status `Ready` |
| T5 | Im Browser `https://web.{DOMAIN}` öffnen | Grünes Schloss (gültiges TLS-Zertifikat) |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-02: Authentifizierung

> **Beschreibung:** Prüft den Authentifizierungs-Mechanismus: falsches Passwort abgelehnt, OTP-Policy konfiguriert, Brute-Force-Schutz aktiv.

**Vorbedingungen:** Keycloak läuft, Workspace-Realm konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Login mit falschem Passwort: `POST /realms/workspace/protocol/openid-connect/token` mit `password=wrongpassword` | HTTP 401 |
| T2 | OTP-Policy prüfen: Keycloak Admin API → `GET /admin/realms/workspace` | `otpPolicyType` ist konfiguriert |
| T3 | Brute-Force-Schutz prüfen: `GET /admin/realms/workspace` → `bruteForceProtected` | Wert `true` |
| T4 | Im Browser mit falschem Passwort anmelden (5× wiederholen) | Konto wird temporär gesperrt |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-03: Passwörter (Hash, Policy, kein Klartext)

> **Beschreibung:** Prüft, dass Passwörter gehasht gespeichert werden, eine Policy konfiguriert ist und kein Klartext in Logs auftaucht.

**Vorbedingungen:** Keycloak läuft, Testbenutzer vorhanden

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Passwort-Hash in Keycloak-DB prüfen: `psql keycloak -tAc "SELECT value FROM credential WHERE type='password' LIMIT 1"` | Hash-Wert vorhanden (Länge > 0) |
| T2 | Passwort-Policy prüfen: Keycloak Admin API → `GET /admin/realms/workspace` | `passwordPolicy` enthält `length` und `specialChars` oder äquivalente Richtlinien |
| T3 | Keycloak-Logs auf Klartext-Passwörter prüfen: `kubectl logs deploy/keycloak -n workspace \| grep -i "password="` | Keine Klartext-Passwörter in Logs |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-04: Session-Timeout

> **Beschreibung:** Prüft, dass Session-Timeouts konfiguriert und DSGVO-konform eingestellt sind.

**Vorbedingungen:** Keycloak läuft, Admin-Token verfügbar

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1a | SSO Idle Timeout prüfen: `GET /admin/realms/workspace` → `ssoSessionIdleTimeout` | Wert ≤ 1800 Sekunden (30 Minuten) |
| T1b | SSO Idle Timeout positiv prüfen | Wert > 0 (konfiguriert) |
| T2 | Access Token Lifespan prüfen: `accessTokenLifespan` | Wert ≤ 3600 Sekunden (60 Minuten) |
| T3 | In der Browser-Session 30 Minuten inaktiv bleiben | Session läuft ab, Weiterleitung zum Login |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-05: Audit-Log

> **Beschreibung:** Prüft, dass Login-Events und Admin-Aktionen in Keycloak protokolliert werden.

**Vorbedingungen:** Keycloak läuft, Admin-Token verfügbar, mindestens ein Login-Versuch erfolgt

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Login-Event auslösen: Einmalig mit Test-Credentials einloggen | |
| T2 | Login-Events abrufen: `GET /admin/realms/workspace/events?type=LOGIN` | Mindestens 1 Event vom Typ `LOGIN` |
| T3 | Admin-Aktionen protokolliert: `GET /admin/realms/workspace/admin-events` | Mindestens 1 Admin-Event vorhanden |
| T4 | In Keycloak Admin UI unter `Events → Login Events` nachschauen | Login-Events sichtbar und filterbar |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-07: Backup (pg_dump, PVCs)

> **Beschreibung:** Prüft, dass Datenbankbackups und persistente Datenvolumina korrekt konfiguriert sind.

**Vorbedingungen:** Workspace-Stack deployed, PostgreSQL läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | pg_dump für Keycloak-DB: `kubectl exec deploy/shared-db -- pg_dump -U postgres --schema-only keycloak \| head -5` | Ausgabe beginnt mit `-- PostgreSQL database dump` |
| T2a | pg_dump für alle Datenbanken: keycloak dumpbar | pg_dump erfolgreich |
| T2b | pg_dump für nextcloud dumpbar | pg_dump erfolgreich |
| T3 | PVCs prüfen: `kubectl get pvc -n workspace` | Alle PVCs im Status `Bound` |
| T4 | Backup triggern: `task workspace:backup` | Backup-Dateien werden erzeugt |
| T5 | Backup-Liste anzeigen: `task workspace:backup:list` | Mindestens 1 Timestamp vorhanden |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-08: SSO-Integration (Keycloak OIDC)

> **Beschreibung:** Prüft die OIDC-Anbindung von Nextcloud und Nextcloud Talk an Keycloak.

**Vorbedingungen:** Keycloak und Nextcloud laufen, OIDC-Plugin in Nextcloud aktiv

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Keycloak OIDC Discovery: `GET /realms/workspace/.well-known/openid-configuration` | JSON mit `authorization_endpoint`, `token_endpoint` |
| T2 | Nextcloud OIDC-App aktiv: `occ app:list \| grep sso` | `user_oidc` in der Liste |
| T3 | Nextcloud OIDC-Provider konfiguriert: `occ user_oidc:provider:list` | Keycloak-Provider eingetragen |
| T4 | Nextcloud Talk OIDC: Signaling-Secret konfiguriert | Secret in Nextcloud Talk-Config |
| T5 | Im Browser Nextcloud über SSO-Login öffnen | Login via Keycloak funktioniert |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-10: MCP-Endpunkt-Absicherung (ForwardAuth)

> **Beschreibung:** Prüft, dass der MCP-ForwardAuth-Proxy Token-Validierung korrekt durchsetzt.

**Vorbedingungen:** MCP-Stack deployed, ForwardAuth-Proxy läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | ForwardAuth-Proxy-Pod prüfen | readyReplicas > 0 |
| T2 | Anfrage ohne Authorization-Header: `GET http://mcp-auth-proxy/auth` | HTTP 401 |
| T3 | Anfrage mit ungültigem Token: `GET http://mcp-auth-proxy/auth` mit `Authorization: Bearer invalid` | HTTP 401 |
| T4 | Anfrage mit gültigem Token (via Keycloak erhalten): `GET http://mcp-auth-proxy/auth` mit gültigem Bearer-Token | HTTP 200 |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-11: Arena non-admin 403

> **Beschreibung:** Prüft, dass ein nicht-Administrator-Benutzer keinen Zugriff auf administrative Arena-Endpunkte erhält.

**Vorbedingungen:** Arena-Server läuft, Keycloak mit Testbenutzer ohne Admin-Rolle, `ARENA_WS_URL` gesetzt

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Token für Nicht-Admin-Benutzer bei Keycloak holen: `POST /realms/workspace/token` mit `client_id=arena` | JWT-Token erhalten |
| T2 | `POST {ARENA_WS_URL}/lobby/open` mit dem Nicht-Admin-Token | HTTP 403 |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### SA-12: Korczewski-Realm JWT-Akzeptanz

> **Beschreibung:** Prüft, dass ein JWT aus dem korczewski-Keycloak-Realm vom Arena-Server (korczewski-Cluster) akzeptiert wird.

**Vorbedingungen:** Arena-Server auf korczewski deployed, Keycloak korczewski erreichbar, `ARENA_WS_URL` und `KEYCLOAK_KORCZEWSKI` gesetzt

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Token von korczewski Keycloak holen: `POST https://auth.korczewski.de/realms/workspace/protocol/openid-connect/token` | JWT-Token erhalten |
| T2 | Anfrage mit korczewski-Token an Arena-Server | HTTP 200 (Token akzeptiert) |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein korczewski-Cluster)

Bemerkungen: ______________________________________________________________________________________________

---

### SA-13: Untrusted JWT abgelehnt

> **Beschreibung:** Prüft, dass ein JWT, das mit einem unbekannten/gefälschten Schlüssel signiert wurde, vom Arena-Server mit 401 abgelehnt wird.

**Vorbedingungen:** Arena-Server läuft, Python mit `jwt`/`cryptography` verfügbar

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Selbst-signiertes JWT mit unbekanntem RSA-Key und `iss: https://untrusted.example.com` erzeugen | JWT erzeugt |
| T2 | Anfrage mit gefälschtem JWT an Arena-Server: `POST {ARENA_WS_URL}/lobby/open` | HTTP 401 (Token abgelehnt) |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

# Abschnitt 3: Nicht-funktionale Tests (NFA)

---

### NFA-01: Datenschutz / DSGVO

> **Beschreibung:** Prüft DSGVO-Konformität: keine US-Cloud-Images, keine externen Storage-Backends in Nextcloud, Telemetrie deaktiviert.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Container-Images prüfen: `kubectl get pods -n workspace -o jsonpath='{.items[*].spec.containers[*].image}'` | Keine Images von `gcr.io`, `amazonaws.com`, `azurecr.io`, `mcr.microsoft.com` |
| T2 | Nextcloud externe Storage-Backends prüfen: `occ config:list \| grep -E "amazons3\|azure"` | Keine externen Storage-Backends |
| T3 | Nextcloud Telemetrie prüfen: `occ config:system:get has_internet_connection` | Wert `false` oder nicht gesetzt |
| T4 | DSGVO-Check ausführen: `task workspace:dsgvo-check` | Alle Checks bestanden |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-02: Performance / Antwortzeiten

> **Beschreibung:** Prüft Antwortzeiten der wichtigsten Dienste. Schwellenwerte: API < 3 s (k3d), < 1 s (Produktion); Seitenaufbau < 5 s.

**Vorbedingungen:** Workspace-Stack deployed und stabil

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1a | Keycloak Health-Antwortzeit messen: `time curl -s {KC_URL}/health/ready` | HTTP 200 |
| T1b | Keycloak Antwortzeit | < 3000 ms (k3d) / < 1000 ms (Prod) |
| T2 | Vaultwarden Antwortzeit: `time curl -s http://vaultwarden/alive` | < 3000 ms |
| T3 | Website Ladezeit: `time curl -s http://web.localhost/` | < 5000 ms |
| T4 | Core Web Vitals im Browser messen (Chrome DevTools → Lighthouse) | LCP < 2,5 s; FID < 100 ms |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-03: Verfügbarkeit und Neustart-Resilienz

> **Beschreibung:** Prüft automatischen Neustart nach Pod-Terminierung und Datenpersistenz.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Vaultwarden-Pod hart beenden: `kubectl delete pod -n workspace -l app=vaultwarden --force --grace-period=0` | Pod wird gelöscht |
| T2 | 10 Sekunden warten, dann Deployment prüfen: `kubectl get deploy vaultwarden -n workspace` | `readyReplicas` = 1 (automatisch neugestartet) |
| T3 | Vaultwarden nach Neustart erreichbar: `GET http://vaultwarden/alive` | HTTP 200 |
| T4 | Daten prüfen: Zuvor angelegte Einträge in Vaultwarden noch vorhanden | Daten persistent (PVC) |
| T5 | Health-Endpunkte aller Services prüfen: `kubectl get pods -n workspace` | Alle Pods im Status `Running` |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-04: Skalierbarkeit

> **Beschreibung:** Prüft horizontale Skalierung von Deployments und Rolling-Update-Strategie.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Vaultwarden auf 2 Replicas skalieren: `kubectl scale deploy/vaultwarden -n workspace --replicas=2` | Skalierung startet |
| T2 | Rollout-Status abwarten: `kubectl rollout status deploy/vaultwarden -n workspace` | `readyReplicas` = 2 |
| T3 | Service nach Skalierung erreichbar: `GET http://vaultwarden/alive` | HTTP 200 |
| T4 | Replica auf 1 zurücksetzen: `kubectl scale deploy/vaultwarden -n workspace --replicas=1` | Zurückgesetzt |
| T5 | Rolling-Update-Strategie prüfen: `kubectl get deploy -n workspace -o jsonpath='{.items[*].spec.strategy.type}'` | Alle Deployments mit `RollingUpdate` |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-05: Usability / Deutsche Lokalisierung

> **Beschreibung:** Prüft die Benutzerfreundlichkeit: deutsche Standardsprache, Barrierefreiheit, Ladezeiten.

**Vorbedingungen:** Workspace-Stack deployed, Nextcloud konfiguriert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Nextcloud Standard-Sprache prüfen: `kubectl exec deploy/nextcloud -- occ config:system:get default_language` | Wert `de` |
| T2 | Website-Ladezeit unter 5 s: `time curl -s http://web.localhost/` | HTTP 200, < 5000 ms |
| T3 | Nextcloud-Oberfläche auf Deutsch: Im Browser `https://files.{DOMAIN}` öffnen | Menüs und Schaltflächen auf Deutsch |
| T4 | Mobile Darstellung prüfen: Browser-DevTools → Responsive Mode (375 px) | Seite ist mobil nutzbar, keine horizontale Scroll-Bar |
| T5 | Tastaturnavigation prüfen: Tab-Taste durch interaktive Elemente navigieren | Fokus-Indikator sichtbar, logische Reihenfolge |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-06: Website Neustart-Resilienz

> **Beschreibung:** Prüft, dass der Website-Service nach einem Rollout-Neustart wieder erreichbar ist.

**Vorbedingungen:** Website-Pod läuft

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Website-Deployment neu starten: `kubectl rollout restart deploy/website -n website` | Antwort enthält "restarted" |
| T2 | Rollout abwarten: `kubectl rollout status deploy/website -n website --timeout=60s` | Rollout abgeschlossen |
| T3 | Website nach Neustart erreichbar: `kubectl get deploy website -n website -o jsonpath='{.status.readyReplicas}'` | readyReplicas > 0 |
| T4 | Website-Logs verfügbar: `kubectl logs deploy/website -n website --tail=10` | Logs werden ausgegeben |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-07: Open-Source-Lizenz

> **Beschreibung:** Prüft, dass alle verwendeten Komponenten unter anerkannten Open-Source-Lizenzen stehen.

**Vorbedingungen:** Workspace-Stack deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1a | Keycloak-Image vorhanden: `kubectl get pods -n workspace -o jsonpath='{.items[*].spec.containers[*].image}' \| tr ' ' '\n' \| grep keycloak` | keycloak-Image gelistet |
| T1b | Nextcloud-Image vorhanden | nextcloud-Image gelistet |
| T1c | PostgreSQL-Image vorhanden | postgres-Image gelistet |
| T2 | Keine proprietären Images: `\| grep -E "microsoft\|google\|amazon\|zoom\|slack"` | Keine Treffer |
| T3 | Lizenzdatei im Repo prüfen: `cat LICENSE` | Anerkannte Open-Source-Lizenz (MIT / Apache 2.0 / GPL) |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-08: Produktions-Deployment (Hetzner/k3s)

> **Beschreibung:** Prüft, dass die Produktions-Infrastruktur (Overlays, Patches, cert-manager) vollständig vorhanden ist.

**Vorbedingungen:** Repository geklont

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | prod/-Verzeichnis prüfen: `test -d prod && echo exists` | Ausgabe: `exists` |
| T2 | YAML-Dateien in prod/ prüfen: `find prod -name '*.yaml' \| wc -l` | Wert > 0 |
| T3 | cert-manager Tasks prüfen: `grep cert: Taskfile.yml` | cert-manager Targets vorhanden |
| T4 | Manifest-Validierung: `task workspace:validate` | Keine Fehler |
| T5 | Auf Produktionscluster deployen: `task workspace:deploy ENV=mentolder` | Deploy erfolgreich |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-09: Statisches DNS (kein DDNS)

> **Beschreibung:** Prüft, dass statische IPs verwendet werden, kein DDNS-CronJob benötigt wird und das Wildcard-TLS-Zertifikat korrekt konfiguriert ist.

**Vorbedingungen:** Produktionsinframerkmal

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Kein DDNS-Updater-Manifest: `test -f prod/ddns-updater.yaml && echo exists \|\| echo missing` | Ausgabe: `missing` |
| T2 | Wildcard-Zertifikat-Manifest: `test -f prod/wildcard-certificate.yaml && echo exists` | Ausgabe: `exists` |
| T3 | ClusterIssuer nutzt ipv64: `grep -c ipv64 prod/cluster-issuer.yaml` | Wert > 0 |
| T4 | TLS-Zertifikat im Produktionscluster: `kubectl get cert -n workspace` | Zertifikat im Status `Ready` |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-10: Arena Health-Endpoint Performance

> **Beschreibung:** Prüft, dass der Arena-Server-Health-Endpunkt unter Last performant antwortet (p95 < 200 ms über 50 Requests).

**Vorbedingungen:** Arena-Server läuft, `ARENA_WS_URL` gesetzt

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | 50 sequenzielle Requests an `/healthz` senden und Zeiten messen | Alle Requests erfolgreich (HTTP 200) |
| T2 | p95 der Antwortzeiten berechnen | p95 < 200 ms |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-11: GPU-VRAM nach Modell-Rotation

> **Beschreibung:** Prüft, dass nach sequenziellem Laden aller 4 Ollama-Modelle der GPU-VRAM unter 14 GB bleibt und TEI-Dienste weiterhin antworten.

**Vorbedingungen:** GPU-Host über WireGuard erreichbar (`LLM_HOST_IP`), Ollama aktiv, SSH-Key vorhanden

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Alle 4 Modelle sequenziell laden: `qwen2.5:14b`, `qwen2.5-coder:14b`, `qwen2.5vl:7b`, `llama3.2:3b` | Jedes Modell antwortet |
| T2 | VRAM-Nutzung prüfen: `nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits` | Wert < 14336 MiB (14 GB) |
| T3 | TEI-Dienste prüfen: `GET http://{LLM_HOST_IP}:8081/health` | HTTP 200 |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (kein GPU-Host)

Bemerkungen: ______________________________________________________________________________________________

---

### NFA-12: Brainstorm-Tunnel ConfigMap-Persistenz

> **Beschreibung:** Prüft, dass die `brainstorm-sish-authorized-keys` ConfigMap Flux-Reconciliation überlebt und der Tunnel nach Pod-Neustart authentifiziert.

**Vorbedingungen:** Brainstorm-sish deployed (mentolder), SSH-Key in ConfigMap eingetragen

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | ConfigMap vor Flux-Reconciliation prüfen: `kubectl get cm brainstorm-sish-authorized-keys -n workspace` | ConfigMap vorhanden |
| T2 | Flux-Reconciliation auslösen: `flux reconcile kustomization workspace` | Reconciliation abgeschlossen |
| T3 | ConfigMap nach Reconciliation prüfen | ConfigMap noch vorhanden (nicht überschrieben) |
| T4 | sish-Pod neu starten | Pod startet neu |
| T5 | SSH-Tunnel nach Neustart aufbauen: `task brainstorm:publish -- <localport>` | Tunnel funktioniert, Authentifizierung erfolgreich |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen  ☐ Entfällt (Brainstorm nicht deployed)

Bemerkungen: ______________________________________________________________________________________________

---

# Abschnitt 4: Abnahmetests (AK)

---

### AK-03: Technische Machbarkeit

> **Beschreibung:** Prüft, dass die Plattform grundsätzlich funktioniert: Pods laufen, stabile Image-Tags werden verwendet.

**Vorbedingungen:** k3d-Cluster läuft, Workspace deployed

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Laufende Pods zählen: `kubectl get pods -n workspace --no-headers \| grep -c Running` | Mindestens 1 Pod im Status `Running` |
| T2 | Image-Tags prüfen: `kubectl get pods -n workspace -o jsonpath='{.items[*].spec.containers[*].image}' \| tr ' ' '\n'` | Keine `:latest`-Tags (außer curlimages/curl) |
| T3 | Alle Core-Services erreichbar: Keycloak, Nextcloud, Vaultwarden | Alle antworten mit HTTP 200/302 |
| T4 | Cluster-Status: `task workspace:status` | Alle Pods `Ready` |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

### AK-04: Prototyp-Betrieb

> **Beschreibung:** Prüft den vollständigen Prototyp-Betrieb: Setup-Skript, keine proprietären Abhängigkeiten.

**Vorbedingungen:** Repository geklont, Docker und k3d installiert

| Schritt | Aktion | Erwartetes Ergebnis |
|---------|--------|---------------------|
| T1 | Voraussetzungen prüfen: `docker --version && k3d version && kubectl version --client` | Alle Tools vorhanden |
| T2 | Setup-Skript testen: `scripts/setup.sh --check` | Prüfung besteht ohne Fehler |
| T3 | Keine proprietären Images: `kubectl get pods -n workspace -o ... \| grep -E "microsoft\|google\|amazon\|zoom\|slack"` | Keine Treffer |
| T4 | Vollständiger Setup von null: `task workspace:up` auf frischem Cluster | Alle Services starten erfolgreich |
| T5 | DSGVO-Compliance-Check: `task workspace:dsgvo-check` | Alle Checks bestanden |

**Befund:**

Tatsächliches Ergebnis: ______________________________________________________________________________________________

Status: ☐ Bestanden  ☐ Fehlgeschlagen  ☐ Übersprungen

Bemerkungen: ______________________________________________________________________________________________

---

# Abschnitt 5: Gesamtergebnis

## Ergebnisübersicht

| Kategorie | Gesamt | Bestanden | Fehlgeschlagen | Übersprungen | Entfällt |
|-----------|--------|-----------|----------------|--------------|----------|
| Funktionale Tests (FA) | 27 | | | | 8 |
| Sicherheitstests (SA) | 11 | | | | |
| Nicht-funktionale Tests (NFA) | 12 | | | | |
| Abnahmetests (AK) | 2 | | | | |
| **Gesamt** | **52** | | | | **8** |

## Abschlussbewertung

**Gesamtstatus:**

☐ Alle Tests bestanden — Plattform freigegeben  
☐ Einzelne Tests fehlgeschlagen — Nachbesserung erforderlich (siehe Bemerkungen)  
☐ Kritische Tests fehlgeschlagen — Abnahme verweigert

**Kritische Abweichungen / offene Punkte:**

______________________________________________________________________________________________

______________________________________________________________________________________________

______________________________________________________________________________________________

## Unterschriften

| Rolle | Name | Datum | Unterschrift |
|-------|------|-------|--------------|
| Tester | | | |
| Betreuer / Prüfer | | | |
| Entwickler | | | |

---

*Dieses Dokument wurde automatisch aus den Test-Skripten in `tests/local/` und `tests/prod/` generiert.*  
*Testrahmen-Version: Bachelorprojekt Workspace · Mai 2026*
