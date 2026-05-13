---
title: dev-flow Skill Implementation Plan
domains: []
status: active
pr_number: null
---

# dev-flow Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a project-level Claude Code skill (`dev-flow`) at `.claude/skills/dev-flow/SKILL.md` that codifies our shared dev process and auto-invokes on every work request in this repo.

**Architecture:** Single `SKILL.md` file (German content, English git artifacts) acting as a thin orchestrator over existing `superpowers:*` skills. CLAUDE.md gets a one-line pointer so the routing context references it.

**Tech Stack:** Markdown only. No code, no tests beyond `task test:all` (the chore-path verification floor).

**Spec reference:** `docs/superpowers/specs/2026-05-13-dev-flow-skill-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `.claude/skills/dev-flow/SKILL.md` | Create | The skill itself — frontmatter + path-router + three-path content |
| `CLAUDE.md` | Modify | Add a "Default workflow" pointer near the agent-routing section |

No other files touched. No tests added (chore path).

---

## Task 1: Create the dev-flow SKILL.md

**Files:**
- Create: `.claude/skills/dev-flow/SKILL.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p .claude/skills/dev-flow
```

- [ ] **Step 2: Write SKILL.md with the exact content below**

Write `.claude/skills/dev-flow/SKILL.md` with this content verbatim:

````markdown
---
name: dev-flow
description: Verwende immer wenn jemand in diesem Repo eine neue Funktion hinzufügen, einen Bug beheben oder eine Änderung machen will. Definiert unseren gemeinsamen Entwicklungsablauf — Pfade für Feature/Fix/Chore, Worktree-Isolation, Conventional-Commit-PRs, Post-Merge-Deploy auf beide Prod-Cluster.
---

# dev-flow — Unser gemeinsamer Entwicklungsablauf

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will: neue Funktion, Bug fixen, Doku updaten, Dependencies bumpen, was auch immer.

**Sage zu Beginn:** "Ich nutze die dev-flow Skill für unseren Standard-Ablauf."

## Schritt 0: Pfad bestimmen

Lies die Anfrage und schlage einen der drei Pfade vor. Bestätigung beim User einholen, BEVOR du weitermachst.

| Pfad | Wann |
|---|---|
| **feature** | Neues Verhalten, neuer Endpunkt, neue UI-Sektion, neuer Task — alles was Nutzer bemerken |
| **fix** | Etwas ist kaputt; Output/Verhalten passt nicht zur Erwartung. **Erfordert ein BR-* Ticket.** |
| **chore** | Keine Verhaltensänderung für Nutzer — Dependency-Bumps, Refactors, Doku/Kommentar-Updates, Config/CI-Tweaks |

Sage z.B.: "Das klingt nach einem **fix** — wir reparieren ein bestehendes Verhalten. Passt das? Hast du eine BR-* Ticket-ID?"

## Schritt 1: Worktree anlegen

Rufe `superpowers:using-git-worktrees` auf. Branch-Name folgt dem Schema `<pfad>/<kurzer-slug>`:

- `feature/solo-replay`
- `fix/sse-connection-header`
- `chore/bump-astro`

Slug ist kurz und beschreibend. KEIN BR-* in den Branchnamen — das gehört in die PR-Beschreibung.

## Schritt 2: Den passenden Pfad ausführen

### Feature-Pfad

1. **Brainstorming.** Rufe `superpowers:brainstorming` auf. Ergibt eine Spec in `docs/superpowers/specs/`.
2. **Plan.** Rufe `superpowers:writing-plans` auf. Ergibt einen Plan in `docs/superpowers/plans/`.
3. **Frontmatter-Hook.** Führe aus: `bash scripts/plan-frontmatter-hook.sh <plan-datei>` (Pflicht laut CLAUDE.md).
4. **Implementation.** Bevorzugt: `superpowers:subagent-driven-development` (parallele Agents, schnell). Alternative: `superpowers:executing-plans` (sequenziell).
   - Backend / Skripte / k8s-Logik: TDD via `superpowers:test-driven-development`.
   - UI-Arbeit: `frontend-design` Skill + Playwright Smoke Tests.
5. **Lokale Verifikation.** Führe in dieser Reihenfolge aus:

   ```bash
   task workspace:validate
   ./tests/runner.sh local <FA-XX oder SA-XX oder NFA-XX>   # falls relevant
   task test:all
   ```

6. **PR.** Rufe `commit-commands:commit-push-pr` auf.
   - Titel: `feat(<scope>): <kurze-beschreibung>`
   - Body: siehe Sektion **PR-Konventionen** unten.
7. **Auto-Merge** wenn CI grün ist.
8. **Post-Merge.** Folge der Sektion **Post-Merge Deploy** unten.

### Fix-Pfad

1. **BR-* Ticket finden.** Frage den User nach der Ticket-ID. Wenn keine existiert: verweise auf `https://web.mentolder.de/admin/bugs` zum Anlegen. **Ohne Ticket geht der Fix-Pfad nicht weiter.**
2. **Bug reproduzieren mit failing Test** (red-green-refactor — Pflicht). Schreibe einen Test, der den Bug beweist:

   ```bash
   ./tests/runner.sh local <neue-test-id>
   # Erwartet: FAIL
   ```

