# Agent Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zentrale Library unter `.claude/lib/` mit Behavior-Fragmenten und Prompt-Snippets, die von allen 6 Agenten via Runtime-`Read`-Aufrufen eingebunden werden.

**Architecture:** Markdown-Fragmente in `.claude/lib/behaviors/` und `.claude/lib/prompts/` werden vom jeweiligen Agenten explizit am Session-Start gelesen. Jede `.claude/agents/*.md`-Datei bekommt einen `## Library`-Abschnitt nach dem Frontmatter. Kein Build-Schritt, keine Generierung — reines Runtime-Include.

**Tech Stack:** Markdown, BATS (Strukturtests), Bash (Validierung)

## Global Constraints

- Alle Fragmente unter `.claude/lib/` — nie woanders
- `## Library`-Abschnitt direkt nach dem schließenden `---` des Frontmatter, vor dem Fließtext
- Agents referenzieren **nur** die für ihre Domäne relevanten Fragmente (Mapping: siehe Spec)
- Factory-Prompts unter `scripts/factory/` bleiben unverändert — nur Snippets werden extrahiert
- Neue BATS-Tests gehören in `tests/spec/agent-library.bats` (Convention: eine Datei pro OpenSpec-Spec)
- Commit nach jedem Task

---

## File Map

| Status | Pfad | Zweck |
|---|---|---|
| Create | `.claude/lib/behaviors/never-push-main.md` | Regel: Nie direkt auf main pushen |
| Create | `.claude/lib/behaviors/inject-plan-context.md` | plan-context.sh vor Dispatch |
| Create | `.claude/lib/behaviors/tool-use-safety.md` | Reversibility-Check vor destruktiven Ops |
| Create | `.claude/lib/behaviors/commit-conventions.md` | squash-merge, branch-naming, Co-Authored-By |
| Create | `.claude/lib/prompts/review-lens-format.md` | HARD CONSTRAINT Block für Review-Lenses |
| Create | `.claude/lib/prompts/diff-analysis-context.md` | Diff-Scope Boilerplate |
| Create | `.claude/lib/prompts/review-coordinator.md` | Koordinations-Logik Consolidation-Agent |
| Create | `.claude/lib/README.md` | Navigierbarer Index aller Fragmente |
| Create | `tests/spec/agent-library.bats` | Strukturtests: Dateien existieren, Agents verdrahtet |
| Modify | `.claude/agents/bachelorprojekt-infra.md` | `## Library` section hinzufügen |
| Modify | `.claude/agents/bachelorprojekt-db.md` | `## Library` section hinzufügen |
| Modify | `.claude/agents/bachelorprojekt-website.md` | `## Library` section hinzufügen |
| Modify | `.claude/agents/bachelorprojekt-ops.md` | `## Library` section hinzufügen |
| Modify | `.claude/agents/bachelorprojekt-test.md` | `## Library` section hinzufügen |
| Modify | `.claude/agents/bachelorprojekt-security.md` | `## Library` section hinzufügen |

---

## Task 1: BATS-Test schreiben (TDD-Gate)

**Files:**
- Create: `tests/spec/agent-library.bats`

**Interfaces:**
- Produces: BATS-Testfile das in Tasks 2–4 grün wird

- [ ] **Step 1: Test schreiben**

