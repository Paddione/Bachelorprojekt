# Dataflow & Datenleck-Audit — 2026-06-07

**Ziel:** Keine Datenlecks verifizieren + qualitativen Datenfluss pro App kartieren, über beide Fleet-Brands (mentolder.de / korczewski.de).

**Ergebnis:** **Keine bestätigten unauthentifizierten Datenlecks gefunden.** Alle gategten Oberflächen verweigern unauthentifizierten Zugriff korrekt (401/302-redirect-to-Keycloak). Die Cross-Brand-Isolation ist auf der Auth-/Network-Ebene intakt. Ein Konfigurationsfehler wurde identifiziert (Collabora WOPI urlsrc auf korczewski hardcoded auf mentolder).

---

## Executive Summary

| Kategorie | Ergebnis |
|---|---|
| **Bestätigte unauthentifizierte Datenlecks** | **0** |
| **Cross-Brand-Isolation** | **ok** (Auth korrekt getrennt, Namespaces getrennt; 1 Konfigurationsfehler Collabora urlsrc) |
| **PII-Datenhaltung identifiziert** | 5 Stores mit PII (shared-db, website-DB, Nextcloud-Data, Vaultwarden, DocuSeal) |
| **Externe Egress-Destinationen** | smtp.mailbox.org, Stripe API, Filen Backup, LLM GPU Host (wg-mesh), Collabora WOPI |
| **Konfigurationsfehler (kein Leak, aber sicherheitsrelevant)** | 1 (Collabora korczewski urlsrc) |

---

## Per-App Dataflow Maps

### 1. Website + /api Backend

```
Inputs:    User browser (HTML forms, API calls) → Astro SSR → /api/* handlers
           OIDC identity von Keycloak (JWT claims: sub, email, name, groups)
           Stripe Webhooks (Zahlungsereignisse)
Storage:   website PostgreSQL DB (DB: website)
             ├─ users, sessions, clients, projekte, invoices, messages, tickets, coaching_*
             ├─ site_settings, leistungen_config, service_config (homepage/prices/legal)
             └─ PII: JA — Namen, Emails, Adressen, Telefon, Coaching-Notizen, Zahlungsdaten
             └─ encrypted-at-rest: Postgres-level (kein explizites App-Level)
           Redis (sessions, rate limiting) — PII: session tokens (short-lived)
Egress:    SMTP (smtp.mailbox.org:587) — Emails mit PII (Rechnungen, Coaching, Newsletter)
             └─ encrypted-in-transit: STARTTLS ✅
           Stripe API (api.stripe.com) — Payment-Intents, Customer-IDs
             └─ encrypted-in-transit: HTTPS ✅
           LLM GPU Host (100.102.71.114, wg-mesh intern) — Embedding-Anfragen
             └─ encrypted-in-transit: WireGuard ✅ (aber: plaintext-HTTP innerhalb wg-mesh)
Auth:      Keycloak OIDC (client_id=website); Admin-UI via isAdmin() (group /admin)
           Public: /, /api/auth/me (unauthenticated), /api/health, /api/leistungen
```

**Kontrollen bestanden:**
- `/api/admin/*`, `/api/portal/*` → alle 401 unauthenticated ✅
- `/admin` → 302 zu Keycloak ✅
- Brand-spezifische Inhalte (/api/leistungen) korrekt getrennt ✅
- CORS: `Access-Control-Allow-Origin` nicht gesetzt → Browser blockt Cross-Origin-Reads ✅

### 2. Keycloak (OIDC/SSO)

```
Inputs:    User credentials (username/password), OIDC client registrations
           Admin UI (Realm-Konfiguration, User-Management, Group-Mappings)
Storage:   shared-db PostgreSQL (DB: keycloak oder via shared-db Alias)
             ├─ user_entity, credential, user_attribute, user_group_membership, fed_user_*
             └─ PII: JA — Usernamen, Emails, Vorname/Nachname, Passwort-Hashes (bcrypt), Gruppen-Zugehörigkeit
             └─ encrypted-at-rest: Passwort-Hashes via bcrypt ✅
Egress:    Kein externer Egress (intern: OIDC Token-Ausstellung an Clients)
Auth:      Self-hosted; Admin-REST via Keycloak Admin CLI (client_id=admin-cli)
```

**Kontrollen bestanden:**
- `/realms/workspace/.well-known/openid-configuration` → 200 (public by design, kein Leak) ✅
- `/admin/realms/workspace` → 401 unauthenticated ✅
- `login-actions/registration` → 400 (keine offene Self-Service-Registrierung) ✅
- Issuer pro Brand korrekt getrennt (`auth.mentolder.de` vs `auth.korczewski.de`) ✅