3. **Plan.** Bei nicht-trivialen Fixes: `superpowers:writing-plans`. Bei Einzeilern: kurze Inline-Begründung reicht.
4. **Fix implementieren** bis der Test grün ist.
5. **Verifikation:**

   ```bash
   task workspace:validate     # falls Manifests betroffen
   ./tests/runner.sh local <test-id>
   task test:all
   ```

6. **PR.** Titel: `fix(<scope>): <kurze-beschreibung>`. Body MUSS `Closes BR-YYYYMMDD-xxxx` enthalten — sonst Push blockieren und nochmal nachfragen.
7. **Auto-Merge** wenn CI grün ist.
8. **Post-Merge.** Folge der Sektion **Post-Merge Deploy** unten.

### Chore-Pfad

1. **Chore in einem Satz beschreiben.** Beispiele: "Astro auf 5.x bumpen", "Variable `foo` zu `bar` umbenennen", "Tippfehler in Doku korrigieren".
2. **Änderung machen.** Kein Plan, kein Spec, kein TDD nötig.
3. **Verifikation:**

   ```bash
   task test:all                # MUSS grün sein
   task workspace:validate      # falls Manifests betroffen
   task website:dev             # falls website/src/ betroffen — Smoke-Test
   ```

4. **PR.** Titel: `chore(<scope>): <kurze-beschreibung>`. Body: kurzes `## Summary` (1-2 Bullets) + `## Test plan` (was du gelaufen bist).
5. **Auto-Merge** wenn CI grün ist.
6. **Post-Merge.** Folge der Sektion **Post-Merge Deploy** unten.

## Post-Merge Deploy

Nach dem Merge auf `main`: Schau dir die geänderten Dateien an (`gh pr view <pr> --json files` oder `git diff` auf den Merge-Commit) und führe den passenden Task aus:

| Geänderte Dateien | Task | Verify |
|---|---|---|
| `website/src/**`, `website/public/**`, `website/package*.json` | `task feature:website` | Live-Check `https://web.mentolder.de` + `https://web.korczewski.de` |
| `brett/**` | `task feature:brett` | `https://brett.mentolder.de` + `https://brett.korczewski.de` |
| `docs-site/**`, docs-content ConfigMap | `task docs:deploy` | `https://docs.mentolder.de` |
| `k3d/livekit*.yaml` | `task feature:livekit` | `task livekit:status ENV=mentolder` + `ENV=korczewski` |
| `k3d/**`, `prod/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/sealed-secrets/**` | `task feature:deploy` | `task workspace:verify:all-prods` + `task health` |
| Nur `docs/`, `*.md`, `CLAUDE.md`, `tests/`, `.github/`, `Taskfile*.yml`, `scripts/`, `.claude/` | KEIN Deploy | Keine Verify |

Wenn mehrere Kategorien matchen, in dieser Reihenfolge ausführen: workspace → website → brett → livekit → docs.

**Wichtig bei Verify:**

