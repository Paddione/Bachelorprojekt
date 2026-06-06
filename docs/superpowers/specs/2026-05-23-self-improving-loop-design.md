# Self-Improving Dev Loop Design

## Goal

Close the dev-flow loop so that after every completed cycle (plan → execute → e2e), the system automatically detects process friction, improves the relevant skills, and explicitly restarts at the loop entry point — with zero new skill files and zero new concepts.

## Problem Statement

The current dev-flow skills form a one-way pipeline with a dead end:

```
ticket-management → dev-flow-plan → dev-flow-execute → dev-flow-e2e → [STOP]
```

Three specific gaps:
1. `dev-flow-e2e` ends without an explicit instruction to restart at `ticket-management`
2. `mishap-tracker` captures code/infra anomalies but not *process friction* (steps that required manual workarounds, missing instructions, wrong commands in skills)
3. There is no step that applies skill improvements before the next iteration begins

## Solution: Approach A — Weave into existing skills

Extend the existing machinery. No new skills, no new concepts. Four files change.

---

## Change 1: `mishap-tracker` — add `process` type

### Severity mapping table (extended)

| type | tickets.type | tickets.severity | notes |
|---|---|---|---|
| broken | bug | major | |
| security | bug | critical | |
| degraded | bug | minor | |
| suspicious | task | minor | |
| drift | task | trivial | |
| **process** | **task** | **trivial** | `component` must be `skills/<skill-name>` (e.g. `skills/dev-flow-plan`); always sets `attention_mode: ai_ready` |

### Rule for `process` inserts

For `process` entries, the MISHAP_LOG `component` field must follow the format `skills/<skill-name>` — e.g. `skills/dev-flow-plan`. mishap-tracker stores this verbatim in the DB `component` column and always sets `attention_mode = 'ai_ready'`.

The loop-restart query uses `component LIKE 'skills/%'` to find them. The auto-apply step extracts the skill name as the part after the `/`.

No other MISHAP_LOG type uses the `skills/` prefix, so the query has zero false positives.

---

## Change 2: dev-flow-plan, dev-flow-execute, dev-flow-e2e — extend MISHAP_LOG header

The `> **Mishap Tracking:**` callout at the top of each skill adds `process` to the type list and provides a concrete example.

**Extended header (replace in all three skills):**

```
> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern,
> configuration drift, or **process friction** you notice — even if unrelated
> to the current task — add an entry with:
>   `type` (broken/degraded/suspicious/security/drift/process),
>   `title`, `description`, and `component`.
>
> `process` = a step that required a manual workaround, had wrong/missing
> instructions, or caused unexpected friction. `component` MUST use the
> format `skills/<skill-name>`. Example:
>   `{type: process, title: "wss patch required manual retry",
>     description: "scripts/superpowers-helper-patch.sh failed silently on first run — step 2b needs an explicit exit-code check",
>     component: "skills/dev-flow-plan"}`
>
> Invoke `mishap-tracker` at the very end.
```

---

## Change 3: `dev-flow-e2e` — add Schritt 9 (Loop-Restart & Skill-Verbesserung)

Placed **after** the existing Mishap Report section (which calls `mishap-tracker`).

### Schritt 9: Loop-Restart & Skill-Verbesserung

**Step 9a — Query open skill-improvement tickets:**

```bash
PGPOD=$(kubectl get pod -n workspace --context fleet \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context fleet -- \
  psql -U website -d website -At -c \
  "SELECT external_id, title, description, component
   FROM tickets.tickets
   WHERE status NOT IN ('done', 'archived')
     AND component LIKE 'skills/%'
     AND attention_mode = 'ai_ready'
   ORDER BY created_at ASC;"
```

**Step 9b — Auto-apply trivial skill edits:**

For each returned ticket:
1. Extract skill name: `SKILL_NAME="${component#skills/}"` (e.g. `dev-flow-plan`)
2. Locate the SKILL.md: check `.claude/skills/$SKILL_NAME/SKILL.md` first (project skill), then `~/.claude/skills/$SKILL_NAME/SKILL.md` (user skill)
3. Read the ticket `description` — it contains the friction detail and the fix
4. Apply the improvement directly (fix wrong command, add missing step, clarify instruction)
5. Commit via ephemeral branch (branch protection blocks direct push to main):
   ```bash
   SKILL_BRANCH="chore/skills-improve-${TICKET_EXT_ID,,}"
   git checkout -b "$SKILL_BRANCH"
   git add ".claude/skills/$SKILL_NAME/SKILL.md"
   git commit -m "chore(skills): <one-line improvement> [$TICKET_EXT_ID]"
   git push -u origin "$SKILL_BRANCH"
   gh pr create \
     --title "chore(skills): <one-line improvement> [$TICKET_EXT_ID]" \
     --body "Auto-applied from skill-friction ticket $TICKET_EXT_ID." \
     --base main
   gh pr merge --squash --delete-branch
   git checkout main && git pull --rebase origin main
   ```
