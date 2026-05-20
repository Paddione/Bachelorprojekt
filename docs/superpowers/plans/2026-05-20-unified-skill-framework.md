---
ticket_id: T000062
title: Unified Skill Framework Implementation Plan
domains: [infra]
status: active
pr_number: null
---

# Unified Skill Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize repetitive skill logic (context injection, mishap tracking, environment validation, cleanup) into a manifest-driven hook system.

**Architecture:** A manifest-driven system where skills declare pre/post hooks. A central orchestrator reads these and executes scripts from `scripts/hooks/`.

**Tech Stack:** Bash, YAML.

---

### Task 1: Framework Foundation & Hook Registry

**Files:**
- Create: `scripts/hooks/inject-plan-context.sh`
- Create: `scripts/hooks/mishap-tracker.sh`
- Create: `scripts/hooks/cleanup-tmp.sh`

- [ ] **Step 1: Create inject-plan-context hook**
```bash
#!/usr/bin/env bash
# scripts/hooks/inject-plan-context.sh
ROLE=$1
context=$(bash scripts/plan-context.sh "$ROLE")
if [[ -n "$context" ]]; then
  echo -e "<active-plans>\n${context}\n</active-plans>"
fi
```

- [ ] **Step 2: Create mishap-tracker hook**
```bash
#!/usr/bin/env bash
# scripts/hooks/mishap-tracker.sh
# Invokes mishap-tracker if MISHAP_LOG exists
if [[ -n "${MISHAP_LOG:-}" ]]; then
  # Placeholder for mishap-tracker tool invocation
  echo "Invoking mishap-tracker with accumulated logs..."
fi
```

- [ ] **Step 3: Create cleanup-tmp hook**
```bash
#!/usr/bin/env bash
# scripts/hooks/cleanup-tmp.sh
find /tmp -name "brainstorm-*" -mmin +60 -delete
```

- [ ] **Step 4: Commit**
```bash
git add scripts/hooks/
git commit -m "feat(skills): add central hook registry"
```

### Task 2: Skill Orchestrator Implementation

**Files:**
- Create: `scripts/skill-orchestrator.sh`
- Test: `tests/unit/skill-orchestrator.test.sh`

- [ ] **Step 1: Write orchestrator core**
```bash
#!/usr/bin/env bash
# scripts/skill-orchestrator.sh
SKILL_FILE=$1
ACTION=$2 # pre | post

# Extract hooks from frontmatter (simple awk parser)
HOOKS=$(awk '/^hooks:/{flag=1; next} /^---/{flag=0} flag' "$SKILL_FILE" | grep -A 5 "$ACTION:" | grep "-" | awk '{print $2}')

for hook in $HOOKS; do
  if [[ -f "scripts/hooks/$hook.sh" ]]; then
    bash "scripts/hooks/$hook.sh"
  fi
done
```

- [ ] **Step 2: Create unit test for orchestrator**
```bash
# tests/unit/skill-orchestrator.test.sh
# Test parsing and execution of hooks
# ... (BATS test code)
```

- [ ] **Step 3: Run test**
Run: `bats tests/unit/skill-orchestrator.test.sh`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add scripts/skill-orchestrator.sh tests/unit/skill-orchestrator.test.sh
git commit -m "feat(skills): implement skill orchestrator"
```

### Task 3: Integration with dev-flow-plan

**Files:**
- Modify: `.agents/skills/dev-flow-plan/SKILL.md`

- [ ] **Step 1: Update dev-flow-plan to use orchestrator**
Update the "Sage zu Beginn" and "Post-Execution" sections to call the orchestrator instead of manual snippets.

- [ ] **Step 2: Commit**
```bash
git add .agents/skills/dev-flow-plan/SKILL.md
git commit -m "feat(skills): integrate dev-flow-plan with unified framework"
```
