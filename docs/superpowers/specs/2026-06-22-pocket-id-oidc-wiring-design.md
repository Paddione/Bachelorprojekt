---
ticket_id: T001087
plan_ref: openspec/changes/pocket-id-oidc-wiring/tasks.md
status: active
date: 2026-06-22
---

# Design Spec: Pocket ID OIDC-Wiring Fix

**Datum:** 2026-06-22  
**Ticket:** T001087  
**Branch:** fix/pocket-id-oidc-wiring  
**Status:** approved  
**ticket_id:** T001087  
**plan_ref:** openspec/changes/pocket-id-oidc-wiring/tasks.md

---

## Kontext

PR #2042 migrierte alle OIDC-geschützten Endpunkte von Keycloak auf Pocket ID (Welle 0–2, 59/59 BATS grün). Die Manifest-Seite ist korrekt — aber drei Lücken machen alle OIDC-Endpunkte in dev und prod broken:

1. `k3d/secrets.yaml` und `k3d/website-dev-secrets.yaml` haben keine `POCKET_ID_*_SECRET`-Werte → alle betroffenen Pods crashen mit `CreateContainerConfigError: secret key not found` (keine `optional: true`-Escape-Hatch).
2. Kein Pocket ID OIDC-Client-Seeding-Mechanismus (Keycloak hatte `realm-workspace-dev.json`-Import; Pocket ID hat kein Äquivalent) → OIDC-Clients nicht registriert, jede Auth-Anfrage schlägt mit "client not found" fehl.
3. `website/src/env.d.ts` deklariert `POCKET_ID_WEBSITE_SECRET` nicht → TypeScript-Typ fehlt.

---

## Ziel

Alle 16 OIDC-geschützten Endpunkte laufen nach einem einzigen `task workspace:deploy` wieder durch, ohne manuelle Pocket ID UI-Eingriffe — in dev (k3d) und prod (fleet/mentolder + fleet/korczewski).

---

## Nicht im Scope

- Keycloak-Shutdown (Welle 3 — separates Gate nach Beobachtungsfenster)
- Neue OIDC-Clients hinzufügen
- Pocket ID selbst upgraden

---

## Architektur

### Teil 1: Fehlende Dev-Secrets

**`k3d/secrets.yaml`** (workspace-secrets) bekommt folgende neue Keys:

| Key | Dev-Platzhalterwert |
|-----|---------------------|
| `POCKET_ID_DB_PASSWORD` | `devpocketiddb` |
| `POCKET_ID_API_KEY` | `devpocketidapikey12345678901234` |
| `POCKET_ID_DOCS_SECRET` | `devdocspocketidsecret12345` |
| `POCKET_ID_MAIL_SECRET` | `devmailpocketidsecret12345` |
| `POCKET_ID_BRETT_SECRET` | `devbrettpocketidsecret12345678` |
| `POCKET_ID_COMFY_SECRET` | `devcomfypocketidsecret12345678` |
| `POCKET_ID_MEDIAVIEWER_SECRET` | `devmediaviewerpocketidsecret12` |
| `POCKET_ID_VIDEOVAULT_SECRET` | `devvideovaultpocketidsecret123` |
| `POCKET_ID_STUDIO_SECRET` | `devstudiopocketidsecret1234567` |
| `POCKET_ID_TRAEFIK_SECRET` | `devtraefikpocketidsecret123456` |
| `POCKET_ID_RECOVERY_SECRET` | `devrecoverypocketidsecret12345` |
| `POCKET_ID_VAULTWARDEN_SECRET` | `devvaultwardenpocketidsecret12` |
| `POCKET_ID_CLAUDE_CODE_SECRET` | `devclaudecodepocketidsecret123` |
| `POCKET_ID_SESSION_HUB_SECRET` | `devsessionhubpocketidsecret123` |
| `POCKET_ID_BRAINSTORM_SECRET` | `devbrainstormpocketidsecret123` |
| `POCKET_ID_NEXTCLOUD_SECRET` | `devnextcloudpocketidsecret1234` |

**`k3d/website-dev-secrets.yaml`** (website-secrets) bekommt:

| Key | Dev-Platzhalterwert |
|-----|---------------------|
| `POCKET_ID_WEBSITE_SECRET` | `devwebsitepocketidsecret123456` |
| `POCKET_ID_API_KEY` | `devpocketidapikey12345678901234` |

