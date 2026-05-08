# Plan Registry: Rich Agent Context Injection

**Date:** 2026-05-09  
**Domains:** infra, db, ops, website, test, security  
**Status:** active

---

## Overview

Subagents currently operate with static system prompts. They lack awareness of active feature work, relevant library APIs, and live cluster state. This spec describes a unified plan registry that gives agents three layers of context:

1. **Hot path** — orchestrator injects active plan sections into every `Agent()` dispatch via a resolver script
2. **Cold path** — GH Action parses merged plan files into the shared PostgreSQL DB; agents self-query at session start
3. **Convention** — `writing-plans` skill emits frontmatter that drives routing; the tagging convention is the single source of truth

The pattern mirrors the existing `track-pr.yml` → `tracking-import` CronJob pipeline used for the PR timeline.

---

## Architecture

```
writing-plans skill
      │ produces plan .md with frontmatter (domains, status)
      ▼
docs/superpowers/plans/*.md ──── scripts/plan-context.sh <role>
      │                                     │
      │ merge to main                        │ hot path: orchestrator
      ▼                                     │ prepends <active-plans> before Agent()
track-plans.yml GH Action                   │
      │                                     ▼
tracking/pending/plan-*.json          Agent prompt enriched
      │                               with active plan context
      ▼
tracking-import CronJob
      │
      ▼
superpowers.plans + plan_sections ←── agents self-query at startup
      │                                via postgres MCP
      ▼
task plans:query -- <role>  (debug/inspect)
```

---

## Data Model

### Plan file frontmatter (new convention)

Every plan produced by the `writing-plans` skill includes a frontmatter block:

```markdown
---
title: <human-readable title>
domains: [infra, db]        # one or more of: infra website db ops test security
status: active              # active | completed | archived
pr_number: null             # filled in when the feature merges
---
```

`domains` is the routing key. It maps directly to the 6 bachelorprojekt agent roles. A plan may belong to multiple domains.

### DB schema — `superpowers` schema in shared-db

```sql
CREATE SCHEMA superpowers;

CREATE TABLE superpowers.plans (
    id           SERIAL PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,      -- e.g. "2026-05-09-agent-context"
    title        TEXT NOT NULL,
    domains      TEXT[] NOT NULL,           -- e.g. '{infra,db}'
    status       TEXT NOT NULL DEFAULT 'active',  -- active | completed | archived
    pr_number    INTEGER,
    file_path    TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE superpowers.plan_sections (
    id           SERIAL PRIMARY KEY,
    plan_id      INTEGER REFERENCES superpowers.plans(id) ON DELETE CASCADE,
    section_type TEXT NOT NULL,  -- architecture | tasks | files | gotchas | data-flow | overview
    content      TEXT NOT NULL,
    seq          INTEGER NOT NULL  -- preserves original document order
);

CREATE INDEX ON superpowers.plan_sections(plan_id);
CREATE INDEX ON superpowers.plans USING GIN(domains);
```

Sections are split by H2 headings in the plan markdown. Section type is derived from the heading text (fuzzy match: "Architecture" → `architecture`, "Files to modify" → `files`, "Gotchas" → `gotchas`, etc.); the intro block before the first H2 becomes `overview`.

---

## Hot Path: Resolver Script

**`scripts/plan-context.sh <role>`** reads plan files directly — no DB dependency, instant output.

```bash
#!/usr/bin/env bash
# Emits active plan sections relevant to <role> from docs/superpowers/plans/*.md
ROLE="${1:?Usage: plan-context.sh <role>}"
PLANS_DIR="$(git rev-parse --show-toplevel)/docs/superpowers/plans"

for plan_file in "$PLANS_DIR"/*.md; do
    [[ -f "$plan_file" ]] || continue

    status=$(awk '/^---/{f=!f;next} f && /^status:/' "$plan_file" | cut -d: -f2 | tr -d ' ')
    [[ "$status" == "active" ]] || continue

    domains=$(awk '/^---/{f=!f;next} f && /^domains:/' "$plan_file")
    [[ "$domains" == *"$ROLE"* ]] || continue

    title=$(awk '/^---/{f=!f;next} f && /^title:/' "$plan_file" | cut -d: -f2- | sed 's/^ //')
    echo "### Active plan: $title"
    echo
    awk '/^---/{n++;next} n>=2' "$plan_file"
    echo
done
```

