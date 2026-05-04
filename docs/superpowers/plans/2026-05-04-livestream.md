# Livestream (LiveKit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/portal/stream` tab for Keycloak-authenticated users to watch a live video stream, with chat, reactions, and hand-raise, hosted via LiveKit in the workspace Kubernetes cluster.

**Architecture:** LiveKit Server (SFU) runs in the `workspace` namespace alongside Redis, LiveKit Ingress (RTMP), and LiveKit Egress (recording). The Astro website generates short-lived LiveKit JWTs from Keycloak sessions at `/api/stream/token`. Viewers and hosts connect via `livekit-client` in Svelte components.

**Tech Stack:** LiveKit Server 1.8, livekit-server-sdk (Node), livekit-client (browser), Svelte 5 runes, Astro 5 API routes, Kubernetes/Kustomize, Traefik, CoTURN (existing).

---

## File Map

**New files:**
- `k3d/livekit.yaml` — Redis, LiveKit Server, Ingress, Egress deployments + services
- `website/src/lib/livekit-token.ts` — pure token-generation logic (testable)
- `website/src/pages/api/stream/token.ts` — POST endpoint, calls livekit-token lib
- `website/src/components/LiveStream/StreamOffline.svelte` — "no stream active" placeholder
- `website/src/components/LiveStream/StreamChat.svelte` — chat sidebar with message list + input
- `website/src/components/LiveStream/StreamReactions.svelte` — reaction buttons + floating animations
- `website/src/components/LiveStream/StreamHandRaise.svelte` — viewer raise button + host queue panel
- `website/src/components/LiveStream/StreamPlayer.svelte` — LiveKit Room connection, video element, LIVE badge, orchestrates all sub-components
- `website/src/pages/portal/stream.astro` — viewer page (SSO-gated)
- `website/src/pages/admin/stream.astro` — host control page (admin-only)

**Modified files:**
- `k3d/kustomization.yaml` — add `livekit.yaml`
- `k3d/configmap-domains.yaml` — add `LIVEKIT_DOMAIN`, `STREAM_DOMAIN`
- `k3d/secrets.yaml` — add `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_RTMP_KEY`
- `k3d-config.yaml` — add port 1935 mapping for RTMP
- `environments/schema.yaml` — register 3 new secrets
- `Taskfile.yml` — add `LIVEKIT_DOMAIN` + `STREAM_DOMAIN` to dev and prod envsubst lists
- `website/src/layouts/AdminLayout.astro` — add "Stream" nav item
- `website/package.json` — add `livekit-client`, `livekit-server-sdk`

---

## Task 1: Infrastructure — Domains, Secrets, k3d Port

**Files:**
- Modify: `k3d/configmap-domains.yaml`
- Modify: `k3d/secrets.yaml`
- Modify: `k3d-config.yaml`

- [ ] **Step 1: Add LiveKit domains to configmap-domains.yaml**

In `k3d/configmap-domains.yaml`, inside the `data:` block, add after the `BRETT_DOMAIN` line:

```yaml
  LIVEKIT_DOMAIN: "livekit.localhost"
  STREAM_DOMAIN: "stream.localhost"
```

- [ ] **Step 2: Add LiveKit secrets to k3d/secrets.yaml**

In `k3d/secrets.yaml`, add after the last existing entry in `stringData:`:

```yaml
  # LiveKit
  LIVEKIT_API_KEY: "devlivekit"
  LIVEKIT_API_SECRET: "devlivekitsecret1234567890abcdef"
  LIVEKIT_RTMP_KEY: "devrtmpkey123456"
```

- [ ] **Step 3: Add RTMP port mapping to k3d-config.yaml**

In `k3d-config.yaml`, add to the `ports:` list (after the 8080:30080 entry):

```yaml
  - port: 1935:1935
    nodeFilters:
      - loadbalancer
```

- [ ] **Step 4: Recreate dev cluster to apply new port mapping**

```bash
task cluster:delete
task cluster:create
```

Note: this destroys all cluster state. Run `task workspace:up` afterwards to redeploy.

- [ ] **Step 5: Validate configmap syntax**

```bash
kubectl apply --dry-run=client -f k3d/configmap-domains.yaml
```

Expected: `configmap/domain-config configured (dry run)`

- [ ] **Step 6: Commit**

```bash
git add k3d/configmap-domains.yaml k3d/secrets.yaml k3d-config.yaml
git commit -m "feat(livekit): add domains, dev secrets, RTMP port mapping"
```

---

## Task 2: environments/schema.yaml — Register New Secrets

