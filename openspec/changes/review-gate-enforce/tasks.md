---
title: review-gate-enforce
ticket_id: T005565
domains: [skills, tests]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# review-gate-enforce — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Review-Gate in `dev-flow-execute` wird ein Orchestrator-Gate PFLICHT vor Auto-Merge: Der Implementer-Auftrag (Schritt 2) endet nach der PR-Erstellung und enthält keinen `gh pr merge --auto`-Aufruf mehr; der Auto-Merge-Befehl liegt im Code-Review-Gate-Abschnitt (Schritt 3.8), den der Orchestrator nach Review-Approval ausführt (Richtung B, design.md).

**Architecture:** Härtung durch Entfernen der Gelegenheit statt Verschärfen der Direktive (Repo-Lehre T002365): Die einzige Stelle, die `gh pr merge --auto` ausführt, wird in den Review-Gate-Abschnitt verschoben und dort explizit als Orchestrator-Schritt markiert. Der bestehende Ordnungs-Guard T002272-M2 (Auto-Merge vor CI-Watch) bleibt erhalten und wird auf den neuen Anker umgestellt.

**Tech Stack:** Markdown-Skill-Datei (`.claude/skills/dev-flow-execute/SKILL.md`), BATS (vendored Runner `tests/unit/lib/bats-core/bin/bats`), bash/awk für die Guards.

**Spec:** `openspec/changes/review-gate-enforce/design.md` (Entscheidung B) + `openspec/changes/review-gate-enforce/specs/agent-skills.md` (Delta: ADDED "Review-Gate ist Orchestrator-Gate vor Auto-Merge" + MODIFIED "dev-flow-execute trennt Implementer- und Orchestrator-Zuständigkeit").

## Global Constraints

- **Arbeitsort:** Implementierung läuft im Worktree `/home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce` (Branch `fix/review-gate-enforce-T005565`). `MAIN_REPO=/home/patrick/Bachelorprojekt` (vom SKILL.md-Bash-Block referenziert).
- **Lane-Begrenzung:** Nur `.claude/skills/dev-flow-execute/SKILL.md`, `tests/spec/ci-cd.bats` (T002272-M2) und die bestehende Testdatei anfassen. NICHT anfassen: `scripts/agent-lock.sh`, `tests/lib/factory-test-fixtures.sh`, `.opencode/**`, `pipeline.js`, Branch-Protection.
- **BATS-Runner:** Immer `tests/unit/lib/bats-core/bin/bats` (vendored) — niemals `which bats` oder `./tests/bats/bin/bats`.
- **Test-Resultats-Konvention (T002448-M4):** Der neue Guard `tests/spec/agent-skills/review-gate-before-auto-merge.bats` ist Source-Grep-Modus — dokumentierte Ausnahme für Konventionstests auf Skill-Content; der Prüfmodus steht im Header-Kommentar der Datei.
- **Positiv-Anker (T002356-M1):** Negativ-Aussagen im Guard (kein `merge --auto` im Mandat) brauchen den Positiv-Anker-Test 1 im selben File.
- **Wortlaut-Zwänge des Guards (Tests 2 und 3):** Der Schritt-2-Abschnitt (inkl. Arbeitsteilungs-Kommentar und ENDE-Block) darf das Literal `merge --auto` NICHT enthalten; der Code-Review-Gate-Abschnitt MUSS `gh pr merge --auto`, `requesting-code-review` und `Orchestrator` enthalten.
- **Keine Hintergrund-Monitore (T001969):** Lange Testläufe synchron mit Timeout: `timeout 600 task test:changed`.
- **Commit-Konvention:** `type(scope): subject [$TICKET_ID]` mit `T005565`; PR-Body mit `Closes T005565` (Fixes).
- **Freshness vor PR:** `task freshness:regenerate` + Commit der generierten Artefakte vor der PR-Erstellung (verification-block.md).

## File Structure

```
.claude/skills/dev-flow-execute/SKILL.md      ← Modify: Abschnitte Schritt 2, 3.8, 5, 5.5, 6
tests/spec/agent-skills/review-gate-before-auto-merge.bats  ← liegt bereits auf dem Branch (Stage-Commit), ROT bestätigt — wird durch die Tasks 2/3 grün
tests/spec/ci-cd.bats                         ← Modify: Test T002272-M2 (Anker + Semantik auf Code-Review-Gate)
```

