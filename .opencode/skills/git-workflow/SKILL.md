---
name: git-workflow
description: 'Use whenever committing, pushing, creating a PR, or finishing work on any branch. Covers the complete repo-specific git lifecycle: pull-first, commit conventions, freshness guard, commit verification, PR creation with scope preflight, CI fix loop, auto-merge, and worktree cleanup.'
---

# Git Workflow — vollständiger Lifecycle für dieses Repo

**Sage zu Beginn:** "Ich nutze git-workflow für den Commit/PR-Ablauf."

Dieser Skill ist die **SSOT für Commit → Push → PR → Merge → Cleanup** — die `dev-flow-*`-Skills
verweisen auf die Schritte hier statt sie zu duplizieren. Für read/view-GitHub-Flows (Anzeige) den
Wrapper `gh-axi` bevorzugen; sobald `--json`/`-q`/Polling/Mutation im Spiel ist: `gh` direkt (T004612)
([gh-axi](.opencode/skills/references/gh-axi.md)).

---

## Schritt 0 — Pull-First

Vor jedem Commit / jeder Branch-Aktion sicherstellen, dass `origin/main` aktuell ist:

```bash
git fetch origin main
if git diff --quiet HEAD; then
  git pull --rebase origin main
else
  git stash push -m "wip ${TICKET_EXT_ID}"
  git pull --rebase origin main
  bash scripts/git-stash-net.sh pop --by-message "wip ${TICKET_EXT_ID}"
  # Teil-Pop-Befund (Exit 1)? Eintrag liegt noch im Stash — NICHT als Erfolg
  # behandeln, Wiederherstellung unten. Kein Treffer (Exit 2) ist ebenfalls
  # kein Erfolg: git stash list prüfen und den Eintrag zurückspielen.
fi
```

> **Stash-Pop positive Verifikation (T003069/T003070).** Nach dem Pop MUSS der eigene Eintrag
> aus `git stash list` verschwunden sein
> (`git stash list | grep -F "wip ${TICKET_EXT_ID}"` findet ihn bei Exit 1 noch). Ein
> verbliebener Eintrag ist ein **Befund, kein Erfolg**: der post-rewrite-Hook hat ein gestashtes
> Freshness-Artefakt schon neu erzeugt, der Pop wendet nur teilweise an. Wiederherstellung:
> `git stash show --stat "stash@{0}"` gegen den Arbeitsbaum halten, fehlende Datei mit
> `git checkout "stash@{0}" -- <pfad>` zurückholen, den Eintrag als Sicherungsnetz liegen lassen.

> **Stash-Disziplin (T003070).** Der Stash-Stack ist über ALLE Worktrees geteilt, `stash@{0}`
> verschiebt sich durch fremde pushes. Bei Parallelarbeit einen **Wegwerf-Commit auf dem eigenen
> Branch** verwenden (`git commit -m wip`, später `git reset --soft HEAD~1`). Wo ein Stash nötig
> bleibt: IMMER mit `-m` und Ticket-ID anlegen und über die Nachricht auflösen
> (`bash scripts/git-stash-net.sh pop --by-message ...`), NIE über den Index `stash@{0}`.

> **Branch-Switch + Stash Race (T001974 Mishap 2).** `git checkout -b <branch> && git stash pop`
> nie in einer Pipeline verketten, sonst landet der Commit auf dem falschen Branch. Jeden Schritt
> einzeln absichern:
>
> ```bash
> git checkout -b fix/my-branch || exit 1   # Branch-Switch abwarten
> git stash pop || { echo "stash pop failed"; exit 1; }
> ```

> **Probe-Commit + `--hard` verwirft auch unstaged Dateien (T001454, T002252/T002253).**
> `git reset -q --hard HEAD~1` nach einem Probe-Commit reißt unstaged Arbeitsdateien mit. Sicher:
> ```bash
> git stash -u && git reset --hard HEAD~1 && git stash pop
> ```
> Oder den Probe in einem separaten Wegwerf-Worktree testen.

---

## Schritt 1 — Verifikation & Freshness Guard (vor dem Commit)

### Rebase-Preflight (T002669)

Unmittelbar vor der Artefakt-Regeneration erneut auf Divergenz zu `origin/main` prüfen. Seit
Schritt 0 kann `main` weitergerückt sein, dann entstehen Artefakte gegen eine veraltete Basis und
ein weiterer Regen-Commit-Push-Zyklus folgt (T002634):

```bash
git fetch origin main
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "${BEHIND:-0}" -gt 0 ]; then
  echo "⚠ ${BEHIND} commit(s) hinter origin/main — rebase VOR dem Freshness-Regen-Lauf:"
  git pull --rebase origin main
  # Konflikte? Dem User anzeigen und klären (wie Schritt 0).
fi
```

