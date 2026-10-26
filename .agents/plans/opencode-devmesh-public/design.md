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
- **D7 FritzBox login via SSO (2026-10-26 amendment).** Public host
  `${FRITZ_BOX_HOST}` (`fritz.korczewski.de`, `CNAME → opencode` record so it
  follows DynDNS) → Traefik IngressRoute with the same forwardAuth pattern,
  but a second oauth2-proxy deployment (`oauth2-proxy-fritzbox`,
  `client-id=fritz`) whose upstream is the box UI
  (`${FRITZ_BOX_URL}`, box LAN IP + admin port, TLS with upstream verify
  skipped — box serves a self-signed cert for foreign hosts). Pocket ID client
  `fritz` + `POCKET_ID_FRITZBOX_SECRET` via the same seed/SealedSecret path as
  D6. Security: box UI is internet-reachable only behind the SSO gate; keep the
  box password strong and firmware auto-updates on. No separate wildcard.
- **D8 Dualstack.** `AAAA` already DynDNS-managed; execute verifies v4+v6 end
  to end. Missing IPv6 Freigabe on the box is an operator fix and does NOT
  block the deploy (v4 carries production until v6 is green).

## Operator prerequisites (no repo change, execute verifies only)

1. ipv64 (verified 2026-10-26 — zone alive: apex has only `AAAA`
   `2a04:6ec1:1:a::777e`, no `A`; mail/MX+TXT/DKIM intact): create `A opencode`
   → FritzBox WAN IPv4 (then FritzBox DynDNS-managed), optionally `CNAME *` →
   `opencode.korczewski.de` if a true wildcard is wanted. Note: existing
   `llm.korczewski` CNAME → bare `tail8a4425.ts.net` cannot resolve to a device
   (needs full MagicDNS host, tailnet clients only) — unrelated to this path.
   Verified 2026-10-26: `opencode` resolves via `CNAME → korczewski.de` to WAN
   `159.48.35.222` + `2a04:6ec1:1:a::777e`; FritzBox remote admin on `:4433`
   (no `443` conflict); static NAT `80/443` → `10.10.10.3` done — Traefik
   answers `404` on v4 http+https with default `devmesh` wildcard cert (correct
   pre-deploy state). IPv6 Freigabe `80/443` → Traefik host still pending
   (v6 connect fails); until then clients use v4.
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