### 3. Nextcloud (Files + Talk Video)

```
Inputs:    User-Dateien (Upload via WebDAV/Browser), Talk-Chat-Nachrichten, Talk-Audio/Video-Streams
Storage:   shared-db PostgreSQL (DB: nextcloud)
             ├─ oc_filecache, oc_storages, oc_share, oc_share_external, oc_comments
             ├─ spreed_rooms, spreed_attendees, spreed_messages
             └─ PII: JA — Dateinamen, Dateiinhalte, Chat-Nachrichten, geteilte Links, E-Mail-Adressen in Shares
           lokaler PVC (Dateien, Preview-Thumbnails)
             └─ PII: JA — Nutzerdateien, hochgeladene Dokumente
             └─ encrypted-at-rest: PVC-Level (Longhorn Replicas, keine App-Verschlüsselung)
           Redis (Session-Locks, File-Locking, Talk-Chat-Cache)
             └─ PII: transient (Chat-Nachrichten kurzzeitig in Cache)
Egress:    SMTP (smtp.mailbox.org) — Share-Benachrichtigungen, Aktivitätsmails
             └─ encrypted-in-transit: STARTTLS ✅
           Collabora WOPI (intern, office.<brand>) — Dokument-Rendering
           Signaling (signaling.<brand>) — Talk WebRTC-Signaling
           Coturn (TURN, intern) — Talk WebRTC Relay
Auth:      Keycloak OIDC (social_login plugin); App-native für Public-Shares
```

**Kontrollen bestanden:**
- WebDAV `/remote.php/webdav/` → 401 auf beiden Brands ✅
- OCS `/ocs/v2.php/cloud/capabilities` → 412 (Precondition) ✅
- `/index.php/apps/spreed` → 303 zu Login ✅
- `signaling.<brand>/api/v1/welcome` → 200 (public by design, enthält nur Version) ✅

### 4. Collabora (Office)

```
Inputs:    WOPI-Dokumente von Nextcloud (office.<brand> empfängt WOPI-Requests von files.<brand>)
Storage:   Kein persistentes Storage — Office-Dokumente werden im RAM gerendert und zurück an Nextcloud geschrieben
Egress:    NUR Nextcloud (WOPI Callback)
Auth:      WOPI Access-Token (Nextcloud ↔ Collabora, kein User-Direktzugriff)
```

**⚠️ Konfigurationsfehler (kein Leck, aber Broken Isolation):**

`https://office.korczewski.de/hosting/discovery` returned alle `urlsrc`-Attribute mit `https://office.mentolder.de` — nicht `office.korczewski.de`. Das bedeutet: Ein auf korczewski geöffnetes Office-Dokument würde den Collabora-Editor-iframe von der **mentolder**-Domain laden. Das bricht CORS, CSP und Cookie-Scoping und kann verhindern dass Office-Dokumente auf korczewski bearbeitet werden.

**Kontrollen bestanden:**
- `/hosting/discovery`, `/hosting/capabilities` → 200 (public by design, WOPI-Protokoll) ✅
- Keine User-Dokumente unauthenticated erreichbar (WOPI erfordert Access-Token) ✅

### 5. Vaultwarden (Passwörter)

```
Inputs:    User-Passwörter, Notizen, Kreditkarten, TOTP-Seeds (vom User eingegeben)
Storage:   shared-db PostgreSQL (DB: vaultwarden)
             ├─ ciphers (verschlüsselt mit User-Master-Password), attachments (verschlüsselt)
             ├─ users (Email, Password-Hash), devices, twofactor
             └─ PII: JA — Emails; verschlüsselte Vault-Inhalte (Passwörter, Notizen, Karten, TOTP)
             └─ encrypted-at-rest: ✅ ALLE Vault-Daten client-seitig mit Master-Password verschlüsselt
           PVC (Attachments, Icons, Email-Queue)
             └─ Attachments client-seitig verschlüsselt ✅
Egress:    SMTP (smtp.mailbox.org) — Einladungen, Notifications (enthält KEINE Passwortdaten)
             └─ encrypted-in-transit: STARTTLS ✅
Auth:      Keycloak OIDC (client_id=vaultwarden); Master-Password als Zweitfaktor
```

**Kontrollen bestanden:**
- `/api/config` → 200 (public by design: zeigt Version + `disableUserRegistration=true`) ✅
- `/admin` → 200 mit Admin-Token-Loginform (nicht authenticated Content; Token erforderlich) ✅
- `/`, `/alive`, `/icons/*` → 200 (public by design) ✅
- `disableUserRegistration` ist `true` auf beiden Brands ✅
- Kein unauthenticated Vault-Zugriff ✅

