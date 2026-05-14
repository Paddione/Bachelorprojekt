# Skill Mishap Tracker — Design Spec

**Date:** 2026-05-15
**Branch:** feature/skill-mishap-tracker
**Scope:** Local project skills only (`.claude/skills/`)

---

## Overview

All active local skills gain automatic mishap logging. During execution Claude
maintains a `MISHAP_LOG`; at the end it invokes a shared `mishap-tracker` skill
that converts every log entry into a ticket in `tickets.tickets` (mentolder).

---

## Components

### 1. New skill: `mishap-tracker`

**Path:** `.claude/skills/mishap-tracker/SKILL.md`

**Purpose:** Shared utility invoked at the end of any local skill. Accepts the
calling skill's `MISHAP_LOG` from context, inserts one ticket per entry, and
reports the created `external_id`s.

**Flow:**

1. If `MISHAP_LOG` is empty → print "No mishaps found." and exit. No DB call.
2. For each entry run via `kubectl exec` on the mentolder `shared-db` pod:

```sql
INSERT INTO tickets.tickets (type, brand, title, description, severity, status, component)
VALUES ('<type>', 'mentolder', '<title>', '<description>', '<severity>', 'triage', '<component>')
RETURNING external_id;
```

3. Collect all `external_id`s and print summary:

```
Mishap report — N tickets created:
  T000312 [broken/major]     shared-db: no backup in last 24h
  T000313 [security/critical] keycloak: realm export missing MFA policy
→ https://web.mentolder.de/admin/bugs
```

4. **DB unreachable** (pod missing, psql fails, offline): print formatted log
   to stdout with note to create tickets manually. Do not abort the parent
   skill — the mishap report is advisory.

**Missing `component`:** default to `skill-execution`.

### 2. MISHAP_LOG entry schema

| Field | Values | Required |
|---|---|---|
| `type` | `broken` \| `degraded` \| `suspicious` \| `security` \| `drift` | yes |
| `title` | one-line summary | yes |
| `description` | what was found, where, context | yes |
| `component` | subsystem name (e.g. `backup`, `shared-db`, `keycloak`) | no |

### 3. Severity mapping

| Mishap type | `tickets.type` | `tickets.severity` |
|---|---|---|
| `broken` | `bug` | `major` |
| `security` | `bug` | `critical` |
| `degraded` | `bug` | `minor` |
| `suspicious` | `task` | `minor` |
| `drift` | `task` | `trivial` |

### 4. Skill modifications

**5 active local skills** receive two standard blocks each:

**Header block** (after frontmatter `---`, before first heading):

```markdown
> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.
```

**Footer block** (last section):

```markdown
## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

**Files modified:**
- `.claude/skills/backup-check/SKILL.md`
- `.claude/skills/deployment-assist/SKILL.md`
- `.claude/skills/dev-flow-execute/SKILL.md`
- `.claude/skills/dev-flow-plan/SKILL.md`
- `.claude/skills/hetzner-node/SKILL.md`

**RETIRED skill** (`.claude/skills/dev-flow/SKILL.md`): header block only,
no footer (no execution steps).

---

## Signal threshold

All findings are ticketed — every anomaly, unexpected state, or degraded
condition, regardless of severity.

---

## Out of scope

- Superpowers plugin skills (would be overwritten on plugin update)
- Third-party plugin skills (hookify, huggingface, etc.)
- Automatic hook-based triggering (requires shell, can't capture Claude's judgment)
