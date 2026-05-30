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

**Branch-Guard VOR jeder destruktiven Git-Op (parallel-session safety):** Eine parallele Claude-Session kann zwischen Schritt 0 und hier den ausgecheckten Branch im selben Repo gewechselt haben (Merge + `--delete-branch` einer anderen Session lässt den primären Worktree silent auf `main` zurück). Der `git stash`/`git rebase` unten würde dann auf dem falschen Branch laufen und Arbeit zerstören. Verifiziere den Branch **bevor** irgendetwas gestasht oder rebased wird:

```bash
EXPECTED_BRANCH="<feature-or-fix-branch>"   # der Branch aus Schritt 0
ACTUAL_BRANCH=$(git branch --show-current)
if [[ "$ACTUAL_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "🛑 HALT: Branch-Mismatch VOR rebase/stash!"
  echo "  Erwartet: $EXPECTED_BRANCH"
  echo "  Aktuell:  $ACTUAL_BRANCH"
  echo "  Eine parallele Session hat den Branch gewechselt. KEIN stash/rebase. Abbrechen und prüfen."
  exit 1
fi
echo "✓ Branch bestätigt: $ACTUAL_BRANCH — sicher zu rebasen."
```

```bash
git fetch origin main
git rebase origin/main
git submodule update --init --recursive
```

> **Nach Rebase — erster Push:** Falls der Branch schon gepusht war (z.B. Prior-Session ließ Stale Commits), schlägt `git push` mit "rejected ... non-fast-forward" fehl. Erkenne und handle automatisch:
>
> ```bash
> BRANCH=$(git branch --show-current)
> if ! git push -u origin "$BRANCH" 2>/tmp/_push_err.txt; then
>   if grep -qE "rejected.*non-fast-forward|rejected.*fetch first" /tmp/_push_err.txt; then
>     echo "Remote divergiert (Stale Commits aus Prior-Session) — wende --force-with-lease an"
>     git push --force-with-lease origin "$BRANCH"
>     echo "✓ Force-with-lease push erfolgreich"
>   else
>     cat /tmp/_push_err.txt; exit 1
>   fi
> fi
> ```
>
> `--force-with-lease` ist sicherer als `--force` — schlägt fehl wenn jemand anderes seit dem letzten Fetch gepusht hat (schützt Fremdarbeit).

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

kubectl exec "$PGPOD" -n workspace --context mentolder -c postgres -- \
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

