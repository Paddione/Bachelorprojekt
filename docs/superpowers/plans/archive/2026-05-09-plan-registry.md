---
title: Plan Registry: Rich Agent Context Injection — Implementation Plan
domains: [infra, db]
status: active
pr_number: null
---

# Plan Registry: Rich Agent Context Injection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified plan registry so subagents receive active feature context automatically — via orchestrator injection from plan files (hot path) and via self-serve DB queries (cold path).

**Architecture:** Plan markdown files gain frontmatter (domains, status). A resolver script (`plan-context.sh`) reads them directly for instant orchestrator injection. A GH Action + extended `track-pr.mjs` ingest pipeline persists them to a new `superpowers` schema in shared-db. Each of the 6 agent files gains a startup SQL query. CLAUDE.md is updated to codify the orchestrator habit.

**Tech Stack:** Bash, Python 3, Node.js (ESM), PostgreSQL, GitHub Actions, Kustomize (for CronJob), go-task

---

## File Map

| File | Action |
|------|--------|
| `scripts/plans-parse.py` | Create — markdown → structured JSON |
| `scripts/plans-parse.sh` | Create — shell wrapper, writes to tracking/pending/ |
| `scripts/plan-context.sh` | Create — hot-path role resolver |
| `scripts/plan-frontmatter-hook.sh` | Create — appends frontmatter if absent |
| `scripts/track-pr.mjs` | Modify — extend --ingest to handle plan JSON |
| `k3d/tracking-import-cronjob.yaml` | No change — CronJob already calls track-pr.mjs --ingest |
| `.github/workflows/track-plans.yml` | Create — GH Action |
| `Taskfile.yml` | Modify — add plans:import, plans:query tasks |
| `~/.claude/agents/bachelorprojekt-infra.md` | Modify — add self-serve query |
| `~/.claude/agents/bachelorprojekt-website.md` | Modify — add self-serve query |
| `~/.claude/agents/bachelorprojekt-db.md` | Modify — add self-serve query |
| `~/.claude/agents/bachelorprojekt-ops.md` | Modify — add self-serve query |
| `~/.claude/agents/bachelorprojekt-test.md` | Modify — add self-serve query |
| `~/.claude/agents/bachelorprojekt-security.md` | Modify — add self-serve query |
| `CLAUDE.md` | Modify — add plan-context.sh step to Agent Routing |
| `docs/superpowers/plans/*.md` (existing) | Modify — backfill frontmatter |

---

### Task 1: DB schema migration

**Files:**
- Create: `scripts/migrate-superpowers.sql`

- [ ] **Step 1: Write migration SQL**

Create `scripts/migrate-superpowers.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS superpowers;

CREATE TABLE IF NOT EXISTS superpowers.plans (
    id           SERIAL PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    domains      TEXT[] NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'archived')),
    pr_number    INTEGER,
    file_path    TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS superpowers.plan_sections (
    id           SERIAL PRIMARY KEY,
    plan_id      INTEGER NOT NULL REFERENCES superpowers.plans(id) ON DELETE CASCADE,
    section_type TEXT NOT NULL
                 CHECK (section_type IN ('overview','architecture','tasks','files','gotchas','data-flow','other')),
    content      TEXT NOT NULL,
    seq          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS plan_sections_plan_id_idx ON superpowers.plan_sections(plan_id);
CREATE INDEX IF NOT EXISTS plans_domains_idx ON superpowers.plans USING GIN(domains);
CREATE INDEX IF NOT EXISTS plans_status_idx ON superpowers.plans(status);
```

- [ ] **Step 2: Apply migration to dev shared-db**

```bash
task workspace:port-forward &
sleep 3
psql postgresql://postgres:postgres@localhost:5432/website -f scripts/migrate-superpowers.sql
```

Expected output:
```
CREATE SCHEMA
CREATE TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
```

- [ ] **Step 3: Verify tables exist**

```bash
psql postgresql://postgres:postgres@localhost:5432/website -c "\dt superpowers.*"
```