- Bei Copy/Visual-Änderungen: Screenshot via Playwright machen.
- Bei funktionalen Änderungen: relevante `./tests/runner.sh local <FA-XX>` gegen die Live-URL laufen lassen.
- **Wenn Verify scheitert: KEINEN Fix auf `main` versuchen.** Sofort einen neuen `fix/<slug>` Branch via Fix-Pfad öffnen und Patrick benachrichtigen.

## PR-Konventionen

### Titel-Format

`<type>(<scope>): <imperative summary>`

- `<type>` ∈ {`feat`, `fix`, `chore`} — passt zum gewählten Pfad
- `<scope>` ist kurz, z.B. `website`, `arena`, `infra`, `db`, `ci`, `deps`, `docs`
- `<summary>` ist Imperativ Präsens, ohne Punkt am Ende, erstes Wort klein

Beispiele:

- `feat(arena): add solo replay button`
- `fix(sse): drop forbidden Connection header from SSE responses`
- `chore(deps): bump astro to 5.4`

### Body-Template

```markdown
## Summary
- <warum diese Änderung existiert, 1-3 Bullets>

## Test plan
- [x] task test:all
- [x] task workspace:validate          # wenn Manifests geändert
- [x] ./tests/runner.sh local FA-XX    # falls relevant
- [x] manueller Check auf web.mentolder.de  # falls user-sichtbar

Closes BR-YYYYMMDD-xxxx   <!-- nur Fix-Pfad — sonst weglassen -->

Co-Authored-By: <model-name>
```

## Failure-Handling

- **CI rot vor Merge:** Diagnose, Fix auf demselben Branch, neu pushen. Keinen zweiten PR aufmachen.
- **Deploy scheitert post-merge:** Loggen, Patrick benachrichtigen, Cluster wie ist lassen. Kein Auto-Rollback.
- **Verify scheitert post-merge:** Neuen `fix/<slug>` Branch via Fix-Pfad. Behandle die Regression als Bug.

## Agent-Routing

Jeder Pfad delegiert Spezialarbeit an die passenden Sub-Agents (siehe CLAUDE.md Agent-Routing-Tabelle):

- DB/Schema/Queries → `bachelorprojekt-db`
- Manifests/Kustomize/Taskfile → `bachelorprojekt-infra`
- Live-Cluster-Operations (Pods, Logs, Restarts) → `bachelorprojekt-ops`
- Tests schreiben/debuggen → `bachelorprojekt-test`
- Astro/Svelte/UI → `bachelorprojekt-website`
- SealedSecrets/Keycloak/OIDC → `bachelorprojekt-security`

**Pflicht vor jedem Sub-Agent-Dispatch:** `bash scripts/plan-context.sh <role>` ausführen und die Ausgabe in `<active-plans>` Tags an den Prompt voranstellen (Details in CLAUDE.md).
````

- [ ] **Step 3: Verify the file landed correctly**

```bash
test -f .claude/skills/dev-flow/SKILL.md && echo "OK" || echo "MISSING"
head -5 .claude/skills/dev-flow/SKILL.md
wc -l .claude/skills/dev-flow/SKILL.md
```

Expected: `OK`, frontmatter visible in head output, line count between 100 and 200.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/dev-flow/SKILL.md
git commit -m "$(cat <<'EOF'
chore(skills): add dev-flow skill

Project-level skill that codifies the shared dev process: feature/fix/chore
paths, worktree-first, conventional-commit PRs, post-merge deploy on both
prod clusters. German content (gekko-readable); auto-invokes on any work
request in this repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add CLAUDE.md pointer

**Files:**
- Modify: `CLAUDE.md` (insert a new section right after the Agent Routing table, before the "Project Overview" header)

- [ ] **Step 1: Locate the insertion point**

Run:

```bash
grep -n "^## Project Overview" CLAUDE.md
```

Note the line number — the new section goes immediately above it, with one blank line on each side.

- [ ] **Step 2: Insert the dev-flow pointer**

Use Edit to insert this block immediately before `## Project Overview`:

```markdown
## Default Workflow

For any work request in this repo (add/change/fix/build), invoke the project-level **`dev-flow` skill** (`.claude/skills/dev-flow/SKILL.md`). It defines the shared process: path declaration (feature/fix/chore), worktree isolation, testing floor, conventional-commit PRs, and post-merge deploy on both prod clusters. Auto-invokes via its `description` frontmatter; no special wiring needed.

```

