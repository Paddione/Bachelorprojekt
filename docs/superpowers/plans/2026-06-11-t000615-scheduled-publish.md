---
ticket_id: null
status: planning
domains: [website, infra]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Zeitgesteuertes Veröffentlichen (Scheduled Publish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Newsletter-Kampagnen können mit einem zukünftigen Sendezeitpunkt geplant werden; ein Kubernetes CronJob versendet fällige Kampagnen idempotent alle 5 Minuten.

**Architecture:** Eine neue `scheduled_publish_at`-Spalte + Status `scheduled` auf `newsletter_campaigns`. Die bestehende Versand-Logik wird aus der HTTP-Route in eine wiederverwendbare `sendCampaignById()`-Funktion in `newsletter-db.ts` extrahiert. Ein neuer Cron-Endpunkt (`/api/cron/scheduled-publish`) nutzt einen atomaren `UPDATE … WHERE status='scheduled' RETURNING`-Status-Lock (`sending`) zur Doppelversand-Vermeidung. Ein CronJob (curl-Muster, `timeZone: Europe/Berlin`) feuert den Endpunkt; die Admin-UI bekommt einen Datetime-Picker, Status-Badges und einen "Planung aufheben"-Button.

**Tech Stack:** Astro API-Routes (TypeScript), Svelte 5 (Runes), PostgreSQL 16 (`pg`), Kubernetes CronJob (Kustomize), BATS.

**Spec:** `docs/superpowers/specs/2026-06-11-t000615-scheduled-publish-design.md`

---

## File Structure

| Datei | Verantwortung |
|-------|---------------|
| `website/src/lib/newsletter-db.ts` | Schema-Migration (`ADD COLUMN`), `NewsletterCampaign`-Typ, `sendCampaignById()`, erweiterte `updateCampaign()`, Status-Lock-Queries (`lockDueCampaign`, `finalizeCampaignSent`, `unlockCampaignToScheduled`, `listDueCampaignIds`, `resetStaleSendingCampaigns`) |
| `website/src/pages/api/admin/newsletter/campaigns/[id].ts` | PUT: Validation für `scheduled_publish_at` + Status-Transition `draft↔scheduled` |
| `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts` | Refactoring auf `sendCampaignById()` (kein Logik-Duplikat) |
| `website/src/pages/api/cron/scheduled-publish.ts` | NEU: Cron-Endpunkt mit Bearer-Auth, Lock, Retry, Stale-Cleanup |
| `website/src/components/admin/NewsletterAdmin.svelte` | Datetime-Picker, UI-Validation, Status-Badge, "Planung aufheben"-Button |
| `k3d/cronjob-scheduled-publish.yaml` | NEU: CronJob-Manifest |
| `k3d/kustomization.yaml` | `resources:`-Eintrag |
| `prod-korczewski/patch-cronjob-urls.yaml` | korczewski-Namespace-URL-Patch (PFLICHT) |
| `tests/unit/newsletter-scheduled-publish.bats` | NEU: offline BATS-Tests (Manifest-Struktur + Endpunkt-Quelltext-Asserts) |
| `website/src/data/test-inventory.json` | Regeneriertes Test-Inventory |

**Anmerkung zum Auth-Muster:** Der bestehende `notify-unread`-Endpunkt nutzt `POST` und antwortet bei fehlendem Token mit `403`. Die Spec (Abschnitt 4.4 + Test-Plan 8) verlangt für den neuen Endpunkt `GET` mit Bearer-Auth und `401` bei fehlendem Token — diesem Plan folgen wir, da der Test-Plan `401` fordert. Der zugehörige CronJob ruft den Endpunkt entsprechend mit `GET` auf.

---

## Phase A: DB + Backend-Fundament

### Task A1: Schema-Migration — `scheduled_publish_at` Spalte

**Files:**
- Modify: `website/src/lib/newsletter-db.ts` (Funktion `ensureTables()`)

- [ ] **Step 1: Spalte idempotent hinzufügen**

In `ensureTables()`, direkt **nach** dem `CREATE TABLE IF NOT EXISTS newsletter_campaigns (...)`-Block und **vor** dem `newsletter_send_log`-Block, diese Query einfügen:

```typescript
  await pool.query(`
    ALTER TABLE newsletter_campaigns
      ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ
  `);
```

- [ ] **Step 2: Verifizieren, dass die Migration syntaktisch korrekt ist**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'newsletter-db' || echo "no newsletter-db errors"`
Expected: `no newsletter-db errors`

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/newsletter-db.ts
git commit -m "feat(newsletter): add scheduled_publish_at column to campaigns (T000615)"
```

---

### Task A2: `NewsletterCampaign`-Typ erweitern

**Files:**
- Modify: `website/src/lib/newsletter-db.ts` (Interface `NewsletterCampaign` + alle `SELECT`-Spaltenlisten)

- [ ] **Step 1: Interface erweitern**

Ersetze das bestehende Interface:

```typescript
export interface NewsletterCampaign {
  id: string;
  subject: string;
  html_body: string;
  status: 'draft' | 'sent';
  sent_at: Date | null;
  recipient_count: number | null;
  created_at: Date;
  updated_at: Date;
}
```

durch:

```typescript
export interface NewsletterCampaign {
  id: string;
  subject: string;
  html_body: string;
  status: 'draft' | 'scheduled' | 'sent';
  scheduled_publish_at: Date | null;
  sent_at: Date | null;
  recipient_count: number | null;
  created_at: Date;
  updated_at: Date;
}
```

- [ ] **Step 2: `scheduled_publish_at` in allen Campaign-SELECTs ergänzen**

In `listCampaigns()`, `getCampaign()`, `createCampaign()` (RETURNING) und `updateCampaign()` (RETURNING) jeweils die Spaltenliste
`id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at`
ersetzen durch
`id, subject, html_body, status, scheduled_publish_at, sent_at, recipient_count, created_at, updated_at`.

(Vier Stellen — alle vier müssen geändert werden, sonst ist `scheduled_publish_at` im Rückgabewert `undefined`.)

- [ ] **Step 3: Typecheck**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'newsletter' || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/newsletter-db.ts
git commit -m "feat(newsletter): add scheduled status + scheduled_publish_at to campaign type (T000615)"
```

---

### Task A3: `sendCampaignById()` extrahieren

**Files:**
- Modify: `website/src/lib/newsletter-db.ts` (neue Funktion + benötigte Imports)

- [ ] **Step 1: Import von `sendNewsletterCampaign` oben in `newsletter-db.ts` ergänzen**

Nach den bestehenden Imports (`import pg from 'pg';` …) hinzufügen:

```typescript
import { sendNewsletterCampaign } from './email';
```

- [ ] **Step 2: `sendCampaignById()` ans Ende des Campaigns-Abschnitts (vor `// ── Send log ──`) einfügen**

Diese Funktion kapselt die Versand-Logik, die aktuell in `send.ts` inline steht (Subscriber laden, Ausgabe-Nummer berechnen, pro Subscriber senden + loggen, `markCampaignSent`). Sie nimmt KEINE Status-Transition vor (das macht der Cron-Endpunkt / die HTTP-Route über die Lock-Funktionen aus A4 bzw. den `status='sent'` über `markCampaignSent`):

```typescript
export async function sendCampaignById(campaignId: string): Promise<{
  success: boolean;
  recipientCount: number;
  error?: string;
}> {
  await ensureTables();
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return { success: false, recipientCount: 0, error: 'Kampagne nicht gefunden' };
  }
  const subscribers = await getConfirmedSubscribers();
  if (subscribers.length === 0) {
    return { success: false, recipientCount: 0, error: 'Keine bestätigten Abonnenten vorhanden' };
  }

  const prodDomain = process.env.PROD_DOMAIN || '';
  const baseUrl = prodDomain ? `https://web.${prodDomain}` : 'http://web.localhost';

  const sentCount = await countSentCampaigns();
  const ausgabe = String(sentCount + 1).padStart(2, '0');
  const renderedHtml = campaign.html_body.replace(/\{\{AUSGABE\}\}/g, ausgabe);

  let sent = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    const ok = await sendNewsletterCampaign({
      to: sub.email,
      subject: campaign.subject,
      html: renderedHtml,
      unsubscribeUrl,
    });
    await createSendLog({
      campaignId,
      subscriberId: sub.id,
      status: ok ? 'sent' : 'failed',
    });
    if (ok) sent++;
  }

  await markCampaignSent(campaignId, sent);
  return { success: true, recipientCount: sent };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'newsletter-db' || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/newsletter-db.ts
