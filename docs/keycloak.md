# Keycloak & SSO

## Realm: homeoffice

Beim ersten Start importiert Keycloak automatisch den Realm `homeoffice` aus `realm-homeoffice.json`. Der Import-Mechanismus wird durch `scripts/import-entrypoint.sh` gesteuert — siehe [Skripte → import-entrypoint.sh](scripts.md#scriptsimport-entrypointsh--realm-import).

> **Wichtig:** OIDC-Secrets (`MATTERMOST_OIDC_SECRET`, `NEXTCLOUD_OIDC_SECRET`) muessen in `.env` gesetzt sein, BEVOR Keycloak zum ersten Mal startet. Nachtraegliches Aendern erfordert manuelle Anpassung in der Admin-Console.

## OIDC-Clients

### Mattermost

| Einstellung | Wert |
|------------|------|
| Client ID | `mattermost` |
| Client Secret | `${MATTERMOST_OIDC_SECRET}` |
| Redirect URI | `https://${MM_DOMAIN}/*` |
| Protocol Mappers | email, username, full name |

### Nextcloud

| Einstellung | Wert |
|------------|------|
| Client ID | `nextcloud` |
| Client Secret | `${NEXTCLOUD_OIDC_SECRET}` |
| Redirect URIs | `https://${NC_DOMAIN}/apps/oidc_login/oidc`, `https://${NC_DOMAIN}/apps/sociallogin/custom_oidc/keycloak` |
| Protocol Mappers | email, username |

## Benutzerverwaltung

Keycloak ist der alleinige User Store. Benutzer werden direkt in Keycloak angelegt — ueber die Admin Console oder per Skript.

### Benutzer anlegen (Admin Console)

1. Keycloak Admin Console → Realm `homeoffice` → **Users**
2. **Add user** → Felder ausfuellen (Username, E-Mail, Vor-/Nachname)
3. **Credentials** → Passwort setzen (Temporary = ON fuer erzwungene Aenderung beim ersten Login)

### Benutzer anlegen (Skript)

Massenimport per CSV oder LDIF — siehe [Skripte → import-users.sh](scripts.md#scriptsimport-userssh--benutzer-import).

## Bestehendes LDAP / Active Directory anbinden

Falls ein vorhandener LDAP-Server verwendet werden soll, kann Keycloak direkt per LDAP-Federation angebunden werden.

### Active Directory

| Feld | Wert |
|------|------|
| Vendor | Active Directory |
| Connection URL | `ldap://ad-server:389` oder `ldaps://ad-server:636` |
| Bind DN | `cn=serviceaccount,dc=firma,dc=de` |
| Users DN | `cn=Users,dc=firma,dc=de` |
| Username Attribute | `sAMAccountName` |
| UUID Attribute | `objectGUID` |
| Object Classes | `person,organizationalPerson,user` |

### OpenLDAP / 389ds

| Feld | Wert |
|------|------|
| Vendor | Other |
| Connection URL | `ldap://ldap-server:389` |
| Bind DN | `cn=admin,dc=firma,dc=de` |
| Users DN | `ou=people,dc=firma,dc=de` |
| Username Attribute | `uid` |
| UUID Attribute | `entryUUID` |
| Object Classes | `inetOrgPerson` |

### Einrichtung

1. Keycloak Admin Console → Realm `homeoffice` → **User Federation**
2. **Add provider → LDAP**
3. Felder ausfuellen (siehe oben)
4. **Test connection** → **Test authentication** → **Save**
5. **Sync all users**

Mattermost und Nextcloud erhalten die User automatisch ueber OIDC — kein weiterer Schritt.

## LDAP-Gruppen als Keycloak-Rollen

Damit LDAP-Gruppen als Rollen in Mattermost/Nextcloud landen:

1. Keycloak → User Federation → LDAP/AD → **Mappers → Add mapper**
2. Typ: `group-ldap-mapper`
3. LDAP Groups DN: `ou=groups,dc=...`
4. Group Name LDAP Attribute: `cn`
5. **Save** → **Sync LDAP Groups**

## Sicherheitseinstellungen

Der Realm ist mit folgenden Sicherheitsfeatures konfiguriert:

- **Brute-Force-Schutz** aktiviert
- **Passwort-Reset** erlaubt
- **Selbstregistrierung** deaktiviert
- **Doppelte E-Mails** verboten
- **E-Mail als Login** erlaubt
- **SSL-Pflicht** nur extern (hinter Traefik)
