---
ticket_id: T001579
plan_ref: openspec/changes/oauth2-proxy-hardening/tasks.md
status: active
date: 2026-07-03
---

# Design: oauth2-proxy-Gates plattformweit härten (T001579)

## Kontext

Security-Review-Findings aus PR #2554, Muster betrifft alle oauth2-proxy-Gates der Plattform. Exploration (2026-07-03) hat den Ist-Zustand vollständig inventarisiert: 11 Prod-Gates in `prod/patch-oauth2-proxy-*.yaml` (comfy, downloads, mediaviewer, videovault, rustdesk-web, docs, brain, brett, studio, traefik, mailpit), alle mit identischem Flag-Muster gegen `https://auth.${PROD_DOMAIN}` (Pocket-ID).

## Ist-Zustand (Findings)

1. Alle 11 Prod-Gates setzen `--ssl-insecure-skip-verify=true` und `--insecure-oidc-allow-unverified-email=true` sowie `--skip-oidc-discovery=true` mit expliziten `--login-url`/`--redeem-url`/`--oidc-jwks-url`/`--profile-url`.
2. 8 Gates autorisieren mit `--email-domain=*` (= jeder Pocket-ID-User darf hinein); 3 Gates (studio, traefik, mailpit) nutzen `--authenticated-emails-file` (Allowlist).
3. `auth.<domain>` präsentiert ein gültiges Let's-Encrypt-Wildcard-Zertifikat: cert-manager `ClusterIssuer letsencrypt-prod` (`prod/cluster-issuer.yaml`, DNS-01) + `Certificate workspace-wildcard` (`prod/wildcard-certificate.yaml`); Traefik terminiert mit `${TLS_SECRET_NAME}`. `--ssl-insecure-skip-verify` ist damit unnötig.
4. **Keine Groups-Infrastruktur vorhanden:** Der Pocket-ID-Client-Seed (`k3d/pocket-id-client-seed.yaml`) setzt keine Scopes/Gruppen, kein Gate nutzt `--allowed-groups`/`--oidc-groups-claim`, Scope ist überall `openid email profile`.
5. `prod-korczewski/brain-exclude.yaml` existiert nicht mehr (Ticket-Prämisse überholt; Exklusion läuft inline via `$patch: delete` in `prod-korczewski/kustomization.yaml`, abgesichert durch `tests/spec/brain-quartz-deploy.bats`). Verwaist ist nur `templates/brain/prod-korczewski/templates/brain/kustomization.yaml` (3 Zeilen, `resources: []`, nirgends referenziert).

## Entscheidungen

