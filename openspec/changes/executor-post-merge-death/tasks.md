---
title: executor-post-merge-death — Post-Merge-Finalisierung in frischem Kontext — Implementation Plan
ticket_id: T006284
domains: [docs]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# executor-post-merge-death — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Post-Merge-Finalisierung von `dev-flow-execute` (Schritte 6.4–7.5: Merge-Wait, Ticket-Abschluss, Plan-Archivierung, Worktree-/Branch-Cleanup, Lock-Release) läuft nicht mehr im kontexterschöpften Executor-Orchestrator, sondern in einem frischen Finalizer-Subagenten über eine idempotente Skript-Einheit — damit ein Executor-Tod nach dem Merge (Incident T006284/PR #4460) keine liegengebliebenen Abschluss-Schritte hinterlässt.

**Architecture:** Zwei Eingriffe, die die Gelegenheit entfernen statt die Direktive zu verschärfen (Muster T002365/T001571):
1. `scripts/devflow-post-merge-finalize.sh <ticket-id>` — deterministische, idempotente Abschluss-Einheit (jeder Schritt skippt erledigte Arbeit), aufrufbar vom Finalizer, von Recovery-Sessions und später vom Factory-Poller.
2. `dev-flow-execute`-Skill: Der Orchestrator endet nach dem Auto-Merge-Request (Schritt 3.8); die Schritte 6.4–7.5 werden an einen frischen Finalizer-Subagenten mit kompaktem Lagebild delegiert (T001571-Standing-Direktive inklusive).

**Tech Stack:** Bash (keine neuen Abhängigkeiten), Bestands-Skripte (`ticket.sh`, `openspec.sh archive`, `agent-lock.sh release`, `branch-reaper.sh`).

**Spec:** `openspec/changes/executor-post-merge-death/design.md`

## Global Constraints

- `.md`/`.bats` haben kein S1-Limit (`docs/code-quality/gates.yaml` → `s1.limits` kennt nur .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash) und sind nicht gebaselinet (`docs/code-quality/baseline.json`) — kein S1-Budget für die Skill-/Spec-/Test-Dateien.
- `scripts/devflow-post-merge-finalize.sh` (NEU, .sh): Limit 800 → Budget 800; das Skript bleibt unter 300 Zeilen (Kette aus Bestands-Skripten, keine neue Logik).
- `scripts/devflow-post-merge-ticket-closure.sh` (137 Zeilen) dient als Stil-/Konventions-Vorlage (set -euo pipefail, HERE-Root, BRAND/TICKET_CTX-Env).
- Kein neuer Vitest-Test nötig: keine `.ts`/`.svelte`-Änderung (Bash-Skript + Skill-Doku) — `<!-- vitest: kein neuer Test nötig, weil keine website/src-Änderung -->`.
- S4: Das neue Skript wird von der SKILL.md referenziert und vom BATS-Guard aufgerufen — kein Orphan.
- S3: keine Brand-Domains in Code-Snippets (Skript arbeitet brand-agnostisch über `BRAND`/`TICKET_CTX`-Env).
- Rotphase ist bereits angelegt: `tests/spec/agent-skills/executor-post-merge-death.bats` schlägt am aktuellen Stand fehl (5/6 rot, Anker grün).

## File Structure

```
scripts/devflow-post-merge-finalize.sh                         # NEW: idempotente Abschluss-Einheit (< 300 Zeilen, .sh-Limit 800)
.claude/skills/dev-flow-execute/SKILL.md                       # MODIFY: Finalizer-Delegation statt In-Context-Finalisierung (294 → ~320)
.claude/skills/references/dev-flow-execute-phases.md           # MODIFY: Schritte 6.4–7.5 als Finalizer-Skript-Kette (340 → ~360)
openspec/specs/agent-skills.md                                 # MODIFY (via Archivierung): neues Requirement (Finalizer-Delegation + Skript-Einheit)
openspec/changes/executor-post-merge-death/specs/agent-skills.md  # EXISTS: Delta-Spec (ADDED Requirements)
tests/spec/agent-skills/executor-post-merge-death.bats         # EXISTS: failing Test (rot, liegt bereits im Arbeitsbaum)
website/src/data/test-inventory.json                           # REGENERATE: task test:inventory (neuer Test)
```

