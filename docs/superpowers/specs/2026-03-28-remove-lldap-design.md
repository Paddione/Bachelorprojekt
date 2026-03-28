# Remove LLDAP: Keycloak as Sole User Store

**Date:** 2026-03-28
**Status:** Approved

## Summary

Remove LLDAP and its PostgreSQL database from the Homeoffice MVP stack. Keycloak becomes the single source of truth for user accounts, groups, and credentials. This eliminates 2 containers, 1 database, 6 env vars, and a DuckDNS subdomain while preserving all user management functionality.

## Motivation

LLDAP currently serves as a lightweight LDAP directory that Keycloak federates against in READ_ONLY mode. No service in the stack queries LLDAP directly — Mattermost and Nextcloud both authenticate via Keycloak OIDC. The LDAP layer adds complexity (extra containers, secrets, sync delays) without providing value that Keycloak's built-in user store doesn't already offer.

## Architecture Change

### Before
```
User → Mattermost/Nextcloud → Keycloak (OIDC) → LLDAP (LDAP Federation) → lldap-db
```

### After
```
User → Mattermost/Nextcloud → Keycloak (OIDC) → Keycloak internal user store → keycloak-db
```

## Scope of Changes

### Category 1: Infrastructure (Docker Compose + Env)

**`docker-compose.yml`**
- Remove: `lldap` service definition (lines ~107-131)
- Remove: `lldap-db` service definition (lines ~88-106)
- Remove: `lldap-db-data` volume
- Remove: `lldap` from Keycloak `depends_on`
- Remove: `LLDAP_BASE_DOMAIN`, `LLDAP_BASE_TLD`, `LLDAP_LDAP_USER_PASS` from Keycloak env vars

**`.env.example`**
- Remove: Entire LLDAP section (LLDAP_JWT_SECRET, LLDAP_LDAP_USER_PASS, LLDAP_DB_PASSWORD, LLDAP_BASE_DOMAIN, LLDAP_BASE_TLD)
- Remove: LLDAP_DOMAIN
- Update: DUCKDNS_SUBDOMAINS (5 → 4 subdomains, remove ldap subdomain)
- Update: Comments referencing 5 subdomains → 4

### Category 2: Keycloak Realm Config

**`realm-homeoffice.json`**
- Remove: Entire `components.org.keycloak.storage.UserStorageProvider` section (LDAP Federation config)
- Keep: OIDC clients (Mattermost, Nextcloud) and protocol mappers unchanged

**`scripts/import-entrypoint.sh`**
- Remove: `LLDAP_BASE_DOMAIN`, `LLDAP_BASE_TLD`, `LLDAP_LDAP_USER_PASS` from the sed substitution variable list

### Category 3: Scripts

**`scripts/import-users.sh`** — Full rewrite
- Replace LLDAP GraphQL API calls with Keycloak Admin REST API
- Auth: `POST /realms/master/protocol/openid-connect/token` (client_credentials or password grant)
- Create user: `POST /admin/realms/homeoffice/users`
- Create group: `POST /admin/realms/homeoffice/groups`
- Add to group: `PUT /admin/realms/homeoffice/users/{id}/groups/{groupId}`
- Set password: `PUT /admin/realms/homeoffice/users/{id}/reset-password`
- CLI interface stays identical: `--csv`, `--ldif`, `--url`, `--admin`, `--pass`, `--dry-run`
- URL default changes from `http://localhost:17170` to `https://localhost:8443` (or KC_DOMAIN)

**`scripts/migrate.sh`**
- Replace LLDAP connection config (LLDAP_URL, LLDAP_ADMIN, LLDAP_PASS) with Keycloak connection config (KC_URL, KC_ADMIN, KC_PASS)
- Update `flow_users()` to pass Keycloak params to import-users.sh
- Update `ask_connection_config()` — remove LLDAP prompts, add Keycloak prompts (if not already present)
- Update `test_connections()` — remove LLDAP health check
- Update `save_config()` / `load_config()` — remove LLDAP vars
- Update banner and menu text: "LLDAP" → "Keycloak"

