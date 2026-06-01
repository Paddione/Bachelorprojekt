---
title: Software Factory — Phase 1: Foundation Implementation Plan
ticket_id: T000414
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Software Factory — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational tier of the Software Factory: DB schema extensions for pgvector-based context pool, structured Agent-Templates, the 6-phase Pipeline Workflow pattern, a 3-agent Adversarial Review Panel, and a basic Conflict Detector. Phase 1 proves the pipeline can autonomously implement a single feature with parallel task agents.

**Architecture:** Modify `website/src/lib/tickets-db.ts` to add `touched_files`, `pipeline_slot` columns and the `tickets.ticket_embeddings` table. Create structured markdown templates in `scripts/factory/templates/`. Document the 6-phase Workflow script as a reference pattern. Build three adversarial review agent prompts. Wire pgvector semantic search for "similar past tickets".

**Tech Stack:** PostgreSQL 16 + pgvector 0.8.0, bge-m3 (1024-dim), Claude Code Workflow Tool, tickets.tickets schema, bash (ticket.sh)

**Spec:** `docs/superpowers/specs/2026-06-01-software-factory-design.md`
**Vorhaben-Ticket:** T000413

---

## File Map

| File | Responsibility |
|------|---------------|
| `website/src/lib/tickets-db.ts:86-88` | Add `touched_files TEXT[]`, `pipeline_slot INTEGER` columns |
| `website/src/lib/tickets-db.ts:258-259` (after) | Add `tickets.ticket_embeddings` table + HNSW index |
| `website/src/lib/tickets-db.ts:409-411` (after) | Add `tickets.v_factory_metrics` and `tickets.v_active_features` views |
| `scripts/factory/templates/scout-template.md` | Structured Scout output template |
| `scripts/factory/templates/design-template.md` | Structured Design output template |
| `scripts/factory/templates/lessons-learned-template.md` | Post-deploy retrospective template |
| `scripts/factory/pipeline-pattern.md` | Reference: 6-phase Workflow script pattern |
| `scripts/factory/review-bug-hunter.prompt.md` | Adversarial review agent 1: Bug Hunter |
| `scripts/factory/review-security-auditor.prompt.md` | Adversarial review agent 2: Security Auditor |
| `scripts/factory/review-pattern-enforcer.prompt.md` | Adversarial review agent 3: Pattern Enforcer |
| `scripts/factory/conflict-check.sh` | File-overlap detection script |
| `tests/bats/factory-db-schema.bats` | BATS tests for new schema objects |
| `tests/bats/factory-conflict-check.bats` | BATS tests for conflict detection |
| `docs/superpowers/references/factory-usage.md` | Usage guide |

---

### Task 1: DB-Schema — touched_files + pipeline_slot Columns

**Files:**
- Modify: `website/src/lib/tickets-db.ts:86-88` (insert after existing `ADD COLUMN` block)

- [ ] **Step 1: Add column additions in tickets-db.ts**

Insert after line 88 (`await pool.query(\`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS is_test_data ...`):

```typescript
  // Phase 1 Software Factory: touched_files stores the file paths a feature
  // touches, used by the conflict detector to prevent parallel features from
  // editing the same files. pipeline_slot tracks which parallel slot (1-N)
  // this feature occupies. NULL means the feature is queued but not yet
  // assigned to a slot.
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS touched_files TEXT[]`);
  await pool.query(`ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS pipeline_slot INTEGER`);
```

- [ ] **Step 2: Update fn_audit_log to track touched_files**

Modify the `tracked_field` array in `fn_audit_log` function (line ~365) to include `touched_files`:

In `website/src/lib/tickets-db.ts`, find the line:
```typescript
        'reporter_id','reporter_email','title','description','url','component',
```
Replace with:
```typescript
        'reporter_id','reporter_email','title','description','url','component',
        'touched_files',
```

- [ ] **Step 3: Verify schema locally**

Run against the dev database:
```bash
cd website
DATABASE_URL=postgresql://website:dev@localhost:5432/website pnpm tsx -e "
const { initTicketsSchema } = require('./src/lib/tickets-db');
initTicketsSchema().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `OK` exit 0, no errors.

- [ ] **Step 4: Verify columns exist**

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- psql -U website -d website -c "
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name IN ('touched_files','pipeline_slot');
"
```

Expected: 2 rows: `touched_files | ARRAY`, `pipeline_slot | integer`

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(factory): add touched_files + pipeline_slot columns to tickets [T000413]"
```

---

### Task 2: DB-Schema — ticket_embeddings Table + pgvector Index

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (insert after ticket_attachments block, after line 258)

- [ ] **Step 1: Add ticket_embeddings table creation**

Insert after line 258 (after the `ticket_attachments` index creation):

