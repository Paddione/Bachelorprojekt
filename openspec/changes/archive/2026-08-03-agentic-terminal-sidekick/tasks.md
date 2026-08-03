---
title: "Agentic Terminal Sidekick — Implementation Plan"
ticket_id: T001565
domains: [website, infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Agentic Terminal Sidekick — Implementation Plan

## Goal

Replace the Sidekick `grilling` view with a SSO-gated live terminal (`terminal`) that embeds ttyd running the local WSL agents. Browser → Traefik → `oauth2-proxy-terminal` (Pocket-ID group gate) → selector-less `terminal-bridge` Service → `Endpoints(${TERMINAL_OVERLAY_IP}:7681)` → ttyd on the WSL host (bind wg-fleet IP only, `--writable`) → tmux session `sidekick`. Direct precedent: the RustDesk web-client bridge.

## File Structure

New and modified files, grouped by responsibility. Each file has one clear job.

**Infra — cluster manifests (Kustomize base `k3d/`):**
- [x] `k3d/terminal-sidekick.yaml` — selector-less `terminal-bridge` Service + `Endpoints` on `${TERMINAL_OVERLAY_IP}:7681` (pattern: `k3d/rustdesk-web-bridge.yaml`).
- [x] `k3d/oauth2-proxy-terminal.yaml` — oauth2-proxy Deployment + Service, `client-id=terminal-sidekick`, upstream `http://terminal-bridge:7681`, group-gate flags (pattern: `k3d/oauth2-proxy-mediaviewer.yaml`).
- [x] `k3d/kustomization.yaml` — registered the two new manifests (S4 orphan guard).
- [x] `k3d/ingress.yaml` — dev host `terminal.localhost` → `oauth2-proxy-terminal:4180`.
- [x] `k3d/configmap-domains.yaml` — new key `TERMINAL_HOST: "terminal.localhost"`.
- [x] `k3d/website.yaml` — injected `TERMINAL_HOST` env from `domain-config` into the website Deployment.

**Infra — prod overlay (`prod/`):**
- [x] `prod/patch-oauth2-proxy-terminal.yaml` — prod args (issuer `https://auth.${PROD_DOMAIN}`, `--cookie-secure=true --cookie-samesite=none`).
- [x] `prod/ingress.yaml` — TLS Ingress for `terminal.${PROD_DOMAIN}` → `oauth2-proxy-terminal:4180`.
- [x] `prod/configmap-domains.yaml` — `TERMINAL_HOST: "terminal.${PROD_DOMAIN}"`.
- [x] `prod/traefik-middlewares.yaml` — `terminal-embed-headers` Middleware (frame-ancestors → website origin).
- [x] `prod/kustomization.yaml` — registered `patch-oauth2-proxy-terminal.yaml`.

**Infra — WireGuard + env registry:**
- [x] `wireguard/wg-mesh-nodes.yaml` — WSL-host peer in the `fleet:` block (`wg_ip 10.20.0.10`).
- [x] `environments/schema.yaml` — registered `TERMINAL_OVERLAY_IP`.
- [x] `environments/mentolder.yaml`, `environments/fleet-mentolder.yaml` — `TERMINAL_OVERLAY_IP: "10.20.0.10"`.
- [x] `Taskfile.yml` — added `$TERMINAL_OVERLAY_IP` to the two `ENVSUBST_VARS` lists and a dev fallback.

**Host setup (not k8s-deployable — committed script):**
- [x] `scripts/terminal-sidekick-host.sh` — idempotent ttyd + tmux `sidekick` + systemd-user-unit installer.

**Frontend (`website/`):**
- [x] `website/src/components/mediaviewer/TerminalSessionIframe.svelte` — iframe on `https://${terminalHost}/` + "In neuem Tab öffnen" fallback link.
- [x] `website/src/components/PortalSidekick.svelte` — `View` union `grilling`→`terminal`; `titleMap`; drawer-body branch; new `terminalHost` prop.
- [x] `website/src/components/assistant/SidekickHome.svelte` — menu item swap (`grilling`→`terminal`, `show: isAdmin`) + `View` type.
- [x] `website/src/lib/assistant/sidekick-nudge.ts` — `SidekickView` type + `KNOWN_VIEWS` set `grilling`→`terminal`.
- [x] `website/src/components/PortalSidekick.test.ts` — new `terminal` view test; assert no `grilling`.
- [x] `website/src/components/mediaviewer/GrillingSessionHost.svelte` — deleted (replaced by TerminalSessionIframe.svelte).

**Tests:**
- [x] `tests/spec/terminal-sidekick.bats` — infra structure assertions (bridge/proxy/ingress/seed/wg/script).
- [x] `website/src/components/PortalSidekick.test.ts` — frontend test for terminal view (Vitest, Svelte 5).

## Unchanged (explicitly out of scope)

`MediaviewerPanel.svelte`, `mediaviewer-bridge.ts`, `GrillingStepper.svelte`, `lib/tickets/grilling.ts`, `lib/tickets/final-grilling.ts` and their tests — the `mode="grilling"` dead path stays for a later chore (Q7).

## Architecture

Browser → Traefik → `oauth2-proxy-terminal` (Pocket-ID group gate) → selector-less `terminal-bridge` Service → `Endpoints(${TERMINAL_OVERLAY_IP}:7681)` → ttyd on WSL host (bind wg-fleet IP only, `--writable`) → tmux session `sidekick`. Direct precedent: the RustDesk web-client bridge.

## Tech Stack

Kustomize, oauth2-proxy v7.9.0, Pocket-ID OIDC, WireGuard (fleet mesh `10.20.0.0/24`), ttyd + tmux + systemd-user-unit, Svelte 5 (runes), Vitest, BATS.

## Global Constraints

- ttyd MUST bind only the wg-fleet interface IP (`--interface 10.20.0.10`), never `0.0.0.0`, and MUST run `--writable` (ttyd ≥1.7 is read-only without it).
- oauth2-proxy MUST pass `--allowed-group=terminal-admins` together with `--oidc-groups-claim=groups`; the `groups` claim must reach the ID token (client-scope config is a manual step).
- S3 (no hardcoded brand hostnames): in `k3d/*.yaml` and `prod*/*.yaml` use only `${PROD_DOMAIN}`, `${SCHEME}://terminal.${SUFFIX}`, or `terminal.localhost` — never `terminal.mentolder.de` / `terminal.korczewski.de` literals.
- S4 (no orphans): every new `k3d/*.yaml` MUST be referenced in a `kustomization.yaml`; `scripts/terminal-sidekick-host.sh` MUST be reachable (referenced by the BATS spec and the design spec).
- One shared hostname/proxy for both brands (`terminal.${PROD_DOMAIN}`) — no korczewski-specific proxy (Q4).
- CQ02: introduce no new `: any` / `as any` in `website/src` (global count is 10, limit 200).

## Migration Plan

No migration — pure Doku/Config/Script-Änderungen. Rollback: `git revert` des Merge-Commits stellt den alten `goals.md`-Stand wieder her; keine Datenbank- oder Cluster-Zustände betroffen.
