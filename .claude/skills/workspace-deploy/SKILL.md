---
name: workspace-deploy
description: Full-stack workspace platform deployment — umbrella workspace:setup, post-setup, talk/recording/transcriber, optional admin-users and vaultwarden seed. Covers every service that doesn't ship via base kustomization alone.
agent: bachelorprojekt-infra
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# workspace-deploy

**The base kustomization (`workspace:deploy`) does NOT deploy every service.** It covers Keycloak, Nextcloud, Vaultwarden, DocuSeal, Brett, Docs, Whiteboard, LiveKit, Traefik dashboard, and ComfyUI. The following services are deployed separately:

| Service | Deploy task | Namespace | Status |
|---------|-------------|-----------|--------|
| Collabora (Office) | `workspace:office:deploy` | `workspace-office` | ⚠️ Own ns — not in base kustomize |
| CoTURN + Janus | `workspace:coturn:deploy` | `coturn` | 🔒 Prod only |
| Website | `website:deploy` / `feature:website` | `website-ns` | Own ns, CI auto-deploy |
| Arena (korczewski only) | `arena:deploy ENV=korczewski` | `workspace-korczewski` | korczewski only |

This skill covers the **sub-steps of `workspace:setup`** and the optional provisioning tasks.

---

## Phase 1 — Umbrella: `workspace:setup`

The fastest path to a fully deployed environment:

```bash
task workspace:setup ENV=<env>
```

This calls, in order:
1. `workspace:deploy`
2. `workspace:office:deploy` — Collabora online office
3. `mcp:deploy` — MCP gateway
4. `workspace:post-setup` — Nextcloud apps + config
5. `workspace:talk-setup` — Talk HPB + signaling
6. `workspace:recording-setup` — recording backend
7. `workspace:transcriber-setup` — speech-to-text

**After umbrella**, run the prod-only stacks:
```bash
# CoTURN/Janus (prod only — Talk video fails without it)
task workspace:coturn:deploy ENV=<env>

# Website (own namespace)
task website:deploy ENV=<env>
# or: task feature:website (both brands)

# Arena (korczewski only)
task arena:deploy ENV=korczewski

# Optional one-time provisioning
task workspace:admin-users-setup ENV=<env>   # SSO admin users in Keycloak
task workspace:vaultwarden:seed ENV=<env>     # seed secret templates
```

### Cross-brand (fleet cluster)

```bash
# mentolder
task workspace:setup ENV=mentolder
task workspace:coturn:deploy ENV=mentolder

# korczewski
task workspace:setup ENV=korczewski
task workspace:coturn:deploy ENV=korczewski
task arena:deploy ENV=korczewski
```

---

## Phase 2 — `workspace:post-setup`

Activates and configures Nextcloud apps after the base deployment.

```bash
task workspace:post-setup ENV=<env>
```

**What it does:**
- Enables Nextcloud apps: `user_oidc`, `whiteboard`, `files_zip`, `files_versions`, `files_sharing`, `talk`
- Configures OIDC provider URL (Keycloak realm)
- Sets Talk HPB settings
- Seeds default group folders

**When to run:**
- After every `workspace:deploy` (new ConfigMap could change app config)
- After Keycloak realm sync (OIDC URLs may change)

**Troubleshooting:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `user_oidc` shows "Not configured" | post-setup skipped after deploy | Re-run `task workspace:post-setup ENV=<env>` |
| Apps not activating | Nextcloud still booting | Wait for `deploy/nextcloud` Ready, then re-run |
| OIDC login loop | Redirect URIs mismatch | Re-run `task keycloak:sync ENV=<env>` then post-setup |

---

## Phase 3 — `workspace:talk-setup`

Configures Nextcloud Talk HPB (High-Performance Backend) and signaling.

```bash
task workspace:talk-setup ENV=<env>
```

**What it does:**
- Registers the Talk HPB signaling server with Nextcloud
- Configures CoTURN TURN/STUN credentials
- Sets STUN/TURN server URLs and secrets

**Prerequisites:**
- `workspace:coturn:deploy` must have run (prod) or coturn must be reachable
- `workspace:post-setup` should have run first (Talk app must be enabled)

**Troubleshooting:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| Talk calls fail to connect | CoTURN not deployed | `task workspace:coturn:deploy ENV=<env>` |
| Signaling shows "offline" | HPB config stale | Re-run `task workspace:talk-setup ENV=<env>` |

---

## Phase 4 — `workspace:recording-setup`

Configures the recording backend (LiveKit recording/egress).

```bash
task workspace:recording-setup ENV=<env>
```

**What it does:**
- Configures LiveKit recording/egress settings
- Sets up storage backend for recordings (Longhorn PVC)
- Registers recording targets

