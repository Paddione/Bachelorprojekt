# DocuSeal + Dokumenteneditor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate DocuSeal for e-signatures, allow admins to create contract templates in a renamed "Dokumenteneditor", assign contracts to clients, and let clients sign via their "Unterschriften" portal tab.

**Architecture:** DocuSeal runs as a K8s Deployment on `sign.localhost`. Contract templates are stored in a new `document_templates` PostgreSQL table. When an admin assigns a template to a client, the backend creates a DocuSeal submission via REST API and stores the `embed_src` URL. The client's Unterschriften tab embeds the DocuSeal signing iframe. Webhooks update assignment status on completion. The existing Newsletter page is renamed to "Dokumenteneditor" and gains a new "Vertragsvorlagen" tab; newsletter-subscriber management moves to the individual client detail page.

**Tech Stack:** Astro 5.7 (SSR), Svelte 5 (reactive components), PostgreSQL 16 (pg pool, schema in ConfigMap), DocuSeal REST API (self-hosted), Kubernetes/Kustomize, Traefik ingress, TypeScript.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `k3d/docuseal.yaml` | **Create** | DocuSeal Deployment, Service, PVC |
| `k3d/configmap-domains.yaml` | **Modify** | Add `SIGN_DOMAIN: "sign.localhost"` |
| `k3d/ingress.yaml` | **Modify** | Add `sign.localhost` Traefik rule |
| `k3d/secrets.yaml` | **Modify** | Add `DOCUSEAL_SECRET_KEY_BASE`, `DOCUSEAL_API_TOKEN`, `DOCUSEAL_DB_PASSWORD` dev values |
| `k3d/website-schema.yaml` | **Modify** | Add `document_templates` + `document_assignments` tables |
| `k3d/kustomization.yaml` | **Modify** | Add `docuseal.yaml` to resources list |
| `website/src/lib/docuseal.ts` | **Create** | DocuSeal REST API client wrapper |
| `website/src/lib/documents-db.ts` | **Create** | DB functions for templates + assignments |
| `website/src/pages/api/admin/documents/templates/index.ts` | **Create** | GET list + POST create template |
| `website/src/pages/api/admin/documents/templates/[id].ts` | **Create** | GET + PUT + DELETE single template |
| `website/src/pages/api/admin/documents/assign.ts` | **Create** | POST assign template to client (creates DocuSeal submission) |
| `website/src/pages/api/admin/documents/assignments.ts` | **Create** | GET assignments for a client |
| `website/src/pages/api/webhooks/docuseal.ts` | **Create** | POST DocuSeal completion webhook |
| `website/src/pages/api/admin/clients/newsletter-toggle.ts` | **Create** | POST toggle newsletter subscription for a client |
| `website/src/pages/admin/dokumente.astro` | **Create** | Renamed newsletter page (Dokumenteneditor) |
| `website/src/pages/admin/newsletter.astro` | **Modify** | Redirect to `/admin/dokumente` |
| `website/src/components/admin/DokumentEditor.svelte` | **Create** | Multipurpose editor (Newsletter tabs + Vertragsvorlagen tab) |
| `website/src/components/admin/NewsletterAdmin.svelte` | **Keep** | Unchanged (kept, re-exported from DokumentEditor) |
| `website/src/pages/admin/[clientId].astro` | **Modify** | Add newsletter checkbox + contract assignment dropdown (new `ClientContractsPanel` Svelte component) |
| `website/src/components/admin/ClientContractsPanel.svelte` | **Create** | Svelte panel: newsletter toggle + assign contract dropdown |
| `website/src/components/portal/SignaturesTab.astro` | **Modify** | Add DocuSeal assignments section (pending + completed) |
| `website/src/pages/portal.astro` | **Modify** | Include DocuSeal pending count in `pendingSignatures` badge |
| `website/src/layouts/AdminLayout.astro` | **Modify** | Rename nav entry Newsletter → Dokumenteneditor with new route |

---

## Task 1: DocuSeal Kubernetes Deployment

**Files:**
- Create: `k3d/docuseal.yaml`
- Modify: `k3d/kustomization.yaml`
- Modify: `k3d/configmap-domains.yaml`
- Modify: `k3d/ingress.yaml`
- Modify: `k3d/secrets.yaml`

- [ ] **Step 1.1: Add DocuSeal secrets to `k3d/secrets.yaml`**

In `k3d/secrets.yaml`, under the first Secret's `stringData:` block, add after the `STRIPE_SECRET_KEY` line:

```yaml
  DOCUSEAL_SECRET_KEY_BASE: "devsecretkeybasedocuseal32charsmin1"
  DOCUSEAL_API_TOKEN: "devdocusealapitoken"
  DOCUSEAL_DB_PASSWORD: "devdocusealdb"
```

- [ ] **Step 1.2: Add `SIGN_DOMAIN` to `k3d/configmap-domains.yaml`**

Append after the `AI_DOMAIN` line:

```yaml
  SIGN_DOMAIN: "sign.localhost"
```

- [ ] **Step 1.3: Create `k3d/docuseal.yaml`**

```yaml
# ═══════════════════════════════════════════════════════════════════
# DocuSeal — self-hosted e-signature platform
# Web UI + API at sign.localhost; database on shared PostgreSQL
# ═══════════════════════════════════════════════════════════════════
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: docuseal-data-pvc
spec:
  storageClassName: local-path
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 2Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: docuseal
  labels:
    app: docuseal
spec:
  replicas: 1
  selector:
    matchLabels:
      app: docuseal
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: docuseal
    spec:
      securityContext:
        runAsNonRoot: false
        fsGroup: 1000
      containers:
        - name: docuseal
          image: docuseal/docuseal:1.9.6
          imagePullPolicy: IfNotPresent
          env:
            - name: DOCUSEAL_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: DOCUSEAL_DB_PASSWORD
            - name: DATABASE_URL
              value: "postgresql://docuseal:$(DOCUSEAL_DB_PASSWORD)@shared-db:5432/docuseal"
            - name: SECRET_KEY_BASE
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: DOCUSEAL_SECRET_KEY_BASE
            - name: DOCUSEAL_URL
              value: "http://sign.localhost"
            - name: SIGN_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: SIGN_DOMAIN
            - name: SMTP_ADDRESS
              value: "mailpit"
            - name: SMTP_PORT
              value: "1025"
            - name: SMTP_DOMAIN
              value: "sign.localhost"
            - name: SMTP_USERNAME
              value: ""
            - name: SMTP_PASSWORD
              value: ""
            - name: SMTP_AUTH_METHOD
              value: "none"
            - name: SMTP_ENABLE_STARTTLS_AUTO
              value: "false"
            - name: MAILER_FROM_EMAIL
              value: "sign@workspace.local"
            - name: MAILER_FROM_NAME
              value: "Unterschriften"
            - name: RAILS_SERVE_STATIC_FILES
              value: "true"
            - name: FORCE_SSL
              value: "false"
            - name: TZ
              value: Europe/Berlin
          ports:
            - containerPort: 3000
          volumeMounts:
            - name: data
              mountPath: /data
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 5
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 60
            periodSeconds: 30
          resources:
            requests:
              memory: 256Mi
              cpu: "100m"
            limits:
              memory: 1Gi
              cpu: "500m"
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: docuseal-data-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: docuseal
spec:
  selector:
    app: docuseal
  ports:
    - port: 3000
      targetPort: 3000
```

