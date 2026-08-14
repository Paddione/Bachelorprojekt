---
name: opencode-git-workflow
description: Use whenever committing, pushing, creating a PR, or finishing work on any branch in opencode. Covers the complete repo-specific git lifecycle: pull-first, commit conventions, freshness guard, commit verification, PR creation with scope preflight, CI fix loop, auto-merge, and worktree cleanup.
---

# opencode-git-workflow — vollständiger Git-Lifecycle für dieses Repo (opencode)

**Sage zu Beginn:** "Ich nutze opencode-git-workflow für den Commit/PR-Ablauf."

Dieser Skill ist die **SSOT für Commit → Push → PR → Merge → Cleanup** in opencode. Die `opencode-flow-*`-Skills verweisen auf die Schritte hier statt sie zu duplizieren. Für GitHub-Read/View-Flows (Anzeige) `gh-axi` bevorzugen; sobald `--json`/`-q`/Polling/Mutation im Spiel ist: `gh` direkt (T004612, Repos: `Paddione/Bachelorprojekt`).

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

> **Stash-Pop positive Verifikation (T003069/T003070).** Nach dem Pop den eigenen
> Eintrag (per Nachricht identifiziert) in `git stash list` suchen — er MUSS
> verschwunden sein. Exit 1 von `scripts/git-stash-net.sh` = Teil-Pop-Befund:
> `git stash show --stat "stash@{0}"` gegen den Arbeitsbaum halten, fehlende
> Datei mit `git checkout "stash@{0}" -- <pfad>` zurückholen. Der Eintrag
> bleibt als Sicherungsnetz liegen.

> **Stash-Disziplin (T003070).** `refs/stash` liegt im gemeinsamen
> Git-Verzeichnis — der Stash-Stack ist über ALLE Worktrees geteilt, die
> Indizes `stash@{0}` verschieben sich durch fremde pushes. Bei Parallelarbeit
> statt eines Stash einen **Wegwerf-Commit auf dem eigenen Branch** verwenden
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

> **Probe-Commit + `--hard` verwirft auch unstaged Dateien (T001454, T002252/T002253).**
> `--hard` unterscheidet nicht zwischen Commit-Rollback und Working-Tree-Verwurf
> und reißt unstaged Arbeitsdateien mit. Sicher:
> ```bash
> git stash -u && git reset --hard HEAD~1 && git stash pop
> ```

---

## Schritt 1 — Verifikation & Freshness Guard (vor dem Commit)

Vollständiger Verify-Block (die vier Befehle, S1-Ratchet, Freshness-Artefakt-Liste zum Stagen):
**SSOT** in `.claude/skills/references/verification-block.md`.

Kurzform: `task freshness:regenerate` + `task freshness:check` (CI-Äquivalent, S1-Ratchet).

### Rebase-Freshness-Regel (T003105)

Ein **konfliktfreier** Rebase kann mitcommittete Freshness-Artefakte still verlieren:
`.gitattributes` markiert sie mit `merge=ours`, und `ours` löst im Rebase zugunsten
des Rebase-Basis-Zweigs (hier `origin/main`) auf — **ohne** Konfliktmarker, ohne Meldung,
mit grünem Ergebnis. Ein grüner Rebase belegt die Artefakt-Vollständigkeit deshalb nicht.

Regel: **Nach JEDEM Rebase VOR dem Push `task freshness:check` erneut laufen lassen.**
Rot? `task freshness:regenerate` und den Regen-Commit anhängen. Das gilt für den
Rebase in Schritt 0, für den Rebase-Preflight und für jeden `git rebase` /
`git pull --rebase` im CI-Fix-Loop (Schritt 5).

---

## Schritt 2 — Commit

### Conventional Commits — Pflichtformat

```
<type>(<scope>): <subject> [<TICKET_EXT_ID>]
```

