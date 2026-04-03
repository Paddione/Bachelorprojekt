# KORE Platform Documentation

KORE (k3d-dev Operations & Requirements Engineering) is a Kubernetes-native development platform for self-hosted communication and collaboration services. It runs on k3d (k3s-in-Docker) for local development, targeting k3s for production deployment.

| Service | URL | Purpose |
|---------|-----|---------|
| **Keycloak** | `auth.localhost` | SSO / OIDC identity provider |
| **Mattermost** | `chat.localhost` | Real-time messaging |
| **Nextcloud** | `files.localhost` | File storage + collaboration |
| **Collabora** | `office.localhost` | Document editing (WOPI) |
| **Invoice Ninja** | `billing.localhost` | Invoicing, quoting, expense tracking |
| **Talk HPB** | `signaling.localhost` | Nextcloud Talk High Performance Backend |
| **Tracking** | CLI only: `task tracking:psql` | Requirements & pipeline tracking |

---

## Architecture

### Cluster Layout

```
Host Machine (WSL2)
├── Docker Engine
│   ├── k3d-dev-server-0    (control plane)
│   ├── k3d-dev-agent-0     (worker)
│   ├── k3d-dev-agent-1     (worker)
│   ├── k3d-dev-agent-2     (worker)
│   ├── k3d-dev-serverlb    (load balancer, ports 80/443)
│   └── registry.localhost  (local container registry, port 5000)
│
├── Host Ports
│   ├── :80   → cluster LB (HTTP)
│   ├── :443  → cluster LB (HTTPS)
│   ├── :5000 → local registry
│   └── :8080 → NodePort 30080
│
└── Volumes
    └── ./data → /mnt/data on agents
```

### System Diagram

```
Browser
   │
   ├── auth.localhost ──────────┐
   ├── chat.localhost ──────────┤
   ├── files.localhost ─────────┤
   ├── office.localhost ────────┤
   ├── billing.localhost ───────┤
   ├── signaling.localhost ─────┤
   ├── mail.localhost ──────────┤
   │                            ▼
   │              ┌──────────────────────┐
   │              │  Traefik Ingress     │  Reverse Proxy (k3d-managed)
   │              │  Controller          │
   │              └──────────┬───────────┘
   │                         │
   │    ┌────────────┬───────┼──────────────────┬───────────────────┐
   │    ▼            ▼       ▼                  ▼                   ▼
   │ ┌──────────┐ ┌──────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐
   │ │Keycloak  │ │oauth2│ │ Mattermost   │ │  Nextcloud   │ │ Collabora │
   │ │  :8080   │ │-proxy│ │   :8065      │ │  + Talk :80  │ │   :9980   │
   │ └────┬─────┘ │:4180 │ └──────┬───────┘ └──────┬───────┘ └───────────┘
   │      │       └──┬───┘        │                 │
   │      │          ▼            │                 │
   │      │   ┌──────────────┐   │                 │
   │      │   │Invoice Ninja │   │                 │
   │      │   │   :8080      │   │                 │
   │      │   └──────┬───────┘   │                 │
   │      │          │           │                 │
   │      └──────────┼───────────┼─────────────────┘
   │                 ▼           │
   │              ┌──────────────┐
   │              │  shared-db   │  Single PostgreSQL (postgres:16-alpine)
   │              │    :5432     │  DBs: keycloak, mattermost, nextcloud,
   │              └──────────────┘        invoiceninja
   │
   │       ┌────────────────┐         ┌───────────────────────────────┐
   │       │ mm-keycloak    │         │  Talk High Performance Backend │
   │       │ -proxy :8081   │         │                               │
   │       │ (userinfo)     │         │  spreed-signaling :8080       │
   │       └────────────────┘         │       ▼                       │
   │                                  │  Janus :8188 (WebRTC SFU)     │
   │       ┌────────────────┐         │  NATS :4222 (Message Bus)     │
   │       │ billing-bot    │         │  coturn :3478 (TURN/STUN)     │
   │       │  :8090         │         └───────────────────────────────┘
   │       │ (MM slash cmd) │
   │       └────────────────┘         ┌───────────────────────────────┐
   │                                  │  Dev Tools                    │
   │       ┌────────────────┐         │  Prometheus + Grafana         │
   │       │ OpenSearch     │         │  (monitoring namespace)       │
   │       │  :9200 (FA-07) │         └───────────────────────────────┘
   │       └────────────────┘
   │
   │       ┌────────────────┐
   │       │ Mailpit (SMTP) │
   │       │  :1025 / :8025 │
   │       └────────────────┘
```

### Service Dependencies

