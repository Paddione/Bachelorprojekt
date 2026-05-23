---
title: Self-Improving Dev Loop Implementation Plan
domains: []
status: active
pr_number: null
---

# Self-Improving Dev Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dev-flow skill pipeline into a closed, self-improving loop by adding a `process` mishap type, extending three skill headers, adding a loop-restart step to `dev-flow-e2e`, and declaring `ticket-management` as the explicit loop entry point.

**Architecture:** All changes are text edits to existing Markdown skill files — no new files, no new DB schema. Process friction is captured via the existing MISHAP_LOG → mishap-tracker pipeline; the `skills/<name>` component prefix namespaces skill-improvement tickets so they're auto-discoverable at loop restart.

**Tech Stack:** Markdown (SKILL.md files), bash/psql snippets embedded in skill prose, existing `tickets.tickets` schema on mentolder cluster.

---

### Task 1: Extend mishap-tracker — add `process` type

**Files:**
- Modify: `.claude/skills/mishap-tracker/SKILL.md`

- [ ] **Step 1: Read current severity table**

Run:
```bash
grep -n "drift\|broken\|security\|type\|severity" /home/patrick/Bachelorprojekt/.claude/skills/mishap-tracker/SKILL.md | head -20
```
Expected: lines showing the 5-row table (broken/security/degraded/suspicious/drift).

- [ ] **Step 2: Add `process` row to the severity table**

In `.claude/skills/mishap-tracker/SKILL.md`, find the exact block:
```
| type | tickets.type | tickets.severity |
|---|---|---|
| broken | bug | major |
| security | bug | critical |
| degraded | bug | minor |
| suspicious | task | minor |
| drift | task | trivial |
```

Replace with:
```
| type | tickets.type | tickets.severity | notes |
|---|---|---|---|
| broken | bug | major | |
| security | bug | critical | |
| degraded | bug | minor | |
| suspicious | task | minor | |
| drift | task | trivial | |
| process | task | trivial | `component` must be `skills/<skill-name>` (e.g. `skills/dev-flow-plan`); always sets `attention_mode: ai_ready` |
```

- [ ] **Step 3: Add `process` INSERT rule after the table**

Immediately after the table (before the `If an entry has no \`component\`` line), insert:

```markdown
**`process` entries — special INSERT rule:**

For `process` type, the MISHAP_LOG `component` field must use the format `skills/<skill-name>`.
mishap-tracker stores this verbatim in the DB `component` column and always adds
`attention_mode = 'ai_ready'` to the INSERT:

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "INSERT INTO tickets.tickets
     (type, brand, title, description, severity, status, component, attention_mode)
   VALUES (
     'task',
     'mentolder',
     '<title>',
     '<description>',
     'trivial',
     'triage',
     '<skills/skill-name>',
     'ai_ready'
   )
   RETURNING external_id;"
```

Other types use the standard INSERT (no `attention_mode` column — it defaults to `auto`).
```

- [ ] **Step 4: Verify the edit**

Run:
```bash
grep -A 3 "process" /home/patrick/Bachelorprojekt/.claude/skills/mishap-tracker/SKILL.md
```
Expected: `process | task | trivial` row + the `process entries` rule section.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add .claude/skills/mishap-tracker/SKILL.md
git commit -m "chore(skills): add process mishap type to mishap-tracker"
```

---

### Task 2: Extend MISHAP_LOG header in dev-flow-plan and dev-flow-execute

**Files:**
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

Both files contain the identical 5-line header block. Apply the same replacement to each.

- [ ] **Step 1: Locate the header block in dev-flow-plan**

Run:
```bash
grep -n "Mishap Tracking" /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-plan/SKILL.md
```
Expected: a line near the top (around line 12–16).

- [ ] **Step 2: Replace the header in dev-flow-plan**

Find:
```
> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.
```

Replace with:
```
> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern,
> configuration drift, or **process friction** you notice — even if unrelated
> to the current task — add an entry with:
>   `type` (broken/degraded/suspicious/security/drift/**process**),
>   `title`, `description`, and `component`.
>
> `process` = a step that required a manual workaround, had wrong/missing instructions,
> or caused unexpected friction. `component` MUST use format `skills/<skill-name>`. Example:
>   `{type: process, title: "wss patch required manual retry",
>     description: "scripts/superpowers-helper-patch.sh failed silently — step 2b needs exit-code check",
>     component: "skills/dev-flow-plan"}`
>
> Invoke `mishap-tracker` at the very end.
```

- [ ] **Step 3: Verify dev-flow-plan header**

Run:
```bash
head -20 /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-plan/SKILL.md
```
Expected: new header block with `process` type and `skills/<skill-name>` example visible.

- [ ] **Step 4: Apply identical replacement to dev-flow-execute**

Find the same 5-line block in `.claude/skills/dev-flow-execute/SKILL.md` and apply the identical replacement (the text is byte-identical in both files).

