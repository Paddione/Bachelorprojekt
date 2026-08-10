# Proposal: interactive-rebase-worktree-broken-T002766

## Why

Repo-hygiene fand den Worktree `.worktrees/flux-artifact-versioning` (Branch
`fix/flux-artifact-versioning-T002706`, PR #3877) mitten in einem Rebase: alle Konflikte
gelöst und gestaged, `git rebase --continue` nie ausgeführt. Der PR stand deshalb auf
`mergeStateStatus=DIRTY` / `mergeable=CONFLICTING` — behoben wurde er von Hand.

### Symptom vs. Hypothese (Bug-Triage, T002448-M5)

Das Ticket vermischt Beobachtung und Ursachenannahme in einem Satz. Getrennt und belegt:

**Beobachtetes Symptom (Fakt):** Ein Worktree stand mit existierendem `rebase-merge`-Verzeichnis
und aufgelösten, gestageten Konflikten still; der zugehörige PR meldete `CONFLICTING`.

**Hypothese des Tickets:** „ein Skill/Workflow, der einen *interactive* Rebase startet". Diese
Hypothese ist **widerlegt**. Ein repo-weiter Griff nach `git rebase -i` liefert genau eine
Fundstelle — `scripts/check-skip-ci-marker.sh:63`, und die *druckt* den Befehl nur als Hinweis
für den Menschen, führt ihn nicht aus. Das deckt sich mit CLAUDE.md, wonach interaktive
git-Flags in dieser Umgebung nicht unterstützt sind.

**Verifizierte Ursache (Reproducer, ausgeführt):** Git meldet für **jeden** konfliktbehafteten
Rebase „interactive rebase in progress" — auch für ein schlichtes `git rebase origin/main`,
weil das Merge-Backend seit langem der Standard ist. Der Reproducer:

```
git rebase main                 # KEIN -i
# CONFLICT …
<datei auflösen>; git add <datei>
git status  →  "interactive rebase in progress; onto b9ae368"
                "(all conflicts fixed: run \"git rebase --continue\")"
git rev-parse --abbrev-ref HEAD →  HEAD   (detached)
```

Der Zustand entsteht also aus den **regulären, dokumentierten** Rebase-Rezepturen des Repos,
wenn die Session zwischen Konfliktauflösung und `--continue` endet:

- `.claude/skills/references/git-workflow-procedures.md:127-128` und
  `.claude/skills/references/dev-flow-gotchas.md:57` — die Freshness-Race-Rezeptur
  `git rebase origin/main && task freshness:regenerate && git add … && git rebase --continue && git push --force-with-lease`
- `.claude/skills/dev-flow-execute/SKILL.md:22` (Phase 0.5) und
  `.claude/skills/git-workflow/SKILL.md:191` — `git rebase origin/main`, Konflikt → „manuell lösen"

Der eigentliche Defekt ist deshalb nicht *dass* ein Rebase startet, sondern dass **niemand den
liegengebliebenen Zustand bemerkt**.

### Warum die vorhandene Hygiene-Prüfung strukturell blind ist

`repo-hygiene-ops.md` §1 entscheidet über die Sauberkeit eines Worktrees mit einem
allowlist-gefilterten `git status --porcelain`. Im Reproducer oben steht dort:

```
M  website/src/data/openspec-status.json
```

— und `website/src/data/` ist Teil der Generat-Allowlist. Nach der Filterung bleibt **nichts**
übrig: der kaputte Worktree gilt als sauber. Das ist kein Zufall, sondern der Regelfall: die
Konflikte, die diese Rebases überhaupt auslösen, sind fast ausschließlich Freshness-Generate
(`website/src/data/`, `docs/code-quality/`) — exakt die allowlisteten Pfade. Der Vorcheck kann
den Befund also prinzipiell nie sehen, egal wie sorgfältig er ausgeführt wird.

Ein Detektor für den Zustand existiert im Repo bereits dreimal, aber jedes Mal als *Ausnahme*,
nie als *Befund*: `scripts/agent-lock.sh:302` (`_git_op_in_progress`, damit der Post-Checkout-Guard
nicht dazwischenfunkt), `scripts/openspec-embed-lib.sh:32-33` und `.githooks/pre-commit:87`
(Hook aussetzen). Keine Stelle meldet ihn jemandem.

## What

Ein eigenständiger Detektor, der über **alle** Worktrees läuft und eine unterbrochene
git-Operation als Befund meldet — vorgelagert vor die allowlist-gefilterte Sauberkeitsprüfung,
weil diese ihn nicht sehen kann.

1. **`scripts/worktree-git-op-guard.sh`** (neu) — iteriert `git worktree list --porcelain`,
   prüft je Worktree `rebase-merge`, `rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD` über
   `git -C <wt> rev-parse --git-path <name>` (verifiziert: löst in linked worktrees korrekt
   nach `.git/worktrees/<name>/…` auf) und meldet Pfad, Operation und ob noch ungelöste
   Konflikte offen sind. Exit 0 = kein Befund, Exit 1 = mindestens ein Befund (fail-closed
   für Automation), Exit 2 = Aufruffehler. Optionales Repo-Root-Argument, damit der Guard
   gegen ein Fixture testbar ist.
2. **`.claude/skills/references/repo-hygiene-ops.md` §1** — der Guard wird Pflicht-Vorcheck
   **vor** dem `--porcelain`-Vorcheck, mit der Begründung, warum die Allowlist blind ist.
3. **`.claude/skills/dev-flow-plan/SKILL.md` Schritt −1** — der Guard läuft im
   Stale-Worktree-Audit neben `git worktree list`.
4. **BATS** in `tests/spec/agent-skills/worktree-mid-rebase-guard.bats` — Output-Verifikation
   gegen ein echtes Fixture-Repo mit einem Worktree in mid-rebase.

### Verworfene Alternativen

- **Auto-Heilung (`git rebase --continue` automatisch ausführen).** Verworfen: der Blast Radius
  ist ein falscher Commit-Inhalt auf einem fremden Branch, und die Rückabwicklung ist nicht
  billig. `scripts/pr-refresh.sh:211` macht genau das bereits — aber eng begrenzt auf seinen
  eigenen, selbst angelegten Worktree und nur für generierte Dateien. Diese Begrenzung ist die
  Voraussetzung dafür, dass es dort vertretbar ist; sie lässt sich auf fremde Worktrees nicht
  übertragen. Der Guard meldet, er repariert nicht.
- **Erweiterung von `scripts/agent-lock.sh reap`.** Verworfen: `reap` verwaltet Locks, nicht
  git-Zustand. Die dort vorhandene `_git_op_in_progress()` ist bewusst eine Guard-Ausnahme;
  sie zusätzlich zum Melder zu machen, vermischt zwei Zuständigkeiten in einer Funktion, deren
  Semantik („nicht eingreifen") das Gegenteil der neuen ist („laut werden").
- **Nur Dokumentation.** Verworfen: der Befund entstand, während ein Mensch hinsah und ihn nicht
  sah — die Allowlist filterte ihn weg. Eine zusätzliche Prosa-Zeile ändert daran nichts.
- **Erkennung über `detached HEAD` in `git worktree list`.** Verworfen als *primäres* Signal:
  ein bewusst detached ausgecheckter Worktree ist kein Fehler. `rebase-merge`/`rebase-apply`
  ist das eindeutige Signal.

### Prior Art (Schritt 0.7)

`openspec/specs/agent-skills.md:644-676` regelt bereits „repo-hygiene covers the local working
tree and stashes" samt Worktree-Remove-Vorcheck; `openspec/specs/worktree-divergence-guard-T002387.md`
betrifft nur das Fetch-Verhalten in `worktree-create.sh`. Keine dieser Entscheidungen wird
umgekehrt — dieser Change **ergänzt** einen Vorcheck, den die bestehenden Requirements nicht
abdecken. Zielspec ist deshalb `agent-skills` (ADDED, kein MODIFIED).

_Ticket: T002766_