`POCKET_ID_GRAFANA_SECRET` existiert bereits in `k3d/monitoring/grafana-oidc-secret.yaml` (`"dev-grafana-secret"`) — kein Handlungsbedarf.

Die alten `*_OIDC_SECRET`-Keys bleiben erhalten (Nextcloud und Website nutzen sie als Fallback).

---

### Teil 2: Pocket ID Client Seed Job (`k3d/pocket-id-client-seed.yaml`)

Neuer Kubernetes Job, der idempotent alle 16 OIDC-Clients in Pocket ID registriert. Analog zu `pocket-id-db-init`.

**Init-Container** (`busybox`):
- Pollt `http://pocket-id:1411/api/health` in Schleife (max 60 × 2s = 120s)
- Blockiert bis HTTP 200 zurückkommt
- Verhindert Race-Condition: Job schlägt fehl wenn Pocket ID noch nicht ready

**Haupt-Container** (`curlimages/curl:8`):
- Inline-Shell-Script im `args`-Block
- Für jeden der 16 Clients:
  ```
  GET /api/oidc-clients?search=<clientId>
  → leer:    POST  /api/oidc-clients  { id, name, clientSecret, callbackUrls, ... }
  → gefunden: PATCH /api/oidc-clients/<id> { clientSecret, callbackUrls }
  ```
- Auth: `Authorization: Bearer $POCKET_ID_API_KEY`
- Callback-URLs: dev verwendet `http://`, prod `https://` — unterschieden via `POCKET_ID_FRONTEND_URL` (enthält Schema)
- `restartPolicy: OnFailure`, `backoffLimit: 5`

**Registrierung:** `k3d/kustomization.yaml` bekommt `- pocket-id-client-seed.yaml` als neuen Eintrag (nach `pocket-id.yaml`).

**Keine prod-Patch nötig** — Job ist zustandslos, liest Secrets aus `workspace-secrets` + `website-secrets`, die in prod via SealedSecrets befüllt sind.

---

### Teil 3: Brett Client-ID-Fix

`brett/src/server/auth.ts` referenziert `process.env.BRETT_KC_CLIENT_ID || 'brett-app'` — ein Keycloak-Überrest. Der Pocket ID Client heißt `brett` (wie in `oauth2-proxy-brett.yaml`).

`k3d/brett.yaml` ConfigMap bekommt: `BRETT_KC_CLIENT_ID: "brett"` — damit verwendet `auth.ts` den korrekten Client-ID ohne Code-Änderung.

---

### Teil 4: TypeScript-Typ

`website/src/env.d.ts`: `POCKET_ID_WEBSITE_SECRET: string` ergänzen (analog zu `WEBSITE_OIDC_SECRET` direkt darunter).

---

### Teil 5: Schema-Ergänzung

`environments/schema.yaml`: `POCKET_ID_NEXTCLOUD_SECRET` als expliziten Key eintragen (derzeit referenziert die PHP-Config den Key via Fallback, aber er fehlt im Schema). Kommentar: "Wird vom pocket-id-client-seed Job beim Deploy in Pocket ID eingetragen."

---

## Client-Matrix (16 Clients)