```typescript
  // Phase 1 Software Factory: pgvector-backed embedding table for semantic
  // search across ticket content. bge-m3 produces 1024-dimensional vectors.
  // chunk_type classifies the embedded content: summary (title+desc), spec
  // (design docs), decision (architectural choices), lesson (post-mortem).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.ticket_embeddings (
      id            BIGSERIAL PRIMARY KEY,
      ticket_id     UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      chunk         TEXT NOT NULL,
      chunk_type    TEXT NOT NULL DEFAULT 'summary'
                    CHECK (chunk_type IN ('summary','spec','decision','lesson')),
      embedding     VECTOR(1024),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_embeddings_ticket_idx ON tickets.ticket_embeddings (ticket_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ticket_embeddings_chunk_type_idx ON tickets.ticket_embeddings (chunk_type)`);

  // HNSW index for cosine similarity search. bge-m3 embeddings should be
  // normalized before storage so cosine distance is meaningful.
  // m=16, ef_construction=64 are sane defaults for up to ~100k embeddings.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ticket_embeddings_hnsw_idx
      ON tickets.ticket_embeddings
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `);

  // Helper function for semantic similarity search.
  // Usage: SELECT * FROM tickets.fn_find_similar(query_embedding, 5);
  await pool.query(`
    CREATE OR REPLACE FUNCTION tickets.fn_find_similar(
      query_embedding VECTOR(1024),
      limit_count INTEGER DEFAULT 5
    ) RETURNS TABLE(
      ticket_id UUID,
      external_id TEXT,
      chunk TEXT,
      chunk_type TEXT,
      similarity DOUBLE PRECISION
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        te.ticket_id,
        t.external_id,
        te.chunk,
        te.chunk_type,
        (1 - (te.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
      FROM tickets.ticket_embeddings te
      JOIN tickets.tickets t ON t.id = te.ticket_id
      ORDER BY te.embedding <=> query_embedding
      LIMIT limit_count;
    END $$ LANGUAGE plpgsql STABLE
  `);
```

- [ ] **Step 2: Verify schema locally**

```bash
cd website
DATABASE_URL=postgresql://website:dev@localhost:5432/website pnpm tsx -e "
const { initTicketsSchema } = require('./src/lib/tickets-db');
initTicketsSchema().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `OK` exit 0

- [ ] **Step 3: Verify table and index exist**

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- psql -U website -d website -c "
SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='ticket_embeddings';
"
```

Expected: 1 row: `ticket_embeddings`

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- psql -U website -d website -c "
SELECT indexname FROM pg_indexes WHERE schemaname='tickets' AND indexname LIKE '%embedding%';
"
```

Expected: 3 rows (ticket_embeddings_ticket_idx, ticket_embeddings_chunk_type_idx, ticket_embeddings_hnsw_idx)

- [ ] **Step 4: Test fn_find_similar with a dummy embedding**

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- psql -U website -d website -c "
-- Insert a test embedding (all-zeros vector)
INSERT INTO tickets.ticket_embeddings (ticket_id, chunk, chunk_type, embedding)
SELECT id, 'test chunk', 'summary', array_fill(0::real, ARRAY[1024])::VECTOR
FROM tickets.tickets WHERE type='project' LIMIT 1;

-- Query it
SELECT * FROM tickets.fn_find_similar(array_fill(0::real, ARRAY[1024])::VECTOR, 3);

-- Clean up
DELETE FROM tickets.ticket_embeddings WHERE chunk = 'test chunk';
"
```

Expected: Returns 1+ rows, no errors.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(factory): add ticket_embeddings table with HNSW index + fn_find_similar [T000413]"
```

---

### Task 3: DB-Schema — Factory Views (v_factory_metrics + v_active_features)

**Files:**
- Modify: `website/src/lib/tickets-db.ts` (insert after pr_events index block, after line 411)

- [ ] **Step 1: Add factory views**

Insert after line 411 (after `pr_events_category_idx`):

```typescript
  // Phase 1 Software Factory: metrics view for tracking throughput and cycle
  // time. v_active_features is the Dispatcher's working set — features that
  // are in a non-terminal state and have file-touch data for conflict analysis.
  await pool.query(`
    CREATE OR REPLACE VIEW tickets.v_factory_metrics AS
    SELECT
      date_trunc('day', created_at)::date AS day,
      COUNT(*) FILTER (WHERE status = 'done') AS features_shipped,
      ROUND(AVG(EXTRACT(EPOCH FROM (done_at - created_at))/3600)::numeric
        FILTER (WHERE status = 'done'), 1) AS avg_cycle_time_h,
      COUNT(*) FILTER (WHERE status = 'blocked') AS escalations,
      COUNT(*) FILTER (WHERE type = 'feature') AS total_features
    FROM tickets.tickets
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);

  await pool.query(`
    CREATE OR REPLACE VIEW tickets.v_active_features AS
    SELECT
      id,
      external_id,
      title,
      priority,
      status,
      touched_files,
      pipeline_slot,
      created_at,
      updated_at
    FROM tickets.tickets
    WHERE type = 'feature'
      AND status IN ('backlog', 'in_progress', 'in_review')
      AND touched_files IS NOT NULL
    ORDER BY
      CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END,
      created_at
  `);
```

- [ ] **Step 2: Verify views**

```bash
kubectl exec -n workspace --context fleet deploy/shared-db -c postgres -- psql -U website -d website -c "
SELECT * FROM tickets.v_factory_metrics LIMIT 1;
SELECT * FROM tickets.v_active_features LIMIT 1;
"
```

Expected: Both queries return successfully (may return 0 rows if no feature tickets exist, that's OK).

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(factory): add v_factory_metrics + v_active_features views [T000413]"
```

---

### Task 4: Structured Agent Templates (Scout, Design, Lessons-Learned)

**Files:**
- Create: `scripts/factory/templates/scout-template.md`
- Create: `scripts/factory/templates/design-template.md`
- Create: `scripts/factory/templates/lessons-learned-template.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p scripts/factory/templates
```

- [ ] **Step 2: Write scout-template.md**

Create `scripts/factory/templates/scout-template.md`:

```markdown
# Scout Report: {feature_title}

**Ticket:** {external_id}
**Timestamp:** {timestamp}
**Agent:** {agent_label}

## Complexity Assessment

- **complexity**: `[simple | medium | complex]`
- **rationale**: {one sentence why}

## Touched Files

```
{file_path_1}
{file_path_2}
...
```

## Risk Areas

- {risk_1}: {brief explanation}
- {risk_2}: {brief explanation}

## Similar Past Tickets (pgvector)

| Ticket | Similarity | Relevance |
|--------|-----------|-----------|
| {external_id} | {score} | {why relevant} |

## Estimated Slots

- **estimated_slots**: {1-5}
- **rationale**: {why this many slots needed}

## Prerequisites

- [ ] {prereq_1}
- [ ] {prereq_2}

## Notes

{freeform notes, architectural constraints discovered, gotchas}
```

- [ ] **Step 3: Write design-template.md**

Create `scripts/factory/templates/design-template.md`:

```markdown
# Design: {feature_title}

**Ticket:** {external_id}
**Spec File:** `docs/superpowers/specs/{date}-{slug}-design.md`
**Timestamp:** {timestamp}

## Architectural Decision

{one paragraph: chosen approach and why}

## Trade-offs Considered

```json
{
  "options": [
    {
      "name": "{option_name}",
      "pros": ["{pro1}", "{pro2}"],
      "cons": ["{con1}", "{con2}"],
      "chosen": true|false
    }
  ]
}
```

## Adversarial Review

**Reviewer Agent:** {agent_label}
**Verdict:** `[approved | needs_revision | rejected]`

### Challenge 1: {challenge_title}
- **Claim**: {what the design claims}
- **Counter-argument**: {why it might be wrong}
- **Resolution**: {how the concern was addressed or why it's accepted}

### Challenge 2: {challenge_title}
- **Claim**: ...
- **Counter-argument**: ...
- **Resolution**: ...

## Affected Components

| Component | Impact | Risk |
|-----------|--------|------|
| {component} | {low/medium/high} | {risk description} |

## Migration / Rollback Plan

- **Forward**: {steps to deploy}
- **Backward**: {steps to rollback if needed}
```

- [ ] **Step 4: Write lessons-learned-template.md**

Create `scripts/factory/templates/lessons-learned-template.md`:

```markdown
# Lessons Learned: {feature_title}

**Ticket:** {external_id}
**Cycle Time:** {hours}h
**Outcome:** `[shipped | rolled_back | blocked]`

## What Worked

- {thing that went well}
- {another thing}

## What Failed

- {thing that broke}
- {another failure}

## Footguns Discovered

- **{footgun_name}**: {description, how to avoid next time}

## Would Do Differently

- {concrete change for next similar feature}

## Metrics

- **Commits**: {count}
- **Files changed**: {count}
- **Retries needed**: {count}
- **Escalations**: {count}
```

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/templates/
git commit -m "feat(factory): add Scout, Design, and Lessons-Learned templates [T000413]"
```

---

### Task 5: Pipeline Workflow Pattern (Reference Documentation)

**Files:**
- Create: `scripts/factory/pipeline-pattern.md`

- [ ] **Step 1: Write pipeline-pattern.md**

Create `scripts/factory/pipeline-pattern.md`:

```markdown
# Software Factory — 6-Phase Pipeline Pattern

Reference for building a Claude Code Workflow script that implements the full
Scout→Design→Plan→Implement→Verify→Deploy pipeline.

## Workflow Meta Block

```js
export const meta = {
  name: 'factory-pipeline',
  description: 'Software Factory pipeline: Scout → Design → Plan → Implement → Verify → Deploy',
  phases: [
    { title: 'Scout' },
    { title: 'Design' },
    { title: 'Plan' },
    { title: 'Implement' },
    { title: 'Verify' },
    { title: 'Deploy' },
  ],
}
```

## Phase 1: Scout

```js
phase('Scout')

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    complexity: { type: 'string', enum: ['simple','medium','complex'] },
    touched_files: { type: 'array', items: { type: 'string' } },
    risk_areas: { type: 'array', items: { type: 'string' } },
    estimated_slots: { type: 'integer', minimum: 1, maximum: 5 },
    similar_tickets: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
  required: ['complexity','touched_files','risk_areas','estimated_slots'],
}

const scout = await agent(`
  You are the Scout Agent. Analyze this feature request against the codebase:

  FEATURE: ${args.title}
  DESCRIPTION: ${args.description}

  1. Run Explore agent to find affected files
  2. Classify complexity (simple|medium|complex)
  3. Identify risk areas
  4. Check tickets.v_active_features for currently touched files
  5. If pgvector is available, query similar past tickets via fn_find_similar

  Return structured data matching the Scout schema.
`, { schema: SCOUT_SCHEMA, phase: 'Scout' })

// Update ticket with scout results
await agent(`
  Update ticket ${args.ticket_id}:
  - Set touched_files = ${JSON.stringify(scout.touched_files)}
  - Add comment with Scout report using the scout-template.md format
`, { phase: 'Scout' })

if (scout.complexity === 'simple') {
  log(`Simple feature — fast path: Scout → Verify → Deploy`)
  // Skip to Verify phase directly
}
```

## Phase 2: Design

```js
phase('Design')

if (scout.complexity !== 'simple') {
  const DESIGN_SCHEMA = {
    type: 'object',
    properties: {
      spec_summary: { type: 'string' },
      architectural_decision: { type: 'string' },
      tradeoffs: { type: 'array' },
      approved: { type: 'boolean' },
    },
    required: ['spec_summary','architectural_decision','approved'],
  }

  // Brainstorming + spec generation
  const {spec} = await agent(`
    Use the brainstorming skill to design the feature:
    Feature: ${args.title}
    Scout report: ${JSON.stringify(scout)}

    Write spec to docs/superpowers/specs/<date>-<slug>-design.md
    Fill out the design-template.md format.
  `, { schema: DESIGN_SCHEMA, phase: 'Design' })

  // Adversarial verify
  const {verdict} = await agent(`
    You are an adversarial reviewer. Try to REFUTE this design:
    ${JSON.stringify(spec)}

    Find flaws, missing edge cases, architectural conflicts.
    Default to finding at least ONE issue. If the design is truly
    flawless, explain why.
  `, { schema: VERDICT_SCHEMA, phase: 'Design' })

  if (!verdict.approved) {
    log(`Design rejected: ${verdict.reasons}`)
    // Retry design with feedback (max 3 attempts)
  }
}
```

## Phase 3: Plan

```js
phase('Plan')

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } },
          acceptance_criteria: { type: 'string' },
        },
        required: ['id','files','description','acceptance_criteria'],
      },
    },
  },
  required: ['tasks'],
}