**Prerequisites:**
- LiveKit must be deployed and healthy
- Longhorn StorageClass must exist (`kubectl get storageclass longhorn`)

---

## Phase 5 — `workspace:transcriber-setup`

Configures the speech-to-text transcriber service.

```bash
task workspace:transcriber-setup ENV=<env>
```

**What it does:**
- Registers the transcriber service with Nextcloud Talk
- Configures model endpoints for speech-to-text
- Sets language and model parameters

**Prerequisites:**
- `workspace:recording-setup` should have run first
- LLM/GPU service must be available (see `llm-ops` skill)

---

## Phase 6 — Optional Provisioning

### `workspace:admin-users-setup`

Creates initial SSO admin users in Keycloak.

```bash
task workspace:admin-users-setup ENV=<env>
```

**What it does:**
- Creates admin user accounts in the brand's Keycloak realm
- Assigns admin roles/groups
- Seeds initial passwords from sealed secrets

**When to run:**
- Once after initial cluster deployment
- After adding a new brand on the fleet cluster

### `workspace:vaultwarden:seed`

Seeds Vaultwarden with initial secret templates and folder structure.

```bash
task workspace:vaultwarden:seed ENV=<env>
# View seed logs:
task workspace:vaultwarden:seed-logs ENV=<env>
```

**What it does:**
- Creates shared folders in Vaultwarden
- Seeds secret templates (e.g., SSH keys, API tokens, database credentials)
- Sets up initial organization structure

**When to run:**
- Once after initial Vaultwarden deployment
- After DB restore (secrets need to be re-seeded)

**Troubleshooting:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| Seed fails with connection error | Vaultwarden not fully ready | Wait for `deploy/vaultwarden` Ready, then retry |
| Duplicate folders after re-seed | Re-running seed on existing data | Check logs with `task workspace:vaultwarden:seed-logs` |

---

## Service Inventory

| Service | Ingress host | Deployed by | Phase |
|---------|-------------|-------------|-------|
| Keycloak | `auth.<domain>` | `workspace:deploy` | Base |
| Nextcloud | `files.<domain>` | `workspace:deploy` | Base |
| Talk HPB / signaling | `meet.`, `signaling.<domain>` | `workspace:deploy` + talk-setup | Base + P3 |
| Whiteboard | `board.<domain>` | `workspace:deploy` | Base |
| Vaultwarden | `vault.<domain>` | `workspace:deploy` | Base |
| DocuSeal | `sign.<domain>` | `workspace:deploy` | Base |
| Docs | `docs.<domain>` | `workspace:deploy` | Base |
| Brett | `brett.<domain>` | `workspace:deploy` | Base |
| ComfyUI | `comfy.<domain>` | `workspace:deploy` | Base |
| Mailpit | `mail.<domain>` | `workspace:deploy` | Base |
| Traefik dashboard | `traefik.<domain>` | `workspace:deploy` | Base |
| Tracking | `tracking.<domain>` | `workspace:deploy` | Base |
| LiveKit | `livekit.`, `stream.<domain>` | `workspace:deploy` + `livekit:dns-pin` | Base |
| Collabora | `office.<domain>` | `workspace:office:deploy` | P1 umbrella |
| CoTURN + Janus | — (UDP) | `workspace:coturn:deploy` | Prod only |
| Website | `web.<domain>` | `website:deploy` / `feature:website` | Separate |
| Arena (korczewski) | `arena-ws.korczewski.de` | `arena:deploy ENV=korczewski` | korczewski only |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `workspace:setup` completes but `office.<domain>` 404 | Collabora deploy skipped | Run `task workspace:office:deploy ENV=<env>` |
| Talk calls fail / video not connecting | CoTURN not deployed | `task workspace:coturn:deploy ENV=<env>` (prod only) |
| Nextcloud apps not active | post-setup not run | `task workspace:post-setup ENV=<env>` |
| Recording not working | recording-setup skipped or LiveKit unhealthy | `task workspace:recording-setup ENV=<env>`; check LiveKit pods |
| Transcriber not responding | transcriber-setup skipped or GPU unavailable | `task workspace:transcriber-setup ENV=<env>`; check `llm-ops` |
| Admin users missing | admin-users-setup not run | `task workspace:admin-users-setup ENV=<env>` (one-time) |
| Vaultwarden empty | seed not run | `task workspace:vaultwarden:seed ENV=<env>` |

---

## Related Skills

| Skill | Beziehung |
|-------|-----------|
| `cluster-deployment` | Voraussetzung — Cluster muss stehen |
| `fleet-ops` | Querschnitt — Cross-Brand-Fan-out |
| `llm-ops` | Voraussetzung — Transcriber braucht GPU/LLM |
| `secret-rotation` | Querschnitt — Secrets nach Deploy rotieren |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