**Files:**
- Modify: `environments/schema.yaml`

- [ ] **Step 1: Add LiveKit secrets to schema**

In `environments/schema.yaml`, in the `secrets:` section, add after the last existing secret entry:

```yaml
  - name: LIVEKIT_API_KEY
    required: true
    generate: true
    length: 16

  - name: LIVEKIT_API_SECRET
    required: true
    generate: true
    length: 32

  - name: LIVEKIT_RTMP_KEY
    required: true
    generate: true
    length: 16
```

- [ ] **Step 2: Validate schema**

```bash
task env:validate ENV=dev
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add environments/schema.yaml
git commit -m "feat(livekit): register LIVEKIT_API_KEY/SECRET/RTMP_KEY in env schema"
```

---

## Task 3: Taskfile.yml — Add envsubst Variables

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Add LIVEKIT_DOMAIN and STREAM_DOMAIN to dev envsubst (line ~1001)**

Find the line:
```
kustomize build k3d/ | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$BRAND_ID" | kubectl apply --server-side --force-conflicts -f -
```

Replace with:
```
kustomize build k3d/ | envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$BRAND_ID \$LIVEKIT_DOMAIN \$STREAM_DOMAIN" | kubectl apply --server-side --force-conflicts -f -
```

- [ ] **Step 2: Add to prod ENVSUBST_VARS (line ~1035)**

Find the block:
```yaml
          ENVSUBST_VARS="$ENVSUBST_VARS \$BRETT_DOMAIN \$DASHBOARD_DOMAIN"
```

Replace with:
```yaml
          ENVSUBST_VARS="$ENVSUBST_VARS \$BRETT_DOMAIN \$DASHBOARD_DOMAIN"
          ENVSUBST_VARS="$ENVSUBST_VARS \$LIVEKIT_DOMAIN \$STREAM_DOMAIN"
```

- [ ] **Step 3: Validate manifest dry-run**

```bash
task workspace:validate
```

Expected: exits 0 with no errors.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(livekit): add LIVEKIT_DOMAIN + STREAM_DOMAIN to envsubst"
```

---

## Task 4: k3d/livekit.yaml — Kubernetes Manifests

**Files:**
- Create: `k3d/livekit.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Create k3d/livekit.yaml**