```
                   shared-db (postgres:16-alpine)
               /     |          \            \
         keycloak  mattermost  nextcloud  invoiceninja  (one DB each)
              |       |            |            |
              v       v            v            v
         Keycloak  Mattermost  Nextcloud  oauth2-proxy --> Invoice Ninja
    (auth.localhost) |   (chat.localhost) (files.localhost) (billing.localhost)
                     |                        |
                     v                        v
               mm-keycloak-proxy         Collabora
               (userinfo translation)    (office.localhost)

billing-bot (:8090) <--> Mattermost (/billing slash command)
      |
      v
invoiceninja API

NATS --> spreed-signaling (signaling.localhost)
              |
              v
            Janus (WebRTC SFU)
              |
              v
            coturn (TURN/STUN :3478)

Traefik Ingress Controller (routes all *.localhost domains)
```

### Domain Configuration

Domains are centrally configured in `k3d/configmap-domains.yaml` — never hardcode hostnames.

| Domain | Service | Port |
|--------|---------|------|
| auth.localhost | Keycloak | 8080 |
| chat.localhost | Mattermost | 8065 |
| files.localhost | Nextcloud (+Talk, Calendar, Contacts) | 80 |
| office.localhost | Collabora Online | 9980 |
| billing.localhost | Invoice Ninja (via OAuth2 Proxy) | 4180 |
| signaling.localhost | spreed-signaling (Talk HPB) | 8080 |
| mail.localhost | Mailpit (dev SMTP web UI) | 8025 |

**Internal-only services (no Ingress):**

| Service | Port | Purpose |
|---------|------|---------|
| opensearch | 9200 | Full-text search engine (FA-07) |
| mailpit (SMTP) | 1025 | Email delivery for MM + NC + Invoice Ninja |
| mm-keycloak-proxy | 8081 | Keycloak userinfo translation |
| billing-bot | 8090 | Mattermost `/billing` slash command |
| nats | 4222 | Talk HPB message bus |
| janus | 8188 | WebRTC Selective Forwarding Unit |
| coturn | 3478 | TURN/STUN for NAT traversal |

### Persistence

| Service | Volume Type | Description |
|---------|------------|-------------|
| shared-db | PersistentVolumeClaim | `shared-db-pvc` (25Gi, all service databases) |
| Mattermost Uploads | PersistentVolumeClaim | `mattermost-data` |
| Nextcloud Files | PersistentVolumeClaim | `nextcloud-data` |
| Invoice Ninja | PersistentVolumeClaim | `invoiceninja-data-pvc` (5Gi, public + storage) |

### Namespaces

| Namespace | Purpose |
|-----------|---------|
| `homeoffice` | Shared PostgreSQL + Keycloak + Mattermost + Nextcloud (Talk + Collabora) + Invoice Ninja SSO stack |
| `tracking` | Shared PostgreSQL tracking database |
| `dev` | Primary development namespace (demo app) |
| `staging` | Integration testing |
| `monitoring` | Observability stack (Prometheus + Grafana) |

All namespaces use Pod Security Standards: `enforce=baseline`, `warn=restricted`.

### k3d to k3s Production Path

- k3d wraps k3s — same runtime, same API, same manifests
- `deploy/overlays/local/` contains k3d-specific patches (registry, volumes)
- `deploy/overlays/prod/` contains production patches (real TLS, external DB, etc.)
- All `*.localhost` domains map to real domains in production via Ingress configuration

### Infrastructure Components

**Traefik Ingress Controller** — Built into k3s, starts automatically. Routes all `*.localhost` domains. k3d exposes ports 80/443 on the host via its built-in load balancer.

**Local Container Registry** — `registry.localhost:5000`, k3d-managed. CoreDNS resolves `registry.localhost` inside the cluster.
- Push from host: `docker push localhost:5000/my-app:tag`
- Pull from pods: `registry.localhost:5000/my-app:tag`
- Kustomize overlays handle this mapping automatically

---

## Services

### Shared PostgreSQL (`shared-db`)

| Property | Value |
|----------|-------|
| Image | `postgres:16-alpine` |
| Port | 5432 (internal) |

Single database instance with per-service databases (keycloak, mattermost, nextcloud, invoiceninja). Each gets its own database and user, created automatically via init script on first start. Service aliases (`keycloak-db`, `mattermost-db`, `nextcloud-db`) point to the same pod.

Access: `task homeoffice:psql -- keycloak` or `task homeoffice:port-forward` for local access.

### Keycloak & SSO

| Property | Value |
|----------|-------|
| Image | `quay.io/keycloak/keycloak:24.0` |
| Port | 8080 (`auth.localhost`) |
| Database | `keycloak` on `shared-db` |

Central identity provider. On first start, imports the `homeoffice` realm from `realm-homeoffice-dev.json` via `scripts/import-entrypoint.sh`.

> **Important:** OIDC secrets must be set BEFORE first Keycloak start. Changing them afterwards requires manual update in Admin Console.