git commit -m "feat(newsletter): extract reusable sendCampaignById() (T000615)"
```

---

### Task A4: `updateCampaign()` erweitern + Status-Lock-Funktionen

**Files:**
- Modify: `website/src/lib/newsletter-db.ts`

- [ ] **Step 1: `updateCampaign()` ersetzen — `scheduled_publish_at` + Status-Transition zulassen**

Die bestehende `updateCampaign()` erlaubt nur `subject`/`html_body` und nur, wenn `status='draft'`. Sie wird ersetzt, um zusätzlich `scheduled_publish_at` und `status` (`draft` ↔ `scheduled`) zu setzen. Updates bleiben auf nicht-versendete Kampagnen beschränkt (`status IN ('draft','scheduled')`):

```typescript
export async function updateCampaign(
  id: string,
  params: {
    subject?: string;
    html_body?: string;
    scheduled_publish_at?: Date | null;
    status?: 'draft' | 'scheduled';
  }
): Promise<NewsletterCampaign | null> {
  if (
    params.subject === undefined &&
    params.html_body === undefined &&
    params.scheduled_publish_at === undefined &&
    params.status === undefined
  ) {
    return getCampaign(id);
  }
  await ensureTables();
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  if (params.subject !== undefined) {
    values.push(params.subject);
    sets.push(`subject = $${values.length}`);
  }
  if (params.html_body !== undefined) {
    values.push(params.html_body);
    sets.push(`html_body = $${values.length}`);
  }
  if (params.scheduled_publish_at !== undefined) {
    values.push(params.scheduled_publish_at);
    sets.push(`scheduled_publish_at = $${values.length}`);
  }
  if (params.status !== undefined) {
    values.push(params.status);
    sets.push(`status = $${values.length}`);
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE newsletter_campaigns SET ${sets.join(', ')}
     WHERE id = $${values.length} AND status IN ('draft', 'scheduled')
     RETURNING id, subject, html_body, status, scheduled_publish_at, sent_at, recipient_count, created_at, updated_at`,
    values
  );
  return result.rows[0] ?? null;
}
```

- [ ] **Step 2: Lock- und Cleanup-Funktionen ans Ende des Campaigns-Abschnitts einfügen**

Diese Funktionen kapseln die atomaren Status-Transitionen aus Spec 4.3 / ADR-2:

```typescript
// ── Scheduled publishing (Cron) ────────────────────────────────────────────────

/** IDs aller fälligen, noch nicht versendeten Kampagnen. */
export async function listDueCampaignIds(): Promise<string[]> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id FROM newsletter_campaigns
     WHERE status = 'scheduled' AND scheduled_publish_at <= now()
     ORDER BY scheduled_publish_at ASC`
  );
  return result.rows.map((r) => r.id as string);
}