```yaml
# ═══════════════════════════════════════════════════════════════════
# LiveKit — WebRTC SFU for livestreaming
# Components: Redis, Server, Ingress (RTMP), Egress (recording)
# ═══════════════════════════════════════════════════════════════════

# ── Redis (LiveKit room state) ───────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livekit-redis
  labels:
    app: livekit-redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: livekit-redis
  template:
    metadata:
      labels:
        app: livekit-redis
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        fsGroup: 999
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: redis
          image: redis:7.4-alpine
          command: ["redis-server", "--save", "", "--appendonly", "no"]
          ports:
            - containerPort: 6379
          resources:
            requests:
              memory: 64Mi
              cpu: 50m
            limits:
              memory: 256Mi
              cpu: 200m
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 999
            capabilities:
              drop: [ALL]
---
apiVersion: v1
kind: Service
metadata:
  name: livekit-redis
spec:
  selector:
    app: livekit-redis
  ports:
    - port: 6379
      targetPort: 6379
---

# ── LiveKit Server config ─────────────────────────────────────────
apiVersion: v1
kind: ConfigMap
metadata:
  name: livekit-server-config
data:
  config.yaml: |
    port: 7880
    bind_addresses:
      - ""
    rtc:
      tcp_port: 7881
      port_range_start: 50000
      port_range_end: 60000
      use_external_ip: false
    redis:
      address: livekit-redis:6379
    turn:
      enabled: true
      domain: ""
      tls_port: 0
      udp_port: 3478
      external_tls: false
    keys: {}
---

# ── LiveKit Server ────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livekit-server
  labels:
    app: livekit-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: livekit-server
  template:
    metadata:
      labels:
        app: livekit-server
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: livekit
          image: livekit/livekit-server:v1.8.3
          args:
            - --config=/etc/livekit/config.yaml
          ports:
            - name: http
              containerPort: 7880
            - name: rtc-tcp
              containerPort: 7881
          env:
            - name: LIVEKIT_API_KEY
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_API_KEY
            - name: LIVEKIT_API_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_API_SECRET
            - name: LIVEKIT_KEYS
              value: "$(LIVEKIT_API_KEY): $(LIVEKIT_API_SECRET)"
          resources:
            requests:
              memory: 256Mi
              cpu: 250m
            limits:
              memory: 1Gi
              cpu: 1000m
          volumeMounts:
            - name: config
              mountPath: /etc/livekit
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop: [ALL]
      volumes:
        - name: config
          configMap:
            name: livekit-server-config
---
apiVersion: v1
kind: Service
metadata:
  name: livekit-server
spec:
  selector:
    app: livekit-server
  ports:
    - name: http
      port: 7880
      targetPort: 7880
    - name: rtc-tcp
      port: 7881
      targetPort: 7881
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: livekit-server-ingress
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  rules:
    - host: "${LIVEKIT_DOMAIN}"
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: livekit-server
                port:
                  number: 7880
---

# ── LiveKit Ingress (RTMP → WebRTC) ──────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livekit-ingress
  labels:
    app: livekit-ingress
spec:
  replicas: 1
  selector:
    matchLabels:
      app: livekit-ingress
  template:
    metadata:
      labels:
        app: livekit-ingress
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: ingress
          image: livekit/ingress:v1.4.3
          ports:
            - name: rtmp
              containerPort: 1935
            - name: http
              containerPort: 8080
          env:
            - name: LIVEKIT_URL
              value: "ws://livekit-server:7880"
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_API_KEY
            - name: API_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_API_SECRET
            - name: REDIS_URL
              value: "redis://livekit-redis:6379"
          resources:
            requests:
              memory: 128Mi
              cpu: 100m
            limits:
              memory: 512Mi
              cpu: 500m
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            runAsUser: 1000
            capabilities:
              drop: [ALL]
---
apiVersion: v1
kind: Service
metadata:
  name: livekit-ingress-rtmp
spec:
  type: LoadBalancer
  selector:
    app: livekit-ingress
  ports:
    - name: rtmp
      port: 1935
      targetPort: 1935
      protocol: TCP
---

# ── LiveKit Egress (recording) ────────────────────────────────────
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: livekit-recordings-pvc
spec:
  storageClassName: local-path
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 20Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: livekit-egress
  labels:
    app: livekit-egress
spec:
  replicas: 1
  selector:
    matchLabels:
      app: livekit-egress
  template:
    metadata:
      labels:
        app: livekit-egress
    spec:
      containers:
        - name: egress
          image: livekit/egress:v1.8.4
          env:
            - name: EGRESS_CONFIG_BODY
              value: |
                api_key: $(API_KEY)
                api_secret: $(API_SECRET)
                ws_url: ws://livekit-server:7880
                redis:
                  address: livekit-redis:6379
                health_port: 9090
                log_level: info
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_API_KEY
            - name: API_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_API_SECRET
          resources:
            requests:
              memory: 0
              cpu: 0
            limits:
              memory: 2Gi
              cpu: 2000m
          volumeMounts:
            - name: recordings
              mountPath: /recordings
      volumes:
        - name: recordings
          persistentVolumeClaim:
            claimName: livekit-recordings-pvc
```

- [ ] **Step 2: Add livekit.yaml to kustomization**

In `k3d/kustomization.yaml`, add after the `- brett.yaml` line (or any logical grouping):

```yaml
  # LiveKit — self-hosted WebRTC livestreaming
  - livekit.yaml
```

- [ ] **Step 3: Validate manifests**

```bash
task workspace:validate
```

Expected: exits 0.

- [ ] **Step 4: Deploy to dev cluster and verify pods start**

```bash
task workspace:deploy
kubectl get pods -n workspace | grep livekit
```

Expected: `livekit-redis-*`, `livekit-server-*`, `livekit-ingress-*`, `livekit-egress-*` all `Running`.

- [ ] **Step 5: Commit**

```bash
git add k3d/livekit.yaml k3d/kustomization.yaml
git commit -m "feat(livekit): add LiveKit Server, Ingress, Egress, Redis manifests"
```

---

## Task 5: Website — Install Dependencies and Token Lib

**Files:**
- Modify: `website/package.json`
- Create: `website/src/lib/livekit-token.ts`

- [ ] **Step 1: Install livekit packages**

```bash
cd website && npm install livekit-client livekit-server-sdk
```

Expected: packages added to `package.json` and `package-lock.json`.

- [ ] **Step 2: Write a failing test for token generation**

Create `website/src/lib/livekit-token.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createViewerToken, createPublisherToken } from './livekit-token.ts';

describe('createViewerToken', () => {
  it('returns a JWT string', async () => {
    const token = await createViewerToken('user-123', 'Test User', 'devlivekit', 'devlivekitsecret1234567890abcdef');
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 20);
  });
});

describe('createPublisherToken', () => {
  it('returns a JWT string', async () => {
    const token = await createPublisherToken('admin-1', 'Admin', 'devlivekit', 'devlivekitsecret1234567890abcdef');
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 20);
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd website && node --experimental-strip-types --test src/lib/livekit-token.test.ts 2>&1 | head -20
```

