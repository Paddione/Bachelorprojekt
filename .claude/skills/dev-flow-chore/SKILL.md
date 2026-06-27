---
name: dev-flow-chore
description: Use for maintenance work with no behavior change — docs, dependency bumps, config/rename, CI tweaks, cleanup. Executes and merges inline; no separate plan or dev-flow-execute handoff.
---

# dev-flow-chore — Wartung direkt ausführen & mergen

## Wann diese Skill greift

Eine **Chore**: Wartung ohne Verhaltensänderung — Doku, Dependency-Bumps, Config/Rename, CI-Tweaks,
Aufräumen. Chores brauchen **keinen** Plan und **keinen** `dev-flow-execute`-Handoff: sie werden in
einem Rutsch erledigt und gemergt. Für Features/Fixes stattdessen `dev-flow-plan` nutzen.

**Sage zu Beginn:** "Ich nutze dev-flow-chore und führe die Wartung direkt aus."

---

## Position im Git-Kreislauf

```
    ┌────────────────────────────────────────────────────┐
    ▼                                                    │
[ main ]                                                 │
    │                                                    │
    └──► [branch] ──► [ändern + testen] ──► [PR+merge] ──► AUSSTIEG
              DIESER SKILL (Kurzschluss — kein Plan-Handoff)   │
                                                               │
                                    zurück zu [ main ] ────────┘
```

**EINSTIEG:** `main` — synchronisiert, sauberer Stand  
**AUSSTIEG:** PR gemergt zu `main`, Worktree bereinigt, Kreislauf geschlossen  
**Kurzschluss:** kein Zwischenstopp bei `dev-flow-execute` — Chores sind einzügig

---

## Schritt 0: Reaper & Pull-First

```bash
bash scripts/agent-lock.sh reap   # Session-Koordination [T000510]: Zombies/stale Worktrees/tote Locks räumen
git fetch origin main
if git diff --quiet HEAD; then git pull --rebase origin main; else git stash && git pull --rebase origin main && git stash pop; fi
```

## Schritt 0.5: Wiederkehrend oder einmalig?

Frage den User, ob die Chore regelmäßig laufen soll. Falls ja, rufe `/schedule` auf und richte
einen Cron-Job ein. **STOPP hier.**

## Schritt 1: Worktree anlegen & claimen

```bash
# git-crypt-safe: creates the worktree, handles git-crypt, inits submodules
bash scripts/worktree-create.sh chore/<slug> /tmp/wt-<slug>
cd /tmp/wt-<slug>
bash scripts/agent-lock.sh claim branch "chore/<slug>" --worktree "$PWD" --label dev-flow-chore
```

Falls ausnahmsweise inline im main-Checkout gearbeitet wird: zusätzlich `claim main-checkout` —
der `.githooks/pre-commit` sperrt sonst konkurrierende Commits anderer Sessions.

Lege ein minimales Audit-Ticket an (type=task, status=done — Chores haben keinen Plan,
nur eine Audit-Spur):
```bash
TICKET_RESULT=$(./scripts/ticket.sh create \
  --type task \
  --brand mentolder \
  --title "chore: <slug>" \
  --status done \
  --description "Branch: chore/<slug>"$'\n'"Kein Plan — direktes Chore.")
TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
```

## Schritt 2: Änderungen vornehmen

Setze die Wartung um. Bei mechanischer Arbeit über mehrere Dateien kannst du an einen passend
provisionierten Subagenten delegieren (siehe [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) — Chores sind i.d.R. `haiku`/`sonnet`, Effort low).

## Schritt 3: Verifizieren

```bash
task workspace:validate
task test:changed
task freshness:regenerate   # generierte Artefakte aktuell halten, sonst CI rot
task freshness:check        # CI-Äquivalent: S1–S4-Ratchet (Zeilenlimits!) gegen baseline.json — fängt das Gate VOR dem Push
```

Siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm-Gotchas in Worktrees.

> **⚠ Freshness-Guard (vor jedem Commit):** Neue Test-Specs, Routen oder Assets ändern generierte Indexdateien (`repo-index.json`, `test-inventory.json`, …). Ohne Regenerierung schlägt CI fehl. Der Pre-commit-Hook erledigt das automatisch nach `task secrets:install-hooks` — ohne Hook: `task freshness:regenerate` manuell ausführen und staged Änderungen mitcommittten.