Hinweis: `website/src/data/test-inventory.json` wurde im Stage-Commit bereits regeneriert (der Guard ist dort registriert) — während der Implementierung entstehen keine neuen Testdateien, es ist kein erneutes Regenerieren nötig.

---

### Task 1: Rotphase bestätigen — der failing Test ist auf dem Branch rot

**Files:**
- Test: `tests/spec/agent-skills/review-gate-before-auto-merge.bats`

**Interfaces:**
- Consumes: nichts (Rot-Baseline existiert bereits auf dem Branch, im Stage-Commit `chore(plans): add failing test + stage plan [T005565]`).
- Produces: den dokumentierten Rot-Zustand, gegen den die Tasks 2/3 messen: Test 1 (Positiv-Anker) PASS, Tests 2 und 3 FAIL.

- [x] **Step 1: Run the failing test and verify the expected red state**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/review-gate-before-auto-merge.bats
```

Expected: FAIL — `@test "T005565: Implementer-Mandat nennt weiterhin die PR-Erstellung"` PASS (Positiv-Anker), `@test "T005565: Auto-Merge ist aus dem Implementer-Mandat entfernt"` FAIL, `@test "T005565: Auto-Merge liegt im Code-Review-Gate-Abschnitt (requesting-code-review, Orchestrator)"` FAIL.

- [x] **Step 2: Kein Commit nötig** — der failing Test liegt bereits im Stage-Commit auf dem Branch. Falls der Test überraschend grün ist: STOPP und an den Orchestrator eskalieren (die Rotphase wäre nicht belegt, T002448-M5).

### Task 2: Implementer-Mandat härten — Schritt 2 ohne Auto-Merge

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Abschnitt `## Schritt 2:`, drei Stellen)

**Interfaces:**
- Consumes: Task 1 Rot-Baseline (Test 2 ist rot).
- Produces: Schritt-2-Abschnitt ohne das Literal `merge --auto` — Test 2 wird grün, Test 3 bleibt rot (der Gate-Abschnitt existiert noch nicht).

- [x] **Step 1: Arbeitsteilungs-Kommentar ersetzen** (aktuelle Zeilen 54–56)

Aktuell:

```markdown
> **Arbeitsteilung (T002365, aus T002351-M3):** Implementer bis `gh pr merge --auto` → **ENDE**,
> Bericht zurück. Orchestrator: CI-Watch (5.5); Exit 3/4 per `SendMessage` an den Implementer
> zurück, nicht neu spawnen — sonst liefe die CI-Überwachung als Hintergrund-Monitor [T001969].
```

Ersetzen durch:

```markdown
> **Arbeitsteilung (T002365, aus T002351-M3):** Implementer bis PR-Erstellung → **ENDE**,
> Bericht zurück — OHNE Auto-Merge-Anforderung (der Auto-Merge-Befehl liegt im Code-Review-Gate,
> Schritt 3.8). Orchestrator: Review-Gate (3.8), CI-Watch (5.5); Exit 3/4 per `SendMessage` an
> den Implementer zurück, nicht neu spawnen — sonst liefe die CI-Überwachung als
> Hintergrund-Monitor [T001969].
```

- [x] **Step 2: Mandat-Bullet ersetzen** (aktuelle Zeile 87)

Aktuell:

```markdown
  - Erstelle einen PR und fordere Auto-Merge an (`gh pr merge --auto --squash` — KEIN `--delete-branch`, der Branch wird erst nach dem OpenSpec-Archiv gelöscht, T004612; Schritt 5).
```

Ersetzen durch (bewusst OHNE das Literal `merge --auto` — Guard-Test 2):

```markdown
  - Erstelle einen PR (OHNE Auto-Merge-Anforderung — die erfolgt erst nach bestandenem
    Code-Review-Gate durch den Orchestrator, Schritt 3.8).
```

- [x] **Step 3: ENDE-Block ersetzen** (aktuelle Zeilen 88–90)

Aktuell:

```markdown
  - **ENDE (T002365):** Melde Ergebnis zurück — CI-Fix-Schleife (5.5), Merge-Wait, Ticket-Abschluss und
    Plan-Archivierung laufen im Orchestrator. **Der Worktree wird NICHT von dir entfernt** (T002352-M1),
    das ist Orchestrator-Aufgabe (Schritt 7.5). Notification abwarten, dann bei Schritt 5.5 weiter — nicht Schritt 8.
```

