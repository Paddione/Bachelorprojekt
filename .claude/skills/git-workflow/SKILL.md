---
name: git-workflow
description: 'Use whenever committing, pushing, creating a PR, or finishing work on any branch. Covers the complete repo-specific git lifecycle: pull-first, commit conventions, freshness guard, commit verification, PR creation with scope preflight, CI fix loop, auto-merge, and worktree cleanup.'
---

# Git Workflow — vollständiger Lifecycle für dieses Repo

**Sage zu Beginn:** "Ich nutze git-workflow für den Commit/PR-Ablauf."

Dieser Skill ist die **SSOT für Commit → Push → PR → Merge → Cleanup** — die `dev-flow-*`-Skills
verweisen auf die Schritte hier statt sie zu duplizieren. Für read/view-GitHub-Flows (Anzeige) den
Wrapper `gh-axi` bevorzugen; sobald `--json`/`-q`/Polling/Mutation im Spiel ist: `gh` direkt (T004612)
([gh-axi](file:///home/patrick/Bachelorprojekt/.claude/skills/references/gh-axi.md)).

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

> **Stash-Pop positive Verifikation (T069/T070).** Nach dem Pop den eigenen
> Eintrag (per Nachricht identifiziert) in `git stash list` suchen — er MUSS
> verschwunden sein:
>
> ```bash
> bash scripts/git-stash-net.sh pop --by-message "wip ${TICKET_EXT_ID}"
> # Exit 1 = Teil-Pop: git stash list | grep -F "wip ${TICKET_EXT_ID}" findet den Eintrag noch
> ```
>
> Ein verbliebener Eintrag ist ein **Befund, kein Erfolg**: der post-rewrite-Hook
> hat ein gestashtes Freshness-Artefakt während des Rebase bereits neu erzeugt,
> der Pop wendet nur teilweise an und meldet trotzdem Erfolg. Wiederherstellung:
> `git stash show --stat "stash@{0}"` gegen den Arbeitsbaum halten, fehlende
> Datei mit `git checkout "stash@{0}" -- <pfad>` zurückholen. Der Eintrag bleibt
> dabei als Sicherungsnetz liegen.

> **Stash-Disziplin (T070).** `refs/stash` liegt im gemeinsamen Git-Verzeichnis —
> der Stash-Stack ist über ALLE Worktrees geteilt, und die Indizes `stash@{0}`
> verschieben sich durch fremde pushes. Bei Parallelarbeit daher statt eines
> Stash einen **Wegwerf-Commit auf dem eigenen Branch** verwenden
> (`git commit -m wip`, später `git reset --soft HEAD~1`). Wo ein Stash nötig
> bleibt: IMMER mit `-m` und Ticket-ID anlegen
> (`git stash push -m "wip ${TICKET_EXT_ID}"`) und über die Nachricht auflösen
> (`bash scripts/git-stash-net.sh pop --by-message ...`), NIE über den Index
> `stash@{0}`.

> **Branch-Switch + Stash Race (T001974 Mishap 2).** Niemals
> `git checkout -b <branch> && git stash pop` in einer einzigen Pipeline
> verketten. Der `stash pop` kann ausgeführt werden, bevor der
> Branch-Switch abgeschlossen ist, sodass der Commit auf dem falschen Branch
> (z. B. `main`) landet. Stattdessen explizit sequenziell mit Error-Check:
>
> ```bash
> git checkout -b fix/my-branch || exit 1   # Branch-Switch abwarten
> git stash pop || { echo "stash pop failed"; exit 1; }
> ```
>
> Das gleiche Muster gilt für `git reset --soft` → `git stash` →
> `git checkout -b` → `git stash pop`: jeder Schritt muss den Abschluss des
> vorherigen abwarten.

> **Probe-Commit + `--hard` verwirft auch unstaged Dateien (T001454, wiederholt bei
> T002252/T002253).** Das Muster "Probe committen → prüfen → `git reset -q --hard HEAD~1`
> zurückrollen" wirkt lokal begrenzt, weil scheinbar nur der eigene Probe-Commit adressiert
> wird — `--hard` unterscheidet aber nicht zwischen Commit-Rollback und Working-Tree-Verwurf
> und reißt unstaged Arbeitsdateien mit. Sicher:
> ```bash
> git stash -u && git reset --hard HEAD~1 && git stash pop
> ```
> Oder den Probe erst gar nicht committen, sondern in einem separaten Wegwerf-Worktree testen.

---

## Schritt 1 — Verifikation & Freshness Guard (vor dem Commit)

### Rebase-Preflight (T002669)

Schritt 0 (Pull-First) lief ggf. vor Minuten oder Stunden. In langen Sessions kann
`origin/main` seitdem weitergerückt sein (z. B. durch parallele Releases oder andere gemergte
PRs, die ebenfalls generierte Artefakte berühren). Die Artefakt-Regeneration weiter unten
erzeugt Artefakte aus dem aktuellen Arbeitsbaum — ist der veraltet, produziert sie Artefakte,
die beim Push erneut hinter `origin/main` zurückliegen (beobachtet bei PR #3788 / T002634:
zwei Regen-Commit-Push-Zyklen à ~1–2 min). Deshalb unmittelbar davor ein zweites Mal auf
Divergenz prüfen und bei Bedarf rebasen:

```bash
git fetch origin main
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "${BEHIND:-0}" -gt 0 ]; then
  echo "⚠ ${BEHIND} commit(s) hinter origin/main — rebase VOR dem Freshness-Regen-Lauf:"
  git pull --rebase origin main
  # Konflikte? Dem User anzeigen und klären (wie Schritt 0).
fi
```

Erst danach `task freshness:regenerate` ausführen — sonst regeneriert man gegen eine bereits
veraltete Basis und der Zyklus beginnt von vorn.

### Rebase-Freshness-Regel (T003105)

Ein **konfliktfreier** Rebase kann mitcommittete Freshness-Artefakte still verlieren:
`.gitattributes` markiert sie mit `merge=ours`, und `ours` löst im Rebase zugunsten
des Rebase-Basis-Zweigs (hier `origin/main`) auf — **ohne** Konfliktmarker, ohne Meldung,
mit grünem Ergebnis. Ein grüner Rebase belegt die Artefakt-Vollständigkeit deshalb nicht.

Regel: **Nach JEDEM Rebase VOR dem Push `task freshness:check` erneut laufen lassen.**
Rot? `task freshness:regenerate` und den Regen-Commit anhängen. Das gilt für den
Rebase in Schritt 0, für den Rebase-Preflight hier und für jeden `git rebase`/
`git pull --rebase` im CI-Fix-Loop (Schritt 5).

Vollständiger Verify-Block (die vier Befehle, S1-Ratchet, Freshness-Artefakt-Liste zum Stagen):
**SSOT** in [verification-block](file:///home/patrick/Bachelorprojekt/.claude/skills/references/verification-block.md).

Kurzform: `task freshness:regenerate` (Artefakte aktuell halten, dann stagen) +
`task freshness:check` (CI-Äquivalent, S1-Ratchet). Falls S1 rot: Datei wirklich verkleinern,
nicht kosmetisch Zeilen zusammenziehen.

---

## Schritt 2 — Commit

### Conventional Commits — Pflichtformat

```
<type>(<scope>): <subject> [<TICKET_EXT_ID>]
```

Header ≤ 100 Zeichen, Ticket-ID immer anhängen. Die vollständige `type`/`scope`-Liste, Beispiele,
die PR-Body-Vorlage und das Vorgehen für einen **noch nicht registrierten Scope**
(`scripts/register-scope.sh` + `commitlint.config.cjs` mitcommitten, T001364) stehen in
[git-workflow-procedures](file:///home/patrick/Bachelorprojekt/.claude/skills/references/git-workflow-procedures.md).

> **Scope vorab gegen SSOT-Allowlist prüfen [T001395]:** `preflight-pr-scope.sh` (Schritt 4) läuft
> erst kurz vor `gh pr create` — also NACH dem Commit. Ein falsch geratener Scope führt dann zu
> einem Soft-Reset + Recommit mitten im Flow. Vor dem ersten Commit die erlaubte Liste ziehen und
> daraus wählen: `bash scripts/validate-commit-msg.sh scopes`.

### Commit ausführen

> **git-crypt-Staging-Guard [T001210]:** Niemals `git add -A` in diesem Repo.
> `environments/.secrets/**` ist git-crypt-geschützt; in Worktrees erscheinen ~21
> Smudge-Artefakte als "modified" und würden durch ein blankes `git add -A` in den Commit
> promoviert. Immer explizite Pathspecs stagen und den Index-Guard unten laufen lassen.

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

> **Push auf `main`:** Verwende `bash scripts/git-safe-push.sh` statt rohem
> `git push`. Der Wrapper fetcht nach dem Push `origin/main` und heilt eine
> *inhalts-äquivalente* Divergenz (z. B. Squash-Merge oder freshness-regen-Bot-
> Commit) automatisch per `git reset --hard origin/main` — aber nur bei sauberem
> Working Tree; eine echte Divergenz wird nur gewarnt, nie automatisch verworfen.
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

`gh pr create --title "<type>(<scope>): <subject> [<TICKET_EXT_ID>]" --body ...` — die
Body-Vorlage (Summary + Test Plan) und der REST-Fallback für nachträgliche Titel-Edits stehen in
[git-workflow-procedures](file:///home/patrick/Bachelorprojekt/.claude/skills/references/git-workflow-procedures.md).

---

## Schritt 5 — CI Fix Loop

Nachdem der PR gepusht ist: CI überwachen und Fehler beheben **bevor** gemergt wird.

Detaillierte Checkliste (SSOT): [ci-fix-loop](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ci-fix-loop.md)

Kurzfassung:
1. `gh pr checks <n> --watch` — warten bis alle Required Checks grün sind
2. Bei Fehler: Log lesen, lokal fixen, committen, pushen — Loop wiederholen
3. Bei `CONFLICTING` PR-Status: `git fetch origin main && git rebase origin/main` → push

> **Hinweis:** `CONFLICTING`-Status unterdrückt CI-Runs komplett — kein "CI läuft noch",
> sondern "CI startet nie". Diagnose: `gh pr view <n> --json mergeStateStatus`.

> **Freshness-Auto-Regen-Race [T001395]:** Bleibt ein PR über einen geplanten
> Freshness-Auto-Regen-Zyklus offen, kippt er auf `CONFLICTING`, ohne dass ein Mensch etwas
> geändert hat — der Scheduler hat generierte Artefakte auf `main` committet. Kein echter
> Merge-Konflikt; der Rebase muss dann um `task freshness:regenerate` ergänzt werden, **bevor**
> gepusht wird. Befehlsfolge:
> [git-workflow-procedures](file:///home/patrick/Bachelorprojekt/.claude/skills/references/git-workflow-procedures.md).

---

## Schritt 6 — Merge

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```

- **Immer `--squash`** — hält `main`-History sauber (Entwicklungsregel)
- **KEIN `--delete-branch` (T004612)** — das Post-Merge-Archiv (OpenSpec, Schritt 7) braucht den
  Branch noch; gelöscht wird er erst im Cleanup NACH der Archivierung.
  `delete_branch_on_merge` ist repo-seitig deaktiviert; branch-reaper.sh räumt Verwaiste ab.
- **`--auto`** — mergt automatisch wenn alle Required Checks grün sind
- **Race-Hinweis:** `--auto` kehrt sofort zurück; der eigentliche Merge passiert asynchron. CI-Läufe, die durch `edited`-Events (PR-Titel-Edit) getriggert wurden, können noch laufen. `cancel-in-progress` in `ci.yml` wurde so angepasst, dass `edited`-Runs keine laufenden CI-Jobs abbrechen (T002248).

---

## Schritt 7 — Post-Merge Cleanup (Worktrees)

Nur wenn in einem `.worktrees/*`-Worktree gearbeitet wurde:

```bash
WORKTREE_PATH="$(git rev-parse --show-toplevel)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

cd "$MAIN_REPO"
git worktree remove "$WORKTREE_PATH"
git worktree prune

# T004612: der Merge löscht den Remote-Branch NICHT mehr (kein --delete-branch,
# delete_branch_on_merge=false) — die Archivierung (Schritt 7) brauchte ihn. Erst
# hier, NACH dem Archiv, remote + lokal löschen:
git push origin --delete "$BRANCH_NAME"
# Der Squash-Commit auf main ist ein neuer Commit — Git erkennt den Branch nicht
# als "merged", `git branch -d` würde fehlschlagen; `-D` ist nötig.
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
  git branch -D "$BRANCH_NAME"
fi
```

Agent-Lock freigeben (`release ticket` + `release branch`, VOR dem Worktree-Remove) —
Lebenszyklus-SSOT: [session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md).

---

## Nachschlagewerk

Schritt-Übersicht (0–7 auf einen Blick) und die Fehlertabelle „Symptom → Diagnose → Fix"
(Commit landet nicht, CI startet nie, stale artifact, S1-Ratchet, PR-Scope invalid, falscher
Cluster) stehen in
[git-workflow-procedures](file:///home/patrick/Bachelorprojekt/.claude/skills/references/git-workflow-procedures.md).

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `superpowers:using-git-worktrees` | Worktree korrekt anlegen (git-crypt-safe) |
| `superpowers:finishing-a-development-branch` | Optionen nach Implementierung |
| `dev-flow-chore` | Chore-Ablauf (nutzt diesen Skill intern) |
| `dev-flow-execute` | Feature/Fix-Ablauf (nutzt diesen Skill intern) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