> **⚠ S1-Gate-Guard (Chores ohne Plan!):** Chores haben **kein** Zeilenbudget-Planungsschritt. Berührt die Chore Code-Dateien (`.ts/.svelte/.astro/.sh/.mjs/...`), prüfe vor dem Commit das S1-Ratchet mit `task freshness:check`. Achtung: Das Ratchet vergleicht gegen den **eingefrorenen Baseline-Wert** in `docs/code-quality/baseline.json`, nicht nur gegen das statische Limit — eine schon gebaselinete (gewachsene) Datei hat **0 Zeilen Budget**, d.h. schon +1 Zeile macht CI rot. Dann die Datei **echt verkleinern/aufteilen**, nicht kosmetisch Zeilen zusammenziehen (das trippt bei der nächsten Änderung erneut).
>
> **Plan-Linter gibt es für Chores nicht** (kein Plan) — aber das S1-Budget der berührten
> Code-Dateien lässt sich vor dem Commit prüfen: für jede geänderte Datei den Restbudget-Wert
> mit der gleichen Mathematik wie der Linter ermitteln:
> ```bash
> for f in $(git diff --name-only); do
>   PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget "$f" 2>/dev/null \
>     | awk -v f="$f" '{print f": Restbudget "$0}'
> done
> ```
> Bei Restbudget ≤ 0 die Datei **echt verkleinern**, nicht kosmetisch zusammenziehen.

## Schritt 4: Commit, Push & PR

> **git-crypt-Staging-Hinweis [T001210]:** Niemals `git add -A` in diesem Repo
> verwenden. `environments/.secrets/**` ist git-crypt-geschützt; in jedem
> Worktree erscheinen ~21 Smudge-Artefakte als "modified" und würden durch
> ein blankes `git add -A` in den Index und den Commit promoviert werden.
> Der ad-hoc-Workaround wurde in T001199 / PR #2135 entwickelt und ist
> hier in den Skill selbst übernommen. Verwandt: das silent-commit-failure
> Symptom derselben Root-Cause ist in T000925 dokumentiert.

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
git commit -m "chore(<scope>): <subject> [$TICKET_EXT_ID]"   # commitlint: Body-Zeilen <100 Zeichen

# Verify commit landed — git-crypt clean filter can cause silent commit failures
# in worktrees, and an un-chained push would send an empty branch. [T000925]
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: commit did not land (git-crypt clean filter?). Push aborted." >&2
  exit 1
fi

# Validate PR title scope BEFORE creating the PR. [T000925]
bash scripts/preflight-pr-scope.sh "chore(<scope>): <subject> [$TICKET_EXT_ID]"
if [ $? -ne 0 ]; then
  echo "FATAL: PR title scope failed preflight — fix the scope and retry." >&2
  exit 1
fi
```
Die `[T000XXX]`-Referenz wird von `.github/workflows/post-merge.yml` gelesen — das Ticket ist
bereits `done`, der Status-Update ist ein idempotenter No-op.

> **Titel nachträglich editieren (REST-Fallback):** `gh pr edit --title` scheitert
> gelegentlich an einer Projects-Classic-GraphQL-Deprecation. Nutze stattdessen:
> ```bash
> gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
> ```
> Der Preflight (oben) sollte Titel-Edits aber überflüssig machen. [T000925]

Rufe `commit-commands:commit-push-pr` auf (oder `gh pr create` manuell).

## Schritt 5: Merge wenn CI grün

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```

## Schritt 6: Worktree & Branch bereinigen

```bash
bash scripts/agent-lock.sh release branch "chore/<slug>" 2>/dev/null || true
cd /home/patrick/Bachelorprojekt
git worktree remove "/tmp/wt-<slug>" --force
git branch -D "chore/<slug>"
```

## Schritt 7: Deploy (falls nötig)

Nur wenn die Chore deploybare Pfade berührt — Mapping in
[deploy-routing](file:///home/patrick/Bachelorprojekt/.claude/skills/references/deploy-routing.md) (Single Source of Truth).

---

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 6:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `/tmp/wt-<slug>` gelöscht, Branch `chore/<slug>` gelöscht
- Ticket status = `done` (wurde beim Anlegen bereits gesetzt)
- Branch-Lock freigegeben

**Kreislauf zurück zu `main`** — nächste Arbeit startet mit `dev-flow-plan` oder erneutem `dev-flow-chore`.

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Geschwister — Features/Fixes (mit Plan + Handoff) statt Chores |
| `using-git-worktrees` | Hintergrund — wird hier durch `scripts/worktree-create.sh` (git-crypt-safe) ersetzt |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende über `mishap-tracker`
(Invoke `mishap-tracker` with your accumulated MISHAP_LOG).
