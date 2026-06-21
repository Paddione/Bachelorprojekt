# Pocket ID Migration Design

**Datum:** 2026-06-21  
**Slug:** pocket-id-migration  
**Status:** draft  
**Ticket:** TBD  
**Plan:** openspec/changes/pocket-id-migration/tasks.md  

---

## Kontext & Motivation

Keycloak wird durch Pocket ID ersetzt. Treiber: Wartungslast (komplexes Realm-/Mapper-System für ein kleines Team) und Ressourcenverbrauch (~512 MB RAM vs. ~50 MB für Pocket ID). Das User-Modell ist bewusst simpel: Admin/User-Rolle, minimale Userdaten, nur 1–3 manuelle Admin-Accounts (reguläre User entstehen bei Erstanmeldung via SSO).

Pocket ID ist OIDC-konform, passkey-first, leichtgewichtig und bietet eine einfache REST Admin API — ausreichend für alle Anforderungen dieser Plattform.

Namespace-Umbenennung (`workspace` → `mentolder`, `workspace-korczewski` → `korczewski`) ist bewusst ausgeklammert und folgt als separater Chore nach abgeschlossener Migration.

---

## Architektur

### Zwei unabhängige Pocket ID Instanzen

```
Namespace: workspace          → Pocket ID → id.mentolder.de
Namespace: workspace-korczewski → Pocket ID → id.korczewski.de
```

- Image: `stonith404/pocket-id`
- Datenbank: `shared-db` (neue DBs: `pocket_id_mentolder` / `pocket_id_korczewski`)
- Keycloak bleibt unberührt auf `auth.mentolder.de` / `auth.korczewski.de` für die gesamte Migrationsphase
- Kein gemeinsamer Betrieb auf derselben Domain — keine Konflikte

### Permanente Domains (keine temporären Redirect-Domains)

```
id.mentolder.de    ← Pocket ID mentolder (permanent)
id.korczewski.de   ← Pocket ID korczewski (permanent)
auth.mentolder.de  ← Keycloak (bis Cutover, dann Shutdown)
auth.korczewski.de ← Keycloak (bis Cutover, dann Shutdown)
```

### OIDC-Clients

Pocket ID registriert alle 16+ Clients neu mit frischen Secrets. Die Client-IDs bleiben identisch zur Keycloak-Konfiguration, um Konfigurationsänderungen bei Consumers minimal zu halten.

---

## Migrationsstrategie: Sequenzieller Cutover (Wellen)

### Welle 0 — Pocket ID deployen & konfigurieren

**Ziel:** Pocket ID vollständig betriebsbereit, Keycloak unberührt.

Schritte:
1. `k3d/pocket-id.yaml` — Deployment, Service, IngressRoute für beide Brands
2. `prod/patch-pocket-id.yaml` — Prod-Patch (HTTPS, Hostname, SMTP)
3. Shared-DB: Datenbanken `pocket_id_mentolder` + `pocket_id_korczewski` anlegen
4. Admin-Accounts manuell in Pocket ID Web-UI anlegen (1–3 Accounts)
5. Alle 16+ OIDC-Clients in Pocket ID registrieren
6. Neue Secrets als `POCKET_ID_*` in `environments/schema.yaml` ergänzen
7. `task env:seal ENV=mentolder && task env:seal ENV=korczewski`
8. `k3d/configmap-domains.yaml`: `POCKET_ID_DOMAIN` ergänzen

**Gates:**
- `https://id.mentolder.de/.well-known/openid-configuration` antwortet
- `https://id.korczewski.de/.well-known/openid-configuration` antwortet
- Admin-Login in Pocket ID Web-UI erfolgreich

---

### Welle 1 — oauth2-proxy-Services (13 Services)

**Ziel:** Alle oauth2-proxy-basierten Services auf Pocket ID umschwenken.

**Identische Änderung pro Service** (Config-only, kein App-Code):
```yaml
--oidc-issuer-url=https://id.${PROD_DOMAIN}
--client-id=<service-name>
--client-secret=${POCKET_ID_<SERVICE>_SECRET}
```

