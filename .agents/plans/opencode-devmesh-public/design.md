---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-26
---

# opencode-devmesh-public — Design Spec

Public `opencode` web UI on devmesh at `${OPENCODE_PUBLIC_HOST}` (apex custom
domain, FritzBox DynDNS + NAT), TLS via `letsencrypt-devmesh` (ipv64 DNS-01),
gated by Pocket ID SSO (oauth2-proxy + Traefik forwardAuth). No Tailscale
required for clients. No touch of prod `korczewski` (frozen workspace, T002479).

## Decisions (with user, 2026-10-26)

- **D1 Auth = Pocket ID SSO.** `opencode serve` has no `--password` flag (only
  `serve --service` uses `service.json`). Password enforced at Traefik layer
  via `oauth2-proxy-opencode` + forwardAuth middleware — same pattern as
  `dev-local/components/brain/` (`oauth2-proxy-brain`, client-id `brain`).
  BasicAuth rejected (weaker, second password store).
- **D2 Route = Traefik IngressRoute (not Ingress).** Sessions precedent
  (`dev-local/components/sessions/sessions-ingress.yaml`): `Host()` rule +
  `tls.secretName`. Middleware chain mirrors `session-hub-auth`.
- **D3 Cert = dedicated `Certificate opencode-public-tls`.** Apex host is not
  covered by `devmesh-wildcard-tls` (single-level wildcard only, same reason
  `sessions-wildcard` exists for `*.${SESSIONS_DOMAIN}`). Same issuer
  `letsencrypt-devmesh` — its ipv64 DNS-01 solver validates any name in the
  zone, apex included.
- **D4 Host var = `${OPENCODE_PUBLIC_HOST}`** in `environments/dev.yaml`
  (pattern: `${WEBSITE_HOST}`). No brand-domain literals in manifests.
- **D5 Image pinned by digest at execute time.** Candidates: `smanx/opencode`
  (defaults `0.0.0.0:4096`, tracks releases) or `ghcr.io/brockar/opencoded`
  (its `OPENCODE_SERVER_PASSWORD` NOT used — Pocket ID gates instead).
- **D6 Pocket ID client `opencode`.** Redirect
  `https://${OPENCODE_PUBLIC_HOST}/oauth2/callback`, secret key
  `POCKET_ID_OPENCODE_SECRET` in `workspace-secrets` via SealedSecret
  (`task env:seal`); client registered via `pocket-id-client-seed` patch
  (pattern: `dev-local/core/kustomization.yaml` `WEBSITE_EXTRA_CALLBACK`).

## Operator prerequisites (no repo change, execute verifies only)

1. ipv64: `A opencode` → FritzBox WAN IP (zone currently empty — records
   deleted ~2026-10-26; recreate `opencode`, optional `CNAME *` → apex).
2. FritzBox: DynDNS entry (Anbieter Benutzerdefiniert,
   `https://ipv64.net/nic/update?key=<Domain-Update-Key>&ip=<ipaddr>&ip6=<ip6addr>`,
   Domainname `opencode.<apex>`, user/pass `none`) + NAT `80/443` → Traefik LB
   (`10.10.10.3`), plus lan-dns override for internal clients.
3. Deploy live (`task devmesh:deploy`) and Pocket ID client secret rotation
   only after explicit user approval in the execute session.

## Non-goals

- No `tailscale serve` / funnel for this host (tailnet path stays as-is).
- No `*.korczewski.de` wildcard cert (single-host cert suffices).
- No changes under `prod-*`, `fleet/*`, mentolder brand, or frozen korczewski
  workspace namespaces.
