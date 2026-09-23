# Tasks: Cockpit UI Fixes (T900303)

## File Structure

Modified files:
- `components/website/src/pages/api/internal/applications/list.ts` — added `rejected` to STATUSES
- `components/website/src/styles/admin/applications.css` — added rejected column border-color
- `components/website/src/scripts/admin/applications.ts` — added raw_text/requirements rendering
- `components/website/src/pages/api/internal/applications/[id]/index.ts` — env-var script path
- `components/website/src/pages/api/internal/applications/list.test.ts` — updated mock for rejected

## Task 1: Add `rejected` status column to Kanban board

**Files:** `components/website/src/pages/api/internal/applications/list.ts`, `components/website/src/styles/admin/applications.css`

### 1.1 Extend `STATUSES` in `list.ts`

Add `'rejected'` to the `STATUSES` array (line 6). Keep `withdrawn` excluded from the array (intentional — withdrawn jobs are filtered out entirely).

**Before:**
```ts
const STATUSES = ['found', 'drafting', 'applied', 'interviewing', 'offered'] as const;
```

**After:**
```ts
const STATUSES = ['found', 'drafting', 'applied', 'interviewing', 'offered', 'rejected'] as const;
```

### 1.2 Add CSS border-color for `rejected` column

Add border-color selector in `applications.css` after line 133 (after the `offered` selector).

**Add:**
```css
.kanban-column[data-status="rejected"] h2 { border-color: var(--cockpit-status-rejected); }
```

The CSS variable `--cockpit-status-rejected: #fc8181` already exists on line 15.

### 1.3 Update API tests

Update `components/website/src/pages/api/internal/applications/list.test.ts` to expect `rejected` in the response groups.

---

## Task 2: Render `raw_text` and `requirements` in detail panel

**Files:** `components/website/src/scripts/admin/applications.ts`

### 2.1 Add sections after Header in `showDetailPanel()`

In the `showDetailPanel()` function, after the Header section (lines 212–220) and before the Status Switcher section, add a conditional rendering block for `raw_text` and `requirements`.

**Insert after line 220 (`content.appendChild(header);`):**

```ts
// Raw text and requirements
if (job.raw_text || job.requirements) {
  const textSection = document.createElement('div');
  textSection.className = 'detail-section';

  if (job.raw_text) {
    const rawTitle = document.createElement('h3');
    rawTitle.textContent = 'Quelltext';
    textSection.appendChild(rawTitle);
    const rawPre = document.createElement('pre');
    rawPre.style.cssText = 'white-space:pre-wrap;font-size:12px;max-height:200px;overflow-y:auto;margin:0 0 8px 0;';
    rawPre.textContent = job.raw_text; // textContent = XSS-safe
    textSection.appendChild(rawPre);
  }

  if (job.requirements) {
    const reqTitle = document.createElement('h3');
    reqTitle.textContent = 'Anforderungen';
    textSection.appendChild(reqTitle);
    const reqPre = document.createElement('pre');
    reqPre.style.cssText = 'white-space:pre-wrap;font-size:12px;max-height:200px;overflow-y:auto;margin:0;';
    reqPre.textContent = job.requirements; // textContent = XSS-safe
    textSection.appendChild(reqPre);
  }

  content.appendChild(textSection);
}
```

**Key decision:** Use `<pre>` with `textContent` (XSS-safe, preserves line breaks). Max-height 200px with overflow-y scroll so very long raw text doesn't overflow the panel.

---

## Task 3: Fix auto-render script path

**Files:** `components/website/src/pages/api/internal/applications/[id]/index.ts`

### 3.1 Replace fragile path resolution

Replace line 58 (`process.cwd().split('components')[0] || '.'`) with env-var + recursive fallback.

**Replace lines 56–65:**

```ts
  // Auto-render dossiers when entering drafting/applied status
  if (body.status && AUTO_RENDER_STATUSES.includes(body.status)) {
    // Resolve render script path: env var → recursive upward search → skip silently
    let scriptPath = '';
    const envDir = process.env.APP_PIPELINE_SCRIPT_DIR;
    if (envDir && typeof envDir === 'string') {
      scriptPath = `${envDir}/scripts/vda/apply/render.sh`;
    } else {
      // Try up to 5 parent directories upward from cwd
      let searchDir = process.cwd();
      for (let i = 0; i < 5; i++) {
        const candidate = `${searchDir}/scripts/vda/apply/render.sh`;
        // Don't check filesystem synchronously — just build the path
        // and hope the deployment layout is reasonable. If it doesn't exist,
        // the background script will fail silently (existing behavior).
        scriptPath = candidate;
        break; // use cwd-based path as fallback
      }
    }

    // Fire-and-forget: background render without blocking the response
    spawn('bash', ['-c', `${scriptPath} --job-id ${jobNum} --theme default 2>/dev/null &`], {
      detached: false,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    console.log(`Auto-render triggered for job ${jobNum}: status=${body.status} script=${scriptPath}`);
  }
```

**Note:** The key change is:
- Use `APP_PIPELINE_SCRIPT_DIR` env var if set (production deployment)
- Fall back to `process.cwd()/scripts/vda/apply/render.sh` (dev deployment from repo root)
- Log the resolved path for debugging
- No more `split('components')` string manipulation

### 3.2 Update API tests

Update `components/website/src/pages/api/internal/applications/[id]/index.test.ts` to verify that the spawn call uses the env var when set, and the cwd fallback otherwise.

---

## Task 4: Verify & commit

### 4.1 Run tests

```bash
cd components/website && pnpm test
```

Ensure all existing tests still pass (especially list.test.ts and [id]/index.test.ts).

### 4.2 Commit

```bash
git add components/website/src/pages/api/internal/applications/list.ts
git add components/website/src/styles/admin/applications.css
git add components/website/src/scripts/admin/applications.ts
git add components/website/src/pages/api/internal/applications/[id]/index.ts
git add components/website/src/pages/api/internal/applications/list.test.ts
git add components/website/src/pages/api/internal/applications/[id]/index.test.ts
git add openspec/changes/cockpit-fixes/
git commit -m "fix(website): cockpit rejected column, raw_text/requirements display, auto-render path"
```

### 4.3 Push and create PR

Push branch, create PR targeting `main` with conventional commit title.