**Services (Reihenfolge: Risiko-aufsteigend):**

| # | Service | Manifest | Secret |
|---|---------|----------|--------|
| 1 | Mailpit | `k3d/oauth2-proxy-mailpit.yaml` | `POCKET_ID_MAIL_SECRET` |
| 2 | Traefik Dashboard | `k3d/oauth2-proxy-traefik.yaml` | `POCKET_ID_TRAEFIK_SECRET` |
| 3 | ComfyUI | `k3d/oauth2-proxy-comfy.yaml` | `POCKET_ID_COMFY_SECRET` |
| 4 | Brainstorm (dev) | `k3d/dev-stack/oauth2-proxy-brainstorm.yaml` | `POCKET_ID_BRAINSTORM_SECRET` |
| 5 | Session Hub (dev) | `k3d/dev-stack/oauth2-proxy-sessions.yaml` | `POCKET_ID_SESSION_HUB_SECRET` |
| 6 | MediaViewer | `k3d/oauth2-proxy-mediaviewer.yaml` | `POCKET_ID_MEDIAVIEWER_SECRET` |
| 7 | VideoVault | `k3d/oauth2-proxy-videovault.yaml` | `POCKET_ID_VIDEOVAULT_SECRET` |
| 8 | Studio | `k3d/oauth2-proxy-studio.yaml` | `POCKET_ID_STUDIO_SECRET` |
| 9 | DocuSeal | `k3d/docs.yaml` (oauth2-proxy) | `POCKET_ID_DOCS_SECRET` |
| 10 | Vaultwarden | `k3d/oauth2-proxy-vaultwarden.yaml` | `POCKET_ID_VAULTWARDEN_SECRET` |
| 11 | Recovery | `k3d/oauth2-proxy-recovery.yaml` | `POCKET_ID_RECOVERY_SECRET` |
| 12 | Claude Code MCP | `k3d/claude-code-mcp-auth-proxy.yaml` | `POCKET_ID_CLAUDE_CODE_SECRET` |

**Gates pro Service:**
- Login-Flow manuell testen (Browser: Redirect → Pocket ID → Callback)
- Bestehende E2E-Tests grün: `systemtest-01-auth.spec.ts`, `sa-02-auth.spec.ts`

---

### Welle 2 — Custom-Integrationen (3 Services)

#### 2a. Website (`auth.ts` + `identity.ts`)

`website/src/lib/auth.ts` — nur Endpoint-URLs anpassen:
```typescript
// Vorher:
const KEYCLOAK_URL = process.env.KEYCLOAK_URL
// Nachher:
const POCKET_ID_URL = process.env.POCKET_ID_URL
```
Token, Userinfo, Logout-Endpoints bleiben strukturell identisch (OIDC-Standard).

`website/src/lib/keycloak.ts` → **ersetzen durch `identity.ts`**:

```typescript
// Pocket ID Admin API (API-Key Auth, kein OAuth-Token-Flow)
const headers = { 'Authorization': `Bearer ${process.env.POCKET_ID_API_KEY}` }

// User auflisten
GET  /api/users
// User anlegen
POST /api/users  { email, firstName, lastName, isAdmin: false }
// User bearbeiten
PUT  /api/users/:id
// User löschen
DELETE /api/users/:id
```

Rollen-Modell: `isAdmin: boolean` — ersetzt Keycloak Gruppen/Rollen-Hierarchie vollständig.

Neue Env-Vars: `POCKET_ID_URL`, `POCKET_ID_API_KEY` (ersetzt `KEYCLOAK_URL`, `KC_ADMIN_USER`, `KC_ADMIN_PASS`).

#### 2b. Nextcloud

`k3d/nextcloud-oidc-dev.php`:
```php
// Vorher:
'oidc_login_provider_url' => 'http://keycloak:8080/realms/workspace',
// Nachher:
'oidc_login_provider_url' => 'http://pocket-id:1411',
```