Expected: `Error: Cannot find module './livekit-token.ts'` or similar.

- [ ] **Step 4: Create website/src/lib/livekit-token.ts**

```typescript
import { AccessToken } from 'livekit-server-sdk';

const ROOM_NAME = 'main-stream';

export async function createViewerToken(
  userId: string,
  userName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: userName,
    ttl: '1h',
  });
  token.addGrant({ roomJoin: true, room: ROOM_NAME, canPublish: false, canSubscribe: true });
  return token.toJwt();
}

export async function createPublisherToken(
  userId: string,
  userName: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: userName,
    ttl: '4h',
  });
  token.addGrant({
    roomJoin: true,
    room: ROOM_NAME,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: true,
  });
  return token.toJwt();
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd website && node --experimental-strip-types --test src/lib/livekit-token.test.ts
```

Expected: `✔ returns a JWT string` for both tests.

- [ ] **Step 6: Commit**

```bash
git add website/package.json website/package-lock.json website/src/lib/livekit-token.ts website/src/lib/livekit-token.test.ts
git commit -m "feat(livekit): add livekit-client/server-sdk, token generation lib with tests"
```

---

## Task 6: Website — /api/stream/token Endpoint

**Files:**
- Create: `website/src/pages/api/stream/token.ts`

- [ ] **Step 1: Create the directory and token endpoint**

```typescript
// website/src/pages/api/stream/token.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { createViewerToken, createPublisherToken } from '../../../lib/livekit-token';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenFn = isAdmin(session) ? createPublisherToken : createViewerToken;
  const jwt = await tokenFn(session.sub, session.name, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  return new Response(JSON.stringify({ token: jwt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Test endpoint manually (dev cluster must be running)**

```bash
# Get a session cookie first by logging into web.localhost, then:
curl -s -X POST http://web.localhost/api/stream/token \
  -H "Cookie: workspace_session=<your-session-cookie>" | jq .
```

Expected: `{ "token": "<jwt-string>" }`.

Without cookie:
```bash
curl -s -X POST http://web.localhost/api/stream/token | jq .
```

Expected: `{ "error": "Unauthorized" }` with status 401.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/stream/token.ts
git commit -m "feat(livekit): add /api/stream/token endpoint"
```

---

## Task 7: Website — Svelte Components

**Files:**
- Create: `website/src/components/LiveStream/StreamOffline.svelte`
- Create: `website/src/components/LiveStream/StreamChat.svelte`
- Create: `website/src/components/LiveStream/StreamReactions.svelte`
- Create: `website/src/components/LiveStream/StreamHandRaise.svelte`
- Create: `website/src/components/LiveStream/StreamPlayer.svelte`

- [ ] **Step 1: Create StreamOffline.svelte**

```svelte
<!-- website/src/components/LiveStream/StreamOffline.svelte -->
<script lang="ts">
  let { message = 'Kein Stream aktiv' }: { message?: string } = $props();
</script>

<div class="flex flex-col items-center justify-center min-h-[360px] bg-dark-light rounded-xl border border-dark-lighter">
  <div class="text-4xl mb-4">📡</div>
  <p class="text-muted text-lg">{message}</p>
  <p class="text-muted text-sm mt-2">Schaue später wieder rein.</p>
</div>
```

- [ ] **Step 2: Create StreamChat.svelte**

