---
title: Mediaviewer Fleet Streaming Fix Implementation Plan
ticket_id: T000879
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Mediaviewer Fleet Streaming Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mediaviewer.<brand>` stream help videos in Portal-Sidekick sessions on the fleet cluster, by wiring the prod oauth2-proxy patch (G2), threading the VideoVault host through the website video-bridge so a non-empty, prod-host-rewritten video list reaches the widget (G3+G4), and hardening the already-merged Phase-2c server-side split backend against path-traversal and unauthenticated access (2 MEDIUM findings).

**Architecture:** Three independent fix surfaces, one consolidated `fix/*` PR (explicit user decision "alles gemeinsam mergen"):
- **(A) infra** — wire `prod/patch-oauth2-proxy-mediaviewer.yaml` into `prod/kustomization.yaml` so the live oauth2-proxy-mediaviewer runs prod config (HTTPS redirect-url, `cookie-secure=true`) instead of the dev placeholder that breaks the SSO iframe on HTTPS.
- **(B) website** — add a pure `resolveHelpVideos(host)` rewrite helper, thread a `VIDEOVAULT_DOMAIN` configMapKeyRef → `PortalLayout` SSR env → `PortalSidekick` prop → `resolveHelpVideos()` → `MediaviewerPanel videos`, so the postMessage bridge pushes a non-empty, prod-host list instead of nothing.
- **(C) VideoVault security** — the Phase-2c split backend is ALREADY merged in main (PR #1727, commit `df274541`); only its two MEDIUM findings remain: a path-traversal in `split-handler.ts` (attacker-controlled `filename` → arbitrary file write) and an auth gap in the `POST /:id/split` route (no authenticated-user gate).

**Tech Stack:** Astro (SSR layouts) · Svelte 5 (`$props`/`$state`/`$effect` runes) · Zod · Vitest · Kustomize / oauth2-proxy / Keycloak OIDC · Express + Drizzle (VideoVault server, vendored under `VideoVault/`).

---

## Verified Context & Diagnosis Corrections

The original ticket diagnosis was field-verified against the live worktree. **Three corrections** the executor must respect:

1. **Phase-2c is ALREADY merged into `main`.** All net-new 2c files (`VideoVault/server/handlers/split-handler.ts` + `.test.ts`, `VideoVault/server/routes/split.ts` + `.test.ts`, `VideoVault/client/src/services/video-splitter-backend.ts` + `.test.ts`, the `routes.ts` mount) are present and **byte-identical** to commit `f27bf7fe` (landed via PR #1727, `df274541 feat(videovault): Phase 2c — server-side split backend`). **Do NOT cherry-pick or merge `feature/videovault-migration-2b`** — it would conflict/duplicate. Phase C below is **only the two security fixes**, applied to the already-merged code.

2. **VideoVault does NOT read oauth2-proxy headers (`X-Forwarded-User` etc.).** Its server authenticates via its own auth-service: `fetchAuthUser(req)` (Bearer token / `accessToken` cookie → `${AUTH_SERVICE_URL}/api/auth/verify`) plus a `requireAdmin` middleware in `VideoVault/server/routes.ts:113`. There is **no per-user ownership** on `directoryRoots` (schema `VideoVault/shared/videovault/schema.ts:74` has only `rootKey`/`name`/`directories`; presets are "shared across users"; `users` table has just `username`/`password`/`isAdmin`). The realistic IDOR fix is therefore **gate the split route behind an authenticated-user check (reuse the existing `requireAdmin` pattern)**, not per-user root ownership which the data model cannot express.

3. **Canonical config key for the VideoVault host is `VIDEOVAULT_DOMAIN`** (already in `environments/schema.yaml:187`, all `environments/*.yaml`, and `k3d/configmap-domains.yaml:36`), **not** the `VIDEOVAULT_HOST` the ticket proposed. Reuse `VIDEOVAULT_DOMAIN` — do NOT invent a new var (avoids a new schema entry + new envsubst-list registration in every task).

**Pre-seeded artifacts already in the working tree** (restored after a worktree reap; treat as Task 0 inputs, do not recreate):
- `prod/patch-oauth2-proxy-mediaviewer.yaml` (untracked, 42 lines) — the prod oauth2-proxy patch.
- `website/src/lib/help-videos.test.ts` (modified) — the RED failing test importing `resolveHelpVideos`.

---

## File Structure

| File | Responsibility | Phase |
|------|----------------|-------|
| `prod/kustomization.yaml` | Wire the mediaviewer oauth2-proxy patch into the prod overlay patch list | A |
| `prod/patch-oauth2-proxy-mediaviewer.yaml` | (already present) prod oauth2-proxy-mediaviewer args + secret env | A |
| `website/src/lib/help-videos.ts` | Add pure `resolveHelpVideos(host)` rewrite helper (no DB/API imports → S2-clean) | B |
| `website/src/lib/help-videos.test.ts` | (already RED) tests for `resolveHelpVideos` | B |
| `k3d/website.yaml` | Add `VIDEOVAULT_DOMAIN` configMapKeyRef env to the website container | B |
| `prod-fleet/website-common/domain-config.yaml` | Add `VIDEOVAULT_DOMAIN` to the website-ns shared ConfigMap (bats-parity + CreateContainerConfigError guard) | B |
| `website/src/layouts/PortalLayout.astro` | Read `process.env.VIDEOVAULT_DOMAIN`, pass to `<PortalSidekick videovaultHost=…>` | B |
| `website/src/components/PortalSidekick.svelte` | Accept `videovaultHost` prop, call `resolveHelpVideos()`, pass `videos` to `<MediaviewerPanel>` | B |
| `VideoVault/server/handlers/split-handler.ts` | Path-traversal hardening on `first.filename`/`second.filename` | C |
| `VideoVault/server/handlers/split-handler.test.ts` | RED test: `../`-filename → `invalid_split` | C |
| `VideoVault/server/routes/split.ts` | Authenticated-user gate on `POST /:id/split` | C |
| `VideoVault/server/routes/split.test.ts` | RED test: unauthenticated → 401/403 | C |

---

## S1 Line Budgets (verified against `docs/code-quality/baseline.json`)

All touched files are **`nicht-baselined`** → effective threshold is the static extension limit; budget = limit − current.

| File | Ext limit | Current `wc -l` | Budget | Plan note |
|------|-----------|-----------------|--------|-----------|
| `prod/kustomization.yaml` | (yaml — not in S1 ext set) | 233 | n/a | +1 line (patch path) |
| `prod/patch-oauth2-proxy-mediaviewer.yaml` | n/a | 42 | n/a | no change after Task 0 |
| `website/src/lib/help-videos.ts` | 600 (.ts) | 19 | **~581** | +~14 lines → ~33; safe |
| `k3d/website.yaml` | (yaml) | 802 | n/a | +4 lines (env block) |
| `prod-fleet/website-common/domain-config.yaml` | (yaml) | ~14 | n/a | +1 line |
| `website/src/layouts/PortalLayout.astro` | 400 (.astro) | 338 | **62** | +2 lines → 340; safe |
| `website/src/components/PortalSidekick.svelte` | 500 (.svelte) | 403 | **97** | +~6 lines → ~409; safe (< 80% of 500) |
| `VideoVault/server/handlers/split-handler.ts` | 600 (.ts) | 126 | **~474** | +~12 lines; safe |
| `VideoVault/server/handlers/split-handler.test.ts` | 600 (.ts) | 85 | **~515** | +~10 lines; safe |
| `VideoVault/server/routes/split.ts` | 600 (.ts) | 24 | **~576** | +~12 lines; safe |
| `VideoVault/server/routes/split.test.ts` | 600 (.ts) | 50 | **~550** | +~15 lines; safe |

> No file approaches 80% of its threshold after the change → **no module split required**. `.yaml` is not in the S1 ext set (S1 limits cover `.ts/.js/.jsx/.py/.svelte/.sh/.mjs/.mts/.astro/.tsx/.java/.php/.bash/.cjs`), so the manifest line adds are S1-irrelevant; they only need S4 (orphan) + S3 (no host literals) compliance.

**S3 note:** No brand-domain literal (`mediaviewer.mentolder.de`, `videovault.korczewski.de`, …) may appear in `k3d/`, `prod*/`, or `website/src/` code. The patch uses `${PROD_DOMAIN}`; the website resolves the host from `process.env.VIDEOVAULT_DOMAIN`. The brand-domain strings that appear in `help-videos.test.ts` are **test files** — those are exercised only by Vitest, but the S3 scanner also greps `website/src/`. **Verify** in the final phase that the S3 check excludes `*.test.ts` or treats the values as test fixtures; if it flags them, the strings live behind the function argument (caller-supplied) and the assertion strings are unavoidable for the test — if S3 is strict, move the expected-host constants into the test via a `const PROD = 'videovault.' + 'mentolder.de'` split is NOT acceptable (cosmetic). Instead, if flagged, the test asserts on the absence of `.localhost` and on `startsWith('https://' + host + '/')` using the passed-in `host` variable (already the case for the second test). See Task B2 for the S3-safe test shape.

**S4 note:** `prod/patch-oauth2-proxy-mediaviewer.yaml` becomes referenced by `prod/kustomization.yaml` in Task A1 (no orphan). No new scripts.

---

## Phase A — G2: wire the prod oauth2-proxy-mediaviewer patch

**Why:** The live `oauth2-proxy-mediaviewer` runs the dev placeholder (`--redirect-url=http://mediaviewer.localhost/oauth2/callback`, `--cookie-secure=false`) → the SSO iframe fails over HTTPS, so the streaming chain never reaches the widget. The fix patch exists but is **not referenced** by any kustomization, so `kustomize build prod-fleet/<brand>` never emits it.