const plan = await agent(`
  Decompose the feature into independent tasks.
  Each task touches DISJOINT files — no two tasks should touch the same file.
  If two tasks need the same file, merge them or sequence them.

  Feature: ${args.title}
  Scout: ${JSON.stringify(scout)}
  Design: ${JSON.stringify(spec)}
`, { schema: TASK_SCHEMA, phase: 'Plan' })

log(`${plan.tasks.length} tasks planned`)
```

## Phase 4: Implement (Parallel)

```js
phase('Implement')

const results = await pipeline(
  plan.tasks,
  async (task) => {
    return await agent(`
      Implement this task in an isolated worktree:

      TASK: ${task.description}
      FILES: ${task.files.join(', ')}
      ACCEPTANCE: ${task.acceptance_criteria}

      1. Create worktree: git worktree add -b feature/${args.slug}-${task.id} /tmp/wt-${task.id} origin/main
      2. Implement the change
      3. Run local tests: task test:all
      4. Return the diff and test results
    `, { schema: IMPLEMENT_RESULT_SCHEMA, isolation: 'worktree', phase: 'Implement' })
  },
  async (result, task) => {
    // Verify stage runs per-task as soon as it completes
    if (!result.tests_pass) {
      log(`Task ${task.id} tests failed — retrying`)
      return await agent(`Fix failing tests for task ${task.id}: ${result.errors}`, { isolation: 'worktree', phase: 'Implement' })
    }
    return result
  }
)
```

## Phase 5: Verify

```js
phase('Verify')

