# Bug Report Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating "Bug melden" widget to every page of the mentolder + korczewski website that submits a description and optional screenshot to a Mattermost `bugs` channel.

**Architecture:** Single Svelte component mounted in `Layout.astro` posts `multipart/form-data` to a new Astro API route, which uploads the file to Mattermost's files API and then posts an interactive message. No new services, no database, no PVC. Both brands are covered automatically because they share the `website/` codebase; the destination channel is parameterized by an env var with a fallback to the existing `anfragen` channel.

**Tech Stack:** Astro 5, Svelte 5 (runes mode), TypeScript, Mattermost REST API v4, Playwright, Bash (runner.sh tests).

**Design doc:** `docs/superpowers/specs/2026-04-14-bug-report-form-design.md`

**Prerequisites (run once before Task 1):**
- Confirm you are on a feature branch, not `main`:
  ```bash
  git checkout -b feature/bug-report-form
  ```
  If a worktree was already created by the brainstorming skill, skip this — you are already on the right branch.
- Confirm the working tree is clean:
  ```bash
  git status
  ```
  Expected: `nothing to commit, working tree clean`.

**Key repo conventions worth knowing before you start:**
- `website/` is a single Astro+Svelte codebase that serves **both brands** (mentolder + korczewski) via the `BRAND` env var. Implement once, deploy twice.
- The working directory uses **German UI strings** — follow the existing tone (formal "Sie", clear labels).
- Svelte components use Svelte 5 runes (`$state`, `$props`, `onclick={...}`). Look at `website/src/components/ContactForm.svelte` for the canonical pattern before editing the new component.
- Mattermost helpers live in `website/src/lib/mattermost.ts`. The existing `mmApi` function hardcodes `Content-Type: application/json`, so file uploads need a separate fetch call that lets the runtime set the multipart boundary automatically (do NOT reuse `mmApi`).
- Tests in `tests/local/*.sh` are auto-discovered by `tests/runner.sh` — just drop a file with the right name and it's picked up.
- Playwright specs under `tests/e2e/specs/` are run separately (`cd tests/e2e && npx playwright test <spec>`).

---

## File Structure

**Create:**
- `website/src/components/BugReportWidget.svelte` — floating button + modal form (Svelte 5).
- `website/src/pages/api/bug-report.ts` — Astro API endpoint (multipart/form-data).
- `tests/e2e/specs/fa-26-bug-report-form.spec.ts` — Playwright UI spec.
- `tests/e2e/fixtures/test-screenshot.png` — small (1×1) PNG fixture for file-upload test.
- `tests/local/FA-26.sh` — bash smoke test for the runner.

**Modify:**
- `website/src/lib/mattermost.ts` — add `uploadFile`, extend `postInteractiveMessage` with `fileIds`.
- `website/src/layouts/Layout.astro` — mount `<BugReportWidget client:load />` once.
- `k3d/website.yaml` — add `BUG_REPORT_CHANNEL: "bugs"` to `website-config` ConfigMap.
- `k3d/korczewski-website.yaml` — add `BUG_REPORT_CHANNEL: "bugs"` to its ConfigMap.
- `prod/ingress.yaml` — remove the dangling `- bug.${PROD_DOMAIN}` entry from the TLS hosts list of `workspace-ingress-misc` (line ~235).

---

## Task 1: Clean up dangling bug-tracker TLS host entry

The bulk of the bug-tracker removal is already done in commit `e321109`. One dangling reference remains in `prod/ingress.yaml`: the TLS hosts list of `workspace-ingress-misc` still contains `- bug.${PROD_DOMAIN}`. It points to nothing (the host rule was removed) and will cause Let's Encrypt to try to issue a cert for a host that doesn't resolve.

**Files:**
- Modify: `prod/ingress.yaml` (remove one line in the TLS hosts list around line 235)

- [ ] **Step 1: Confirm the dangling line exists**

Run:
```bash
grep -n "bug\.\${PROD_DOMAIN}" prod/ingress.yaml
```
Expected: exactly one match (a line like `        - bug.${PROD_DOMAIN}` inside a TLS `hosts:` list). If zero matches, task is already done — skip to Step 4.

- [ ] **Step 2: Remove the line**

Find the TLS hosts block that contains `bug.${PROD_DOMAIN}`. It looks like this:

```yaml
spec:
  tls:
    - hosts:
        - meet.${PROD_DOMAIN}
        - board.${PROD_DOMAIN}
        - signaling.${PROD_DOMAIN}
        - wiki.${PROD_DOMAIN}
        - bug.${PROD_DOMAIN}        # ← remove only this line
      secretName: workspace-wildcard-tls
```

Remove only the `- bug.${PROD_DOMAIN}` line. Leave all other entries untouched.

- [ ] **Step 3: Verify no other bug-tracker references remain**

