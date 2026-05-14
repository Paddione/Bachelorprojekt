---
title: Skill Mishap Tracker — Implementation Plan
domains: []
status: active
pr_number: null
---

# Skill Mishap Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic mishap logging to all active local skills, with a shared `mishap-tracker` skill that converts findings into `tickets.tickets` records on mentolder at the end of each skill execution.

**Architecture:** A new `mishap-tracker` skill holds all DB-insertion logic. Each of the 5 active local skills gets a header block (instructs Claude to maintain a `MISHAP_LOG` during execution) and a footer block (invokes `mishap-tracker` at the end). The retired `dev-flow` skill gets a header block only.

**Tech Stack:** Markdown skill files, `kubectl exec` + `psql` against mentolder `shared-db`, `tickets.tickets` schema.

---

### Task 1: Create `mishap-tracker` skill

**Files:**
- Create: `.claude/skills/mishap-tracker/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

```bash
mkdir -p /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/mishap-tracker
```

- [ ] **Step 2: Write `.claude/skills/mishap-tracker/SKILL.md`**

Full content:

```markdown
---
name: mishap-tracker
description: Invoked at the end of any local skill execution to convert MISHAP_LOG entries into tickets in the mentolder postgres database. Never invoke directly — always called from another skill's Post-Execution section.
---

# mishap-tracker

Convert the calling skill's `MISHAP_LOG` into `tickets.tickets` records on the mentolder cluster.

## Step 1: Check MISHAP_LOG

If `MISHAP_LOG` is empty or has no entries → print "No mishaps found." and stop. Do not make any DB call.

## Step 2: Severity mapping

Map each entry's `type` to DB fields before inserting:

| type | tickets.type | tickets.severity |
|---|---|---|
| broken | bug | major |
| security | bug | critical |
| degraded | bug | minor |
| suspicious | task | minor |
| drift | task | trivial |

If an entry has no `component`, use `skill-execution` as the value.

## Step 3: Insert tickets

For each entry in `MISHAP_LOG`, run the following — substituting the mapped values:

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_EXT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, severity, status, component)
   VALUES (
     '<tickets.type>',
     'mentolder',
     '<title>',
     '<description>',
     '<tickets.severity>',
     'triage',
     '<component>'
   )
   RETURNING external_id;")
```

Collect each returned `external_id` for the summary.

## Step 4: Print summary

After all inserts, print:

```
Mishap report — N ticket(s) created:
  T000312 [broken/major]      shared-db: no backup found in last 24h
  T000313 [security/critical] keycloak: realm export missing MFA policy
  T000314 [drift/trivial]     livekit: DNS pin node differs from nodeAffinity
→ https://web.mentolder.de/admin/bugs
```

## Step 5: DB unreachable fallback

If `kubectl get pod` returns empty, or `psql` exits non-zero:

1. Print all `MISHAP_LOG` entries formatted:

```
⚠️  DB unreachable — mishaps NOT ticketed. Create manually:

  [broken/major]      shared-db: no backup found in last 24h
    shared-db pod did not respond to pg_dump trigger at 03:30 UTC.
    component: backup

  [security/critical] keycloak: realm export missing MFA policy
    realm-workspace-mentolder.json has no browserSecurityHeaders.contentSecurityPolicy.
    component: keycloak
```

2. Print: "→ Create tickets manually at https://web.mentolder.de/admin/bugs"
3. Exit cleanly — do NOT propagate an error to the parent skill.
```

- [ ] **Step 3: Verify file exists and has correct structure**

```bash
head -6 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/mishap-tracker/SKILL.md
```

Expected first 6 lines:
```
---
name: mishap-tracker
description: Invoked at the end of any local skill execution...
---

# mishap-tracker
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/mishap-tracker/SKILL.md
git commit -m "feat(skills): add mishap-tracker shared skill"
```

---

### Task 2: Add mishap tracking to `backup-check`

**Files:**
- Modify: `.claude/skills/backup-check/SKILL.md` (lines 1–5 header, append footer)

The header block goes after the closing `---` of the frontmatter (line 4). The footer goes at the very end of the file (after line 294).

- [ ] **Step 1: Insert header block after frontmatter**

Open `.claude/skills/backup-check/SKILL.md`. After line 4 (`---`), insert a blank line followed by:

```markdown

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

```

- [ ] **Step 2: Append footer block**

At the very end of the file, after the last line, append:

```markdown

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

- [ ] **Step 3: Verify**

```bash
head -12 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/backup-check/SKILL.md
tail -8 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/backup-check/SKILL.md
```

Expected head: frontmatter `---` block, then the `> **Mishap Tracking:**` blockquote.
Expected tail: `## Post-Execution: Mishap Report` section.

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/backup-check/SKILL.md
git commit -m "feat(skills): add mishap tracking to backup-check"
```

---

### Task 3: Add mishap tracking to `deployment-assist`

**Files:**
- Modify: `.claude/skills/deployment-assist/SKILL.md`

- [ ] **Step 1: Insert header block after frontmatter**

After the closing `---` of the frontmatter in `.claude/skills/deployment-assist/SKILL.md`, insert:

```markdown

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