---

### Task 1: Roten Zustand reproduzieren

**Files:**
- Test: `tests/spec/agent-skills/executor-post-merge-death.bats` (existiert, rot)

**Interfaces:**
- Produces: dokumentierter RED-Lauf (5/6 rot, Anker grün) als Task-Ergebnis.

**Steps:**
- [x] Testrunner auf die neue Testdatei ausführen:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/executor-post-merge-death.bats
  ```
- [x] Erwartetes Ergebnis prüfen und im Task-Ergebnis festhalten: `expected: FAIL` — genau die fünf Implementierungs-Tests (Finalizer-Delegation im Skill, Skill-Referenz auf das Skript, Skript-Existenz/Usage/Offline-Pfad) sind rot, der Positiv-Anker (Post-Merge-Abschnitt existiert) ist grün.
- [x] Kein Fix in diesem Task — nur Reproduktion und Dokumentation.

### Task 2: Idempotente Abschluss-Einheit `scripts/devflow-post-merge-finalize.sh`

**Files:**
- Add: `scripts/devflow-post-merge-finalize.sh` — S1: NEU, .sh-Limit 800 → Budget 800, Ziel < 300 Zeilen
- Stil-Vorlage: `scripts/devflow-post-merge-ticket-closure.sh` (Ist 137, kein S1-Budget behauptet)

**Interfaces:**
- Produces: `scripts/devflow-post-merge-finalize.sh <ticket-id> [--pr <n>] [--branch <branch>]` — Exit 0 = alle Schritte erledigt oder übersprungen; Exit 1 = Fehler (Schritt nennt Meldung); Exit 2 = Usage-/Env-Fehler.
- Consumes: `scripts/ticket.sh get/update-status/add-pr-link/phase/archive-plan`, `scripts/openspec.sh archive`, `scripts/agent-lock.sh release/check`, `scripts/branch-reaper.sh` (oder direkter `git push origin --delete`), `gh` für PR-Auflösung.

**Steps:**
- [x] Skriptgerüst mit `set -euo pipefail`, `HERE`/`REPO_DIR`-Auflösung und Usage-Block anlegen (Vorlage: `devflow-post-merge-ticket-closure.sh`). `--help` gibt Usage aus und endet mit Exit 0; Aufruf ohne Ticket-ID endet mit Usage auf stderr und Exit 2.
- [x] Offline-Fehlerpfad: `TICKET_OFFLINE` gesetzt → klare Meldung ("Finalize-Skript benötigt Cluster-/DB-Zugriff (ticket.sh); TICKET_OFFLINE ist gesetzt") und Exit 2, bevor irgendein Schritt läuft. `BRAND`/`TICKET_CTX` werden an `ticket.sh` durchgereicht.
- [x] Schritt 1 — Ticket laden (`ticket.sh get`): unbekannte ID → Meldung + Exit 1. Status `done`/`archived` → `[skip] bereits abgeschlossen` und weiter (Idempotenz).
- [x] Schritt 2 — Branch bestimmen: `--branch`-Flag, sonst `plan_ref` aus der Ticket-DB (FACTORY-PLAN-REF), sonst Abbruch mit Meldung + Exit 1 (Branch ist Pflicht für PR-Auflösung und Cleanup).
- [x] Schritt 3 — PR-Nummer bestimmen: `--pr`-Flag, sonst `gh pr list --head <branch> --state merged --json number -q '.[0].number'`; keine PR → `[skip] kein PR gefunden` (nur Closure-schädliche Schritte laufen nicht; Archiv/Cleanup weiter).
- [x] Schritt 4 — PR-Link setzen (`ticket.sh add-pr-link`, `|| true`): bestehender Link ist kein Fehler (idempotent, Meldung `[skip]`/`[ok]`).
- [x] Schritt 5 — Ticket abschließen (`ticket.sh update-status --status done`): Resolution `fixed` bei type `fix`/`bug`, sonst `shipped` (Dual-Vokabular wie `auto-close-merged.sh`); nur wenn Status noch nicht `done`/`archived`.
- [x] Schritt 6 — `verify:done`-Phase-Event (`ticket.sh phase <id> verify done --driver devflow --detail "gate=ci result=pass"`, `|| true` — Dedup ist harmlos).
- [x] Schritt 7 — Plan archivieren (`ticket.sh archive-plan --id <id> --slug <slug> --branch <branch> --plan-file <pfad>`, Pfad aus `plan_ref`): bereits archiviert oder kein `plan_ref` → `[skip]` mit Meldung.
- [x] Schritt 8 — OpenSpec-Change archivieren (`scripts/openspec.sh archive <slug>` im Haupt-Repo, inklusive Archiv-PR wie in `plan-archive-steps`): Change-Ordner existiert nicht mehr (bereits archiviert) → `[skip]`.
- [x] Schritt 9 — Branch-Lock freigeben (`agent-lock.sh release branch <branch>`): nur wenn der Claim dieser Session gehört (`agent-lock.sh check branch` == mine); fremder/fehlender Claim → `[skip]` (T003102-Respekt).
- [x] Schritt 10 — Worktree/Branch bereinigen: `git worktree remove <wt> --force` (Worktree-Pfad aus `plan_ref`/Konvention `.worktrees/<slug>`), lokalen Branch `-D` + Remote-Delete via `branch-reaper.sh --ticket <id>` (oder äquivalent); bereits entfernt → `[skip]`.
- [x] Abschluss: Zusammenfassung der Steps (erledigt/übersprungen) auf stdout, Exit 0.

### Task 3: Skill-Umbau — Finalizer-Delegation

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` — S1: Ist 294 · Baseline nicht-baselined → Budget entfällt (`.md` nicht in `s1.limits`), Ziel ≈ 320
- Modify: `.claude/skills/references/dev-flow-execute-phases.md` — S1: Ist 340 · Baseline nicht-baselined → Budget entfällt (`.md` nicht in `s1.limits`), Ziel ≈ 360