6. Close the ticket:
   ```bash
   kubectl exec "$PGPOD" -n workspace --context fleet -- \
     psql -U website -d website -c \
     "UPDATE tickets.tickets SET
        status = 'done', resolution = 'fixed', done_at = now(),
        notes = COALESCE(notes || E'\n\n', '') ||
          '[loop-restart $(date +%Y-%m-%d)] Applied skill improvement and merged to main.'
      WHERE external_id = '$TICKET_EXT_ID';"
   ```

**Structural changes** (rewiring handoffs, removing phases, adding new phases) must NOT be auto-applied — set `needs_human` with a specific ask instead.

**How to distinguish trivial vs structural:**
- Trivial: fix a command, add an exit-code check, add a missing `bash` step, clarify an example
- Structural: remove or reorder a numbered Schritt, change when a skill is invoked, alter the routing table in CLAUDE.md

**Step 9c — Explicit loop restart:**

```
Schritt 9 abgeschlossen. Alle skill-improvement Tickets bearbeitet.
→ Nächsten Zyklus starten: rufe `ticket-management` auf.
```

---

## Change 4: `ticket-management` — loop entry point declaration + Phase 0 skill check

### Addition 1: Header note

Add at the very top of the skill body (after the mishap tracking callout):

```markdown
> **Loop Entry Point:** This skill is the start of every dev cycle.
> Before triaging user work, process any open skill-improvement tickets (see Phase 0 below).
```

### Addition 2: Phase 0 (prepend to Session Workflow)

Add a new step **before** the existing "Phase 0 — Repo hygiene":

**Phase 0: Skill-improvement tickets (loop feedback)**

```bash
PGPOD=$(kubectl get pod -n workspace --context fleet \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context fleet -- \
  psql -U website -d website -At -c \
  "SELECT external_id, title, description, component
   FROM tickets.tickets
   WHERE status NOT IN ('done', 'archived')
     AND component LIKE 'skills/%'
     AND attention_mode = 'ai_ready'
   ORDER BY created_at ASC;"
```

If results exist: apply the same auto-apply logic as dev-flow-e2e Schritt 9b above, then proceed to Phase 0 (repo hygiene).

If no results: proceed directly to Phase 0 (repo hygiene).

*Note: This step is idempotent. If dev-flow-e2e already applied all improvements, this query returns empty.*

---

## Data Flow Summary

```
Any dev-flow skill
  │
  │  process friction noticed mid-execution
  ▼
MISHAP_LOG entry: {type: process, ...}
  │
  ▼
mishap-tracker (Post-Execution)
  │  inserts ticket with component='skills/<skill-name>', attention_mode=ai_ready
  ▼
tickets.tickets (DB)
  │
  ▼
dev-flow-e2e Schritt 9  (or ticket-management Phase 0 if called directly)
  │  reads component LIKE 'skills/%', ai_ready tickets
  │  edits SKILL.md files directly for trivial improvements
  │  commits on main
  │  closes tickets
  ▼
ticket-management (next cycle)
```

---

## Constraints

- **No new skill files** — all changes are additions/extensions to existing files
- **No new DB schema** — `component='skills'` and `attention_mode='ai_ready'` already exist
- **Trivial-only auto-apply** — structural skill changes always require human approval (`needs_human`)
- **Idempotent** — the Phase 0 query in `ticket-management` is safe to run even if dev-flow-e2e already processed everything
- **Language** — new sections in dev-flow-* skills follow the existing German style; mishap-tracker header text is in English (consistent with existing mishap-tracker)

---

## Files Changed

| File | Change type |
|---|---|
| `.claude/skills/mishap-tracker/SKILL.md` | Add `process` row to severity table + `component/attention_mode` override rule |
| `.claude/skills/dev-flow-plan/SKILL.md` | Extend MISHAP_LOG header callout |
| `.claude/skills/dev-flow-execute/SKILL.md` | Extend MISHAP_LOG header callout |
| `.claude/skills/dev-flow-e2e/SKILL.md` | Extend MISHAP_LOG header callout + add Schritt 9 |
| `.claude/skills/ticket-management/SKILL.md` | Add loop entry point header + Phase 0 skill check |