- [ ] **Step 3: Verify the insertion**

```bash
grep -B1 -A3 "Default Workflow" CLAUDE.md | head -10
```

Expected: the new section appears, with `## Project Overview` on the line below the new block.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
chore(docs): point CLAUDE.md at the dev-flow skill

Adds a one-paragraph "Default Workflow" pointer right above the project
overview so any session reading CLAUDE.md sees the dev-flow skill before
diving into the codebase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verify chore-path floor

This is the chore-path verification step the new skill itself defines. Eat the dog food.

- [ ] **Step 1: Run the offline test suite**

```bash
task test:all
```

Expected: all green. If anything fails: investigate, fix on this branch, re-run. Do NOT proceed to PR with red tests.

- [ ] **Step 2: Confirm no manifests or website code were touched**

```bash
git diff --name-only origin/main...HEAD
```

Expected: only `docs/superpowers/specs/2026-05-13-dev-flow-skill-design.md`, `docs/superpowers/plans/2026-05-13-dev-flow-skill.md`, `.claude/skills/dev-flow/SKILL.md`, `CLAUDE.md`. No `k3d/`, `prod*/`, `website/`, `brett/`. → No `task workspace:validate` needed, no `task website:dev` smoke needed.

---

## Task 4: Open the chore PR

**Files:** none modified.

- [ ] **Step 1: Push the branch and open the PR**

Invoke `commit-commands:commit-push-pr` skill. It will:
- Detect we're on `worktree-chore+dev-flow-skill`
- Push to origin
- Open PR with the title and body below

If invoking the skill is not viable from the current session, run manually:

```bash
git push -u origin HEAD

gh pr create --title "chore(skills): add dev-flow skill for our shared dev process" --body "$(cat <<'EOF'
## Summary
- Adds `.claude/skills/dev-flow/SKILL.md` — a project-level skill (German content) that codifies our shared dev process: path declaration (feature/fix/chore), worktree-first, TDD where it fits, conventional-commit PRs, post-merge deploy on both prod clusters.
- Adds a "Default Workflow" pointer to CLAUDE.md so any session sees the skill before diving into the codebase.
- Includes the design spec and the implementation plan for traceability.

## Test plan
- [x] task test:all
- [x] git diff --name-only origin/main...HEAD shows only docs + skill + CLAUDE.md (no deploy-relevant paths)
- [x] manual read-through of SKILL.md to confirm German content is accurate and routes correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for CI green**

Poll the PR until CI is green:

```bash
gh pr checks --watch
```

Expected: all checks pass. If anything fails: read the failure, fix on this branch, push again. Do NOT open a second PR.

- [ ] **Step 3: Auto-merge**

```bash
gh pr merge --auto --squash --delete-branch
```

The `--auto` flag merges as soon as CI green + branch protection conditions met. The `--squash` keeps `main` linear (matches the project's squash-and-merge rule). `--delete-branch` cleans up the remote branch.

- [ ] **Step 4: Confirm merge + clean up worktree**

After merge lands on `main`:

```bash
gh pr view --json state,mergedAt
```

Expected: `state: MERGED`. Then exit the worktree (use ExitWorktree with action: "remove" since the work is shipped).

---

## Task 5: Post-merge deploy assessment

This is the post-merge step the new skill itself defines. Eat the dog food.

- [ ] **Step 1: Diff the merged PR's file list**

```bash
gh pr view <PR-NUMBER> --json files --jq '.files[].path'
```

- [ ] **Step 2: Check against the deploy mapping**

The diff contains only:

- `docs/superpowers/specs/2026-05-13-dev-flow-skill-design.md`
- `docs/superpowers/plans/2026-05-13-dev-flow-skill.md`
- `.claude/skills/dev-flow/SKILL.md`
- `CLAUDE.md`

All four match the "no deploy" row of the mapping table (`docs/`, `.claude/`, `*.md`, `CLAUDE.md`). → **No deploy task to run, no live verify needed.** Done.

If anything else slipped in: stop and re-evaluate against the deploy mapping. Don't auto-deploy from this PR — open a follow-up if needed.