- [ ] **Step 1.4: Add DocuSeal database init to `k3d/shared-db.yaml`**

Find the `init-databases.sh` ConfigMap in `k3d/shared-db.yaml`. Add the following line in the `psql` block where other databases are created (e.g. after the vaultwarden database line):

```bash
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-'EOSQL'
      CREATE USER docuseal WITH PASSWORD 'devdocusealdb';
      CREATE DATABASE docuseal OWNER docuseal;
      GRANT ALL PRIVILEGES ON DATABASE docuseal TO docuseal;
    EOSQL
```

- [ ] **Step 1.5: Add `sign.localhost` to `k3d/ingress.yaml`**

In `k3d/ingress.yaml`, inside the first Ingress (`workspace-ingress`), add before the closing of the `rules:` list (after the `vault.localhost` block):

```yaml
    - host: sign.localhost
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: docuseal
                port:
                  number: 3000
```

- [ ] **Step 1.6: Add `docuseal.yaml` to `k3d/kustomization.yaml`**

In `k3d/kustomization.yaml`, after the `- vaultwarden.yaml` line, add:

```yaml
  # E-Signatur
  - docuseal.yaml
```

- [ ] **Step 1.7: Validate manifests**

```bash
task workspace:validate
```

Expected: `kustomize build` exits 0, `kubeconform` reports no errors.

- [ ] **Step 1.8: Commit**

```bash
git add k3d/docuseal.yaml k3d/kustomization.yaml k3d/configmap-domains.yaml k3d/ingress.yaml k3d/secrets.yaml k3d/shared-db.yaml
git commit -m "feat(infra): add DocuSeal e-signature service to k3d cluster"
```

---

## Task 2: Database Schema Additions

**Files:**
- Modify: `k3d/website-schema.yaml`

- [ ] **Step 2.1: Add tables to `k3d/website-schema.yaml`**

In `k3d/website-schema.yaml`, inside the `psql` heredoc (before the `GRANT ALL` statements at the end), add:

```sql
      -- ── DocuSeal Document System ──────────────────────────────────

      -- Contract templates created in the Dokumenteneditor
      CREATE TABLE IF NOT EXISTS document_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        html_body TEXT NOT NULL,
        docuseal_template_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Assignments: admin assigns a template to a client
      CREATE TABLE IF NOT EXISTS document_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
        docuseal_submission_slug TEXT,
        docuseal_embed_src TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'completed', 'expired')),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        signed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_doc_assignments_customer ON document_assignments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_doc_assignments_status ON document_assignments(status);
```

- [ ] **Step 2.2: Verify schema syntax by checking YAML lint**

```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' k3d/website-schema.yaml
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add k3d/website-schema.yaml
git commit -m "feat(db): add document_templates and document_assignments tables"
```

---

## Task 3: DocuSeal API Client Library

**Files:**
- Create: `website/src/lib/docuseal.ts`

- [ ] **Step 3.1: Create `website/src/lib/docuseal.ts`**

```typescript
// DocuSeal REST API client.
// Internal URL for server-side calls (K8s service DNS).
// All functions throw on non-2xx responses.

const BASE_URL = (process.env.DOCUSEAL_INTERNAL_URL ?? 'http://docuseal.workspace.svc.cluster.local:3000').replace(/\/$/, '');
const API_TOKEN = process.env.DOCUSEAL_API_TOKEN ?? '';

async function ds(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      'X-Auth-Token': API_TOKEN,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DocuSeal ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res;
}

export interface DocuSealSubmitter {
  id: number;
  slug: string;
  email: string;
  embed_src: string;
  completed_at: string | null;
}

export interface DocuSealSubmission {
  id: number;
  submitters: DocuSealSubmitter[];
}

/** Create an HTML-based template in DocuSeal. Returns the DocuSeal template ID. */
export async function createTemplate(name: string, html: string): Promise<number> {
  const res = await ds('/templates/html', {
    method: 'POST',
    body: JSON.stringify({ name, html }),
  });
  const data = await res.json() as { id: number };
  return data.id;
}

/** Create a submission for an existing template. Returns first submitter details. */
export async function createSubmission(params: {
  templateId: number;
  submitterEmail: string;
  submitterName: string;
}): Promise<DocuSealSubmitter> {
  const res = await ds('/submissions', {
    method: 'POST',
    body: JSON.stringify({
      template_id: params.templateId,
      submitters: [
        {
          role: 'First Party',
          email: params.submitterEmail,
          name: params.submitterName,
          send_email: true,
        },
      ],
    }),
  });
  const data = await res.json() as DocuSealSubmitter[];
  if (!data[0]) throw new Error('DocuSeal returned no submitters');
  return data[0];
}

/** Fetch a submission by slug to check completion status. */
export async function getSubmitterBySlug(slug: string): Promise<DocuSealSubmitter> {
  const res = await ds(`/submitters/${slug}`);
  return res.json() as Promise<DocuSealSubmitter>;
}
```

- [ ] **Step 3.2: Add env vars to website deployment**

In `k3d/website.yaml`, inside the `env:` section of the website container, add:

```yaml
            - name: DOCUSEAL_API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: DOCUSEAL_API_TOKEN
            - name: DOCUSEAL_INTERNAL_URL
              value: "http://docuseal.workspace.svc.cluster.local:3000"
```

