# Bug Report Form — Design

**Date:** 2026-04-14
**Status:** Approved
**Scope:** `website/` (serves both mentolder + korczewski brands)

## Goal

Give end users on `mentolder.de` and `korczewski.de` a lightweight way to report bugs — a short description plus an optional screenshot — from any page, without leaving the site. Reports land in a dedicated Mattermost `bugs` channel where they can be triaged alongside existing contact-form submissions.

## Context

The `website/` codebase is a single Astro+Svelte app that serves both brands via a `BRAND` env var. An existing `ContactForm.svelte` on `/kontakt` already posts to `/api/contact`, which forwards to Mattermost as an interactive message with Reply/Archive buttons. That form has a "bug" type but **no file upload**.

A previous attempt at a standalone Flask `bug-tracker` microservice exists as leftover manifests (`k3d/bug-tracker.yaml`, `prod/patch-bug-tracker.yaml`, `bug.mentolder.de` / `bug.korczewski.de` ingress), but the Python app was deleted and never worked. This spec replaces that attempt and includes cleanup of the leftovers in the same PR.

## Non-Goals

- No CAPTCHA (YAGNI — internal-ish audience; add later if spam becomes a problem).
- No virus scanning (Mattermost handles its own file scanning).
- No authentication (public form — matches existing contact form).
- No rate limiting in this PR (parity with `/api/contact`; revisit if abused).
- No persistent bug-report database on our side — Mattermost is the system of record.

## Architecture

### New files

- `website/src/components/BugReportWidget.svelte` — the floating button + modal form.
- `website/src/pages/api/bug-report.ts` — Astro API endpoint that accepts `multipart/form-data`.

### Modified files

- `website/src/layouts/Layout.astro` — mount `<BugReportWidget client:load />` once, globally, so the button appears on every page.
- `website/src/lib/mattermost.ts` — add a `uploadFile({ channelId, file, filename })` helper that calls `POST /api/v4/files?channel_id=<id>` and returns a `file_id`. Extend `postInteractiveMessage` and `postWebhook` to accept an optional `file_ids: string[]` array.
- `k3d/website.yaml` and `k3d/korczewski-website.yaml` — add `BUG_REPORT_CHANNEL=bugs` to each ConfigMap.

### Deletions (same PR)

- `bug_tracker/` directory (already tombstoned in git status — stage the deletions).
- `k3d/bug-tracker.yaml`.
- `prod/patch-bug-tracker.yaml`.
- Remove the `bug-tracker.yaml` entry from `k3d/kustomization.yaml`.
- Remove the corresponding entry from `prod/kustomization.yaml`.
- Grep the repo for `bug.mentolder.de`, `bug.korczewski.de`, `bug-tracker`, and `bug.localhost`. Remove every leftover reference (ingress rules, middlewares, Traefik routes, docs). Exact files to touch will be enumerated in the implementation plan after a verification grep.

## Component Design

### `BugReportWidget.svelte`

**Button state:**
- Fixed-position button in the bottom-right corner of the viewport (`position: fixed; bottom: 1.5rem; right: 1.5rem`), high z-index so it sits above normal content.
- Label: "Bug melden" with a bug icon.
- Styled to match the dark theme used by the rest of the site (`bg-gold`, `text-dark`, hover states).
- Accessible: `aria-label="Fehler melden"`, keyboard-focusable, visible focus ring.

**Modal state (opens on click):**
- Centered modal with overlay backdrop, closable via Esc, overlay click, or close button.
- Fields:
  - `<textarea>` for description — `required`, `maxlength=2000`, placeholder "Was ist passiert? Was haben Sie erwartet?".
  - `<input type="file" accept="image/png,image/jpeg,image/webp">` for screenshot — optional; shows selected filename + size + "Entfernen" button when a file is picked.
- Submit button disabled until description has non-whitespace content.
- On submit: disable button (prevent double-submit), show spinner.
- Success state: green toast "Vielen Dank! Ihre Meldung wurde übermittelt.", modal auto-closes after 2 s, form resets.
- Error state: red inline banner inside the modal with the error message, values preserved.

**Context auto-capture (read at submit time, not open time):**
- `window.location.href`
- `navigator.userAgent`
- `${window.innerWidth}x${window.innerHeight}`

