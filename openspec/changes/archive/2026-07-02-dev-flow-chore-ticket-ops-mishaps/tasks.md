---
title: "Mishap-Bundle: dev-flow-chore (git-crypt staging) + ticket-ops (duplicate intake)"
ticket_id: T001210
plan_ref: openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md
status: plan_staged
date: 2026-06-27
domains: [process, agent-skills]
spec_ref: docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md
openspec_ref: openspec/changes/dev-flow-chore-ticket-ops-mishaps/
file_locks: [".claude/skills/dev-flow-chore/SKILL.md", ".claude/skills/ticket-ops/SKILL.md"]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# T001210 — Dev-Flow-Chore & Ticket-Ops Mishap Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Ticket:** T001210 · **Spec:** `docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md` · **Branch:** `fix/t001210-dev-flow-chore-ticket-ops-mishaps` · **Tests:** `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` (RED on this branch)
>
> **Scope:** Two SKILL.md edits. No executable code, no new endpoints, no new modules. Both fixes are documentation/process — verifiable by grep on the SKILL.md files plus the failing BATS test.

**Goal:** Eliminate the two mishaps recorded in T001210 by codifying the workaround for Mishap 1 in the dev-flow-chore skill itself, and by adding a title-dedupe guard to the ticket-ops intake path so that a re-trigger of the same upstream signal can no longer create N near-duplicate rows.

**Architecture:** Pure skill-text edits. Both fixes are gated by the same BATS suite (`tests/spec/dev-flow-chore-ticket-ops-mishaps.bats`). The fix for Mishap 2 hardens the symptom; root-cause identification of the upstream auto-re-trigger is a separate investigation (referenced in the verification step).

**Tech Stack:** Markdown (SKILL.md edits), BATS (`tests/unit/lib/bats-core/bin/bats`).

## Global Constraints

- **No executable code changes.** Both fixes are SKILL.md-only. The risk surface is
  documentation review; the verification surface is the BATS suite. No new files in
  `website/`, `scripts/`, or `k3d/`.
- **TDD gate.** Every implementation step starts from the failing BATS test in
  `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` (already RED on this branch).
  Steps 1.1 (Mishap 1) and 2.1 (Mishap 2) each turn a subset of the suite green.
- **S1 line ratchet.** Both SKILL.md files are `.md` — no S1 limit applies. New
  test file `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` is a new file
  under the standard 600-line BATS limit. Design note
  `docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md`
  is documentation — no S1 limit.
- **S2 — no import cycles.** N/A (no executable code).
- **S3 — no brand-domain literals.** N/A (no executable code).
- **S4 — no orphans.** N/A (no new scripts/manifests/routes).
- **Cross-reference T000925** in the Mishap 1 fix — the silent-commit-failure
  variant of the same git-crypt root cause is already documented there. The
  current bundle is the missing staging-side half.
- **Cross-reference T001199 / PR #2135** in the Mishap 1 fix — the ad hoc
  workaround that this bundle codifies into the skill itself.
- **Cross-reference T001147 / T001148** in the Mishap 2 fix — the canonical
  shipped reference ticket and the prior mishap bundle, respectively. The 4
  duplicates T001196/T001197/T001201/T001202 are the observable symptom of the
  missing guard.
- **Out of scope (NOT implementieren):** Identifying the upstream auto-re-trigger
  source for Mishap 2 (factory tick? croned re-fail? event replay?). The
  symptom-only fix (dedupe at intake) is sufficient to prevent recurrence and
  is the highest-value outcome of this bundle.

---

## Task 0: Preflight — Failing-Test bestätigen (TDD-Kontrakt)

**Files:** keine (nur Verifikation)

**Interfaces:**
- Consumes: die existierende (rote) BATS-Datei `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats`.
- Produces: bestätigtes RED, das die Tasks 1.1 + 2.1 rechtfertigt.

- [ ] **Step 1: Failing-Test ausführen und Rot bestätigen**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-chore-ticket-ops-mishaps.bats
  ```

  Expected: FAIL — alle 5 Tests sind rot (Step 4 von dev-flow-chore benutzt
  noch blankes `git add -A` ohne Secret-Guard; Step 4.4 von ticket-ops hat keinen
  Title-Dedupe-Guard). Falls ein Test bereits grün ist: STOPP — die Vorbedingung
  dieses Plans ist verletzt; investigate + fix the test (or the underlying skill)
  before proceeding.

- [ ] **Step 2: Plan-Validität bestätigen**

  ```bash
  bash scripts/plan-lint.sh openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md
  ```

  Expected: exit 0. (Der Plan ist vor diesem Preflight durch den dev-flow-plan
  Subagenten bereits gelintet — die Wiederholung dient als Sanity-Check beim
  Execute-Start.)

---

## File Structure

**Neue Dateien:**

- `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` — 5 failing BATS-Tests
  (2 für Mishap 1, 3 für Mishap 2). Verifiziert per grep, dass die SKILL.md
  Edits die zwei Invarianten herstellen. ~110 Zeilen.
- `docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md` — Design-Note (Bundle-Sicht, Root-Cause, Fix-Approach, Acceptance Criteria). ~120 Zeilen.
- `openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md` — dieser Plan.

**Geänderte Dateien:**

- `.claude/skills/dev-flow-chore/SKILL.md` — Step 4: expliziter Pathspec statt
  `git add -A` + Secret-in-Index-Guard (T001210). Cross-Reference T000925,
  T001199, PR #2135. Delta ~+15 Zeilen.
- `.claude/skills/ticket-ops/SKILL.md` — Phase 4 Step 4.4: Title-Dedupe-Guard
  vor dem INSERT, mit Cross-Reference T001147/T001148 und T001196–T001202 als
  Symptom-Beispiel. Delta ~+5 Zeilen.

---

## Mishap 1 — Dev-Flow-Chore Step 4: `git add -A` Foot-Gun

### Task 1.1: Failing BATS-Test grün schalten (Mishap 1)

**Files:**
- Modify: `.claude/skills/dev-flow-chore/SKILL.md` (Step 4, ~Zeile 105-118)

**Interfaces:**
- Consumes: nichts (Reine Markdown-Edits).
- Produces: Step 4 enthält (a) KEIN blankes `git add -A` mehr und (b) einen
  expliziten `environments/.secrets/**`-In-Index-Guard mit FATAL-Exit. BATS-Tests
  1, 2, 3 grün.

- [ ] **Step 1: Schritt 4 editieren — `git add -A` durch explizites Pathspec ersetzen**

  In `.claude/skills/dev-flow-chore/SKILL.md`, ersetze den Block:

  ```bash
  BASE_SHA="$(git rev-parse "@{upstream}" 2>/dev/null || git rev-parse origin/main)"
  git add -A
  git commit -m "chore(<scope>): <subject> [$TICKET_EXT_ID]"
  ```

  durch:

  ```bash
  BASE_SHA="$(git rev-parse "@{upstream}" 2>/dev/null || git rev-parse origin/main)"
  # Stage only the files the chore actually changed — a bare `git add -A`
  # would promote ~21 git-crypt smudge artifacts from environments/.secrets/**
  # into the index on every chore commit. See T001210, T001199 / PR #2135,
  # and the related silent-commit-failure guard in T000925.
  git add <changed-paths>   # explicit pathspec; e.g. scripts/ docs/ Taskfile.* (NEVER `git add -A`)

  # Secret-in-index guard (T001210). environments/.secrets/** is git-crypt-
  # protected; abort with FATAL if any such path slipped into the index.
  if git diff --cached --name-only | grep -q '^environments/.secrets/'; then
    echo "FATAL: environments/.secrets/** must not be staged (git-crypt)" >&2
    git diff --cached --name-only | grep '^environments/.secrets/' | sed 's/^/  /' >&2
    exit 1
  fi
  git commit -m "chore(<scope>): <subject> [$TICKET_EXT_ID]"
  ```

- [ ] **Step 2: BATS-Tests 1, 2, 3 grün laufen lassen**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-chore-ticket-ops-mishaps.bats -f "T001210: dev-flow-chore"
  ```

  Expected: PASS für alle drei Tests (no bare `git add -A`, secret-in-index guard
  present, guard positioned in Step 4). Tests 4 + 5 (Mishap 2) bleiben rot bis
  Task 2.1 abgeschlossen ist.

- [ ] **Step 3: Commit**

  ```bash
  git add .claude/skills/dev-flow-chore/SKILL.md
  git commit -m "fix(skill): dev-flow-chore Step 4 — pathspec + secret-in-index guard [T001210]"
  ```

---

## Mishap 2 — Ticket-Ops Step 4.4: Duplicate-Intake-Guard

### Task 2.1: Failing BATS-Test grün schalten (Mishap 2)

**Files:**
- Modify: `.claude/skills/ticket-ops/SKILL.md` (Phase 4, Step 4.4, ~Zeile 302-307)

**Interfaces:**
- Consumes: nichts (Markdown-Edit).
- Produces: Step 4.4 enthält (a) einen expliziten Title-Dedupe-Guard vor dem
  INSERT, der einen Lookup gegen offene Tickets mit gleichem (normalisiertem)
  Title macht, und (b) eine explizite Cross-Reference auf T001147 / T001148 als
  Beispiel. BATS-Tests 4, 5 grün.

- [ ] **Step 1: Step 4.4 editieren — Title-Dedupe-Guard vor INSERT einfügen**

  In `.claude/skills/ticket-ops/SKILL.md`, ersetze den Step 4.4 Block:

  ```markdown
  ### Step 4.4: GitHub Issue Intake (rare)
  This repo tracks issues in Postgres, not GitHub. If `gh issue list --state open` returns anything, funnel it in rather than working it on GitHub:
  1. Create a `tickets.tickets` row from the issue (`type`, `brand`, `title`, `description`, `status='triage'`).
  2. `gh issue close <n> --comment "Tracked internally as <external_id>."`
  ```

  durch:

  ```markdown
  ### Step 4.4: GitHub Issue Intake (rare)
  This repo tracks issues in Postgres, not GitHub. If `gh issue list --state open` returns anything, funnel it in rather than working it on GitHub:
  1. **Title-dedupe guard (T001210).** Before creating a new row, run a lookup for an open ticket with the same (case-insensitive, whitespace-normalised) title. If one exists — e.g. canonical reference T001147 "E2E notification test — Playwright FA-bug-notify", mishap bundle T001148 — do not create a duplicate. Append a `ticket_comments` row to the existing ticket noting the re-trigger source, then `gh issue close <n> --comment "Duplicate of <external_id>."`. The 4 duplicates T001196/T001197/T001201/T001202 were created 2026-06-27 against T001147 precisely because this guard was missing.
  2. Create a `tickets.tickets` row from the issue (`type`, `brand`, `title`, `description`, `status='triage'`).
  3. `gh issue close <n> --comment "Tracked internally as <external_id>."`
  ```

- [ ] **Step 2: BATS-Tests 4, 5 grün laufen lassen**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-chore-ticket-ops-mishaps.bats -f "T001210: ticket-ops"
  ```

  Expected: PASS für beide Tests. Zusammen mit Task 1.1 sind nun ALLE 5 Tests
  grün.

- [ ] **Step 3: Commit**

  ```bash
  git add .claude/skills/ticket-ops/SKILL.md
  git commit -m "fix(skill): ticket-ops Step 4.4 — title-dedupe guard at intake [T001210]"
  ```

---

## Verifikation

### Task 3.1: Vollständige BATS-Suite + Quality-Gates

**Files:** keine

- [ ] **Step 1: Alle 5 Tests grün**

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-chore-ticket-ops-mishaps.bats
  ```

  Expected: 5/5 PASS.

- [ ] **Step 2: Plan-Lint (CI-Äquivalent) grün**

  ```bash
  bash scripts/plan-lint.sh openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md
  ```

  Expected: Exit 0.

- [ ] **Step 3: OpenSpec-Validate grün**

  ```bash
  bash scripts/openspec.sh validate   # or: task test:openspec
  ```

  Expected: Exit 0.

- [ ] **Step 4: Freshness-Gate grün**

  ```bash
  task freshness:regenerate
  task freshness:check
  ```

  Expected: keine Diffs (oder nur akzeptierte regenerierte Artefakte). Falls
  `test-inventory.json` durch die neue BATS-Datei ergänzt wurde, den
  Regenerierungs-Commit einbeziehen.

- [ ] **Step 5: Test-Changed-Suite grün**

  ```bash
  task test:changed
  ```

  Expected: PASS (nur `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats` ist
  neu, alle anderen Suites unverändert).

- [ ] **Step 6: Geänderte SKILL.md-Dateien noch einmal lesen und Sanity-Check**

  ```bash
  grep -nE 'git add -A' .claude/skills/dev-flow-chore/SKILL.md || echo "OK — no bare git add -A"
  grep -nE 'environments/\.secrets' .claude/skills/dev-flow-chore/SKILL.md
  grep -nE 'dedup|deduplicate' .claude/skills/ticket-ops/SKILL.md
  grep -nE 'T001147|T001148' .claude/skills/ticket-ops/SKILL.md
  ```

  Expected: alle vier greps liefern Treffer im jeweils richtigen Kontext.

- [ ] **Step 7: Finaler Commit (Freshness-Update, falls nötig)**

  ```bash
  # Falls Step 4 generierte Artefakte geändert hat:
  git add docs/code-quality/ 2>/dev/null || true
  git add website/src/data/ 2>/dev/null || true
  git commit -m "chore(freshness): regenerate test-inventory after T001210 test add" || true
  ```

---

### Task 3.2: PR erstellen + Ticket-Schließen

- [ ] **Step 1: Branch pushen + PR öffnen**

  ```bash
  git push -u origin fix/t001210-dev-flow-chore-ticket-ops-mishaps
  gh pr create --title "fix(skill): dev-flow-chore git-crypt guard + ticket-ops dedupe [T001210]" --body "Closes T001210. Two SKILL.md edits + one BATS suite. See openspec/changes/dev-flow-chore-ticket-ops-mishaps/tasks.md for the implementation plan and docs/superpowers/specs/2026-06-27-t001210-dev-flow-chore-ticket-ops-mishaps-design.md for the design note."
  ```

- [ ] **Step 2: PR squash-merge + Branch cleanup (analog zu T001092-Step)**

  ```bash
  gh pr merge --auto --squash --delete-branch
  ```

- [ ] **Step 3: Ticket schließen**

  ```bash
  # MCP-first:
  mcp__ticket-mcp__transition_status({ id: "T001210", status: "done", resolution: "fixed" })
  mcp__ticket-mcp__add_comment({ id: "T001210", body: "PR merged. Both skills updated; BATS suite green. Root-cause investigation of Mishap 2 upstream re-trigger remains out of scope — see plan Task 3.1 Step 6 for the open question." })
  ```

  Fallback (über `./scripts/ticket.sh update-status` + Comment).

- [ ] **Step 4: Worktree + Lock aufräumen**

  ```bash
  bash scripts/agent-lock.sh release ticket T001210
  cd /home/patrick/Bachelorprojekt
  git worktree remove /tmp/wt-t001210-dev-flow-chore-ticket-ops-mishaps --force
  git branch -D fix/t001210-dev-flow-chore-ticket-ops-mishaps
  ```