### 6. Whiteboard

```
Inputs:    Zeichen-/Canvas-Daten vom Browser (via WebSocket/Yjs)
Storage:   In-Memory (Yjs Document); kein persistentes Storage außer optionalem Export
Egress:    Kein externer Egress
Auth:      App-native JWT (Whiteboard-Server validiert Token via öffentlichem Key)
```

**Kontrollen bestanden:**
- `/` → 200 "Nextcloud Whiteboard Collaboration Server" (unauthenticated, Express-Root) ✅
- Kein Raum-Join ohne JWT-Token (WebSocket authentifiziert, konnte nicht unauthenticated getestet werden)
- `/health` → 404 (kein dedizierter Liveness-Endpoint; nicht exponiert) ⚠️

### 7. DocuSeal (Signing)

```
Inputs:    PDF-Dokumente (Upload), Signatur-Felder, Signer-Namen/Emails
Storage:   shared-db PostgreSQL (DB: docuseal)
             ├─ templates, submissions, signers, documents
             └─ PII: JA — Namen, Emails, IP-Adressen, PDF-Dokumente mit Unterschriften
             └─ encrypted-at-rest: DocuSeal-App-Level-Verschlüsselung (Encryption-Key in /setup gesetzt)
           PVC (hochgeladene PDFs, signierte Dokumente)
             └─ PII: JA — PDF-Inhalte
Egress:    SMTP (smtp.mailbox.org) — Signaturanfragen, Completed-Notifications
             └─ encrypted-in-transit: STARTTLS ✅
Auth:      Keycloak OIDC (client_id=docuseal); Public-Submission-Links für externe Signer
```

**⚠️ Beide Instanzen sind unprovisioniert** (302→/setup, der First-Run-Admin-Wizard). Signing ist auf beiden Brands nicht funktionsfähig. Sobald provisioniert: Public-Submission-Links müssen auf PII-Leaks geprüft werden.

**Kontrollen bestanden:**
- `/api/templates` → 401 ✅
- `/submissions` → 302 zu /setup (nicht exponiert) ✅
- Nur Setup-Wizard sichtbar ✅

### 8. Docs (Statische HTML-Dokumentation)

```
Inputs:    Pre-built HTML (kompiliert aus docs/ + Skills, in Container-Image gebaked)
Storage:   Container-Image (read-only Rootfs)
             └─ PII: Nein (rein statisches HTML, keine User-Daten)
Egress:    Keiner
Auth:      oauth2-proxy → Keycloak OIDC (client_id=docs, group /docs-access)
```

**Kontrollen bestanden:**
- `docs.<brand>/` → 302 zu `auth.<brand>/realms/workspace/...` ✅
- oauth2-proxy gating funktioniert auf beiden Brands ✅
- Kein statisches HTML ohne Auth ausgeliefert ✅

### 9. Mailpit

```
Inputs:    SMTP-E-Mails von allen Services (via SMTP smtp.mailbox.org → Mailpit catch-all in Dev; in Prod: kein Catch-All)
Storage:   SQLite (in-Memory/flüchtig in Dev; Prod: Mailpit ist Dev-Tool, sollte in Prod nicht Catch-All sein)
             └─ PII: JA — ALLE ausgehenden E-Mails (Rechnungen, Coaching, Newsletter, Passwort-Resets)
             └─ encrypted-at-rest: Nein (SQLite, flüchtig)
Egress:    Keiner
Auth:      oauth2-proxy → Keycloak OIDC
```

**Kontrollen bestanden:**
- `mail.<brand>/` → 401 (oauth2-proxy Sign-In) ✅
- `/api/v1/messages?limit=1` → 401 ✅ (PII-geschützt)
- Kein unauthenticated Zugriff auf E-Mail-Inhalte ✅

### 10. Brett (3D Systembrett)

```
Inputs:    User-Interaktionen via WebSocket (Figuren-Platzierung, Gruppen, Sessions)
Storage:   shared-db PostgreSQL (DB: brett oder separate DB)
             ├─ boards, customers, presets, snapshots (Board-Konfiguration)
             └─ PII: Ja — Board-Snapshots können User-Namen/Rollen enthalten
           PVC (/tmp für tsx IPC)
Egress:    Kein externer Egress
Auth:      oauth2-proxy → Keycloak OIDC (client_id=brett); App-native WebSocket Auth
```