/**
 * Atomarer Lock: setzt status='sending' NUR wenn die Kampagne noch 'scheduled'
 * und fällig ist. Liefert true, wenn dieser Aufruf den Lock erhalten hat.
 */
export async function lockDueCampaign(id: string): Promise<boolean> {
  await ensureTables();
  const result = await pool.query(
    `UPDATE newsletter_campaigns
     SET status = 'sending', updated_at = now()
     WHERE id = $1 AND status = 'scheduled' AND scheduled_publish_at <= now()
     RETURNING id`,
    [id]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Versand fehlgeschlagen → zurück auf 'scheduled' (Retry beim nächsten Lauf). */
export async function unlockCampaignToScheduled(id: string): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_campaigns
     SET status = 'scheduled', updated_at = now()
     WHERE id = $1 AND status = 'sending'`,
    [id]
  );
}

/** Stale 'sending'-Locks (Pod-Crash) nach 10 Minuten auf 'scheduled' zurücksetzen. */
export async function resetStaleSendingCampaigns(): Promise<number> {
  await ensureTables();
  const result = await pool.query(
    `UPDATE newsletter_campaigns
     SET status = 'scheduled', updated_at = now()
     WHERE status = 'sending' AND updated_at < now() - INTERVAL '10 minutes'
     RETURNING id`
  );
  return result.rowCount ?? 0;
}
```

> **Hinweis:** `sendCampaignById()` ruft am Ende `markCampaignSent()` auf, das `status='sent'` setzt — daher braucht der Erfolgsfall keine separate `finalize`-Funktion. Nur der Fehlerfall (`unlockCampaignToScheduled`) und der Stale-Cleanup brauchen eigene Queries.

- [ ] **Step 3: Typecheck**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'newsletter-db' || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/newsletter-db.ts
git commit -m "feat(newsletter): updateCampaign scheduling + atomic lock/cleanup queries (T000615)"
```

---

## Phase B: API-Endpunkte

### Task B1: PUT `/api/admin/newsletter/campaigns/[id]` — Scheduling-Validation

**Files:**
- Modify: `website/src/pages/api/admin/newsletter/campaigns/[id].ts`

- [ ] **Step 1: PUT-Handler ersetzen**

Body-Typ um `scheduled_publish_at` und `status` erweitern; Validation gemäß Spec 4.7 (Status `scheduled` erfordert ein zukünftiges Datum; `null` setzt zurück auf `draft`). Datum wird zu einem `Date` geparst, bevor es an `updateCampaign()` geht:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCampaign } from '../../../../../lib/newsletter-db';

interface UpdateCampaignBody {
  subject?: string;
  html_body?: string;
  scheduled_publish_at?: string | null;
  status?: 'draft' | 'scheduled';
}

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  let body: UpdateCampaignBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  // Validation: scheduled erfordert ein zukünftiges Datum.
  let scheduledAt: Date | null | undefined;
  if (body.scheduled_publish_at !== undefined) {
    if (body.scheduled_publish_at === null) {
      scheduledAt = null;
    } else {
      const dt = new Date(body.scheduled_publish_at);
      if (Number.isNaN(dt.getTime())) {
        return new Response(JSON.stringify({ error: 'Ungültiges Datum' }), { status: 400 });
      }
      if (dt <= new Date()) {
        return new Response(JSON.stringify({ error: 'Sendezeitpunkt muss in der Zukunft liegen' }), { status: 400 });
      }
      scheduledAt = dt;
    }
  }
  if (body.status === 'scheduled' && !(scheduledAt instanceof Date)) {
    return new Response(JSON.stringify({ error: 'scheduled_publish_at ist erforderlich' }), { status: 400 });
  }

  const updated = await updateCampaign(id, {
    subject: body.subject,
    html_body: body.html_body,
    scheduled_publish_at: scheduledAt,
    status: body.status,
  });
  if (!updated) {
    return new Response(JSON.stringify({ error: 'Kampagne nicht gefunden oder bereits versendet' }), { status: 403 });
  }
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'campaigns/\[id\].ts' || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add "website/src/pages/api/admin/newsletter/campaigns/[id].ts"
git commit -m "feat(newsletter): PUT campaign accepts scheduled_publish_at + status (T000615)"
```

---

### Task B2: POST `.../[id]/send` — Refactoring auf `sendCampaignById()`

**Files:**
- Modify: `website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts`

- [ ] **Step 1: send.ts auf die extrahierte Funktion umstellen**

Die inline-Versandlogik wird durch einen Aufruf von `sendCampaignById()` ersetzt. Die Status-Guards (`bereits versendet` → 409) bleiben in der Route:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getCampaign, sendCampaignById } from '../../../../../../lib/newsletter-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

  const campaign = await getCampaign(id);
  if (!campaign) {
    return new Response(JSON.stringify({ error: 'Kampagne nicht gefunden' }), { status: 404 });
  }
  if (campaign.status === 'sent') {
    return new Response(JSON.stringify({ error: 'Kampagne wurde bereits versendet' }), { status: 409 });
  }

  const result = await sendCampaignById(id);
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error ?? 'Versand fehlgeschlagen' }), { status: 400 });
  }
  return new Response(
    JSON.stringify({ ok: true, sent: result.recipientCount, total: result.recipientCount }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
```

> **Hinweis:** Das frühere Response-Feld `total` war die Anzahl aller Abonnenten. Da `sendCampaignById()` nur die erfolgreich versendeten zurückgibt, melden wir `total = recipientCount`. Die UI in Phase D zeigt nur noch `sent`.

- [ ] **Step 2: Typecheck**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'send.ts' || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add "website/src/pages/api/admin/newsletter/campaigns/[id]/send.ts"
git commit -m "refactor(newsletter): send route uses sendCampaignById() (T000615)"
```

---

### Task B3: NEU — GET `/api/cron/scheduled-publish`

**Files:**
- Create: `website/src/pages/api/cron/scheduled-publish.ts`

- [ ] **Step 1: Cron-Endpunkt anlegen**

Bearer-Auth (401 bei fehlendem/falschem Token), Stale-Cleanup, dann pro fälliger Kampagne: atomarer Lock → `sendCampaignById()` → bei Fehler `unlockCampaignToScheduled()`. Antwort `{ processed, sent, errors }`:

```typescript
// website/src/pages/api/cron/scheduled-publish.ts
// Called by K8s CronJob every 5 minutes. Sends all due scheduled newsletter campaigns.
import type { APIRoute } from 'astro';
import {
  listDueCampaignIds,
  lockDueCampaign,
  unlockCampaignToScheduled,
  resetStaleSendingCampaigns,
  sendCampaignById,
} from '../../../lib/newsletter-db';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

export const GET: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Stale 'sending'-Locks (Pod-Crash) zuerst aufräumen.
    const reset = await resetStaleSendingCampaigns();
    if (reset > 0) console.log(`[scheduled-publish] reset ${reset} stale sending campaigns`);

    const dueIds = await listDueCampaignIds();
    let processed = 0;
    let sent = 0;
    const errors: { id: string; error: string }[] = [];

    for (const id of dueIds) {
      // Atomarer Lock — überspringt Kampagnen, die ein paralleler Lauf schon hält.
      const locked = await lockDueCampaign(id);
      if (!locked) continue;
      processed++;
      try {
        const result = await sendCampaignById(id);
        if (result.success) {
          sent++;
        } else {
          await unlockCampaignToScheduled(id);
          errors.push({ id, error: result.error ?? 'Versand fehlgeschlagen' });
        }
      } catch (err) {
        await unlockCampaignToScheduled(id);
        errors.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    console.log(`[scheduled-publish] processed=${processed} sent=${sent} errors=${errors.length}`);
    return new Response(JSON.stringify({ processed, sent, errors }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[scheduled-publish]', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
```

- [ ] **Step 2: Typecheck**

Run: `cd website && npx tsc --noEmit 2>&1 | grep -i 'scheduled-publish' || echo "clean"`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/cron/scheduled-publish.ts
git commit -m "feat(newsletter): cron endpoint /api/cron/scheduled-publish (T000615)"
```

---

## Phase C: Kubernetes CronJob

### Task C1: NEU — `k3d/cronjob-scheduled-publish.yaml`

**Files:**
- Create: `k3d/cronjob-scheduled-publish.yaml`

- [ ] **Step 1: Manifest anlegen** (modelliert nach `k3d/notify-unread-cronjob.yaml`; GET-Aufruf, 5-Min-Schedule, `timeZone`, `concurrencyPolicy: Forbid`)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: scheduled-publish
  namespace: workspace
  labels:
    app: cronjobs
spec:
  schedule: "*/5 * * * *"
  timeZone: "Europe/Berlin"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          securityContext:
            runAsNonRoot: true
            runAsUser: 65534
            seccompProfile:
              type: RuntimeDefault
          containers:
            - name: publish
              image: curlimages/curl:8.7.1
              securityContext:
                allowPrivilegeEscalation: false
                runAsNonRoot: true
                runAsUser: 65534
                capabilities:
                  drop: ["ALL"]
              command:
                - sh
                - -c
                - |
                  curl -sf -X GET \
                    -H "Authorization: Bearer $CRON_SECRET" \
                    http://website.website.svc.cluster.local/api/cron/scheduled-publish
              resources:
                requests:
                  cpu: 10m
                  memory: 32Mi
                limits:
                  memory: 64Mi
              env:
                - name: CRON_SECRET
                  valueFrom:
                    secretKeyRef:
                      name: workspace-secrets
                      key: CRON_SECRET
```

- [ ] **Step 2: Commit**

```bash
git add k3d/cronjob-scheduled-publish.yaml
git commit -m "feat(infra): scheduled-publish CronJob manifest (T000615)"
```

---

### Task C2: `k3d/kustomization.yaml` — resources-Eintrag

**Files:**
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Eintrag direkt nach der `notify-unread-cronjob.yaml`-Zeile hinzufügen**

Finde die Zeile `  - notify-unread-cronjob.yaml` und füge darunter ein:

```yaml
  - cronjob-scheduled-publish.yaml
```

- [ ] **Step 2: Kustomize-Build verifizieren**

Run: `cd /tmp/wt-T000615-scheduled-publish && kubectl kustomize k3d --load-restrictor=LoadRestrictionsNone | grep -A2 'name: scheduled-publish'`
Expected: Der CronJob `scheduled-publish` taucht in der gerenderten Ausgabe auf.

- [ ] **Step 3: Commit**

```bash
git add k3d/kustomization.yaml
git commit -m "feat(infra): register scheduled-publish CronJob in base kustomization (T000615)"
```

---

### Task C3: `prod-korczewski/patch-cronjob-urls.yaml` — korczewski URL-Patch

**Files:**
- Modify: `prod-korczewski/patch-cronjob-urls.yaml`

- [ ] **Step 1: Patch-Eintrag ans Ende der Datei anhängen** (nach dem letzten `---`-Block; ruft den korczewski-lokalen Service auf)

```yaml
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: scheduled-publish
  namespace: workspace
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: publish
              command:
                - sh
                - -c
                - |
                  curl -sf -X GET \
                    -H "Authorization: Bearer $CRON_SECRET" \
                    http://website.website-korczewski.svc.cluster.local/api/cron/scheduled-publish
```

- [ ] **Step 2: Verifizieren, dass der Patch greift** (sofern `prod-korczewski` als Overlay buildbar ist)

Run: `cd /tmp/wt-T000615-scheduled-publish && grep -c 'name: scheduled-publish' prod-korczewski/patch-cronjob-urls.yaml`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add prod-korczewski/patch-cronjob-urls.yaml
git commit -m "feat(infra): korczewski URL patch for scheduled-publish CronJob (T000615)"
```

---

## Phase D: Admin-UI

### Task D1: Datetime-Picker im Compose-Tab

**Files:**
- Modify: `website/src/components/admin/NewsletterAdmin.svelte`

- [ ] **Step 1: State-Variablen + lokale Campaign-Typ-Erweiterung**

Im `<script>`-Block bei den anderen Compose-State-Deklarationen (`let composeSubject = $state('')` …) ergänzen:

```typescript
  let scheduleEnabled = $state(false);
  let scheduleAt = $state(''); // datetime-local Wert (lokale Zeit)
```

Im lokalen Campaign-Interface (aktuell `status: 'draft' | 'sent';` mit `sent_at`) den Typ auf
`status: 'draft' | 'scheduled' | 'sent';` ändern und das Feld `scheduled_publish_at: string | null;` ergänzen.

- [ ] **Step 2: UI-Block im Compose-Tab einfügen** (oberhalb des bestehenden "Senden"-Buttons im Compose-Tab)

```svelte
  <div class="flex items-center gap-2 mb-3">
    <input type="checkbox" id="schedule-toggle" bind:checked={scheduleEnabled}
      class="accent-gold" />
    <label for="schedule-toggle" class="text-sm text-light">Geplant senden</label>
    {#if scheduleEnabled}
      <input type="datetime-local" bind:value={scheduleAt}
        class="ml-2 px-2 py-1 bg-dark-light border border-dark-lighter rounded text-sm text-light" />
    {/if}
  </div>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter-ui): scheduled-send datetime picker in compose tab (T000615)"
```

---

### Task D2: UI-Validation + Scheduling-Aktion

**Files:**
- Modify: `website/src/components/admin/NewsletterAdmin.svelte`

- [ ] **Step 1: Scheduling-Funktion hinzufügen** (im `<script>`-Block, neben der bestehenden Sende-Funktion)

Validiert ≥ jetzt + 5 Minuten, speichert ggf. erst einen Draft, schickt dann das PUT mit `status: 'scheduled'`:

```typescript
  async function scheduleCampaign() {
    if (!composeSubject.trim() || !composeHtml.trim()) {
      composeMsg = 'Betreff und Inhalt sind erforderlich.'; return;
    }
    if (!scheduleAt) {
      composeMsg = 'Bitte ein Sendedatum wählen.'; return;
    }
    const when = new Date(scheduleAt);
    const minTime = new Date(Date.now() + 5 * 60 * 1000);
    if (Number.isNaN(when.getTime()) || when < minTime) {
      composeMsg = 'Der Sendezeitpunkt muss mindestens 5 Minuten in der Zukunft liegen.'; return;
    }
    // Erst sicherstellen, dass ein Draft existiert.
    if (!composeDraftId) {
      const createRes = await fetch('/api/admin/newsletter/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: composeSubject, html_body: composeHtml }),
      });
      if (!createRes.ok) { composeMsg = 'Fehler beim Speichern.'; return; }
      composeDraftId = (await createRes.json()).id;
    }
    const res = await fetch(`/api/admin/newsletter/campaigns/${composeDraftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: composeSubject,
        html_body: composeHtml,
        scheduled_publish_at: when.toISOString(),
        status: 'scheduled',
      }),
    });
    if (res.ok) {
      composeMsg = `Geplant für ${when.toLocaleString('de-DE')}.`;
      composeSubject = ''; composeHtml = ''; composeDraftId = null;
      scheduleEnabled = false; scheduleAt = '';
      loadCampaigns();
    } else {
      composeMsg = (await res.json()).error ?? 'Fehler beim Planen.';
    }
  }
```

> **Hinweis:** Falls die Campaign-Liste über einen anders benannten Loader geladen wird (z. B. `loadCampaigns`/`fetchCampaigns`), den im File vorhandenen Namen verwenden.

- [ ] **Step 2: Sende-Button verzweigen** — wenn `scheduleEnabled`, ruft der Button `scheduleCampaign()` statt der Sofort-Sende-Funktion auf. Den bestehenden Senden-Button im Compose-Tab so anpassen:

```svelte
  <button onclick={() => scheduleEnabled ? scheduleCampaign() : sendCampaign()}
    class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80">
    {scheduleEnabled ? 'Versand planen' : 'Senden'}
  </button>
```

(Den realen Funktionsnamen der Sofort-Sende-Aktion und das reale Button-Markup aus dem File übernehmen.)

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter-ui): validate + submit scheduled campaign (T000615)"
```

---

### Task D3: Status-Badge in der Kampagnenliste

**Files:**
- Modify: `website/src/components/admin/NewsletterAdmin.svelte`

- [ ] **Step 1: `statusBadge()` um `scheduled` erweitern**

Die aktuelle Funktion mappt `sent` auf blau. Spec verlangt: `draft`=grau, `scheduled`=blau, `sent`=grün. `statusBadge()` ersetzen durch:

```typescript
  function statusBadge(s: string): string {
    if (s === 'confirmed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'pending')   return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    if (s === 'sent')      return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'scheduled') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-dark-lighter text-muted border-dark-lighter';
  }
```

- [ ] **Step 2: Relatives Datum bei `scheduled` Helper hinzufügen**

```typescript
  function relativeSchedule(iso: string | null): string {
    if (!iso) return '';
    const diffMs = new Date(iso).getTime() - Date.now();
    if (diffMs <= 0) return 'fällig';
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `in ${mins} Min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `in ${hours} Std`;
    return `in ${Math.round(hours / 24)} Tagen`;
  }
```

- [ ] **Step 3: Im Kampagnen-`{#each campaigns as c}`-Block das relative Datum bei `scheduled` anzeigen**

Neben dem bestehenden Status-`<span>` (das `{c.status}` rendert) ergänzen:

```svelte
            {#if c.status === 'scheduled'}
              <span class="text-xs text-blue-300">{relativeSchedule(c.scheduled_publish_at)}</span>
            {/if}
```

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter-ui): scheduled status badge + relative date (T000615)"
```

---

### Task D4: "Planung aufheben"-Button

**Files:**
- Modify: `website/src/components/admin/NewsletterAdmin.svelte`

- [ ] **Step 1: Unschedule-Funktion hinzufügen** (im `<script>`-Block)

```typescript
  async function unschedule(id: string) {
    const res = await fetch(`/api/admin/newsletter/campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_publish_at: null, status: 'draft' }),
    });
    if (res.ok) loadCampaigns();
  }
```

(Realen Campaign-Loader-Namen verwenden, vgl. D2.)

- [ ] **Step 2: Button im Kampagnen-`{#each}`-Block nur bei `scheduled` zeigen**

Neben dem bestehenden "Als Vorlage"-Button ergänzen:

```svelte
            {#if c.status === 'scheduled'}
              <button onclick={() => unschedule(c.id)} class="text-xs text-muted hover:text-red-400 transition-colors">Planung aufheben</button>
            {/if}
```

- [ ] **Step 3: Typecheck der gesamten Svelte-Änderungen**

Run: `cd website && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i 'NewsletterAdmin' || echo "clean"`
Expected: `clean` (oder keine NEUEN Fehler ggü. main)

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter-ui): unschedule (Planung aufheben) button (T000615)"
```

---

## Phase E: Tests

### Task E1: NEU — `tests/unit/newsletter-scheduled-publish.bats`

**Files:**
- Create: `tests/unit/newsletter-scheduled-publish.bats`

- [ ] **Step 1: Offline-BATS-Test schreiben** (prüft CronJob-Manifest-Struktur + Endpunkt-Quelltext-Invarianten; keine Live-DB nötig, modelliert nach `tests/unit/knowledge-ingest-manifest.bats`)

```bash
#!/usr/bin/env bats

load test_helper

setup_file() {
  export RENDERED="${BATS_FILE_TMPDIR}/rendered.yaml"
  kubectl kustomize "${PROJECT_DIR}/k3d" --load-restrictor=LoadRestrictionsNone > "$RENDERED" 2>&1
  export ENDPOINT="${PROJECT_DIR}/website/src/pages/api/cron/scheduled-publish.ts"
  export DB="${PROJECT_DIR}/website/src/lib/newsletter-db.ts"
}

@test "scheduled-publish CronJob is registered in base kustomization" {
  run grep -F "name: scheduled-publish" "$RENDERED"
  assert_success
}

@test "scheduled-publish CronJob runs every 5 minutes in Europe/Berlin" {
  run grep -F 'schedule: "*/5 * * * *"' "$RENDERED"
  assert_success
  run grep -F 'timeZone: "Europe/Berlin"' "$RENDERED"
  assert_success
}

@test "scheduled-publish CronJob uses Forbid concurrency (no double-send)" {
  run grep -F "concurrencyPolicy: Forbid" "$RENDERED"
  assert_success
}

@test "cron endpoint requires Bearer auth and returns 401 on mismatch" {
  run grep -F "status: 401" "$ENDPOINT"
  assert_success
  run grep -F 'Bearer ${CRON_SECRET}' "$ENDPOINT"
  assert_success
}

@test "lock query is atomic: status='scheduled' guarded UPDATE" {
  run grep -F "WHERE id = \$1 AND status = 'scheduled' AND scheduled_publish_at <= now()" "$DB"
  assert_success
}

@test "stale sending locks are reset after 10 minutes" {
  run grep -F "INTERVAL '10 minutes'" "$DB"
  assert_success
}

@test "korczewski patch points scheduled-publish at its own namespace" {
  run grep -F "website.website-korczewski.svc.cluster.local/api/cron/scheduled-publish" \
    "${PROJECT_DIR}/prod-korczewski/patch-cronjob-urls.yaml"
  assert_success
}
```

> **Hinweis:** Falls `assert_success`/`load test_helper` in diesem Verzeichnis anders heißen, das in benachbarten `tests/unit/*manifest*.bats` verwendete Muster spiegeln (dort `load test_helper` + `assert_success`).

- [ ] **Step 2: Test ausführen**

Run: `cd /tmp/wt-T000615-scheduled-publish && bats tests/unit/newsletter-scheduled-publish.bats`
Expected: alle Tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/newsletter-scheduled-publish.bats
git commit -m "test(newsletter): offline bats for scheduled-publish cron + manifests (T000615)"
```

---

### Task E2: Test-Inventory aktualisieren

**Files:**
- Modify: `website/src/data/test-inventory.json`

- [ ] **Step 1: Inventory regenerieren**

Run: `cd /tmp/wt-T000615-scheduled-publish && task test:inventory`
Expected: `website/src/data/test-inventory.json` enthält jetzt den neuen Test.

- [ ] **Step 2: Verifizieren, dass der neue Test im Inventory steht**

Run: `cd /tmp/wt-T000615-scheduled-publish && grep -c 'newsletter-scheduled-publish' website/src/data/test-inventory.json`
Expected: `>= 1`

- [ ] **Step 3: Commit**

```bash
git add website/src/data/test-inventory.json
git commit -m "test(inventory): register newsletter-scheduled-publish bats (T000615)"
```

---

## Verification

### Task V1: Kustomize-Manifeste validieren

- [ ] **Step 1: Validate**

Run: `cd /tmp/wt-T000615-scheduled-publish && task workspace:validate`
Expected: kein Fehler; CronJob `scheduled-publish` wird sauber gerendert.

### Task V2: Vollständige Offline-Tests

- [ ] **Step 1: Alle Offline-Tests**

Run: `cd /tmp/wt-T000615-scheduled-publish && task test:all`
Expected: PASS — inkl. `test:factory`, `test:inventory`-Diff-Check (Inventory committed) und der neuen `newsletter-scheduled-publish.bats`.

- [ ] **Step 2: TypeScript-Gesamtcheck der Website**

Run: `cd /tmp/wt-T000615-scheduled-publish/website && npx tsc --noEmit`
Expected: keine NEUEN Fehler ggü. `main`.

---

## Self-Review Notes

- **Spec-Coverage:** Schema-Migration (A1), Typ (A2), Send-Refactor (A3/B2), atomarer Lock + Retry + Stale-Cleanup (A4/B3), Update-API + Validation (B1), Cron-Endpunkt (B3), CronJob + kustomization + korczewski-Patch (C1–C3), Datetime-Picker + UI-Validation + Badge + Unschedule (D1–D4), BATS + Inventory (E1–E2), Validate + test:all (V1–V2). Alle Spec-Abschnitte 4.1–4.7 sind abgedeckt.
- **Auth-Abweichung dokumentiert:** GET + 401 (Spec) statt POST + 403 (bestehendes `notify-unread`-Muster) — bewusst, weil Test-Plan 8 `401` fordert; CronJob ruft entsprechend mit `-X GET` auf.
- **Typkonsistenz:** Funktionsnamen `sendCampaignById`, `lockDueCampaign`, `unlockCampaignToScheduled`, `resetStaleSendingCampaigns`, `listDueCampaignIds` werden in A3/A4 definiert und in B3 identisch verwendet. `markCampaignSent` (bestehend) setzt den Erfolgs-Status, daher keine zusätzliche `finalize`-Funktion.
