---
title: brainstorm-Include: Cross-Include-Aufruf — Implementation Plan
ticket_id: T005899
domains: [test, docs]
status: completed
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brainstorm-Include: Cross-Include-Aufruf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der kaputte Cross-Include-Aufruf `task: dev:firewall:open` im brainstorm-Include wird per Root-Adressierung (`task: :dev:firewall:open`) repariert; BATS-Test rot→grün; Gotchas-Konvention dokumentiert.

**Architecture:** go-task löst Task-Aufrufe aus included Taskfiles relativ zum Include-Namespace auf; der führende Doppelpunkt adressiert die Root-Taskfile.

**Tech Stack:** go-task 3.52.0, BATS (vendored).

**Spec:** `openspec/changes/brainstorm-firewall-namespace/design.md`

## Global Constraints

- Fix ist genau eine Zeile in `taskfiles/Taskfile.brainstorm.yml` — keine weitere Taskfile-Änderung.
- BATS-Runner: `tests/unit/lib/bats-core/bin/bats` (vendored).
- Gotchas-Sektion nur anfügen, keine bestehenden Abschnitte umschreiben.

## File Structure

```
taskfiles/Taskfile.brainstorm.yml                              # MODIFY: 1 Zeile (Doppelpunkt-Präfix)
tests/spec/ci-cd/brainstorm-firewall-namespace.bats            # EXISTS: failing Test (rot verifiziert)
docs/superpowers/references/gotchas-footguns.md                # EXISTS: Sektion + Index bereits angelegt
openspec/changes/brainstorm-firewall-namespace/{design,proposal}.md  # EXISTS
```

---

### Task 1: Fix anwenden und Rot-Grün abschließen

**Files:**
- Modify: `taskfiles/Taskfile.brainstorm.yml`
- Test: `tests/spec/ci-cd/brainstorm-firewall-namespace.bats` (existiert, rot verifiziert)

- [ ] **Step 1: Rot bestätigen**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/brainstorm-firewall-namespace.bats`
expected: FAIL — beide Tests scheitern an `[ "$status" -eq 0 ]` (task bricht mit „does not exist" ab).

- [ ] **Step 2: Fix anwenden**

In `taskfiles/Taskfile.brainstorm.yml` (Z. 62):
```yaml
      - task: :dev:firewall:open
```
(der führende Doppelpunkt ist der Fix — Root-Adressierung statt relativer Namespace-Auflösung).

- [ ] **Step 2.5: Gotchas-Sektion anhängen**

An `docs/superpowers/references/gotchas-footguns.md`: den Section-Index-Eintrag (nach Eintrag 21) und am Dateiende die Sektion ergänzen:

```markdown
22. [Taskfile deps & Includes (T005899)](#taskfile-deps--includes-t005899) — deps laufen parallel, nicht seriell; Cross-Include-Aufrufe brauchen führenden Doppelpunkt
```

```markdown
### Taskfile deps & Includes (T005899)

- **`deps:` laufen parallel, nicht seriell.** go-task führt mehrere Abhängigkeiten eines Tasks gleichzeitig aus (Doku: „Dependencies run in parallel"); die deklarierte Listenreihenfolge garantiert keine Ausführungsreihenfolge (empirisch: 5 Läufe eines 4-deps-Tasks → 5 verschiedene Reihenfolgen). Serielle Ketten sind per Design nur über `cmds: - task:` möglich („Call Tasks Serially"). Wer Sequencing braucht, deklariert **keine** deps — das hat 2026-08-14 den geplanten Refactor T005604/T005787 gekippt, weil `feature:deploy`-artige Ketten als deps zu „verify vor deploy"-Risiko geführt hätten.
- **Cross-Include-Aufrufe aus included Taskfiles brauchen den führenden Doppelpunkt.** Ein `task: dev:firewall:open` in einem include-namespaced Taskfile wird relativ zum eigenen Namespace aufgelöst (`brainstorm:dev:firewall:open` → „does not exist"). Root-Adressierung: `task: :dev:firewall:open` (führender Doppelpunkt). War der Defekt hinter `brainstorm:firewall:open` (T005899).
```

- [ ] **Step 3: Grün**

Run: `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/brainstorm-firewall-namespace.bats`
Expected: PASS (2/2) — Dry-Runs exit 0, ufw-Delegation sichtbar, keine „does not exist"-Auflösung.

- [ ] **Step 4: Commit**

```bash
git add taskfiles/Taskfile.brainstorm.yml tests/spec/ci-cd/brainstorm-firewall-namespace.bats docs/superpowers/references/gotchas-footguns.md
git commit -m "fix(infra): resolve brainstorm cross-include firewall call [T005899]"
```

---

### Task 2: Verifikation und Artefakte

**Files:**
- Verify: `openspec/changes/brainstorm-firewall-namespace/`, `tests/spec/ci-cd/*`

- [ ] **Step 1: OpenSpec-Validierung**

Run: `task openspec:validate`
Expected: Exit 0. Fehlt `.ticket`: `echo T005899 > openspec/changes/brainstorm-firewall-namespace/.ticket` und erneut validieren.

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
git commit -m "chore: regenerate freshness artifacts [T005899]"
task freshness:check
```
Expected: `freshness:check` Exit 0; Artefakte im Commit (`git show --stat HEAD`).

- [ ] **Step 5: Abschluss-Commit**

```bash
git add openspec/changes/brainstorm-firewall-namespace/
git commit -m "chore(plans): finalize brainstorm-firewall-namespace change [T005899]"
```