// Merge all task branches
const merged = await agent(`
  Merge all task branches into a single feature branch:
  ${plan.tasks.map(t => `feature/${args.slug}-${t.id}`).join('\n')}

  Run full test suite and CI checks.
  If green, proceed to adversarial review.
  If red, analyze failures and attempt fix (max 2 retries).
`, { phase: 'Verify' })

// Layer 3: Adversarial Review Panel
const reviews = await parallel([
  () => agent(`...bug-hunter prompt...`, { schema: REVIEW_SCHEMA }),
  () => agent(`...security-auditor prompt...`, { schema: REVIEW_SCHEMA }),
  () => agent(`...pattern-enforcer prompt...`, { schema: REVIEW_SCHEMA }),
])

const criticalIssues = reviews.flatMap(r => r?.findings || []).filter(f => f.severity === 'critical')
if (criticalIssues.length > 0) {
  log(`CRITICAL issues found — blocking merge: ${JSON.stringify(criticalIssues)}`)
  // Escalate: ticket.status = 'blocked'
} else {
  log('All reviews passed — proceeding to deploy')
}
```

## Phase 6: Deploy

```js
phase('Deploy')

await agent(`
  Create PR from feature branch, merge via squash-and-merge, deploy:
  1. gh pr create --title "${args.title}" --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
  2. gh pr merge --squash --delete-branch
  3. Determine correct deploy task (use task-oracle.sh) and execute
  4. Update ticket status to 'done'
  5. Write Lessons-Learned using the template
`, { phase: 'Deploy' })

