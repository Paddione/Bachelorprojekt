# Proposal: oauth2-proxy-hardening

## Why

Security-Review PR #2554: Alle 11 oauth2-proxy-Prod-Gates deaktivieren die TLS-Verifikation gegen den OIDC-Issuer (`--ssl-insecure-skip-verify=true`), obwohl `auth.<domain>` ein gültiges Let's-Encrypt-Wildcard-Zertifikat hat, und akzeptieren unverifizierte E-Mails. 8 Gates autorisieren mit `--email-domain=*` — jeder Pocket-ID-User kommt in jedes Gate.

## What

- **WP1:** `--ssl-insecure-skip-verify=true` aus allen 11 `prod/patch-oauth2-proxy-*.yaml` entfernen; `--skip-oidc-discovery=true` bleibt bewusst (explizite Endpoint-Flags gesetzt, Discovery koppelt Pod-Start an Issuer).
- **WP2:** Bei den 8 `email-domain=*`-Gates auf Gruppen-Autorisierung umstellen: Pocket-ID-Gruppe `workspace-users` (idempotente Anlage im Seed-Job), `--scope=openid email profile groups`, `--oidc-groups-claim=groups`, `--allowed-groups=workspace-users`; `--email-domain=*` + `--insecure-oidc-allow-unverified-email` entfernen. Die 3 Allowlist-Gates (studio, traefik, mailpit) behalten `--authenticated-emails-file`, verlieren nur die insecure-Flags. Staging-Verifikation vor Prod-Rollout (Lockout-Risiko).
- **WP3:** Verwaisten Baum `templates/brain/prod-korczewski/` löschen (`brain-exclude.yaml` existiert bereits nicht mehr — Ticket-Prämisse überholt).
- SSOT-Delta gegen `openspec/specs/auth-sso.md` (Gate-Flag-Konventionen) + neue Manifest-Tests `tests/spec/auth-sso.bats`.

Design-Spec: `docs/superpowers/specs/2026-07-03-oauth2-proxy-hardening-design.md`

_Ticket: T001579_
