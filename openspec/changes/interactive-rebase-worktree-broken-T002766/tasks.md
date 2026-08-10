---
title: "interactive-rebase-worktree-broken-T002766 — Implementation Plan"
ticket_id: T002766
domains: [bachelorprojekt-infra, bachelorprojekt-test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# interactive-rebase-worktree-broken-T002766 — Implementation Plan

_Ticket: T002766_

**Goal:** Ein Worktree, der mitten in einer unterbrochenen git-Operation stehenbleibt, wird
gemeldet, statt unbemerkt einen PR auf `CONFLICTING` zu halten.

**Architecture:** Ein eigenständiges Guard-Skript iteriert über alle registrierten Worktrees
und prüft je Worktree die git-Zustandsverzeichnisse. Es wird dem allowlist-gefilterten
Sauberkeits-Vorcheck des repo-hygiene-Runbooks **vorgelagert**, weil dieser den Zustand
strukturell nicht sehen kann. Der Guard meldet und repariert nicht.

**Tech Stack:** Bash, `git worktree list --porcelain`, `git rev-parse --git-path`, BATS
(vendored unter `tests/unit/lib/bats-core/bin/bats`).

## File Structure

```
scripts/worktree-git-op-guard.sh                              (neu — der Detektor)
.claude/skills/references/repo-hygiene-ops.md                 (geändert — Abschnitt 1, Vorcheck)
.claude/skills/dev-flow-plan/SKILL.md                         (geändert — Schritt −1, Audit-Zeile)
tests/spec/agent-skills/worktree-mid-rebase-guard.bats        (liegt bereits vor — RED)
openspec/changes/interactive-rebase-worktree-broken-T002766/  (Proposal, Design, Delta-Spec)
```

### S1-Zeilenbudget

| Datei | Endung | Limit | Ist | Baseline | Budget |
|---|---|---|---|---|---|
| `scripts/worktree-git-op-guard.sh` | `.sh` | 800 | neu (Zielumfang ≈ 90) | nicht-baselined | **≈ 710 Zeilen** |
| `.claude/skills/references/repo-hygiene-ops.md` | `.md` | kein Limit | 433 | nicht-baselined | — |
| `.claude/skills/dev-flow-plan/SKILL.md` | `.md` | kein Limit | 328 | nicht-baselined | — |
| `tests/spec/**/*.bats` | `.bats` | kein Limit | 108 | nicht-baselined | — |

`s1.limits` in `docs/code-quality/gates.yaml` führt `.astro .ts .svelte .sh .mjs .mts .py .js
.jsx .tsx .cjs .bash .java .php`. Von den geänderten Dateien fällt nur das neue Guard-Skript
darunter, mit reichlich Reserve. Kein Split einzuplanen.

`.md`-Dateien stehen nicht unter S1, aber `.claude/skills/dev-flow-plan/SKILL.md` unterliegt
dem Progressive-Disclosure-Budget aus `openspec/specs/agent-skills.md` („Project-owned skill
bodies must respect the progressive-disclosure budget"). Die Ergänzung dort ist deshalb auf
**eine** Befehlszeile begrenzt; die Begründung steht in der Referenzdatei, nicht im Skill-Body.

## Global Constraints

- **Der Guard repariert nichts.** Kein `git rebase --continue`, kein `--abort`, kein `git add`.
  Ein Force-artiger Eingriff in einen fremden Worktree kann einen falschen Commit auf einem
  Branch erzeugen, den der Aufrufer nicht besitzt. `scripts/pr-refresh.sh:195-219` tut das
  bewusst nur in seinem **selbst angelegten** Worktree und nur für generierte Dateien — diese
  Begrenzung ist die Voraussetzung dafür, dass es dort vertretbar ist.
- **Kein `-i` einführen.** CLAUDE.md hält fest, dass interaktive git-Flags in dieser Umgebung
  nicht unterstützt sind. Der Ticket-Titel spricht von „interactive rebase", weil `git status`
  diesen Wortlaut für **jeden** merge-backend-Rebase ausgibt — nicht, weil `-i` verwendet wurde.
- **Kein CI-Job.** In CI existiert genau ein Worktree; der Guard wäre dort strukturell immer
  grün und würde die Ausstattung des Runners messen statt den Zustand des Codes (T002716).
- **Semantik statt Darstellung in den Assertions.** Keine Zeilenanker auf das Ausgabeformat des
  Guards, keine Zusicherung auf den exakten Wortlaut einer Meldung.

## Kontext für den Implementierer

Der Zustand ist in unter einer Minute reproduzierbar, und das lohnt sich vor der Arbeit:

```bash
cd "$(mktemp -d)" && git init -q -b main . \
  && git config user.email t@t && git config user.name t \
  && echo base > f && git add -A && git commit -qm base \
  && git branch feat && echo mainside > f && git commit -qam mainside \
  && git checkout -q feat && echo feat > f && git commit -qam feat \
  && (git rebase main || true) && echo resolved > f && git add f
git status | head -3
# → "interactive rebase in progress; onto <sha>"
# → "(all conflicts fixed: run \"git rebase --continue\")"
```

Bemerkenswert daran: `git rebase main` trägt **kein** `-i`. Und
`git rev-parse --abbrev-ref HEAD` liefert in diesem Zustand `HEAD`, nicht den Branchnamen —
der Branch steht in `rebase-merge/head-name`.

Die Erkennungsmechanik ist verifiziert: `git -C <worktree> rev-parse --git-path rebase-merge`
löst in einem linked worktree korrekt nach `<repo>/.git/worktrees/<name>/rebase-merge` auf und
liefert einen absoluten Pfad. Dieselbe Namensliste (`rebase-merge`, `rebase-apply`,
`MERGE_HEAD`, `CHERRY_PICK_HEAD`) benutzen bereits `scripts/agent-lock.sh:302`,
`scripts/openspec-embed-lib.sh:32-33` und `.githooks/pre-commit:87` — dort aber jeweils als
Guard-**Ausnahme**, nie als Melder. Genau diese Lücke schließt der Change.

## Partials

| # | Rolle | Zieldateien |
|---|---|---|
| p1 | tests | `scripts/worktree-git-op-guard.sh`, `.claude/skills/references/repo-hygiene-ops.md`, `.claude/skills/dev-flow-plan/SKILL.md`, `tests/spec/agent-skills/worktree-mid-rebase-guard.bats` |

Ein Partial: der Guard, seine beiden Einbindungen und der Test sind ein einziger,
zusammenhängender Vorgang von rund 90 Produktionszeilen. Eine Aufteilung erzeugte nur
Abhängigkeiten zwischen Partials, ohne Parallelität zu gewinnen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt bereits im Branch
      (`tests/spec/agent-skills/worktree-mid-rebase-guard.bats`, committed mit diesem Plan).
      Vor jeder Implementierung einmal ausführen und den roten Stand bestätigen — vier der
      fünf Blöcke müssen fehlschlagen, weil `scripts/worktree-git-op-guard.sh` noch nicht
      existiert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-mid-rebase-guard.bats
# expected: FAIL (rot — der Guard ist noch nicht implementiert)
```

> Der fünfte Block („Reproduktion des Befunds") ist bereits **grün** und muss grün bleiben:
> er belegt, dass der allowlist-gefilterte `--porcelain`-Vorcheck den kaputten Worktree für
> sauber hält. Das ist der Regressionsanker für die Reihenfolge-Anforderung, kein Fehler.

- [ ] **Guard implementieren.** `scripts/worktree-git-op-guard.sh` anlegen:
      `[--quiet] [<repo-root>]`, iteriert `git worktree list --porcelain`, prüft je Worktree
      `rebase-merge`, `rebase-apply`, `MERGE_HEAD`, `CHERRY_PICK_HEAD` über
      `git -C "$wt" rev-parse --git-path <name>`. Je Befund ausgeben: Worktree-Pfad, Art der
      Operation und ob noch ungelöste Konflikte offen sind
      (`git -C "$wt" diff --name-only --diff-filter=U`). Exit 0 = kein Befund,
      Exit 1 = mindestens ein Befund, Exit 2 = Aufruffehler (unbekanntes Flag, `<repo-root>`
      ist kein git-Repo). `set -euo pipefail`, ausführbar (`chmod +x`).

- [ ] **repo-hygiene-ops.md Abschnitt 1 umstellen.** Den Guard-Aufruf **vor** den
      allowlist-gefilterten `--porcelain`-Vorcheck setzen und dort festhalten, warum die
      Reihenfolge zwingend ist: die aufgelösten Konfliktdateien sind Freshness-Generate unter
      `website/src/data/` und `docs/code-quality/`, also genau die Pfade, die die
      Generat-Allowlist entfernt — nach der Filterung bleibt nichts übrig und der kaputte
      Worktree gilt als sauber.

- [ ] **dev-flow-plan Schritt −1 ergänzen.** Eine Befehlszeile im Stale-Worktree-Audit neben
      `git worktree list`, ohne zusätzliche Prosa (Progressive-Disclosure-Budget).

- [ ] **Grünlauf.** Alle fünf Blöcke der Testdatei müssen bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-mid-rebase-guard.bats
```

- [ ] **Beide Testformen der Spec prüfen (T002696).** Für `agent-skills` existieren
      Sammeldatei und Verzeichnis nebeneinander; eine gezielte Suche fände nur die Hälfte.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills*
```

- [ ] **Guard gegen das echte Repo laufen lassen.** Belegt, dass er auf einem realen
      Worktree-Bestand nicht falsch anschlägt und die Ausgabe lesbar ist.

```bash
bash scripts/worktree-git-op-guard.sh; echo "rc=$?"
```

- [ ] **Final Verification.** Die drei verbindlichen Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
