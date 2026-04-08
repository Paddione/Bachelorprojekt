# MCP Actions Reference

All actions Claude Code can perform via the connected MCP servers.

### Configuration

| Action | Description |
|--------|-------------|
| `configuration_contexts_list` | List all available kubeconfig contexts and their server URLs |
| `configuration_view` | View the current kubeconfig YAML (full or minified for current context) |

### Namespaces & Events

| Action | Description |
|--------|-------------|
| `namespaces_list` | List all namespaces in the cluster |
| `events_list` | List cluster events (warnings, errors, state changes) for debugging |

### Nodes

| Action | Description |
|--------|-------------|
| `nodes_top` | Show CPU/memory consumption for nodes (via Metrics Server) |
| `nodes_stats_summary` | Get detailed node stats: CPU, memory, filesystem, network, PSI metrics |
| `nodes_log` | Fetch logs from a node (kubelet, kube-proxy, or arbitrary log file path) |

### Pods

| Action | Description |
|--------|-------------|
| `pods_list` | List all pods across all namespaces |
| `pods_list_in_namespace` | List pods in a specific namespace (supports label/field selectors) |
| `pods_get` | Get full manifest of a specific pod |
| `pods_log` | Tail logs from a pod or specific container (supports previous container) |
| `pods_exec` | Execute a command inside a pod container (shell access) |
| `pods_run` | Spin up a new pod from an image (ephemeral/debug pods) |
| `pods_delete` | Delete a pod by name |
| `pods_top` | Show CPU/memory consumption for pods (via Metrics Server) |

### Generic Resources

| Action | Description |
|--------|-------------|
| `resources_list` | List any Kubernetes resource type by apiVersion + kind (Deployments, Services, Ingresses, etc.) |
| `resources_get` | Get a specific resource by apiVersion, kind, and name |
| `resources_create_or_update` | Apply a YAML/JSON resource manifest (create or update) |
| `resources_delete` | Delete a resource by apiVersion, kind, and name |
| `resources_scale` | Get or set the replica count for a Deployment or StatefulSet |

---

## Playwright Browser (`mcp-browser`)

Full browser automation via `@playwright/mcp` (Microsoft). Runs headless Chromium in the cluster.

Actions use an **accessibility snapshot** model — `browser_snapshot` gives you a structured DOM reference, and other actions target elements by their `ref` from that snapshot.

### Navigation

