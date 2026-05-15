---
name: dev-flow-execute
description: Use when on a feature/* or fix/* branch that has a staged plan in docs/superpowers/plans/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.
---

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `dev-flow-plan` hat Spec und Plan committed und gepusht. Jetzt soll implementiert werden.

**Sage zu Beginn:** "Ich nutze dev-flow-execute zur Plan-Ausführung."

---

## Schritt 0: Worktree-Konsistenz prüfen

```bash
CURRENT_BRANCH=$(git branch --show-current)
CURRENT_DIR=$(pwd)
echo "Branch: $CURRENT_BRANCH | CWD: $CURRENT_DIR"
```

Prüfe:

| Situation | Aktion |
|---|---|
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
```

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

### Die "Source of Truth" Regel
Alle Änderungen im Pod (via `sync`-Tasks) sind **ephemer**. Nur was im lokalen Git committed und via `deploy`-Task (Image Build) ausgerollt wird, ist permanent.

### Feature
Bevorzugt: `superpowers:subagent-driven-development` (parallele Agents, schnell).
Nutze die Fast-Sync Tasks (`task arena:sync`, `task website:sync`, `task brett:sync`), um Änderungen sofort im laufenden Pod zu testen, ohne ein Image bauen zu müssen.

Alternative: `superpowers:executing-plans` (sequenziell, wenn Tasks voneinander abhängen).

- Backend / Skripte / k8s-Logik: TDD via `superpowers:test-driven-development`
- UI-Arbeit: `frontend-design` Skill + Playwright Smoke Tests

### Fix
Implementiere bis der failing Test (aus `dev-flow-plan` Schritt 3) grün ist. Pflicht: red → green → refactor.
Auch hier: `task <svc>:sync` nutzen für schnelles Feedback.

---

## Schritt 3: Lokale Verifikation & Persistenz
Bevor du den PR erstellst, stelle sicher, dass die ephemeren Änderungen aus dem Pod im lokalen Source-Code reflektiert sind.

```bash
task workspace:validate
./tests/runner.sh local <FA-XX oder SA-XX oder NFA-XX>   # falls relevant
task test:all

# WICHTIG: Einmaliger Build-Test (lokal oder k3d), um sicherzustellen, 
# dass das Docker-Image mit den neuen Änderungen baut.
task arena:build ENV=dev # Beispiel für Arena
```

---

## Schritt 4: Pre-Merge Preview auf dev k3d (optional)

> **Status (2026-05-13):** Der k3d-Dev-Cluster läuft aktuell **nicht**. Dieser Schritt ist optional, sobald die Infrastruktur live ist. Bis dahin: lokal verifizieren und direkt auf Prod deployen.

```bash
task dev:cluster:status
task dev:deploy           # voller Stack — oder gezielt:
task dev:redeploy:website # nur Website-Pod
task dev:redeploy:brett   # nur Brett-Pod
```

---

## Schritt 5: PR

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

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
SLUG="<slug>"
BRANCH=$(git branch --show-current)
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

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

kubectl exec -i "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -v ON_ERROR_STOP=1 < "$TMPFILE"

rm "$TMPFILE"

# Datei löschen (nicht nach executed/ verschieben)
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive $SLUG → postgres [$TICKET_ID]"
git push
```

Falls `$TICKET_ID` leer (Chore ohne Ticket): SQL-Archivierung überspringen — nur `rm "$PLAN_FILE"` + commit.

**Hinweis Dollar-Quoting:** `$plan$...$plan$` ist psql-Dollar-Quoting; sicher für beliebigen Markdown-Inhalt, solange der Plan selbst nicht den String `$plan$` enthält (praktisch ausgeschlossen).

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
| `k3d/docs-content/**` | `task docs:deploy` | `https://docs.mentolder.de` + `https://docs.korczewski.de` |
| `k3d/livekit*.yaml` | `task feature:livekit` | `task livekit:status ENV=mentolder` + `ENV=korczewski` |
| `k3d/**`, `prod/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/sealed-secrets/**` | `task feature:deploy` | `task workspace:verify:all-prods` + `task health` |
| Nur `docs/`, `*.md`, `CLAUDE.md`, `tests/`, `.github/`, `Taskfile*.yml`, `scripts/`, `.claude/` | KEIN Deploy | — |

Wenn mehrere Kategorien matchen: workspace → website → brett → livekit → docs.

**Verify:**
- Copy/Visual-Änderungen: Screenshot via Playwright.
- Funktionale Änderungen: `./tests/runner.sh local <FA-XX>` gegen Live-URL.
- **Wenn Verify scheitert: KEINEN Fix auf `main` versuchen.** Neuen `fix/<slug>` Branch via `dev-flow-plan` Fix-Pfad öffnen und Patrick benachrichtigen.

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