**Test-Gate (Pflicht — vor jeder Implementierung):** Der Fix-Pfad setzt voraus, dass `dev-flow-plan` Schritt 3 einen *failing* Regressionstest gestaged hat. Verifiziere das, **bevor** du Implementierungscode schreibst — fehlt der Test, ist die red→green-Disziplin verletzt (genau die Lücke, durch die PR #1134 testlos shipte). Dann: NICHT implementieren, sondern zuerst den failing Test schreiben (zurück zu `dev-flow-plan` Fix-Pfad Schritt 3).

```bash
# Test-Diff gegenüber main prüfen — der Fix-Branch MUSS mindestens eine Test-Datei berühren
TEST_TOUCHED=$(git diff --name-only origin/main...HEAD | grep -E '^tests/|\.test\.(ts|js|mjs)$|\.spec\.ts$|\.bats$' | head -5)
if [[ -z "$TEST_TOUCHED" ]]; then
  echo "🛑 HALT: Fix-Branch hat keinen Test angefasst. Kein Regressionstest = kein Merge."
  echo "  Schreibe zuerst einen failing Test (dev-flow-plan Fix-Pfad Schritt 3), dann implementiere."
  exit 1
fi
echo "✓ Regressionstest vorhanden:"; echo "$TEST_TOUCHED"
```

Implementiere dann bis der failing Test (aus `dev-flow-plan` Schritt 3) grün ist. Pflicht: red → green → refactor.

```bash
./tests/runner.sh local <test-id>
# Ziel: PASS
```

### Milestone-Checkboxen aktualisieren (Pflicht nach jeder abgeschlossenen Aufgabe)

**Nach jeder abgeschlossenen Milestone / Task-Gruppe den Plan in-place aktualisieren:**

```bash
PLAN_FILE="docs/superpowers/plans/<date>-<slug>.md"

# Checkbox für abgeschlossene Milestone setzen — z.B. M1
# Vorher:  - [ ] M1: <titel>
# Nachher: - [x] M1: <titel>
sed -i 's/^- \[ \] M1:/- [x] M1:/' "$PLAN_FILE"
```

**Warum:** Die Plan-Datei ist der einzige persistente State der Implementierung. Bleiben Checkboxen unchecked, kann keine spätere Session (nach `/compact` oder Session-Verlust) den tatsächlichen Fortschritt erkennen — sie liest nur den Plan. Ohne Checkbox-Update muss der Zustand durch Filesystem-Analyse rekonstruiert werden, was fehleranfällig ist und Zeit kostet.

**Wann:** Direkt nach dem Commit jedes Milestones — nicht am Ende gebündelt. Nach `git commit -m "feat(…): complete M1 …"` sofort:

```bash
sed -i 's/^- \[ \] M1:/- [x] M1:/' "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): check off M1 in plan"
```

---

## Schritt 3: Lokale Verifikation

```bash
task workspace:validate
./tests/runner.sh local <FA-XX oder SA-XX oder NFA-XX>   # falls relevant
task test:all
```

> **Strukturelle/Offline-Tests ohne k3d:** `./tests/runner.sh unit <test-id>` überspringt `k3d_wait` und Port-Forwards — ideal für reine BATS-Unit-Tests die keinen Live-Cluster brauchen. Direktaufruf als letzter Ausweg: `tests/unit/lib/bats-core/bin/bats tests/unit/<file>.bats`.

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

> **Lockfile-Update nach neuer Dependency:** Wenn `arena-server/package.json` geändert wurde (neue Dep hinzugefügt), schlägt `pnpm install --frozen-lockfile` mit "lockfile-specifier mismatch" fehl. Erst `pnpm install` (ohne Flag) ausführen, dann das aktualisierte Lockfile committen — danach `pnpm install --frozen-lockfile` zur Verifikation. [T000254]

### CI-kritische Zusatzchecks

`task test:all` deckt nur den `offline-tests`-Job ab. Die folgenden Checks haben **eigene CI-Jobs** — CI kann rot werden, auch wenn `task test:all` grün ist. Führe sie aus, wenn die entsprechenden Dateien geändert wurden:

| Geänderte Dateien | Lokaler Check | CI-Job |
|---|---|---|
| `tests/**` oder neue/geänderte Test-IDs | `task test:inventory && git diff --exit-code website/src/data/test-inventory.json` — bei Abweichung committen | `offline-tests` |
| `brett/**` | `npm ci --prefix brett && node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs` | `brett-server-test` |
| `brett/**` (Whiteboard-Template) | `./scripts/tests/systembrett-template.test.sh` | `offline-tests` |
| `arena-server/**` | Wenn `package.json` geändert: `cd arena-server && pnpm install && git add pnpm-lock.yaml && git commit -m "chore: update pnpm lockfile"`. Dann: `cd arena-server && pnpm install --frozen-lockfile && pnpm test && pnpm build` | `arena-server` |
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

## Schritt 4: Dev-Iteration (optional)

Rufe `dev-flow-iterate` auf. Übergib:
- `ENV`: Branch-Kontext (`mentolder` für alle mentolder-Branches, `korczewski` für korczewski-spezifische)
- `SURFACE`: nicht setzen — der Skill erkennt es automatisch aus `git diff --name-only origin/main`

Der Skill prüft Cluster-Erreichbarkeit selbst. Falls nicht erreichbar, beendet er sich sofort.
Nach dem letzten Cycle übergibt er die Kontrolle zurück an Schritt 5 (PR).

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
- **Subject startet kleingeschrieben** (gilt für **jeden** Commit auf dem Branch, nicht nur den PR-Titel): commitlint (`subject-case`) lehnt Subjects ab, die mit einem Großbuchstaben/Akronym/Konstante beginnen — z.B. `feat(brett): BRETT_BRAND env …` ❌ oder `fix(sse): OIDC redirect …` ❌. Umformulieren, sodass ein kleingeschriebenes Wort führt: `feat(brett): add BRETT_BRAND env …` ✅, `fix(sse): repair OIDC redirect …` ✅.
- **Body-Zeilen max. 100 Zeichen (T000335):** commitlint (`body-max-line-length`) lehnt jede Body-Zeile > 100 Zeichen ab. Verbatim eingebettete Evidence-Strings (Backup-Logs, lange Pfade, Hashes) sprengen das Limit und erzwingen einen forced rebase. Lange Evidence vor dem Einbetten umbrechen/kürzen.

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

> **`--auto` aus einem Worktree no-oppt silent (CI noch nicht grün):** Wenn CI noch läuft und du `gh pr merge <n> --squash --delete-branch --auto` brauchst, darf das **nicht** aus dem `/tmp/wt-*`-Worktree laufen — dort scheitert es entweder mit `fatal: 'main' is already used by worktree at <primary>`, oder ein Re-Run aus einem neutralen Verzeichnis exit-0t, ohne den Auto-Merge tatsächlich zu setzen (silent no-op). Zwei sichere Varianten:
> ```bash
> # A) --auto immer mit --repo aus dem Haupt-Repo (außerhalb jedes Worktrees):
> (cd "$MAIN_REPO" && gh pr merge <n> --squash --delete-branch --auto --repo Paddione/Bachelorprojekt)
>
> # B) Fallback ohne --auto: CI grün pollen, dann direkt mergen:
> #    NICHT `--json state` (Enum-Werte matchen nicht zuverlässig → Loop terminiert nie, T000342);
> #    die Text-Ansicht (Spalte 2 = pass/fail/pending) ist autoritativ.
> until ! gh pr checks <n> 2>/dev/null | awk '{print $2}' | grep -qiE 'pending|fail'; do sleep 20; done
> gh pr checks <n> | awk '{print $2}' | grep -qiE 'fail' && { echo "✗ CI rot — nicht mergen"; exit 1; }
> (cd "$MAIN_REPO" && gh pr merge <n> --squash --delete-branch)
> ```
> Danach immer per Zeitstempel verifizieren (siehe unten), nie per Exit-Code. [T000298]

> **Erwarteter Exit-1 nach Squash-Merge — kein echter Fehler:** Nach einem Squash-Merge weicht der lokale Branch vom Remote-main ab (neuer Squash-Commit ≠ lokale Commit-Historie). `gh pr merge` schlägt dann mit `not possible to fast-forward` fehl (exit 1), obwohl der PR erfolgreich gemergt wurde. Das ist **normales Verhalten**, kein Bug.
>
> **Immer nach dem Merge-Befehl verifizieren:**
> ```bash
> gh pr view --json mergedAt -q '.mergedAt'   # leer = noch offen, Zeitstempel = gemergt
> ```
> Zeigt einen Zeitstempel → Merge war erfolgreich, weiter mit Schritt 6.5.
> Leer → Merge ist tatsächlich fehlgeschlagen → PR manuell prüfen.

---

## Schritt 6.5: Ticket abschließen

Falls `$TICKET_ID` gesetzt, nach erfolgreichem Merge:

```bash
# Feature-Pfad: resolution = 'shipped' | Fix-Pfad: resolution = 'fixed'
RESOLUTION="shipped"   # oder "fixed" beim Fix-Pfad

PR_NUM=$(gh pr view --json number -q '.number')

PGPOD=$(kubectl get pod -n workspace --context mentolder \
  -l app=shared-db -o name | head -1)

kubectl exec "$PGPOD" -n workspace --context mentolder -c postgres -- \
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

TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -c postgres -- \
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

kubectl exec -i "$PGPOD" -n workspace --context mentolder -c postgres -- \
  psql -U website -d website -v ON_ERROR_STOP=1 < "$TMPFILE"

rm "$TMPFILE"

# Verify the row actually persisted BEFORE removing the plan file (T000344).
# A parallel-tool-call cancellation can drop the INSERT silently; if we rm the
# file anyway the plan is lost until recovered from git history.
ARCHIVED_ROWS=$(kubectl exec "$PGPOD" -n workspace --context mentolder -c postgres -- \
  psql -U website -d website -At -c \
  "SELECT count(*) FROM tickets.ticket_plans WHERE ticket_id='$TICKET_UUID' AND slug='$SLUG';")
if [[ "$ARCHIVED_ROWS" -lt 1 ]]; then
  echo "✗ Archiv-Row nicht in tickets.ticket_plans gefunden — Plan NICHT löschen. Abbruch."
  exit 1
fi

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
# korczewski brand → fleet cluster, namespace workspace-korczewski
bash scripts/cicd-kubeconfig-gen.sh fleet workspace-korczewski | base64 -w0 \
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

> **`prod-mentolder/dev-*` geändert aber dev-auto-deploy bricht fehl (~/Bachelorprojekt fehlt):** Falls `dev-auto-deploy.yml` mit `cd: /home/.../Bachelorprojekt: No such file or directory` fehlschlägt, ist das Repo auf dem Deploy-Host nicht geclont. Manueller Fallback:
> ```bash
> # Kustomize lokal rendern und per SSH an k3s-1 übergeben
> source scripts/env-resolve.sh dev
> kubectl kustomize prod-mentolder | envsubst "..." | \
>   ssh -i ~/.ssh/gekko_id_ed25519 gekko@k3s-1 \
>   "kubectl --context k3d-mentolder-dev apply -f -"
> # Secrets ggf. separat via SSH-Pipe materialisieren (kein Echo im Log)
> ```
> Alternativ direkt auf k3s-1 einloggen (`ssh gekko@k3s-1`) und `task dev:deploy` nach manuellem `git clone`.

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
  TICKET_UUID=$(kubectl exec "$PGPOD" -n workspace --context mentolder -c postgres -- \
    psql -U website -d website -At -c \
    "SELECT id FROM tickets.tickets WHERE external_id='$TICKET_ID';")
  bash scripts/ticket-attach.sh "$TICKET_UUID" /pfad/zu/failure.png /pfad/zu/ci.log
  ```
- **CI rot vor Merge:** Diagnose, Fix auf demselben Branch, neu pushen. Keinen zweiten PR aufmachen. Falls nach 2 Versuchen noch rot: Ticket-Kommentar hinterlassen:
  ```bash
  kubectl exec "$PGPOD" -n workspace --context mentolder -c postgres -- \
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