### Task A0: Confirm the pre-seeded patch is present and correct

**Files:**
- Verify: `prod/patch-oauth2-proxy-mediaviewer.yaml`

- [ ] **Step 1: Confirm the patch file exists and targets the right Deployment**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-mediaviewer-fleet-streaming
test -f prod/patch-oauth2-proxy-mediaviewer.yaml && \
  grep -q 'name: oauth2-proxy-mediaviewer' prod/patch-oauth2-proxy-mediaviewer.yaml && \
  grep -q 'redirect-url=https://mediaviewer.${PROD_DOMAIN}/oauth2/callback' prod/patch-oauth2-proxy-mediaviewer.yaml && \
  grep -q 'cookie-secure=true' prod/patch-oauth2-proxy-mediaviewer.yaml && \
  grep -q 'key: MEDIAVIEWER_OIDC_CLIENT_SECRET' prod/patch-oauth2-proxy-mediaviewer.yaml && \
  echo "PATCH OK"
```
Expected: `PATCH OK`. If absent, the patch is the one shown verbatim in the ticket (42 lines); recreate it before proceeding.

### Task A1: Reference the patch in `prod/kustomization.yaml`

**Files:**
- Modify: `prod/kustomization.yaml` (in the `patches:` list, after `- path: patch-oauth2-proxy-brett.yaml`)

- [ ] **Step 1: Insert the patch path**

In the `patches:` block, immediately after the line `  - path: patch-oauth2-proxy-brett.yaml`, add:
```yaml
  - path: patch-oauth2-proxy-mediaviewer.yaml