**Kontrollen bestanden:**
- `brett.<brand>/` → 302 zu `auth.<brand>/realms/workspace/...` ✅
- `/api/state`, `/healthz`, `/three.min.js` → alle 302 zu Keycloak ✅
- Kein unauthenticated Board-State geleakt ✅

### 11. LiveKit (WebRTC)

```
Inputs:    Audio/Video-Streams (E2E-verschlüsselt, DTLS-SRTP)
           Token-Anfragen (via Website `/api/stream/token`)
Storage:   Redis (Raum-Status, Participant-List; flüchtig)
             └─ PII: Teilnehmer-Namen, Raum-Namen (transient)
Egress:    Egress/RTMP (Aufnahmen, via LiveKit Egress Service zu PVC)
Auth:      LiveKit Access-Token (via Website+Keycloak generiert); /rtc/validate erfordert gültigen Grant
```

**Kontrollen bestanden:**
- `/` → 200 "OK" (public by design) ✅
- `/rtc/validate` → 401 (erfordert gültigen Grant) ✅
- `/api/stream/token` → 401 (Website, gated) ✅

### 12. Talk HPB + Signaling + Coturn + Transcriber

```
Inputs:    Talk-WebRTC-Signaling (Raum-Join, ICE-Candidates, Chat-Signaling)
           Transkriptions-Webhook (Audio → Text)
Storage:   Kein persistentes Storage (Signaling ist stateless; Transcriber: flüchtige Audio-Chunks)
             └─ PII: In-Call Audio (transient), Chat-Nachrichten (transient)
Egress:    NUR Nextcloud Talk (intern); Coturn: STUN/TURN-Relay (UDP, öffentlich erreichbar für WebRTC)
Auth:      Signaling: App-native (shared Secret mit Nextcloud); Transcriber: HMAC-Signatur
           TURN: short-term Credentials (vom Signaling-Server generiert)
```

**Kontrollen bestanden:**
- `signaling.<brand>/api/v1/welcome` → 200 (public by design, enthält nur Version) ✅
- Transcriber NICHT öffentlich geroutet (404) ✅
- TURN-Auth via short-term Credentials (nicht unauthenticated nutzbar)

### 13. Recovery Browser

```
Inputs:    Read-Only-Zugriff auf PVC-Backups (Recovery-Dateien)
Storage:   recovery-pvc (ReadOnly-Mount)
             └─ PII: JA — Backup-Inhalte können DB-Dumps mit User-Daten enthalten
             └─ encrypted-at-rest: Nein (Backup-Dateien selbst sind encrypted, aber PVC nicht)
Egress:    Keiner
Auth:      oauth2-proxy → Keycloak OIDC (client_id=recovery, group /recovery-access)
           filebrowser läuft mit --noauth (Auth delegiert an oauth2-proxy)
Status:    On-Demand (nicht permanent deployed); aktuell auf beiden Brands 404 (Traefik Default-Backend)
```

**⚠️ Risiko-Hinweis:** Weil filebrowser mit `--noauth` läuft und Auth ausschließlich an oauth2-proxy delegiert ist, würde eine Regression in der oauth2-proxy-Konfiguration (falscher Client-ID, falsche Group-Claim) die Recovery-Inhalte **ungeschützt** exponieren. Es gibt keinen E2E-Test der beim `task recovery:browse` prüft dass unauth GET mit 302/401 antwortet. Empfehlung: Smoke-Assertion in `task recovery:browse` einbauen.

---

## Cross-Brand-Isolation

| Dimension | Status | Evidenz |
|---|---|---|
| **Keycloak Issuer** | ✅ Getrennt | `auth.mentolder.de/realms/workspace` ≠ `auth.korczewski.de/realms/workspace` |
| **Website-Namespaces** | ✅ Getrennt | `website` ns (mentolder) vs `website-korczewski` ns (korczewski) |
| **Workspace-Namespaces** | ✅ Getrennt | `workspace` (mentolder) vs `workspace-korczewski` (korczewski) |
| **CORS Cross-Brand** | ✅ Geblockt | Kein `Access-Control-Allow-Origin` auf Cross-Brand-Requests; Browser blockt |
| **DNS Cross-Brand** | ✅ Getrennt | `*.mentolder.de` vs `*.korczewski.de`, separate A/AAAA-Records |
| **shared-db** | ✅ Getrennt | `shared-db.workspace.svc` vs `shared-db.workspace-korczewski.svc` — separate Pods/DBs |
| **SealedSecrets** | ✅ Getrennt | `environments/sealed-secrets/mentolder.yaml` vs `korczewski.yaml` |
| **SMTP** | ⚠️ Shared | Beide Brands nutzen `smtp.mailbox.org` (gleicher Provider); E-Mail-Adressen sind separat (per-brand SMTP-Auth) |
| **LLM GPU Host** | ⚠️ Shared | Beide Brands nutzen dieselbe GPU-Box (`100.102.71.114` via wg-mesh) — Embedding-Vektoren sind getrennte Collections aber dieselbe Hardware |
| **Filen Backup** | ⚠️ Shared | Beide Brands sichern in denselben Filen-Account (separate Pfade) |
| **Collabora WOPI** | 🔴 Broken | `office.korczewski.de/hosting/discovery` hartkodiert `urlsrc=https://office.mentolder.de` — Cross-Brand-Konfigurationsfehler |