Ersetzen durch:

```markdown
  - **ENDE (T002365):** Melde Ergebnis zurück — Review-Gate (3.8), CI-Fix-Schleife (5.5),
    Merge-Wait, Ticket-Abschluss und Plan-Archivierung laufen im Orchestrator. **Der Worktree
    wird NICHT von dir entfernt** (T002352-M1), das ist Orchestrator-Aufgabe (Schritt 7.5).
    Der Orchestrator fährt nach deiner Rückmeldung bei Schritt 3.8 fort — nicht Schritt 8.
```

- [x] **Step 4: Test, dass Test 2 grün geworden ist**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/review-gate-before-auto-merge.bats
```

Expected: FAIL insgesamt, aber Tests 1 und 2 PASS, Test 3 weiterhin FAIL (der Gate-Abschnitt fehlt noch).

- [x] **Step 5: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "fix(skills): remove auto-merge from implementer mandate [T005565]"
```

### Task 3: Code-Review-Gate als Orchestrator-Schritt mit Auto-Merge (Schritte 3.8, 5, 5.5, 6)

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (Abschnitte `## Schritt 3.8`, `## Schritt 5`, `## Schritt 5.5`, `## Schritt 6`)

**Interfaces:**
- Consumes: Task 2 (Schritt 2 ohne Auto-Merge-Literal).
- Produces: Den Code-Review-Gate-Abschnitt (Schritt 3.8), der `gh pr merge --auto`, `requesting-code-review` und `Orchestrator` enthält — Test 3 wird grün. Danach ist der bisherige T002272-M2-Guard in `tests/spec/ci-cd.bats` rot (sein Anker lag auf dem entfernten Schritt-5-Auto-Merge-Block) — Task 4 stellt ihn im selben PR um, NICHT als separaten PR.

- [x] **Step 1: Abschnitt Schritt 3.8 ersetzen** (aktuelle Zeilen 159–165: `## Schritt 3.8: Code Review Gate (Mandatory)` samt Inhalt)

Aktuell:

```markdown
## Schritt 3.8: Code Review Gate (Mandatory)

Vor dem PR-Merge muss eine unabhängige Überprüfung stattfinden.
1. Rufe das Skill **`requesting-code-review`** auf (Claude Code — built-in; opencode: nutze
   `pr-review-toolkit:review-pr` oder delegiere an einen Review-Subagenten via `delegate()`),
   um die Änderungen zu auditieren.
2. Behebe alle gefundenen Probleme und stelle sicher, dass der Reviewer "Approved" gibt, bevor du fortfährst.
```

Ersetzen durch (die Überschrift trägt exakt `## Schritt 3.8: Code-Review-Gate` — Guard-Test 3 und T002272-M2 matchen auf sie; der Bash-Block ist der aus dem alten Schritt 5, inkl. T004612-Kommentar):

````markdown
## Schritt 3.8: Code-Review-Gate (Orchestrator, PFLICHT vor Auto-Merge)

**Orchestrator-Schritt, nicht Implementer** — die unabhängige Prüfung braucht einen anderen
Kontext als den Implementer (Self-Attestation ist kein Review, T005307). Ohne bestandenes
Gate gibt es keinen Auto-Merge: fail-closed im Prozess.

1. Rufe das Skill **`requesting-code-review`** auf (Claude Code — built-in; opencode: nutze
   `pr-review-toolkit:review-pr` oder delegiere an einen Review-Subagenten via `delegate()`),
   um die Änderungen zu auditieren.
2. Findings gehen per `SendMessage` an den **bereits gespawnten** Implementer zurück (Muster
   Exit 3/4 aus T002365 — kein neuer Spawn, Doppel-Push-Risiko aus T001408); nach dessen Push
   erneut reviewen.
3. Erst wenn der Reviewer "Approved" gegeben hat, fordere den Auto-Merge an:

```bash
# Auto-Merge sofort anfordern — GitHub merged selbstständig, sobald Required Checks grün sind.
# KEIN --delete-branch (T004612): Schritt 7 (Plan-/OpenSpec-Archiv) braucht den Branch noch —
# gelöscht wird er erst in Schritt 7.5, NACH der Archivierung. delete_branch_on_merge ist
# repo-seitig deaktiviert; verwaiste Branches räumt branch-reaper.sh ab.
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```
````

