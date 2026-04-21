# Testframework & Test-IDs

## Überblick

Das Testframework besteht aus drei Schichten:

- **Bash-Tests** (`tests/local/` und `tests/prod/`): Infrastruktur- und Integrationstests, die direkt gegen den laufenden Cluster ausgeführt werden.
- **Playwright E2E-Tests** (`tests/e2e/`): Browser-basierte End-to-End-Tests.
- **Orchestrierer** (`tests/runner.sh`): Koordiniert alle Testschichten, schreibt Ergebnisse nach `tests/results/` und erzeugt Markdown-Reports.

Zwei Tier-Umgebungen:

| Tier | Cluster | Zweck |
|------|---------|-------|
| `local` | k3d | Entwicklung, CI-Vorprüfung |
| `prod` | k3s (Hetzner) | Produktionsprüfung |

Abhängigkeiten für die lokale Ausführung: `kubectl`, `jq`, `curl`.

---

## Tests ausführen

```bash
./tests/runner.sh local              # Vollständige lokale Testsuite (k3d)
./tests/runner.sh local FA-03        # Einzelner Test
./tests/runner.sh local SA-01 NFA-02 # Mehrere Tests
./tests/runner.sh local --verbose    # Ausführliche Ausgabe
./tests/runner.sh prod               # Produktions-Tier (k3s)
./tests/runner.sh prod SA-01 NFA-08  # Einzelner Prod-Test
./tests/runner.sh report             # Markdown-Report generieren
```

**Voraussetzung:** k3d-Cluster läuft und der Stack ist deployed.

```bash
task cluster:create
task workspace:deploy
./tests/runner.sh local
```

---

## Funktionale Tests (FA)

| ID | Beschreibung |
|----|-------------|
| FA-01 | Messaging (Echtzeit) — Direktnachrichten, Gruppenräume, WebSocket-Persistenz |
| FA-02 | Kanäle / Workspaces — öffentliche und private Kanäle, Teams |
| FA-03 | Videokonferenzen — Nextcloud Talk HPB (Signaling, DNS, coturn, Gast-Zugang) |
| FA-04 | Dateiablage — Datei-Upload via API, Persistenz nach Neustart |
| FA-05 | Nutzerverwaltung — anlegen, Rollen, SSO, deaktivieren |
| FA-06 | Benachrichtigungen — Push-Konfiguration, Stummschalten, DND, @mention |
| FA-07 | Suche — Nachrichten, Dateien, Kanäle durchsuchen |
| FA-08 | Workspace-spezifisch — benutzerdefinierter Status |
| FA-09 | Billing-Infrastruktur — Manifest-Validierung (übersprungen, nicht mehr aktiv) |
| FA-10 | Kundenanfragen-Kontaktformular — Website-Kontaktformular + Admin-Inbox |
| FA-11 | Kunden-Portal — Infrastruktur und Keycloak-Integration |
| FA-12 | Claude Code AI Assistant — MCP-Infrastruktur, ForwardAuth, Statusseite |
| FA-13 | Dokumentation — Docs-Service-Infrastruktur |
| FA-14 | User Registration Flow — Registrierungsseite der Website |
| FA-15 | OIDC Website Login — Auth-Endpunkte, Keycloak-Client |
| FA-16 | Calendar Booking — Slots-API, Booking-API, CalDAV-Konfiguration |
| FA-17 | Meeting Lifecycle — Talk-Raum, Kanäle, Erinnerungen |
| FA-18 | Meeting Transcription — Whisper-Deployment (faster-whisper) |
| FA-20 | Meeting Finalization Pipeline — Abschluss-Workflow nach Meeting |
| FA-21 | Service Catalog — Leistungsseite mit Preisen |
| FA-22 | Stripe Payment Gateway — Stripe-Integration |
| FA-23 | Vaultwarden Passwort-Manager — Deployment, SSO, Seed, Datenbank |
| FA-24 | Kollaboratives Whiteboard — Nextcloud Whiteboard Deployment |
| FA-25 | Mailpit E-Mail-Server — SMTP-Relay und Web-UI |
| FA-26 | Bug Report Form — Bug-Report-Endpunkt der Website |

---

## Sicherheitstests (SA)

| ID | Beschreibung |
|----|-------------|
| SA-01 | Transportverschlüsselung — Ingress-Routing, Security-Header, TLS-Bereitschaft (lokaler Tier); volle TLS-Tests im prod-Tier |
| SA-02 | Authentifizierung — Login, fehlgeschlagene Versuche, Kontosperre |
| SA-03 | Passwörter — bcrypt-Hash, Passwort-Policy, kein Klartext in Logs |
| SA-04 | Session-Timeout — Token-Laufzeit, Session-Konfiguration in Keycloak |
| SA-05 | Audit-Log — Login-Events, Admin-Aktionen protokolliert |
| SA-06 | RBAC — Rollenberechtigungen, Gast-Einschränkungen (übersprungen: Mattermost entfernt) |
| SA-07 | Backup — pg_dump, PVCs, Backup-Bereitschaft |
| SA-08 | SSO-Integration — Keycloak OIDC für Nextcloud und Talk |
| SA-09 | Billing-Infrastruktur — übersprungen, da Invoice Ninja aus dem Stack entfernt |
| SA-10 | MCP-Endpunkt-Absicherung — ForwardAuth Token-Validierung |