Erst danach `task freshness:regenerate` ausführen.

### Rebase-Freshness-Regel (T003105)

Ein **konfliktfreier** Rebase kann mitcommittete Freshness-Artefakte still verlieren:
`.gitattributes` markiert sie mit `merge=ours`, und `ours` löst im Rebase ohne Konfliktmarker
zugunsten von `origin/main` auf. Ein grüner Rebase belegt die Artefakt-Vollständigkeit nicht.

Regel: **Nach JEDEM Rebase VOR dem Push `task freshness:check` erneut laufen lassen.**
Rot? `task freshness:regenerate` und den Regen-Commit anhängen. Gilt für Schritt 0, den
Rebase-Preflight und jeden `git rebase`/`git pull --rebase` im CI-Fix-Loop (Schritt 5).

Vollständiger Verify-Block (die vier Befehle, S1-Ratchet, Freshness-Artefakt-Liste zum Stagen):
**SSOT** in [verification-block](.opencode/skills/references/verification-block.md).
Falls S1 rot: Datei wirklich verkleinern, nicht kosmetisch Zeilen zusammenziehen.

---

## Schritt 2 — Commit

### Conventional Commits — Pflichtformat

```
<type>(<scope>): <subject> [<TICKET_EXT_ID>]
```

Header ≤ 100 Zeichen, Ticket-ID immer anhängen. `type`/`scope`-Liste, Beispiele, PR-Body-Vorlage
und das Vorgehen für einen **noch nicht registrierten Scope** (`scripts/register-scope.sh` +
`commitlint.config.cjs` mitcommitten, T001364):
[git-workflow-procedures](.opencode/skills/references/git-workflow-procedures.md).

> **Scope vorab gegen SSOT-Allowlist prüfen [T001395]:** `preflight-pr-scope.sh` (Schritt 4) läuft
> erst nach dem Commit. Vor dem ersten Commit die erlaubte Liste ziehen:
> `bash scripts/validate-commit-msg.sh scopes`.

### Commit ausführen

> **git-crypt-Staging-Guard [T001210]:** Niemals `git add -A` in diesem Repo.
> `environments/.secrets/**` ist git-crypt-geschützt; in Worktrees erscheinen Smudge-Artefakte als
> "modified" und würden mitcommittet. Immer explizite Pathspecs stagen und den Index-Guard laufen lassen.

```bash
BASE_SHA="$(git rev-parse HEAD)"

git add <spezifische Dateien>   # explizite Pathspecs — NIEMALS git add -A (git-crypt + .env-Leaks)

# Secret-in-index-Guard (T001210): abbrechen, falls git-crypt-Pfade im Index gelandet sind
if git diff --cached --name-only | grep -q '^environments/.secrets/'; then
  echo "FATAL: environments/.secrets/** darf nicht gestaged sein (git-crypt)" >&2
  git diff --cached --name-only | grep '^environments/.secrets/' | sed 's/^/  /' >&2
  exit 1
fi

git commit -m "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"

# Commit-Verifikation — git-crypt clean filter kann in Worktrees still scheitern [T000925]
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: Commit ist nicht gelandet (git-crypt clean filter?). Push abgebrochen." >&2
  exit 1
fi
```

---

## Schritt 3 — Push

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
# Bei rejected (non-fast-forward im selben Feature-Branch):
# git push --force-with-lease   — NUR für eigene Feature-Branches, NIEMALS für main
```

> **Push auf `main`:** `bash scripts/git-safe-push.sh` statt rohem `git push`. Der Wrapper heilt
> eine *inhalts-äquivalente* Divergenz (Squash-Merge, freshness-regen-Bot-Commit) per
> `git reset --hard origin/main`, nur bei sauberem Working Tree; echte Divergenz wird nur gewarnt.
> Opt-out: `SKIP_PUSH_SYNC=1`.

---

## Schritt 4 — PR-Erstellung

### Scope-Preflight (Pflicht vor `gh pr create`) [T000925]

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"
# Schlägt fehl bei ungültigem Scope → korrigieren, dann erneut prüfen
```

> **Titel nachträglich editieren (REST-Fallback):** `gh pr edit --title` scheitert
> gelegentlich an einer Projects-Classic-GraphQL-Deprecation. Stattdessen:
> ```bash
> gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
> ```

### PR anlegen

`gh pr create --title "<type>(<scope>): <subject> [<TICKET_EXT_ID>]" --body ...` — Body-Vorlage
(Summary + Test Plan): [git-workflow-procedures](.opencode/skills/references/git-workflow-procedures.md).