- [x] **Step 2: Schritt 5 — M1-Lesson anpassen, Auto-Merge-Block entfernen** (aktuelle Zeilen 181–193)

Aktuell:

```markdown
> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren.
> Proposal-Commits auf Feature-Branches triggern den Auto-Merge-Flow und können das Ticket
> vorzeitig schließen (Merge = Abschluss, T001092). Auto-Merge erst enable, wenn mindestens ein
> Implementierungs-Commit auf dem Branch liegt. Zu diesem Zeitpunkt (Schritt 5) ist der
> Implementierungs-Commit bereits gepusht, also ist die Voraussetzung erfüllt.

```bash
# Auto-Merge sofort anfordern — GitHub merged selbstständig, sobald Required Checks grün sind.
# KEIN --delete-branch (T004612): Schritt 7 (Plan-/OpenSpec-Archiv) braucht den Branch noch —
# gelöscht wird er erst in Schritt 7.5, NACH der Archivierung. delete_branch_on_merge ist
# repo-seitig deaktiviert; verwaiste Branches räumt branch-reaper.sh ab.
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```
```

Ersetzen durch (Bash-Block komplett entfernen — der Befehl lebt jetzt in Schritt 3.8):

```markdown
> **⚠️ M1-Lesson (T001899):** Auto-Merge **nicht** vor dem ersten Implementierungs-Push aktivieren.
> Proposal-Commits auf Feature-Branches triggern den Auto-Merge-Flow und können das Ticket
> vorzeitig schließen (Merge = Abschluss, T001092). Der Auto-Merge wird erst im
> Code-Review-Gate angefordert (Schritt 3.8) — zu dem Zeitpunkt liegt der
> Implementierungs-Commit bereits auf dem Branch, die Voraussetzung ist also erfüllt.
```

- [x] **Step 3: Schritt 5.5 — Verweis auf Schritt 3.8 statt Schritt 5** (erster Absatz, aktuelle Zeile 197)

Aktuell (Teilsatz): `Nach der Implementer-Rückmeldung überwacht der Orchestrator CI — Auto-Merge ist bereits angefordert (Schritt 5) und greift, sobald die Required Checks grün sind.`

Ersetzen durch: `Nach der Implementer-Rückmeldung überwacht der Orchestrator CI — Auto-Merge ist bereits angefordert (Schritt 3.8, nach bestandenem Review-Gate) und greift, sobald die Required Checks grün sind.`

- [x] **Step 4: Schritt 6 — Verweis auf Schritt 3.8 statt Schritt 5** (Klammerbemerkung, aktuelle Zeile 213)

Aktuell: `(Auto-Merge wurde bereits in Schritt 5 angefordert — hier läuft nur noch das Gate.)`

Ersetzen durch: `(Auto-Merge wurde bereits in Schritt 3.8 angefordert — hier läuft nur noch das Gate.)`

- [x] **Step 5: Test — alle drei Guard-Tests grün**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/review-gate-before-auto-merge.bats
```

Expected: PASS — alle drei Tests grün (Tests 1+2 aus Task 2, Test 3 neu).

- [x] **Step 6: Bekannten Rot-Zustand dokumentieren** — `tests/spec/ci-cd.bats` T002272-M2 ist jetzt rot (der Anker `^## Schritt 5: PR erstellen` findet den Auto-Merge-Aufruf nicht mehr). Das ist erwartet und wird in Task 4 im selben PR behoben.