**Client-side validation:**
- Description: trimmed non-empty, ≤2000 chars.
- File (if present): size ≤5 MB, MIME ∈ `{image/png, image/jpeg, image/webp}`. Rejections show inline errors without attempting submit.

**Submit flow:**
- Build `FormData` with `description`, `screenshot?`, `url`, `userAgent`, `viewport`.
- `fetch('/api/bug-report', { method: 'POST', body: formData })` (no explicit `Content-Type` — browser sets the multipart boundary).
- Handle `response.ok` → success; otherwise show `data.error` or a generic message.
- Network exception → "Verbindungsfehler. Bitte versuchen Sie es erneut."

### `/api/bug-report` Astro endpoint

**Request:** `POST /api/bug-report` with `multipart/form-data` body.

**Parsing:**
- `await request.formData()` to get the fields.
- `description = formData.get('description')?.toString().trim()`
- `screenshot = formData.get('screenshot') as File | null`
- `url`, `userAgent`, `viewport` as strings.

**Server-side validation (never trust the client):**
- `description` present, non-empty, ≤2000 chars → else 400 with `{ error: "Bitte beschreiben Sie das Problem." }`.
- If `screenshot` is a `File` and `size > 0`:
  - `size ≤ 5 * 1024 * 1024` → else 400 with `{ error: "Datei zu groß (max. 5 MB)." }`.
  - `type ∈ { 'image/png', 'image/jpeg', 'image/webp' }` → else 400 with `{ error: "Dateiformat nicht unterstützt." }`.

**Processing pipeline:**
1. Resolve channel: `channelName = process.env.BUG_REPORT_CHANNEL ?? 'bugs'`. `teamId = await getFirstTeamId()`; `channelId = await getChannelByName(teamId, channelName)`.
2. If `channelId` is null → fall back to `getChannelByName(teamId, 'anfragen')` and prefix the message with `[BUG]`. Log a warning; do not fail the request.
3. If `screenshot` is present and `channelId` is resolved: `fileId = await uploadFile({ channelId, file: screenshot, filename: screenshot.name })`. If this throws, log the error, set `fileId = null`, and append `⚠️ Screenshot-Upload fehlgeschlagen` to the message body.
4. Format the message as markdown:
   ```
   ### :bug: Neuer Bug Report

   | Feld | Inhalt |
   |------|--------|
   | **URL** | <url> |
   | **Browser** | <userAgent> |
   | **Viewport** | <viewport> |

   **Beschreibung:**
   > <description with newlines → `\n> `>
   ```
5. `postInteractiveMessage({ channelId, text, fileIds: fileId ? [fileId] : undefined, actions: [{ id: 'archive_bug', name: 'Archivieren', style: 'default' }] })`.
6. If the interactive post throws → `postWebhook({ channel: channelName, username: 'Bug-Bot', icon_emoji: ':bug:', text })` as fallback. File won't be attached in the webhook path (webhooks don't support file_ids) — log it, but the report itself still lands.
7. If the webhook also throws → 500 with `{ error: "Interner Serverfehler. Bitte versuchen Sie es später erneut." }`.
8. On success → 200 with `{ success: true }`.

### `lib/mattermost.ts` extensions

- **`uploadFile({ channelId, file, filename })`** — new function:
  - `POST ${MATTERMOST_URL}/api/v4/files?channel_id=<id>` with `Authorization: Bearer <bot-token>` and a `multipart/form-data` body containing the file under the `files` field.
  - Returns the first `file_infos[].id` from the JSON response.
  - Throws on non-2xx.
- **`postInteractiveMessage`** — add optional `fileIds?: string[]` param. When set, include `"file_ids": fileIds` as a top-level field on the post body sent to `POST /api/v4/posts` (per the Mattermost posts API schema). Interactive actions remain inside `props.attachments[].actions` as they are today.
- **`postWebhook`** — no change to signature (webhooks do not support file attachments). Document this in the JSDoc.

## Data Flow Diagram