**`scripts/lib/export.sh`**
- Replace `export_lldap_users()` with `export_keycloak_users()` using Keycloak Admin REST API (`GET /admin/realms/homeoffice/users`, `GET /admin/realms/homeoffice/groups`)
- Update EXPORT_MODULES array: "LLDAP Benutzer" → "Keycloak Benutzer"
- Output format stays CSV + LDIF for compatibility

**`scripts/check-connectivity.sh`**
- Remove LLDAP_DOMAIN from the grep and SERVICES array

**`scripts/setup.sh`**
- Remove LLDAP secret generation (LLDAP_JWT_SECRET, LLDAP_LDAP_USER_PASS, LLDAP_DB_PASSWORD)
- Remove LLDAP_DOMAIN sed replacement
- Remove LLDAP_BASE_DOMAIN, LLDAP_BASE_TLD sed replacements
- Remove LLDAP vars from env-check and secret-check lists
- Remove LLDAP URL from final output

**`scripts/setup-windows.ps1`**
- Same removals as setup.sh (Windows equivalent)

### Category 4: Tests

**`tests/local/NFA-07.sh`**
- Remove: LLDAP image assertion (T2e)

### Category 5: Documentation

All docs updated to reflect Keycloak-native user management:

- **`docs/architecture.md`** — Remove LLDAP from system diagram, update auth flow
- **`docs/services.md`** — Remove LLDAP section, update dependency graph, update Keycloak section
- **`docs/configuration.md`** — Remove LLDAP config section
- **`docs/deployment.md`** — Remove LLDAP subdomain, update user creation instructions
- **`docs/migration.md`** — Update user import docs to reference Keycloak
- **`docs/security.md`** — Remove LLDAP security section
- **`docs/troubleshooting.md`** — Update LDAP troubleshooting to Keycloak-native
- **`docs/keycloak.md`** — Remove LDAP Federation section, document native user management
- **`docs/backup.md`** — Remove lldap from DB dump list
- **`docs/scripts.md`** — Update import-users.sh docs

### Category 6: Requirements

- **`docs/requirements/NFA_requirements.json`** — Remove LLDAP from license list
- **`docs/requirements/FA_requirements.json`** — Update user management criteria (LLDAP → Keycloak)

## Keycloak Admin REST API Reference

Key endpoints used by the rewritten import-users.sh:

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get token | POST | `/realms/master/protocol/openid-connect/token` |
| List users | GET | `/admin/realms/homeoffice/users` |
| Create user | POST | `/admin/realms/homeoffice/users` |
| Set password | PUT | `/admin/realms/homeoffice/users/{id}/reset-password` |
| List groups | GET | `/admin/realms/homeoffice/groups` |
| Create group | POST | `/admin/realms/homeoffice/groups` |
| Add user to group | PUT | `/admin/realms/homeoffice/users/{id}/groups/{groupId}` |

Create user payload:
```json
{
  "username": "anna.schmidt",
  "email": "anna@example.com",
  "firstName": "Anna",
  "lastName": "Schmidt",
  "enabled": true
}
```

Set password payload:
```json
{
  "type": "password",
  "value": "ChangeMe123!",
  "temporary": true
}
```

## What Does NOT Change

- Mattermost OIDC config (talks to Keycloak, not LLDAP)
- Nextcloud OIDC config (talks to Keycloak, not LLDAP)
- Jitsi (no auth integration with LLDAP)
- Traefik routing (minus one route for LLDAP domain)
- Backup file sync (mattermost/, nextcloud/, traefik/ — LLDAP had no file data)
- DuckDNS updater (minus one subdomain)

## Risks

- **Existing LLDAP users not migrated automatically.** If there's a running deployment with users in LLDAP, those users need to be recreated in Keycloak. The export script can dump them first. This is a development/MVP project, so this is acceptable.
- **Keycloak realm re-import.** Since the realm JSON changes (no more LDAP Federation), existing Keycloak deployments using `--import-realm` won't auto-remove the federation. A clean Keycloak DB or manual removal via Admin Console is needed.
