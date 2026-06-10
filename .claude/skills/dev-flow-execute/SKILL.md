---
name: dev-flow-execute
description: Use when on a feature/* or fix/* branch that has a staged plan in docs/superpowers/plans/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.
---

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `dev-flow-plan` hat Spec und Plan committed und gepusht. Jetzt soll implementiert werden.

**Sage zu Beginn:** "Ich nutze dev-flow-execute zur Plan-Ausführung."

---

## Schritt −1: Main-Branch im Haupt-Repo synchronisieren (Pull-First)

Synchronisiere `main` im Haupt-Repo:

```bash
bash scripts/agent-lock.sh reap   # Session-Koordination [T000510]: Zombie-Prozesse, stale Worktrees & tote Locks räumen
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
(cd "$MAIN_REPO" && git fetch origin main && git pull --rebase origin main)
```

---

## Schritt 0: Worktree-Konsistenz prüfen

```bash
# Branch-Guard [T000321]
CURRENT_BRANCH=$(git branch --show-current)
EXPECTED_BRANCH="<feature-or-fix-branch>"
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "🛑 HALT: Branch Mismatch! Eine parallele Session hat den Branch gewechselt."
  exit 1
fi
```

---

## Schritt 0.5: Sync mit main & Rebase

```bash
git fetch origin main
git rebase origin/main
git submodule update --init --recursive
# Falls push fehlschlägt, wende --force-with-lease an
```

---

## Schritt 1: Plan finden & Ticket ID extrahieren

Finde den neuesten Plan in `docs/superpowers/plans/*.md` und extrahiere die Ticket-ID:

```bash
PLAN_FILE="docs/superpowers/plans/<slug>.md"
TICKET_ID=$(awk '/^ticket_id:/{print $2; exit}' "$PLAN_FILE")
```

---

## Schritt 1.4: Doppelarbeit-Guard & Registry-Overlap (Session-Koordination [T000510])

Claime Ticket + Branch, damit keine zweite Session (Claude/Gemini) dieselbe Arbeit dupliziert:

```bash
BRANCH=$(git branch --show-current)
bash scripts/agent-lock.sh claim ticket "$TICKET_ID" --branch "$BRANCH" --worktree "$PWD" --label dev-flow-execute \
  || { echo "🛑 Ticket $TICKET_ID wird bereits von einer lebenden Session bearbeitet (siehe Halter-Info oben) — koordinieren statt duplizieren."; exit 1; }
bash scripts/agent-lock.sh claim branch "$BRANCH" --ticket "$TICKET_ID" --worktree "$PWD" --label dev-flow-execute || true

# Weiche Warnung bei geteilten Registry-Dateien (Keep-both-Rebase-Risiko):
for hf in k3d/configmap-domains.yaml environments/schema.yaml Taskfile.yml k3d/kustomization.yaml; do
  git diff --name-only origin/main | grep -qx "$hf" || continue
  [ "$(bash scripts/agent-lock.sh check registry "$hf" | head -1)" = "held" ] \
    && echo "⚠ $hf wird parallel bearbeitet → Keep-both-Rebase erwarten."
  bash scripts/agent-lock.sh claim registry "$hf" --ticket "$TICKET_ID" --label dev-flow-execute || true
done
```

---

## Schritt 1.5: Ticket auf `in_progress` setzen und touched_files registrieren

Falls eine Ticket-ID vorhanden ist, setze das Ticket auf in_progress:

```bash
./scripts/ticket.sh update-status --id "$TICKET_ID" --status in_progress
# Live-Floor-Telemetrie (best-effort; --driver devflow; darf den Flow nie stoppen)
SLUG=$(basename "$PLAN_FILE" .md)
./scripts/ticket.sh phase "$TICKET_ID" plan entered --driver devflow --detail "Plan: $SLUG · $TICKET_ID" || true
```

Falls der Plan die berührten Dateien kennt, registriere sie für die Conflict-Gate (damit ein paralleler Factory-Lauf die Kollision sieht):

```bash
./scripts/ticket.sh set-touched-files --id "$TICKET_ID" --files "<comma-separated-paths>"
./scripts/ticket.sh phase "$TICKET_ID" plan done --driver devflow --detail "Plan geladen · Assets folgen" || true
```

---

## Schritt 1.7: Visual & Textual Assets laden (Visual Handoff)

Falls eine Ticket-ID vorhanden ist, lade alle Anhänge (wie Screenshots, Logdateien, Mockups) herunter:

```bash
ATTACHMENT_DIR="/tmp/ticket-attachments-$TICKET_ID"
./scripts/ticket.sh get-attachments --id "$TICKET_ID" --out-dir "$ATTACHMENT_DIR"
```

**⚠️ Pflicht für UI-Arbeiten:** Lies (mit dem `Read` Tool) alle heruntergeladenen Bilddateien und Textdateien in diesem Ordner ein, um ein pixelgenaues Verständnis des UI-Designs zu erlangen. Verlasse dich nicht auf Prose allein.

---

## Schritt 2: Implementierung an frischen Implementer-Subagenten delegieren

```bash
# Live-Floor-Telemetrie (best-effort): Implementer-Subagent wird gespawnt
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```

Statt deinen eigenen Kontext/Modell zurückzusetzen (das ließe dich den Faden verlieren), delegiere die **gesamte Implementierung an EINEN frischen Subagenten** — sauberer Kontext per Konstruktion, **Modell + Effort passend zum Charakter der Plan-Tasks**. Du behältst den vollen Plan-Kontext und verifizierst das Ergebnis anschließend unabhängig.

> **Warum EIN Implementer statt `superpowers:subagent-driven-development`-Fan-out?** Dieser Skill läuft bereits *selbst* als delegierte Ebene (oft aus einem dev-flow-Orchestrator). Ein zusätzlicher Per-Task-Fan-out wäre **verschachtelte Delegation** → Kontext-Explosion und Synthese-Last (siehe [subagent-provisioning.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md), 162k-Prompt-Lehre). Der Implementer ruft `superpowers:executing-plans` daher **in-context** auf (kein weiterer Agenten-Fan-out). Nur wenn der Plan ausdrücklich viele **voneinander unabhängige** Tasks hat und der Einzel-Implementer am Kontext-Limit scheitert, lohnt der Wechsel auf `subagent-driven-development` bzw. einen `Workflow`-Fan-out — bewusste Eskalation, nicht Default.

Spawne über das `Agent`/`Task`-Tool einen Subagenten, **provisioniert gemäß** [subagent-provisioning.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) (Modell · Effort · Kontext):
- **Modell — nach Plan-Charakter wählen, nicht pauschal:** mechanisch (Config/Doku/Single-File) → `haiku`; Standard-Feature/Fix (mehrere Dateien, klarer Plan) → `sonnet`; komplex/riskant (systemübergreifend, Architektur, Security, DB-/Schema-Migration, Auto-Deploy) → `opus`. Im Zweifel eine Stufe höher.
- **Effort per Prompt-Direktive** (das `Agent`-Tool kennt keinen Effort-Regler): mechanisch „Arbeite zügig und fokussiert."; komplex/riskant „Ultrathink. Denke sehr gründlich nach."
- `subagent_type: general-purpose`.
- **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit):
  - Absoluter Worktree-Pfad + Branch-Name; er arbeitet NUR relativ dazu.
  - Plan-Datei `docs/superpowers/plans/<slug>.md` + Ticket-ID.
  - Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
- **Auftrag:**
  - *Feature:* Rufe `superpowers:executing-plans` (in-context, KEIN weiterer Agenten-Fan-out) + `test-driven-development` auf und arbeite den Plan vollständig ab. Aktualisiere nach jedem Meilenstein die Checkbox im Plan (`- [ ] M1` → `- [x] M1`), committe und pushe.
  - *Fix:* Verifiziere zuerst, dass ein failing Test existiert, dann nach Rot-Grün-Prinzip bis grün.
  - Bei Kompilier-/Testfehlern: starte sofort `systematic-debugging`.
  - Falls Delegations-Tools `finishing-a-development-branch` aufrufen: Menü mit `--no-menu` / `MENU=skip` unterdrücken.
  - Erstelle KEINEN PR und merge nicht — stoppe nach grünen Tests und gib eine Zusammenfassung zurück (geänderte Dateien, Test-Status, offene Punkte).

Nimm das Ergebnis entgegen und mach bei Schritt 3 (unabhängige Verifikation) weiter.

---

## Schritt 3: Lokale Verifikation

Rufe das Skill **`verification-before-completion`** auf, um die Verifikation strukturiert zu steuern.

```bash
# Live-Floor-Telemetrie (best-effort; --driver devflow; darf den Flow nie stoppen)
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:all + freshness" || true
task workspace:validate
./tests/runner.sh local <FA-XX oder SA-XX>
task test:all
task freshness:regenerate
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```

**Wichtig: `task freshness:regenerate` stellt sicher, dass alle generierten Artefakte (test-inventory.json, route-manifest.json, agent-guide docs/maps, learning-assets, repo-index.json) aktuell sind, bevor committet wird. Andernfalls schlägt CI fehl.**

Siehe [dev-flow-gotchas.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm Gotchas in Worktrees.

---

## Schritt 3.5: Admin-Menu Placement Gate

Falls neue Admin-Seiten hinzugefügt wurden:
```bash
bash scripts/admin-menu-gate.sh
```

---

## Schritt 3.8: Code Review Gate (Mandatory)

Vor dem PR-Merge muss eine unabhängige Überprüfung stattfinden.
1. Rufe das Skill **`requesting-code-review`** (oder `pr-review-toolkit:review-pr` bzw. einen Review-Subagenten) auf, um die Änderungen zu auditieren.
2. Behebe alle gefundenen Probleme und stelle sicher, dass der Reviewer "Approved" gibt, bevor du fortfährst.

---

## Schritt 4: Dev-Iteration (optional)

Rufe `dev-flow-iterate` auf, um Änderungen im dev-Cluster zu testen.

---

> **⚠ Freshness-Guard (vor dem Commit):** Wenn Schritt 3 (`task freshness:regenerate`) übersprungen oder der Subagent es vergessen hat, schlägt CI mit "stale artifact" fehl. Prüfe: `git diff --name-only` sollte keine generierten Indexdateien zeigen. Falls doch: `task freshness:regenerate && git add` nachholen. Der Pre-commit-Hook automatisiert das nach `task secrets:install-hooks`.

## Schritt 5: PR erstellen

```bash
# Branch-Guard prüfen
git add -A
git commit -m "<type>(<scope>): <subject>" # commitlint regeln beachten (<100 Zeichen body)
# Closes T000XXX im Body bei Fixes
```

Rufe `commit-commands:commit-push-pr` auf (oder führe `gh pr create` manuell aus).

---

## Schritt 5.5: CI/CD-Fix-Schleife

Nachdem der PR gepusht ist, überwache CI und behebe Fehler — bevor du mergst.

```bash
MAX_CI_ATTEMPTS=5
CI_ATTEMPT=0
PR_URL=$(gh pr view --json url -q '.url')
PR_NUM_TELEM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")
./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow --detail "PR #$PR_NUM_TELEM · CI watch" || true

while true; do
  CI_ATTEMPT=$((CI_ATTEMPT + 1))
  echo "⏳ CI-Check Versuch $CI_ATTEMPT/$MAX_CI_ATTEMPTS für $PR_URL ..."
  ./scripts/ticket.sh phase "$TICKET_ID" deploy entered --driver devflow --detail "CI attempt $CI_ATTEMPT/$MAX_CI_ATTEMPTS" || true

  # Warte auf alle Checks (blockierend; bricht ab, wenn alle done)
  gh pr checks --watch --interval 15 2>/dev/null || true

  # Welche Checks sind rot?
  FAILED_CHECKS=$(gh pr checks --json name,state,link \
    | jq -r '.[] | select(.state == "FAILURE" or .state == "TIMED_OUT") | "\(.name): \(.link)"')

  if [[ -z "$FAILED_CHECKS" ]]; then
    echo "✅ Alle CI-Checks grün."
    break
  fi

  if [[ $CI_ATTEMPT -ge $MAX_CI_ATTEMPTS ]]; then
    echo "❌ CI nach $MAX_CI_ATTEMPTS Versuchen noch rot — manuelles Eingreifen nötig:"
    echo "$FAILED_CHECKS"
    exit 1
  fi

  echo "⚠ Fehlgeschlagene Checks:"
  echo "$FAILED_CHECKS"

  # Logs der fehlgeschlagenen Jobs holen (GitHub Actions)
  FAILED_RUN_ID=$(gh run list --json databaseId,status,conclusion \
    | jq -r '[.[] | select(.conclusion == "failure")] | sort_by(.databaseId) | last | .databaseId // empty')

  if [[ -n "$FAILED_RUN_ID" ]]; then
    echo "--- CI-Logs (Run $FAILED_RUN_ID) ---"
    gh run view "$FAILED_RUN_ID" --log-failed 2>&1 | tail -200
  fi

  # Delegiere die Diagnose + den Fix an einen frischen Subagenten
  # (er hat die Logs oben als Teil des Prompts erhalten)
  # Hinweis: Schreibe hier den Kontext explizit herein und nutze das Agent-Tool
  # mit dem passenden Prompt. Das Modell für CI-Fixes: sonnet (standard).
  # Nach dem Fix: commit + push, dann Loop wiederholen.
  #
  # Typische CI-Ursachen (prüfe in dieser Reihenfolge):
  #   1. Freshness-Artefakte veraltet → task freshness:regenerate && git add … && git commit …
  #   2. TypeScript-Fehler (pnpm typecheck) → Typfehler beheben
  #   3. BATS-Tests schlagen fehl (task test:all) → Testfehler beheben
  #   4. Kustomize-Validierung → task workspace:validate
  #   5. Commitlint-Verletzung → Commit-Message anpassen (rebase -i ist interaktiv,
  #      daher: git commit --amend ist im Worktree erlaubt)
  echo "🔧 Starte CI-Fix-Subagenten ..."
  # --> spawn Agent-Tool mit obigen Logs + PLAN_FILE + Branch + Worktree-Pfad
  # Stoppe nach erfolgreichem Push und lass den Loop erneut prüfen
done
```

---

## Schritt 6: Auto-Merge wenn CI grün

```bash
# Merge PR aus dem Haupt-Repo, um Konflikte zu vermeiden
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```

---

## Schritt 6.5: Ticket abschließen

Falls eine Ticket-ID vorhanden ist, schließe das Ticket:

```bash
RESOLUTION="shipped" # oder "fixed" bei Fixes
PR_NUM=$(gh pr view --json number -q '.number')

./scripts/ticket.sh update-status --id "$TICKET_ID" --status qa_review
# Live-Floor-Telemetrie (best-effort; --driver devflow; darf den Flow nie stoppen)
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "PR #$PR_NUM merged · deployed" || true
./scripts/ticket.sh add-comment --id "$TICKET_ID" --body "PR #$PR_NUM merged. Plan archived to tickets.ticket_plans."
```

---

## Schritt 7: Plan archivieren & Datei löschen

Übertrage den Plan in die Datenbank und lösche die lokale Datei:

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

./scripts/ticket.sh archive-plan \
  --id "$TICKET_ID" \
  --slug "$SLUG" \
  --branch "$BRANCH" \
  --plan-file "$PLAN_FILE" \
  --pr "$PR_NUM"

# Plan lokal löschen und Änderungen via PR committen
rm "$PLAN_FILE"
git add "$PLAN_FILE"
git commit -m "chore(plans): archive $SLUG → postgres [$TICKET_ID]"

# Archiver-Branch anlegen und mergen (wegen Branch-Protection)
ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"
git checkout -b "$ARCHIVE_BRANCH"
git push -u origin "$ARCHIVE_BRANCH"
gh pr create --title "chore(plans): archive $SLUG → postgres [$TICKET_ID]" --base main
gh pr merge --auto --squash --delete-branch
```

---

## Schritt 7.5: Worktree & Branch bereinigen

Lösche den lokalen Worktree und Branch (im Haupt-Repo ausführen):

```bash
# Claims freigeben (Session-Koordination [T000510]) — VOR dem Worktree-Remove:
bash scripts/agent-lock.sh release ticket "$TICKET_ID" 2>/dev/null || true
bash scripts/agent-lock.sh release branch "<branch>" 2>/dev/null || true
cd /home/patrick/Bachelorprojekt
git worktree remove "/tmp/wt-<slug>" --force
git branch -D "<branch>"
```

---

## Schritt 8: Post-Merge Deploy & Verify

Bestimme automatisch welche Services deployed werden müssen, basierend auf den Dateien des gemergten PRs.

```bash
# Gemergte Dateien des PRs ermitteln (gegen main-1 = direkt vor dem Squash)
MERGE_COMMIT=$(git log origin/main -1 --format="%H")
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT")

DEPLOY_WEBSITE=false
DEPLOY_BRETT=false
DEPLOY_K8S=false
DEPLOY_DOCS=false

echo "$CHANGED" | grep -qE '^website/' && DEPLOY_WEBSITE=true
echo "$CHANGED" | grep -qE '^brett/' && DEPLOY_BRETT=true
echo "$CHANGED" | grep -qE '^docs/' && DEPLOY_DOCS=true
echo "$CHANGED" | grep -qE '^(k3d/|prod|prod-fleet|prod-mentolder|prod-korczewski|environments/)' \
  && DEPLOY_K8S=true

# Fallback: Wenn nichts erkannt → manuell bestimmen
if [[ "$DEPLOY_WEBSITE" == false && "$DEPLOY_BRETT" == false \
      && "$DEPLOY_K8S" == false && "$DEPLOY_DOCS" == false ]]; then
  echo "⚠ Keine bekannten Deploy-Trigger in den geänderten Dateien erkannt."
  echo "Geänderte Dateien:"
  echo "$CHANGED"
  echo "Bitte manuell deployen."
fi

# Deployments ausführen
if [[ "$DEPLOY_WEBSITE" == true ]]; then
  echo "🚀 Deploye Website (beide Brands)..."
  task feature:website
fi

if [[ "$DEPLOY_BRETT" == true ]]; then
  echo "🚀 Deploye Brett (beide Brands)..."
  task feature:brett
fi

if [[ "$DEPLOY_DOCS" == true ]]; then
  echo "🚀 Deploye Docs..."
  task docs:deploy
fi

if [[ "$DEPLOY_K8S" == true ]]; then
  echo "🚀 Deploye K8s-Manifeste (beide Brands)..."
  task feature:deploy
fi

# Deploy-Telemetrie
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "deployed (post-merge)" || true
```

**Deploy-Mapping (Single Source of Truth):** Die obige Auto-Detection und die vollständige
Pfad→Task-Tabelle leben in [deploy-routing.md](file:///home/patrick/Bachelorprojekt/.claude/skills/references/deploy-routing.md) — dort steht auch die Pod-Verify-Schleife und die
Stale-Tree-/Digest-Pin-Footguns. Bei Änderungen am Deploy-Mapping **nur** diese Referenz pflegen.

Führe danach `dev-flow-e2e` aus, um E2E-Tests gegen die Live-Umgebung zu schreiben.

---


## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Voraussetzung — liefert den Implementierungsplan |
| `dev-flow-iterate` | Alternative — inkrementelle Dev-Iteration |
| `dev-flow-e2e` | Folge — schreibt E2E-Tests nach Deploy |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).