```
The surrounding context becomes:
```yaml
  - path: patch-oauth2-proxy-mailpit.yaml
  - path: patch-oauth2-proxy-brett.yaml
  - path: patch-oauth2-proxy-mediaviewer.yaml
  - path: patch-brett.yaml
```

- [ ] **Step 2: Verify the patch now appears in the built overlay for both brands**

Run:
```bash
kustomize build prod-fleet/mentolder/ --load-restrictor=LoadRestrictionsNone \
  | grep -A2 'name: oauth2-proxy-mediaviewer' | grep -q 'mediaviewer-widget' \
  && echo "MENTOLDER OK"
kustomize build prod-fleet/korczewski/ --load-restrictor=LoadRestrictionsNone \
  | grep -q 'oauth2-proxy-mediaviewer' && echo "KORCZEWSKI OK"
```
Expected: `MENTOLDER OK` and `KORCZEWSKI OK`. (The `client-id: mediaviewer-widget` arg confirms the patch merged, not just the base.)

- [ ] **Step 3: Confirm `${PROD_DOMAIN}` is in the deploy envsubst list (no new var needed)**

The patch only references `${PROD_DOMAIN}`, which is already substituted by `workspace:deploy` (the base prod build path). The secret `MEDIAVIEWER_OIDC_CLIENT_SECRET` is resolved at **runtime** via `secretKeyRef` from `workspace-secrets` (NOT envsubst), and is already present in all four sealed-secret files. Confirm:
```bash
grep -l MEDIAVIEWER_OIDC_CLIENT_SECRET environments/sealed-secrets/*.yaml | sort
```
Expected: lists `fleet-korczewski.yaml`, `fleet-mentolder.yaml`, `korczewski.yaml`, `mentolder.yaml` (do NOT print secret contents). If any brand's sealed secret is missing the key, STOP and flag — the oauth2-proxy pod will `CreateContainerConfigError`.

- [ ] **Step 4: Commit**

```bash
git add prod/kustomization.yaml prod/patch-oauth2-proxy-mediaviewer.yaml
git commit -m "fix(infra): wire prod oauth2-proxy-mediaviewer patch into overlay (T000879 G2)"
```

---

## Phase B — G3+G4: thread the VideoVault host through the website video bridge

**Why:** `PortalSidekick.svelte:261` renders `<MediaviewerPanel {mediaviewerHost} />` with **no `videos` prop** → the bridge pushes an empty list → nothing plays (G3). Even if a list were passed, `help-videos.json` URLs are hard-coded to `https://videovault.localhost/...`, which never resolves in prod (G4). Fix: a pure host-rewrite helper, plus a new `VIDEOVAULT_DOMAIN` thread through configMap → Astro SSR → Svelte prop.

### Task B1: Add the `resolveHelpVideos` pure helper (make the RED test green)

**Files:**
- Modify: `website/src/lib/help-videos.ts`
- Test: `website/src/lib/help-videos.test.ts` (already RED — do not edit further unless S3 requires, see B2)

- [ ] **Step 1: Run the pre-seeded test to confirm it fails RED**

Run:
```bash
cd website && pnpm vitest run src/lib/help-videos.test.ts
```
Expected: FAIL — `resolveHelpVideos` is not exported (`No "resolveHelpVideos" export is defined`).

- [ ] **Step 2: Implement `resolveHelpVideos` as a pure function**

Append to `website/src/lib/help-videos.ts` (after `loadHelpVideos`):
```ts
const DEV_VIDEOVAULT_HOST = 'videovault.localhost';

/**
 * Rewrite the dev VideoVault host (videovault.localhost) in each help-video URL
 * to the configured prod host. Pure: parses the shipped manifest and remaps the
 * URL host only when it equals the dev placeholder. In prod, `videovaultHost`
 * comes from the VIDEOVAULT_DOMAIN config (PortalLayout SSR → PortalSidekick).
 * Falls back to the unmodified manifest when the URL is unparseable.
 */
export function resolveHelpVideos(videovaultHost: string): HelpVideo[] {
  return loadHelpVideos().map((v) => {
    try {
      const u = new URL(v.url);
      if (u.hostname === DEV_VIDEOVAULT_HOST) {
        u.hostname = videovaultHost;
        return { ...v, url: u.toString() };
      }
      return v;
    } catch {
      return v;
    }
  });
}
```

Notes:
- **S2-pure:** imports only `loadHelpVideos`/`HelpVideo` from the same module (no DB/API import) → no new import cycle.
- The `URL` constructor preserves `https://` and the path, so `https://videovault.localhost/media/help/x.mp4` → `https://videovault.mentolder.de/media/help/x.mp4`.
- In **dev**, `videovaultHost === 'videovault.localhost'` (from `environments/dev.yaml`) → URLs are rewritten host→host (no-op), so dev still works.

- [ ] **Step 3: Run the test to verify GREEN**

Run:
```bash
pnpm vitest run src/lib/help-videos.test.ts
```
Expected: PASS (all `resolveHelpVideos` + existing `loadHelpVideos`/`HelpVideoSchema` cases green).

- [ ] **Step 4: Commit**

