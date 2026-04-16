# Messaging Plan 3 — 72h Email Notifications + Full Mattermost Removal

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 72h unread-email CronJob, then remove all Mattermost, billing-bot, OpenSearch, mm-keycloak-proxy, and related scripts from the codebase and cluster.

**Architecture:** A new `/api/cron/notify-unread` endpoint queries `messages` and `chat_messages` for rows unread >72h and fires one nodemailer email per affected customer. A K8s CronJob calls this endpoint every 6 hours using a bearer token. Then all Mattermost K8s manifests, the billing-bot service, mm-keycloak-proxy, opensearch, and related setup scripts are deleted and removed from kustomization.yaml.

**Prerequisite:** Plans 1 and 2 must be complete.

---

## File Map

| Action | Path |
|---|---|
| Create | `website/src/pages/api/cron/notify-unread.ts` |
| Create | `k3d/notify-unread-cronjob.yaml` |
| Modify | `k3d/secrets.yaml` |
| Modify | `k3d/kustomization.yaml` |
| Delete | `k3d/mattermost.yaml` |
| Delete | `k3d/mattermost-hpa.yaml` |
| Delete | `k3d/mattermost-force-sso.yaml` |
| Delete | `k3d/mm-keycloak-proxy.yaml` |
| Delete | `k3d/mattermost-userinfo-proxy.conf` |
| Delete | `k3d/claude-code-mcp-mattermost.yaml` |
| Delete | `k3d/opensearch.yaml` |
| Delete | `k3d/billing-bot.yaml` |
| Delete | `k3d/billing-bot-init-job.yaml` |
| Delete | `billing-bot/` (entire directory) |
| Delete | `scripts/mattermost-connectors-setup.sh` |
| Delete | `scripts/claude-code-mattermost-setup.sh` |
| Delete | `scripts/mattermost-anfragen-setup.sh` |
| Delete | `scripts/set-mattermost-theme.sh` |
| Delete | `scripts/billing-bot-setup.sh` |

---

## Task 1: Create /api/cron/notify-unread.ts

**Files:**
- Create: `website/src/pages/api/cron/notify-unread.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /home/patrick/Bachelorprojekt/website/src/pages/api/cron
```

- [ ] **Step 2: Create the file**