```
[User clicks floating "Bug melden" button]
         ↓
[Modal opens: description textarea + optional file input]
         ↓ user fills, clicks submit
[BugReportWidget.svelte: validate client-side]
         ↓ build FormData with url/UA/viewport
[POST /api/bug-report]
         ↓
[Astro endpoint: validate server-side]
         ↓
[Resolve teamId → channelId('bugs')]
         ↓ (fallback: 'anfragen' with [BUG] prefix if missing)
[If screenshot: uploadFile → file_id]
         ↓ (fallback: post without image if upload fails)
[postInteractiveMessage with text + file_ids + Archive button]
         ↓ (fallback: postWebhook text-only)
[200 { success: true }]
         ↓
[Modal: success toast → reset → close after 2s]
```

## Error Handling Summary

| Failure                                    | Behavior                                                             |
|--------------------------------------------|----------------------------------------------------------------------|
| Description empty                          | 400, inline error in modal, form stays open                          |
| File > 5 MB                                | Rejected client-side before submit; also 400 on server               |
| File wrong MIME                            | Rejected client-side; also 400 on server                             |
| `bugs` channel missing                     | Fall back to `anfragen` with `[BUG]` prefix, log warning             |
| Mattermost file upload fails               | Post message without screenshot + append `⚠️ upload fehlgeschlagen`  |
| Interactive post fails                     | Fall back to webhook (text-only)                                     |
| Both interactive and webhook fail          | 500 `Interner Serverfehler`, user can retry                          |
| Network error from browser                 | Modal shows `Verbindungsfehler`, values preserved                    |

## Configuration

### New env var

- `BUG_REPORT_CHANNEL` — Mattermost channel name for bug reports. Default: `bugs`. Added to both `k3d/website.yaml` and `k3d/korczewski-website.yaml` ConfigMaps.

### Channel provisioning

Extend the existing Mattermost setup path (wherever `task mcp:mattermost-setup` creates the `anfragen`/`claude-code` channels) to idempotently create a `bugs` channel alongside. No runtime risk: if the channel doesn't exist, the fallback to `anfragen` keeps the feature working.

### No new secrets

The existing `MATTERMOST_BOT_TOKEN` already has permission to post messages and upload files. No changes to `k3d/secrets.yaml`.

## Testing

### Playwright e2e: `tests/e2e/specs/fa-26-bug-report-form.spec.ts`

Mirrors the pattern in `fa-10-mattermost-form.spec.ts`.

1. Navigate to homepage.
2. Assert floating "Bug melden" button is visible.
3. Click button → assert modal opens with description textarea + file input.
4. Submit with description only → assert success toast appears, modal auto-closes.
5. Submit with description + small fixture PNG (< 100 KB, checked-in under `tests/e2e/fixtures/`) → assert success toast.
6. Try to submit with empty description → assert submit button is disabled OR inline error appears on click.
7. (Optional) Attach a fixture > 5 MB → assert inline size error, no network call.
8. API-level smoke: `POST /api/bug-report` with raw `FormData` → assert 200 + `{ success: true }`.

### Test registration

Add `FA-26` to the test registry read by `tests/runner.sh` — grep for the existing `FA-10` entry and add `FA-26` the same way.

### Manual verification checklist (before reporting done)

- `task website:dev` → open `http://localhost:4321`, click button, submit with screenshot → verify the post lands in the Mattermost `bugs` channel with the image attached and the URL/UA/viewport row populated.
- Repeat on `/kontakt` and `/leistungen` to verify the widget works on every page (it lives in `Layout.astro`).
- `task workspace:validate` → Kustomize still builds after the deletions.
- `./tests/runner.sh local FA-26` → green.
- Submit with the `bugs` channel temporarily renamed → verify the fallback lands in `anfragen` with the `[BUG]` prefix.

## Rollout

1. Merge to `main` via PR (squash-merge, per repo rules).
2. `task website:redeploy` — rebuilds and restarts both brand deployments from the shared image.
3. `task mcp:mattermost-setup` — provisions the new `bugs` channel.
4. Smoke test on both `web.mentolder.de` and `web.korczewski.de`.

## Open Questions

None — all decisions confirmed during brainstorming (backend = Mattermost; UX = floating button + modal; fields = description + optional screenshot; constraints = single file ≤5 MB PNG/JPEG/WEBP; cleanup included in this PR; rate limiting deferred to a later PR).