| # | Client-ID | Secret-Key | Callback-URL (dev) | Secret-Quelle |
|---|-----------|------------|--------------------|---------------|
| 1 | `docs` | `POCKET_ID_DOCS_SECRET` | `http://docs.localhost/oauth2/callback` | workspace-secrets |
| 2 | `mailpit-admin` | `POCKET_ID_MAIL_SECRET` | `http://mail.localhost/oauth2/callback` | workspace-secrets |
| 3 | `brett` | `POCKET_ID_BRETT_SECRET` | `http://brett.localhost/oauth2/callback` | workspace-secrets |
| 4 | `comfy` | `POCKET_ID_COMFY_SECRET` | `http://comfy.localhost/oauth2/callback` | workspace-secrets |
| 5 | `mediaviewer-widget` | `POCKET_ID_MEDIAVIEWER_SECRET` | `http://mediaviewer.localhost/oauth2/callback` | workspace-secrets |
| 6 | `videovault` | `POCKET_ID_VIDEOVAULT_SECRET` | `http://videovault.localhost/oauth2/callback` | workspace-secrets |
| 7 | `studio` | `POCKET_ID_STUDIO_SECRET` | `http://studio.localhost/oauth2/callback` | workspace-secrets |
| 8 | `traefik-dashboard` | `POCKET_ID_TRAEFIK_SECRET` | (relative redirect) | workspace-secrets |
| 9 | `recovery` | `POCKET_ID_RECOVERY_SECRET` | `https://${RECOVER_DOMAIN}/oauth2/callback` | workspace-secrets |
| 10 | `session-hub` | `POCKET_ID_SESSION_HUB_SECRET` | `http://session-hub.localhost/oauth2/callback` | workspace-secrets |
| 11 | `brainstorm` | `POCKET_ID_BRAINSTORM_SECRET` | `http://brainstorm.localhost/oauth2/callback` | workspace-secrets |
| 12 | `claude-code-mcp-monolith` | `POCKET_ID_CLAUDE_CODE_SECRET` | `https://mcp.${PROD_DOMAIN}/oauth2/callback` | workspace-secrets |
| 13 | `vaultwarden` | `POCKET_ID_VAULTWARDEN_SECRET` | Vaultwarden SSO intern | workspace-secrets |
| 14 | `nextcloud` | `POCKET_ID_NEXTCLOUD_SECRET` | Nextcloud OIDC intern | workspace-secrets |
| 15 | `grafana` | `POCKET_ID_GRAFANA_SECRET` | Grafana OAuth intern | grafana-oidc-secret |
| 16 | `website` | `POCKET_ID_WEBSITE_SECRET` | `${SITE_URL}/api/auth/callback` | website-secrets |

---

## Prod-Deployment-Pfad

Nach diesem Fix gelten folgende Schritte für jeden Prod-Deploy:

1. `environments/.secrets/<env>.yaml` — 17 `POCKET_ID_*`-Keys mit starken Zufallswerten (64 Zeichen hex) befüllen
2. `task env:seal ENV=<env>` — SealedSecret erzeugen
3. `task workspace:deploy ENV=<env>` — Manifeste inkl. Seed-Job anwenden
4. Seed-Job läuft automatisch, registriert/aktualisiert alle 16 Clients in Pocket ID
5. Kein manueller UI-Eingriff nötig

---

## Geänderte Dateien (Überblick)

| Datei | Änderung |
|-------|----------|
| `k3d/secrets.yaml` | +16 `POCKET_ID_*`-Keys |
| `k3d/website-dev-secrets.yaml` | +`POCKET_ID_WEBSITE_SECRET`, `POCKET_ID_API_KEY` |
| `k3d/pocket-id-client-seed.yaml` | NEU — Seed-Job |
| `k3d/kustomization.yaml` | +`pocket-id-client-seed.yaml` |
| `k3d/brett.yaml` | +`BRETT_KC_CLIENT_ID: "brett"` in ConfigMap |
| `website/src/env.d.ts` | +`POCKET_ID_WEBSITE_SECRET: string` |
| `environments/schema.yaml` | +`POCKET_ID_NEXTCLOUD_SECRET` |
| `tests/spec/pocket-id-migration.bats` | +7 neue Test-Cases |

---

## Testbarkeit

**BATS-Tests** (`tests/spec/pocket-id-migration.bats`) — neue Fälle:
- `pocket-id-client-seed.yaml` in `k3d/kustomization.yaml` registriert
- Alle 16 `POCKET_ID_*_SECRET`-Keys in `k3d/secrets.yaml` vorhanden
- `POCKET_ID_WEBSITE_SECRET` + `POCKET_ID_API_KEY` in `k3d/website-dev-secrets.yaml`
- `POCKET_ID_WEBSITE_SECRET` in `website/src/env.d.ts` deklariert
- `BRETT_KC_CLIENT_ID` in `k3d/brett.yaml` ConfigMap auf `brett` gesetzt
- `POCKET_ID_NEXTCLOUD_SECRET` in `environments/schema.yaml` vorhanden
- Kustomize build `k3d/` emittiert Job namens `pocket-id-client-seed`

**Manueller Smoke-Test** nach Dev-Deploy:
1. `kubectl logs job/pocket-id-client-seed -n workspace` — alle 16 "upserted" Zeilen
2. Login auf `https://docs.localhost` → Pocket ID Login-Page erscheint → Auth erfolgreich