**OIDC Clients:**

| Client ID | Service | Redirect URI |
|-----------|---------|-------------|
| `mattermost` | Mattermost | `https://${MM_DOMAIN}/*` |
| `nextcloud` | Nextcloud | `https://${NC_DOMAIN}/*` |
| `invoiceninja` | Invoice Ninja (OAuth2 Proxy) | `http://${BILLING_DOMAIN}/oauth2/callback` |

Nextcloud Talk inherits the Nextcloud session — no separate OIDC client needed.

**User Management:**
- Keycloak is the sole user store (no external LDAP)
- Brute-force protection enabled, self-registration disabled, login via email supported
- Bulk import: `./scripts/import-users.sh users.csv`

**Authentication Flow (OIDC):**
1. User clicks "Login with Keycloak"
2. Redirect to Keycloak (Authorization Code Flow)
3. Keycloak verifies credentials
4. ID token with claims (email, username) sent to the service
5. Service creates local session

**SSO Integration by Service:**

| Service | Method | Details |
|---------|--------|---------|
| Mattermost | GitLab OAuth protocol | `mm-keycloak-proxy` translates userinfo to GitLab format |
| Nextcloud | `oidc_login` app | Must be manually installed after first deployment |
| Nextcloud Talk | Via Nextcloud session | Authenticated users can use Talk directly |
| Invoice Ninja | OAuth2 Proxy | `oauth2-proxy-invoiceninja` handles auth externally |

### Mattermost (Chat)

| Property | Value |
|----------|-------|
| Image | `mattermost/mattermost-enterprise-edition:9.7` |
| Port | 8065 (`chat.localhost`) |
| Database | `mattermost` on `shared-db` |

Login via Keycloak SSO using the GitLab OAuth protocol. The `mm-keycloak-proxy` (NGINX, port 8081) translates Keycloak `/userinfo` responses to GitLab format.

### Nextcloud (Files + Talk)

| Property | Value |
|----------|-------|
| Image | `nextcloud:28-apache` |
| Port | 80 (`files.localhost`) |
| Database | `nextcloud` on `shared-db` |

Login via Keycloak SSO using the `oidc_login` app. **After first deployment**, install manually:
```bash
kubectl exec -n homeoffice deploy/nextcloud -- php occ app:install oidc_login
```

### Collabora Online (Document Editing)

| Property | Value |
|----------|-------|
| Image | `collabora/code:latest` |
| Port | 9980 (`office.localhost`) |

Integrates with Nextcloud for collaborative editing. Configured with `aliasgroup1=http://nextcloud:80` for WOPI discovery.

### Invoice Ninja (Billing)

| Property | Value |
|----------|-------|
| Image | `invoiceninja/invoiceninja:5` |
| Port | 8080 via OAuth2 Proxy at `billing.localhost` |
| Database | `invoiceninja` on `shared-db` |

No native OIDC support. Traffic passes through `oauth2-proxy-invoiceninja` (port 4180).

| Component | Port | Function |
|-----------|------|----------|
| `invoiceninja` | 8080 | Invoicing application |
| `oauth2-proxy-invoiceninja` | 4180 | Keycloak OIDC gateway |
| `billing-bot` | 8090 | Mattermost `/billing` slash command |

```bash
task homeoffice:billing-build   # Build and push billing-bot image
task homeoffice:billing-setup   # Deploy bot and create /billing slash command
```

**Secrets** (in `homeoffice-secrets`): `INVOICENINJA_DB_PASSWORD`, `INVOICENINJA_OIDC_SECRET`, `INVOICENINJA_API_TOKEN`, `INVOICENINJA_APP_KEY`, `BILLING_BOT_MM_TOKEN`

### Nextcloud Talk HPB (High Performance Backend)

| Deployment | Image | Function |
|------------|-------|----------|
| `spreed-signaling` | `strukturag/nextcloud-spreed-signaling:1.2.4` | Signaling server |
| `janus` | `canyan/janus-gateway:latest` | WebRTC SFU |
| `nats` | `nats:2.10-alpine` | Internal message bus |
| `coturn` | `coturn/coturn:4.6-alpine` | TURN/STUN (NAT traversal) |

Routing: `signaling.localhost` -> spreed-signaling (port 8080)

### WordPress Customer Portal

| Property | Value |
|----------|-------|
| Namespace | `wordpress` |
| URL | `https://web-wbhprojekt.ipv64.de/` |
| Database | MariaDB (dedicated, not shared-db) |
| Auth | Keycloak OIDC |

```bash
kubectl apply -f k3d/wordpress.yaml
kubectl rollout status deployment/wordpress -n wordpress --timeout=120s
kubectl apply -f k3d/wordpress-init-job.yaml
kubectl wait --for=condition=complete job/wordpress-init -n wordpress --timeout=300s
bash scripts/mattermost-anfragen-setup.sh
# Copy the webhook URL into WordPress Admin > CF7 to Webhook > Webhook URL
```