```bash
# tests/spec/agent-library.bats
#!/usr/bin/env bats

@test "all behavior fragment files exist" {
  for f in \
    ".claude/lib/behaviors/never-push-main.md" \
    ".claude/lib/behaviors/inject-plan-context.md" \
    ".claude/lib/behaviors/tool-use-safety.md" \
    ".claude/lib/behaviors/commit-conventions.md"; do
    [ -f "$f" ] || { echo "MISSING: $f"; return 1; }
  done
}

@test "all prompt snippet files exist" {
  for f in \
    ".claude/lib/prompts/review-lens-format.md" \
    ".claude/lib/prompts/diff-analysis-context.md" \
    ".claude/lib/prompts/review-coordinator.md"; do
    [ -f "$f" ] || { echo "MISSING: $f"; return 1; }
  done
}

@test "README.md index exists and lists all fragments" {
  [ -f ".claude/lib/README.md" ]
  for entry in \
    "behaviors/never-push-main.md" \
    "behaviors/inject-plan-context.md" \
    "behaviors/tool-use-safety.md" \
    "behaviors/commit-conventions.md" \
    "prompts/review-lens-format.md" \
    "prompts/diff-analysis-context.md" \
    "prompts/review-coordinator.md"; do
    grep -q "$entry" ".claude/lib/README.md" || { echo "README missing entry: $entry"; return 1; }
  done
}

@test "all agents have a Library section" {
  for agent in .claude/agents/bachelorprojekt-*.md; do
    grep -q "^## Library" "$agent" || { echo "MISSING Library section in: $agent"; return 1; }
  done
}

@test "all library paths referenced in agents actually exist" {
  for agent in .claude/agents/bachelorprojekt-*.md; do
    while IFS= read -r line; do
      if [[ "$line" =~ ^-\ \.claude/lib/ ]]; then
        path="${line#- }"
        [ -f "$path" ] || { echo "DEAD LINK in $agent: $path"; return 1; }
      fi
    done < "$agent"
  done
}
```

- [ ] **Step 2: Test ausführen — erwartet FAIL**

```bash
cd /home/patrick/Bachelorprojekt
bats tests/spec/agent-library.bats
```

Erwartet: Alle 5 Tests **FAIL** (Dateien existieren noch nicht).

- [ ] **Step 3: Commit**

```bash
git add tests/spec/agent-library.bats
git commit -m "test(agent-library): BATS structural tests for library fragments and agent wiring"
```

---

## Task 2: Behavior-Fragmente erstellen

**Files:**
- Create: `.claude/lib/behaviors/never-push-main.md`
- Create: `.claude/lib/behaviors/inject-plan-context.md`
- Create: `.claude/lib/behaviors/tool-use-safety.md`
- Create: `.claude/lib/behaviors/commit-conventions.md`

**Interfaces:**
- Produces: 4 Markdown-Fragmente die von Agenten per `Read` geladen werden

- [ ] **Step 1: `never-push-main.md` erstellen**

Datei `.claude/lib/behaviors/never-push-main.md`:

```markdown
# Behavior: Nie direkt auf main pushen

**HARD RULE:** Commits direkt auf `main` und `git push origin main` sind verboten.

Alle Änderungen laufen über Pull Requests:
1. Feature-Branch erstellen: `git checkout -b feature/<slug>` (oder `fix/*`, `chore/*`)
2. Auf dem Branch arbeiten und committen
3. Branch pushen und PR öffnen: `commit-commands:commit-push-pr` Skill oder `gh pr create`
4. Mergen erst wenn CI grün und PR approved ist: `gh pr merge <N> --squash --auto`

**In Worktrees arbeiten** (bevorzugt):
```bash
bash scripts/worktree-create.sh <branch> tmp/wt-<slug>
```
Die `dev-flow-plan`- und `using-git-worktrees`-Skills automatisieren das.

**Pre-commit-Hook feuert mit "main-checkout locked":** Eine andere Session hält den main-Lock.
Lösung: In einem Worktree arbeiten, nicht Force-pushen.
```

- [ ] **Step 2: `inject-plan-context.md` erstellen**

Datei `.claude/lib/behaviors/inject-plan-context.md`:

```markdown
# Behavior: Plan-Kontext vor Agent-Dispatch injizieren

Vor dem Dispatch eines Sub-Agenten den aktiven Plan-Kontext injizieren:

```bash
context=$(bash scripts/plan-context.sh <role> --with-openspec)
if [[ -n "$context" ]]; then
  prompt="<active-plans>\n${context}\n</active-plans>\n\n${task_prompt}"
fi
```

`<role>` durch die Domäne des Agenten ersetzen: `infra`, `website`, `db`, `ops`, `test`, `security`.

`--with-openspec` lädt automatisch die SSOT-Spec(s) für alle Dateien die sich vs. main geändert haben.
Nur weglassen wenn explizit angewiesen, OpenSpec-Kontext zu überspringen.

Der `<active-plans>`-Block ist für das aktuelle Feature autoritativ — er überschreibt Annahmen
aus dem Gedächtnis oder aus git-log.
```

- [ ] **Step 3: `tool-use-safety.md` erstellen**

Datei `.claude/lib/behaviors/tool-use-safety.md`:

```markdown
# Behavior: Tool-Use-Sicherheit — Reversibility vor Aktion

Vor jeder destruktiven oder schwer umkehrbaren Operation prüfen:

1. **Blast Radius**: Wie viele Dinge können brechen?
2. **Reversibilität**: Kann das in unter 5 Minuten rückgängig gemacht werden?
3. **Shared State**: Betrifft das Systeme außerhalb der lokalen Umgebung?

**Immer bestätigen lassen vor:**
- Dateien, Branches, Secrets, Datenbankzeilen löschen
- `kubectl delete`, `kubectl apply` auf Prod-Clustern (`ENV=mentolder` oder `ENV=korczewski`)
- `git reset --hard`, `git restore`, `git checkout --`
- `rm -rf`, Überschreiben uncommitteter Änderungen
- Force-Push auf irgendeinen Branch

**Nie überspringen:** `--no-verify`, `--no-gpg-sign` — Root Cause fixen statt Hook umgehen.

**Cluster-Targeting:** Vor jedem `task workspace:*`-Kommando sicherstellen dass `ENV=` explizit
gesetzt ist. Fehlendes `ENV=` deployt stillschweigend in dev.

**Nach einem `git commit` kein `git restore`/`git reset`:** Der security-guidance-Plugin
feuert einen async Review nach jedem Commit. Die korrekte Reaktion auf einen Rewake ist,
Findings zu acknowledgen oder ein Follow-up-Ticket zu öffnen — nie den Commit rückgängig machen.
```

- [ ] **Step 4: `commit-conventions.md` erstellen**

Datei `.claude/lib/behaviors/commit-conventions.md`:

```markdown
# Behavior: Commit- und Branch-Konventionen

## Branch-Naming
- Features: `feature/<slug>`
- Bug-Fixes: `fix/<slug>`
- Wartung/Chores: `chore/<slug>`

## Commit-Messages
Conventional-Commits-Format: `type(scope): kurze Beschreibung`

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`

Immer anhängen (HEREDOC-Form):
```bash
git commit -m "$(cat <<'EOF'
type(scope): beschreibung

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<id>
EOF
)"
```

## PR-Merge-Strategie
**Immer Squash-and-Merge** für saubere `main`-History:
```bash
gh pr merge <N> --squash --auto
```

Nach PR-Erstellung keine weiteren Commits hinzufügen — auto-merge erledigt das.

## Worktrees bevorzugen
```bash
bash scripts/worktree-create.sh <branch> tmp/wt-<slug>
```
Worktrees laufen in `/tmp/` (kurzlebig). Nach Merge aufräumen:
```bash
bash scripts/worktree-create.sh --cleanup tmp/wt-<slug>
```
```

- [ ] **Step 5: Tests laufen lassen — behavior tests müssen jetzt PASS sein**

```bash
bats tests/spec/agent-library.bats --filter "behavior fragment"
```

Erwartet: Test 1 (`all behavior fragment files exist`) **PASS**.

- [ ] **Step 6: Commit**

```bash
git add .claude/lib/behaviors/
git commit -m "feat(agent-library): add 4 behavior fragments (never-push-main, inject-plan-context, tool-use-safety, commit-conventions)"
```

---

## Task 3: Prompt-Snippets erstellen

**Files:**
- Create: `.claude/lib/prompts/review-lens-format.md`
- Create: `.claude/lib/prompts/diff-analysis-context.md`
- Create: `.claude/lib/prompts/review-coordinator.md`

**Interfaces:**
- Consumes: Bestehende `scripts/factory/*.prompt.md` (als Referenz für zu extrahierende Inhalte)
- Produces: 3 Prompt-Snippets als wiederverwendbare Bausteine

- [ ] **Step 1: `review-lens-format.md` erstellen**

Datei `.claude/lib/prompts/review-lens-format.md` (extrahiert aus dem HARD CONSTRAINT Block in allen `review-*.prompt.md`):

```markdown
# Prompt Snippet: Review Lens Hard Constraints

## HARD CONSTRAINT — BEFORE REVIEWING

- **ONLY** report findings on lines that are marked with `+` in the diff. Lines
  shown as unchanged context (` `) or removed (`-`) are FORBIDDEN as finding targets.
  If a chunk of context code looks buggy but the diff does not change it, do NOT flag it.
- **NEVER** report style, naming, formatting, whitespace, indentation, typos, or
  cosmetic issues — those have zero behavioral impact and are discarded automatically.
- Every finding MUST include a numeric `confidence` field (0.0–1.0). If you are
  uncertain, assign a LOW confidence rather than omitting the field. Findings
  without confidence or with confidence < 0.6 may be automatically discarded.

---
*Source: `.claude/lib/prompts/review-lens-format.md` — included verbatim at the top of each review lens prompt.*
```

- [ ] **Step 2: `diff-analysis-context.md` erstellen**

Datei `.claude/lib/prompts/diff-analysis-context.md`:

```markdown
# Prompt Snippet: Diff Analysis Scope

Review the provided git diff. The user message lists the EXACT changed line
ranges per file — confine your findings to those lines.

- Lines marked with `+` — new/changed lines — ONLY valid finding targets
- Lines marked with ` ` (space) — unchanged context — do NOT flag
- Lines marked with `-` — removed lines — do NOT flag

---
*Source: `.claude/lib/prompts/diff-analysis-context.md` — include at the top of the Review Scope section in lens prompts.*
```

- [ ] **Step 3: `review-coordinator.md` erstellen**

Datei `.claude/lib/prompts/review-coordinator.md` (extrahiert aus `scripts/factory/review-coordinator.prompt.md`):

```markdown
# Prompt Snippet: Review Coordinator — Consolidation Logic

## Role
You are the lead reviewer consolidating outputs from multiple specialist lenses
into ONE calibrated verdict.

A deterministic pre-filter has already been applied before you see the findings:
out-of-diff findings, low-confidence findings (below threshold), and pure
style/nitpick findings have been removed. You receive only the surviving findings.
Your reasonableness filter is the second line of defense.

## Consolidation Steps

1. **Deduplicate**: the same file+line+issue reported by multiple lenses appears ONCE,
   placed in the most appropriate category.
2. **Re-categorize**: a performance issue reported by the bug lens belongs in the
   performance section, etc.
3. **Reasonableness filter**: remove findings that are technically valid but practically
   irrelevant (e.g., a "null check missing" on a value that is always initialized by
   the framework).
4. **Severity calibration**: if multiple lenses disagree on severity, use the highest
   well-reasoned one.

## Input Format
```xml
<reviews>
  <lens name="bug">{ ...bug-hunter JSON... }</lens>
  <lens name="security">{ ...security-auditor JSON... }</lens>
  <lens name="pattern">{ ...pattern-enforcer JSON... }</lens>
  <lens name="perf">{ ...perf-reviewer JSON... }</lens>
  <lens name="agents-md">{ ...staleness JSON... }</lens>
</reviews>
```
Some lenses may be missing (an agent died) — work with what is present.

---
*Source: `.claude/lib/prompts/review-coordinator.md` — include in `scripts/factory/review-coordinator.prompt.md` as reference.*
```

- [ ] **Step 4: Tests laufen lassen — prompt snippet tests PASS**

```bash
bats tests/spec/agent-library.bats --filter "prompt snippet"
```

Erwartet: Test 2 (`all prompt snippet files exist`) **PASS**.

- [ ] **Step 5: Commit**

```bash
git add .claude/lib/prompts/
git commit -m "feat(agent-library): add 3 prompt snippets (review-lens-format, diff-analysis-context, review-coordinator)"
```

---

## Task 4: README-Index erstellen

**Files:**
- Create: `.claude/lib/README.md`

**Interfaces:**
- Consumes: alle 7 Fragment-Dateien aus Tasks 2+3
- Produces: navigierbarer Index aller Fragmente

- [ ] **Step 1: README erstellen**

Datei `.claude/lib/README.md`:

```markdown
# Agent Library

Zentrale Bibliothek wiederverwendbarer Fragmente für Agenten-Definitionen und Prompts.
Fragmente werden via Runtime-`Read` eingebunden — kein Build-Schritt nötig.

## Behaviors

Verhaltensregeln für Agent-Definitionen (`.claude/agents/*.md`).
Jeder Agent liest nur die für seine Domäne relevanten Fragmente.

| Fragment | Zweck | Referenziert von |
|---|---|---|
| [`behaviors/never-push-main.md`](../../../.claude/lib/behaviors/never-push-main.md) | Kein direkter Push auf main, immer PRs | alle 6 Agenten |
| [`behaviors/inject-plan-context.md`](../../../.claude/lib/behaviors/inject-plan-context.md) | plan-context.sh vor Agent-Dispatch injizieren | infra, website, db, test, security |
| [`behaviors/tool-use-safety.md`](../../../.claude/lib/behaviors/tool-use-safety.md) | Reversibility-Check vor destruktiven Operationen | infra, db, ops, security |
| [`behaviors/commit-conventions.md`](../../../.claude/lib/behaviors/commit-conventions.md) | squash-merge, branch-naming, Co-Authored-By | infra, website, test |

## Prompts

Wiederverwendbare Prompt-Bausteine für Factory-Prompts und LLM-Aufrufe.

| Fragment | Zweck | Referenziert von |
|---|---|---|
| [`prompts/review-lens-format.md`](../../../.claude/lib/prompts/review-lens-format.md) | HARD CONSTRAINT Block für Review-Lenses | factory review-prompts |
| [`prompts/diff-analysis-context.md`](../../../.claude/lib/prompts/diff-analysis-context.md) | Diff-Scope Boilerplate (nur `+`-Zeilen) | factory lenses |
| [`prompts/review-coordinator.md`](../../../.claude/lib/prompts/review-coordinator.md) | Koordinations-Logik Consolidation-Agent | factory coordinator |

## Wachstumsprinzip

1. Neues Fragment schreiben
2. In relevante Agenten-Definitionen eintragen (unter `## Library`)
3. Hier im README verlinken

Wenn ein Behavior in zwei oder mehr Agenten vorkommt: extrahieren, nicht kopieren.

## Agent-zu-Fragment-Mapping

| Agent | Behavior-Fragmente |
|---|---|
| `bachelorprojekt-infra` | never-push-main, inject-plan-context, tool-use-safety, commit-conventions |
| `bachelorprojekt-db` | never-push-main, inject-plan-context, tool-use-safety |
| `bachelorprojekt-website` | never-push-main, inject-plan-context, commit-conventions |
| `bachelorprojekt-ops` | never-push-main, tool-use-safety |
| `bachelorprojekt-test` | never-push-main, inject-plan-context, commit-conventions |
| `bachelorprojekt-security` | never-push-main, tool-use-safety |
```

- [ ] **Step 2: Test 3 laufen lassen — README-Test PASS**

```bash
bats tests/spec/agent-library.bats --filter "README"
```

Erwartet: Test 3 (`README.md index exists and lists all fragments`) **PASS**.

- [ ] **Step 3: Commit**

```bash
git add .claude/lib/README.md
git commit -m "feat(agent-library): add README index for all library fragments"
```

---

## Task 5: Library-Abschnitte in alle 6 Agenten eintragen

**Files:**
- Modify: `.claude/agents/bachelorprojekt-infra.md` (nach dem schließenden `---` des Frontmatter)
- Modify: `.claude/agents/bachelorprojekt-db.md`
- Modify: `.claude/agents/bachelorprojekt-website.md`
- Modify: `.claude/agents/bachelorprojekt-ops.md`
- Modify: `.claude/agents/bachelorprojekt-test.md`
- Modify: `.claude/agents/bachelorprojekt-security.md`

**Interfaces:**
- Consumes: alle 4 Behavior-Fragmente aus Task 2
- Produces: 6 aktualisierte Agent-Definitionen mit Runtime-Include-Instruktion

- [ ] **Step 1: `bachelorprojekt-infra.md` aktualisieren**

Nach dem schließenden `---` des Frontmatter (Zeile 9, vor "You are an infrastructure specialist...") einfügen:

```markdown
## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/inject-plan-context.md`
- `.claude/lib/behaviors/tool-use-safety.md`
- `.claude/lib/behaviors/commit-conventions.md`

---
```

- [ ] **Step 2: `bachelorprojekt-db.md` aktualisieren**

Nach dem schließenden `---` des Frontmatter einfügen:

```markdown
## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/inject-plan-context.md`
- `.claude/lib/behaviors/tool-use-safety.md`

---
```

- [ ] **Step 3: `bachelorprojekt-website.md` aktualisieren**

Nach dem schließenden `---` des Frontmatter einfügen:

```markdown
## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/inject-plan-context.md`
- `.claude/lib/behaviors/commit-conventions.md`

---
```

- [ ] **Step 4: `bachelorprojekt-ops.md` aktualisieren**

Nach dem schließenden `---` des Frontmatter einfügen:

```markdown
## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/tool-use-safety.md`

---
```

- [ ] **Step 5: `bachelorprojekt-test.md` aktualisieren**

Nach dem schließenden `---` des Frontmatter einfügen:

```markdown
## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/inject-plan-context.md`
- `.claude/lib/behaviors/commit-conventions.md`

---
```

- [ ] **Step 6: `bachelorprojekt-security.md` aktualisieren**

Nach dem schließenden `---` des Frontmatter einfügen:

```markdown
## Library

At the start of every session, read these library fragments before doing anything else:
- `.claude/lib/behaviors/never-push-main.md`
- `.claude/lib/behaviors/tool-use-safety.md`

---
```

- [ ] **Step 7: Alle BATS-Tests laufen lassen — alle 5 müssen PASS sein**

```bash
bats tests/spec/agent-library.bats
```

Erwartet:
```
 ✓ all behavior fragment files exist
 ✓ all prompt snippet files exist
 ✓ README.md index exists and lists all fragments
 ✓ all agents have a Library section
 ✓ all library paths referenced in agents actually exist

5 tests, 0 failures
```

- [ ] **Step 8: CI-Offline-Tests laufen lassen**

```bash
bash scripts/vda.sh oracle --dry-run 'run all offline tests'
# dann ausführen:
task test:all
```

Erwartet: kein roter Test.

- [ ] **Step 9: Commit**

```bash
git add .claude/agents/
git commit -m "feat(agent-library): wire ## Library runtime-include sections into all 6 agents"
```

---

## Self-Review

**Spec-Coverage:**
- ✅ `.claude/lib/` Struktur mit `behaviors/` + `prompts/` — Task 2+3
- ✅ 4 Behavior-Fragmente — Task 2
- ✅ 3 Prompt-Snippets — Task 3
- ✅ `## Library` Section in allen 6 Agenten — Task 5
- ✅ README-Index — Task 4
- ✅ Agent-zu-Fragment-Mapping laut Spec-Tabelle — Task 5
- ✅ Factory-Prompts bleiben unverändert — kein Task dafür (explizit Out-of-Scope in Spec)
- ✅ Strukturtests (BATS) — Task 1

**Placeholder-Scan:** Keine TBDs. Alle Datei-Inhalte vollständig ausgeschrieben.

**Typ-Konsistenz:** Alle Pfade (`behaviors/never-push-main.md` etc.) konsistent in BATS-Test, README und Agent-Library-Sections.