Expected:
```
          List of relations
   Schema    |     Name      | Type  
-------------+---------------+-------
 superpowers | plan_sections | table
 superpowers | plans         | table
```

- [ ] **Step 4: Kill port-forward, commit**

```bash
kill %1
git add scripts/migrate-superpowers.sql
git commit -m "feat(plans): superpowers schema migration"
```

---

### Task 2: Python plan parser

**Files:**
- Create: `scripts/plans-parse.py`
- Create: `scripts/test_plans_parse.py`

- [ ] **Step 1: Write the failing test**

Create `scripts/test_plans_parse.py`:

```python
import json, sys, textwrap, tempfile, os
sys.path.insert(0, os.path.dirname(__file__))
import plans_parse as pp

SAMPLE = textwrap.dedent("""\
    ---
    title: My Feature Plan
    domains: [infra, db]
    status: active
    pr_number: null
    ---
    Intro paragraph before first heading.

    ## Architecture

    This is the arch section.

    ## Files to Modify

    - `scripts/foo.sh` — create it
""")

def test_parse_frontmatter():
    with tempfile.NamedTemporaryFile(suffix='.md', mode='w', delete=False) as f:
        f.write(SAMPLE)
        path = f.name
    try:
        result = pp.parse_plan(path)
        assert result['title'] == 'My Feature Plan'
        assert result['domains'] == ['infra', 'db']
        assert result['status'] == 'active'
        assert result['pr_number'] is None
        assert result['type'] == 'plan'
    finally:
        os.unlink(path)

def test_parse_sections():
    with tempfile.NamedTemporaryFile(suffix='.md', mode='w', delete=False) as f:
        f.write(SAMPLE)
        path = f.name
    try:
        result = pp.parse_plan(path)
        types = [s['section_type'] for s in result['sections']]
        assert 'overview' in types
        assert 'architecture' in types
        assert 'files' in types
        assert all(isinstance(s['seq'], int) for s in result['sections'])
    finally:
        os.unlink(path)

if __name__ == '__main__':
    test_parse_frontmatter()
    test_parse_sections()
    print("All tests passed.")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/patrick/Bachelorprojekt
python3 scripts/test_plans_parse.py
```

Expected: `ModuleNotFoundError: No module named 'plans_parse'`

- [ ] **Step 3: Write the parser**

Create `scripts/plans-parse.py` (note: importable as `plans_parse`):

```python
#!/usr/bin/env python3
"""Parse a superpowers plan markdown file → structured JSON for tracking/pending/."""
import sys, json, re, os
from pathlib import Path

SECTION_KEYWORDS = {
    'architecture': 'architecture',
    'arch': 'architecture',
    'data model': 'data-flow',
    'data flow': 'data-flow',
    'flow': 'data-flow',
    'hot path': 'architecture',
    'cold path': 'architecture',
    'task': 'tasks',
    'files': 'files',
    'gotcha': 'gotchas',
    'error': 'gotchas',
    'agent': 'other',
    'wiring': 'other',
    'retroactive': 'tasks',
    'backfill': 'tasks',
    'overview': 'overview',
}

def classify_section(heading: str) -> str:
    h = heading.lower()
    for keyword, stype in SECTION_KEYWORDS.items():
        if keyword in h:
            return stype
    return 'other'

def parse_frontmatter(lines: list[str]) -> tuple[dict, int]:
    """Return (frontmatter_dict, body_start_index). Raises if no frontmatter."""
    if not lines or lines[0].strip() != '---':
        raise ValueError("No YAML frontmatter found (expected leading ---)")
    end = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == '---'), None)
    if end is None:
        raise ValueError("Unclosed frontmatter block")
    fm = {}
    for line in lines[1:end]:
        if ':' not in line:
            continue
        key, _, val = line.partition(':')
        key = key.strip()
        val = val.strip()
        if val.startswith('[') and val.endswith(']'):
            # e.g. [infra, db]
            fm[key] = [v.strip() for v in val[1:-1].split(',') if v.strip()]
        elif val.lower() == 'null':
            fm[key] = None
        elif val.isdigit():
            fm[key] = int(val)
        else:
            fm[key] = val
    return fm, end + 1

def parse_plan(file_path: str) -> dict:
    path = Path(file_path)
    lines = path.read_text().splitlines(keepends=True)
    fm, body_start = parse_frontmatter(lines)

    body_lines = lines[body_start:]
    body = ''.join(body_lines)

    # Split by H2 headings
    h2_pattern = re.compile(r'^## (.+)$', re.MULTILINE)
    sections = []
    matches = list(h2_pattern.finditer(body))

    # Content before first H2 = overview
    pre = body[:matches[0].start()].strip() if matches else body.strip()
    if pre:
        sections.append({'seq': 0, 'section_type': 'overview', 'content': pre})

    for i, m in enumerate(matches):
        heading = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        content = (heading + '\n' + body[start:end]).strip()
        sections.append({
            'seq': len(sections),
            'section_type': classify_section(heading),
            'content': content,
        })

    slug = path.stem  # filename without extension
    return {
        'type': 'plan',
        'slug': slug,
        'title': fm.get('title', slug),
        'domains': fm.get('domains', []),
        'status': fm.get('status', 'active'),
        'pr_number': fm.get('pr_number'),
        'file_path': str(path),
        'sections': sections,
    }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: plans-parse.py <plan.md>", file=sys.stderr)
        sys.exit(1)
    result = parse_plan(sys.argv[1])
    print(json.dumps(result, indent=2))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python3 scripts/test_plans_parse.py
```