**Contact Form -> Mattermost:** CF7 form posts to the team's `Anfragen` channel via Incoming Webhook.

**Guest User Workflow (FA-11):**
```bash
MM_TOKEN=<admin-token> bash scripts/create-customer-guest.sh \
  --name "Max Mustermann" --email "max@example.com" --team "main-team"
```
Creates a Keycloak user, Mattermost guest account (`role: system_guest`), and a private `kunde-<username>` channel.

**Pitfalls:**
- Webhook URL is team-specific — re-run `mattermost-anfragen-setup.sh` after creating each new team
- `WORDPRESS_CONFIG_EXTRA` injects `FORCE_SSL_ADMIN` — required behind Traefik to prevent redirect loops
- MariaDB uses its own PVC — do not point `WORDPRESS_DB_HOST` at the shared PostgreSQL

---

## Security

### General Principles

1. **No real secrets in git** — `k3d/secrets.yaml` contains dev-only values
2. **Set OIDC secrets before first start** — they are imported into the Keycloak realm
3. **Use strong passwords** — generate with `openssl rand -base64 32`

### Network Security (k3d Development)

| Port | Service | Access |
|------|---------|--------|
| 80/TCP | Traefik Ingress | `*.localhost` domains |
| 443/TCP | Traefik Ingress | HTTPS (if configured) |
| 3478/UDP+TCP | coturn (TURN/STUN) | NAT traversal for Talk HPB WebRTC |

All internal services (databases, signaling, NATS, Janus) are only reachable within the cluster network. All namespaces enforce Pod Security Standards: `baseline` (blocks privileged containers) and warn on `restricted`.

### Secrets Management

- Client secrets (`MATTERMOST_OIDC_SECRET`, `NEXTCLOUD_OIDC_SECRET`, `INVOICENINJA_OIDC_SECRET`) are server-side only
- OIDC secrets cannot be changed in `secrets.yaml` after first Keycloak import — update in Keycloak Admin Console
- Rotate by: generate new value -> update `secrets.yaml` -> update Keycloak Admin Console -> `kubectl rollout restart deployment/<service> -n homeoffice`

### Known Limitations

**Mobile Push Notifications & GDPR:** Mattermost Team Edition uses the Mattermost Test Push Notification Service (TPNS) at `https://push-test.mattermost.com` (US-hosted). Notification data briefly transits outside the EU. All stored data remains fully on-premises.

| Data Type | Storage Location | GDPR Compliant |
|-----------|-----------------|----------------|
| Messages, files, user data | On-premises (PostgreSQL, PVC) | Fully |
| Web & desktop notifications | Browser/Electron (local) | Fully |
| Email notifications | Mailpit / own SMTP server | Fully |
| Mobile push (iOS/Android) | Mattermost TPNS -> APNs/FCM | US transit |