log('Feature deployed successfully')
```

## Complexity Routing Summary

| Complexity | Phases | Parallel Tasks |
|-----------|--------|---------------|
| simple | Scout → Verify → Deploy | 1 (single agent) |
| medium | Scout → Design(light) → Plan → Implement(2-3) → Verify → Deploy | 2-3 |
| complex | Scout → Design(adversarial) → Plan(deps) → Implement(5+) → Verify → Deploy | 5+ |
```

- [ ] **Step 2: Commit**

```bash
git add scripts/factory/pipeline-pattern.md
git commit -m "feat(factory): document 6-phase pipeline Workflow pattern [T000413]"
```

---

### Task 6: Adversarial Review Panel — Three Agent Prompts

**Files:**
- Create: `scripts/factory/review-bug-hunter.prompt.md`
- Create: `scripts/factory/review-security-auditor.prompt.md`
- Create: `scripts/factory/review-pattern-enforcer.prompt.md`

- [ ] **Step 1: Write bug-hunter prompt**

Create `scripts/factory/review-bug-hunter.prompt.md`:

```markdown
# Bug Hunter — Adversarial Review Agent

## Role
You are a senior software engineer specialized in finding logical bugs,
race conditions, null-reference errors, and edge-case failures in code
diffs. You approach every review with SKEPTICISM: assume the code has at
least one bug until proven otherwise.

## Review Scope
Review the provided git diff. Focus ONLY on changed files.

## Bug Categories to Hunt

1. **Null / Undefined**: Is any value dereferenced without a null check?
2. **Race Conditions**: Are there async operations that could interleave incorrectly? Shared mutable state without synchronization?
3. **Edge Cases**: Empty arrays, zero values, negative numbers, very large inputs, timeout scenarios
4. **Control Flow**: Missing `else` branches, fall-through cases, unreachable code
5. **Type Mismatches**: Is the code assuming a type that could be different at runtime?
6. **Resource Leaks**: File handles, DB connections, event listeners not cleaned up

## Output Schema

Return JSON:
```json
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "file": "exact/file/path.ts",
      "line": 42,
      "description": "What the bug is",
      "reproduction": "How to trigger it",
      "suggested_fix": "Concrete code fix"
    }
  ],
  "summary": "Overall assessment in one sentence"
}
```

## Rules
- If you find ZERO bugs, explain WHY the code is bug-free (don't just say "no bugs found")
- Prefer false positives over missed bugs — flag anything suspicious
- Each finding MUST include a suggested fix (not just "add error handling")
```

- [ ] **Step 2: Write security-auditor prompt**

Create `scripts/factory/review-security-auditor.prompt.md`:

```markdown
# Security Auditor — Adversarial Review Agent

## Role
You are a security engineer auditing code changes for vulnerabilities.
You check for OWASP Top 10 patterns and infrastructure-specific risks
in Kubernetes manifests and Astro/Svelte code.

## Review Scope
Review the provided git diff. Focus on security-relevant changes.

## Vulnerability Categories

1. **Injection**: SQL injection, shell injection, template injection. Any user input concatenated into queries or commands?
2. **Secrets Exposure**: Hardcoded credentials, API keys, tokens. Any secret in plaintext in the diff?
3. **SSRF**: User-controlled URLs being fetched? Network requests to user-supplied hosts?
4. **Authorization Bypass**: Missing auth checks on new API routes? Missing `--allowed-groups` on oauth2-proxy?
5. **Insecure Defaults**: Disabled TLS, debug mode in prod, permissive CORS
6. **Misconfiguration**: Privileged pods, hostNetwork without justification, missing NetworkPolicies
7. **Data Leakage**: PII in logs, error messages exposing internals, verbose stack traces in prod

## Output Schema

Return JSON:
```json
{
  "findings": [
    {
      "vulnerability": "Name of vulnerability class",
      "severity": "critical|high|medium|low",
      "file": "exact/file/path",
      "line": 42,
      "description": "What the vulnerability is",
      "exploit_scenario": "How an attacker would exploit it",
      "fix": "Concrete remediation"
    }
  ],
  "risk_assessment": "Overall security posture after this change"
}
```

## Rules
- Flag anything that COULD be a vulnerability, even if exploitation seems unlikely
- Kubernetes manifests: check for privileged mode, hostNetwork, missing resource limits
- Every finding must include a concrete exploit scenario
```