---

## Nicht-funktionale Tests (NFA)

| ID | Beschreibung |
|----|-------------|
| NFA-01 | Datenschutz / DSGVO — GDPR-Compliance, keine Cloud-Images aus US-Providern, Telemetrie-Check |
| NFA-02 | Performance — Antwortzeiten, Ressourceneffizienz |
| NFA-03 | Verfügbarkeit — Neustart-Erholung, Health-Endpunkte, Datenpersistenz |
| NFA-04 | Skalierbarkeit — Replikate skalieren, Rolling-Update-Strategie |
| NFA-05 | Usability — Deutsche Lokalisierung, Barrierefreiheit, Ladezeiten |
| NFA-06 | Neustart-Resilienz — Website-Service erholt sich nach Neustart |
| NFA-07 | Lizenz — alle Komponenten unter anerkannten Open-Source-Lizenzen |
| NFA-08 | Produktions-Deployment (Hetzner) — k3s, TLS, cert-manager (lokaler Tier prüft Manifeste) |
| NFA-09 | Dynamisches DNS (DDNS) — CronJob-Manifest und Konfiguration |

---

## Abnahmetests (AK)

| ID | Beschreibung |
|----|-------------|
| AK-03 | Technische Machbarkeit — k3d-Pods laufen, stabile Image-Tags |
| AK-04 | Prototyp-Betrieb — `setup.sh --check`, keine proprietären Abhängigkeiten |

---

## Playwright E2E-Tests

Spec-Dateien in `tests/e2e/specs/`:

| Datei | Beschreibung |
|-------|-------------|
| `fa-01-messaging.spec.ts` | Messaging-Flows |
| `fa-03-video.spec.ts` | Video-Call-Tests |
| `fa-04-files.spec.ts` | Datei-Upload und -Freigabe |
| `fa-05-user-mgmt.spec.ts` | Benutzerverwaltung |
| `fa-07-search.spec.ts` | Suchfunktion |
| `fa-10-website.spec.ts` | Website-Grundfunktionen |
| `fa-12-claude-code.spec.ts` | Claude Code AI |
| `fa-14-registration.spec.ts` | Registrierungsformular |
| `fa-15-oidc.spec.ts` | OIDC-Login-Flow |
| `fa-16-booking.spec.ts` | Terminbuchung |
| `fa-17-meeting.spec.ts` | Meeting-Lifecycle |
| `fa-18-transcription.spec.ts` | Meeting-Transkription |
| `fa-20-finalize.spec.ts` | Meeting-Abschluss |
| `fa-23-vaultwarden.spec.ts` | Vaultwarden |
| `fa-24-whiteboard.spec.ts` | Whiteboard |
| `fa-25-mailpit.spec.ts` | Mailpit |
| `fa-26-bug-report-form.spec.ts` | Bug-Report-Formular |
| `sa-02-auth.spec.ts` | Authentifizierungs-Tests |
| `sa-08-sso.spec.ts` | SSO-Flow |
| `sa-10-mcp-auth.spec.ts` | MCP-Authentifizierung |
| `nfa-05-usability.spec.ts` | Usability-Checks |
| `integration-smoke.spec.ts` | Smoke-Test über alle Services |
| `fa-client-portal.spec.ts` | Kunden-Portal |
| `fa-document-signing.spec.ts` | Dokument-Signierung |
| `fa-meeting-history.spec.ts` | Meeting-Historie |
| `fa-slot-widget.spec.ts` | Slot-Widget |

**Playwright-Tests ausführen:**

```bash
cd tests/e2e
npx playwright test --project=chromium
npx playwright test fa-15-oidc.spec.ts   # Einzelne Spec
npx playwright test --headed             # Mit sichtbarem Browser
```

Konfiguration: `tests/e2e/playwright.config.ts`

---

## Testergebnisse

Ergebnisse werden in `tests/results/` gespeichert. Der Markdown-Report wird mit folgendem Befehl erzeugt:

```bash
./tests/runner.sh report
```

Das erzeugte Dokument enthält Test-ID, Beschreibung, Status (PASS / FAIL / SKIP), Laufzeit und Fehlermeldungen bei Fehlschlägen. Einzelne Test-Logs liegen als `tests/results/<ID>.log`.