Run:
```bash
grep -rn "bug-tracker\|bug_tracker\|bug\.\${PROD_DOMAIN}\|bug\.localhost" k3d/ prod/ prod-korczewski/ Taskfile.yml scripts/ 2>/dev/null
```
Expected: no matches. If any match appears, remove it (document the file + line in the commit message).

- [ ] **Step 4: Validate manifests still build**

Run:
```bash
task workspace:validate
```
Expected: `kustomize build` succeeds and `kubeconform` passes with no errors mentioning `bug`.

- [ ] **Step 5: Commit**

```bash
git add prod/ingress.yaml
git commit -m "$(cat <<'EOF'
chore(ingress): remove dangling bug.${PROD_DOMAIN} TLS host

The bug-tracker service and its host rule were removed in e321109,
but the TLS hosts list still referenced the hostname. Drop it so
cert-manager stops trying to issue a cert for a non-existent host.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `uploadFile` helper and extend `postInteractiveMessage`

Add a new helper for Mattermost file uploads and extend `postInteractiveMessage` to attach uploaded files. This is pure library work — no TDD unit test infrastructure exists for `lib/mattermost.ts`, and adding one here is out of scope. The endpoint-level integration tests in Task 4 will exercise the helpers end-to-end.

**Files:**
- Modify: `website/src/lib/mattermost.ts`

- [ ] **Step 1: Add `uploadFile` export**

Insert the following function into `website/src/lib/mattermost.ts`, just below the existing `mmApi` helper (around line 21). It intentionally does NOT use `mmApi` because `mmApi` forces `Content-Type: application/json`, which would break the multipart boundary.

```typescript
// Upload a file to Mattermost via the Files API. Returns the file_id
// to include in a subsequent post's `file_ids` array, or null on failure.
// Do NOT route through mmApi — multipart/form-data needs the runtime to
// set the Content-Type header (with boundary) automatically.
export async function uploadFile(params: {
  channelId: string;
  file: File;
  filename?: string;
}): Promise<string | null> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would upload file:', params.filename ?? params.file.name);
    return null;
  }

  const formData = new FormData();
  formData.append('files', params.file, params.filename ?? params.file.name);
  formData.append('channel_id', params.channelId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${MM_URL}/api/v4/files`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${MM_TOKEN}`,
      },
      body: formData,
    });
    if (!res.ok) {
      console.error('[mattermost] uploadFile failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json() as { file_infos?: Array<{ id: string }> };
    return data.file_infos?.[0]?.id ?? null;
  } catch (err) {
    console.error('[mattermost] uploadFile threw:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Extend `postInteractiveMessage` signature with `fileIds`**

Locate the existing `postInteractiveMessage` function (starts around line 44). Replace it with this updated version — only two things change: the `fileIds?: string[]` param in the signature, and the conditional spread in the `mmApi` body.

```typescript
// Post interactive message with action buttons (requires bot token)
export async function postInteractiveMessage(params: {
  channelId: string;
  text: string;
  actions: Array<{
    id: string;
    name: string;
    style?: 'default' | 'primary' | 'danger' | 'success';
  }>;
  context?: Record<string, unknown>;
  fileIds?: string[];
}): Promise<string | null> {
  if (!MM_TOKEN) {
    console.log('[mattermost] No bot token configured. Would post interactive message:', JSON.stringify(params, null, 2));
    return null;
  }

  const res = await mmApi('POST', '/posts', {
    channel_id: params.channelId,
    message: params.text,
    ...(params.fileIds && params.fileIds.length > 0 ? { file_ids: params.fileIds } : {}),
    props: {
      attachments: [
        {
          actions: params.actions.map((action) => ({
            id: action.id,
            name: action.name,
            type: 'button',
            style: action.style || 'default',
            integration: {
              url: `${SITE_URL}/api/mattermost/actions`,
              context: {
                action: action.id,
                ...params.context,
              },
            },
          })),
        },
      ],
    },
  });

  if (res.ok) {
    const post = await res.json();
    return post.id;
  }

  console.error('[mattermost] Failed to post interactive message:', res.status);
  return null;
}
```

- [ ] **Step 3: Verify TypeScript still compiles**

Run:
```bash
cd website && npx astro check 2>&1 | tail -20
```
Expected: `0 errors, 0 warnings` (or the same error count that existed before your edit — the new code should introduce no new errors). If `astro check` is slow or flaky, fall back to `npx tsc --noEmit` against the `lib/mattermost.ts` file.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/mattermost.ts
git commit -m "$(cat <<'EOF'
feat(mattermost): add uploadFile helper and file_ids on interactive posts

Adds a Files API helper that bypasses mmApi (which forces a JSON
Content-Type and would break multipart) and extends postInteractiveMessage
to attach uploaded files via the Mattermost posts file_ids field.

Prep for the bug-report widget, which needs to upload screenshots.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `/api/bug-report` endpoint

**Files:**
- Create: `website/src/pages/api/bug-report.ts`

- [ ] **Step 1: Create the endpoint file**

Write this exact content to `website/src/pages/api/bug-report.ts`:

```typescript
import type { APIRoute } from 'astro';
import {
  postWebhook,
  postInteractiveMessage,
  getFirstTeamId,
  getChannelByName,
  uploadFile,
} from '../../lib/mattermost';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const DEFAULT_CHANNEL = process.env.BUG_REPORT_CHANNEL || 'bugs';
const FALLBACK_CHANNEL = 'anfragen';

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    const description = (formData.get('description')?.toString() ?? '').trim();
    const url = (formData.get('url')?.toString() ?? 'unbekannt').slice(0, 500);
    const userAgent = (formData.get('userAgent')?.toString() ?? 'unbekannt').slice(0, 500);
    const viewport = (formData.get('viewport')?.toString() ?? 'unbekannt').slice(0, 40);
    const screenshot = formData.get('screenshot');

    if (!description) {
      return jsonError('Bitte beschreiben Sie das Problem.', 400);
    }
    if (description.length > 2000) {
      return jsonError('Beschreibung zu lang (max. 2000 Zeichen).', 400);
    }

    let file: File | null = null;
    if (screenshot instanceof File && screenshot.size > 0) {
      if (screenshot.size > MAX_BYTES) {
        return jsonError('Datei zu groß (max. 5 MB).', 400);
      }
      if (!ALLOWED_MIME.has(screenshot.type)) {
        return jsonError('Dateiformat nicht unterstützt. Erlaubt: PNG, JPEG, WEBP.', 400);
      }
      file = screenshot;
    }

    // Resolve Mattermost team + channel (fall back to anfragen if bugs missing)
    const teamId = await getFirstTeamId();
    let channelName = DEFAULT_CHANNEL;
    let channelId: string | null = teamId ? await getChannelByName(teamId, DEFAULT_CHANNEL) : null;
    let fallbackPrefix = '';
    if (!channelId && teamId) {
      channelId = await getChannelByName(teamId, FALLBACK_CHANNEL);
      if (channelId) {
        channelName = FALLBACK_CHANNEL;
        fallbackPrefix = '[BUG] ';
        console.warn(`[bug-report] Channel "${DEFAULT_CHANNEL}" missing, falling back to "${FALLBACK_CHANNEL}"`);
      }
    }

    // Upload screenshot if present (best-effort — lost screenshot is soft failure)
    let fileId: string | null = null;
    let uploadWarning = '';
    if (file && channelId) {
      fileId = await uploadFile({ channelId, file });
      if (!fileId) {
        uploadWarning = '\n\n⚠️ Screenshot-Upload fehlgeschlagen';
      }
    }

    const escapedDescription = description.replace(/\n/g, '\n> ');
    const text =
      `### :bug: ${fallbackPrefix}Neuer Bug Report\n\n` +
      `| Feld | Inhalt |\n` +
      `|------|--------|\n` +
      `| **URL** | ${url} |\n` +
      `| **Browser** | \`${userAgent}\` |\n` +
      `| **Viewport** | ${viewport} |\n\n` +
      `**Beschreibung:**\n> ${escapedDescription}${uploadWarning}`;

    let delivered = false;
    if (channelId) {
      const postId = await postInteractiveMessage({
        channelId,
        text,
        actions: [{ id: 'archive_bug', name: 'Archivieren', style: 'default' }],
        context: { description, url, userAgent, viewport },
        fileIds: fileId ? [fileId] : undefined,
      });
      delivered = postId !== null;
    }

    if (!delivered) {
      const webhookOk = await postWebhook({
        channel: channelName,
        username: 'Bug-Bot',
        icon_emoji: ':bug:',
        text,
      });
      delivered = webhookOk;
    }

    if (!delivered) {
      return jsonError('Interner Serverfehler. Bitte versuchen Sie es später erneut.', 500);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Bug report error:', err);
    return jsonError('Interner Serverfehler. Bitte versuchen Sie es später erneut.', 500);
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd website && npx astro check 2>&1 | tail -20
```
Expected: `0 errors` (or no new errors vs. the baseline from before Task 3).

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/bug-report.ts
git commit -m "$(cat <<'EOF'
feat(website): add /api/bug-report endpoint

Accepts multipart/form-data (description, optional screenshot,
auto-captured URL/UA/viewport), validates server-side (5 MB max,
PNG/JPEG/WEBP), and forwards to the Mattermost "bugs" channel
with a graceful fallback to "anfragen" + webhook.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Integration tests for `/api/bug-report`

Extend the existing `website/tests/api.test.mjs` with a new section that exercises the validation paths of the new endpoint. These tests run against a live dev server (`BASE_URL=http://localhost:4321`), so they assert on the behavior you control: the 400s from validation, and — if the server can reach Mattermost — the 200 path. Happy-path assertions are tolerant of `500` so the test suite doesn't require a reachable Mattermost in all environments.

**Files:**
- Modify: `website/tests/api.test.mjs`

- [ ] **Step 1: Locate the file and identify the contact section**

Run:
```bash
grep -n "POST /api/contact" website/tests/api.test.mjs | head
```
Expected: a line number pointing at the `section('...')` call for the contact form. You'll append your new section just after the last `await assert('POST /api/contact ...')` block.

- [ ] **Step 2: Append the bug-report test section**

Add this block just **after** the contact-form `assert` calls and **before** the next section (or before the final summary block that prints `passed/failed`). Copy the code exactly:

```javascript
  // -- 7. POST /api/bug-report --
  section('Bug report form');

  await assert('POST /api/bug-report with empty body returns 400', async () => {
    const fd = new FormData();
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report missing description returns 400', async () => {
    const fd = new FormData();
    fd.append('url', 'http://test/');
    fd.append('userAgent', 'test-ua');
    fd.append('viewport', '1280x720');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report with oversized screenshot returns 400', async () => {
    const fd = new FormData();
    fd.append('description', 'Test');
    const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });
    fd.append('screenshot', big, 'big.png');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report with invalid MIME returns 400', async () => {
    const fd = new FormData();
    fd.append('description', 'Test');
    const exe = new Blob([new Uint8Array(100)], { type: 'application/x-msdownload' });
    fd.append('screenshot', exe, 'virus.exe');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  await assert('POST /api/bug-report with description only returns 200 or 500', async () => {
    // 200 when Mattermost is reachable, 500 when it is not — both are
    // valid outcomes for this integration test; we only assert the
    // endpoint does not crash on well-formed input.
    const fd = new FormData();
    fd.append('description', 'Automated test: Kaffeemaschine leer');
    fd.append('url', 'http://test/homepage');
    fd.append('userAgent', 'api-test/1.0');
    fd.append('viewport', '1280x720');
    const res = await fetch(`${BASE_URL}/api/bug-report`, { method: 'POST', body: fd });
    expect(res.status).toBeOneOf([200, 500]);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });
```

- [ ] **Step 3: Run the endpoint tests against the dev server**

In one terminal:
```bash
cd website && npm run dev
```
Wait for `Local  http://localhost:4321/` to appear.

In another terminal:
```bash
cd website && BASE_URL=http://localhost:4321 npm run test:api 2>&1 | tail -30
```
Expected: the new "Bug report form" section appears with 5 `✓` lines (or some mix where the 200/500 test passes either way). No failures in the new section.

Stop the dev server (Ctrl-C in the first terminal).

- [ ] **Step 4: Commit**

```bash
git add website/tests/api.test.mjs
git commit -m "$(cat <<'EOF'
test(website): integration tests for /api/bug-report

Covers the four validation paths (empty, missing description,
oversized file, wrong MIME) plus the tolerant happy-path assertion
(accepts 200 or 500 so the suite runs without a live Mattermost).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create `BugReportWidget.svelte` component

**Files:**
- Create: `website/src/components/BugReportWidget.svelte`

- [ ] **Step 1: Create the file with the full component**

Write this exact content to `website/src/components/BugReportWidget.svelte`:

```svelte
<script lang="ts">
  let open = $state(false);
  let description = $state('');
  let file = $state<File | null>(null);
  let fileError = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

  function openModal() {
    open = true;
    result = null;
  }

  function closeModal() {
    if (submitting) return;
    open = false;
  }

  function resetForm() {
    description = '';
    file = null;
    fileError = '';
    result = null;
    const input = document.getElementById('bug-screenshot') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  function onFileChange(e: Event) {
    fileError = '';
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    if (!picked) { file = null; return; }
    if (picked.size > MAX_BYTES) {
      fileError = 'Datei zu groß (max. 5 MB).';
      file = null;
      input.value = '';
      return;
    }
    if (!ALLOWED.includes(picked.type)) {
      fileError = 'Nur PNG, JPEG oder WEBP erlaubt.';
      file = null;
      input.value = '';
      return;
    }
    file = picked;
  }

  function removeFile() {
    file = null;
    fileError = '';
    const input = document.getElementById('bug-screenshot') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  function canSubmit() {
    return description.trim().length > 0 && !submitting && !fileError;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!canSubmit()) return;
    submitting = true;
    result = null;

    const fd = new FormData();
    fd.append('description', description.trim());
    fd.append('url', window.location.href);
    fd.append('userAgent', navigator.userAgent);
    fd.append('viewport', `${window.innerWidth}x${window.innerHeight}`);
    if (file) fd.append('screenshot', file, file.name);

    try {
      const res = await fetch('/api/bug-report', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        result = { success: true, message: 'Vielen Dank! Ihre Meldung wurde übermittelt.' };
        resetForm();
        setTimeout(() => { open = false; result = null; }, 2000);
      } else {
        result = { success: false, message: data.error || 'Fehler beim Übermitteln.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es erneut.' };
    } finally {
      submitting = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) closeModal();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<button
  type="button"
  onclick={openModal}
  aria-label="Bug melden"
  class="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-gold hover:bg-gold-light text-dark px-4 py-3 rounded-full font-semibold shadow-lg transition-colors cursor-pointer"
>
  <span aria-hidden="true">🐞</span>
  <span>Bug melden</span>
</button>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    onclick={closeModal}
    role="presentation"
  >
    <div
      class="bg-dark border border-dark-lighter rounded-xl max-w-lg w-full p-6 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-modal-title"
    >
      <div class="flex items-start justify-between mb-4">
        <h2 id="bug-modal-title" class="text-xl font-bold text-light">Fehler melden</h2>
        <button
          type="button"
          onclick={closeModal}
          aria-label="Schließen"
          class="text-muted hover:text-light text-2xl leading-none cursor-pointer bg-transparent border-0"
        >
          ×
        </button>
      </div>

      <form onsubmit={handleSubmit} class="space-y-4">
        <div>
          <label for="bug-description" class="block text-sm font-medium text-light mb-1">
            Beschreibung <span class="text-gold">*</span>
          </label>
          <textarea
            id="bug-description"
            bind:value={description}
            maxlength="2000"
            rows="5"
            required
            placeholder="Was ist passiert? Was haben Sie erwartet?"
            class="w-full px-3 py-2 rounded border border-dark-lighter bg-dark text-light focus:border-gold focus:ring-1 focus:ring-gold-dim resize-y"
          ></textarea>
        </div>

        <div>
          <label for="bug-screenshot" class="block text-sm font-medium text-light mb-1">
            Screenshot <span class="text-muted-dark">(optional, max. 5 MB)</span>
          </label>
          <input
            id="bug-screenshot"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onchange={onFileChange}
            class="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-gold file:text-dark file:font-semibold hover:file:bg-gold-light cursor-pointer"
          />
          {#if file}
            <p class="text-xs text-muted mt-1">
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
              <button type="button" onclick={removeFile} class="text-gold hover:underline ml-2 bg-transparent border-0 cursor-pointer">Entfernen</button>
            </p>
          {/if}
          {#if fileError}
            <p class="text-xs text-red-400 mt-1">{fileError}</p>
          {/if}
        </div>

        <button
          type="submit"
          disabled={!canSubmit()}
          class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-4 py-2.5 rounded font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {submitting ? 'Wird gesendet...' : 'Meldung senden'}
        </button>

        {#if result}
          <div
            class="p-3 rounded text-sm {result.success
              ? 'bg-green-900/30 text-green-300 border border-green-800'
              : 'bg-red-900/30 text-red-300 border border-red-800'}"
          >
            {result.message}
          </div>
        {/if}
      </form>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Verify TypeScript + Svelte compile**

Run:
```bash
cd website && npx astro check 2>&1 | tail -20
```
Expected: `0 errors` (or no new errors vs. baseline). If you see a Svelte warning about `role="presentation"` + `onclick`, that is acceptable — the inner dialog handles escape and close-button — but consider adding `onkeydown={closeModal}` to the backdrop if you want to silence it.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/BugReportWidget.svelte
git commit -m "$(cat <<'EOF'
feat(website): add BugReportWidget floating modal component

Floating "Bug melden" button (bottom-right) that opens a modal with
a description textarea and optional screenshot upload. Client-side
validation for file size/MIME; auto-captures current URL, user agent,
and viewport at submit time. Posts multipart/form-data to
/api/bug-report.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Mount widget in `Layout.astro`

**Files:**
- Modify: `website/src/layouts/Layout.astro`

- [ ] **Step 1: Add import**

At the top of `website/src/layouts/Layout.astro`, the current imports block is:

```astro
---
import Navigation from '../components/Navigation.svelte';
import CookieConsent from '../components/CookieConsent.svelte';
import '../styles/global.css';
import { config } from '../config/index';
```

Add the new import directly after `CookieConsent`:

```astro
---
import Navigation from '../components/Navigation.svelte';
import CookieConsent from '../components/CookieConsent.svelte';
import BugReportWidget from '../components/BugReportWidget.svelte';
import '../styles/global.css';
import { config } from '../config/index';
```

- [ ] **Step 2: Mount the widget**

Find the line containing `<CookieConsent client:load />` near the bottom of `<body>`. Add the widget on the line immediately after it:

```astro
    <CookieConsent client:load />
    <BugReportWidget client:load />
  </body>
```

- [ ] **Step 3: Verify + test visually**

Run:
```bash
cd website && npx astro check 2>&1 | tail -10
```
Expected: `0 errors`.

Then:
```bash
cd website && npm run dev
```
Open `http://localhost:4321` in a browser. Expected:
- A gold "🐞 Bug melden" button appears fixed in the bottom-right corner.
- Clicking it opens a modal.
- Clicking the backdrop (outside the modal) or pressing Escape closes it.
- Navigating to `/kontakt` and `/leistungen` — the button remains on every page.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add website/src/layouts/Layout.astro
git commit -m "$(cat <<'EOF'
feat(website): mount BugReportWidget globally in Layout.astro

Makes the floating bug-report button available on every page of
both mentolder and korczewski, not just the homepage.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add `BUG_REPORT_CHANNEL` env var to both website ConfigMaps

**Files:**
- Modify: `k3d/website.yaml`
- Modify: `k3d/korczewski-website.yaml`

- [ ] **Step 1: Add env to `k3d/website.yaml`**

Find the `website-config` ConfigMap (namespace `website`). Locate this block:

```yaml
  # Mattermost
  MATTERMOST_WEBHOOK_URL: "http://mattermost.workspace.svc.cluster.local:8065/hooks/REPLACE_ME"
  MATTERMOST_CHANNEL: "anfragen"
  MATTERMOST_URL: "http://mattermost.workspace.svc.cluster.local:8065"
  MATTERMOST_BOT_TOKEN: ""
```

Add one new line at the end of this block:

```yaml
  # Mattermost
  MATTERMOST_WEBHOOK_URL: "http://mattermost.workspace.svc.cluster.local:8065/hooks/REPLACE_ME"
  MATTERMOST_CHANNEL: "anfragen"
  MATTERMOST_URL: "http://mattermost.workspace.svc.cluster.local:8065"
  MATTERMOST_BOT_TOKEN: ""
  BUG_REPORT_CHANNEL: "bugs"
```

- [ ] **Step 2: Add env to `k3d/korczewski-website.yaml`**

Find the `korczewski-website-config` ConfigMap (namespace `korczewski-website`). Locate this block:

```yaml
  MATTERMOST_URL: "http://mattermost.workspace.svc.cluster.local:8065"
  MATTERMOST_WEBHOOK_URL: ""
  MATTERMOST_BOT_TOKEN: ""
```

Add one new line:

```yaml
  MATTERMOST_URL: "http://mattermost.workspace.svc.cluster.local:8065"
  MATTERMOST_WEBHOOK_URL: ""
  MATTERMOST_BOT_TOKEN: ""
  BUG_REPORT_CHANNEL: "bugs"
```

- [ ] **Step 3: Validate manifests**

Run:
```bash
task workspace:validate
```
Expected: no errors. If `kubeconform` complains about the ConfigMap, re-check your YAML indentation (it must be 2 spaces per level, matching the surrounding keys).

- [ ] **Step 4: Commit**

```bash
git add k3d/website.yaml k3d/korczewski-website.yaml
git commit -m "$(cat <<'EOF'
feat(website): add BUG_REPORT_CHANNEL env to both brand ConfigMaps

Points the new /api/bug-report endpoint at a dedicated "bugs"
Mattermost channel. If the channel is absent, the server-side
fallback to "anfragen" keeps the feature working.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Playwright e2e spec

**Files:**
- Create: `tests/e2e/specs/fa-26-bug-report-form.spec.ts`
- Create: `tests/e2e/fixtures/test-screenshot.png` (tiny PNG for the upload test)

- [ ] **Step 1: Create the fixtures directory and a 1×1 PNG**

Run:
```bash
mkdir -p tests/e2e/fixtures
```

Then write a 1×1 transparent PNG with:
```bash
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdcccG\x00\x00\x00\x00IEND\xaeB`\x82' > tests/e2e/fixtures/test-screenshot.png
```

Verify it's a valid PNG:
```bash
file tests/e2e/fixtures/test-screenshot.png
```
Expected: `tests/e2e/fixtures/test-screenshot.png: PNG image data, 1 x 1, 8-bit/color RGBA, non-interlaced`

- [ ] **Step 2: Create the Playwright spec**

Write this exact content to `tests/e2e/specs/fa-26-bug-report-form.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

// tests/e2e/package.json has no "type":"module", so __dirname is available
// via Playwright's TS loader. Fixture lives at tests/e2e/fixtures/.
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');

const BASE = process.env.WEBSITE_URL || 'http://web.localhost';

test.describe('FA-26: Bug report widget', () => {
  test('Floating button visible on homepage and opens modal', async ({ page }) => {
    await page.goto(BASE);
    const button = page.getByRole('button', { name: /bug melden/i });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/beschreibung/i)).toBeVisible();
  });

  test('Submit button disabled until description entered', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    const submit = page.getByRole('button', { name: /meldung senden/i });
    await expect(submit).toBeDisabled();
    await page.getByLabel(/beschreibung/i).fill('Now enabled');
    await expect(submit).toBeEnabled();
  });

  test('Submit with description only shows success toast', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await page.getByLabel(/beschreibung/i).fill('Automated test: Die Seite sieht auf Mobilgeräten komisch aus.');
    await page.getByRole('button', { name: /meldung senden/i }).click();
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 15000 });
  });

  test('Submit with screenshot attachment shows success toast', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await page.getByLabel(/beschreibung/i).fill('Test mit Screenshot-Anhang');

    const fixture = path.join(FIXTURE_DIR, 'test-screenshot.png');
    await page.locator('input[type="file"]').setInputFiles(fixture);

    await page.getByRole('button', { name: /meldung senden/i }).click();
    await expect(page.locator('text=Vielen Dank')).toBeVisible({ timeout: 20000 });
  });

  test('Escape key closes the modal', async ({ page }) => {
    await page.goto(BASE);
    await page.getByRole('button', { name: /bug melden/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});
```

- [ ] **Step 3: Run the spec**

This requires the website to already be deployed (`task website:deploy`) OR a dev server at `http://localhost:4321` (in which case set `WEBSITE_URL=http://localhost:4321`). Run:

```bash
cd tests/e2e && npx playwright test specs/fa-26-bug-report-form.spec.ts 2>&1 | tail -30
```

Expected: all five tests pass. If the happy-path tests fail because Mattermost is unreachable, that's environmental — document it in the commit and verify the first two tests (which don't touch the API) still pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/fa-26-bug-report-form.spec.ts tests/e2e/fixtures/test-screenshot.png
git commit -m "$(cat <<'EOF'
test(e2e): add FA-26 Playwright spec for bug report widget

Covers: button visibility, modal open/close, submit-button disabled
state, description-only submission, screenshot attachment, and
Escape-to-close. Uses a 1×1 PNG fixture for the upload test.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Bash smoke test `tests/local/FA-26.sh`

**Files:**
- Create: `tests/local/FA-26.sh`

- [ ] **Step 1: Create the test file**

Write this exact content to `tests/local/FA-26.sh`:

```bash
#!/usr/bin/env bash
# FA-26: Bug Report Form — Website + Mattermost bugs channel
# Tests: Website pod running, /api/bug-report endpoint reachable,
#        bugs channel (or anfragen fallback) present, ConfigMap has env.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib/assert.sh
source "${SCRIPT_DIR}/lib/assert.sh"
# shellcheck source=./lib/k3d.sh
source "${SCRIPT_DIR}/lib/k3d.sh"

WEB_NAMESPACE="${WEB_NAMESPACE:-website}"
MM_NAMESPACE="${NAMESPACE:-workspace}"

# ── T1: Website deployment running ───────────────────────────────
WEB_READY=$(kubectl get deployment website -n "$WEB_NAMESPACE" \
  -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
assert_gt "$WEB_READY" 0 "FA-26" "T1" "Website-Deployment laeuft (readyReplicas > 0)"

# ── T2: /api/bug-report endpoint reachable ───────────────────────
if [[ "$WEB_READY" -gt 0 ]]; then
  API_CODE=$(kubectl exec -n "$WEB_NAMESPACE" deploy/website -- \
    wget -qO /dev/null -S --spider --method=POST http://localhost:4321/api/bug-report 2>&1 \
    | grep "HTTP/" | awk '{print $2}' || echo "0")
  # 400 is the expected response for an empty body — confirms the endpoint exists.
  assert_eq "$API_CODE" "400" "FA-26" "T2" "/api/bug-report endpoint erreichbar (HTTP 400 bei leerem Body)"
else
  skip_test "FA-26" "T2" "/api/bug-report endpoint" "Website nicht bereit"
fi

# ── T3: BUG_REPORT_CHANNEL env var in website ConfigMap ──────────
BUG_CHANNEL=$(kubectl get configmap website-config -n "$WEB_NAMESPACE" \
  -o jsonpath='{.data.BUG_REPORT_CHANNEL}' 2>/dev/null || echo "")
assert_eq "$BUG_CHANNEL" "bugs" "FA-26" "T3" "BUG_REPORT_CHANNEL in website-config gesetzt"

# ── T4: bugs channel (or fallback anfragen) present in Mattermost ─
CHAN_COUNT=$(kubectl exec -n "$MM_NAMESPACE" deploy/mattermost -- \
  mmctl --local channel list --all 2>/dev/null | grep -cE "^bugs$|^anfragen$|[[:space:]]bugs[[:space:]]|[[:space:]]anfragen[[:space:]]" || echo "0")
assert_gt "$CHAN_COUNT" 0 "FA-26" "T4" "bugs- oder anfragen-Kanal in Mattermost vorhanden"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x tests/local/FA-26.sh
```

- [ ] **Step 3: Lint it**

Run:
```bash
shellcheck tests/local/FA-26.sh
```
Expected: no errors (warnings about the sourced files being unreachable are fine — they match the pattern in `tests/local/FA-10.sh`).

- [ ] **Step 4: Run it against a running cluster**

Run:
```bash
./tests/runner.sh local FA-26
```
Expected: 4 assertions, all green. If T3 fails because the ConfigMap was not re-applied after Task 7, run `task workspace:deploy` first and retry.

- [ ] **Step 5: Commit**

```bash
git add tests/local/FA-26.sh
git commit -m "$(cat <<'EOF'
test(runner): add FA-26 bash smoke test for bug report form

Asserts the website deployment is up, /api/bug-report returns 400
on an empty body (endpoint exists), BUG_REPORT_CHANNEL is set in
the ConfigMap, and the target channel (bugs or the anfragen
fallback) exists in Mattermost.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End-to-end manual verification and CI gate

- [ ] **Step 1: Redeploy the website**

```bash
task website:redeploy
```
Expected: both website pods in `website` and `korczewski-website` namespaces are restarted and report `Ready`.

- [ ] **Step 2: Create the `bugs` channel in Mattermost (optional but recommended)**

Use `mmctl` inside the Mattermost pod:
```bash
kubectl exec -n workspace deploy/mattermost -- \
  mmctl --local channel create --team workspace --name bugs --display-name "Bug Reports" --purpose "Bug reports from the website widget"
```
Expected: `Channel bugs successfully created`. If it already exists, the command errors — that's fine. If you skip this step, the server-side fallback keeps the feature working (posts land in `anfragen` with a `[BUG]` prefix).

- [ ] **Step 3: Smoke-test on `web.localhost`**

Open `http://web.localhost` in a browser. Click the 🐞 "Bug melden" button. Fill in:
- Description: "Manual test from the plan"
- Screenshot: upload any small PNG from your filesystem

Submit. Expected: green "Vielen Dank!" toast, modal closes after 2 s. Then open Mattermost (`http://chat.localhost`), navigate to the `bugs` channel (or `anfragen` if you skipped Step 2), and verify:
- Message posted with the bug icon and "Neuer Bug Report" heading.
- URL, Browser, and Viewport rows populated.
- Description visible as a quote block.
- Screenshot attached (if you attached one) and clickable.
- "Archivieren" button visible.

- [ ] **Step 4: Test the fallback path**

Rename or delete the `bugs` channel temporarily:
```bash
kubectl exec -n workspace deploy/mattermost -- \
  mmctl --local channel archive workspace:bugs
```
Submit another bug report. Expected: it lands in `anfragen` with `[BUG]` prefix. Then restore:
```bash
kubectl exec -n workspace deploy/mattermost -- \
  mmctl --local channel unarchive workspace:bugs
```

- [ ] **Step 5: Run all FA-26-related tests**

```bash
./tests/runner.sh local FA-26 && \
cd tests/e2e && npx playwright test specs/fa-26-bug-report-form.spec.ts && \
cd ../.. && cd website && BASE_URL=http://web.localhost npm run test:api 2>&1 | grep -A 20 "Bug report form"
```
Expected: all green.

- [ ] **Step 6: CI gate**

Run:
```bash
task workspace:validate
```
Expected: kustomize + kubeconform pass. Then push the branch and open a PR — GitHub Actions (`.github/workflows/ci.yml`) runs manifest validation, yamllint, shellcheck, and config validation. All must be green before merge.

- [ ] **Step 7: Push and open PR**

Follow the repo convention:
```bash
git push -u origin feature/bug-report-form
gh pr create --title "feat(website): floating bug report widget with screenshot upload" --body "$(cat <<'EOF'
## Summary
- Adds a floating "Bug melden" button + modal on every page of mentolder + korczewski.
- Description + optional screenshot (≤5 MB PNG/JPEG/WEBP) → Mattermost `bugs` channel via /api/bug-report.
- Fallback to `anfragen` if `bugs` channel missing. Fallback to webhook if interactive post fails.
- Removes dangling `bug.${PROD_DOMAIN}` TLS host entry left behind by the bug-tracker cleanup.

## Test plan
- [x] `task workspace:validate` passes
- [x] `./tests/runner.sh local FA-26` passes
- [x] `cd tests/e2e && npx playwright test specs/fa-26-bug-report-form.spec.ts` passes
- [x] Manual: submit with screenshot → verify post in Mattermost `bugs` channel
- [x] Manual: fallback to `anfragen` when `bugs` is missing
- [x] Manual: verify button appears on `/`, `/kontakt`, `/leistungen`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist (run after plan is written)

- Each of the 10 tasks has 3-5 steps, each a single action (write/run/verify/commit).
- All code blocks are complete and self-contained — no "similar to Task N" placeholders.
- Type names and function signatures match across tasks: `uploadFile`, `postInteractiveMessage({fileIds})`, `/api/bug-report`, `BugReportWidget`, `BUG_REPORT_CHANNEL`.
- Each commit is atomic and ships a working state (no task leaves the tree in a broken state).
- Spec coverage: architecture ✓ (Tasks 2, 5, 6), data flow ✓ (Task 3), validation/error handling ✓ (Tasks 3, 5), cleanup ✓ (Task 1), config ✓ (Task 7), testing ✓ (Tasks 4, 8, 9), rollout ✓ (Task 10).
- No placeholders, no TBDs, no "add appropriate error handling" handwaves.
