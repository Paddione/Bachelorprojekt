---
title: "agentic-skillmd-size — Implementation Plan"
ticket_id: T002094
domains: [agentic-tooling, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agentic-skillmd-size — Implementation Plan

_Ticket: T002094_

## File Structure

```
tests/spec/agentic-tooling-quality-goals.bats           (edit — new G-AGENTIC09 @test, already RED)
.claude/skills/dev-flow-plan/SKILL.md                    (edit — 526 → target ≤495 lines)
.claude/skills/dev-flow-execute/SKILL.md                 (edit — 568 → target ≤495 lines)
.claude/skills/references/plan-artifact-level.md         (new — PRD-vs-Change-Proposal decision table)
.claude/skills/references/ticket-preflight-lock.md       (new — dev-flow-execute Schritt −1 mechanics)
.claude/skills/references/plan-archive-steps.md          (new — dev-flow-execute Schritt 7 archive mechanics)
.claude/skills/references/ci-fix-loop.md                 (edit — append PR-merge-wait subsection)
website/src/lib/goals-data.generated.json                (regenerate — freshness artifact)
```

## Task 1 — Failing test (RED)

Add a `G-AGENTIC09` `@test` to `tests/spec/agentic-tooling-quality-goals.bats` (SSOT:
`openspec/specs/agentic-tooling-quality-goals.md`, Requirement G-AGENTIC09) that runs the
exact measurement command from `.claude/lib/goals.md` and asserts the output is `0`:

```bash
@test "G-AGENTIC09: zero SKILL.md files exceed 500 lines" {
  local count
  count=$(find "$REPO/.claude/skills" -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}')
  [ "$count" -eq 0 ]
}
```

Run it against the unmodified worktree to confirm it fails:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agentic-tooling-quality-goals.bats -f "G-AGENTIC09"
# expected: FAIL (count=2 — dev-flow-plan/SKILL.md 526 lines, dev-flow-execute/SKILL.md 568 lines)
```

This step is already done in the worktree (uncommitted); the implementer commits it as part
of Task 1 alongside the rest of this plan's diff, not as a separate pre-existing commit.

## Task 2 — Extract `dev-flow-plan/SKILL.md` verbose/duplicated blocks

Two extractions, no content loss — only relocation + `file://` pointer, per the T001904
precedent:

**2a. Remove the duplicated plan-lint Hard Rules "Kurzfassung"** (current lines 266–299,
the block starting `- **plan-lint Hard Rules (PFLICHT ...)** ... - **B1b Split/Shrink ...`).
This block is a byte-for-byte content duplicate of `.claude/skills/references/plan-quality-gates.md`
§"plan-lint Hard Rules" (lines 95–124 there) — that file is already the declared SSOT one
sentence above the duplicated block (`"Vollständige SSOT in plan-quality-gates.md §plan-lint"`).
Replace the ~34-line Kurzfassung with:

```markdown
    - **plan-lint Hard Rules (PFLICHT — vom Subagenten verbatim zu befolgen):**
      SSOT: [plan-quality-gates](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-quality-gates.md)
      §"plan-lint Hard Rules" — der Subagent MUSS die Datei lesen (F1/F2/STRUCT1–3/P1/B1a/B1b)
      und die tasks.md dagegen schreiben (`scripts/plan-lint.sh` ist das maschinelle Gate dazu).
```

Net: ~34 lines removed, ~4 lines added → **−30 lines**.

**2b. Extract the "Artefakt-Ebene: braucht der Request ein PRD davor?" section** (current
lines 69–95: the intro paragraph, the "Gestalt der Arbeit"-table, and the PRD-Checkliste) into
a new file `.claude/skills/references/plan-artifact-level.md` verbatim (same table, same
checklist, same Faustregel note). Replace the section in `SKILL.md` with:

```markdown
### Artefakt-Ebene: braucht der Request ein PRD davor?
Die feature/fix/chore-Wahl oben ist die *Pfad*-Wahl durch diese Skill; davor steht die
*Artefakt*-Wahl (PRD vs. ADR vs. Change-Proposal vs. Chore-Ticket). Entscheidungstabelle +
PRD-Checkliste: [plan-artifact-level](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-artifact-level.md).
```

Net: ~27 lines removed from `SKILL.md`, ~4 lines added → **−23 lines**; new reference file
gains the full ~27-line table+checklist content (verbatim, no loss).

**Task 2 target:** `dev-flow-plan/SKILL.md` 526 → **≤495 lines** (estimated ~473 after both
extractions — verify with `wc -l` after editing, do not guess; if still >495, apply the same
pattern to the next-largest paragraph, e.g. Schritt 6 "Optionaler Plan-Review").

## Task 3 — Extract `dev-flow-execute/SKILL.md` verbose blocks

Three extractions, same no-content-loss rule:

**3a. Extract "Schritt −1: Pre-Flight — Ticket-Lock & Status"** (current lines 41–107:
sub-steps −1.0 through −1.3, the T002038-M1/M2/M3 mechanics) into a new file
`.claude/skills/references/ticket-preflight-lock.md` verbatim (keep the full bash blocks —
`check-and-claim`, exit-code case statement, `agent-msg.sh post` broadcast). Replace the
section in `SKILL.md` with a condensed version that keeps only the operative command
sequence and a pointer for the exit-code semantics:

```markdown
## Schritt −1: Pre-Flight — Ticket-Lock & Status (vor allen Git-Operationen) [T002038]
Vor jeder Git-Operation MUSS das Ticket atomisch geclaimed werden (verhindert die Race
zwischen dev-flow-execute und der Factory-Pipeline — Claim VOR dem ersten Factory-Check).
Vollständige Mechanik (Status-Check, `check-and-claim`, Exit-Code-Semantik, Broadcast):
[ticket-preflight-lock](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-preflight-lock.md).
```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID" 2>/dev/null || echo '{}')
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
bash scripts/agent-lock.sh check-and-claim ticket "$TICKET_ID" --branch "$CURRENT_BRANCH" --label dev-flow-execute \
  || { echo "🛑 siehe ticket-preflight-lock.md für Exit-Code-Behandlung"; exit 1; }
bash scripts/agent-msg.sh post "dev-flow-execute startet Arbeit an Ticket $TICKET_ID" --to all
```
```

Net: ~67 lines removed, ~12 lines added → **−55 lines**.

**3b. Extract "Schritt 6.4: Warte auf PR-Merge"** (current lines 391–431: the `while true`
polling loop against `gh pr view --json mergeStateStatus,state`) into the *existing*
`.claude/skills/references/ci-fix-loop.md` as a new subsection ("PR-Merge-Wait-Loop") —
thematically it belongs with the rest of the CI/merge flow already documented there. Keep
the full bash loop verbatim (unchanged) in the reference file — no new script is introduced,
this is a pure relocation. Replace the section in `SKILL.md` with a condensed pointer that
still gives the executing agent a copy-pasteable one-liner for the common case, deferring the
full timeout/state-handling loop to the reference:

```markdown
## Schritt 6.4: Warte auf PR-Merge (vor Ticket-Abschluss)
`gh pr merge --auto` kehrt sofort zurück — der Merge passiert asynchron. Warte, bis er
tatsächlich durch ist, bevor das Ticket geschlossen wird (vermeidet Ticket=done bei
PR=OPEN+CONFLICTING Drift, Mishap T001149-M1). Voller Poll-Loop mit Timeout/State-Handling
(`MERGED`/`CLOSED`/Timeout-Exit-Codes): [ci-fix-loop](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ci-fix-loop.md)
§"PR-Merge-Wait-Loop" — der Subagent MUSS die Datei lesen und den Loop von dort ausführen
(nicht aus dem Gedächtnis rekonstruieren).
```

Net: ~41 lines removed, ~9 lines added → **−32 lines**.

**3c. Extract "Schritt 7: Plan & OpenSpec archivieren"** (current lines 457–515: frontmatter
status flip, `archive_plan`/`ticket.sh archive-plan`, `openspec.sh archive`, the archive-PR
push-verification + PR-creation-verification blocks) into a new file
`.claude/skills/references/plan-archive-steps.md` verbatim. Replace the section in `SKILL.md`
with:

```markdown
## Schritt 7: Plan & OpenSpec archivieren
Zwei Schritte: (1) `tasks.md` nach postgres (`ticket-mcp` `archive_plan` bzw.
`ticket.sh archive-plan`), (2) der gesamte OpenSpec-Change-Ordner ins Archiv via
`scripts/openspec.sh archive` — inkl. Push-Verification (T001268) und
PR-Creation-Verification (T001331). Vollständige Mechanik (MCP-first + Fallback-Befehle,
exakte `sed`/`git`/`gh`-Sequenz — der Subagent MUSS diese Datei lesen und Schritt für
Schritt befolgen, nicht raten):
[plan-archive-steps](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-archive-steps.md).
```

Net: ~59 lines removed, ~11 lines added → **−48 lines**.

**Task 3 target:** `dev-flow-execute/SKILL.md` 568 → **≤495 lines** (estimated ~433 after all
three extractions — verify with `wc -l` after editing).

## Task 4 — Regenerate freshness artifacts

`website/src/lib/goals-data.generated.json` embeds the G-AGENTIC09 count via
`node scripts/gen-goals-data.mjs` — regenerate it after Task 1–3 land so the Kore homepage
timeline / goals dashboard reflects the new `0` count instead of the stale `2`.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Task 1's `G-AGENTIC09` BATS test fails on the unmodified
      branch (count=2).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agentic-tooling-quality-goals.bats -f "G-AGENTIC09"
# expected: FAIL (count=2 before Task 2/3 land)
```

- [ ] **Fix-Step (GREEN).** After Task 2 and Task 3 land, re-run the same test — it must pass
      (count=0). Also re-run the exact `.claude/lib/goals.md` measurement command manually to
      cross-check:

```bash
find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
# expect: 0
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
