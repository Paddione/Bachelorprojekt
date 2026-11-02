# Domains-Graph (generiert)

Quelle: `docs/agent-guide/registry/domains.yaml` · Erzeugt mit `node scripts/domains-graph.mjs --live` · Stand 2026-11-02T10:27:19.338Z.
Nicht von Hand editieren. Nach Aenderung den Repo-Graph neu indizieren (`index_repository`).

## web.korczewski.de

- id: `website-korczewski` · cluster: fleet · status: frozen
- Backend: `website:80` (ns `website-korczewski`)
- Manifest: `prod-fleet/website-korczewski/website-ingress-web.yaml`
- Auth: **open**

## web.korczewski.de

- id: `website-staging` · cluster: fleet · status: frozen
- Backend: `website:80` (ns `website-staging`)
- Manifest: `prod-fleet/website-staging/website-ingress-web.yaml`
- Auth: **open**

## korczewski.de

- id: `apex-korczewski` · cluster: fleet · status: frozen
- Backend: `website:80` (ns `website-korczewski`)
- Manifest: `prod-fleet/website-korczewski/website-apex.yaml`
- Auth: **open**

## web.devmesh.korczewski.de

- id: `devmesh-web` · cluster: devmesh · status: live
- Backend: `sdlc-console:8080` (ns `components`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: native · Client `website` · Gruppen workspace-users
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 302 → /sdlc/cockpit
- Pocket-ID-Client: vorhanden

## massage.devmesh.korczewski.de

- id: `devmesh-website-alias` · cluster: devmesh · status: live
- Backend: `website:80` (ns `components`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **open**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 200

## auth.devmesh.korczewski.de

- id: `devmesh-auth` · cluster: devmesh · status: live
- Backend: `pocket-id:1411` (ns `core`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: issuer
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 200

## mail.devmesh.korczewski.de

- id: `devmesh-mail` · cluster: devmesh · status: live
- Backend: `mailpit:8025` (ns `components`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **token**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 200

## brain.devmesh.korczewski.de

- id: `devmesh-brain` · cluster: devmesh · status: live
- Backend: `oauth2-proxy-brain:4180` (ns `components`)
- Manifest: `dev-local/components/brain/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `brain` · Gruppen workspace-users
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 302 → https://auth.devmesh.korczewski.de/authorize?approval_prompt=force&client_id=brain&code_ch
- Pocket-ID-Client: vorhanden

## files.devmesh.korczewski.de

- id: `devmesh-files` · cluster: devmesh · status: live
- Backend: `nextcloud:80` (ns `components`)
- Manifest: `dev-local/components/nextcloud/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: native · Client `nextcloud` · Gruppen workspace-users
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 404
- Pocket-ID-Client: vorhanden

## office.devmesh.korczewski.de

- id: `devmesh-office` · cluster: devmesh · status: live
- Backend: `collabora:9980` (ns `components`)
- Manifest: `dev-local/components/collabora/ingress.yaml`
- Auth: **open**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 404

## signaling.devmesh.korczewski.de

- id: `devmesh-signaling` · cluster: devmesh · status: live
- Backend: `spreed-signaling:8080` (ns `components`)
- Manifest: `dev-local/components/talk/ingress.yaml`
- Auth: **token**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 404

## vault.devmesh.korczewski.de

- id: `devmesh-vault` · cluster: devmesh · status: live
- Backend: `vaultwarden:80` (ns `components`)
- Manifest: `dev-local/components/vaultwarden/ingress.yaml`
- Auth: **open**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 404

## opencode.korczewski.de

- id: `devmesh-opencode` · cluster: devmesh · status: live
- Backend: `opencode:80` (ns `components`)
- Manifest: `dev-local/components/opencode/ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `claudecode` · Gruppen workspace-users
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 401
- Pocket-ID-Client: FEHLT
- **Befund:** OIDC-Client 'claudecode' fehlt in Pocket ID

## fritz.korczewski.de

- id: `devmesh-fritzbox` · cluster: devmesh · status: live
- Backend: `oauth2-proxy-fritzbox:4180` (ns `components`)
- Manifest: `dev-local/components/opencode/fritzbox-ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `fritzbox` · Gruppen workspace-users
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 401
- Pocket-ID-Client: FEHLT
- **Befund:** OIDC-Client 'fritzbox' fehlt in Pocket ID

## web.korczewski.de

- id: `korczewski-web-mirror` · cluster: devmesh · status: live
- Backend: `website:80` (ns `components`)
- Manifest: `dev-local/components/korczewski-prod/ingressroute.yaml`
- Auth: **open**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 401 (erwartet 404)
- **Befund:** HTTP 401 statt 404

## korczewski.de

- id: `korczewski-apex-mirror` · cluster: devmesh · status: live
- Backend: `website:80` (ns `components`)
- Manifest: `dev-local/components/korczewski-prod/ingressroute.yaml`
- Auth: **open**
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 404

## auth.korczewski.de

- id: `korczewski-auth-mirror` · cluster: devmesh · status: live
- Backend: `pocket-id:1411` (ns `components`)
- Manifest: `dev-local/components/korczewski-prod/ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: issuer
- TLS: TLSv1.3 · Aussteller Let's Encrypt · gueltig bis 2027-01-31 (89 Tage) · Kette vertraut
- HTTP: 200