---

## Schritt 5 — CI Fix Loop

Nach dem Push CI überwachen und Fehler beheben **bevor** gemergt wird.
Detaillierte Checkliste (SSOT): [ci-fix-loop](.opencode/skills/references/ci-fix-loop.md)

1. `gh pr checks <n> --watch` — warten bis alle Required Checks grün sind
2. Bei Fehler: Log lesen, lokal fixen, committen, pushen — Loop wiederholen
3. Bei `CONFLICTING` PR-Status: `git fetch origin main && git rebase origin/main` → push

> **Hinweis:** `CONFLICTING`-Status unterdrückt CI-Runs komplett — CI startet nie.
> Diagnose: `gh pr view <n> --json mergeStateStatus`.

> **Freshness-Auto-Regen-Race [T001395]:** Ein offener PR kann auf `CONFLICTING` kippen, weil der
> Scheduler generierte Artefakte auf `main` committet hat. Der Rebase braucht dann zusätzlich
> `task freshness:regenerate` vor dem Push. Befehlsfolge:
> [git-workflow-procedures](.opencode/skills/references/git-workflow-procedures.md).

---

## Schritt 6 — Merge

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```

- **Immer `--squash`** — hält `main`-History sauber (Entwicklungsregel)
- **KEIN `--delete-branch` (T004612)** — das Post-Merge-Archiv (OpenSpec, Schritt 7) braucht den
  Branch noch; gelöscht wird er im Cleanup NACH der Archivierung. `delete_branch_on_merge` ist
  repo-seitig deaktiviert; branch-reaper.sh räumt Verwaiste ab.
- **`--auto`** — mergt automatisch wenn alle Required Checks grün sind; kehrt sofort zurück, der
  Merge läuft asynchron. `edited`-Runs brechen laufende CI-Jobs nicht ab (T002248).

---

## Schritt 7 — Post-Merge Cleanup (Worktrees)

Nur wenn in einem `.worktrees/*`-Worktree gearbeitet wurde:

```bash
WORKTREE_PATH="$(git rev-parse --show-toplevel)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

cd "$MAIN_REPO"
# Agent-Lock freigeben (T006290): erst im Haupt-Repo — aus dem Worktree heraus verweigert
# agent-lock.sh den Branch-Release. Ohne stderr-Unterdrückung, damit eine Verweigerung
# sichtbar bleibt. Lebenszyklus-SSOT: .opencode/skills/references/session-coordination.md
bash scripts/agent-lock.sh release ticket "<T00XXXX>"
bash scripts/agent-lock.sh release branch "$BRANCH_NAME"
git worktree remove "$WORKTREE_PATH"
git worktree prune

# T004612: der Merge löscht den Remote-Branch nicht — erst hier, NACH dem Archiv, löschen.
git push origin --delete "$BRANCH_NAME"
# Squash-Commit ist ein neuer Commit, `git branch -d` würde fehlschlagen; `-D` ist nötig.
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
  git branch -D "$BRANCH_NAME"
fi
```

---

## Worktree-Erstellung — zwei Wege, nur einer ist git-crypt-sicher

1. **`scripts/worktree-create.sh` (empfohlen):** legt den Worktree mit Kopie des
   git-crypt-Keys an und neutralisiert die smudge/clean/required-Filter. Immer
   verwenden, wenn der Branch `environments/.secrets/**` beruehrt.

   ```bash
   bash scripts/worktree-create.sh <branch> .worktrees/<slug>
   ```

2. **opencode-Plugin `worktree_create` (`worktree.ts`):** `git worktree add` **ohne** die
   git-crypt-Filter zu neutralisieren. Scheitert auf verschluesselten Pfaden (exit 128) oder
   hinterlaesst `environments/.secrets/**` unbrauchbar. **Bekannte Einschraenkung:** nur fuer
   Branches sicher, die keine git-crypt-Pfade beruehren.

---

## Nachschlagewerk

Schritt-Übersicht (0–7) und Fehlertabelle „Symptom → Diagnose → Fix" (Commit landet nicht, CI
startet nie, stale artifact, S1-Ratchet, PR-Scope invalid, falscher Cluster):
[git-workflow-procedures](.opencode/skills/references/git-workflow-procedures.md).

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `superpowers:using-git-worktrees` | **[Plugin]** Worktree korrekt anlegen (git-crypt-safe) |
| `superpowers:finishing-a-development-branch` | **[Plugin]** Optionen nach Implementierung |
| `dev-flow-chore` | Chore-Ablauf (nutzt diesen Skill intern) |
| `dev-flow-execute` | Feature/Fix-Ablauf (nutzt diesen Skill intern) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