**Orchestrator habit** — before every `Agent()` call, run this script and wrap the output:

```
<active-plans>
$(scripts/plan-context.sh infra)
</active-plans>

Your task: ...
```

The role is derived from the same routing table in CLAUDE.md. This is codified in CLAUDE.md under the Agent Routing section as a required step before delegation.

---

## Cold Path: GH Action + DB Import

**`.github/workflows/track-plans.yml`**

```yaml
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
        with: { fetch-depth: 2 }
      - name: Parse changed plan files → pending JSON
        run: |
          git diff --name-only HEAD~1 HEAD -- 'docs/superpowers/plans/*.md' | while read f; do
            [[ -f "$f" ]] && bash scripts/plans-parse.sh "$f"
          done
      - name: Commit pending JSONs
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add tracking/pending/plan-*.json
          git diff --cached --quiet || git commit -m "chore(tracking): import plan context"
          git push
```

**`scripts/plans-parse.sh <file>`** — shell wrapper that calls a Python parser and writes `tracking/pending/plan-<slug>.json`.

**`scripts/plans-parse.py`** — parses frontmatter + splits markdown by H2 headings into section objects, outputs structured JSON matching the `superpowers.plans` + `superpowers.plan_sections` schema.

The existing `tracking-import` CronJob gets a new branch: filenames starting with `plan-` upsert into `superpowers.plans` / `superpowers.plan_sections` instead of `bachelorprojekt.features`.

---

## Agent Self-Serve

Each of the 6 agent `.md` files gets a new section:

```markdown
## Active plans
At session start, query your domain's active plans via the postgres MCP:
```sql
SELECT p.title, ps.section_type, ps.content
FROM superpowers.plans p
JOIN superpowers.plan_sections ps ON ps.plan_id = p.id
WHERE '<role>' = ANY(p.domains) AND p.status = 'active'
ORDER BY p.created_at DESC, ps.seq;
```
Treat the results as authoritative working context for the current feature.
Use orchestrator-injected `<active-plans>` context when present — it takes precedence over the DB query.
```

The `<role>` placeholder is replaced with the hardcoded role in each file (`infra`, `website`, etc.).

---

## Taskfile Tasks

```bash
task plans:import          # run plans-parse.sh on all active plan files → tracking/pending/
task plans:query -- <role> # psql: show active plan sections for a given role (debug/inspect)
```

---

## writing-plans Skill Integration

The `writing-plans` skill is part of the superpowers plugin and cannot be edited in-repo. Instead, a **post-plan Git hook** (`scripts/plan-frontmatter-hook.sh`) runs after the skill commits a new plan file and appends the frontmatter block if absent. Alternatively, the orchestrator adds the frontmatter manually immediately after the skill finishes — before committing — using the `domains` the user confirms in the brainstorming session.

Either way, confirming or adjusting the `domains` array is the only manual step. Everything downstream is automatic.

---

## Retroactive Backfill

Existing plans in `docs/superpowers/plans/*.md` get frontmatter added in a single chore PR. Status is set to `active` for plans whose associated feature is not yet merged, `completed` for the rest. `task plans:import` then seeds the DB.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `scripts/plan-context.sh` | Create — hot-path resolver |
| `scripts/plans-parse.sh` | Create — shell wrapper for GH Action |
| `scripts/plans-parse.py` | Create — markdown → JSON parser |
| `.github/workflows/track-plans.yml` | Create — GH Action |
| `Taskfile.yml` | Modify — add `plans:import`, `plans:query` tasks |
| `~/.claude/agents/bachelorprojekt-*.md` (×6) | Modify — add self-serve query section |
| `scripts/plan-frontmatter-hook.sh` | Create — post-plan hook that appends frontmatter when absent |
| `CLAUDE.md` | Modify — add plan-context.sh step to Agent Routing section |
| `docs/superpowers/plans/*.md` (existing) | Modify — backfill frontmatter |
| DB migration | Create — `superpowers` schema + two tables |

---

## Error Handling

- Resolver script produces no output if no active plans match the role — orchestrator omits the `<active-plans>` block silently
- GH Action failure does not block merges (non-required check); pending JSON accumulates and imports on next CronJob run
- Agent self-query failure (DB unavailable) is non-fatal; agent falls back to its static system prompt