Expected: `All tests passed.`

- [ ] **Step 5: Make executable and commit**

```bash
chmod +x scripts/plans-parse.py
git add scripts/plans-parse.py scripts/test_plans_parse.py
git commit -m "feat(plans): markdown plan parser (plans-parse.py)"
```

---

### Task 3: Shell wrapper

**Files:**
- Create: `scripts/plans-parse.sh`

- [ ] **Step 1: Write the shell wrapper**

Create `scripts/plans-parse.sh`:

```bash
#!/usr/bin/env bash
# Parse a plan .md file → tracking/pending/plan-<slug>.json
set -euo pipefail

FILE="${1:?Usage: plans-parse.sh <path/to/plan.md>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

mkdir -p "$REPO_ROOT/tracking/pending"

slug=$(basename "$FILE" .md)
out="$REPO_ROOT/tracking/pending/plan-${slug}.json"

python3 "$REPO_ROOT/scripts/plans-parse.py" "$FILE" > "$out"
echo "wrote $out"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/plans-parse.sh
```

- [ ] **Step 3: Smoke test against the spec file (spec has no frontmatter yet — expect a clear error)**

```bash
bash scripts/plans-parse.sh docs/superpowers/specs/2026-05-09-plan-registry-design.md 2>&1 || true
```

Expected: `ValueError: No YAML frontmatter found` (correct — spec files don't have frontmatter, only plans do)

- [ ] **Step 4: Commit**

```bash
git add scripts/plans-parse.sh
git commit -m "feat(plans): shell wrapper plans-parse.sh"
```

---

### Task 4: Hot-path resolver script

**Files:**
- Create: `scripts/plan-context.sh`

- [ ] **Step 1: Write the resolver**

Create `scripts/plan-context.sh`:

```bash
#!/usr/bin/env bash
# Emit active plan sections relevant to <role> from docs/superpowers/plans/*.md
# Usage: scripts/plan-context.sh <role>
# Output: markdown block ready to wrap in <active-plans>...</active-plans>
set -euo pipefail

ROLE="${1:?Usage: plan-context.sh <role>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
PLANS_DIR="$REPO_ROOT/docs/superpowers/plans"
found=0

for plan_file in "$PLANS_DIR"/*.md; do
    [[ -f "$plan_file" ]] || continue

    # Extract status from frontmatter (between first pair of ---)
    status=$(awk 'BEGIN{f=0} /^---/{f++;next} f==1 && /^status:/{print $2; exit}' "$plan_file" | tr -d ' \r')
    [[ "$status" == "active" ]] || continue

    # Extract domains line and check for role
    domains=$(awk 'BEGIN{f=0} /^---/{f++;next} f==1 && /^domains:/{print; exit}' "$plan_file")
    [[ "$domains" == *"$ROLE"* ]] || continue

    title=$(awk 'BEGIN{f=0} /^---/{f++;next} f==1 && /^title:/{$1=""; print; exit}' "$plan_file" | sed 's/^ //')
    echo "### Active plan: $title"
    echo
    # Print body (everything after the closing ---)
    awk 'BEGIN{n=0} /^---/{n++;next} n>=2{print}' "$plan_file"
    echo
    found=$((found+1))
done

if [[ $found -eq 0 ]]; then
    exit 0  # no output — orchestrator omits the <active-plans> block
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/plan-context.sh
```

- [ ] **Step 3: Test with an existing plan file (needs frontmatter — add temp frontmatter to one plan)**

Pick any plan in `docs/superpowers/plans/` and prepend frontmatter temporarily:

```bash
head -5 docs/superpowers/plans/2026-05-06-agent-routing.md
```

If it has no frontmatter, add it temporarily to test:

```bash
cat > /tmp/test-plan.md << 'EOF'
---
title: Test Plan
domains: [infra, website]
status: active
pr_number: null
---

## Architecture

This is a test plan for infra and website roles.
EOF
cp /tmp/test-plan.md docs/superpowers/plans/test-plan-temp.md
bash scripts/plan-context.sh infra
bash scripts/plan-context.sh db    # expect no output
rm docs/superpowers/plans/test-plan-temp.md
```

Expected for `infra`: prints plan content. Expected for `db`: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/plan-context.sh
git commit -m "feat(plans): hot-path resolver plan-context.sh"
```

---

### Task 5: Frontmatter hook

**Files:**
- Create: `scripts/plan-frontmatter-hook.sh`

- [ ] **Step 1: Write the hook**

Create `scripts/plan-frontmatter-hook.sh`:

```bash
#!/usr/bin/env bash
# Append YAML frontmatter to a plan file that doesn't have it yet.
# Usage: scripts/plan-frontmatter-hook.sh <plan.md>
# Prompts for domains interactively; non-interactive falls back to empty array.
set -euo pipefail

FILE="${1:?Usage: plan-frontmatter-hook.sh <plan.md>}"

# Already has frontmatter?
if head -1 "$FILE" | grep -q '^---'; then
    echo "Frontmatter already present in $FILE — nothing to do."
    exit 0
fi

VALID_DOMAINS="infra website db ops test security"

if [[ -t 0 ]]; then
    echo "Enter domains for $(basename "$FILE") (space-separated from: $VALID_DOMAINS):"
    read -r domains_input
else
    domains_input=""
fi

# Convert "infra db" → "[infra, db]"
if [[ -n "$domains_input" ]]; then
    domains_yaml="[$(echo "$domains_input" | tr ' ' '\n' | sed 's/.*/, &/' | tr -d '\n' | sed 's/^, //')]"
else
    domains_yaml="[]"
fi

slug=$(basename "$FILE" .md)
title=$(grep -m1 '^# ' "$FILE" | sed 's/^# //' || echo "$slug")

FRONTMATTER="---
title: $title
domains: $domains_yaml
status: active
pr_number: null
---
"

# Prepend frontmatter to file
tmpfile=$(mktemp)
printf '%s\n' "$FRONTMATTER" > "$tmpfile"
cat "$FILE" >> "$tmpfile"
mv "$tmpfile" "$FILE"
echo "Added frontmatter to $FILE"
```

- [ ] **Step 2: Make executable and test**

```bash
chmod +x scripts/plan-frontmatter-hook.sh

# Test on a temp file
cat > /tmp/test-no-frontmatter.md << 'EOF'
# My Feature Plan

## Architecture

Some content here.
EOF
cp /tmp/test-no-frontmatter.md /tmp/test-no-frontmatter-backup.md

# Non-interactive (piped): should add empty domains
echo "infra db" | bash scripts/plan-frontmatter-hook.sh /tmp/test-no-frontmatter.md
head -8 /tmp/test-no-frontmatter.md
```

Expected output shows frontmatter prepended with `domains: [infra, db]`.

- [ ] **Step 3: Test idempotency**

```bash
bash scripts/plan-frontmatter-hook.sh /tmp/test-no-frontmatter.md
```

Expected: `Frontmatter already present — nothing to do.`

- [ ] **Step 4: Commit**

```bash
git add scripts/plan-frontmatter-hook.sh
git commit -m "feat(plans): plan-frontmatter-hook.sh — append frontmatter when absent"
```

---

### Task 6: Extend track-pr.mjs to handle plan JSON

**Files:**
- Modify: `scripts/track-pr.mjs`

The CronJob's `--ingest` mode reads all `tracking/pending/*.json` files. Currently it passes every file to `writeRowToDb` which expects a PR-shaped object. We add a `type` check to branch plan files to a new `writePlanToDb` handler.

- [ ] **Step 1: Write failing test for plan ingest routing**

```bash
cat > /tmp/test-plan-ingest.mjs << 'EOF'
// Verify that a plan JSON with type="plan" does NOT go through writeRowToDb
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const planJson = {
  type: 'plan',
  slug: '2026-05-09-test-plan',
  title: 'Test Plan',
  domains: ['infra'],
  status: 'active',
  pr_number: null,
  file_path: 'docs/superpowers/plans/test.md',
  sections: [
    { seq: 0, section_type: 'overview', content: 'Overview content.' }
  ]
};

mkdirSync('/tmp/test-pending', { recursive: true });
writeFileSync('/tmp/test-pending/plan-2026-05-09-test-plan.json', JSON.stringify(planJson));
console.log('Test JSON written. Run: node scripts/track-pr.mjs --ingest with TRACKING_DB_URL set to verify routing.');
EOF
node /tmp/test-plan-ingest.mjs
```

- [ ] **Step 2: Add plan schema self-heal + writePlanToDb to track-pr.mjs**

Open `scripts/track-pr.mjs` and add after `ensurePrEventsSchema`:

```javascript
async function ensurePlanSchema(pgClient) {
  await pgClient.query(`CREATE SCHEMA IF NOT EXISTS superpowers`);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS superpowers.plans (
      id           SERIAL PRIMARY KEY,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      domains      TEXT[] NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','archived')),
      pr_number    INTEGER,
      file_path    TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS superpowers.plan_sections (
      id           SERIAL PRIMARY KEY,
      plan_id      INTEGER NOT NULL REFERENCES superpowers.plans(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL,
      content      TEXT NOT NULL,
      seq          INTEGER NOT NULL
    )
  `);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS plans_domains_idx ON superpowers.plans USING GIN(domains)`);
  await pgClient.query(`CREATE INDEX IF NOT EXISTS plans_status_idx ON superpowers.plans(status)`);
}

async function writePlanToDb(row, pgClient) {
  const result = await pgClient.query(
    `INSERT INTO superpowers.plans (slug, title, domains, status, pr_number, file_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       domains = EXCLUDED.domains,
       status = EXCLUDED.status,
       pr_number = EXCLUDED.pr_number,
       file_path = EXCLUDED.file_path
     RETURNING id`,
    [row.slug, row.title, row.domains, row.status, row.pr_number ?? null, row.file_path]
  );
  const planId = result.rows[0].id;

  // Replace sections wholesale (simpler than diffing)
  await pgClient.query(`DELETE FROM superpowers.plan_sections WHERE plan_id = $1`, [planId]);
  for (const section of (row.sections ?? [])) {
    await pgClient.query(
      `INSERT INTO superpowers.plan_sections (plan_id, section_type, content, seq)
       VALUES ($1, $2, $3, $4)`,
      [planId, section.section_type, section.content, section.seq]
    );
  }
}
```

- [ ] **Step 3: Extend the --ingest branch to use ensurePlanSchema and route by type**

Find the `--ingest` branch in `main()` and update the per-file processing block:

```javascript
  if (mode === '--ingest') {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: process.env.TRACKING_DB_URL });
    await client.connect();
    await ensurePrEventsSchema(client);
    await ensurePlanSchema(client);      // ← add this line
    let count = 0;
    const files = readdirSync('tracking/pending').filter(f => f.endsWith('.json'));
    for (const f of files) {
      const row = JSON.parse(readFileSync(join('tracking/pending', f), 'utf8'));
      try {
        if (row.type === 'plan') {        // ← add this branch
          await writePlanToDb(row, client);
        } else {
          await writeRowToDb(row, client);
        }
        unlinkSync(join('tracking/pending', f));
        count++;
      } catch (e) {
        console.error(`skip ${f}: ${e.message}`);
      }
    }
    await client.end();
    console.log(`ingested ${count} rows`);
    return;
  }
```

- [ ] **Step 4: Verify the edit looks right**

```bash
grep -n 'writePlanToDb\|ensurePlanSchema\|type.*plan' scripts/track-pr.mjs | head -20
```

Expected: sees `ensurePlanSchema`, `writePlanToDb`, and the `row.type === 'plan'` branch.

- [ ] **Step 5: Commit**

```bash
git add scripts/track-pr.mjs
git commit -m "feat(plans): extend track-pr.mjs --ingest to handle plan JSON"
```

---

### Task 7: GH Action

**Files:**
- Create: `.github/workflows/track-plans.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/track-plans.yml`:

```yaml
name: track-plans

on:
  push:
    branches: [main]
    paths: ['docs/superpowers/plans/*.md']

permissions:
  contents: write

jobs:
  track-plans:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Parse changed plan files → pending JSON
        run: |
          git diff --name-only HEAD~1 HEAD -- 'docs/superpowers/plans/*.md' | while read f; do
            if [[ -f "$f" ]]; then
              echo "Parsing $f"
              bash scripts/plans-parse.sh "$f" || echo "WARN: failed to parse $f"
            fi
          done

      - name: Commit pending JSONs
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add tracking/pending/plan-*.json 2>/dev/null || true
          git diff --cached --quiet && echo "nothing to commit" && exit 0
          git commit -m "chore(tracking): import plan context [skip ci]"
          git push
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/track-plans.yml
git commit -m "feat(plans): track-plans GH Action"
```

---

### Task 8: Taskfile tasks

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Find the right place to add tasks**

```bash
grep -n "^  tracking:" Taskfile.yml | head -5
```

If no `tracking:` namespace exists, find a logical nearby section:

```bash
grep -n "^  test:\|^  workspace:backup\|^  docs:" Taskfile.yml | head -5
```

- [ ] **Step 2: Add plans tasks**

In `Taskfile.yml`, add the following two tasks. Place them near other utility/tracking tasks:

```yaml
  plans:import:
    desc: "Parse all active plan files → tracking/pending/ (seeds DB on next CronJob run)"
    cmds:
      - |
        PLANS_DIR="docs/superpowers/plans"
        count=0
        for f in "$PLANS_DIR"/*.md; do
          [[ -f "$f" ]] || continue
          status=$(awk 'BEGIN{n=0} /^---/{n++;next} n==1 && /^status:/{print $2; exit}' "$f" | tr -d ' \r')
          [[ "$status" == "active" ]] || continue
          bash scripts/plans-parse.sh "$f"
          count=$((count+1))
        done
        echo "Imported $count active plan(s) to tracking/pending/"

  plans:query:
    desc: "Show active plan sections for a given role. Usage: task plans:query -- <role>"
    cmds:
      - |
        ROLE="{{.CLI_ARGS}}"
        psql "${TRACKING_DB_URL:-postgresql://postgres:postgres@localhost:5432/website}" -c \
          "SELECT p.title, ps.section_type, LEFT(ps.content, 200) AS excerpt
           FROM superpowers.plans p
           JOIN superpowers.plan_sections ps ON ps.plan_id = p.id
           WHERE '${ROLE}' = ANY(p.domains) AND p.status = 'active'
           ORDER BY p.created_at DESC, ps.seq;"
```

- [ ] **Step 3: Verify task syntax**

```bash
task --list 2>&1 | grep plans
```

Expected: `plans:import` and `plans:query` appear in the list.

- [ ] **Step 4: Smoke-test plans:import (dry run — no active plans with frontmatter yet)**

```bash
task plans:import
```

Expected: `Imported 0 active plan(s) to tracking/pending/` (plans don't have frontmatter yet — Task 11 handles that).

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(plans): plans:import and plans:query Taskfile tasks"
```

---

### Task 9: Agent file updates

**Files:**
- Modify: `~/.claude/agents/bachelorprojekt-infra.md`
- Modify: `~/.claude/agents/bachelorprojekt-website.md`
- Modify: `~/.claude/agents/bachelorprojekt-db.md`
- Modify: `~/.claude/agents/bachelorprojekt-ops.md`
- Modify: `~/.claude/agents/bachelorprojekt-test.md`
- Modify: `~/.claude/agents/bachelorprojekt-security.md`

Each agent file gets an **Active plans** section. The SQL query is identical except for the hardcoded role string.

- [ ] **Step 1: Add section to bachelorprojekt-infra.md**

Append to `~/.claude/agents/bachelorprojekt-infra.md` (before the last line):

```markdown

## Active plans
At session start, query active plans for this domain via the postgres MCP:
```sql
SELECT p.title, ps.section_type, ps.content
FROM superpowers.plans p
JOIN superpowers.plan_sections ps ON ps.plan_id = p.id
WHERE 'infra' = ANY(p.domains) AND p.status = 'active'
ORDER BY p.created_at DESC, ps.seq;
```
Treat results as authoritative working context for the current feature.
If the orchestrator injected an `<active-plans>` block in your prompt, that takes precedence.
```

- [ ] **Step 2: Add section to bachelorprojekt-website.md** (role = `website`)

Same block, replace `'infra'` with `'website'`.

- [ ] **Step 3: Add section to bachelorprojekt-db.md** (role = `db`)

Same block, replace `'infra'` with `'db'`.

- [ ] **Step 4: Add section to bachelorprojekt-ops.md** (role = `ops`)

Same block, replace `'infra'` with `'ops'`.

- [ ] **Step 5: Add section to bachelorprojekt-test.md** (role = `test`)

Same block, replace `'infra'` with `'test'`.

- [ ] **Step 6: Add section to bachelorprojekt-security.md** (role = `security`)

Same block, replace `'infra'` with `'security'`.

- [ ] **Step 7: Verify all 6 files have the section**

```bash
grep -l "Active plans" ~/.claude/agents/bachelorprojekt-*.md | wc -l
```

Expected: `6`

- [ ] **Step 8: No commit needed** — agent files live in `~/.claude/agents/`, not in the repo.

---

### Task 10: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add plan injection step and frontmatter-hook note to Agent Routing section**

In `CLAUDE.md`, find the Agent Routing section. After the routing table and before the Tie-break rule, add:

```markdown
**Before dispatching any agent, inject active plan context:**
Run `bash scripts/plan-context.sh <role>` and prepend output to the agent prompt wrapped in `<active-plans>` tags. If the script produces no output (no active plans for that role), omit the block entirely.

```bash
# Example orchestrator injection pattern:
context=$(bash scripts/plan-context.sh infra)
if [[ -n "$context" ]]; then
  prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"
fi
```

Also add after the `writing-plans` skill finishes: call `bash scripts/plan-frontmatter-hook.sh <plan-file>` on the newly created plan file before committing it. This is the integration point between the superpowers plugin skill (which can't be modified) and the plan registry.
```

- [ ] **Step 2: Verify the edit looks right**

```bash
grep -A 10 "Before dispatching" CLAUDE.md
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): codify plan-context.sh injection in Agent Routing"
```

---

### Task 11: Backfill existing plans + end-to-end test

**Files:**
- Modify: `docs/superpowers/plans/*.md` (add frontmatter to each)

- [ ] **Step 1: List all plan files that need frontmatter**

```bash
for f in docs/superpowers/plans/*.md; do
  head -1 "$f" | grep -q '^---' || echo "needs frontmatter: $f"
done
```

- [ ] **Step 2: Add frontmatter to each plan file**

Domain mapping rules:
- Filename contains `website`, `kore`, `mentolder`, `portal`, `astro`, `svelte`, `ui`, `component`, `homepage` → `website`
- Filename contains `infra`, `deploy`, `kustomize`, `argocd`, `cluster`, `overlay`, `manifest`, `env`, `secret` → `infra`
- Filename contains `db`, `schema`, `tracking`, `timeline`, `psql`, `postgres` → `db`
- Filename contains `test`, `playwright`, `bats`, `spec`, `runner`, `systemtest` → `test`
- Filename contains `keycloak`, `oidc`, `dsgvo`, `seal`, `cert` → `security`
- Filename contains `ops`, `log`, `pod`, `health`, `status` → `ops`
- Plans touching multiple systems: list all matching domains

Run the hook for each file listed in Step 1:

```bash
# Agent-routing plan touches infra + all agents (but infra is primary):
echo "infra" | bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-05-06-agent-routing.md

# Admin-inbox is website work:
echo "website" | bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-05-08-admin-inbox-rework.md

# Systemtest plans:
echo "test" | bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-05-08-systemtest-failure-loop.md

# Continue for each remaining file using the domain rules above.
```

After the hook runs, open any file whose feature is fully merged and change `status: active` to `status: completed` manually.

- [ ] **Step 3: Run plans:import**

```bash
task plans:import
```

Expected: `Imported N active plan(s) to tracking/pending/`

- [ ] **Step 4: Verify pending JSONs were written**

```bash
ls tracking/pending/plan-*.json | head -5
python3 -c "import json,sys; d=json.load(open('$(ls tracking/pending/plan-*.json | head -1)')); print(d['title'], d['domains'])"
```

Expected: prints plan title and domains array.

- [ ] **Step 5: Ingest locally to verify DB write**

```bash
task workspace:port-forward &
sleep 3
TRACKING_DB_URL=postgresql://postgres:postgres@localhost:5432/website node scripts/track-pr.mjs --ingest
kill %1
```

Expected: `ingested N rows` with no errors.

- [ ] **Step 6: Verify DB rows**

```bash
task workspace:port-forward &
sleep 3
psql postgresql://postgres:postgres@localhost:5432/website -c "SELECT title, domains, status FROM superpowers.plans ORDER BY created_at;"
kill %1
```

Expected: rows for each imported plan with correct domains and status.

- [ ] **Step 7: Test plan-context.sh end-to-end**

```bash
bash scripts/plan-context.sh infra
bash scripts/plan-context.sh website
bash scripts/plan-context.sh db
```

Expected: each prints active plan content for matching roles; roles with no matching plans produce no output.

- [ ] **Step 8: Commit and push**

```bash
git add docs/superpowers/plans/*.md tracking/pending/
git commit -m "chore(plans): backfill frontmatter on all existing plan files"
git push
```

The GH Action will fire on push, parse any changed plan files, and commit the pending JSONs (idempotent — they're already there from Step 3, so the Action will find nothing new to commit).

---

## Apply DB Migration to Production

After the PR merges and the GH Action runs:

```bash
task workspace:psql ENV=mentolder -- website < scripts/migrate-superpowers.sql
task workspace:psql ENV=korczewski -- website < scripts/migrate-superpowers.sql
```

The CronJob will self-heal the schema anyway (via `ensurePlanSchema`), but applying it eagerly prevents the first CronJob run from failing.
