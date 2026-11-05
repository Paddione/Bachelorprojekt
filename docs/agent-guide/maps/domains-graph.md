# Domains-Graph (generiert)

Quelle: `docs/agent-guide/registry/domains.yaml` · Erzeugt mit `node scripts/domains-graph.mjs`.
Nicht von Hand editieren. Nach Aenderung den Repo-Graph neu indizieren (`index_repository`).

## web.korczewski.de

- id: `website-korczewski` · mesh: prodmesh · status: frozen
- Backend: `website:80` (ns `website-korczewski`)
- Manifest: `prod-fleet/website-korczewski/website-ingress-web.yaml`
- Auth: **open**

## web.korczewski.de

- id: `website-staging` · mesh: prodmesh · status: frozen
- Backend: `website:80` (ns `website-staging`)
- Manifest: `prod-fleet/website-staging/website-ingress-web.yaml`
- Auth: **open**

## korczewski.de

- id: `apex-korczewski` · mesh: prodmesh · status: frozen
- Backend: `website:80` (ns `website-korczewski`)
- Manifest: `prod-fleet/website-korczewski/website-apex.yaml`
- Auth: **open**

## web.devmesh.korczewski.de

- id: `devmesh-web` · mesh: devmesh · status: live
- Backend: `sdlc-console:8080` (ns `components`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: native · Client `website` · Gruppen workspace-users

## massage.devmesh.korczewski.de

- id: `devmesh-website-alias` · mesh: devmesh · status: live
- Backend: `website:80` (ns `components`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **open**

## auth.devmesh.korczewski.de

- id: `devmesh-auth` · mesh: devmesh · status: live
- Backend: `pocket-id:1411` (ns `core`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: issuer

## mail.devmesh.korczewski.de

- id: `devmesh-mail` · mesh: devmesh · status: live
- Backend: `mailpit:8025` (ns `components`)
- Manifest: `dev-local/core/ingress.yaml`
- Auth: **token**

## brain.devmesh.korczewski.de

- id: `devmesh-brain` · mesh: devmesh · status: live
- Backend: `oauth2-proxy-brain:4180` (ns `components`)
- Manifest: `dev-local/components/brain/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `brain` · Gruppen workspace-users

## office.devmesh.korczewski.de

- id: `devmesh-office` · mesh: devmesh · status: live
- Backend: `collabora:9980` (ns `components`)
- Manifest: `dev-local/components/collabora/ingress.yaml`
- Auth: **open**

## vault.devmesh.korczewski.de

- id: `devmesh-vault` · mesh: devmesh · status: live
- Backend: `vaultwarden:80` (ns `components`)
- Manifest: `dev-local/components/vaultwarden/ingress.yaml`
- Auth: **open**

## opencode.korczewski.de

- id: `devmesh-opencode` · mesh: devmesh · status: live
- Backend: `opencode:80` (ns `components`)
- Manifest: `dev-local/components/opencode/ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `opencode` · Gruppen workspace-users

## fritz.korczewski.de

- id: `devmesh-fritzbox` · mesh: devmesh · status: live
- Backend: `oauth2-proxy-fritzbox:4180` (ns `components`)
- Manifest: `dev-local/components/opencode/fritzbox-ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `fritz` · Gruppen workspace-users

## web.korczewski.de

- id: `korczewski-web-mirror` · mesh: devmesh · status: live
- Backend: `website:80` (ns `components`)
- Manifest: `dev-local/components/korczewski-prod/ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: oauth2-proxy · Client `web-korczewski` · Gruppen workspace-owners

## korczewski.de

- id: `korczewski-apex-mirror` · mesh: devmesh · status: live
- Backend: `website:80` (ns `components`)
- Manifest: `dev-local/components/korczewski-prod/ingressroute.yaml`
- Auth: **open**

## auth.korczewski.de

- id: `korczewski-auth-mirror` · mesh: devmesh · status: live
- Backend: `pocket-id:1411` (ns `components`)
- Manifest: `dev-local/components/korczewski-prod/ingressroute.yaml`
- Auth: **oidc**
- SSO-Gate: issuer

## auth.korczewski.de

- id: `auth-korczewski` · mesh: prodmesh · status: live
- Backend: `pocket-id:1411` (ns `workspace-korczewski`)
- Manifest: `k3d/pocket-id.yaml`
- Auth: **oidc**
- SSO-Gate: issuer

## agent-board.devmesh.korczewski.de

- id: `devmesh-agent-board` · mesh: devmesh · status: live
- Backend: `agent-board:80` (ns `workspace`)
- Manifest: `apps/agent-board/k8s/ingress.yaml`
- Auth: **oidc**
- SSO-Gate: native · Client `f88484dc-4e8f-40f4-b14f-0dace37ddb5c`
