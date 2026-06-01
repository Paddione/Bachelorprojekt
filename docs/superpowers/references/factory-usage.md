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