```bash
cd ..
git add website/src/lib/help-videos.ts website/src/lib/help-videos.test.ts
git commit -m "feat(website): resolveHelpVideos host-rewrite helper (T000879 G4)"
```

### Task B2: S3 guard — confirm the test does not trip the hardcoded-host scanner

**Files:**
- Inspect: `website/src/lib/help-videos.test.ts`
- Reference: the S3 check in `docs/code-quality/gates.yaml` / `scripts/code-quality/check.mjs`

- [ ] **Step 1: Check whether S3 scans test files**

Run:
```bash
node scripts/code-quality/check.mjs 2>&1 | grep -i 'help-videos.test\|videovault.mentolder\|videovault.korczewski' || echo "S3 CLEAN for test"
```
Expected: `S3 CLEAN for test` (test files are typically excluded from the S3 host-literal scan).

- [ ] **Step 2: If — and only if — S3 flags `videovault.mentolder.de` in the test**, refactor the first test to assert on the passed-in host variable instead of a literal substring (S3-safe shape):
```ts
  it('rewrites the dev videovault host to the configured prod host', () => {
    const host = 'videovault.mentolder.de';
    const videos = resolveHelpVideos(host);
    expect(videos.length).toBeGreaterThan(0);
    for (const v of videos) {
      expect(v.url.startsWith(`https://${host}/`)).toBe(true);
      expect(v.url).not.toContain('.localhost');
    }
  });
```
Then re-run `pnpm vitest run src/lib/help-videos.test.ts` (Expected: PASS) and re-run the S3 check (Expected: clean). If S3 was already clean in Step 1, **skip this step** — do not modify a green test.

- [ ] **Step 3: Commit only if Step 2 ran**

```bash
git add website/src/lib/help-videos.test.ts
git commit -m "test(website): S3-safe host assertion in resolveHelpVideos test (T000879)"
```

### Task B3: Add `VIDEOVAULT_DOMAIN` env to the website container

**Files:**
- Modify: `k3d/website.yaml` (after the `MEDIAVIEWER_HOST` env block, ~line 437)

- [ ] **Step 1: Add the configMapKeyRef env**

Immediately after the existing `MEDIAVIEWER_HOST` block:
```yaml
            - name: MEDIAVIEWER_HOST
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: MEDIAVIEWER_HOST
```
add:
```yaml
            - name: VIDEOVAULT_DOMAIN
              valueFrom:
                configMapKeyRef:
                  name: domain-config
                  key: VIDEOVAULT_DOMAIN
```

- [ ] **Step 2: Add `VIDEOVAULT_DOMAIN` to the website-ns shared domain-config (CreateContainerConfigError guard + bats parity)**

The website reads `domain-config` from the **website namespace**, supplied by the shared overlay ConfigMap. A new required `configMapKeyRef` key that is absent there causes `CreateContainerConfigError` on a fresh `website:deploy` (reference: PR #1735 footgun), and the `tests/unit/website-domain-config-overlay.bats` parity test fails CI.

In `prod-fleet/website-common/domain-config.yaml`, under `data:`, after the `MEDIAVIEWER_HOST` line, add:
```yaml
  VIDEOVAULT_DOMAIN: "videovault.${PROD_DOMAIN}"
```
(`${PROD_DOMAIN}` is already in the `website:deploy` envsubst list — Taskfile.yml line ~3570 — so no envsubst-list change is needed. The shared ConfigMap intentionally carries **no** `metadata.namespace`; do not add one.)

- [ ] **Step 3: Verify the bats parity guard passes**

Run:
```bash
cd /home/patrick/Bachelorprojekt/tmp/wt-mediaviewer-fleet-streaming
./tests/runner.sh local website-domain-config-overlay 2>/dev/null \
  || bats tests/unit/website-domain-config-overlay.bats
```
Expected: all tests pass — specifically "parity: every domain-config configMapKeyRef key in website.yaml is in the shared ConfigMap" (now finds both `MEDIAVIEWER_HOST` and `VIDEOVAULT_DOMAIN`).

- [ ] **Step 4: Verify the website overlay still builds for both brands**

Run:
```bash
kustomize build prod-fleet/website-mentolder --load-restrictor=LoadRestrictionsNone >/dev/null && echo "WEBSITE-MENTOLDER OK"
kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone >/dev/null && echo "WEBSITE-KORCZEWSKI OK"
```
Expected: both `OK`.

- [ ] **Step 5: Commit**

```bash
git add k3d/website.yaml prod-fleet/website-common/domain-config.yaml
git commit -m "feat(infra): expose VIDEOVAULT_DOMAIN to website container (T000879 G4)"
```

### Task B4: Thread `videovaultHost` through PortalLayout → PortalSidekick → MediaviewerPanel

**Files:**
- Modify: `website/src/layouts/PortalLayout.astro` (frontmatter ~line 14, render ~line 298)
- Modify: `website/src/components/PortalSidekick.svelte` (props ~line 14-24, import ~line 11, render ~line 261)

- [ ] **Step 1: Read the configured host in the Astro SSR frontmatter**

In `website/src/layouts/PortalLayout.astro`, after the existing line 14:
```ts
const MEDIAVIEWER_HOST = process.env.MEDIAVIEWER_HOST ?? 'mediaviewer.localhost';
```
add:
```ts
const VIDEOVAULT_HOST = process.env.VIDEOVAULT_DOMAIN ?? 'videovault.localhost';
```

- [ ] **Step 2: Pass it to the Sidekick**

At line ~298, change:
```astro
    <PortalSidekick client:load helpSection={section} helpContext="portal" mediaviewerHost={MEDIAVIEWER_HOST} />