**Interfaces:**
- Produces: SKILL.md, in dem die Finalisierung (Schritte 6.4–7.5) als Delegation an einen frischen Finalizer-Subagenten ausgewiesen ist und der Orchestrator nach Schritt 3.8 endet.

**Steps:**
- [x] In `.claude/skills/dev-flow-execute/SKILL.md` nach dem Code-Review-Gate (Schritt 3.8, `gh pr merge --auto`) einen neuen Abschnitt "Schritt 3.9: Finalisierung delegieren" einfügen: Der Orchestrator SHALL nach dem Auto-Merge-Request enden (Rückmeldung an den Auftraggeber) und die Schritte 6.4–7.5 NICHT im eigenen Kontext ausführen. Delegation an einen frischen Finalizer-Subagenten mit kompaktem Lagebild: Ticket-ID, PR-Nummer, Branch, Worktree-Pfad, Plan-Pfad, Resolution — plus T001571-Standing-Direktive (Kontext-Budget: bei Überlauf Handoff-Report mit erledigten Schritten, Git-Zustand, offenen Schritten in Reihenfolge).
- [x] Im Finalizer-Auftrag festschreiben: Ausführung über `bash scripts/devflow-post-merge-finalize.sh "$TICKET_ID" --pr "$PR_NUM"` (idempotente Einheit), strukturierter Endzustands-Report (was erledigt, was offen), Pflicht zur Rückmeldung an den Auftraggeber.
- [x] Abschnitt "Schritte 6.4–7.5 — Merge-Wait, Ticket-Abschluss, Cleanup" umbauen: Der Abschnitt beschreibt jetzt die Finalizer-Zuständigkeit (Merge-Wait-Loop via `ci-fix-loop.md`-Referenz, Abschluss über das Finalize-Skript, Verweis auf `devflow-post-merge-finalize.sh`) — die bisherige In-Context-Befehlsliste weicht dem Skript-Aufruf. T001149-M1 (Merge-Wait vor Closure), T004612 (Reihenfolge: Archiv vor Branch-Löschung) und "Claims vor Worktree-Remove" bleiben als Constraints im Abschnitt.
- [x] In `.claude/skills/references/dev-flow-execute-phases.md` die Schritte 6.4–7.5 als Finalizer-Skript-Kette dokumentieren: Merge-Wait-Loop, dann `devflow-post-merge-finalize.sh` als deterministische Einheit; die Einzelschritte (PR-Link, Closure, verify:done, Plan-Archiv, OpenSpec-Archiv, Lock-Release, Cleanup) bleiben als Referenz erhalten, laufen aber über das Skript.
- [x] T002352-M1-Muster wahren: Der Implementer-Auftrag (Schritt 2) erwähnt weiterhin KEIN Worktree-Remove und kein Cleanup (bestehende Guards in `tests/spec/dev-flow-execute.bats` bleiben grün).

### Task 4: Grün fahren + Test-Inventar + Spec-Validierung

**Files:**
- Test: `tests/spec/agent-skills/executor-post-merge-death.bats` — S1: `.bats` nicht in `s1.limits`, nicht gebaselinet → kein Budget (Ist 88, unverändert)
- Regenerate: `website/src/data/test-inventory.json` — S1: `.json` nicht in `s1.limits`, nicht gebaselinet → kein Budget (generiert)

**Interfaces:**
- Produces: grüner BATS-Lauf der neuen Testdatei; aktualisiertes Test-Inventar; validierte OpenSpec-Struktur.

**Steps:**
- [x] Testrunner auf die neue Testdatei ausführen — jetzt `expected: PASS` (6/6 grün):
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/executor-post-merge-death.bats
  ```
  Die Tests 4–6 rufen das neue Skript direkt auf (`--help`-Exit 0, No-Args-Exit ≠ 0, `TICKET_OFFLINE`-Exit ≠ 0) — das ist die explizite Output-Verifikation des Skript-Aufrufvertrags aus Task 2.
- [x] Negativ-Richtung belegen (der Test ist der Drift-Guard): dokumentieren, dass die fünf Implementierungs-Tests vor Task 2/3 rot waren (Task-1-Ergebnis) und jetzt grün sind.
- [x] Bestehende Guards unversehrt: `tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/ tests/spec/dev-flow-execute.bats` muss grün bleiben (kein Rückbau von T002352-/T005565-Konventionen).
- [x] Test-Inventar regenerieren und committen:
  ```bash
  task test:inventory
  git add website/src/data/test-inventory.json
  ```
- [x] OpenSpec-Struktur validieren:
  ```bash
  bash scripts/openspec.sh validate
  ```

### Task 5: Abschluss-Verifikation

**Files:**
- `scripts/devflow-post-merge-finalize.sh` (NEU)
- `.claude/skills/dev-flow-execute/SKILL.md`
- `.claude/skills/references/dev-flow-execute-phases.md`
- `tests/spec/agent-skills/executor-post-merge-death.bats`
- `website/src/data/test-inventory.json` (regeneriert)

**Steps:**
- [ ] Gezielte Tests für geänderte Domains:
  ```bash
  task test:changed
  ```
- [ ] Generierte Artefakte aktualisieren:
  ```bash
  task freshness:regenerate
  ```
- [ ] CI-Äquivalent (Freshness + S1–S4-Ratchet + Baseline-Assertion):
  ```bash
  task freshness:check
  ```
- [ ] Zusätzlich: `bash scripts/openspec.sh validate` (Exit 0) und `bash scripts/plan-lint.sh openspec/changes/executor-post-merge-death/tasks.md` (Exit 0) als letzte Plausibilitäts-Gates vor dem Stage-Commit.
- [ ] Ergebnis dokumentieren: alle drei Mandatory-Verify-Commands grün, kein Baseline-Wachstum (`docs/code-quality/baseline.json` unverändert).