Run after edit:
```bash
head -15 /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-execute/SKILL.md
```
Expected: same new header block.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add .claude/skills/dev-flow-plan/SKILL.md .claude/skills/dev-flow-execute/SKILL.md
git commit -m "chore(skills): extend MISHAP_LOG header with process type in plan+execute"
```

---

### Task 3: Extend dev-flow-e2e — header + Schritt 9

**Files:**
- Modify: `.claude/skills/dev-flow-e2e/SKILL.md`

- [ ] **Step 1: Apply header replacement**

Same replacement as Task 2 — find the identical 5-line MISHAP_LOG block near the top of `.claude/skills/dev-flow-e2e/SKILL.md` and replace with the extended version (identical to Task 2 Steps 2–3, but `component` example should reference `skills/dev-flow-e2e` since that's the most likely source of friction during E2E):

Find:
```
> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.
```

Replace with:
```
> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern,
> configuration drift, or **process friction** you notice — even if unrelated
> to the current task — add an entry with:
>   `type` (broken/degraded/suspicious/security/drift/**process**),
>   `title`, `description`, and `component`.
>
> `process` = a step that required a manual workaround, had wrong/missing instructions,
> or caused unexpected friction. `component` MUST use format `skills/<skill-name>`. Example:
>   `{type: process, title: "playwright config missing project entry",
>     description: "new spec was not picked up — playwright.config.ts testMatch needs manual update per spec",
>     component: "skills/dev-flow-e2e"}`
>
> Invoke `mishap-tracker` at the very end.
```

- [ ] **Step 2: Verify header**

Run:
```bash
head -18 /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-e2e/SKILL.md
```
Expected: new header with `process` type visible.

- [ ] **Step 3: Add Schritt 9 after the Post-Execution Mishap Report section**

The current final lines of the file are:
```
## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
```

Append after this block (at end of file):

````markdown

---

## Schritt 9: Loop-Restart & Skill-Verbesserung

Nach dem Mishap Report: offene Skill-Improvement-Tickets prüfen und anwenden, dann nächsten Zyklus starten.

### 9a — Skill-Improvement-Tickets abfragen

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT external_id, title, description, component
   FROM tickets.tickets
   WHERE status NOT IN ('done', 'archived')
     AND component LIKE 'skills/%'
     AND attention_mode = 'ai_ready'
   ORDER BY created_at ASC;"
```

Falls keine Ergebnisse: direkt zu **9c**.

### 9b — Triviale Skill-Edits auto-anwenden

Für jedes zurückgegebene Ticket:

1. Skill-Name extrahieren: `SKILL_NAME="${component#skills/}"` (z.B. `dev-flow-plan`)
2. SKILL.md lokalisieren: zuerst `.claude/skills/$SKILL_NAME/SKILL.md` (Projekt-Skill), dann `~/.claude/skills/$SKILL_NAME/SKILL.md` (User-Skill)
3. Ticket `description` lesen — enthält die Reibungsstelle und den Fix
4. Verbesserung direkt anwenden (falschen Command korrigieren, fehlenden Schritt ergänzen, Beispiel präzisieren)
5. Via ephemeren Branch committen (branch protection blockiert direkten Push auf main):

```bash
SKILL_BRANCH="chore/skills-improve-${TICKET_EXT_ID,,}"
git checkout -b "$SKILL_BRANCH"
git add ".claude/skills/$SKILL_NAME/SKILL.md"
git commit -m "chore(skills): <einzeilige Verbesserung> [$TICKET_EXT_ID]"
git push -u origin "$SKILL_BRANCH"
gh pr create \
  --title "chore(skills): <einzeilige Verbesserung> [$TICKET_EXT_ID]" \
  --body "Auto-applied from skill-friction ticket $TICKET_EXT_ID." \
  --base main
gh pr merge --squash --delete-branch
git checkout main && git pull --rebase origin main
```

6. Ticket schließen:

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets SET
     status = 'done', resolution = 'fixed', done_at = now(),
     notes = COALESCE(notes || E'\n\n', '') ||
       '[loop-restart $(date +%Y-%m-%d)] Skill-Verbesserung angewandt und nach main gemergt.'
   WHERE external_id = '$TICKET_EXT_ID';"
```

**Strukturelle Änderungen NICHT auto-anwenden.** Trivial vs. strukturell:
- **Trivial:** Command korrigieren, Exit-Code-Check ergänzen, fehlendes `bash`-Schritt hinzufügen, Beispiel präzisieren
- **Strukturell:** Nummerierte Schritte umordnen/entfernen, Skill-Aufruf-Zeitpunkt ändern, Routing-Tabelle in CLAUDE.md anpassen

Strukturelle Tickets: `needs_human` setzen mit konkreter Frage, dann überspringen.

### 9c — Loop neu starten

```
Schritt 9 abgeschlossen. Alle skill-improvement Tickets bearbeitet (oder keine vorhanden).
→ Nächsten Zyklus starten: rufe `ticket-management` auf.
```
````

- [ ] **Step 4: Verify Schritt 9 was appended**

Run:
```bash
tail -20 /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-e2e/SKILL.md
```
Expected: `Schritt 9c — Loop neu starten` and `→ Nächsten Zyklus starten: rufe \`ticket-management\` auf.` visible at end of file.

- [ ] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add .claude/skills/dev-flow-e2e/SKILL.md
git commit -m "chore(skills): extend dev-flow-e2e header + add Schritt 9 loop-restart"
```

---

### Task 4: Update ticket-management — loop entry point + Phase 0

**Files:**
- Modify: `.claude/skills/ticket-management/SKILL.md`

- [ ] **Step 1: Add Loop Entry Point callout after the Mishap Tracking callout**

The Mishap Tracking callout ends at line 12 (`> Invoke \`mishap-tracker\` at the very end.`). After that line, insert:

```markdown

> **Loop Entry Point:** This skill starts every dev cycle. Before triaging user
> work, auto-apply any open skill-improvement tickets (Phase 0 below).

```

- [ ] **Step 2: Prepend Phase 0 skill-improvement step to Session Workflow**

Locate the existing `## Session Workflow` section. The current Phase 0 heading is:

```
**Phase 0 — Repo hygiene (always first)**
```

Before that line, insert:

````markdown
**Phase −1 — Skill-improvement tickets (loop feedback, always first)**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT external_id, title, description, component
   FROM tickets.tickets
   WHERE status NOT IN ('done', 'archived')
     AND component LIKE 'skills/%'
     AND attention_mode = 'ai_ready'
   ORDER BY created_at ASC;"
```

Falls Ergebnisse: dieselbe auto-apply Logik wie `dev-flow-e2e` Schritt 9b (ephemerter Branch + PR + auto-merge + Ticket schließen). Danach weiter mit Phase 0.

Falls keine Ergebnisse: direkt weiter mit Phase 0.

*Idempotent — falls dev-flow-e2e Schritt 9 bereits alle Tickets bearbeitet hat, liefert diese Abfrage nichts zurück.*

````

- [ ] **Step 3: Verify both additions**

Run:
```bash
grep -n "Loop Entry Point\|Phase -1\|Phase −1\|skills/%\|loop feedback" \
  /home/patrick/Bachelorprojekt/.claude/skills/ticket-management/SKILL.md
```
Expected: at least 3 matching lines (Loop Entry Point, Phase −1 heading, `skills/%` query).

- [ ] **Step 4: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add .claude/skills/ticket-management/SKILL.md
git commit -m "chore(skills): add loop entry point + Phase -1 skill-improvement check to ticket-management"
```

---

### Task 5: Push and open PR

- [ ] **Step 1: Verify all 5 files are committed**

Run:
```bash
git log --oneline -5
```
Expected: 4 commits from Tasks 1–4 above, all prefixed `chore(skills):`.

- [ ] **Step 2: Check current branch**

Run:
```bash
git branch --show-current
```
Expected: `main` (these are chore commits going directly via PR from the main worktree).

If on a feature branch: push that branch and open a PR normally. If on `main` in a worktree that doesn't allow direct push: see Step 3.

- [ ] **Step 3: Push**

```bash
git push origin main
```

If branch protection blocks this: create an ephemeral chore branch, push, PR, auto-merge:
```bash
git checkout -b chore/self-improving-loop
git push -u origin chore/self-improving-loop
gh pr create \
  --title "chore(skills): wire self-improving dev loop" \
  --body "$(cat <<'EOF'
## Summary
- Adds `process` mishap type to mishap-tracker (component: `skills/<name>`, auto ai_ready)
- Extends MISHAP_LOG header in dev-flow-plan, dev-flow-execute, dev-flow-e2e
- Adds Schritt 9 (Loop-Restart & Skill-Verbesserung) to dev-flow-e2e
- Declares ticket-management as loop entry point with Phase -1 skill-improvement check

## Test plan
- [ ] Read each modified SKILL.md and confirm changes are present
- [ ] No offline tests needed (docs-only change)
EOF
)" \
  --base main
gh pr merge --squash --delete-branch
git checkout main && git pull --rebase origin main
```

- [ ] **Step 4: Confirm merge**

Run:
```bash
gh pr list --state merged --limit 3 --json number,title
```
Expected: PR with title `chore(skills): wire self-improving dev loop` in the list.

---

## Self-Review Notes

**Spec coverage check:**
- Change 1 (mishap-tracker `process` type) → Task 1 ✓
- Change 2 (MISHAP_LOG headers in plan + execute) → Task 2 ✓
- Change 2 (MISHAP_LOG header in e2e) → Task 3 Step 1 ✓
- Change 3 (dev-flow-e2e Schritt 9) → Task 3 Steps 3–4 ✓
- Change 4 (ticket-management loop entry point + Phase 0) → Task 4 ✓

**No placeholders present.** All code blocks contain exact content.

**Consistency:** `component LIKE 'skills/%'` query is identical in Task 3 (Schritt 9) and Task 4 (Phase −1). `SKILL_NAME="${component#skills/}"` extraction is consistent with the `skills/<name>` component format defined in Task 1.