- [ ] **Step 3: Write pattern-enforcer prompt**

Create `scripts/factory/review-pattern-enforcer.prompt.md`:

```markdown
# Pattern Enforcer — Adversarial Review Agent

## Role
You enforce the Bachelorprojekt codebase conventions and patterns.
Your job is to ensure new code follows established patterns in
CLAUDE.md, website/WEBSITE-STANDARDS.md, and the k3d/ overlay
structure.

## Review Scope
Review the provided git diff against project conventions.

## Convention Categories

1. **File Placement**: Is the new file in the right directory?
   - K8s manifests → `k3d/` (base) or `prod*/` (overlay)
   - Website components → `website/src/components/`
   - Scripts → `scripts/`

2. **envsubst Variables**: If a manifest uses `${NEW_VAR}`, is it registered in:
   - `environments/schema.yaml`
   - The `envsubst` variable list in `Taskfile.yml`

3. **Domain Registration**: If a new hostname is used, is it in `k3d/configmap-domains.yaml`?

4. **Branch Naming**: Does the branch follow `feature/*`, `fix/*`, or `chore/*`?

5. **Commit Format**: Do commits follow conventional commits?
   - `feat(scope): ...` / `fix(scope): ...` / `chore(scope): ...`

6. **Test Coverage**: New functionality should have corresponding tests in `tests/`

7. **Configuration Patterns**: Does the code follow existing patterns?
   - Env config via `environments/<env>.yaml` + `env-resolve.sh`
   - Secrets via `environments/.secrets/` → SealedSecret
   - Brand-specific overlays in `prod-fleet/<brand>/`

## Output Schema

Return JSON:
```json
{
  "violations": [
    {
      "severity": "blocker|warning|info",
      "pattern_expected": "What the convention requires",
      "actual": "What the code does",
      "file": "exact/file/path",
      "fix": "How to align with convention"
    }
  ],
  "convention_compliance": "compliant|mostly_compliant|needs_work"
}
```

## Rules
- Check CLAUDE.md and website/WEBSITE-STANDARDS.md for the authoritative conventions
- If you're not sure about a convention, flag it as `info` severity
- Reference the specific section of CLAUDE.md that defines each convention
```

- [ ] **Step 4: Commit**

```bash
git add scripts/factory/review-*.prompt.md
git commit -m "feat(factory): add adversarial review panel prompts (bug-hunter, security-auditor, pattern-enforcer) [T000413]"
```

---

### Task 7: Conflict Detector Script

**Files:**
- Create: `scripts/factory/conflict-check.sh`

- [ ] **Step 1: Write conflict-check.sh**

Create `scripts/factory/conflict-check.sh`:

```bash
#!/usr/bin/env bash
# scripts/factory/conflict-check.sh — detects file-overlap conflicts
# between active features for the Software Factory Dispatcher.
#
# Usage:
#   bash scripts/factory/conflict-check.sh <new_ticket_external_id> [touched_file...]
#
# Output: JSON array of conflicting ticket external_ids, or empty array [].
# Exit 0 = no conflicts, Exit 1 = conflicts found, Exit 2 = error.

set -euo pipefail

CTX="${FACTORY_CTX:-fleet}"
NS="${FACTORY_NS:-workspace}"
DB="website"
USER="website"

_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l app=shared-db -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo '{"error":"no shared-db pod found"}' >&2
    exit 2
  fi
  echo "$pod"
}

main() {
  local new_ticket_id="${1:-}"
  shift || true
  local new_files=("$@")

  if [[ -z "$new_ticket_id" ]]; then
    echo '{"error":"usage: conflict-check.sh <external_id> [files...]"}' >&2
    exit 2
  fi

  local pod
  pod=$(_pgpod)

  if [[ ${#new_files[@]} -eq 0 ]]; then
    # No files specified — read touched_files from the ticket itself
    local ticket_files
    ticket_files=$(kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
      psql -U "$USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 \
      -v ext_id="$new_ticket_id" <<'EOF'
SELECT ARRAY_TO_JSON(touched_files) FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
    if [[ -z "$ticket_files" || "$ticket_files" == "null" ]]; then
      echo '{"error":"ticket not found or touched_files is null"}' >&2
      exit 2
    fi
    # Parse the JSON array into bash — safe because file paths don't contain newlines
    mapfile -t new_files < <(echo "$ticket_files" | jq -r '.[]')
  fi

  if [[ ${#new_files[@]} -eq 0 ]]; then
    echo '[]'
    exit 0
  fi

  # Build a JSON array of the new files for SQL
  local files_json
  files_json=$(printf '%s\n' "${new_files[@]}" | jq -R . | jq -s .)

  # Find active features (excluding the new ticket) whose touched_files
  # overlap with the new feature's files.
  local conflicts
  conflicts=$(kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "$USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 \
    -v ext_id="$new_ticket_id" \
    -v files="$files_json" <<'EOF'
WITH new_files AS (
  SELECT jsonb_array_elements_text(:'files'::jsonb) AS f
)
SELECT json_agg(t.external_id)
FROM tickets.tickets t, new_files nf
WHERE t.external_id != :'ext_id'
  AND t.type = 'feature'
  AND t.status IN ('backlog','in_progress','in_review')
  AND t.touched_files IS NOT NULL
  AND t.touched_files @> ARRAY[nf.f];
EOF
)

  if [[ -z "$conflicts" || "$conflicts" == "null" ]]; then
    echo '[]'
    exit 0
  fi

  echo "$conflicts"
  exit 1
}

main "$@"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/factory/conflict-check.sh
```

- [ ] **Step 3: Create BATS test**

Create `tests/bats/factory-conflict-check.bats`:

```bash
#!/usr/bin/env bats

setup() {
  load '../helpers/load.bash'
}

@test "FA-SF-01: conflict-check rejects missing args" {
  run bash scripts/factory/conflict-check.sh
  [[ "$status" -eq 2 ]]
  [[ "$output" =~ error ]]
}

@test "FA-SF-02: conflict-check returns empty array for unknown ticket" {
  run bash scripts/factory/conflict-check.sh "T999999" "k3d/some-file.yaml"
  [[ "$status" -eq 2 ]]  # Should error because ticket doesn't exist
}

@test "FA-SF-03: conflict-check with explicit files produces valid JSON" {
  run bash scripts/factory/conflict-check.sh "T000413" "website/src/lib/tickets-db.ts" "k3d/website-schema.yaml"
  # May exit 0 or 1 depending on whether T000413 has conflicts
  # Just verify the output is valid JSON
  echo "$output" | jq . > /dev/null
}
```

- [ ] **Step 4: Run tests**

```bash
./tests/runner.sh local FA-SF
```

Expected: Tests pass for FA-SF-01, FA-SF-03; FA-SF-02 may need adjustment based on DB state.

- [ ] **Step 5: Commit**

```bash
git add scripts/factory/conflict-check.sh tests/bats/factory-conflict-check.bats
git commit -m "feat(factory): add conflict-check.sh with BATS tests [T000413]"
```

---

### Task 8: BATS Tests for DB Schema

**Files:**
- Create: `tests/bats/factory-db-schema.bats`

- [ ] **Step 1: Write schema verification tests**

Create `tests/bats/factory-db-schema.bats`:

```bash
#!/usr/bin/env bats

setup() {
  load '../helpers/load.bash'
}

@test "FA-SF-04: tickets.tickets has touched_files column" {
  run psql_tickets "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='touched_files'"
  [[ "$output" == "touched_files" ]]
}

@test "FA-SF-05: tickets.tickets has pipeline_slot column" {
  run psql_tickets "SELECT column_name FROM information_schema.columns WHERE table_schema='tickets' AND table_name='tickets' AND column_name='pipeline_slot'"
  [[ "$output" == "pipeline_slot" ]]
}

@test "FA-SF-06: tickets.ticket_embeddings table exists" {
  run psql_tickets "SELECT tablename FROM pg_tables WHERE schemaname='tickets' AND tablename='ticket_embeddings'"
  [[ "$output" == "ticket_embeddings" ]]
}

@test "FA-SF-07: ticket_embeddings HNSW index exists" {
  run psql_tickets "SELECT indexname FROM pg_indexes WHERE schemaname='tickets' AND indexname='ticket_embeddings_hnsw_idx'"
  [[ "$output" == "ticket_embeddings_hnsw_idx" ]]
}

@test "FA-SF-08: v_factory_metrics view exists" {
  run psql_tickets "SELECT viewname FROM pg_views WHERE schemaname='tickets' AND viewname='v_factory_metrics'"
  [[ "$output" == "v_factory_metrics" ]]
}

@test "FA-SF-09: v_active_features view exists" {
  run psql_tickets "SELECT viewname FROM pg_views WHERE schemaname='tickets' AND viewname='v_active_features'"
  [[ "$output" == "v_active_features" ]]
}

@test "FA-SF-10: fn_find_similar function exists" {
  run psql_tickets "SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname='tickets' AND proname='fn_find_similar'"
  [[ "$output" == "fn_find_similar" ]]
}

@test "FA-SF-11: chunk_type CHECK constraint enforces valid values" {
  run psql_tickets "
    DO \$\$
    BEGIN
      INSERT INTO tickets.ticket_embeddings (ticket_id, chunk, chunk_type)
      SELECT id, 'test', 'invalid_type' FROM tickets.tickets LIMIT 1;
    END \$\$
  " 2>&1
  [[ "$status" -ne 0 ]]
}
```

- [ ] **Step 2: Run schema tests**

```bash
./tests/runner.sh local FA-SF
```

Expected: All 8 tests pass (FA-SF-04 through FA-SF-11).

- [ ] **Step 3: Commit**

```bash
git add tests/bats/factory-db-schema.bats
git commit -m "test(factory): add BATS schema verification tests [T000413]"
```

---

### Task 9: Usage Guide + T000413 Update

**Files:**
- Create: `docs/superpowers/references/factory-usage.md`

- [ ] **Step 1: Write usage guide**

Create `docs/superpowers/references/factory-usage.md`:

```markdown
# Software Factory — Usage Guide

## Phase 1: Manual Pipeline Invocation

### Quick Start

```bash
# 1. Create a feature ticket
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type feature \
  --brand mentolder \
  --title "Add X feature" \
  --description "Detailed description..." \
  --priority mittel)
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
TICKET_UUID=$(echo "$TICKET_RESULT" | cut -d'|' -f2)

# 2. Run the Scout phase
# (opens a Claude Code session with the Scout prompt)
# Use: "Scout feature T000xxx using the scout-template.md format"

# 3. If complex, run Design phase
# Use: "Design feature T000xxx using brainstorming and design-template.md"

# 4. Implement via Workflow
# Use the pipeline-pattern.md as reference for the Workflow script

# 5. Deploy
# After green CI + tests: auto-merge and deploy
```

### Manual Conflict Check

```bash
bash scripts/factory/conflict-check.sh T000413 "k3d/website.yaml" "website/src/pages/index.astro"
# Returns: [] (no conflicts) or ["T000412"] (conflicts with ticket T000412)
```

### Querying Similar Past Tickets

```sql
-- Requires an embedding. In practice, the Dispatcher generates this via bge-m3.
SELECT * FROM tickets.fn_find_similar(
  (SELECT embedding FROM tickets.ticket_embeddings WHERE ticket_id = '<uuid>' LIMIT 1),
  5
);
```

### Checking Factory Metrics

```sql
SELECT * FROM tickets.v_factory_metrics;
-- day | features_shipped | avg_cycle_time_h | escalations | total_features
```

### Viewing Active Features

```sql
SELECT * FROM tickets.v_active_features;
-- Shows all features currently in pipeline slots
```

## Templates

All templates are at `scripts/factory/templates/`:
- `scout-template.md` — Scout phase output format
- `design-template.md` — Design phase output format
- `lessons-learned-template.md` — Post-deploy retrospective

## Review Agents

Prompts at `scripts/factory/review-*.prompt.md`:
- `review-bug-hunter.prompt.md` — Finds logical bugs
- `review-security-auditor.prompt.md` — Finds vulnerabilities
- `review-pattern-enforcer.prompt.md` — Enforces codebase conventions

Use them with the Workflow tool's `agent()` function or as standalone review passes.

## Architecture Decision Record

All significant Factory design decisions are recorded in the Vorhaben ticket T000413.
Spec: `docs/superpowers/specs/2026-06-01-software-factory-design.md`
```

- [ ] **Step 2: Update T000413 with spec + plan links**

```bash
./scripts/ticket.sh add-comment \
  --id T000413 \
  --body "## Phase 1 Implementation

Spec: \`docs/superpowers/specs/2026-06-01-software-factory-design.md\`
Plan: \`docs/superpowers/plans/2026-06-01-software-factory.md\`

### Bootstrapping Status
- [x] Design approved
- [x] Implementation plan written
- [ ] DB schema extensions deployed
- [ ] Templates created
- [ ] Pipeline pattern documented
- [ ] Review panel prompts ready
- [ ] Conflict detector working
- [ ] E2E pipeline test passed

### Architecture decisions
See spec Section 2 (Three-Tier Architecture) and Section 7 (Bootstrapping Roadmap)." \
  --author "Software Factory" \
  --visibility internal
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/references/factory-usage.md
git commit -m "docs(factory): add usage guide + link T000413 [T000413]"
```

---

## Completion Checklist

- [ ] `tickets.tickets` has `touched_files` (TEXT[]) and `pipeline_slot` (INTEGER)
- [ ] `tickets.ticket_embeddings` table exists with HNSW index
- [ ] `tickets.v_factory_metrics` and `tickets.v_active_features` views exist
- [ ] `tickets.fn_find_similar()` function works
- [ ] Scout, Design, Lessons-Learned templates are at `scripts/factory/templates/`
- [ ] Pipeline pattern is documented at `scripts/factory/pipeline-pattern.md`
- [ ] Three review agent prompts exist at `scripts/factory/review-*.prompt.md`
- [ ] `conflict-check.sh` detects file overlaps correctly
- [ ] BATS tests (FA-SF-01 through FA-SF-11) all pass
- [ ] Usage guide written
- [ ] T000413 updated with links
- [ ] `task test:all` passes
- [ ] `task workspace:validate` passes
