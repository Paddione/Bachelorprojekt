# Software Factory — 6-Phase Pipeline Pattern

> **Status:** Phase 1 Reference — manuelle Workflow-Script-Erstellung.
> Das folgende Dokument beschreibt das Pipeline-Muster und die Claude Code
> Workflow API, die zur Implementierung genutzt wird.

## Workflow API — Schnellreferenz

Die Software Factory nutzt die **Claude Code Workflow API** zur
Multi-Agent-Orchestrierung. Ein Workflow-Script ist eine JavaScript-Datei,
die mit `export const meta = {...}` beginnt.

### Kernfunktionen

| Funktion | Signatur | Verhalten |
|----------|----------|-----------|
| `agent(prompt, opts?)` | `(string, {label?, phase?, schema?, isolation?}) => Promise<T>` | Startet einen Subagenten. Ohne `schema`: gibt String zurück. Mit `schema` (JSON Schema): validiertes Objekt. `isolation: 'worktree'` für isolierte Datei-Operationen. |
| `parallel(thunks)` | `(() => Promise<T>)[] => Promise<T[]>` | BARRIER — alle Thunks parallel, wartet auf alle. Fehlerhafte Thunks werden zu `null`. |
| `pipeline(items, ...stages)` | `(T[], ...((prev, item, i) => Promise<U>)[]) => Promise<U[]>` | Items durchlaufen alle Stages unabhängig — kein Barrier zwischen Stages. Item A kann Stage 3 erreichen während B noch in Stage 1 ist. |
| `phase(title)` | `(string) => void` | Startet eine neue Phase im Progress-Display. |
| `log(message)` | `(string) => void` | Emittiert eine Fortschrittsmeldung. |
| `args` | `any` | Der beim Workflow-Aufruf übergebene `args`-Parameter. |

### Meta-Block

```js
export const meta = {
  name: 'mein-workflow',        // eindeutiger Name
  description: 'Kurzbeschreibung', // einzeilig
  phases: [                      // muss mit phase()-Aufrufen übereinstimmen
    { title: 'Phase 1' },
    { title: 'Phase 2' },
  ],
}
```

### Schema-Validierung

```js
const MEIN_SCHEMA = {
  type: 'object',
  properties: {
    ergebnis: { type: 'string' },
    score: { type: 'number', minimum: 0, maximum: 100 },
  },
  required: ['ergebnis'],
}

const result = await agent('Analysiere...', { schema: MEIN_SCHEMA })
// result ist jetzt typed: { ergebnis: string, score?: number }
```

### Pipeline vs Parallel

**`pipeline()` — kein Barrier, gut für unabhängige Stages:**
```js
const results = await pipeline(
  tasks,
  task => agent(`Implementiere ${task.id}`, { isolation: 'worktree' }),
  result => agent(`Verifiziere ${result.diff}`, { schema: VERIFY_SCHEMA })
)
// Task 2 beginnt Verifikation sobald Implementierung fertig,
// auch wenn Task 1 noch implementiert wird.
```

**`parallel()` — Barrier, wenn alle Ergebnisse einer Stage gebraucht werden:**
```js
const allFindings = await parallel([
  () => agent('Bug-Hunt', { schema: BUG_SCHEMA }),
  () => agent('Security-Audit', { schema: SEC_SCHEMA }),
  () => agent('Pattern-Check', { schema: PATTERN_SCHEMA }),
])
// Erst wenn ALLE drei Agenten fertig sind, geht es weiter.
```

### Typische Fehler

- **`Date.now()` / `Math.random()`** sind in Workflow-Scripts NICHT verfügbar (verhindern Resume). Nutze `args.timestamp` für Zeitstempel.
- **Schema-Validierung** erzwingt Retry bei Mismatch — stelle sicher, dass der Agent-Prompt das Schema kennt.
- **`isolation: 'worktree'`** ist teuer (~200-500ms Setup) — nur nutzen wenn nötig.

---

## Vollständiges Pipeline-Beispiel

(Das folgende Script zeigt eine vollständige 6-Phasen-Pipeline.)

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

      1. Create worktree: bash scripts/worktree-create.sh feature/${args.slug}-${task.id} .worktrees/${task.id}
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
