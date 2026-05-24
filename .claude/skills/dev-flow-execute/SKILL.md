---
name: dev-flow-execute
description: Use when on a feature/* or fix/* branch that has a staged plan in docs/superpowers/plans/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern,
> configuration drift, or **process friction** you notice — even if unrelated
> to the current task — add an entry with:
>   `type` (broken/degraded/suspicious/security/drift/**process**),
>   `title`, `description`, and `component`.
>
> `process` = a step that required a manual workaround, had wrong/missing instructions,
> or caused unexpected friction. `component` MUST use format `skills/<skill-name>`. Example:
>   `{type: process, title: "wss patch required manual retry",
>     description: "scripts/superpowers-helper-patch.sh failed silently — step 2b needs exit-code check",
>     component: "skills/dev-flow-plan"}`
>
> Invoke `mishap-tracker` at the very end.

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `dev-flow-plan` hat Spec und Plan committed und gepusht. Jetzt soll implementiert werden.

**Sage zu Beginn:** "Ich nutze dev-flow-execute zur Plan-Ausführung."

---

## Schritt −2: Kontext-Reset + Sonnet 4.6 (medium) — Execute-Gate

dev-flow-execute braucht keinen Brainstorming- oder Plan-Geschichte-Ballast — der Plan liegt auf Disk. Frischer Kontext + schnelleres Modell = sauberere, zügigere Ausführung.

**⚡ STOP — führe diese Befehle jetzt aus (falls nicht bereits geschehen), dann lies Schritt −1:**

```
/model claude-sonnet-4-6
```
```
/clear
```

Nach dem Clear: Der Plan-Pfad und Branch-Name sind die einzigen Inputs — beide stehen auf Disk (Schritt 1 liest sie). Kein weiterer Kontext nötig.

---

## Schritt −1: Main-Branch im Haupt-Repo synchronisieren (Pull-First)

Bevor irgendetwas passiert: sicherstellen, dass `main` im Haupt-Repo aktuell ist.
Dieser Schritt läuft **im Haupt-Repo** (nicht im Worktree).

```bash
# Haupt-Repo-Pfad ermitteln (erstes Ergebnis von worktree list = Haupt-Repo)
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')

(cd "$MAIN_REPO" && \
  git fetch origin main && \
  if git diff --quiet HEAD; then
    git pull --rebase origin main
  else
    echo "Lokale Änderungen im Haupt-Repo erkannt — stashe..."
    git stash
    git pull --rebase origin main
    git stash pop
    echo "Stash zurückgespielt. Konflikte bitte prüfen."
  fi
)
```

Falls `git stash pop` Konflikte meldet: dem User anzeigen und warten.

---

## Schritt 0: Worktree-Konsistenz prüfen

```bash
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_DIR=$(pwd)
echo "Branch: $CURRENT_BRANCH | CWD: $CURRENT_DIR"
```

**Zuerst: Erkennung von main + ungetrackter Plan-Datei (härtester Fall):**

```bash
if [[ "$(git branch --show-current)" == "main" ]]; then
  UNTRACKED_PLANS=$(git ls-files --others --exclude-standard docs/superpowers/plans/ 2>/dev/null | grep '\.md$' | grep -v '/executed/')
  if [[ -n "$UNTRACKED_PLANS" ]]; then
    echo "🛑 HALT: Auf main-Branch mit ungetrackter Plan-Datei erkannt:"
    echo "$UNTRACKED_PLANS"
    # Slug + Branch-Prefix automatisch ableiten
    PLAN_FILE=$(echo "$UNTRACKED_PLANS" | head -1)
    PLAN_BASENAME=$(basename "$PLAN_FILE" .md)
    PLAN_TYPE=$(grep -m1 '^type:' "$PLAN_FILE" 2>/dev/null | awk '{print $2}')
    BRANCH_PREFIX="${PLAN_TYPE:-feature}"
    TARGET_BRANCH="${BRANCH_PREFIX}/${PLAN_BASENAME}"
    echo ""
    echo "Automatische Korrektur (führe diese Befehle aus und starte dev-flow-execute erneut):"
    echo "  git checkout -b $TARGET_BRANCH"
    echo "  git add $PLAN_FILE"
    echo "  git commit -m 'plan: add $PLAN_BASENAME'"
    echo "  git push -u origin $TARGET_BRANCH"
  fi
fi
```

Falls der Block einen HALT ausgegeben hat: **STOP**. Branch erstellen + Plan committen, dann dev-flow-execute erneut starten. Oder die obigen Befehle automatisch ausführen und direkt fortfahren — nur wenn der User explizit bestätigt.

---

Prüfe danach:

| Situation | Aktion |
|---|---|
| `$CURRENT_BRANCH` ist `main` **und** ungetrackte Plan-Datei existiert | 🛑 HALT (siehe oben). |
| `$CURRENT_BRANCH` ist `main` und `$CURRENT_DIR` ist das Haupt-Repo | ⚠️ Falscher Ausgangspunkt. Wechsle in den Feature-Worktree: `git worktree list` zeigt den Pfad. |
| Branch passt zum Pfad (z.B. `feature/foo` in `.../Bachelorprojekt-feature-foo`) | ✓ Fortfahren. |
| Branch existiert, aber Worktree-Pfad ist ein anderer Claude-Prozess aktiv | ⚠️ Nicht in denselben Worktree schreiben. Warte auf den anderen Prozess oder nutze `git worktree list` zur Koordination. |

```bash
# Parallel laufende Claude-Prozesse sichtbar machen
git worktree list --porcelain | grep -E '^(worktree|branch)'
```

Kein Blocker — nur Warnung und Bestätigung vom User, wenn Überschneidung erkannt wird.

---

## Schritt 0.5: Sync mit main

Bevor irgendein Agent Code schreibt, Branch auf `origin/main` rebsen — verhindert Merge-Konflikte im PR.

```bash
git fetch origin main
git rebase origin/main
git submodule update --init --recursive
```

> **Nach Rebase — erster Push:** Falls der Branch schon gepusht war, schlägt `git push` fehl ("rejected ... non-fast-forward"). Lösung: `git push --force-with-lease origin <branch>`. `--force-with-lease` ist sicherer als `--force` — schlägt fehl wenn jemand anderes seit dem letzten Fetch gepusht hat.

Falls `git rebase` Konflikte meldet:

```bash
# Konfliktdateien anzeigen
git diff --name-only --diff-filter=U

# Rebase abbrechen — Agent darf NICHT mit Konflikten weitermachen
git rebase --abort
```

**STOPP.** Melde die Konflikt-Dateien an den User. Erst nach manueller Auflösung (`git rebase origin/main` erneut, dann `git rebase --continue`) weitermachen.

---

## Schritt 1: Plan finden

**Default — neuester Plan:**

```bash
ls -t docs/superpowers/plans/*.md 2>/dev/null | grep -v '/executed/' | head -1
```

**Falls User "show all" oder "wähle" sagt:**

```bash
ls -t docs/superpowers/plans/*.md 2>/dev/null | grep -v '/executed/'
```

→ Liste anzeigen, User wählt den Plan (z.B. wenn mehrere Features parallel gepusht wurden und die Reihenfolge wichtig ist).

Lese den gewählten Plan vollständig. Ermittle den Pfad aus dem Branch-Name-Prefix (`feature/` → Feature, `fix/` → Fix) oder dem `domains`-Frontmatter-Feld.

Extrahiere die Ticket-ID aus dem Frontmatter (falls vorhanden):

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
TICKET_ID=$(awk '/^ticket_id:/{print $2; exit}' "$PLAN_FILE")
# z.B. TICKET_ID=T000301 — leer wenn kein Ticket im Plan
```

---

## Schritt 1.5: Ticket auf `in_progress` setzen

Falls `$TICKET_ID` gesetzt:

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "UPDATE tickets.tickets SET status = 'in_progress'
   WHERE external_id = '$TICKET_ID';"

echo "Ticket $TICKET_ID → in_progress"
```

---

## Schritt 2: Implementierung

### Feature

Bevorzugt: `superpowers:subagent-driven-development` (parallele Agents, schnell).

Alternative: `superpowers:executing-plans` (sequenziell, wenn Tasks voneinander abhängen).

- Backend / Skripte / k8s-Logik: TDD via `superpowers:test-driven-development`
- UI-Arbeit: `frontend-design` Skill + Playwright Smoke Tests

**⚠️ Subagent-CWD-Pflicht:** Jeder Sub-Agent-Prompt **muss** als ersten Satz den absoluten Worktree-Pfad nennen und den Agent anweisen, alle Dateioperationen relativ zu diesem Pfad auszuführen:

```
Work inside the worktree at: <WORKTREE_PATH>
All file reads and writes must target paths under <WORKTREE_PATH>.
Do NOT write to /home/patrick/Bachelorprojekt/ directly.
```

Worktree-Pfad ermitteln:
```bash
git worktree list --porcelain | awk -v b="refs/heads/$BRANCH" '/^worktree/{wt=$2} $0==("branch " b){print wt}'
```

Ohne diese Anweisung schreiben Sub-Agents in das Haupt-Repo statt in den Worktree — Dateien landen auf `main` ohne PR-Review.

### Fix

Implementiere bis der failing Test (aus `dev-flow-plan` Schritt 3) grün ist. Pflicht: red → green → refactor.

```bash
./tests/runner.sh local <test-id>
# Ziel: PASS
```

---

## Schritt 3: Lokale Verifikation

```bash
task workspace:validate
./tests/runner.sh local <FA-XX oder SA-XX oder NFA-XX>   # falls relevant
task test:all
```

> **`task test:all` exit 128 im Worktree (erster Lauf):** Kann beim ersten Aufruf transient mit exit 128 auf `test:art-library` fehlschlagen — Ursache ist eine Race-Condition zwischen `npm install` und dem BATS-Submodul-Check. Einfach nochmal ausführen; zweiter Lauf läuft durch. [T000218]

> **TypeScript-Check in Worktrees:** `tests/e2e/` hat im Worktree kein `node_modules`. Niemals `tsc` blank aufrufen — das schlägt mit "Cannot find module" fehl. Immer absoluten Pfad nutzen:
> ```bash
> # Im Worktree: tsc mit absolutem tsconfig-Pfad
> tsc --project /home/patrick/Bachelorprojekt/tests/e2e/tsconfig.json --noEmit
> # Alternativ: system-tsc mit explizitem Projekt-Pfad
> npx --prefix /home/patrick/Bachelorprojekt/tests/e2e tsc --noEmit
> ```
> `node_modules` nicht in den Worktree symlinken — das funktioniert nur im nächsten Prozess, nicht wiederholbar. Der `--project <abs-path>` Ansatz ist worktree-agnostisch.

> **`npm ci` in frischen Worktrees:** `brett/` und `arena-server/` haben ihre eigene `package.json`, aber kein `node_modules/` im Worktree. Vor dem ersten `npm test`/`node --test` explizit ausführen: `npm ci --prefix brett` bzw. `cd arena-server && pnpm install --frozen-lockfile`. [T000245]

### CI-kritische Zusatzchecks

`task test:all` deckt nur den `offline-tests`-Job ab. Die folgenden Checks haben **eigene CI-Jobs** — CI kann rot werden, auch wenn `task test:all` grün ist. Führe sie aus, wenn die entsprechenden Dateien geändert wurden:

| Geänderte Dateien | Lokaler Check | CI-Job |
|---|---|---|
| `tests/**` oder neue/geänderte Test-IDs | `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` — bei Abweichung committen | `offline-tests` |
| `brett/**` | `npm ci --prefix brett && node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs` | `brett-server-test` |
| `brett/**` (Whiteboard-Template) | `./scripts/tests/systembrett-template.test.sh` | `offline-tests` |
| `arena-server/**` | `cd arena-server && pnpm install --frozen-lockfile && pnpm test && pnpm build` | `arena-server` |
| `arena-server/src/proto/messages.ts` ODER `website/src/components/arena/shared/lobbyTypes.ts` | `diff arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts` — bei Abweichung: `cp arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts` | `arena-proto-drift` |

> Alle fünf CI-Jobs müssen grün sein vor dem Merge.

---

## Schritt 3.5: Admin-Menu Placement Gate

Falls die Implementierung neue Seiten unter `website/src/pages/admin/` hinzugefügt hat, muss jede statische Route aus dem Sidemenu erreichbar sein (siehe Regel R1–R10 in `docs/superpowers/specs/2026-05-18-admin-menu-rules-design.md`).

```bash
bash scripts/admin-menu-gate.sh
```

| Exit | Bedeutung | Aktion |
|---|---|---|
| `0` (Gate PASSED) | Alles ok — weiter zu Schritt 4. | — |
| `1` (Gate FAILED) | Mindestens eine Regel verletzt. | Output lesen, im AdminLayout.astro nachpflegen, erneut laufen. |
| `2` | Wrong working directory. | In den Worktree wechseln und erneut versuchen. |

### Bypass (nur in Ausnahmefällen)

```bash
ADMIN_MENU_GATE=skip bash scripts/admin-menu-gate.sh
```

Wenn der Gate übersprungen wird: **PR-Titel mit `[menu-gate-skip]` prefixen** und im PR-Body begründen (z.B. "absichtlich orphan — dynamic redirect target only, kein Bedarf für Menüplatz"). Reviewer haben damit ein klares Signal.

### Häufige Failure-Modi

| Failure | Typische Ursache | Fix |
|---|---|---|
| `R1 orphan` | Neue `/admin/foo.astro` ohne Eintrag in `navGroups`. | Item in passender Gruppe ergänzen, oder Parent-Route in `matches[]` listen. |
| `R2 label` | `'Neue Session'` o.ä. als `label`. | Item entfernen, Create-Aktion als Button auf der Zielseite. |
| `R4 group >6` | Zu viele Items in einer Gruppe. | Item in andere Gruppe verschieben, oder Gruppe aufteilen. |
| `R5 groups >6` | Zu viele Gruppen. | Verwandte Gruppen zusammenführen. |
| `R7 dashboard orphan` | KPI-Card linkt auf Route die nicht im Sidemenu liegt. | Entweder Route ins Sidemenu, oder Dashboard-Link entfernen. |

---

## Schritt 4: Pre-Merge Preview auf dev k3d (optional)

> Der dev.mentolder.de Stack läuft auf k3s-1 (SSH-Zugang erforderlich). Prüfe mit `task dev:cluster:status`. Dieser Schritt ist optional — falls kein dev-Stack erreichbar, lokal verifizieren und direkt auf Prod deployen.

```bash
task dev:cluster:status
task dev:deploy           # voller Stack — oder gezielt:
task dev:redeploy:website # nur Website-Pod
task dev:redeploy:brett   # nur Brett-Pod
```

---

## Schritt 5: PR

**Pre-commit branch guard (parallel-session safety):** Verify the branch immediately before any `git add` / `git commit` — not just at Schritt 0. In environments with concurrent Claude sessions, the checked-out branch can silently change between startup and commit time.

```bash
EXPECTED_BRANCH="<feature-or-fix-branch>"   # the branch from Schritt 0
ACTUAL_BRANCH=$(git branch --show-current)
if [[ "$ACTUAL_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "🛑 HALT: Branch mismatch before commit!"
  echo "  Expected: $EXPECTED_BRANCH"
  echo "  Actual:   $ACTUAL_BRANCH"
  echo "  Another session may have switched branches. Do NOT commit. Abort and investigate."
  exit 1
fi
echo "✓ Branch confirmed: $ACTUAL_BRANCH — safe to commit."
```

Rufe `commit-commands:commit-push-pr` auf.

### Titel-Format

`<type>(<scope>): <imperative summary>`

- Feature: `feat(<scope>): <kurze-beschreibung>`
- Fix: `fix(<scope>): <kurze-beschreibung>` — Body **MUSS** `Closes $TICKET_ID` (z.B. `Closes T000301`) enthalten, sonst Push blockieren und nochmal nachfragen.

Beispiele:

- `feat(arena): add solo replay button`
- `fix(sse): drop forbidden Connection header from SSE responses`

### Body-Template

```markdown
## Summary
- <warum diese Änderung existiert, 1-3 Bullets>

## Test plan
- [x] task test:all
- [x] task workspace:validate          # wenn Manifests geändert
- [x] ./tests/runner.sh local FA-XX    # falls relevant
- [x] manueller Check auf web.mentolder.de  # falls user-sichtbar

Closes $TICKET_ID   <!-- nur Fix-Pfad, z.B. Closes T000301 -->

Co-Authored-By: <model-name>
```

---

## Schritt 5.5: PR-Nummer für Ticket-Abschluss merken

Falls `$TICKET_ID` gesetzt, direkt nach dem PR-Erstellen:

```bash
PR_NUM=$(gh pr view --json number -q '.number')
```

Das ist alles — die PR-Nummer landet in Schritt 6.5 als Comment-Body und in Schritt 7 als `ticket_plans.pr_number`.

`tickets.ticket_links` ist **nicht** für PR-Referenzen geeignet:
- `to_id` ist `NOT NULL` (FK auf `tickets.tickets`), also kein Ticket→PR möglich.
- `kind`-Check-Constraint erlaubt nur `blocks | blocked_by | duplicate_of | relates_to | fixes | fixed_by`.

`tickets.pr_events` führt PRs unabhängig (kein `ticket_id`-FK) — die Verknüpfung lebt allein über `ticket_plans.pr_number` und den Schluss-Kommentar.

---

## Schritt 6: Auto-Merge wenn CI grün

```bash
# Im Haupt-Repo ausführen — vermeidet den harmlosen "main already used by worktree" Git-Fehler
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && gh pr merge --squash --delete-branch)
```

> **Falls der Merge-Fehler auftritt:** Prüfen ob der Merge trotzdem durchging:
> ```bash
> gh pr view --json mergedAt -q '.mergedAt'   # leer = noch offen, Zeitstempel = gemergt
> ```
> Falls gemergt: einfach mit Schritt 6.5 weitermachen.

---

## Schritt 6.5: Ticket abschließen

Falls `$TICKET_ID` gesetzt, nach erfolgreichem Merge:

```bash
# Feature-Pfad: resolution = 'shipped' | Fix-Pfad: resolution = 'fixed'
RESOLUTION="shipped"   # oder "fixed" beim Fix-Pfad

PR_NUM=$(gh pr view --json number -q '.number')

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "UPDATE tickets.tickets
     SET status = 'done', resolution = '$RESOLUTION'
   WHERE external_id = '$TICKET_ID';

   INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
   SELECT id,
     'claude-code',
     'PR #$PR_NUM merged. Plan archived to tickets.ticket_plans in Postgres.',
     'internal'
   FROM tickets.tickets WHERE external_id = '$TICKET_ID';"

echo "Ticket $TICKET_ID → done ($RESOLUTION)"
```

---

## Schritt 7: Plan in Postgres archivieren + Datei löschen

Falls `$TICKET_ID` gesetzt und `$PLAN_FILE` vorhanden:

> **Wichtig — Worktree-Zustand nach Schritt 6:** `gh pr merge --squash --delete-branch` löscht nicht nur Remote+Local-Branch, sondern führt im Worktree **silent** `git checkout main` aus. Du landest auf `main` am pre-PR HEAD, und die Plan-Datei ist von Disk verschwunden, bis `git pull` läuft. Deshalb **muss** dieser Schritt mit einem Sync starten:

```bash
# Parallele-Session-Schutz: Haupt-Repo könnte auf einem anderen Branch liegen (z.B. fix/X).
# Immer explizit in einen Worktree wechseln, der auf main ist.
MAIN_REPO="/home/patrick/Bachelorprojekt"
ARCHIVE_CWD=$(git worktree list --porcelain \
  | awk '/^worktree/{wt=$2} /^branch refs\/heads\/main$/{print wt; exit}')
if [[ -z "$ARCHIVE_CWD" ]]; then
  # Kein Worktree auf main — Haupt-Repo auf main wechseln
  ARCHIVE_CWD="$MAIN_REPO"
  (cd "$ARCHIVE_CWD" && git checkout main)
fi
cd "$ARCHIVE_CWD"
git fetch origin main
# Parallel-Session-Schutz: Unstaged-Änderungen aus anderen Sessions sichern vor reset
STASHED_PLAN=0
if ! git diff --quiet; then
  echo "Unstaged Änderungen erkannt — stashe vor reset..."
  git stash
  STASHED_PLAN=1
fi
git reset --hard origin/main   # Plan-Datei ist jetzt auf Disk (gemergter Revision)
if [[ "$STASHED_PLAN" == "1" ]]; then
  git stash pop || echo "⚠️  Stash-Pop-Konflikte — bitte manuell auflösen."
fi

# Sicherheitsprüfung: CWD muss auf main sein
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "✗ CWD ist auf '$CURRENT_BRANCH' — Abbruch. Bitte Branch prüfen."
  exit 1
fi
```

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
SLUG="<slug>"
BRANCH="feature/<slug>"   # oder fix/<slug> — Branch wurde durch --delete-branch bereits gelöscht, also nicht aus `git branch --show-current` lesen
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

# Precheck: Plan-Datei muss existieren UND nicht leer sein, sonst archivieren wir leere Bytes
if [[ ! -s "$PLAN_FILE" ]]; then
  echo "✗ Plan-Datei fehlt oder ist leer: $PLAN_FILE"
  echo "  Möglicherweise wurde 'git pull/reset' oben übersprungen, oder der Plan wurde manuell gelöscht."
  echo "  Abbruch — kein Archiv, kein Commit."
  exit 1
fi

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -At -c \
  "SELECT id FROM tickets.tickets WHERE external_id = '$TICKET_ID';")

PR_NUM_SQL=$([ -z "$PR_NUM" ] && echo "NULL" || echo "$PR_NUM")

# SQL in temp-Datei schreiben — verhindert Shell-Expansion des Plan-Inhalts
TMPFILE=$(mktemp /tmp/plan-archive-XXXXXX.sql)
{
  printf "INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number)\nVALUES (\n  '%s',\n  '%s',\n  '%s',\n  \$plan\$" \
    "$TICKET_UUID" "$SLUG" "$BRANCH"
  cat "$PLAN_FILE"
  printf "\$plan\$,\n  %s\n);\n" "$PR_NUM_SQL"
} > "$TMPFILE"

# Sanity-Check: Datei sollte mehr als das nackte SQL-Gerüst enthalten
ARCHIVE_BYTES=$(wc -c < "$TMPFILE")
if (( ARCHIVE_BYTES < 200 )); then
  echo "✗ Archiv-SQL ist verdächtig klein ($ARCHIVE_BYTES bytes) — vermutlich Plan-Inhalt verloren."
  cat "$TMPFILE"
  rm "$TMPFILE"
  exit 1
fi

kubectl exec -i "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -v ON_ERROR_STOP=1 < "$TMPFILE"

rm "$TMPFILE"

# Datei löschen (nicht nach executed/ verschieben)
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive $SLUG → postgres [$TICKET_ID]"

# Branch protection verhindert direkten Push auf main — ephemeren Arch-Branch nutzen
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"
git checkout -b "$ARCHIVE_BRANCH"
git push -u origin "$ARCHIVE_BRANCH"
gh pr create \
  --title "chore(plans): archive $SLUG → postgres [$TICKET_ID]" \
  --body "Removes \`docs/superpowers/plans/$SLUG.md\` after archiving to \`tickets.ticket_plans\`." \
  --base main
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

Falls `$TICKET_ID` leer (Chore ohne Ticket): SQL-Archivierung überspringen — nur `rm "$PLAN_FILE"` + commit + PR:

```bash
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive $SLUG"
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"
git checkout -b "$ARCHIVE_BRANCH"
git push -u origin "$ARCHIVE_BRANCH"
gh pr create --title "chore(plans): archive $SLUG" \
  --body "Removes plan file after chore completed (no ticket)." --base main
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

**Hinweis Dollar-Quoting:** `$plan$...$plan$` ist psql-Dollar-Quoting; sicher für beliebigen Markdown-Inhalt, solange der Plan selbst nicht den String `$plan$` enthält (praktisch ausgeschlossen).

**kubeconfig für cicd-deploy generieren:** Statt `kubectl config view --raw -o jsonpath '{.clusters[?(@.name=="<hardcoded>")]...}'` (schlägt fehl wenn Context-Name ≠ Cluster-Name) immer das Hilfsskript nutzen:

```bash
# Erzeugt fertiges kubeconfig für cicd-deploy SA; --minify macht clusters[0] korrekt
bash scripts/cicd-kubeconfig-gen.sh mentolder workspace | base64 -w0 \
  | gh secret set MENTOLDER_KUBECONFIG --repo Paddione/Bachelorprojekt
bash scripts/cicd-kubeconfig-gen.sh korczewski workspace-korczewski | base64 -w0 \
  | gh secret set KORCZEWSKI_KUBECONFIG --repo Paddione/Bachelorprojekt
```

---

## Schritt 7.5: Worktree & Branch bereinigen

Nach erfolgreichem Merge und Plan-Archivierung immer ausführen:

```bash
BRANCH="feature/<slug>"   # oder fix/<slug> bzw. chore/<slug>

# Worktree-Pfad ermitteln
WORKTREE_PATH=$(git worktree list --porcelain \
  | awk -v b="refs/heads/$BRANCH" '/^worktree/{wt=$2} $0==("branch " b){print wt}')

# In Haupt-Repo wechseln (falls noch im Worktree)
cd /home/patrick/Bachelorprojekt

# Worktree entfernen
if [[ -n "$WORKTREE_PATH" && "$WORKTREE_PATH" != "/home/patrick/Bachelorprojekt" ]]; then
  git worktree remove "$WORKTREE_PATH" --force
  echo "✓ Worktree $WORKTREE_PATH entfernt"
fi

# Lokalen Branch löschen
git branch -D "$BRANCH" 2>/dev/null && echo "✓ Lokaler Branch $BRANCH gelöscht" || echo "(Branch lokal nicht vorhanden)"

# Remote Branch löschen (GitHub löscht bei auto-merge automatisch, trotzdem absichern)
git push origin --delete "$BRANCH" 2>/dev/null && echo "✓ Remote origin/$BRANCH gelöscht" || echo "(Remote bereits gelöscht)"
```

Ergebnis: kein staler Worktree, keine Altlasten im lokalen oder Remote-Repo.

---

## Schritt 8: Post-Merge Deploy

Schau dir die geänderten Dateien an (`gh pr view <pr> --json files`) und führe den passenden Task aus:

| Geänderte Dateien | Task | Verify |
|---|---|---|
| `website/src/**`, `website/public/**`, `website/package*.json` | `task feature:website` | `https://web.mentolder.de` + `https://web.korczewski.de` |
| `brett/**` | `task feature:brett` | `https://brett.mentolder.de` + `https://brett.korczewski.de` |
| `k3d/docs-content-built/**` | `task docs:deploy` | `https://docs.mentolder.de` + `https://docs.korczewski.de` |
| `k3d/livekit*.yaml` | `task feature:livekit` | `task livekit:status ENV=mentolder` + `ENV=korczewski` |
| `k3d/**`, `prod/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/sealed-secrets/**` | `task feature:deploy` | `task workspace:verify:all-prods` + `task health` |
| Nur `docs/`, `*.md`, `CLAUDE.md`, `tests/`, `.github/`, `Taskfile*.yml`, `scripts/`, `.claude/` | KEIN Deploy | — |

Wenn mehrere Kategorien matchen: workspace → website → brett → livekit → docs.

**Verify:**
- Copy/Visual-Änderungen: Screenshot via Playwright.
- Funktionale Änderungen: `./tests/runner.sh local <FA-XX>` gegen Live-URL.
- **Wenn Verify scheitert: KEINEN Fix auf `main` versuchen.** Neuen `fix/<slug>` Branch via `dev-flow-plan` Fix-Pfad öffnen und Patrick benachrichtigen.
- **E2E Tests:** Nach erfolgreichem Verify `dev-flow-e2e` aufrufen, um Playwright-Specs für die neue Funktion zu schreiben und gegen Live zu laufen.

---

## Failure-Handling

- **Beweismaterial ans Ticket hängen (bei jedem Failure-Pfad):** Wenn du einen Failure-Screenshot, Log-Auszug oder Trace-Output hast, frage Patrick nach Pfaden (`.png`/`.log`/`.txt`/`.mp4`) und hänge sie ans Ticket — der Fix-Branch erbt dann sofort den Kontext:
  ```bash
  # TICKET_UUID aus dem aktuellen Ticket holen:
  TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -- \
    psql -U website -d website -At -c \
    "SELECT id FROM tickets.tickets WHERE external_id='$TICKET_ID';")
  bash scripts/ticket-attach.sh "$TICKET_UUID" /pfad/zu/failure.png /pfad/zu/ci.log
  ```
- **CI rot vor Merge:** Diagnose, Fix auf demselben Branch, neu pushen. Keinen zweiten PR aufmachen. Falls nach 2 Versuchen noch rot: Ticket-Kommentar hinterlassen:
  ```bash
  kubectl exec "$PGPOD" -n workspace --context mentolder -- \
    psql -U website -d website -c \
    "INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
     SELECT id,
       'claude-code',
       'CI blockiert nach Diagnose — manuelle Intervention nötig. Branch: fix/<slug>',
       'internal'
     FROM tickets.tickets WHERE external_id = '$TICKET_ID';"
  ```
- **`openclaw approvals get` gibt keine JSON-Ausgabe zurück:** Der Befehl gibt dekorierten Tabellenoutput aus, keinen JSON. Falls ein Plan-Schritt `openclaw approvals get 2>/dev/null | python3 -c 'import sys,json; ...'` verwendet, schlägt das fehl. Lösung: `~/.openclaw/exec-approvals.json` direkt lesen. [T000214]
- **Deploy scheitert post-merge:** Loggen, Patrick benachrichtigen, Cluster wie ist lassen. Kein Auto-Rollback. Ticket bleibt auf `in_progress` — Patrick muss manuell auf `done` oder `blocked` setzen.
- **Verify scheitert post-merge:** Neuen `fix/<slug>` Branch via `dev-flow-plan` Fix-Pfad. Behandle die Regression als Bug. Hinterlasse am aktuellen Ticket einen internen Kommentar mit dem neuen Ticket-Link.

---

## Agent-Routing

Jeder Pfad delegiert Spezialarbeit an die passenden Sub-Agents (siehe CLAUDE.md Agent-Routing-Tabelle):

- DB/Schema/Queries → `bachelorprojekt-db`
- Manifests/Kustomize/Taskfile → `bachelorprojekt-infra`
- Live-Cluster-Operations → `bachelorprojekt-ops`
- Tests schreiben/debuggen → `bachelorprojekt-test`
- Astro/Svelte/UI → `bachelorprojekt-website`
- SealedSecrets/Keycloak/OIDC → `bachelorprojekt-security`

**Pflicht vor jedem Sub-Agent-Dispatch:** `bash scripts/plan-context.sh <role>` ausführen und die Ausgabe in `<active-plans>` Tags an den Prompt voranstellen (Details in CLAUDE.md).


## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."