### WP1 — TLS-Verifikation aktivieren (11 Gates)
- `--ssl-insecure-skip-verify=true` aus allen 11 `prod/patch-oauth2-proxy-*.yaml` entfernen. Kein `--provider-ca-file` nötig (Let's Encrypt ist im System-Truststore des oauth2-proxy-Images).
- `--skip-oidc-discovery=true` **bleibt**: Die vier expliziten Endpoint-Flags sind gesetzt und korrekt; Discovery einschalten würde den Pod-Start an die Erreichbarkeit des Issuers koppeln, ohne Sicherheitsgewinn. (Geprüft und bewusst entschieden — Ticket-Punkt „prüfen" damit erledigt.)
- Dev-Basis (`k3d/oauth2-proxy-*.yaml`) bleibt unangetastet: Issuer ist dort `http://pocket-id:1411`, das Flag ist wirkungslos; Dev-Härtung wäre Scope-Creep.

### WP2 — Autorisierung über Pocket-ID-Gruppen (8 email-domain-Gates)
- **Neue Gruppe `workspace-users`** als plattformweite Basis-Autorisierung. Der Seed-Job (`k3d/pocket-id-client-seed.yaml`) legt die Gruppe idempotent über die Pocket-ID-API an. Die Mitglieder-Zuweisung ist ein einmaliger Admin-Schritt (dokumentiert im Plan, verifiziert vor Prod-Rollout).
- Pro Gate (comfy, downloads, mediaviewer, videovault, rustdesk-web, docs, brain, brett) in den Prod-Patches: `--email-domain=*` und `--insecure-oidc-allow-unverified-email=true` entfernen; `--scope=openid email profile groups`, `--oidc-groups-claim=groups`, `--allowed-groups=workspace-users` hinzufügen.
- Die 3 Allowlist-Gates (studio, traefik, mailpit) behalten `--authenticated-emails-file` (restriktiver als Gruppen), verlieren aber ebenfalls `--ssl-insecure-skip-verify` und `--insecure-oidc-allow-unverified-email`.
- **Lockout-Risiko:** Ohne `--insecure-oidc-allow-unverified-email` scheitern Logins, wenn Pocket-ID `email_verified=false` liefert; ohne Gruppenmitgliedschaft scheitert jeder Login an `--allowed-groups`. Der Plan MUSS einen Verifikationsschritt auf `ENV=staging` (bzw. Token-Introspection gegen die echte Pocket-ID) VOR dem Prod-Deploy enthalten sowie den Rollback dokumentieren (Flags-Revert per `git revert` + `task workspace:deploy`).

### WP3 — Aufräumen
- `templates/brain/prod-korczewski/` (inkl. nested `templates/brain/kustomization.yaml`) löschen.
- Der historische Kommentar zu `brain-exclude.yaml` in `tests/spec/brain-quartz-deploy.bats` bleibt (dokumentiert die Entstehungsgeschichte, Test ist korrekt); es gibt keine `brain-exclude.yaml` mehr zu löschen.

### SSOT
- Delta gegen `openspec/specs/auth-sso.md`: Requirements für Gate-Flag-Konventionen (TLS-Verifikation Pflicht, Autorisierungsmethode Gruppen-Claim oder Allowlist, keine insecure-Flags in Prod). Die konkreten Flags waren bislang in keiner SSOT-Spec dokumentiert.

## Verworfene Alternativen

- **OIDC-Discovery aktivieren statt expliziter URLs:** kein Sicherheitsgewinn, koppelt Startverhalten an Issuer-Verfügbarkeit.
- **Pro-Gate-Gruppen (z. B. `docs-users`, `comfy-users`):** feinere Autorisierung, aber 8 Gruppen + Zuweisungsaufwand ohne aktuellen Bedarf — YAGNI; das Modell ist mit `--allowed-groups` später verfeinerbar.
- **Pocket-ID „allowed user groups" pro Client (serverseitig) statt oauth2-proxy `--allowed-groups`:** verlagert Autorisierung in Seed-Job-Konfiguration, aber oauth2-proxy-seitige Prüfung ist explizit die Ticket-Vorgabe und im Manifest-Review sichtbar.

## Testing / Verifikation

- BATS-Manifest-Tests in `tests/spec/auth-sso.bats` (neu anlegen, Template `tests/spec/software-factory.bats`): gerendertes `prod-fleet/mentolder`-Overlay enthält kein `ssl-insecure-skip-verify`/`insecure-oidc-allow-unverified-email`/`email-domain=*` in oauth2-proxy-Args mehr; die 8 Gruppen-Gates tragen `--allowed-groups=workspace-users` + `--oidc-groups-claim=groups`; studio/traefik/mailpit behalten `--authenticated-emails-file`; Seed-Job enthält die Gruppen-Anlage.
- `task workspace:validate`, `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:inventory`.
- Rollout-Gate: Staging-/Token-Verifikation (`email_verified`, groups-Claim im id_token) vor `task workspace:deploy ENV=mentolder|korczewski`.

## Scope

Nur Prod-Patches, Seed-Job, SSOT-Delta, Tests, WP3-Cleanup. Dev-Basis-Gates und Keycloak-basierte `*-dev`-Proxys (out of scope, anderes Auth-System) bleiben unverändert.