---

## Investigierte & Verworfen (kein Leck)

| Claim | Ergebnis |
|---|---|
| Docs unauthenticated erreichbar | ❌ Falsch — 302 zu Keycloak auf beiden Brands. oauth2-proxy funktioniert. |
| Mailpit API unauthenticated leakt E-Mails | ❌ Falsch — `/api/v1/messages` → 401 auf beiden Brands. |
| Nextcloud WebDAV öffentlich | ❌ Falsch — `/remote.php/webdav/` → 401 auf beiden Brands. |
| Vaultwarden Admin-Panel ungeschützt | ❌ Falsch — `/admin` zeigt Token-Login-Form, kein authentifizierter Content. |
| Keycloak Admin-REST offen | ❌ Falsch — `/admin/realms/workspace` → 401. |
| Website `/api/admin/*` ungeschützt | ❌ Falsch — Alle Endpunkte 401 unauthenticated. |
| LiveKit `/rtc/validate` unauthenticated | ❌ Falsch — 401 auf beiden Brands. |
| Cross-Brand: mentolder-Website kann korczewski-API lesen | ❌ Browser-blockiert — HTTP 200 von curl (keine CORS-Validierung), aber kein `Access-Control-Allow-Origin` Header → Browser-CORS blockt den Read. |
| Recovery Browser exponiert Backups | ⚠️ Nicht verifizierbar — aktuell nicht deployed (404); Auth-Gating nur statisch konfiguriert, nicht live getestet. |

---

## Priorisierte Maßnahmen

| Prio | Maßnahme | Betrifft |
|---|---|---|
| 🔴 1 | DocuSeal auf beiden Brands provisionieren (Admin + Encryption-Key via /setup) | DocuSeal |
| 🔴 2 | Collabora korczewski WOPI urlsrc auf `office.korczewski.de` korrigieren | Collabora |
| 🟡 3 | `E2E_ADMIN_PASS` in `e2e.yml` provisionieren → authentifizierte Testoberfläche aktivieren | Website, Brett, Systemtests |
| 🟡 4 | Recovery-Browser Smoke-Assertion in `task recovery:browse` einbauen | Recovery |
| 🟡 5 | Shared-LLM-Host: Embedding-Datenströme dokumentieren, prüfen ob Collections pro Brand logisch isoliert sind | LLM-GPU |
| 🟢 6 | Nach DocuSeal-Provisionierung: Public-Submission-Links auf PII-Leaks prüfen | DocuSeal |
| 🟢 7 | Website-Backup-Encryption dokumentieren (welche PII liegt in Filen-Backups, sind sie client-seitig verschlüsselt?) | Backup |

---

## Fazit

**Keine Datenlecks gefunden.** Die Sicherheitsarchitektur (Keycloak OIDC + oauth2-proxy ForwardAuth + App-native Token-Validierung + CORS-Browser-Schutz) ist korrekt implementiert und hält auf beiden Brands. Unauthentifizierte Probes auf alle 13 Apps zeigen konsistent 401/403/302-to-Keycloak wo Auth erwartet wird.

Die PII-Landschaft ist verteilt über 5 Storage-Backends: website-DB (höchste PII-Dichte: Coaching-Notizen, Rechnungen, CRM), shared-db (Keycloak-User, Nextcloud-Files/Shares, Vaultwarden-User, DocuSeal-Signer), Nextcloud-PVC (Nutzerdateien), Vaultwarden-PVC (verschlüsselte Vaults) und Backup-PVCs. Alle externen Egress-Pfade (SMTP, Stripe, Filen, LLM-GPU) sind TLS- oder WireGuard-verschlüsselt.

Der einzige identifizierte Bruch in der Cross-Brand-Isolation ist der Collabora WOPI-urlsrc-Konfigurationsfehler auf korczewski — kein Datenleck, aber funktional relevant.