`prod/nextcloud-oidc-prod.php`:
```php
'oidc_login_provider_url' => 'https://id.${PROD_DOMAIN}',
```

Beide Dateien: `client_id` + `client_secret` auf Pocket ID Credentials aktualisieren.

#### 2c. Grafana

`k3d/monitoring/grafana-*.yaml` — Grafana nutzt native OIDC (kein oauth2-proxy). Env-Vars anpassen:
```
GF_AUTH_GENERIC_OAUTH_AUTH_URL → https://id.${PROD_DOMAIN}/authorize
GF_AUTH_GENERIC_OAUTH_TOKEN_URL → https://id.${PROD_DOMAIN}/api/oidc/token
GF_AUTH_GENERIC_OAUTH_API_URL → https://id.${PROD_DOMAIN}/api/oidc/userinfo
GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET → ${POCKET_ID_GRAFANA_SECRET}
```

#### 2d. Brett

`k3d/oauth2-proxy-brett.yaml` — identisch zu Welle 1 (oauth2-proxy Config).  
`brett/src/server/auth.ts` — OIDC-Issuer-URL auf `id.mentolder.de` umstellen.

**Gates Welle 2:**
- Website: Login + User anlegen/löschen via Admin-Panel funktioniert
- Nextcloud: SSO-Login klappt, Erstanmeldung legt User in Nextcloud an
- Brett: Auth-Flow grün (oauth2-proxy + native OIDC)

---

### Welle 3 — Keycloak Shutdown

Nach 14 Tagen Beobachtung ohne Rollback-Bedarf:

1. Keycloak auf 0 Replicas skalieren: `kubectl scale deployment keycloak --replicas=0`
2. 7 Tage beobachten
3. Keycloak Deployment + Service + ConfigMaps entfernen
4. Realm-JSON-Dateien archivieren (nicht löschen — historische Referenz)
5. Keycloak-DB in `shared-db` droppen
6. Alte `KEYCLOAK_*` Secrets aus `environments/schema.yaml` entfernen
7. `auth.mentolder.de` / `auth.korczewski.de` IngressRoutes entfernen

---

## Rollback-Strategie

| Phase | Rollback-Methode | Zeitaufwand |
|-------|-----------------|-------------|
| Welle 0 | Pocket ID ignorieren — Keycloak weiterhin aktiv | 0 min |
| Welle 1 (pro Service) | `kubectl rollout undo` oder Env-Var-Revert | ~2 min pro Service |
| Welle 2 | `git revert` + `task feature:website` Redeploy | ~5 min |
| Welle 3 (vor DB-Drop) | Keycloak auf 1 Replica skalieren | ~3 min |
| Welle 3 (nach DB-Drop) | Nicht möglich — Punkt of No Return |

---

## Secrets & Konfiguration

### Neue Secrets in `environments/schema.yaml`

```yaml
POCKET_ID_API_KEY:          { generate: 64 }
POCKET_ID_MAIL_SECRET:      { generate: 40 }
POCKET_ID_TRAEFIK_SECRET:   { generate: 40 }
POCKET_ID_COMFY_SECRET:     { generate: 40 }
POCKET_ID_BRAINSTORM_SECRET:{ generate: 40 }
POCKET_ID_SESSION_HUB_SECRET:{ generate: 64 }
POCKET_ID_MEDIAVIEWER_SECRET:{ generate: 40 }
POCKET_ID_VIDEOVAULT_SECRET: { generate: 40 }
POCKET_ID_STUDIO_SECRET:    { generate: 40 }
POCKET_ID_DOCS_SECRET:      { generate: 40 }
POCKET_ID_VAULTWARDEN_SECRET:{ generate: 40 }
POCKET_ID_RECOVERY_SECRET:  { generate: 40 }
POCKET_ID_CLAUDE_CODE_SECRET:{ generate: 40 }
POCKET_ID_GRAFANA_SECRET:   { generate: 40 }
POCKET_ID_NEXTCLOUD_SECRET: { generate: 40 }
POCKET_ID_WEBSITE_SECRET:   { generate: 40 }
POCKET_ID_BRETT_SECRET:     { generate: 40 }
```