```

- [ ] **Step 2: Append footer block**

```markdown

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

- [ ] **Step 3: Verify**

```bash
head -12 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/deployment-assist/SKILL.md
tail -8 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/deployment-assist/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/deployment-assist/SKILL.md
git commit -m "feat(skills): add mishap tracking to deployment-assist"
```

---

### Task 4: Add mishap tracking to `dev-flow-execute`

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

- [ ] **Step 1: Insert header block after frontmatter**

After the closing `---` of the frontmatter, insert:

```markdown

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

```

- [ ] **Step 2: Append footer block**

```markdown

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

- [ ] **Step 3: Verify**

```bash
head -12 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow-execute/SKILL.md
tail -8 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow-execute/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(skills): add mishap tracking to dev-flow-execute"
```

---

### Task 5: Add mishap tracking to `dev-flow-plan`

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`

- [ ] **Step 1: Insert header block after frontmatter**

After the closing `---` of the frontmatter, insert:

```markdown

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

```

- [ ] **Step 2: Append footer block**

```markdown

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

- [ ] **Step 3: Verify**

```bash
head -12 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow-plan/SKILL.md
tail -8 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow-plan/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/dev-flow-plan/SKILL.md
git commit -m "feat(skills): add mishap tracking to dev-flow-plan"
```

---

### Task 6: Add mishap tracking to `hetzner-node`

**Files:**
- Modify: `.claude/skills/hetzner-node/SKILL.md`

- [ ] **Step 1: Insert header block after frontmatter**

After the closing `---` of the frontmatter, insert:

```markdown

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

```

- [ ] **Step 2: Append footer block**

```markdown

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

- [ ] **Step 3: Verify**

```bash
head -12 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/hetzner-node/SKILL.md
tail -8 /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/hetzner-node/SKILL.md
```

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/hetzner-node/SKILL.md
git commit -m "feat(skills): add mishap tracking to hetzner-node"
```

---

### Task 7: Add header-only block to retired `dev-flow`

**Files:**
- Modify: `.claude/skills/dev-flow/SKILL.md`

The retired skill has no execution steps, so it gets only the header block (no footer).

- [ ] **Step 1: Insert header block after frontmatter**

After the closing `---` of the frontmatter, insert:

```markdown

> **Mishap Tracking:** If this skill is ever invoked despite being RETIRED,
> maintain a `MISHAP_LOG` and invoke `mishap-tracker` at the end. Log the
> invocation itself as `type: suspicious`, `title: "retired dev-flow skill
> invoked"`, `component: skill-routing`.

```

- [ ] **Step 2: Verify**

```bash
cat /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow/SKILL.md
```

Expected: frontmatter, then the blockquote, then the existing RETIRED notice.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git add .claude/skills/dev-flow/SKILL.md
git commit -m "feat(skills): add mishap header to retired dev-flow skill"
```

---

### Task 8: Create tracking ticket in DB + push branch

- [ ] **Step 1: Create ticket in mentolder**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_RESULT=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets (type, brand, title, description, status)
   VALUES (
     'task', 'mentolder',
     'feat: skill mishap tracker',
     'Branch: feature/skill-mishap-tracker' || E'\n' ||
     'Plan: docs/superpowers/plans/2026-05-15-skill-mishap-tracker.md' || E'\n' ||
     'Spec: docs/superpowers/specs/2026-05-15-skill-mishap-tracker-design.md',
     'triage'
   )
   RETURNING external_id, id;")

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
echo "Ticket: $TICKET_EXT_ID → https://web.mentolder.de/admin/bugs"
```

- [ ] **Step 2: Push branch**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker
git push -u origin feature/skill-mishap-tracker
```

- [ ] **Step 3: Verify all skill files have the tracking blocks**

```bash
for skill in backup-check deployment-assist dev-flow-execute dev-flow-plan hetzner-node; do
  echo "=== $skill ==="
  grep -c "Mishap Tracking" /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/$skill/SKILL.md
  grep -c "Post-Execution" /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/$skill/SKILL.md
done
```

Expected: each skill shows `1` for both grep counts.

```bash
echo "=== dev-flow (retired) ==="
grep -c "Mishap Tracking" /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow/SKILL.md
grep -c "Post-Execution" /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/dev-flow/SKILL.md
```

Expected: `1` for Mishap Tracking, `0` for Post-Execution (header only, no footer).

```bash
echo "=== mishap-tracker skill exists ==="
ls -la /home/patrick/Bachelorprojekt/.worktrees/feature/skill-mishap-tracker/.claude/skills/mishap-tracker/SKILL.md
```
