---
ticket_id: T006367
plan_ref: null
status: active
date: 2026-08-15
---

# Design: devflow-worktree-cwd-guard

## Goals

- Verhindern, dass Bash-Git-Aufrufe in dev-flow-Phasen (plan/execute/chore) im falschen
  Checkout landen, wenn das Bash-cwd nach vorherigen Befehlen nicht im Worktree steht.
- Die Regel ist explizit und maschinell überprüfbar: Ein Guard-Test belegt, dass die
  dev-flow-Skills die `git -C <worktree>` / cd+guard-Pflicht formulieren.

## Non-Goals

- Keine Änderung an `scripts/worktree-git-op-guard.sh` (der prüft nur unterbrochene
  Git-Operationen, nicht das cwd — anderes Problem).
- Kein neues Runtime-Hook-System: Die Verstärkung liegt auf der Ebene der
  Skill-Dokumentation + Konventions-Guard, genau wie die bestehenden T002357-Notizen.
- `.opencode/skills/dev-flow/worktree.ts` ist nicht betroffen: dessen Git-Calls laufen
  programmatisch mit explizitem cwd-Argument (Node), nicht über das Bash-cwd.

## Decisions

### D1: Ursache (verifiziert, T002448-M5)

**Symptom (Fakt):** git commit (Docs-Fix T006330) und `preflight-pr-scope.sh` liefen in
einer Runde im Hauptcheckout statt im Fix-Worktree. Kein Schaden, aber der Commit-Versuch
hätte auf einem fremden Branch (chore/plan-archive-...) landen können, wenn dort
Staged-Dateien gelegen hätten.

**Hypothese → belegt:** Die dev-flow-Skills enthalten bare `git add`/`git commit`/
`git push`-Aufrufe, die auf das implizite Bash-cwd vertrauen:

- `.claude/skills/dev-flow-plan/SKILL.md` — Commit-Blöcke ohne `-C`
- `.claude/skills/references/dev-flow-plan-phases.md` — Scaffold-/Partial-/Finalize-Blöcke
- `.claude/skills/dev-flow-execute/SKILL.md` — Freshness-Commit, `preflight-pr-scope.sh`
- `.claude/skills/dev-flow-chore/SKILL.md` — Commit/PR-Schritte
- `.opencode/skills/opencode-flow-plan/SKILL.md` — Scaffold-/Partial-/Finalize-Blöcke
- `.opencode/skills/opencode-flow-execute/SKILL.md` — Archive-Commit, `preflight-pr-scope.sh`
- `.opencode/skills/opencode-flow-chore/SKILL.md` — Scope-Preflight

Die bestehenden T002357-Notizen decken nur Datei-Tool-Pfade (Read/Write/Edit) ab — das
Bash-cwd-Problem für **Git-Aufrufe** ist nicht adressiert. `worktree-git-op-guard.sh`
prüft nur in-progress-Operationen (rebase/merge/cherry-pick), nicht das cwd.

### D2: Fix-Ansatz — Regel + Beispielformen + Guard

1. **Prominente Regel** in allen dev-flow-Skills (Claude-Code- und opencode-Varianten):
   Bash-Aufrufe in dev-flow-Phasen IMMER mit `git -C <worktree>` bzw. explizitem
   cd+guard ausführen — nie auf implizites cwd vertrauen. Die T002357-Notiz wird um
   den Bash-Git-Aspekt erweitert.
2. **Beispielformen** in den Code-Blöcken: Entweder `git -C "$WT" add …` oder ein
   cd+Guard vor dem Commit-Block:
   ```bash
   cd "$WT" && [ "$(git rev-parse --show-toplevel)" = "$PWD" ] || { echo "FATAL: cwd != worktree"; exit 1; }
   ```
3. **Guard-Test** `tests/spec/agent-skills/devflow-worktree-cwd-guard.bats`
   (Dokumentations-Konvention → grep-Modus, PRUEFMODUS im Kopf begründet): Die
   betroffenen Skill-Dateien müssen die Regel-Phrase tragen. Positiv-Anker-Pflicht
   (T002356-M1): Der Test ist rot, solange die Regel fehlt.

### D3: Regel-Phrase (SSOT für den Guard)

Kanonische Phrase, die in jeder betroffenen Datei vorkommen muss:

> `nie auf implizites cwd vertrauen` — ergänzt um die Pflichtform `git -C <worktree>` bzw. `cd+guard`.

Der Guard prüft formatfrei (grep -qF, keine Zeilenanker, T002716): jede betroffene Datei
muss die Phrase `nie auf implizites cwd vertrauen` enthalten (Verweis auf die
T002357-Falle) und an den Commit-Stellen `git -C` bzw. `rev-parse --show-toplevel`
als Guard-Form referenzieren.

### D4: Betroffene Dateien (disjunkt, vollständig)

| Datei | Änderung |
|---|---|
| `.claude/skills/dev-flow-plan/SKILL.md` | Regel + `git -C`-Formen in Commit-Blöcken |
| `.claude/skills/references/dev-flow-plan-phases.md` | Regel + cd+Guard/`git -C` in Scaffold-/Partial-/Fix-Blöcken |
| `.claude/skills/dev-flow-execute/SKILL.md` | Regel + `git -C`-Formen |
| `.claude/skills/dev-flow-chore/SKILL.md` | Regel + `git -C`-Formen |
| `.opencode/skills/opencode-flow-plan/SKILL.md` | Regel + `git -C`-Formen |
| `.opencode/skills/opencode-flow-execute/SKILL.md` | Regel + `git -C`-Formen |
| `.opencode/skills/opencode-flow-chore/SKILL.md` | Regel |
| `openspec/specs/agent-skills.md` (via Delta) | neues Requirement |
| `tests/spec/agent-skills/devflow-worktree-cwd-guard.bats` | Guard-Test (RED zuerst) |

## Edge-Cases

- **cd+Guard-Form:** Wenn ein Block `cd .worktrees/<slug>` nutzt, muss unmittelbar
  danach ein Toplevel-Check stehen — nie `cd` allein als "Guard".
- **`git -C "$REPO_ROOT"`-Aufrufe** (z.B. Hauptcheckout-Verifikation in Phase B) bleiben
  korrekt: Sie sind explizit und gehören nicht zur Falle.
- **`git push` ohne `-C`** direkt nach `git -C`-Commit im selben Block: Auch der Push
  braucht die explizite Form (oder der Guard-Check deckt ihn ab).
- **preflight-pr-scope.sh** und andere Skripte, die git intern nutzen, laufen im
  Worktree-cwd — die Regel gilt für sie genauso.
- **Fremde Parallel-Sessions:** Phase A läuft im Hauptcheckout ohne git add/commit;
  die status.json-Modifikation von propose wird per Snapshot/Restore zurückgesetzt
  (kein `git checkout --`, das fremde Arbeitsbaum-Zustände verwerfen würde).