- **Header ≤ 100 Zeichen**
- `type`: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`
- `scope`: betroffenes Modul / Verzeichnis
- `TICKET_EXT_ID`: z. B. `T001026` — **immer anhängen**
- Body-Zeilen ebenfalls < 100 Zeichen

> **Scope vorab gegen SSOT-Allowlist prüfen [T001395]:** `preflight-pr-scope.sh` (Schritt 4) läuft
> erst kurz vor `gh pr create` — also NACH dem Commit. Ein falsch geratener Scope führt dann zu
> einem Soft-Reset + Recommit. Vor dem ersten Commit die erlaubte Liste ziehen:
> `bash scripts/validate-commit-msg.sh scopes`

### Commit ausführen

> **git-crypt-Staging-Guard:** Niemals `git add -A`. `environments/.secrets/**` ist git-crypt-geschützt. Immer explizite Pathspecs stagen.

```bash
BASE_SHA="$(git rev-parse HEAD)"

git add <spezifische Dateien>

# Secret-in-index-Guard (T001210): abbrechen, falls git-crypt-Pfade im Index gelandet sind
if git diff --cached --name-only | grep -q '^environments/.secrets/'; then
  echo "FATAL: environments/.secrets/** darf nicht gestaged sein (git-crypt)" >&2
  git diff --cached --name-only | grep '^environments/.secrets/' | sed 's/^/  /' >&2
  exit 1
fi

git commit -m "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"

HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: Commit ist nicht gelandet (git-crypt clean filter?)." >&2
  exit 1
fi
```

---

## Schritt 3 — Push

```bash
git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
# Bei rejected (non-fast-forward): git push --force-with-lease — NUR für eigene Branches
```

> **Push auf `main`:** `bash scripts/git-safe-push.sh` verwenden. Opt-out: `SKIP_PUSH_SYNC=1`.

---

## Schritt 4 — PR-Erstellung

### Scope-Preflight (Pflicht vor `gh pr create`)

```bash
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject> [<TICKET_EXT_ID>]"
```

> **Titel nachträglich editieren (REST-Fallback):**
> ```bash
> gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
> ```

### PR anlegen

```bash
gh pr create \
  --title "<type>(<scope>): <subject> [<TICKET_EXT_ID>]" \
  --body "$(cat <<'EOF'
## Summary
- <was wurde geändert>
- <warum>

## Test Plan
- [ ] CI grün

[TICKET_EXT_ID]
EOF
)"
```

---

## Schritt 5 — CI Fix Loop

Nachdem der PR gepusht ist: CI überwachen und Fehler beheben **bevor** gemergt wird. SSOT: `.claude/skills/references/ci-fix-loop.md`.

Kurzfassung:
1. `gh pr checks <n> --watch` — warten bis alle Required Checks grün sind
2. Bei Fehler: Log lesen, lokal fixen, committen, pushen — Loop wiederholen
3. Bei `CONFLICTING` PR-Status: `git fetch origin main && git rebase origin/main` → push
4. Bei `CONFLICTING` nach Auto-Regen: `git fetch origin main && git rebase origin/main && task freshness:regenerate && git add <regenerierte> && git rebase --continue && git push --force-with-lease`

> **Freshness-Auto-Regen-Race [T001395]:** Bleibt ein PR über einen geplanten
> Freshness-Auto-Regen-Zyklus offen, kippt er auf `CONFLICTING`, ohne dass ein Mensch etwas
> geändert hat — der Scheduler hat generierte Artefakte auf `main` committet. Kein echter
> Merge-Konflikt; der Rebase muss dann um `task freshness:regenerate` ergänzt werden, **bevor**
> gepusht wird.

---

## Schritt 6 — Merge

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --auto --squash)
```

- **Immer `--squash`**
- **KEIN `--delete-branch` (T004612)** — das Post-Merge-OpenSpec-Archiv (Schritt 7) braucht den
  Branch noch; gelöscht wird er erst im Cleanup NACH der Archivierung.
  `delete_branch_on_merge` ist repo-seitig deaktiviert.
- **`--auto`** — mergt automatisch wenn alle Required Checks grün sind
- **Race-Hinweis:** `--auto` kehrt sofort zurück; der eigentliche Merge passiert asynchron. CI-Läufe, die durch `edited`-Events (PR-Titel-Edit) getriggert wurden, können noch laufen. `cancel-in-progress` in `ci.yml` wurde so angepasst, dass `edited`-Runs keine laufenden CI-Jobs abbrechen (T002248).

---

## Schritt 7 — Post-Merge Cleanup (Worktrees)

```bash
WORKTREE_PATH="$(git rev-parse --show-toplevel)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

cd "$MAIN_REPO"
git worktree remove "$WORKTREE_PATH"
git worktree prune
# Remote-Branch erst NACH der Archivierung löschen (T004612 — der Merge löscht nicht mehr):
git push origin --delete "$BRANCH_NAME"
```

Agent-Lock freigeben VOR dem Worktree-Remove.

---

## Worktree creation (opencode-native)

In opencode sind zwei Wege verfügbar:

1. **`scripts/worktree-create.sh` (empfohlen, git-crypt-safe):** Erstellt den Worktree mit git-crypt-Key-Kopie und neutralisiert smudge/clean/required-Filter. Immer verwenden, wenn der Branch `environments/.secrets/**` berührt.

2. **`worktree.ts` Plugin (`worktree_create`):** Erstellt einen Worktree mit `git worktree add` mit Checkout, aber **ohne git-crypt-Filter-Neutralisierung**. Auf diesem git-crypt-verwalteten Repo schlägt die Checkout-Phase auf verschlüsselten Pfaden fehl (exit 128) oder hinterlässt `environments/.secrets/**` mit einem veralteten smudge-Filter unbrauchbar. **Bekannte Einschränkung:** `worktree_create` ist nur für Branches sicher, die keine git-crypt-Pfade berühren.

```bash
# Empfohlen (git-crypt-safe):
bash scripts/worktree-create.sh <branch> .worktrees/<slug>
```

---

## Quick-Reference

| Schritt | Was | Wann |
|---------|-----|------|
| 0 | `git pull --rebase` | Immer als erstes |
| 1 | `task freshness:regenerate` | Wenn Code-Dateien geändert wurden |
| 2 | Conventional Commit + Ticket-ID | Jeder Commit |
| 2 | Commit-Verifikation (HEAD_SHA != BASE_SHA) | Nach jedem Commit in Worktrees |
| 3 | `git push -u origin <branch>` | Einmalig, danach plain `git push` |
| 4 | `preflight-pr-scope.sh` + `gh pr create` | Einmal pro PR |
| 5 | CI Fix Loop | Bis alle Required Checks grün |
| 6 | `gh pr merge --auto --squash` (kein `--delete-branch`, T004612) | Wenn CI grün |
| 7 | `git worktree remove` + Lock-Release | Nur bei Worktree-Arbeit |

---

## Häufige Fehler

| Fehler | Diagnose | Fix |
|--------|----------|-----|
| Commit landet nicht (git-crypt) | `git rev-parse HEAD == BASE_SHA` | `git status`, dann erneut committen |
| CI startet nie | `gh pr view <n> --json mergeStateStatus` → `CONFLICTING` | `git rebase origin/main` |
| Stale artifact in CI | `task freshness:check` lokal rot | `task freshness:regenerate && git add && git commit` |
| PR-Scope invalid | `preflight-pr-scope.sh` Exit 1 | Scope korrigieren, neu prüfen |
| Falscher Cluster gedeployt | `ENV=` vergessen gesetzt | Immer `ENV=mentolder` / `ENV=korczewski` explizit |

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-flow-chore` | Chore-Ablauf (nutzt diesen Skill intern) |
| `opencode-flow-execute` | Feature/Fix-Ablauf (nutzt diesen Skill intern) |
| `scripts/worktree-create.sh` | Git-crypt-safe worktree creator |
| `worktree.ts` Plugin | Opencode-native primitive (git-crypt-limited) |
| `.claude/skills/references/git-workflow-procedures.md` | Detail-Referenz (Schritt-Übersicht, Fehlertabelle) |
| `using-git-worktrees` | Worktree korrekt anlegen (git-crypt-safe) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — native skill for opencode. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |