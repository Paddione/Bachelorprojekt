---
title: "devflow-worktree-cwd-guard — Implementation Plan"
ticket_id: T006367
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devflow-worktree-cwd-guard — Implementation Plan

_Ticket: T006367_

## File Structure

```
.claude/skills/dev-flow-plan/SKILL.md              (M) Regel-Phrase + git -C-Formen in Commit-Blöcken
.claude/skills/references/dev-flow-plan-phases.md  (M) Regel + cd+Guard-Formen in Scaffold-/Partial-/Fix-Blöcken
.claude/skills/dev-flow-execute/SKILL.md           (M) Regel + git -C-Formen
.claude/skills/dev-flow-chore/SKILL.md             (M) Regel + git -C-Formen
.opencode/skills/opencode-flow-plan/SKILL.md       (M) Regel + git -C-Formen
.opencode/skills/opencode-flow-execute/SKILL.md    (M) Regel + git -C-Formen
.opencode/skills/opencode-flow-chore/SKILL.md      (M) Regel + git -C-Formen
openspec/changes/devflow-worktree-cwd-guard/specs/agent-skills.md  (M) Requirement (bereits gefüllt, Inhalt prüfen)
tests/spec/agent-skills/devflow-worktree-cwd-guard.bats            (A) Guard-Test (bereits geschrieben, RED)
```

## S1-Budget-Hinweis

Keine der geänderten Dateien hat eine wirksame S1-Schwelle: `docs/code-quality/gates.yaml`
definiert Limits nur für Code-Extensions (`.ts`, `.sh`, …), nicht für `.md`; die
`baseline.json` ist leer (`{}`); `.claude/` ist nicht im Scan-Universum (`code_roots`
enthält `.opencode`, nicht `.claude`). Keine Split-/Shrink-Pflicht, keine
Budget-Kommentare nötig. Die Dateigrößen (112–395 Zeilen) bleiben unverändert im
Rahmen — die Änderung ist additiv pro Datei (ein Regel-Block + Form-Umstellung).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Guard-Test
      `tests/spec/agent-skills/devflow-worktree-cwd-guard.bats` liegt vor und ist
      auf diesem Branch ROT (verifiziert: beide @test-Blöcke schlagen fehl, weil
      die Regel-Phrase in keiner der sieben Skill-Dateien steht und `git -C` in
      sechs von sieben fehlt). Er wird nicht angefasst, bis der Fix grün ist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/devflow-worktree-cwd-guard.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

### Task 1 — Regel-Phrase + `git -C`-Formen in den Claude-Code-Skills

Dateien: `.claude/skills/dev-flow-plan/SKILL.md`, `.claude/skills/references/dev-flow-plan-phases.md`,
`.claude/skills/dev-flow-execute/SKILL.md`, `.claude/skills/dev-flow-chore/SKILL.md`.

1. In jeder Datei die kanonische Regel-Phrase ergänzen (als eigener Hervorhebungs-Block
   in der Nähe der Commit-/Push-Anweisungen, Bezug auf T002357-Falle/T006367):

   > Bash-Aufrufe in dev-flow-Phasen IMMER mit `git -C <worktree>` bzw. explizitem
   > cd+guard — **nie auf implizites cwd vertrauen**.

2. Die bestehende T002357-Notiz ("`cd` wirkt nur auf Bash", Datei-Tool-Pfade) in den
   drei SKILL.md-Dateien um den Bash-Git-Aspekt erweitern (ein Satz, Verweis auf die
   Regel-Phrase).

3. Commit-/Push-/Preflight-Blöcke auf die explizite Form umstellen. Erlaubte Formen
   (eine genügt pro Block):
   - `git -C "$WT" add …` / `git -C "$WT" commit …` / `git -C "$WT" push …`, oder
   - cd+Guard vor dem Block:
     ```bash
     cd "$WT" && [ "$(git rev-parse --show-toplevel)" = "$PWD" ] || { echo "FATAL: cwd != worktree"; exit 1; }
     ```
   Betroffen u.a.: Scaffold-Commit (B.3), Partial-/Finalize-Commits (Phase C),
   Fix-Pfad Stage-Commit (Schritt 5), dev-flow-execute Freshness-Commit und
   `preflight-pr-scope.sh`-Aufruf, dev-flow-chore Commit/PR-Schritte.

4. Bewusst NICHT umstellen: `git -C "$REPO_ROOT"`-Aufrufe für Hauptcheckout-
   Verifikation in Phase B (die sind bereits explizit und korrekt).

### Task 2 — Regel-Phrase + `git -C`-Formen in den opencode-Skills

Dateien: `.opencode/skills/opencode-flow-plan/SKILL.md`,
`.opencode/skills/opencode-flow-execute/SKILL.md`,
`.opencode/skills/opencode-flow-chore/SKILL.md`.

Gleiche Schritte wie Task 1: Regel-Phrase ergänzen, bare git-Aufrufe
(Scaffold-/Partial-/Finalize-Blöcke, Archive-Commit, Scope-Preflight) auf
`git -C <worktree>` oder cd+Guard umstellen. `.opencode/skills/dev-flow/worktree.ts`
ist ausgenommen — dessen Git-Calls laufen programmatisch mit explizitem cwd.

### Task 3 — Delta-Spec prüfen

`openspec/changes/devflow-worktree-cwd-guard/specs/agent-skills.md` ist bereits
mit dem Requirement "dev-flow skills must not rely on the implicit Bash cwd for
git operations" gefüllt. Inhalt gegen die umgesetzten Dateien abgleichen; falls die
Implementierung abweicht, das Requirement nachziehen. Keine Platzhalter im
Delta-Spec zurücklassen.

### Task 4 — Guard grün fahren

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/devflow-worktree-cwd-guard.bats
# expected: PASS (green — both assertions hold in all seven files)
```

Beide Richtungen belegen: RED war oben verifiziert; jetzt ist derselbe Test grün.
Falls einzelne Dateien weiterhin fehlschlagen, gehören die Formen in diese Datei
(Task 1/2) — nicht der Test abgeschwächt.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
