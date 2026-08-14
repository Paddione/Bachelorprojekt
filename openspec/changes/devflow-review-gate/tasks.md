---
title: devflow-review-gate — Implementation Plan
ticket_id: T005565
domains: [test, docs]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-review-gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Review-Gate wird im Implementer-Auftrag des dev-flow-execute-Skills als PFLICHT verankert; ein Doc-Guard-Test pinnt die Verankerung.

**Architecture:** Zwei Textänderungen am SKILL.md (Auftrag-Bullet + 3.8-Verweis) plus BATS-Guard mit Abschnitt-Scoping.

**Tech Stack:** Markdown, BATS (vendored), awk.

**Spec:** `openspec/changes/devflow-review-gate/design.md`

## Global Constraints

- Nur `.claude/skills/dev-flow-execute/SKILL.md` ändern — keine weiteren Skill-Dateien.
- Wortlaut des Bullets enthält `requesting-code-review` und `PFLICHT` (der Guard greppt genau diese).

## File Structure

```
.claude/skills/dev-flow-execute/SKILL.md               # MODIFY: Auftrag-Bullet + 3.8-Verweis
tests/spec/agent-skills/devflow-review-gate.bats       # EXISTS: failing Test (rot verifiziert)
openspec/changes/devflow-review-gate/specs/agent-skills.md  # EXISTS: Delta
```

---

### Task 1: Auftrag-Bullet und 3.8-Verweis

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`
- Test: `tests/spec/agent-skills/devflow-review-gate.bats` (existiert, rot)

- [ ] **Step 1: Rot bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/devflow-review-gate.bats`
expected: FAIL — Auftrag-Abschnitt enthält kein `requesting-code-review`.

- [ ] **Step 2: Bullet in den Auftrag-Block einfügen**

Direkt vor die Zeile `- **PFLICHT vor PR-Erstellung — Freshness-Artefakte…` im Auftrag-Block:

```markdown
  - **Review-Gate (PFLICHT, wörtlich Teil dieses Prompts):** Vor `gh pr create` die Änderungen unabhängig prüfen lassen — rufe `superpowers:requesting-code-review` auf, behebe alle Befunde und warte auf Reviewer-Approval. Ohne diesen Schritt kein `gh pr merge --auto` (T005565, Lektion aus T005307/PR #4444).
```

- [ ] **Step 3: Verweis in Schritt 3.8 ergänzen**

Nach dem ersten Satz von Schritt 3.8 anfügen: „Im delegierten Flow ist das Gate zugleich als PFLICHT-Bullet im Implementer-Auftrag verankert (Schritt 2) — der Orchestrator verifiziert beim Merge-Wait, dass der Implementer den Review im Abschlussbericht belegt."

- [ ] **Step 4: Test grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/devflow-review-gate.bats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md tests/spec/agent-skills/devflow-review-gate.bats
git commit -m "fix(skills): anchor review gate in dev-flow-execute implementer mandate [T005565]"
```

---

### Task 2: Verifikation und Artefakte

**Files:**
- Verify: `openspec/changes/devflow-review-gate/`, `tests/spec/agent-skills/*`

- [ ] **Step 1: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0. Fehlt `.ticket`: `echo T005565 > openspec/changes/devflow-review-gate/.ticket`.

- [ ] **Step 2: CI-äquivalente Spec-Suite**

Run: `timeout 900 task test:spec:changed`
Expected: Exit 0.

- [ ] **Step 3: Geänderte Domains**

Run: `timeout 900 task test:changed`
Expected: Exit 0.

- [ ] **Step 4: Freshness**

Run:
```bash
task freshness:regenerate
git add docs/code-quality/repo-index.json website/src/data/openspec-status.json website/src/data/test-inventory.json 2>/dev/null || true
git commit -m "chore: regenerate freshness artifacts [T005565]"
task freshness:check
```
Expected: `freshness:check` Exit 0; Artefakte im Commit.

- [ ] **Step 5: Abschluss-Commit**

```bash
git add openspec/changes/devflow-review-gate/
git commit -m "chore(plans): finalize devflow-review-gate change [T005565]"
```