```
to:
```astro
    <PortalSidekick client:load helpSection={section} helpContext="portal" mediaviewerHost={MEDIAVIEWER_HOST} videovaultHost={VIDEOVAULT_HOST} />
```

- [ ] **Step 3: Accept the prop and resolve the videos in PortalSidekick**

In `website/src/components/PortalSidekick.svelte`:

(a) Add the import after line 11 (`import MediaviewerPanel from './MediaviewerPanel.svelte';`):
```ts
  import { resolveHelpVideos } from '../lib/help-videos';
```

(b) Add the prop to the `$props()` destructure + type block (after `mediaviewerHost`):
```ts
  let {
    helpSection = '',
    helpContext = 'portal' as HelpContext,
    mediaviewerHost = 'mediaviewer.localhost',
    videovaultHost = 'videovault.localhost',
  }: {
    helpSection?: string;
    helpContext?: HelpContext;
    mediaviewerHost?: string;
    videovaultHost?: string;
  } = $props();
```

(c) Derive the video list (pure, runs once per host value). Add near the other `$derived`/`$state` declarations (e.g. just after the `$props()` block):
```ts
  const mediaviewerVideos = $derived(resolveHelpVideos(videovaultHost));
```

(d) Pass it to the panel at line ~261, changing:
```svelte
      <MediaviewerPanel {mediaviewerHost} />
```
to:
```svelte
      <MediaviewerPanel {mediaviewerHost} videos={mediaviewerVideos} />