```typescript
// website/src/pages/api/cron/notify-unread.ts
// Called by K8s CronJob every 6h. Sends one email per customer who has unread messages older than 72h.
import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';
import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BRAND_NAME  = process.env.BRAND_NAME || 'Workspace';
const SITE_URL    = process.env.SITE_URL || '';

const pool = new Pool({ connectionString: DB_URL });

interface UnreadRow {
  customer_email: string;
  customer_name: string;
  unread_count: string;
  message_ids: number[];
}

export const POST: APIRoute = async ({ request }) => {
  // Bearer token check
  const auth = request.headers.get('authorization') ?? '';
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // 1. Direct messages: admin-sent messages unread by user, >72h, no notification sent yet
    const { rows: directRows } = await pool.query<UnreadRow>(`
      SELECT c.email AS customer_email, c.name AS customer_name,
             count(m.id)::text AS unread_count,
             array_agg(m.id) AS message_ids
      FROM messages m
      JOIN message_threads t ON t.id = m.thread_id
      JOIN customers c ON c.id = t.customer_id
      WHERE m.sender_role = 'admin'
        AND m.read_at IS NULL
        AND m.notification_sent_at IS NULL
        AND m.created_at < NOW() - INTERVAL '72 hours'
      GROUP BY c.email, c.name
    `);

    // 2. Chat room messages: unread by member, >72h, no notification sent yet
    const { rows: roomRows } = await pool.query<UnreadRow>(`
      SELECT c.email AS customer_email, c.name AS customer_name,
             count(cm.id)::text AS unread_count,
             array_agg(cm.id) AS message_ids
      FROM chat_messages cm
      JOIN chat_room_members crm ON crm.room_id = cm.room_id
      JOIN customers c ON c.id = crm.customer_id
      WHERE cm.notification_sent_at IS NULL
        AND cm.created_at < NOW() - INTERVAL '72 hours'
        AND cm.sender_id != c.keycloak_user_id   -- don't notify sender
        AND NOT EXISTS (
          SELECT 1 FROM chat_message_reads r
          WHERE r.message_id = cm.id AND r.customer_id = c.id
        )
      GROUP BY c.email, c.name
    `);

    // Merge by customer email
    const byEmail = new Map<string, { name: string; directIds: number[]; roomIds: number[] }>();

    for (const row of directRows) {
      byEmail.set(row.customer_email, {
        name: row.customer_name,
        directIds: row.message_ids,
        roomIds: [],
      });
    }
    for (const row of roomRows) {
      const existing = byEmail.get(row.customer_email);
      if (existing) {
        existing.roomIds = row.message_ids;
      } else {
        byEmail.set(row.customer_email, {
          name: row.customer_name,
          directIds: [],
          roomIds: row.message_ids,
        });
      }
    }

    let emailsSent = 0;
    const client = await pool.connect();
    try {
      for (const [email, { name, directIds, roomIds }] of byEmail) {
        const totalUnread = directIds.length + roomIds.length;
        const portalUrl = `${SITE_URL}/portal/nachrichten`;

        await sendEmail({
          to: email,
          subject: `Sie haben ${totalUnread} ungelesene Nachricht${totalUnread > 1 ? 'en' : ''} auf ${BRAND_NAME}`,
          text: `Hallo ${name},\n\nSie haben ${totalUnread} ungelesene Nachricht${totalUnread > 1 ? 'en' : ''} in Ihrem Portal.\n\nJetzt lesen: ${portalUrl}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
          html: `<p>Hallo ${name},</p><p>Sie haben <strong>${totalUnread} ungelesene Nachricht${totalUnread > 1 ? 'en' : ''}</strong> in Ihrem Portal.</p><p><a href="${portalUrl}" style="display:inline-block;background:#7c6ff7;color:#fff;padding:12px 24px;border-radius:25px;text-decoration:none;font-weight:bold">Portal öffnen</a></p><p>Mit freundlichen Grüßen<br>${BRAND_NAME}</p>`,
        });
        emailsSent++;

        // Mark notification_sent_at on processed message rows
        if (directIds.length > 0) {
          await client.query(
            `UPDATE messages SET notification_sent_at = NOW() WHERE id = ANY($1)`,
            [directIds],
          );
        }
        if (roomIds.length > 0) {
          await client.query(
            `UPDATE chat_messages SET notification_sent_at = NOW() WHERE id = ANY($1)`,
            [roomIds],
          );
        }
      }
    } finally {
      client.release();
    }

    console.log(`[notify-unread] Sent ${emailsSent} notification emails`);
    return new Response(JSON.stringify({ emailsSent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-unread]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/cron/notify-unread.ts
git commit -m "feat(cron): 72h unread email notification endpoint"
```

---

## Task 2: Add CRON_SECRET to k3d/secrets.yaml

**Files:**
- Modify: `k3d/secrets.yaml`

- [ ] **Step 1: In the `workspace-secrets` Secret, add a new key under `stringData` (or `data`)**

Find the `workspace-secrets` Secret block and add inside `stringData`:
```yaml
    CRON_SECRET: "devcronsecret12345"
```

Also add to the website Deployment environment (in `k3d/website.yaml` or wherever website env vars are defined — search for `SESSIONS_DATABASE_URL` to find the right file):
```yaml
- name: CRON_SECRET
  valueFrom:
    secretKeyRef:
      name: workspace-secrets
      key: CRON_SECRET
```

- [ ] **Step 2: Verify YAML syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('k3d/secrets.yaml'))" && echo OK
```

- [ ] **Step 3: Commit**

```bash
git add k3d/secrets.yaml
git commit -m "chore(secrets): add CRON_SECRET for notify-unread endpoint"
```

---

## Task 3: Create k3d/notify-unread-cronjob.yaml

**Files:**
- Create: `k3d/notify-unread-cronjob.yaml`

- [ ] **Step 1: Create the file**

```yaml
# k3d/notify-unread-cronjob.yaml
# Calls /api/cron/notify-unread every 6 hours to send 72h unread notification emails.
apiVersion: batch/v1
kind: CronJob
metadata:
  name: notify-unread
spec:
  schedule: "0 */6 * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: notify
              image: curlimages/curl:8.7.1
              command:
                - curl
                - -s
                - -o
                - /dev/null
                - -w
                - "%{http_code}"
                - -X
                - POST
                - -H
                - "Authorization: Bearer $(CRON_SECRET)"
                - -H
                - "Content-Type: application/json"
                - "http://website.workspace.svc.cluster.local:4321/api/cron/notify-unread"
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: CRON_SECRET
```

- [ ] **Step 2: Add to kustomization.yaml**

In `k3d/kustomization.yaml`, add the new CronJob to the `resources:` list (near the other CronJobs like `backup-cronjob.yaml`):
```yaml
  - notify-unread-cronjob.yaml
```

- [ ] **Step 3: Validate**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add k3d/notify-unread-cronjob.yaml k3d/kustomization.yaml
git commit -m "feat(k8s): notify-unread CronJob every 6h"
```

---

## Task 4: Remove Mattermost K8s manifests

**Files:**
- Delete: `k3d/mattermost.yaml`, `k3d/mattermost-hpa.yaml`, `k3d/mattermost-force-sso.yaml`
- Delete: `k3d/mm-keycloak-proxy.yaml`, `k3d/mattermost-userinfo-proxy.conf`
- Delete: `k3d/claude-code-mcp-mattermost.yaml`
- Delete: `k3d/opensearch.yaml`

- [ ] **Step 1: Delete the manifest files**

```bash
cd /home/patrick/Bachelorprojekt
git rm k3d/mattermost.yaml k3d/mattermost-hpa.yaml k3d/mattermost-force-sso.yaml
git rm k3d/mm-keycloak-proxy.yaml k3d/claude-code-mcp-mattermost.yaml
git rm k3d/opensearch.yaml
git rm k3d/mattermost-userinfo-proxy.conf 2>/dev/null || true
```

- [ ] **Step 2: Remove them from kustomization.yaml**

In `k3d/kustomization.yaml`, remove these lines from the `resources:` list:
```yaml
  - mm-keycloak-proxy.yaml
  - mattermost.yaml
  - mattermost-hpa.yaml
  - opensearch.yaml
  - claude-code-mcp-mattermost.yaml
  - mattermost-force-sso.yaml
```

Also remove the `mattermost-proxy-config` configMapGenerator entry:
```yaml
  - name: mattermost-proxy-config
    files:
      - default.conf=mattermost-userinfo-proxy.conf
```

- [ ] **Step 3: Validate**

```bash
task workspace:validate 2>&1 | tail -5
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add k3d/kustomization.yaml
git commit -m "chore(k8s): remove Mattermost, OpenSearch, mm-keycloak-proxy manifests"
```

---

## Task 5: Remove billing-bot

**Files:**
- Delete: `k3d/billing-bot.yaml`, `k3d/billing-bot-init-job.yaml`
- Delete: `billing-bot/` directory

- [ ] **Step 1: Remove K8s manifests**

```bash
cd /home/patrick/Bachelorprojekt
git rm k3d/billing-bot.yaml k3d/billing-bot-init-job.yaml
```

- [ ] **Step 2: Remove from kustomization.yaml**

Remove from `resources:`:
```yaml
  - billing-bot.yaml
  - billing-bot-init-job.yaml
```

- [ ] **Step 3: Remove the billing-bot Go service**

```bash
git rm -r billing-bot/
```

- [ ] **Step 4: Verify and commit**

```bash
task workspace:validate 2>&1 | tail -5
git add k3d/kustomization.yaml
git commit -m "chore: remove billing-bot service and K8s manifests"
```

---

## Task 6: Remove Mattermost setup scripts

- [ ] **Step 1: Delete the scripts**

```bash
cd /home/patrick/Bachelorprojekt
git rm -f scripts/mattermost-connectors-setup.sh 2>/dev/null || true
git rm -f scripts/claude-code-mattermost-setup.sh 2>/dev/null || true
git rm -f scripts/mattermost-anfragen-setup.sh 2>/dev/null || true
git rm -f scripts/set-mattermost-theme.sh 2>/dev/null || true
git rm -f scripts/billing-bot-setup.sh 2>/dev/null || true
git rm -f scripts/call-setup.sh 2>/dev/null || true
git rm -f scripts/mattermost-docs-integration.sh 2>/dev/null || true
git rm -f scripts/mattermost-cleanup-channels.sh 2>/dev/null || true
```

- [ ] **Step 2: Check for any Taskfile references to these scripts**

```bash
grep -n "mattermost\|billing.bot\|billing-bot" Taskfile.yml | grep -v "^#"
```

Remove or update any task entries that reference deleted scripts or Mattermost services.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove Mattermost and billing-bot setup scripts"
```

---

## Task 7: Remove Mattermost credentials from secrets.yaml

**Files:**
- Modify: `k3d/secrets.yaml`

- [ ] **Step 1: Remove these keys from workspace-secrets**

Find and remove any keys matching:
- `MATTERMOST_*`
- `MM_TOKEN`
- `MM_*`
- mattermost database password (key like `mattermost-password` or similar)

- [ ] **Step 2: Verify YAML and commit**

```bash
python3 -c "import yaml; yaml.safe_load(open('k3d/secrets.yaml'))" && echo OK
git add k3d/secrets.yaml
git commit -m "chore(secrets): remove Mattermost credentials"
```

---

## Task 8: Update shared-db to drop mattermost database/user

The `mattermost` database and user in PostgreSQL are no longer needed. The init script in `k3d/shared-db.yaml` creates them.

- [ ] **Step 1: Find the mattermost DB/user creation in shared-db.yaml**

```bash
grep -n "mattermost" k3d/shared-db.yaml
```

- [ ] **Step 2: Remove those lines**

Remove the `CREATE DATABASE mattermost`, `CREATE USER mattermost`, and `GRANT` lines for Mattermost from the init script in `k3d/shared-db.yaml`.

- [ ] **Step 3: Verify YAML and commit**

```bash
python3 -c "import yaml; yaml.safe_load(open('k3d/shared-db.yaml'))" && echo OK
git add k3d/shared-db.yaml
git commit -m "chore(db): remove mattermost database and user from shared-db init"
```

---

## Task 9: Update CI tests

- [ ] **Step 1: Find test files that reference Mattermost**

```bash
grep -rl "mattermost\|MM_TOKEN\|mm-keycloak" tests/ --include="*.sh" --include="*.ts" --include="*.spec.ts"
```

- [ ] **Step 2: Update each test file**

For each test file found:

**`tests/local/FA-10.sh`** — Replace assertions about Mattermost webhook/channel existing with assertions about the inbox API returning a 200:
```bash
# Old: verify anfragen channel exists
# New: verify inbox API responds
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://website.workspace.svc.cluster.local:4321/api/health)
[ "$STATUS" = "200" ] && echo "PASS: website reachable" || echo "FAIL: website unreachable"
```

**`tests/local/SA-08.sh`** — Remove assertions that Mattermost SSO is configured. The test should only verify Keycloak SSO works for the website.

**`tests/local/SA-03.sh`, `SA-07.sh`, `SA-09.sh`, `SA-10.sh`** — Remove any `curl` calls or pod-existence checks targeting Mattermost pods.

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test: remove Mattermost assertions from test suite"
```

---

## Task 10: Final validation

- [ ] **Step 1: Validate all manifests**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate
```
Expected: no errors.

- [ ] **Step 2: Check no remaining Mattermost references in active code**

```bash
grep -rl "mattermost\|MATTERMOST\|mm-keycloak" \
  website/src/ k3d/ scripts/ \
  --include="*.ts" --include="*.yaml" --include="*.sh" \
  | grep -v "node_modules\|dist\|.git"
```

Any remaining files should be documented or intentional (e.g., git history references in comments are fine; live imports are not).

- [ ] **Step 3: Run shellcheck on modified scripts**

```bash
shellcheck scripts/*.sh 2>&1 | head -30
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git status  # verify only expected files changed
git commit -m "chore: complete Mattermost removal — all references cleaned up"
```

---

## Post-Removal Checklist

- [ ] Mattermost pod no longer appears in `kubectl get pods -n workspace`
- [ ] OpenSearch pod no longer appears
- [ ] billing-bot pod no longer appears
- [ ] mm-keycloak-proxy pod no longer appears
- [ ] `/admin/inbox` still loads and shows pending items
- [ ] Contact form submission creates inbox item
- [ ] 72h cron endpoint responds with 200 when called with correct bearer token:
  ```bash
  curl -s -X POST -H "Authorization: Bearer devcronsecret12345" \
    http://localhost:<website-port>/api/cron/notify-unread
  ```
  Expected: `{"emailsSent":0}` (or higher if test messages exist)