**Options for full compliance:**
1. Self-hosted push proxy: run [mattermost-push-proxy](https://github.com/mattermost/mattermost-push-proxy) + sign custom mobile apps
2. Disable mobile push: System Console -> Notifications -> "Do not send"
3. Web/Desktop only: for maximum data sovereignty, do not use mobile apps

**Video Conference Recording:** Nextcloud Talk HPB does not support server-side recording. Alternatives: local recording via OBS Studio, or use meeting minutes / written protocol.

---

## Deployment

### Prerequisites

| Tool | Purpose | Required |
|------|---------|----------|
| Docker Desktop / Docker Engine | Container runtime | Yes |
| [k3d](https://k3d.io) v5.8+ | k3s-in-Docker wrapper | Yes |
| [Task](https://taskfile.dev) | Task runner | Yes |
| kubectl | Kubernetes CLI | Yes |
| helm | Helm chart manager | Yes |
| skaffold | Dev loop (optional) | No |

### Quick Start

```bash
task up                    # Create cluster, build, deploy
task cluster:status        # Check status
task homeoffice:deploy     # Deploy Keycloak + Mattermost + Nextcloud + Invoice Ninja
task homeoffice:status     # Check homeoffice stack
task homeoffice:post-setup # After first deploy: enable Nextcloud apps
```

### Billing Bot

```bash
task homeoffice:billing-build   # Build image + push to registry
task homeoffice:billing-setup   # Deploy bot + create Mattermost slash command
```

### Tracking Database

```bash
task tracking:deploy
task tracking:status
```

### Tear Down

```bash
task homeoffice:teardown   # Remove homeoffice namespace
task tracking:teardown     # Remove tracking DB
task down                  # Tear down everything
task clean                 # Delete cluster + prune Docker
```

### WSL2 Notes

- `/etc/hosts` must contain `127.0.0.1 registry.localhost` for host-side registry access
- Docker should have at least 4-8GB RAM allocated
- k3d API server is bound to `127.0.0.1` for security

---

## Admin Guide

### Initial Setup

1. **Create the cluster:** `task cluster:create`
2. **Deploy the stack:** `task homeoffice:deploy` — monitor with `task homeoffice:status`
3. **Post-deployment:** `task homeoffice:post-setup` (enables Nextcloud OIDC, calendar, contacts, Collabora, Talk)
4. **Verify SSO** by logging into each service:
   - `http://auth.localhost` — Keycloak Admin Console (admin / devadmin)
   - `http://chat.localhost` — Mattermost
   - `http://files.localhost` — Nextcloud
   - `http://office.localhost` — Collabora (via Nextcloud)
   - `http://billing.localhost` — Invoice Ninja (via OAuth2 Proxy)

### User Management

All users managed in Keycloak (`auth.localhost/admin`):
1. Navigate to Realm "homeoffice" -> Users -> Add User
2. Set username, email, first/last name
3. Under Credentials, set a password

| Role | Access |
|------|--------|
| Admin | Full platform control, Keycloak admin |
| User | Standard access to all services |
| Guest | Limited access to specific channels only |

### Service Management

```bash
kubectl rollout restart deployment/<service> -n homeoffice    # Restart
task homeoffice:logs                                          # All logs
kubectl logs -n homeoffice deploy/<service> -f --tail=50      # Single service
task homeoffice:status                                        # Health check
task ingress:status                                           # Ingress check
```

### Monitoring (Optional)

```bash
task observability:install
kubectl port-forward -n monitoring svc/kube-prometheus-grafana 3000:80  # Access Grafana
```

---

## User Guide

Your administrator will provide login credentials. All services use **Single Sign-On** — log in once via Keycloak and you're authenticated everywhere.

### Logging In

1. Open any service URL (e.g., `http://chat.localhost`)
2. Click **"Login with Keycloak"**
3. Enter your username and password
4. After first login, other services recognize your session automatically

### Mattermost (Chat)

- **Channels:** Public (joinable by all), Private (invited only), DMs (1:1 or up to 7 people)
- **Features:** Threads, reactions, file sharing (drag & drop), Markdown formatting, search
- **Keyboard shortcut:** `Ctrl+K` to switch channels

### Nextcloud (Files & Collaboration)

- **Files:** Upload via drag-and-drop or "+", create folders, share with users or public links
- **Documents:** Click any doc (DOCX, XLSX, ODT) to edit in Collabora; multiple users can edit simultaneously
- **Talk:** Start video calls from the speech bubble icon; supports camera, microphone, screen sharing
- **Calendar & Contacts:** CalDAV/CardDAV compatible, sync with mobile/desktop clients

### Invoice Ninja (Billing)

- Access at `http://billing.localhost` — authenticated automatically via Keycloak
- Use `/billing` slash command in Mattermost for quick actions

### Account Management

Manage your account at `http://auth.localhost/realms/homeoffice/account`: change password, update profile, review active sessions.

---

## Backup & Restore

CronJob `db-backup` runs daily at **02:00 UTC**, dumps PostgreSQL databases (`keycloak`, `mattermost`, `nextcloud`), encrypts with **AES-256-CBC** (PBKDF2), and retains for **30 days**.

| Parameter | Value | Configured in |
|-----------|-------|--------------|
| Schedule | `0 2 * * *` | `backup-cronjob.yaml` `.spec.schedule` |
| Databases | keycloak, mattermost, nextcloud | `backup-cronjob.yaml` loop |
| Retention | 30 days | `backup-cronjob.yaml` `-mtime +30` |
| PVC | 1 Gi (dev) | `backup-pvc.yaml` |
| Encryption | AES-256-CBC, PBKDF2 | Secret `backup-passphrase` |

### List Backups

```bash
kubectl run backup-ls --rm -it --restart=Never \
  --image=alpine \
  --overrides='{
    "spec": {
      "containers": [{"name":"ls","image":"alpine","command":["ls","-lt","/backups"],
        "volumeMounts":[{"name":"b","mountPath":"/backups"}]}],
      "volumes": [{"name":"b","persistentVolumeClaim":{"claimName":"backup-pvc"}}]
    }
  }' -n homeoffice
```

### Decrypt a Dump

```bash
kubectl get secret backup-passphrase -n homeoffice \
  -o jsonpath='{.data.backup-passphrase}' | base64 -d > /tmp/passphrase

openssl enc -d -aes-256-cbc -pbkdf2 \
  -in keycloak.dump.enc -out keycloak.dump -pass file:/tmp/passphrase
```

### Restore

```bash
# 1. Decrypt (see above)
# 2. Copy dump into DB pod
kubectl cp keycloak.dump homeoffice/<shared-db-pod>:/tmp/keycloak.dump
# 3. Drop and recreate database
kubectl exec -it deploy/shared-db -n homeoffice -- \
  psql -U keycloak -d postgres \
  -c "DROP DATABASE keycloak; CREATE DATABASE keycloak OWNER keycloak;"
# 4. Restore
kubectl exec -it deploy/shared-db -n homeoffice -- \
  pg_restore -U keycloak -d keycloak /tmp/keycloak.dump
# 5. Restart service
kubectl rollout restart deployment/keycloak -n homeoffice
```

Repeat with `mattermost` or `nextcloud` — substitute user, database, and deployment names.

### Manual Database Dumps

```bash
kubectl exec -n homeoffice deploy/shared-db -- pg_dump -U keycloak keycloak > keycloak-backup.sql
kubectl exec -n homeoffice deploy/shared-db -- pg_dump -U mattermost mattermost > mattermost-backup.sql
kubectl exec -n homeoffice deploy/shared-db -- pg_dump -U nextcloud nextcloud > nextcloud-backup.sql
kubectl exec -n homeoffice deploy/shared-db -- pg_dump -U invoiceninja invoiceninja > invoiceninja-backup.sql

# Restore from SQL dump
kubectl exec -i -n homeoffice deploy/shared-db -- psql -U <user> <db> < backup.sql
```

### Manual Trigger

```bash
kubectl create job --from=cronjob/db-backup manual-backup-$(date +%Y%m%d) -n homeoffice
```

---

## Migration

Interactive menu for data import and export:

```bash
./scripts/migrate.sh              # Full version
./scripts/migrate.sh --dry-run    # Preview only
```

| Option | Function |
|--------|----------|
| 1 | Slack -> Mattermost |
| 2 | Teams -> Mattermost + Nextcloud |
| 3 | Users -> Keycloak (CSV/LDIF) |
| 4 | Google -> Mattermost + Nextcloud |
| 5 | Export data |

Prerequisites: `curl`, `jq`, `python3`, `unzip`

**Tracking Database Migration** (SQLite -> PostgreSQL):
```bash
task tracking:migrate
```

---

## Scripts Reference

All automation is managed via [Taskfile](https://taskfile.dev). Run `task --list` for the full list.

### Cluster Lifecycle

| Command | Description |
|---------|-------------|
| `task up` | Full setup: create cluster, build, deploy |
| `task down` | Tear down everything |
| `task clean` | Delete cluster + prune Docker images |
| `task cluster:create` | Create k3d cluster with local registry |
| `task cluster:delete` | Delete the cluster |
| `task cluster:stop` | Stop cluster (preserves state) |
| `task cluster:start` | Restart a stopped cluster |
| `task cluster:status` | Show cluster status, nodes, resource usage |
| `task namespaces:create` | Create standard dev namespaces with PSS labels |
| `task hooks:install` | Install git hooks |

### Build & Deploy

| Command | Description |
|---------|-------------|
| `task build` | Build demo app image and push to local registry |
| `task build:import` | Import a local Docker image directly into k3d |
| `task deploy` | Deploy via kustomize (local overlay) |
| `task deploy:status` | Show deployment status and endpoints |
| `task dev` | Start skaffold dev mode (hot-reload) |
| `task dev:run` | One-shot build and deploy via skaffold |
| `task logs` | Tail logs for the demo app |
| `task shell` | Open a debug shell in the cluster |
| `task ingress:status` | Show Traefik ingress controller status |
| `task registry:list` | List images in the local registry |

### Homeoffice

| Command | Description |
|---------|-------------|
| `task homeoffice:deploy` | Deploy full SSO stack |
| `task homeoffice:status` | Show pod/ingress status |
| `task homeoffice:logs -- <service>` | Tail logs for a specific service |
| `task homeoffice:restart -- <service>` | Restart a service |
| `task homeoffice:teardown` | Remove all homeoffice resources |
| `task homeoffice:validate` | Validate K8s manifests with kustomize dry-run |
| `task homeoffice:psql -- <dbname>` | Open psql shell to shared-db |
| `task homeoffice:port-forward` | Forward shared-db to localhost:5432 |
| `task homeoffice:post-setup` | Enable Nextcloud apps after initial deploy |
| `task homeoffice:billing-build` | Build and push billing-bot image |
| `task homeoffice:billing-setup` | Deploy billing-bot + create slash command |
| `task homeoffice:dsgvo-check` | Run DSGVO compliance verification |
| `task homeoffice:monitoring` | Install observability + DSGVO dashboard |

### Tracking Database

| Command | Description |
|---------|-------------|
| `task tracking:deploy` | Deploy shared tracking PostgreSQL |
| `task tracking:status` | Show tracking DB status |
| `task tracking:psql` | Open psql shell |
| `task tracking:port-forward` | Forward tracking DB to localhost:5433 |
| `task tracking:migrate` | Migrate SQLite tracking.db into PostgreSQL |
| `task tracking:sync-pipeline` | Sync pipeline statuses |
| `task tracking:teardown` | Remove tracking database |

### Assetgenerator

| Command | Description |
|---------|-------------|
| `task assetgen:build` | Build image and push to registry |
| `task assetgen:deploy` | Deploy to k3d |
| `task assetgen:status` | Show status |
| `task assetgen:logs` | Tail logs |
| `task assetgen:restart` | Rebuild and redeploy |
| `task assetgen:teardown` | Remove resources |

### Documentation

| Command | Description |
|---------|-------------|
| `task docs:deploy` | Deploy Docsify docs site |
| `task docs:restart` | Restart docs pod to pull latest |
| `task docs:integrate-mattermost` | Integrate docs into Mattermost |
| `task docs:publish-api` | Publish OpenAPI spec to GitBook |

### Observability

| Command | Description |
|---------|-------------|
| `task observability:install` | Install Prometheus + Grafana (~512MB RAM) |
| `task observability:remove` | Remove observability stack |

### Shell Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `migrate.sh` | Interactive migration assistant (Slack/Teams/Google -> platform) |
| `import-users.sh` | Bulk user import into Keycloak (CSV) |
| `import-entrypoint.sh` | Keycloak realm import on first start |
| `billing-bot-setup.sh` | Register billing-bot slash command in Mattermost |
| `check-connectivity.sh` | Verify connectivity between services |
| `dsgvo-compliance-check.sh` | DSGVO/GDPR compliance verification |
| `mattermost-docs-integration.sh` | Integrate documentation into Mattermost |

---

## Testing

Automated test framework for verifying all 37 requirements (AK, FA, L, NFA, SA).

### Architecture

| Tier | Environment | Tools | Requirements |
|------|-------------|-------|-------------|
| **Local** | k3d cluster | Bash + curl + Playwright | FA-01-08, SA-02-06/08, NFA-03/06/07, AK-03/04 |
| **Prod** | Live k3s (real domains, TLS) | Bash + curl + nmap + ab + kubectl | SA-01, SA-07, NFA-01/02/04 |
| **Manual** | Human interaction | Checklist | AK-01/02/05/06/07, L-01-08 |

### Quick Start

```bash
cd Bachelorprojekt

./tests/runner.sh local                                          # All local tests
./tests/runner.sh local FA-01 SA-03                              # Specific local tests
PROD_DOMAIN=wbhprojekt.ipv64.de ./tests/runner.sh prod           # All prod tests
PROD_DOMAIN=wbhprojekt.ipv64.de ./tests/runner.sh prod SA-01     # Specific prod tests
./tests/runner.sh report                                         # Regenerate reports
```

### Prod Tier

| Script | Requirement | What it tests |
|--------|-------------|---------------|
| `SA-01.sh` | Transport Encryption | TLS, HTTP->HTTPS redirect, cipher strength, HSTS, cert validity |
| `SA-07.sh` | Backup | pg_dump for all DBs, PVC status, backup CronJob |
| `NFA-01.sh` | Data Privacy (GDPR) | Data sovereignty, no cloud images, telemetry disabled |
| `NFA-02.sh` | Performance | Response times, concurrent load, resource limits |
| `NFA-04.sh` | Scalability | Horizontal scaling, RollingUpdate, resource headroom, HPA |

Set `PROD_DOMAIN` to your production domain. URLs auto-configure as `https://auth-DOMAIN`, `https://chat-DOMAIN`, etc.

### Prerequisites

| Tool | Usage | Required |
|------|-------|----------|
| `kubectl` | Kubernetes API calls | Yes |
| `jq` | JSON processing | Yes |
| `curl` | API/HTTP calls | Yes |
| `node` / `npm` | Playwright E2E tests (local) | Optional |
| `nmap` | TLS cipher check (SA-01, prod) | Optional |
| `ab` | Load tests (NFA-02, prod) | Optional |
| `openssl` | Certificate validation (SA-01, prod) | Optional |

CI validation uses [kubeconform](https://github.com/yannh/kubeconform) for offline manifest validation.

---

## Manual Tests

Tests requiring human interaction. Run **after** `./tests/runner.sh local` passes.

### Local (k3d) Prerequisites

- k3d cluster running with homeoffice stack (`task homeoffice:deploy`)
- Two browsers or one browser with two profiles
- Two test accounts: `testuser1` / `testuser2` (password: `Testpassword123!`)

### Production Prerequisites

- Browser (Chrome or Firefox)
- Production domain: `*.wbhprojekt.ipv64.de` -> `217.195.149.75`

### FA-03: Video / Audio Call (Two Browsers)

| # | Step | Expected |
|---|------|----------|
| 1 | Open `http://files.localhost` in Browser A, log in as `testuser1` | Nextcloud dashboard |
| 2 | Open `http://files.localhost` in Browser B (incognito), log in as `testuser2` | Nextcloud dashboard |
| 3 | Browser A: Talk icon -> **+** -> New group conversation "Manual Test" -> Add `testuser2` | Conversation created |
| 4 | Browser A: **Start call**, allow camera/mic in both browsers | |
| 5 | Browser B: Open Talk -> "Manual Test" -> Join call | Both participants visible |
| 6 | Verify video, audio, and screen sharing between browsers | All work |

> **Tip:** `ICE failed` errors mean coturn TURN server isn't reachable. Check: `kubectl get pod -n homeoffice -l app=coturn`

### FA-06: Push Notifications

| # | Step | Expected |
|---|------|----------|
| 1 | Open `http://chat.localhost` in Browser A as `testuser1`, enable desktop notifications | Permission prompt; allow |
| 2 | Open `http://chat.localhost` in Browser B (incognito) as `testuser2` | |
| 3 | Browser B: Send a DM to `testuser1` | |
| 4 | Verify: Desktop notification appears in Browser A with sender + preview | Notification visible |

### NFA-05: First-Time User Usability (30-Minute Test)

Find 3 colleagues who have never used the platform. Give them only: URL, username, password. Ask them to send a DM. Record time and confusion points. **Pass criteria:** 2 out of 3 complete within 30 minutes.

### Production Tests

| Area | Steps | What to test |
|------|-------|-------------|
| 2.1 Keycloak | 7 | Admin console, realm clients, redirect URIs, user creation |
| 2.2 Mattermost | 6 | SSO login, channel creation, messaging, file upload |
| 2.3 Nextcloud | 6 | SSO login, file upload, folder creation, sharing |
| 2.4 Collabora | 5 | Inline document editing, no WOPI/CORS errors |
| 2.5 Talk | 7 | Video calls, screen sharing, no ICE errors |
| 2.6 SSO Session | 5 | Cross-service session, single logout |
| 2.7 Security | 8 | HTTP->HTTPS redirect, TLS 1.3, brute-force protection, HSTS, `wss://` |
| 2.8 Integration | 3 | Cross-service file sharing, Collabora co-edit |
| 2.9 Data Sovereignty | 3 | No external connections, IP geolocation |

### Recording Results

```bash
task homeoffice:psql -- postgres

UPDATE bachelorprojekt.pipeline
SET status = 'done', updated_at = now(), notes = 'Manual test passed 2026-04-02'
WHERE req_id = 'FA-03' AND stage = 'testing';
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Keycloak not starting | Check `shared-db` is running; verify realm import: `kubectl logs -n homeoffice deploy/keycloak --tail=100 \| grep -i import` |
| SSO login fails | Verify OIDC secrets match between `secrets.yaml` and Keycloak Admin Console; check `mm-keycloak-proxy` logs; for Nextcloud ensure `oidc_login` app is installed |
| Collabora not loading | Verify `aliasgroup1=http://nextcloud:80`; check `office.localhost` in `/etc/hosts` |
| Talk HPB no video/audio | Check spreed-signaling, Janus, NATS, coturn logs; verify signaling secret matches `signaling-config` ConfigMap |
| Invoice Ninja OAuth2 Proxy 403 | Verify Keycloak client `invoiceninja` exists and secret matches; check oauth2-proxy logs |
| Billing bot slash command fails | Re-run `task homeoffice:billing-setup`; verify `BILLING_BOT_MM_TOKEN` |
| WordPress CF7 not posting | Verify webhook URL matches `mattermost-anfragen-setup.sh` output; check Anfragen channel exists |
| Services unreachable | `kubectl get ingress -n homeoffice`; verify `/etc/hosts` entries; `docker ps \| grep k3d-dev-serverlb` |
| Pod stays Pending | Missing PVC or insufficient resources — `kubectl describe pod -n homeoffice <pod> \| tail -20` |
| "Invalid redirect_uri" on SSO | Check client settings in Keycloak admin -> homeoffice realm -> Clients |
| "Access through untrusted domain" | Add domain: `kubectl exec -n homeoffice deploy/nextcloud -- gosu 999 php occ config:system:set trusted_domains N --value="DOMAIN"` |
| TLS certificate warning (prod) | Wait for DNS propagation + ACME challenge |
| Video call ICE failed (prod) | Ensure UDP/TCP 3478 is open on firewall for `217.195.149.75` |