- [x] **Step 7: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "fix(skills): enforce review gate before auto-merge [T005565]"
```

### Task 4: T002272-M2-Guard auf den Review-Gate-Anker umstellen

**Files:**
- Modify: `tests/spec/ci-cd.bats` (Test `T002272-M2: dev-flow-execute Step 5 requests auto-merge before the CI-watch loop`)

**Interfaces:**
- Consumes: Task 3 (Code-Review-Gate-Abschnitt mit dem einzigen `gh pr merge --auto`-Aufruf).
- Produces: Den umgestellten Ordnungs-Guard — die Garantie `merge_line < watch_line` (Auto-Merge vor CI-Watch) bleibt unter dem neuen Anker erhalten.

- [x] **Step 1: Testblock ersetzen**

Aktuell:

```bats
@test "T002272-M2: dev-flow-execute Step 5 requests auto-merge before the CI-watch loop" {
  EXEC_SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
  # [T003796] Suche auf den Bereich Schritt 5..5.5 eingeschraenkt: `gh pr merge --auto`
  # steht im Dokument 4x (u.a. im Arbeitsteilungs-Kommentar Zeile 54), `devflow-ci-watch.sh`
  # 3x. Dokumentweites head -1 pickte den Kommentar statt des Step-5-Aufrufs (T003104).
  local step5 watch_line merge_line
  step5="$(grep -n '^## Schritt 5: PR erstellen' "$EXEC_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$step5" ]
  merge_line=$(awk -v s="$step5" 'NR > s && /gh pr merge --auto/ { print NR; exit }' "$EXEC_SKILL")
  watch_line=$(awk -v s="$step5" 'NR > s && /devflow-ci-watch\.sh/ { print NR; exit }' "$EXEC_SKILL")
  [ -n "$merge_line" ] && [ -n "$watch_line" ]
  [ "$merge_line" -lt "$watch_line" ]
}
```

Ersetzen durch (Anker auf das Code-Review-Gate; der einzige `gh pr merge --auto`-Aufruf liegt jetzt in Schritt 3.8, `devflow-ci-watch.sh` folgt in Schritt 5.5):

```bats
@test "T002272-M2: dev-flow-execute review gate requests auto-merge before the CI-watch loop" {
  EXEC_SKILL="$REPO_ROOT/.claude/skills/dev-flow-execute/SKILL.md"
  # [T003796] Suche auf den Bereich Schritt 3.8..5.5 eingeschraenkt: der einzige
  # `gh pr merge --auto`-Aufruf liegt im Code-Review-Gate-Abschnitt (Schritt 3.8),
  # `devflow-ci-watch.sh`-Aufrufe folgen in Schritt 5.5. Ohne den Anker pickte
  # dokumentweites head -1 frueher den Arbeitsteilungs-Kommentar (T003104).
  local gate watch_line merge_line
  gate="$(grep -n '^## Schritt 3.8: Code-Review-Gate' "$EXEC_SKILL" | head -1 | cut -d: -f1)"
  [ -n "$gate" ]
  merge_line=$(awk -v s="$gate" 'NR > s && /gh pr merge --auto/ { print NR; exit }' "$EXEC_SKILL")
  watch_line=$(awk -v s="$gate" 'NR > s && /devflow-ci-watch\.sh/ { print NR; exit }' "$EXEC_SKILL")
  [ -n "$merge_line" ] && [ -n "$watch_line" ]
  [ "$merge_line" -lt "$watch_line" ]
}
```

- [x] **Step 2: Test läuft grün**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
tests/unit/lib/bats-core/bin/bats -f 'T002272-M2' tests/spec/ci-cd.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/review-gate-before-auto-merge.bats
```

Expected: beide Läufe PASS.

- [x] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
git add tests/spec/ci-cd.bats
git commit -m "test(ci): retarget T002272-M2 guard to review gate [T005565]"
```

### Task 5: Verifikation — finale Gates

**Files:**
- Test: gesamte geänderte Fläche (SKILL.md-Guards + ci-cd.bats)

**Interfaces:**
- Consumes: Tasks 1–4 (alle Änderungen committed).

- [x] **Step 1: Geänderte Tests vollständig grün**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills tests/spec/ci-cd.bats
```

Expected: PASS (inklusive der Nachbar-Guards in `tests/spec/agent-skills/`).

- [x] **Step 2: `timeout 600 task test:changed`** — der Gesamtlauf der geänderten Tests, Expected: PASS. Bei Rot: systematisch diagnostizieren (Logs lesen, Fehler eingrenzen, fixen, Re-Test) — keine Hintergrund-Monitore (T001969).

- [x] **Step 3: `task freshness:regenerate`** — generierte Artefakte (u.a. `website/src/data/test-inventory.json`) aktualisieren; bei Drift die generierten Dateien stagen und committen (Artefakt-Liste: verification-block.md).

- [x] **Step 4: `task freshness:check`** — Expected: PASS (stale-artifact-Guard der CI).

- [x] **Step 5: Commit offener Freshness-Artefakte, falls in Step 3 entstanden**

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/review-gate-enforce
git add -u && git commit -m "chore(scripts): regenerate freshness artifacts [T005565]"
```

Falls Step 3 nichts geändert hat, entfällt dieser Schritt (nichts zu committen — nicht `git add -A` erzwingen).