| Action | Description |
|--------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_navigate_back` | Go back to the previous page in history |
| `browser_wait_for` | Wait for text to appear/disappear, or pause for N seconds |

### Page Inspection

| Action | Description |
|--------|-------------|
| `browser_snapshot` | Capture accessibility tree of the current page (preferred over screenshot for interactions) |
| `browser_take_screenshot` | Take a PNG/JPEG screenshot of the viewport, full page, or a specific element |
| `browser_console_messages` | Return all browser console messages (error/warning/info/debug) |
| `browser_network_requests` | List all network requests since page load (filterable by URL pattern, includes headers/body) |

### Interaction

| Action | Description |
|--------|-------------|
| `browser_click` | Click an element (single, double, or right-click; with modifier keys) |
| `browser_hover` | Hover the mouse over an element |
| `browser_type` | Type text into an editable element (optionally submit with Enter) |
| `browser_press_key` | Press a specific keyboard key (e.g. `ArrowLeft`, `Enter`, `Escape`) |
| `browser_fill_form` | Fill multiple form fields at once (textbox, checkbox, radio, combobox, slider) |
| `browser_select_option` | Select one or more options in a dropdown |
| `browser_drag` | Drag and drop between two elements |
| `browser_file_upload` | Upload one or more files via a file chooser |
| `browser_handle_dialog` | Accept or dismiss a browser dialog (alert, confirm, prompt) |

### Tabs

| Action | Description |
|--------|-------------|
| `browser_tabs` | List, create, close, or switch between browser tabs |

### Scripting

| Action | Description |
|--------|-------------|
| `browser_evaluate` | Evaluate a JavaScript expression on the page or against a specific element |
| `browser_run_code` | Run an arbitrary Playwright `async (page) => { ... }` code snippet |

### Lifecycle

| Action | Description |
|--------|-------------|
| `browser_close` | Close the current page/browser |
| `browser_resize` | Resize the browser window to a specific width/height |

> **Tip:** The typical workflow is `browser_navigate` → `browser_snapshot` (to get element refs) → interaction actions → `browser_take_screenshot` to verify.

---

## Kubernetes Read-Only (`mcp-kubernetes` via `mcp-k8s-go`)

A read-only Kubernetes MCP server running inside the cluster as part of `claude-code-mcp-ops`. Used by Claude Code to inspect the cluster without write access.

| Action | Description |
|--------|-------------|
| `list-k8s-contexts` | List all Kubernetes contexts from kubeconfig |
| `list-k8s-namespaces` | List namespaces in a given context |
| `list-k8s-nodes` | List nodes in a given context |
| `list-k8s-resources` | List any resource type by kind (and optional group/version/namespace) |
| `get-k8s-resource` | Get full details of a specific resource as JSON or via Go template |
| `list-k8s-events` | List events in a namespace for a given context |
| `get-k8s-pod-logs` | Fetch pod logs (supports container selection, since time/duration, byte limit) |

> **Read-only** — no create, update, delete, exec, or scale operations.

---

## PostgreSQL (`mcp-postgres`)

Direct SQL access to the shared PostgreSQL instance (`shared-db`) running inside the cluster.

| Action | Description |
|--------|-------------|
| `query` | Run a read-only SQL query against the shared database |

> **Read-only** — `SELECT` queries only. All workspace databases (Keycloak, Mattermost, Nextcloud, OpenSearch, etc.) are on this shared instance and queryable.

---

---

> **Note:** The following MCP servers are defined in the `deploy/mcp` overlay (production/Claude Code path) and are **not currently running** in the k3d cluster. The current cluster (`feature/replace-claude-code-with-claude-code`) runs only the 3 servers above.

---

## Mattermost (`mcp-mattermost`)

Image: `legard/mcp-server-mattermost`  
Connects to Mattermost over its REST API with a bot token.

| Capability area | What it covers |
|----------------|----------------|
| Channels | List, read, post messages to channels |
| Direct messages | Send and read DMs |
| Teams | List teams and memberships |
| Users | Look up user profiles |
| Posts | Create, read, react to posts |

---

## Nextcloud (`mcp-nextcloud`)

Image: `ghcr.io/cbcoutinho/nextcloud-mcp-server`  
Connects to Nextcloud over WebDAV/API.

| Capability area | What it covers |
|----------------|----------------|
| Files | List, read, upload, move, delete files and folders |
| Calendar | List calendars, read/create/update/delete events (CalDAV) |
| Contacts | List address books, read/create/update/delete contacts (CardDAV) |

---

## Invoice Ninja (`mcp-invoiceninja`)

Image: `ckanthony/openapi-mcp` — an OpenAPI-spec-to-MCP bridge.  
Exposes the full Invoice Ninja REST API as MCP tools, driven by the `invoiceninja-openapi` ConfigMap. Exact tool list mirrors the Invoice Ninja API surface, which includes:

| Capability area | What it covers |
|----------------|----------------|
| Clients | CRUD on client records |
| Invoices | Create, send, archive, delete invoices |
| Quotes | Create and manage quotes |
| Payments | Record and manage payments |
| Products | Manage product/service catalog |
| Expenses | Track expenses |
| Reports | Generate financial reports |

---

## Keycloak (`mcp-keycloak`)

Image: `quay.io/sshaaf/keycloak-mcp-server`  
Uses SSE transport (not streamable-HTTP). Requires a valid Keycloak Bearer token on every request.

| Capability area | What it covers |
|----------------|----------------|
| Users | Create, read, update, delete users; reset passwords |
| Groups | Manage groups and memberships |
| Roles | Assign and manage realm/client roles |
| Clients | List and inspect OIDC clients |
| Sessions | List and revoke active sessions |
| Realms | Inspect realm configuration |

---

## GitHub (`mcp-github`)

Image: `ghcr.io/github/github-mcp-server` (official GitHub MCP server)  
**Disabled by default** (`replicas: 0`) — requires a GitHub PAT set via `task mcp:set-github-pat`.

| Capability area | What it covers |
|----------------|----------------|
| Repositories | List, search, get repo details |
| Issues | Create, read, update, comment on issues |
| Pull Requests | Create, list, review, merge PRs |
| Code | Search code, read file contents, get commits |
| Actions | List workflow runs and jobs |
| Releases | List and get releases |

---

## Stripe (`mcp-stripe`)

Image: `@stripe/agent-toolkit` (official Stripe MCP)  
Requires a Stripe secret key.

| Capability area | What it covers |
|----------------|----------------|
| Customers | Create, list, retrieve customers |
| Payment Intents | Create and confirm payment intents |
| Invoices | Create, send, void invoices |
| Subscriptions | Create and manage subscriptions |
| Products & Prices | Manage product catalog and pricing |
| Refunds | Issue and list refunds |
| Balance | Retrieve account balance |

---

## Summary

| MCP Server | # Actions | Category |
|------------|-----------|----------|
| Gmail | 7 | Personal productivity |
| Google Calendar | 9 | Personal productivity |
| FRITZ!Box | 4 | Home network / infrastructure |
| IDE | 2 | Development tooling |
| Kubernetes | 20 | Cluster operations |
| Playwright Browser | 21 | Browser automation |
| Kubernetes Read-Only | 7 | Cluster inspection (Claude Code-side) |
| PostgreSQL | 1 | Shared DB read-only SQL |
| — *deploy/mcp overlay only (not running in k3d)* — | | |
| Mattermost | ~5 areas | Chat, channels, DMs, posts |
| Nextcloud | ~3 areas | Files, Calendar, Contacts |
| Invoice Ninja | ~7 areas | Full billing API via OpenAPI bridge |
| Keycloak | ~6 areas | SSO user/group/role management |
| GitHub | ~6 areas | Repos, issues, PRs, Actions (needs PAT) |
| Stripe | ~7 areas | Payments, invoices, subscriptions |
| **Total (k3d running)** | **71** | |