```svelte
<!-- website/src/components/LiveStream/StreamChat.svelte -->
<script lang="ts">
  import type { Room, RemoteParticipant, LocalParticipant } from 'livekit-client';
  import { RoomEvent } from 'livekit-client';

  let { room }: { room: Room } = $props();

  type ChatMessage = { id: string; sender: string; text: string; at: number };
  let messages = $state<ChatMessage[]>([]);
  let text = $state('');
  let listEl: HTMLDivElement;

  $effect(() => {
    const handler = (payload: Uint8Array, participant?: RemoteParticipant | LocalParticipant) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type !== 'chat') return;
      messages = [...messages, {
        id: crypto.randomUUID(),
        sender: participant?.name ?? 'Anonym',
        text: msg.text,
        at: Date.now(),
      }];
      setTimeout(() => listEl?.scrollTo({ top: listEl.scrollHeight, behavior: 'smooth' }), 50);
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  });

  function send() {
    if (!text.trim()) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'chat', text: text.trim() }));
    room.localParticipant.publishData(payload, { reliable: true });
    messages = [...messages, { id: crypto.randomUUID(), sender: 'Du', text: text.trim(), at: Date.now() }];
    text = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }
</script>

<div class="flex flex-col h-full bg-dark-light border-l border-dark-lighter">
  <div class="px-3 py-2 border-b border-dark-lighter text-sm font-semibold text-light">
    Chat <span class="text-muted font-normal">({room.numParticipants} online)</span>
  </div>
  <div bind:this={listEl} class="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
    {#each messages as m (m.id)}
      <div>
        <span class="text-gold font-semibold">{m.sender}</span>
        <span class="text-light ml-1">{m.text}</span>
      </div>
    {/each}
    {#if messages.length === 0}
      <p class="text-muted text-xs">Noch keine Nachrichten.</p>
    {/if}
  </div>
  <div class="px-3 py-2 border-t border-dark-lighter">
    <input
      bind:value={text}
      onkeydown={onKey}
      class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-sm text-light placeholder-muted focus:outline-none focus:border-gold"
      placeholder="Nachricht eingeben…"
    />
  </div>
</div>
```

- [ ] **Step 3: Create StreamReactions.svelte**

```svelte
<!-- website/src/components/LiveStream/StreamReactions.svelte -->
<script lang="ts">
  import type { Room } from 'livekit-client';
  import { RoomEvent } from 'livekit-client';

  let { room }: { room: Room } = $props();

  type FloatingEmoji = { id: string; emoji: string; x: number };
  let floating = $state<FloatingEmoji[]>([]);

  const EMOJIS = ['👍', '❤️', '🔥', '😂', '👏'];

  $effect(() => {
    const handler = (payload: Uint8Array) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type !== 'reaction') return;
      addFloat(msg.emoji);
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  });

  function addFloat(emoji: string) {
    const id = crypto.randomUUID();
    floating = [...floating, { id, emoji, x: Math.random() * 80 + 10 }];
    setTimeout(() => { floating = floating.filter(f => f.id !== id); }, 2000);
  }

  function react(emoji: string) {
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'reaction', emoji }));
    room.localParticipant.publishData(payload, { reliable: false });
    addFloat(emoji);
  }
</script>

<div class="relative">
  <!-- Floating reactions -->
  <div class="absolute bottom-full left-0 right-0 h-32 pointer-events-none overflow-hidden">
    {#each floating as f (f.id)}
      <span
        class="absolute bottom-0 text-2xl animate-float"
        style="left: {f.x}%"
      >{f.emoji}</span>
    {/each}
  </div>

  <!-- Reaction buttons -->
  <div class="flex gap-2">
    {#each EMOJIS as emoji}
      <button
        onclick={() => react(emoji)}
        class="text-xl px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg hover:border-gold transition-colors"
        aria-label="Reaktion {emoji}"
      >{emoji}</button>
    {/each}
  </div>
</div>

<style>
  @keyframes float {
    0% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-120px); opacity: 0; }
  }
  .animate-float {
    animation: float 2s ease-out forwards;
  }
</style>
```

- [ ] **Step 4: Create StreamHandRaise.svelte**

```svelte
<!-- website/src/components/LiveStream/StreamHandRaise.svelte -->
<script lang="ts">
  import type { Room } from 'livekit-client';
  import { RoomEvent } from 'livekit-client';

  let { room, isHost = false }: { room: Room; isHost?: boolean } = $props();

  let raised = $state(false);
  type RaiseRequest = { userId: string; userName: string };
  let queue = $state<RaiseRequest[]>([]);

  $effect(() => {
    const handler = (payload: Uint8Array) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type === 'raise') {
        if (isHost) {
          queue = [...queue.filter(r => r.userId !== msg.userId), { userId: msg.userId, userName: msg.userName }];
        }
      }
      if (msg.type === 'lower') {
        queue = queue.filter(r => r.userId !== msg.userId);
      }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  });

  function toggleRaise() {
    raised = !raised;
    const type = raised ? 'raise' : 'lower';
    const payload = new TextEncoder().encode(JSON.stringify({
      type,
      userId: room.localParticipant.identity,
      userName: room.localParticipant.name ?? 'Unbekannt',
    }));
    room.localParticipant.publishData(payload, { reliable: true });
  }

  function grantMic(userId: string) {
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'grant', userId }));
    room.localParticipant.publishData(payload, { reliable: true });
    queue = queue.filter(r => r.userId !== userId);
  }
</script>

{#if isHost}
  {#if queue.length > 0}
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-4">
      <h3 class="text-sm font-semibold text-light mb-2">✋ Wortmeldungen ({queue.length})</h3>
      <ul class="space-y-2">
        {#each queue as req (req.userId)}
          <li class="flex items-center justify-between">
            <span class="text-sm text-light">{req.userName}</span>
            <button
              onclick={() => grantMic(req.userId)}
              class="text-xs bg-gold text-dark px-2 py-1 rounded font-semibold hover:bg-gold/80"
            >Mikro freigeben</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{:else}
  <button
    onclick={toggleRaise}
    class="px-4 py-2 rounded-lg border text-sm font-semibold transition-colors
           {raised ? 'bg-gold text-dark border-gold' : 'bg-dark-light border-dark-lighter text-light hover:border-gold'}"
  >
    ✋ {raised ? 'Wortmeldung zurückziehen' : 'Wortmeldung'}
  </button>
{/if}
```