### Neue Env-Vars in `environments/*.yaml`

```yaml
POCKET_ID_FRONTEND_URL: https://id.${PROD_DOMAIN}
POCKET_ID_URL: http://pocket-id:1411  # cluster-intern
```

### Domains in `k3d/configmap-domains.yaml`

```yaml
POCKET_ID_DOMAIN: id.localhost  # dev
# prod via envsubst: id.${PROD_DOMAIN}
```

---

## Testing

### Neue BATS-Tests: `tests/spec/pocket-id-migration.bats`

- Pocket ID Discovery Endpoint erreichbar
- `identity.ts` API-Calls Unit-Tests (mock Pocket ID API)
- oauth2-proxy-Config-Validierung: alle Services haben `POCKET_ID_*` Secrets referenziert
- Keine verwaisten `KEYCLOAK_*` Referenzen nach Welle 3

### Bestehende Tests erweitern

- `tests/e2e/specs/systemtest-01-auth.spec.ts` — Login-Flow gegen Pocket ID
- `tests/e2e/specs/sa-02-auth.spec.ts` — SSO gegen Pocket ID
- `tests/e2e/specs/fa-15-oidc.spec.ts` — OIDC Authorization Code Flow gegen Pocket ID

---

## Betroffene Dateien (Übersicht)

### Neu anlegen
- `k3d/pocket-id.yaml`
- `prod/patch-pocket-id.yaml`
- `website/src/lib/identity.ts`
- `tests/spec/pocket-id-migration.bats`

### Modifizieren
- `k3d/configmap-domains.yaml` — `POCKET_ID_DOMAIN` ergänzen
- `environments/schema.yaml` — 17 neue Secrets, alte `KEYCLOAK_*` am Ende entfernen
- `environments/*.yaml` — `POCKET_ID_FRONTEND_URL`, `POCKET_ID_URL`
- `k3d/oauth2-proxy-*.yaml` (11 Dateien) — OIDC-Issuer + Secrets
- `k3d/dev-stack/oauth2-proxy-*.yaml` (2 Dateien)
- `k3d/docs.yaml` — oauth2-proxy Section
- `k3d/claude-code-mcp-auth-proxy.yaml`
- `k3d/monitoring/grafana-*.yaml`
- `k3d/nextcloud-oidc-dev.php`
- `prod/nextcloud-oidc-prod.php`
- `website/src/lib/auth.ts`
- `brett/src/server/auth.ts`
- E2E-Tests (3 Dateien)

### Entfernen (Welle 3)
- `k3d/keycloak.yaml`
- `prod/patch-keycloak.yaml`
- `k3d/realm-import-entrypoint.sh`
- `k3d/realm-workspace-dev.json` → archivieren
- `prod/realm-workspace-prod.json` → archivieren
- `prod-mentolder/realm-workspace-mentolder.json` → archivieren
- `prod-korczewski/realm-workspace-korczewski.json` → archivieren
- `website/src/lib/keycloak.ts`
- `scripts/keycloak-sync.sh`
- `scripts/keycloak-ensure-mappers.sh`
- `scripts/keycloak-helpers.sh`

---

## Offene Punkte

- Pocket ID Passkey-Setup: Sollen Passkeys für Admin-Accounts aktiviert werden? (empfohlen)
- SMTP-Konfiguration für Pocket ID: magic-link Emails — gleiche SMTP-Config wie Keycloak
- Pocket ID Version pinnen: aktuell `latest` — vor Produktion auf festen Tag wechseln
- **Arena (korczewski):** Laut `openspec/changes/korczewski-monolith-keycloak-auth/` ist die Arena-Keycloak-Integration noch nicht vollständig implementiert. Arena-Migration zu Pocket ID ist deshalb im Scope dieses Plans *nicht* enthalten — wird als separates Ticket nach Abschluss des Arena-Keycloak-Changes behandelt.