```

- [ ] **Step 4: Typecheck + build the website**

Run:
```bash
cd website && pnpm check && pnpm build
```
Expected: typecheck passes (no missing-prop / type errors); `astro build` succeeds. (A build failure here catches the kind of undefined-identifier/hydration regression seen in T000712.)

- [ ] **Step 5: Verify line budgets did not regress**

Run:
```bash
cd ..
wc -l website/src/components/PortalSidekick.svelte website/src/layouts/PortalLayout.astro
```
Expected: PortalSidekick ≤ ~409 (< 500), PortalLayout ≤ ~340 (< 400). Both well under their S1 limits.

- [ ] **Step 6: Commit**

```bash
git add website/src/layouts/PortalLayout.astro website/src/components/PortalSidekick.svelte
git commit -m "feat(website): pass resolved help videos to mediaviewer panel (T000879 G3)"
```

---

## Phase C — VideoVault Phase-2c security hardening (2 MEDIUM findings)

**Why:** Phase-2c server-side split is already merged (PR #1727). Two MEDIUM findings remain in the merged code. Each gets a RED test first (TDD), then the minimal fix.

> **Test runner note:** VideoVault is vendored and has its **own** Vitest (`VideoVault/package.json` → `test:server` / `test:client`); it is NOT part of the root `task test:changed` scope. Server unit tests run with `cd VideoVault && npm run test:server` (or `npx vitest run server/...`). Install deps first if needed: `cd VideoVault && npm install --legacy-peer-deps`. The `build-videovault.yml` CI gate runs `npm run check && npm run test:client` on `VideoVault/**` push — so the **server** tests added here are local-gate; run them locally before pushing.

### Task C1: Path-traversal hardening in `split-handler.ts`

**Finding:** `out1 = path.join(outDir, p.first.filename)` / `out2 = path.join(outDir, p.second.filename)` use the request-supplied `filename` unchecked. A `filename` like `../../evil.mp4` makes ffmpeg write outside `PROCESSED_MEDIA_PATH/splits/...` → arbitrary file write.

**Files:**
- Modify: `VideoVault/server/handlers/split-handler.ts` (the `out1`/`out2` derivation block, ~lines 105-107)
- Test: `VideoVault/server/handlers/split-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Append a `describe`/`it` to `VideoVault/server/handlers/split-handler.test.ts`. The existing file mocks `resolveInputPath`, `extractMovieMetadata`, `spawn`, and `fs/promises`; reuse that harness. Add:
```ts
describe('splitVideoOnServer — path traversal hardening', () => {
  beforeEach(() => {
    vi.mocked(resolveInputPath).mockResolvedValue('/media/src.mp4');
    vi.mocked(extractMovieMetadata).mockResolvedValue(META as any);
  });

  it('rejects a first.filename containing a path separator / traversal', async () => {
    const params: ServerSplitParams = {
      ...baseParams,
      first: { ...baseParams.first, filename: '../../evil.mp4' },
    };
    const result = await splitVideoOnServer(params, undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('invalid_split');
  });

  it('rejects a second.filename that is an absolute path', async () => {
    const params: ServerSplitParams = {
      ...baseParams,
      second: { ...baseParams.second, filename: '/etc/cron.d/x.mp4' },
    };
    const result = await splitVideoOnServer(params, undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('invalid_split');
  });
});
```
(If `baseParams`/`META` are not already at module scope in the test file, hoist the existing definitions so both `describe` blocks can use them — they are defined near the top of the current file.)

- [ ] **Step 2: Run the test to verify it fails RED**

Run:
```bash
cd VideoVault && npx vitest run server/handlers/split-handler.test.ts
```
Expected: the two new cases FAIL (current code would `path.join` the traversal and proceed to ffmpeg, returning `success:true` or a different code).

- [ ] **Step 3: Implement the containment check**

In `VideoVault/server/handlers/split-handler.ts`, add a helper near the top (after `PROCESSED_MEDIA_PATH`):
```ts
function safeOutputPath(outDir: string, filename: string): string | null {
  // Reject anything that is not a bare basename (no separators, no traversal, no absolute).
  const base = path.basename(filename);
  if (!base || base !== filename || base === '.' || base === '..' || base.includes('..')) {
    return null;
  }
  const resolvedDir = path.resolve(outDir);
  const candidate = path.resolve(resolvedDir, base);
  // Containment: the resolved candidate must sit directly under resolvedDir.
  if (candidate !== path.join(resolvedDir, base) || !candidate.startsWith(resolvedDir + path.sep)) {
    return null;
  }
  return candidate;
}
```
Then replace the `out1`/`out2` derivation:
```ts
  const outDir = path.join(PROCESSED_MEDIA_PATH, 'splits', p.sourceId.slice(0, 2));
  await fs.mkdir(outDir, { recursive: true });
  const out1 = path.join(outDir, p.first.filename);
  const out2 = path.join(outDir, p.second.filename);
```
with:
```ts
  const outDir = path.join(PROCESSED_MEDIA_PATH, 'splits', p.sourceId.slice(0, 2));
  await fs.mkdir(outDir, { recursive: true });
  const out1 = safeOutputPath(outDir, p.first.filename);
  const out2 = safeOutputPath(outDir, p.second.filename);
  if (!out1 || !out2) {
    return { success: false, message: 'Invalid output filename', code: 'invalid_split' };
  }
```
(The `mkdir` stays before the check so the error path is cheap and deterministic; the check runs before any ffmpeg call so nothing is written on rejection.)

- [ ] **Step 4: Run the test to verify GREEN (and existing split tests still pass)**

Run:
```bash
npx vitest run server/handlers/split-handler.test.ts
```
Expected: all cases PASS, including the pre-existing happy-path/conflict tests (basename filenames like `a.mp4`/`b.mp4` pass the guard unchanged).

- [ ] **Step 5: Commit**

```bash
cd ..
git add VideoVault/server/handlers/split-handler.ts VideoVault/server/handlers/split-handler.test.ts
git commit -m "fix(videovault): reject traversal in split output filenames (T000879 sec-1)"
```

### Task C2: Authenticated-user gate on `POST /:id/split`

**Finding:** `splitRouteHandler` reads `sourceId`/`sourcePath`/`rootKey` from params+body and runs an ffmpeg split with **no authentication check** — any unauthenticated caller that can reach the route triggers server-side processing against arbitrary roots. Other mutating VideoVault routes gate behind an authenticated identity (`fetchAuthUser` / `requireAdmin` in `routes.ts`). Mirror that: require an authenticated user before the split runs. (Per-user root ownership is NOT representable — `directoryRoots` has no owner column — so the correct, in-scope fix is an authenticated-user gate, consistent with the existing auth model.)

**Files:**
- Modify: `VideoVault/server/routes/split.ts`
- Test: `VideoVault/server/routes/split.test.ts`

- [ ] **Step 1: Inspect the existing auth helper to reuse the right primitive**

Run:
```bash
grep -n 'fetchAuthUser\|requireAdmin\|extractAccessToken\|AUTH_SERVICE_URL' VideoVault/server/routes.ts | head
```
Note the signatures. `fetchAuthUser(req): Promise<AuthServiceUser | null>` lives in `routes.ts` (not exported). To avoid an import cycle and keep the split route self-contained, **add a small local auth guard** in `split.ts` that mirrors `fetchAuthUser`'s token extraction (Bearer header or `accessToken` cookie → `${AUTH_SERVICE_URL}/api/auth/verify`). This keeps `routes.ts` untouched and the route independently testable.

- [ ] **Step 2: Write the failing test**

In `VideoVault/server/routes/split.test.ts`, the handler is unit-tested directly (`splitRouteHandler(req, res)`). Add a guard-aware test. Because the new guard calls an auth service via `fetch`, mock global `fetch`:
```ts
describe('splitRouteHandler — auth gate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('401s when no access token is present', async () => {
    const res = mockRes();
    await splitRouteHandler({ params: { id: 'src1' }, headers: {}, body: validBody } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(splitVideoOnServer).not.toHaveBeenCalled();
  });

  it('proceeds when the auth service verifies the bearer token', async () => {
    vi.mocked(fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { userId: 1, username: 'u', email: 'u@x' } }),
    });
    vi.mocked(splitVideoOnServer).mockResolvedValue({ success: true, segments: [{} as any, {} as any] });
    const res = mockRes();
    await splitRouteHandler(
      { params: { id: 'src1' }, headers: { authorization: 'Bearer t' }, body: validBody } as any,
      res,
    );
    expect(splitVideoOnServer).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
```
(The existing `validBody`/`mockRes`/`splitVideoOnServer` mock are already in the file. Add `afterEach` to the existing imports: `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';`.)

- [ ] **Step 3: Run the test to verify it fails RED**

Run:
```bash
cd VideoVault && npx vitest run server/routes/split.test.ts
```
Expected: the `401` case FAILS (current handler ignores auth and returns 400/200), confirming the gap.

- [ ] **Step 4: Implement the local auth guard + gate**

Replace `VideoVault/server/routes/split.ts` body with the gated version:
```ts
import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/async-error-handler';
import { splitVideoOnServer, type ServerSplitParams } from '../handlers/split-handler';
import { db } from '../db';

const router = Router();

const authServiceUrlRaw = process.env.AUTH_SERVICE_URL || 'http://localhost:5500';
const AUTH_SERVICE_API_URL = (() => {
  const u = authServiceUrlRaw.replace(/\/+$/, '');
  return u.endsWith('/api') ? u : `${u}/api`;
})();

function extractAccessToken(req: Request): string | null {
  const authHeader = (req.headers.authorization as string) || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookies = (req as any).cookies as Record<string, string> | undefined;
  return (cookies?.accessToken as string | undefined) || null;
}

async function isAuthenticated(req: Request): Promise<boolean> {
  const token = extractAccessToken(req);
  if (!token) return false;
  try {
    const r = await fetch(`${AUTH_SERVICE_API_URL}/auth/verify`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return false;
    const data = await (r.json() as Promise<{ user: unknown } | null>).catch(() => null);
    return Boolean(data && (data as { user?: unknown }).user);
  } catch {
    return false;
  }
}

export async function splitRouteHandler(req: Request, res: Response): Promise<void> {
  if (!(await isAuthenticated(req))) {
    res.status(401).json({ success: false, message: 'Unauthorized', code: 'permission_denied' });
    return;
  }

  const { id } = req.params;
  const { sourcePath, rootKey, splitTimeSeconds, first, second } = req.body ?? {};

  if (!sourcePath || typeof splitTimeSeconds !== 'number' || !first || !second) {
    res.status(400).json({ success: false, message: 'Missing required fields', code: 'invalid_split' });
    return;
  }

  const params: ServerSplitParams = { sourceId: id, sourcePath, rootKey, splitTimeSeconds, first, second };
  const result = await splitVideoOnServer(params, db);
  res.status(result.success ? 200 : 422).json(result);
}

router.post('/:id/split', asyncHandler(splitRouteHandler));

export default router;
```
Notes:
- `permission_denied` is an existing `SplitErrorCode`, so the response stays within the route's error contract.
- The auth check runs **before** field validation so an unauthenticated caller learns nothing about request shape.
- Mirrors `routes.ts`'s `extractAccessToken`/`fetchAuthUser` exactly → consistent with the existing auth model, no `routes.ts` edit, no import cycle.

- [ ] **Step 5: Run the test to verify GREEN (and the original 3 cases still pass)**

Run:
```bash
npx vitest run server/routes/split.test.ts
```
Expected: all cases PASS. The original `400 on missing fields` / `200 on success` / `422 on failure` cases must be updated to supply an authenticated request — i.e. add `headers: { authorization: 'Bearer t' }` to their `req` objects and a `vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { userId: 1, username: 'u', email: 'u@x' } }) })` in their setup (or a shared `beforeEach`). Update those three existing cases accordingly so they remain green.

- [ ] **Step 6: Run the full VideoVault server + client gate**

Run:
```bash
npm run check && npx vitest run server/ client/src/services/video-splitter-backend.test.ts
```
Expected: typecheck passes; split + backend tests green. (`npm run check` is the same gate `build-videovault.yml` runs.)

- [ ] **Step 7: Commit**

```bash
cd ..
git add VideoVault/server/routes/split.ts VideoVault/server/routes/split.test.ts
git commit -m "fix(videovault): require auth on POST /:id/split (T000879 sec-2)"
```

---

## Phase D — Consolidated verification (CI-equivalent gate)

Run the full CI-equivalent locally before pushing. All commands from the worktree root unless noted.

### Task D1: Manifest validation (infra)

- [ ] **Step 1: Kustomize validate both prod overlays + both website overlays**

Run:
```bash
task workspace:validate
kustomize build prod-fleet/website-mentolder --load-restrictor=LoadRestrictionsNone >/dev/null && echo "WEBSITE-MENTOLDER OK"
kustomize build prod-fleet/website-korczewski --load-restrictor=LoadRestrictionsNone >/dev/null && echo "WEBSITE-KORCZEWSKI OK"
```
Expected: validation passes; both website overlays `OK`.

- [ ] **Step 2: Run the two relevant manifest bats guards**

Run:
```bash
bats tests/unit/website-domain-config-overlay.bats tests/unit/mediaviewer-host-durability.bats
```
Expected: all green (parity now includes `VIDEOVAULT_DOMAIN`; mediaviewer-host durability unaffected).

### Task D2: Targeted tests + quality ratchet

- [ ] **Step 1: Website + changed-domain tests**

Run:
```bash
task test:changed
```
Expected: website Vitest (incl. `help-videos.test.ts`) green; quality:check (S1–S4 ratchet) green.

- [ ] **Step 2: VideoVault server + client gate (not covered by `test:changed`)**

Run:
```bash
cd VideoVault && npm run check && npx vitest run server/handlers/split-handler.test.ts server/routes/split.test.ts client/src/services/video-splitter-backend.test.ts && cd ..
```
Expected: typecheck + all three test files green.

### Task D3: Freshness + inventory regeneration

- [ ] **Step 1: Regenerate generated artifacts (test-inventory, repo-index, …)**

Run:
```bash
task freshness:regenerate
task test:inventory
```
Expected: regen succeeds. `website/src/data/test-inventory.json` is updated to include the new VideoVault + resolveHelpVideos test cases.

- [ ] **Step 2: Run the CI-equivalent freshness + quality check**

Run:
```bash
task freshness:check
```
Expected: green — freshness up-to-date, S1–S4 ratchet passes, baseline key-count unchanged (no new baseline entries added).

- [ ] **Step 3: Commit regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality/repo-index.json docs/generated 2>/dev/null
git status --short
git commit -m "chore(quality): regenerate freshness + test inventory (T000879)" || echo "nothing to commit"
```
(If `task freshness:regenerate` touched `k3d/docs-content-built/architecture/index.html` or other conflict-magnet artifacts, include them; expect a `git checkout --ours` resolution on rebase per the repo's freshness-regen convention.)

### Task D4: Open the consolidated PR

- [ ] **Step 1: Push and open the PR with auto-merge**

Run:
```bash
git push -u origin fix/mediaviewer-fleet-streaming
gh pr create --fill --title "fix(mediaviewer): fleet streaming — oauth2 prod patch + video bridge + 2c security (T000879)" \
  --body "$(cat <<'EOF'
Consolidated fix for T000879 (mediaviewer streamt nicht bei Portal-Sessions auf fleet).

## Was
- **G2 (infra):** wire prod oauth2-proxy-mediaviewer patch into prod overlay (HTTPS redirect-url + cookie-secure=true; client mediaviewer-widget; secret from workspace-secrets).
- **G3+G4 (website):** thread VIDEOVAULT_DOMAIN config → PortalLayout SSR → PortalSidekick → resolveHelpVideos() → MediaviewerPanel videos. Non-empty, prod-host-rewritten list now reaches the widget bridge.
- **2c security (already-merged PR #1727 code):** path-traversal hardening on split output filenames + authenticated-user gate on POST /:id/split.

## Externes Prerequisite (User-Aktion, blockt Live-Verifikation)
DNS: `mediaviewer.mentolder.de` ist aktuell CNAME → dev.mentolder.de (FritzBox-DynDNS, dev-Node down). Für fleet muss der A-Record auf die fleet-IPs zeigen (wie web.mentolder.de → 204.168.244.104 / 62.238.23.79 / 37.27.251.38). Setzt Patrick im ipv64-DNS-Panel. Bis dahin keine End-to-End-Live-Verifikation auf mentolder möglich.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --auto
```
Expected: PR created and auto-merge enabled (waits on the required checks: Offline Tests, Security Scan, Brett TypeScript, Vitest, Conventional Commits).

### Task D5: Post-merge deploy + DNS handoff

- [ ] **Step 1: After merge — deploy infra to both brands (push-based; no GitOps reconciler)**

The website change auto-rolls via `build-website*.yml`. The **oauth2-proxy patch + VIDEOVAULT_DOMAIN configmap** need an explicit workspace deploy on both brands:
```bash
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```
Then confirm the live oauth2-proxy-mediaviewer args are prod:
```bash
kubectl --context fleet -n workspace get deploy oauth2-proxy-mediaviewer -o yaml \
  | grep -E 'redirect-url|cookie-secure'
kubectl --context fleet -n workspace-korczewski get deploy oauth2-proxy-mediaviewer -o yaml \
  | grep -E 'redirect-url|cookie-secure'
```
Expected: `--redirect-url=https://mediaviewer.<brand>/oauth2/callback` and `--cookie-secure=true` on both.

- [ ] **Step 2: DNS handoff (EXTERNAL — User action, blocks live verification)**

> **HANDOFF TO PATRICK (external, not code):** `mediaviewer.mentolder.de` is currently a CNAME to `dev.mentolder.de` (FritzBox-DynDNS, dev node down). Repoint it (A-record) to the fleet IPs `204.168.244.104` / `62.238.23.79` / `37.27.251.38` in the ipv64 DNS panel — same targets as `web.mentolder.de`. Until then, the mediaviewer iframe cannot resolve and end-to-end live streaming cannot be verified on mentolder. **Optional follow-up (separate, in-scope only if asked):** make the subdomain declaratively pinnable via the ddns-updater mechanism — `prod-korczewski/ddns-updater.yaml` is the template; check whether `mediaviewer.<domain>` can be added there so DNS is managed in-repo rather than manually in the panel. Mark as a separate ticket if pursued.

- [ ] **Step 3: Live smoke (only after DNS repoint)**

Once DNS resolves, log into the portal (admin: paddione) on `web.mentolder.de`, open the Sidekick → Mediaviewer tab, and confirm: the iframe loads `https://mediaviewer.mentolder.de/embed.html`, the SSO flow completes (no `cookie-secure`/redirect mismatch), and a help video plays (non-empty list reached the widget). Repeat on korczewski.

---

## Self-Review

- **Spec coverage:** G2 → Phase A. G3 (no `videos` prop) → Task B4 (`videos={mediaviewerVideos}`). G4 (localhost URLs, no rewrite, no VideoVault host env) → Tasks B1 (`resolveHelpVideos`) + B3 (`VIDEOVAULT_DOMAIN` env through the chain) + B4 (wiring). 2c takeover → corrected to "already merged; security-only" (Phase C). Path-traversal finding → C1. IDOR/auth finding → C2. External DNS prerequisite → D5 Step 2 handoff. Quality gates (`test:changed`, `freshness:regenerate`, `freshness:check`, `test:inventory`, `workspace:validate`) → Phase D.
- **Placeholder scan:** every code step shows full code; commands have expected output; no TBD/TODO.
- **Type consistency:** `resolveHelpVideos(host: string): HelpVideo[]` defined in B1, called identically in B4 and the (pre-seeded) test. `videovaultHost` prop name consistent PortalLayout→PortalSidekick. `safeOutputPath`/`isAuthenticated`/`splitRouteHandler` signatures consistent within their tasks. `invalid_split`/`permission_denied` are existing `SplitErrorCode` members.
- **Corrections embedded:** (1) 2c already merged — no cherry-pick; (2) VideoVault auth = own auth-service, gate = authenticated-user not per-user ownership; (3) reuse `VIDEOVAULT_DOMAIN` not a new `VIDEOVAULT_HOST` var.