- [ ] **Step 5: Create StreamPlayer.svelte**

```svelte
<!-- website/src/components/LiveStream/StreamPlayer.svelte -->
<script lang="ts">
  import { Room, RoomEvent, Track } from 'livekit-client';
  import StreamOffline from './StreamOffline.svelte';
  import StreamChat from './StreamChat.svelte';
  import StreamReactions from './StreamReactions.svelte';
  import StreamHandRaise from './StreamHandRaise.svelte';

  let { livekitUrl, isHost = false }: { livekitUrl: string; isHost?: boolean } = $props();

  type State = 'loading' | 'offline' | 'live' | 'error';
  let state = $state<State>('loading');
  let errorMsg = $state('');
  let room = $state<Room | null>(null);
  let videoEl: HTMLVideoElement;

  $effect(() => {
    let mounted = true;

    async function connect() {
      try {
        const res = await fetch('/api/stream/token', { method: 'POST' });
        if (!res.ok) { state = 'error'; errorMsg = 'Authentifizierung fehlgeschlagen.'; return; }
        const { token } = await res.json();

        const r = new Room();
        r.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Video && videoEl) {
            track.attach(videoEl);
            if (mounted) state = 'live';
          }
        });
        r.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach();
        });
        r.on(RoomEvent.Disconnected, () => {
          if (mounted) state = 'offline';
        });

        await r.connect(livekitUrl, token);
        if (mounted) {
          room = r;
          // If no tracks yet, show offline; tracks arriving will flip to live
          state = r.remoteParticipants.size === 0 ? 'offline' : 'live';
        }
      } catch (e) {
        if (mounted) { state = 'error'; errorMsg = String(e); }
      }
    }

    connect();
    return () => {
      mounted = false;
      room?.disconnect();
    };
  });
</script>

{#if state === 'loading'}
  <div class="flex items-center justify-center min-h-[360px] text-muted">Verbinde…</div>

{:else if state === 'error'}
  <StreamOffline message={errorMsg} />

{:else if state === 'offline'}
  <StreamOffline />

{:else if state === 'live' && room}
  <div class="grid grid-cols-[1fr_300px] h-[560px] bg-dark rounded-xl overflow-hidden border border-dark-lighter">
    <!-- Video + controls -->
    <div class="flex flex-col bg-black">
      <div class="relative flex-1">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoEl} autoplay playsinline class="w-full h-full object-contain"></video>
        <span class="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">● LIVE</span>
      </div>
      <div class="flex items-center gap-3 px-4 py-3 bg-dark-light border-t border-dark-lighter">
        <StreamReactions {room} />
        <StreamHandRaise {room} {isHost} />
      </div>
    </div>
    <!-- Chat -->
    <StreamChat {room} />
  </div>
{/if}
```

- [ ] **Step 6: Commit**

```bash
git add website/src/components/LiveStream/
git commit -m "feat(livekit): add StreamPlayer, StreamChat, StreamReactions, StreamHandRaise, StreamOffline components"
```

---

## Task 8: Website — Portal Viewer Page

**Files:**
- Create: `website/src/pages/portal/stream.astro`

- [ ] **Step 1: Create portal/stream.astro**

```astro
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../../lib/auth';
import StreamPlayer from '../../components/LiveStream/StreamPlayer.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));

const livekitDomain = process.env.LIVEKIT_DOMAIN || 'livekit.localhost';
const livekitUrl = `ws://${livekitDomain}`;
---

