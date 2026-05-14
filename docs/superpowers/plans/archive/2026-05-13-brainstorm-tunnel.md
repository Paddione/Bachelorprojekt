---
title: Plan — brainstorm.mentolder.de choice transmission
domains: []
status: active
pr_number: null
---

# Plan — brainstorm.mentolder.de choice transmission

## Goal

Make the brainstorming visual-companion choice loop work end-to-end via
`https://brainstorm.mentolder.de`: HTML pushed by Claude → Patrick clicks in
browser → WebSocket event flows back through the cluster → events file updated
on Patrick's local machine → Claude reads on the next turn.

## Current state

- Prod-mentolder cluster has an ad-hoc scratch setup (NOT in git) created by a
  parallel Claude session: `brainstorm-proxy` Pod (`socat TCP-LISTEN:8080,fork
  → 178.104.169.206:59457`), `brainstorm` Service :80, `brainstorm` Ingress for
  `brainstorm.mentolder.de` with `mentolder-tls`.
- DNS works for `brainstorm.mentolder.de` (wildcard `*.mentolder.de` cert
  covers it; HTTPS request reaches the socat pod and returns empty because the
  upstream home-server is down).
- The brainstorm helper.js hardcodes `WS_URL = 'ws://' + window.location.host`
  (helper.js:2). When the page is served over HTTPS, Chrome/Firefox block the
  insecure WebSocket as mixed content — clicks never reach the server.
- The brainstorm server binds `127.0.0.1` by default (server.cjs:77), but with
  the chosen sish/SSH-`-R` model the loopback bind is fine.

## Design

**Transport:** Add a dedicated sish reverse-SSH-tunnel broker to the prod
mentolder cluster (workspace ns), same proven mechanism as `dev-stack/sish.yaml`.
Sish listens on SSH NodePort 32223 (host ufw-opened on `gekko-hetzner-2`) and
HTTP :80 in-cluster. Traefik routes `brainstorm.mentolder.de` to sish:80.
Operator runs `task brainstorm:publish -- <localport>`, which wraps:

```bash
ssh -p 32223 -N -R "brainstorm:80:localhost:<localport>" tunnel@${BRAINSTORM_NODE_IP}
```

**ws://→wss:// fix:** Patch
`~/.claude/plugins/cache/claude-plugins-official/superpowers/<ver>/skills/brainstorming/scripts/helper.js`
to derive the protocol from `window.location.protocol`. Idempotent script in
`scripts/superpowers-helper-patch.sh`, wired as a SessionStart hook in
`.claude/settings.json` so plugin re-syncs don't silently break the loop.

**Cleanup:** Once the manifest-tracked sish is live, delete the scratch
`brainstorm-proxy` Pod + `brainstorm` Service + `brainstorm` Ingress (the new
manifest re-creates Service + Ingress under git control).

## Files

1. `k3d/brainstorm-sish.yaml` (new) — sish Deployment + Service + Ingress.
   Pinned to `gekko-hetzner-2` nodeSelector (matches existing scratch pod).
   Args: `--bind-hosts=brainstorm.${PROD_DOMAIN}`, `--bind-random-subdomains=false`,
   `--force-requested-subdomains=true`, `--authentication=true`,
   `--authentication-keys-directory=/keys`.
   ConfigMap `brainstorm-sish-authorized-keys` materialised by Taskfile (reads
   `DEV_SISH_AUTHORIZED_KEYS` from `environments/.secrets/mentolder.yaml`).
2. `prod-mentolder/kustomization.yaml` — add the new resource.
3. `Taskfile.brainstorm.yml` (new) — `publish`, `firewall:open`, `status`,
   `_materialise-keys` (mirrors the dev-stack pattern).
4. `Taskfile.yml` — include `Taskfile.brainstorm.yml` under namespace `brainstorm`.
5. `scripts/superpowers-helper-patch.sh` (new) — globs all
   `~/.claude/plugins/cache/**/superpowers/**/skills/brainstorming/scripts/helper.js`
   and applies an idempotent sed-style patch.
6. `.claude/settings.json` — SessionStart hook invoking the patcher.
7. `.claude/skills/dev-flow/SKILL.md` — updated Visual Companion section
   (remove the stale static-file alternative, document the publish step).

## Tests / verify

- `task workspace:validate` — manifests resolve.
- `task test:all` — BATS + dry-run.
- After deploy: `task brainstorm:status ENV=mentolder` shows sish pod ready and
  ingress responding 502 (no tunnel yet, expected).
- After publish: `curl -I https://brainstorm.mentolder.de/` returns 200 with
  the waiting page; browser opens, helper.js loads with `wss://` and the
  WebSocket Upgrade succeeds; clicks land in `$STATE_DIR/events`.

## Risks

- Hetzner cloud firewall may also block 32223/tcp on top of ufw — verify after
  the ufw rule is applied; if so, add cloud-init rule like livekit.
- SSH `-R` connection idle-timeouts: sish is configured with
  `--idle-connection-timeout=24h`; for shorter sessions a `ServerAliveInterval`
  flag on the client side is in the wrapper task.
- Plugin cache wipe after a `claude` upgrade: SessionStart hook re-applies the
  patch automatically.
- The existing scratch resources must be deleted by hand the first time (the
  new manifest replaces Service/Ingress with the same names — kubectl apply
  reconciles, but the scratch `brainstorm-proxy` Pod stays orphaned and must
  be deleted explicitly).