- [ ] **Step 3.3: Validate manifests**

```bash
task workspace:validate
```

Expected: exits 0.

- [ ] **Step 3.4: Commit**

```bash
git add website/src/lib/docuseal.ts k3d/website.yaml
git commit -m "feat(lib): add DocuSeal REST API client + website env vars"
```

---

## Task 4: Document Templates & Assignments DB Functions

**Files:**
- Create: `website/src/lib/documents-db.ts`

- [ ] **Step 4.1: Create `website/src/lib/documents-db.ts`**

```typescript
import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig,
);

export interface DocumentTemplate {
  id: string;
  title: string;
  html_body: string;
  docuseal_template_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentAssignment {
  id: string;
  customer_id: string;
  template_id: string;
  template_title: string;
  docuseal_submission_slug: string | null;
  docuseal_embed_src: string | null;
  status: 'pending' | 'completed' | 'expired';
  assigned_at: string;
  signed_at: string | null;
}

// ── Templates ─────────────────────────────────────────────────────

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  const r = await pool.query(
    `SELECT id, title, html_body, docuseal_template_id, created_at, updated_at
     FROM document_templates ORDER BY created_at DESC`,
  );
  return r.rows;
}

export async function getDocumentTemplate(id: string): Promise<DocumentTemplate | null> {
  const r = await pool.query(
    `SELECT id, title, html_body, docuseal_template_id, created_at, updated_at
     FROM document_templates WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function createDocumentTemplate(params: {
  title: string;
  html_body: string;
}): Promise<DocumentTemplate> {
  const r = await pool.query(
    `INSERT INTO document_templates (title, html_body)
     VALUES ($1, $2)
     RETURNING id, title, html_body, docuseal_template_id, created_at, updated_at`,
    [params.title, params.html_body],
  );
  return r.rows[0];
}

export async function updateDocumentTemplate(
  id: string,
  params: { title?: string; html_body?: string; docuseal_template_id?: number },
): Promise<DocumentTemplate | null> {
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.html_body !== undefined) { vals.push(params.html_body); sets.push(`html_body = $${vals.length}`); }
  if (params.docuseal_template_id !== undefined) { vals.push(params.docuseal_template_id); sets.push(`docuseal_template_id = $${vals.length}`); }
  vals.push(id);
  const r = await pool.query(
    `UPDATE document_templates SET ${sets.join(', ')}
     WHERE id = $${vals.length}
     RETURNING id, title, html_body, docuseal_template_id, created_at, updated_at`,
    vals,
  );
  return r.rows[0] ?? null;
}

export async function deleteDocumentTemplate(id: string): Promise<void> {
  await pool.query(`DELETE FROM document_templates WHERE id = $1`, [id]);
}

// ── Assignments ───────────────────────────────────────────────────

export async function createDocumentAssignment(params: {
  customerId: string;
  templateId: string;
  submissionSlug: string;
  embedSrc: string;
}): Promise<DocumentAssignment> {
  const r = await pool.query(
    `INSERT INTO document_assignments
       (customer_id, template_id, docuseal_submission_slug, docuseal_embed_src)
     VALUES ($1, $2, $3, $4)
     RETURNING id, customer_id, template_id, docuseal_submission_slug,
               docuseal_embed_src, status, assigned_at, signed_at`,
    [params.customerId, params.templateId, params.submissionSlug, params.embedSrc],
  );
  // fetch title for the returned object
  const row = r.rows[0];
  const tpl = await getDocumentTemplate(row.template_id);
  return { ...row, template_title: tpl?.title ?? '' };
}