<Layout title="Livestream">
  <section class="pt-28 pb-20 bg-dark min-h-screen">
    <div class="max-w-6xl mx-auto px-6">
      <h1 class="text-2xl font-bold text-light mb-6 font-serif">Livestream</h1>
      <StreamPlayer
        client:load
        livekitUrl={livekitUrl}
        isHost={false}
      />
    </div>
  </section>
</Layout>
```

- [ ] **Step 2: Add LIVEKIT_DOMAIN env var to website deployment**

In `k3d/livekit.yaml` — no change needed; the value comes from `domain-config` ConfigMap. But the website pod needs it as an env var. In `k3d/website.yaml`, find the env section and add:

```yaml
            - name: LIVEKIT_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: LIVEKIT_DOMAIN
```

- [ ] **Step 3: Redeploy website**

```bash
task website:redeploy
```

- [ ] **Step 4: Test viewer page**

Open `http://web.localhost/portal/stream` in browser while logged in. Expect: StreamOffline component ("Kein Stream aktiv") since no host is streaming yet.

Open without login. Expect: redirect to Keycloak login.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/portal/stream.astro k3d/website.yaml
git commit -m "feat(livekit): add /portal/stream viewer page"
```

---

## Task 9: Website — Admin Host Page + Nav

**Files:**
- Create: `website/src/pages/admin/stream.astro`
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Create admin/stream.astro**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import StreamPlayer from '../../components/LiveStream/StreamPlayer.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const livekitDomain = process.env.LIVEKIT_DOMAIN || 'livekit.localhost';
const livekitUrl = `ws://${livekitDomain}`;
const streamDomain = process.env.STREAM_DOMAIN || 'stream.localhost';
const rtmpKey = process.env.LIVEKIT_RTMP_KEY || 'devrtmpkey123456';
---

<AdminLayout title="Stream">
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-light font-serif">Livestream</h1>
    </div>

    <!-- RTMP credentials card -->
    <div class="bg-dark-light border border-dark-lighter rounded-xl p-5">
      <h2 class="text-sm font-semibold text-light mb-3">OBS / RTMP Zugangsdaten</h2>
      <div class="space-y-2 text-sm">
        <div>
          <span class="text-muted">Server URL</span>
          <code class="block mt-1 bg-dark px-3 py-2 rounded text-gold font-mono">rtmp://{streamDomain}/live</code>
        </div>
        <div>
          <span class="text-muted">Stream Key</span>
          <code class="block mt-1 bg-dark px-3 py-2 rounded text-gold font-mono">{rtmpKey}</code>
        </div>
      </div>
      <p class="text-xs text-muted mt-3">Trage diese Daten in OBS → Einstellungen → Stream → Benutzerdefinierter RTMP-Server ein.</p>
    </div>

    <!-- Live preview + host controls -->
    <StreamPlayer
      client:load
      livekitUrl={livekitUrl}
      isHost={true}
    />
  </div>
</AdminLayout>
```

- [ ] **Step 2: Add Stream nav item to AdminLayout**

In `website/src/layouts/AdminLayout.astro`, in the `navGroups` array, find the group that contains `{ href: '/admin/meetings', ... }` and add a stream entry:

```typescript
      { href: '/admin/stream', label: 'Stream', icon: 'broadcast' },
```

Add it after the `meetings` entry.

Then add the SVG icon for `broadcast` in the icon switch/map used by AdminLayout (find where `icon: 'monitor'` renders its SVG, add a `broadcast` case):

```html
<!-- broadcast icon -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 8a6 6 0 0 1 0 8"/><path d="M6 8a6 6 0 0 0 0 8"/>
  <circle cx="12" cy="12" r="2"/>
  <path d="M21 5a11 11 0 0 1 0 14"/><path d="M3 5a11 11 0 0 0 0 14"/>
</svg>
```

- [ ] **Step 3: Add STREAM_DOMAIN and LIVEKIT_RTMP_KEY to website env in k3d/website.yaml**

In `k3d/website.yaml`, in the website container env section, add:

```yaml
            - name: STREAM_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: STREAM_DOMAIN
            - name: LIVEKIT_RTMP_KEY
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: LIVEKIT_RTMP_KEY
```

- [ ] **Step 4: Redeploy website**

```bash
task website:redeploy
```

- [ ] **Step 5: Test admin stream page**

Open `http://web.localhost/admin/stream` as admin user. Expect:
- RTMP credentials shown
- StreamPlayer in host mode (isHost=true shows Wortmeldungen panel)
- StreamOffline since no stream is active

Open as non-admin. Expect: redirect to `/admin`.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/stream.astro website/src/layouts/AdminLayout.astro k3d/website.yaml
git commit -m "feat(livekit): add /admin/stream host page + Stream nav item"
```

---

## Task 10: Website — Recording API + Admin Toggle

**Files:**
- Create: `website/src/pages/api/stream/recording.ts`
- Modify: `website/src/pages/admin/stream.astro`

- [ ] **Step 1: Create /api/stream/recording endpoint**

```typescript
// website/src/pages/api/stream/recording.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { EgressClient, EncodedFileType } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devlivekit';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'devlivekitsecret1234567890abcdef';
const LIVEKIT_URL = `http://${process.env.LIVEKIT_DOMAIN || 'livekit.localhost'}`;
const ROOM_NAME = 'main-stream';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { action, egressId } = await request.json() as { action: 'start' | 'stop'; egressId?: string };
  const client = new EgressClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  if (action === 'start') {
    const info = await client.startRoomCompositeEgress(ROOM_NAME, {
      file: {
        fileType: EncodedFileType.MP4,
        filepath: `/recordings/${ROOM_NAME}-${Date.now()}.mp4`,
      },
    });
    return new Response(JSON.stringify({ egressId: info.egressId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'stop' && egressId) {
    await client.stopEgress(egressId);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Invalid action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Add recording toggle to admin/stream.astro**

In `website/src/pages/admin/stream.astro`, after the RTMP credentials card and before the StreamPlayer, add a recording control card. First add a `<script>` block at the bottom of the Astro file (outside the frontmatter):

```html
<!-- Recording control card — goes between RTMP card and StreamPlayer -->
<div class="bg-dark-light border border-dark-lighter rounded-xl p-5" id="recording-card">
  <h2 class="text-sm font-semibold text-light mb-3">Aufzeichnung</h2>
  <div class="flex items-center gap-4">
    <button
      id="recording-btn"
      class="px-4 py-2 rounded-lg text-sm font-semibold bg-dark border border-dark-lighter text-light hover:border-gold transition-colors"
      onclick="toggleRecording()"
    >● Aufzeichnung starten</button>
    <span id="recording-status" class="text-sm text-muted"></span>
  </div>
</div>

<script>
  let egressId = null;
  const btn = document.getElementById('recording-btn');
  const status = document.getElementById('recording-status');

  async function toggleRecording() {
    if (!egressId) {
      btn.disabled = true;
      const res = await fetch('/api/stream/recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      if (data.egressId) {
        egressId = data.egressId;
        btn.textContent = '⏹ Aufzeichnung stoppen';
        btn.classList.add('border-red-500', 'text-red-400');
        status.textContent = 'Aufzeichnung läuft…';
      }
      btn.disabled = false;
    } else {
      btn.disabled = true;
      await fetch('/api/stream/recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', egressId }),
      });
      egressId = null;
      btn.textContent = '● Aufzeichnung starten';
      btn.classList.remove('border-red-500', 'text-red-400');
      status.textContent = 'Aufzeichnung gespeichert in /recordings/';
      btn.disabled = false;
    }
  }
</script>
```

- [ ] **Step 3: Redeploy website**

```bash
task website:redeploy
```

- [ ] **Step 4: Verify recording card shows on admin/stream page**

Open `http://web.localhost/admin/stream`. Expect: "Aufzeichnung starten" button visible below RTMP creds.

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/stream/recording.ts website/src/pages/admin/stream.astro
git commit -m "feat(livekit): add recording start/stop API + admin UI toggle"
```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: Verify all LiveKit pods are healthy**

```bash
kubectl get pods -n workspace | grep livekit
```

Expected: all 4 pods in `Running` state, no restarts.

- [ ] **Step 2: Test viewer page offline state**

Open `http://web.localhost/portal/stream` as logged-in user.
Expected: StreamOffline component ("Kein Stream aktiv").

- [ ] **Step 3: Test token endpoint rejects unauthenticated requests**

```bash
curl -s -X POST http://web.localhost/api/stream/token | jq .
```

Expected: `{ "error": "Unauthorized" }`.

- [ ] **Step 4: Test RTMP ingest (optional, requires OBS)**

In OBS: Settings → Stream → Custom → Server `rtmp://stream.localhost/live`, Key `devrtmpkey123456`. Start streaming. Watch `http://web.localhost/portal/stream` — video should appear within 5 seconds.

- [ ] **Step 5: Validate manifests are still clean**

```bash
task workspace:validate
```

Expected: exits 0.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat(livekit): livestream feature complete — smoke test passed"
```