export async function listAssignmentsForCustomer(customerId: string): Promise<DocumentAssignment[]> {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.template_id, t.title AS template_title,
            a.docuseal_submission_slug, a.docuseal_embed_src, a.status,
            a.assigned_at, a.signed_at
     FROM document_assignments a
     JOIN document_templates t ON t.id = a.template_id
     WHERE a.customer_id = $1
     ORDER BY a.assigned_at DESC`,
    [customerId],
  );
  return r.rows;
}

export async function markAssignmentCompleted(slug: string): Promise<void> {
  await pool.query(
    `UPDATE document_assignments
     SET status = 'completed', signed_at = now()
     WHERE docuseal_submission_slug = $1`,
    [slug],
  );
}

export async function countPendingAssignmentsForCustomer(customerId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int FROM document_assignments
     WHERE customer_id = $1 AND status = 'pending'`,
    [customerId],
  );
  return r.rows[0]?.count ?? 0;
}
```

- [ ] **Step 4.2: Commit**

```bash
git add website/src/lib/documents-db.ts
git commit -m "feat(db): add documents-db.ts with template + assignment CRUD"
```

---

## Task 5: API Routes — Document Templates

**Files:**
- Create: `website/src/pages/api/admin/documents/templates/index.ts`
- Create: `website/src/pages/api/admin/documents/templates/[id].ts`

- [ ] **Step 5.1: Create `website/src/pages/api/admin/documents/templates/index.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listDocumentTemplates, createDocumentTemplate } from '../../../../../lib/documents-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const templates = await listDocumentTemplates();
  return new Response(JSON.stringify(templates), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { title?: string; html_body?: string };
  if (!body.title?.trim() || !body.html_body?.trim()) {
    return new Response(JSON.stringify({ error: 'Titel und Inhalt sind erforderlich.' }), { status: 400 });
  }
  const template = await createDocumentTemplate({ title: body.title.trim(), html_body: body.html_body.trim() });
  return new Response(JSON.stringify(template), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 5.2: Create `website/src/pages/api/admin/documents/templates/[id].ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  getDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from '../../../../../lib/documents-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const template = await getDocumentTemplate(params.id!);
  if (!template) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(template), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const body = await request.json() as { title?: string; html_body?: string };
  const updated = await updateDocumentTemplate(params.id!, body);
  if (!updated) return new Response('Not found', { status: 404 });
  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await deleteDocumentTemplate(params.id!);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 5.3: Commit**

```bash
git add website/src/pages/api/admin/documents/
git commit -m "feat(api): add document templates CRUD endpoints"
```

---

## Task 6: API Routes — Assignments & Webhook

**Files:**
- Create: `website/src/pages/api/admin/documents/assign.ts`
- Create: `website/src/pages/api/admin/documents/assignments.ts`
- Create: `website/src/pages/api/webhooks/docuseal.ts`

- [ ] **Step 6.1: Create `website/src/pages/api/admin/documents/assign.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getDocumentTemplate, createDocumentAssignment } from '../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { createTemplate, createSubmission } from '../../../../lib/docuseal';
import { updateDocumentTemplate } from '../../../../lib/documents-db';
import { getUserById } from '../../../../lib/keycloak';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { templateId?: string; keycloakUserId?: string };
  if (!body.templateId || !body.keycloakUserId) {
    return new Response(JSON.stringify({ error: 'templateId und keycloakUserId erforderlich.' }), { status: 400 });
  }

  const template = await getDocumentTemplate(body.templateId);
  if (!template) {
    return new Response(JSON.stringify({ error: 'Vorlage nicht gefunden.' }), { status: 404 });
  }

  const kcUser = await getUserById(body.keycloakUserId).catch(() => null);
  if (!kcUser?.email) {
    return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });
  }

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) {
    return new Response(JSON.stringify({ error: 'Kundeneintrag nicht gefunden.' }), { status: 404 });
  }

  // Create or reuse DocuSeal template
  let dsTemplateId = template.docuseal_template_id;
  if (!dsTemplateId) {
    try {
      dsTemplateId = await createTemplate(template.title, template.html_body);
      await updateDocumentTemplate(template.id, { docuseal_template_id: dsTemplateId });
    } catch (err) {
      console.error('DocuSeal createTemplate error:', err);
      return new Response(JSON.stringify({ error: 'DocuSeal-Vorlage konnte nicht erstellt werden.' }), { status: 502 });
    }
  }

  // Create submission in DocuSeal
  let submitter;
  try {
    submitter = await createSubmission({
      templateId: dsTemplateId,
      submitterEmail: kcUser.email,
      submitterName: `${kcUser.firstName ?? ''} ${kcUser.lastName ?? ''}`.trim() || kcUser.username,
    });
  } catch (err) {
    console.error('DocuSeal createSubmission error:', err);
    return new Response(JSON.stringify({ error: 'DocuSeal-Submission konnte nicht erstellt werden.' }), { status: 502 });
  }

  const assignment = await createDocumentAssignment({
    customerId: customer.id,
    templateId: template.id,
    submissionSlug: submitter.slug,
    embedSrc: submitter.embed_src,
  });

  return new Response(JSON.stringify(assignment), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 6.2: Create `website/src/pages/api/admin/documents/assignments.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listAssignmentsForCustomer } from '../../../../lib/documents-db';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { getUserById } from '../../../../lib/keycloak';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const keycloakUserId = url.searchParams.get('keycloakUserId');
  if (!keycloakUserId) {
    return new Response(JSON.stringify({ error: 'keycloakUserId erforderlich.' }), { status: 400 });
  }

  const kcUser = await getUserById(keycloakUserId).catch(() => null);
  if (!kcUser?.email) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const assignments = await listAssignmentsForCustomer(customer.id);
  return new Response(JSON.stringify(assignments), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 6.3: Create `website/src/pages/api/webhooks/docuseal.ts`**

```typescript
import type { APIRoute } from 'astro';
import { markAssignmentCompleted } from '../../../lib/documents-db';

export const POST: APIRoute = async ({ request }) => {
  // DocuSeal sends: {"event_type": "submission.completed", "data": {"submitter": {"slug": "..."}}}
  const body = await request.json() as {
    event_type?: string;
    data?: { submitter?: { slug?: string } };
  };

  if (body.event_type === 'submission.completed' && body.data?.submitter?.slug) {
    await markAssignmentCompleted(body.data.submitter.slug).catch(err =>
      console.error('Webhook: markAssignmentCompleted failed:', err),
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 6.4: Commit**

```bash
git add website/src/pages/api/admin/documents/assign.ts website/src/pages/api/admin/documents/assignments.ts website/src/pages/api/webhooks/
git commit -m "feat(api): add contract assignment endpoint and DocuSeal webhook"
```

---

## Task 7: Newsletter → Dokumenteneditor Rename + Vertragsvorlagen Tab

**Files:**
- Create: `website/src/pages/admin/dokumente.astro`
- Modify: `website/src/pages/admin/newsletter.astro`
- Create: `website/src/components/admin/DokumentEditor.svelte`
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 7.1: Create `website/src/pages/admin/dokumente.astro`**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import DokumentEditor from '../../components/admin/DokumentEditor.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Admin — Dokumenteneditor">
  <section class="pt-10 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-light font-serif">Dokumenteneditor</h1>
        <p class="text-muted mt-1">Newsletter, Kampagnen und Vertragsvorlagen verwalten</p>
      </div>
      <DokumentEditor client:load />
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 7.2: Update `website/src/pages/admin/newsletter.astro` to redirect**

Replace the full file content with:

```astro
---
return Astro.redirect('/admin/dokumente', 301);
---
```

- [ ] **Step 7.3: Create `website/src/components/admin/DokumentEditor.svelte`**

This component wraps the existing newsletter tabs and adds a new "Vertragsvorlagen" tab:

```svelte
<script lang="ts">
  import NewsletterAdmin from './NewsletterAdmin.svelte';

  type Template = {
    id: string;
    title: string;
    html_body: string;
    docuseal_template_id: number | null;
    created_at: string;
    updated_at: string;
  };

  let activeSection: 'newsletter' | 'vorlagen' = $state('newsletter');

  // ── Vertragsvorlagen ──────────────────────────────────────────────
  let templates: Template[] = $state([]);
  let tplLoading = $state(false);
  let tplError = $state('');

  let showCompose = $state(false);
  let editingId: string | null = $state(null);
  let composeTitle = $state('');
  let composeHtml = $state('');
  let composeMsg = $state('');
  let composeSaving = $state(false);
  let deleteConfirm: string | null = $state(null);

  async function loadTemplates() {
    tplLoading = true; tplError = '';
    try {
      const res = await fetch('/api/admin/documents/templates');
      templates = res.ok ? await res.json() : [];
      if (!res.ok) tplError = 'Fehler beim Laden.';
    } catch {
      tplError = 'Verbindungsfehler.';
    } finally {
      tplLoading = false;
    }
  }

  $effect(() => {
    if (activeSection === 'vorlagen') loadTemplates();
  });

  async function saveTemplate() {
    if (!composeTitle.trim() || !composeHtml.trim()) {
      composeMsg = 'Titel und Inhalt sind erforderlich.'; return;
    }
    composeSaving = true; composeMsg = '';
    try {
      const url = editingId
        ? `/api/admin/documents/templates/${editingId}`
        : '/api/admin/documents/templates';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: composeTitle, html_body: composeHtml }),
      });
      const data = await res.json();
      if (res.ok) {
        composeMsg = editingId ? 'Gespeichert.' : 'Vorlage erstellt.';
        showCompose = false;
        editingId = null;
        composeTitle = ''; composeHtml = '';
        await loadTemplates();
      } else {
        composeMsg = data.error ?? 'Fehler beim Speichern.';
      }
    } finally {
      composeSaving = false;
    }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/admin/documents/templates/${id}`, { method: 'DELETE' });
    if (res.ok) { deleteConfirm = null; await loadTemplates(); }
  }

  function startEdit(t: Template) {
    editingId = t.id;
    composeTitle = t.title;
    composeHtml = t.html_body;
    showCompose = true;
    composeMsg = '';
  }

  function startNew() {
    editingId = null;
    composeTitle = ''; composeHtml = '';
    showCompose = true;
    composeMsg = '';
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<!-- Section switcher -->
<div class="flex gap-1 mb-8 border-b border-dark-lighter">
  <button
    onclick={() => activeSection = 'newsletter'}
    class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSection === 'newsletter' ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
  >Newsletter</button>
  <button
    onclick={() => activeSection = 'vorlagen'}
    class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeSection === 'vorlagen' ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
  >Vertragsvorlagen</button>
</div>

{#if activeSection === 'newsletter'}
  <NewsletterAdmin />
{:else}
  <!-- ── Vertragsvorlagen ── -->
  <div>
    {#if !showCompose}
      <div class="flex justify-between items-center mb-4">
        <p class="text-muted text-sm">{templates.length} Vorlage{templates.length !== 1 ? 'n' : ''}</p>
        <button onclick={startNew} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
          + Neue Vorlage
        </button>
      </div>
      {#if tplLoading}
        <p class="text-muted text-sm">Lade…</p>
      {:else if tplError}
        <p class="text-red-400 text-sm">{tplError}</p>
      {:else if templates.length === 0}
        <p class="text-muted text-sm">Noch keine Vorlagen.</p>
      {:else}
        <div class="flex flex-col gap-2">
          {#each templates as t}
            <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
              <div class="flex-1 min-w-0">
                <p class="text-light font-medium truncate">{t.title}</p>
                <p class="text-muted text-xs mt-0.5">
                  {fmtDate(t.updated_at)}
                  {#if t.docuseal_template_id}
                    · <span class="text-green-400">DocuSeal #{t.docuseal_template_id}</span>
                  {/if}
                </p>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <button onclick={() => startEdit(t)} class="text-xs text-muted hover:text-gold transition-colors">Bearbeiten</button>
                {#if deleteConfirm === t.id}
                  <span class="text-xs text-muted">Sicher?</span>
                  <button onclick={() => deleteTemplate(t.id)} class="text-xs text-red-400 hover:text-red-300">Ja</button>
                  <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
                {:else}
                  <button onclick={() => deleteConfirm = t.id} class="text-xs text-muted hover:text-red-400 transition-colors">Löschen</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Compose / edit form -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-light">{editingId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
            <button onclick={() => { showCompose = false; editingId = null; }} class="text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
          </div>
          <div>
            <label class="block text-sm text-muted mb-1">Titel *</label>
            <input
              type="text" bind:value={composeTitle} placeholder="z.B. Dienstleistungsvertrag 2026"
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none"
            />
          </div>
          <div class="flex flex-col flex-1">
            <label class="block text-sm text-muted mb-1">HTML-Inhalt *</label>
            <textarea
              bind:value={composeHtml}
              placeholder="<h1>Vertrag</h1><p>Inhalt hier…</p>"
              rows="18"
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y"
            ></textarea>
          </div>
          {#if composeMsg}
            <p class={`text-sm ${composeMsg.includes('Fehler') || composeMsg.includes('erforderlich') ? 'text-red-400' : 'text-green-400'}`}>{composeMsg}</p>
          {/if}
          <div class="flex gap-3">
            <button onclick={saveTemplate} disabled={composeSaving} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50">
              {composeSaving ? 'Speichere…' : 'Speichern'}
            </button>
          </div>
        </div>
        <div>
          <p class="text-sm text-muted mb-1">Vorschau</p>
          <iframe
            srcdoc={composeHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>'}
            title="Vertragsvorschau"
            class="w-full h-[500px] rounded-xl border border-dark-lighter bg-white"
          ></iframe>
        </div>
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 7.4: Update `website/src/layouts/AdminLayout.astro` nav entry**

Find the line:
```typescript
      { href: '/admin/newsletter',    label: 'Newsletter',    icon: 'mail' },
```

Replace with:
```typescript
      { href: '/admin/dokumente',     label: 'Dokumenteneditor', icon: 'mail' },
```

- [ ] **Step 7.5: Commit**

```bash
git add website/src/pages/admin/dokumente.astro website/src/pages/admin/newsletter.astro website/src/components/admin/DokumentEditor.svelte website/src/layouts/AdminLayout.astro
git commit -m "feat(ui): rename Newsletter to Dokumenteneditor, add Vertragsvorlagen tab"
```

---

## Task 8: Newsletter-Toggle API for Clients

**Files:**
- Create: `website/src/pages/api/admin/clients/newsletter-toggle.ts`

- [ ] **Step 8.1: Create `website/src/pages/api/admin/clients/newsletter-toggle.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getUserById } from '../../../../lib/keycloak';
import {
  getSubscriberByEmail,
  createSubscriber,
  confirmSubscriber,
  deleteSubscriber,
} from '../../../../lib/newsletter-db';
import { randomUUID } from 'crypto';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { keycloakUserId?: string; subscribe?: boolean };
  if (!body.keycloakUserId || body.subscribe === undefined) {
    return new Response(JSON.stringify({ error: 'keycloakUserId und subscribe erforderlich.' }), { status: 400 });
  }

  const kcUser = await getUserById(body.keycloakUserId).catch(() => null);
  if (!kcUser?.email) {
    return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });
  }

  const existing = await getSubscriberByEmail(kcUser.email);

  if (body.subscribe) {
    if (existing && existing.status === 'confirmed') {
      return new Response(JSON.stringify({ ok: true, status: 'confirmed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (existing) {
      await confirmSubscriber(existing.id);
    } else {
      const sub = await createSubscriber({
        email: kcUser.email,
        status: 'confirmed',
        source: 'admin',
        unsubscribeToken: randomUUID(),
      });
      await confirmSubscriber(sub.id);
    }
    return new Response(JSON.stringify({ ok: true, status: 'confirmed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    if (existing) await deleteSubscriber(existing.id);
    return new Response(JSON.stringify({ ok: true, status: 'removed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 8.2: Commit**

```bash
git add website/src/pages/api/admin/clients/newsletter-toggle.ts
git commit -m "feat(api): add newsletter-toggle endpoint for client management"
```

---

## Task 9: Client Detail Page — Newsletter Checkbox + Contract Assignment

**Files:**
- Create: `website/src/components/admin/ClientContractsPanel.svelte`
- Modify: `website/src/pages/admin/[clientId].astro`

- [ ] **Step 9.1: Create `website/src/components/admin/ClientContractsPanel.svelte`**

```svelte
<script lang="ts">
  type Props = {
    keycloakUserId: string;
    clientEmail: string;
    isNewsletterSubscribed: boolean;
  };

  const { keycloakUserId, clientEmail, isNewsletterSubscribed }: Props = $props();

  type Template = { id: string; title: string };
  type Assignment = {
    id: string;
    template_title: string;
    status: string;
    assigned_at: string;
    signed_at: string | null;
    docuseal_embed_src: string | null;
  };

  // ── Newsletter toggle ─────────────────────────────────────────────
  let subscribed = $state(isNewsletterSubscribed);
  let nlLoading = $state(false);
  let nlMsg = $state('');

  async function toggleNewsletter() {
    nlLoading = true; nlMsg = '';
    try {
      const res = await fetch('/api/admin/clients/newsletter-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keycloakUserId, subscribe: !subscribed }),
      });
      if (res.ok) {
        subscribed = !subscribed;
        nlMsg = subscribed ? 'Als Abonnent hinzugefügt.' : 'Abonnent entfernt.';
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        nlMsg = d.error ?? 'Fehler.';
      }
    } catch {
      nlMsg = 'Netzwerkfehler.';
    } finally {
      nlLoading = false;
    }
  }

  // ── Contract assignment ───────────────────────────────────────────
  let templates: Template[] = $state([]);
  let assignments: Assignment[] = $state([]);
  let selectedTemplateId = $state('');
  let assigning = $state(false);
  let assignMsg = $state('');

  async function loadData() {
    try {
      const [tRes, aRes] = await Promise.all([
        fetch('/api/admin/documents/templates'),
        fetch(`/api/admin/documents/assignments?keycloakUserId=${keycloakUserId}`),
      ]);
      templates = tRes.ok ? await tRes.json() : [];
      assignments = aRes.ok ? await aRes.json() : [];
    } catch {
      // silently ignore
    }
  }

  $effect(() => { loadData(); });

  async function assignContract() {
    if (!selectedTemplateId) { assignMsg = 'Bitte eine Vorlage wählen.'; return; }
    assigning = true; assignMsg = '';
    try {
      const res = await fetch('/api/admin/documents/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, keycloakUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        assignMsg = 'Vertrag zugewiesen.';
        selectedTemplateId = '';
        await loadData();
      } else {
        assignMsg = data.error ?? 'Fehler beim Zuweisen.';
      }
    } finally {
      assigning = false;
    }
  }

  function statusBadge(s: string) {
    if (s === 'completed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'expired') return 'bg-red-500/10 text-red-400 border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

<!-- Newsletter Subscription -->
<div class="mb-6 p-4 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Newsletter</h2>
  <label class="flex items-center gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={subscribed}
      disabled={nlLoading}
      onchange={toggleNewsletter}
      class="accent-gold w-4 h-4"
    />
    <span class="text-sm text-light">
      {subscribed ? 'Newsletter-Abonnent (bestätigt)' : 'Kein Newsletter-Abonnent'}
    </span>
  </label>
  {#if nlMsg}
    <p class={`text-xs mt-2 ${nlMsg.includes('Fehler') || nlMsg.includes('fehler') ? 'text-red-400' : 'text-green-400'}`}>{nlMsg}</p>
  {/if}
</div>

<!-- Contract Assignment -->
<div class="p-4 bg-dark-light rounded-xl border border-dark-lighter">
  <h2 class="text-sm font-medium text-muted mb-3 uppercase tracking-wide">Vertrag zuweisen</h2>

  {#if templates.length > 0}
    <div class="flex gap-2 items-start mb-4">
      <select
        bind:value={selectedTemplateId}
        class="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
      >
        <option value="">— Vorlage wählen —</option>
        {#each templates as t}
          <option value={t.id}>{t.title}</option>
        {/each}
      </select>
      <button
        onclick={assignContract}
        disabled={assigning || !selectedTemplateId}
        class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50"
      >
        {assigning ? '…' : 'Zuweisen'}
      </button>
    </div>
    {#if assignMsg}
      <p class={`text-xs mb-3 ${assignMsg.includes('Fehler') || assignMsg.includes('fehler') ? 'text-red-400' : 'text-green-400'}`}>{assignMsg}</p>
    {/if}
  {:else}
    <p class="text-muted text-sm mb-4">
      Noch keine Vorlagen.
      <a href="/admin/dokumente" class="text-gold hover:underline">Vorlagen erstellen →</a>
    </p>
  {/if}

  {#if assignments.length > 0}
    <h3 class="text-xs text-muted uppercase tracking-wide mb-2">Zugewiesene Verträge</h3>
    <div class="flex flex-col gap-2">
      {#each assignments as a}
        <div class="flex items-center justify-between gap-3 p-3 bg-dark rounded-lg border border-dark-lighter">
          <div class="flex-1 min-w-0">
            <p class="text-light text-sm truncate">{a.template_title}</p>
            <p class="text-muted text-xs mt-0.5">Zugewiesen: {fmtDate(a.assigned_at)}{a.signed_at ? ` · Unterschrieben: ${fmtDate(a.signed_at)}` : ''}</p>
          </div>
          <span class={`px-2 py-0.5 rounded border text-xs flex-shrink-0 ${statusBadge(a.status)}`}>
            {a.status === 'completed' ? 'Unterschrieben' : a.status === 'expired' ? 'Abgelaufen' : 'Ausstehend'}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 9.2: Load newsletter status + document data in `website/src/pages/admin/[clientId].astro`**

In the frontmatter section, after the existing imports, add:

```typescript
import ClientContractsPanel from '../../components/admin/ClientContractsPanel.svelte';
import { getSubscriberByEmail } from '../../lib/newsletter-db';
```

Then after the `customerRecord` try/catch block (around line 58), add:

```typescript
let isNewsletterSubscribed = false;
try {
  if (client.email) {
    const sub = await getSubscriberByEmail(client.email);
    isNewsletterSubscribed = sub?.status === 'confirmed';
  }
} catch {
  // newsletter DB unavailable
}
```

- [ ] **Step 9.3: Add `ClientContractsPanel` to the tab list in `[clientId].astro`**

In the tab navigation array (starting around line 191), add a new tab entry after the `onboarding` entry:

```typescript
          { id: 'vertraege', label: 'Verträge & Newsletter' },
```

Then in the tab content section (after the `book` tab block, before the closing `</div>`), add:

```astro
        {tab === 'vertraege' && (
          <ClientContractsPanel
            client:load
            keycloakUserId={clientId}
            clientEmail={client.email ?? ''}
            isNewsletterSubscribed={isNewsletterSubscribed}
          />
        )}
```

- [ ] **Step 9.4: Commit**

```bash
git add website/src/components/admin/ClientContractsPanel.svelte website/src/pages/admin/[clientId].astro
git commit -m "feat(ui): add Verträge & Newsletter tab to client detail page"
```

---

## Task 10: Update Portal Unterschriften Tab

**Files:**
- Modify: `website/src/components/portal/SignaturesTab.astro`
- Modify: `website/src/pages/portal.astro`

- [ ] **Step 10.1: Modify `website/src/components/portal/SignaturesTab.astro`**

Replace the full file with:

```astro
---
import { listFiles, getClientFolderPath, PENDING_SIGNATURES_DIR, SIGNED_DIR } from '../../lib/nextcloud-files';
import type { NcFile } from '../../lib/nextcloud-files';
import { listAssignmentsForCustomer } from '../../lib/documents-db';
import { getCustomerByEmail } from '../../lib/website-db';

interface Props {
  clientUsername: string;
  clientEmail?: string;
}
const { clientUsername, clientEmail } = Astro.props;

const clientFolder = getClientFolderPath(clientUsername);
let pendingFiles: NcFile[] = [];
let signedFiles: NcFile[] = [];

try {
  pendingFiles = await listFiles(`${clientFolder}${PENDING_SIGNATURES_DIR}/`);
  pendingFiles = pendingFiles.filter(f => f.contentType !== 'httpd/unix-directory');
} catch { /* Nextcloud unavailable */ }

try {
  signedFiles = await listFiles(`${clientFolder}${SIGNED_DIR}/`);
  signedFiles = signedFiles.filter(f => f.contentType !== 'httpd/unix-directory');
} catch { /* folder may not exist yet */ }

// DocuSeal assignments
import type { DocumentAssignment } from '../../lib/documents-db';
let docusealPending: DocumentAssignment[] = [];
let docusealCompleted: DocumentAssignment[] = [];

try {
  if (clientEmail) {
    const customer = await getCustomerByEmail(clientEmail).catch(() => null);
    if (customer) {
      const allAssignments = await listAssignmentsForCustomer(customer.id);
      docusealPending = allAssignments.filter(a => a.status === 'pending');
      docusealCompleted = allAssignments.filter(a => a.status === 'completed');
    }
  }
} catch { /* DB unavailable */ }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
---

<div data-testid="signatures-tab">
  <h3 class="text-lg font-semibold text-light mb-4">Zur Unterschrift</h3>

  {(pendingFiles.length > 0 || docusealPending.length > 0) ? (
    <div class="mb-6">
      <h4 class="text-sm text-gold uppercase tracking-widest mb-3">Ausstehend</h4>
      <ul class="space-y-2">
        {pendingFiles.map(file => {
          const encodedPath = encodeURIComponent(`${clientFolder}${PENDING_SIGNATURES_DIR}/${file.name}`);
          return (
            <li>
              <a
                href={`/portal/document?path=${encodedPath}&name=${encodeURIComponent(file.name)}`}
                data-testid="pending-document-link"
                class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-gold/30 hover:border-gold/60 transition-colors"
              >
                <span class="text-light">{file.name}</span>
                <span class="ml-auto text-xs text-gold">Zur Unterschrift →</span>
              </a>
            </li>
          );
        })}
        {docusealPending.map(a => (
          <li>
            <a
              href={`/portal/sign/${a.id}`}
              data-testid="docuseal-pending-link"
              class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-gold/30 hover:border-gold/60 transition-colors"
            >
              <span class="text-light">{a.template_title}</span>
              <span class="ml-auto text-xs text-gold">Elektronisch unterschreiben →</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  ) : (
    <p class="text-muted mb-6">Keine ausstehenden Dokumente.</p>
  )}

  {(signedFiles.length > 0 || docusealCompleted.length > 0) && (
    <div>
      <h4 class="text-sm text-muted uppercase tracking-widest mb-3">Unterzeichnet</h4>
      <ul class="space-y-2">
        {signedFiles.map(file => (
          <li class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-dark-lighter" data-testid="signed-document-item">
            <span class="text-muted">{file.name}</span>
            <span class="ml-auto text-xs text-green-400">✓ Akzeptiert</span>
          </li>
        ))}
        {docusealCompleted.map(a => (
          <li class="flex items-center gap-3 p-3 bg-dark rounded-lg border border-dark-lighter" data-testid="docuseal-signed-item">
            <span class="text-muted">{a.template_title}</span>
            <span class="ml-auto text-xs text-green-400">✓ Elektronisch unterzeichnet {fmtDate(a.signed_at ?? a.assigned_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  )}
</div>
```

- [ ] **Step 10.2: Create DocuSeal signing page `website/src/pages/portal/sign/[assignmentId].astro`**

Create the directory and file:

```astro
---
import PortalLayout from '../../../layouts/PortalLayout.astro';
import { getSession, getLoginUrl } from '../../../lib/auth';
import { getCustomerByEmail } from '../../../lib/website-db';
import { listAssignmentsForCustomer } from '../../../lib/documents-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));

const { assignmentId } = Astro.params;
if (!assignmentId) return Astro.redirect('/portal?section=unterschriften');

const customer = await getCustomerByEmail(session.email).catch(() => null);
if (!customer) return Astro.redirect('/portal?section=unterschriften');

const assignments = await listAssignmentsForCustomer(customer.id).catch(() => []);
const assignment = assignments.find(a => a.id === assignmentId);

if (!assignment || assignment.status !== 'pending') {
  return Astro.redirect('/portal?section=unterschriften');
}

const embedSrc = assignment.docuseal_embed_src;
---

<PortalLayout
  title={`Unterschriften — ${assignment.template_title}`}
  section="unterschriften"
  session={session}
  pendingSignatures={assignments.filter(a => a.status === 'pending').length}
>
  <section class="pt-6 pb-20 bg-dark min-h-screen">
    <div class="max-w-4xl mx-auto px-6">
      <div class="mb-6 flex items-center gap-3">
        <a href="/portal?section=unterschriften" class="text-muted hover:text-light text-sm transition-colors">← Zurück</a>
        <h1 class="text-2xl font-bold text-light font-serif">{assignment.template_title}</h1>
      </div>
      {embedSrc ? (
        <div class="bg-white rounded-xl overflow-hidden" style="height: 80vh; min-height: 600px;">
          <iframe
            src={embedSrc}
            title={`Dokument: ${assignment.template_title}`}
            class="w-full h-full border-0"
            allow="camera"
          ></iframe>
        </div>
      ) : (
        <div class="p-8 bg-dark-light rounded-xl border border-dark-lighter text-center">
          <p class="text-muted">Das Dokument konnte nicht geladen werden. Bitte versuche es später erneut.</p>
        </div>
      )}
    </div>
  </section>
</PortalLayout>
```

- [ ] **Step 10.3: Update `website/src/pages/portal.astro` to include DocuSeal pending count**

In the `portal.astro` frontmatter, find the imports section and add:

```typescript
import { getCustomerByEmail } from '../lib/website-db';
import { countPendingAssignmentsForCustomer } from '../lib/documents-db';
```

Note: `getCustomerByEmail` is already imported via `messaging-db`. Instead, use the `customer` variable that is already fetched:

After the line `if (customer) {` block where `unreadMessages` is set (around line 42), add inside the same `if (customer)` block:

```typescript
  const docusealPending = await countPendingAssignmentsForCustomer(customer.id).catch(() => 0);
  pendingSignatures += docusealPending;
```

- [ ] **Step 10.4: Update `SignaturesTab` call in `portal.astro` to pass `clientEmail`**

Find the line:
```astro
      <SignaturesTab clientUsername={username} />
```

Replace with:
```astro
      <SignaturesTab clientUsername={username} clientEmail={session.email} />
```

Also update the call in `website/src/pages/admin/[clientId].astro`:

Find:
```astro
        {tab === 'signatures' && <SignaturesTab clientUsername={client.username} />}
```

Replace with:
```astro
        {tab === 'signatures' && <SignaturesTab clientUsername={client.username} clientEmail={client.email ?? ''} />}
```

- [ ] **Step 10.5: Commit**

```bash
git add website/src/components/portal/SignaturesTab.astro website/src/pages/portal/sign/ website/src/pages/portal.astro website/src/pages/admin/[clientId].astro
git commit -m "feat(portal): integrate DocuSeal assignments into Unterschriften tab and signing page"
```

---

## Task 11: Final Validation & PR

- [ ] **Step 11.1: Run manifest validation**

```bash
task workspace:validate
```

Expected: exits 0.

- [ ] **Step 11.2: Run YAML lint**

```bash
yamllint -d '{extends: relaxed, rules: {line-length: {max: 200}}}' k3d/docuseal.yaml k3d/ingress.yaml k3d/secrets.yaml k3d/configmap-domains.yaml k3d/website-schema.yaml
```

Expected: no errors.

- [ ] **Step 11.3: TypeScript check**

```bash
cd website && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11.4: Create PR**

```bash
git push -u origin feature/docuseal-dokumenteneditor
gh pr create \
  --title "feat: DocuSeal e-signatures + Dokumenteneditor" \
  --body "## Summary
- Deploys DocuSeal (sign.localhost) as a new K8s service on shared-db
- Adds document_templates and document_assignments DB tables
- Renames Newsletter admin page to Dokumenteneditor with new Vertragsvorlagen tab
- Admin can assign contract templates to clients from client detail page
- Newsletter subscriber toggle moved to client detail Verträge & Newsletter tab
- Portal Unterschriften tab shows DocuSeal pending/completed alongside Nextcloud docs
- DocuSeal webhook marks assignments completed on signature
## Test plan
- [ ] Deploy cluster: \`task workspace:up\`
- [ ] Verify DocuSeal UI reachable at http://sign.localhost
- [ ] Create a contract template in Dokumenteneditor → Vertragsvorlagen
- [ ] Go to a client page → Verträge & Newsletter tab
- [ ] Toggle newsletter checkbox → verify subscriber added/removed in Dokumenteneditor → Newsletter
- [ ] Assign a contract template → verify assignment shown and email sent (Mailpit)
- [ ] Log in as client → Unterschriften tab shows pending contract
- [ ] Click contract → DocuSeal signing page loads in iframe
- [ ] Simulate webhook: \`curl -X POST http://web.localhost/api/webhooks/docuseal -H 'Content-Type: application/json' -d '{\"event_type\":\"submission.completed\",\"data\":{\"submitter\":{\"slug\":\"<slug>\"}}}\`
- [ ] Verify assignment status flips to 'completed' in admin client view"
```

---

## Post-Deploy: Configure DocuSeal API Token

After the first deploy, DocuSeal generates an API token via its web UI:

1. Visit `http://sign.localhost` → complete setup wizard
2. Go to **Settings → API** → copy the API token
3. Update the secret: `kubectl patch secret workspace-secrets -n workspace --type merge -p '{"stringData":{"DOCUSEAL_API_TOKEN":"<token>"}}'`
4. Restart website: `task workspace:restart -- website`

For production (mentolder/korczewski), update the corresponding SealedSecret and redeploy.
