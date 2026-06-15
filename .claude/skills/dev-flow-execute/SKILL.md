---
name: dev-flow-execute
description: Use when on a feature/* or fix/* branch that has a staged plan in docs/superpowers/plans/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch. Also supports batch orchestration of multiple staged plans.
---

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `dev-flow-plan` hat Spec und Plan committed und gepusht. Jetzt soll implementiert werden.

**ODER:** Du willst mehrere staged plans als Batch orchestrieren (Batch-Modus).

**Sage zu Beginn:** "Ich nutze dev-flow-execute zur Plan-Ausführung."

---

## Modus-Erkennung: Single vs Batch

Prüfe ob ein einzelner Plan oder mehrere Pläne ausgeführt werden sollen:

```bash
# Wenn TICKET_ID bereits gesetzt ist → direkt Single-Modus, kein Query nötig
STAGED_PLANS=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, priority, COALESCE(value_prop,'')
   FROM tickets.tickets WHERE status='plan_staged'
   ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null)

STAGED_COUNT=$(echo "$STAGED_PLANS" | grep -c '|' 2>/dev/null || echo 0)
```

**Entscheidungslogik (kein interaktives `read` — nutze AskUserQuestion-Tool):**

- **TICKET_ID bereits im Kontext gesetzt** (z.B. von dev-flow-plan oder User-Angabe) → `EXECUTE_MODE="single"`, weiter zu Single-Modus.
- **STAGED_COUNT == 1** → automatisch Single-Modus; `TICKET_ID` aus erster Zeile von `$STAGED_PLANS` extrahieren.
- **STAGED_COUNT == 0** → keine staged plans. Frage den User via `AskUserQuestion`-Tool nach der Ticket-ID, oder weise darauf hin, erst `dev-flow-plan` auszuführen.
- **STAGED_COUNT > 1** → Frage den User via `AskUserQuestion`-Tool:
  - Frage: „Mehrere staged plans gefunden — wie soll vorgegangen werden?"
  - Zeige die Liste (`$STAGED_PLANS`) im Text vor der Frage.
  - Option A: „Single-Modus — einen bestimmten Plan implementieren" → dann konkrete Ticket-ID erfragen.
  - Option B: „Batch-Modus — alle staged plans parallel orchestrieren" → `EXECUTE_MODE="batch"`.

---

## Batch-Modus: Mehrere Pläne parallel orchestrieren

Wenn `EXECUTE_MODE="batch"`:

### Batch-Schritt 1: Alle staged plans laden

```bash
# Alle staged plans mit Plan-Referenzen laden
BATCH_PLANS_JSON=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''),
   array_to_string(areas,','),
   (SELECT c.body FROM tickets.ticket_comments c
    WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %'
    ORDER BY c.created_at DESC LIMIT 1)
   FROM tickets.tickets t WHERE status='plan_staged'
   ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null)

# In JSON-Array konvertieren
BATCH_ITEMS=()
while IFS='|' read -r ext_id title priority value_prop effort areas plan_ref; do
  [[ -z "$ext_id" ]] && continue

  # Plan-Referenz parsen
  BRANCH=$(echo "$plan_ref" | sed -n 's/.*branch=\([^ ]*\).*/\1/p')
  PLAN_FILE=$(echo "$plan_ref" | sed -n 's/.*plan=\([^ ]*\).*/\1/p')

  BATCH_ITEMS+=("{
    \"ticket_id\": \"$ext_id\",
    \"title\": \"$title\",
    \"priority\": \"$priority\",
    \"branch\": \"$BRANCH\",
    \"plan_file\": \"$PLAN_FILE\"
  }")
done <<< "$BATCH_PLANS_JSON"

BATCH_JSON=$(printf '%s\n' "${BATCH_ITEMS[@]}" | jq -s '.')
BATCH_COUNT=$(echo "$BATCH_JSON" | jq 'length')

echo "📋 Batch-Orchestrierung: $BATCH_COUNT Pläne"
echo "$BATCH_JSON" | jq -r '.[] | "  • \(.ticket_id) [\(.priority)] \(.title) → \(.branch)"'
```

### Batch-Schritt 2: Worktrees für alle Pläne vorbereiten

```bash
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
WORKTREE_DIR="/tmp/wt-batch-execute-$(date +%s)"

# Für jeden Plan: Worktree erstellen und Plan-Datei validieren
echo "$BATCH_JSON" | jq -c '.[]' | while read -r item; do
  TICKET_ID=$(echo "$item" | jq -r '.ticket_id')
  BRANCH=$(echo "$item" | jq -r '.branch')
  PLAN_FILE=$(echo "$item" | jq -r '.plan_file')

  WT_PATH="/tmp/wt-execute-$TICKET_ID"

  # Worktree erstellen (falls nicht vorhanden)
  if [[ ! -d "$WT_PATH" ]]; then
    bash scripts/worktree-create.sh "$BRANCH" "$WT_PATH" 2>/dev/null || {
      echo "⚠️  Worktree für $TICKET_ID ($BRANCH) konnte nicht erstellt werden — übersprungen"
      continue
    }
  fi

  # Plan-Datei prüfen
  if [[ ! -f "$WT_PATH/$PLAN_FILE" ]]; then
    echo "⚠️  Plan-Datei $PLAN_FILE fehlt in $WT_PATH — übersprungen"
    continue
  fi

  echo "✅ Worktree bereit: $TICKET_ID → $WT_PATH"
done
```

### Batch-Schritt 3: Parallele Implementierung orchestrieren

Setze alle Tickets auf `in_progress` und spawne für jeden Plan **einen separaten Implementer-Subagenten** via `Agent`-Tool — alle parallel (d.h. in einer einzigen Antwort mehrere `Agent`-Tool-Calls ohne auf das Ergebnis des vorherigen zu warten):

```bash
# Tickets auf in_progress setzen (sequentiell, schnell)
echo "$BATCH_JSON" | jq -r '.[].ticket_id' | while read -r tid; do
  ./scripts/ticket.sh update-status --id "$tid" --status in_progress || true
done
```

Starte danach **für jedes Element aus `$BATCH_JSON`** einen Subagenten via `Agent`-Tool mit:
- `model`: gemäß Plan-Charakter wählen (wie Single-Modus Schritt 2 — Standard `sonnet`)
- `run_in_background: true` für alle Subagenten (echte Parallelität)
- `subagent_type: general-purpose`
- **Prompt** (Kontext-Injektion, da der Subagent KEINEN Kontext hat):
  ```
  Du implementierst Ticket <TICKET_ID> im Worktree <WT_PATH> (Branch: <BRANCH>).
  Plan-Datei: <WT_PATH>/<PLAN_FILE>.
  
  Führe aus: Schritt 1.4 bis Schritt 7.5 aus dev-flow-execute (Single-Modus) —
  d.h. Doppelarbeit-Guard, Ticket in_progress, Implementierung via superpowers:executing-plans,
  lokale Verifikation (task test:all + freshness:check), Code-Review-Gate,
  PR öffnen, CI-Fix-Schleife, Auto-Merge, Ticket abschließen, Plan archivieren,
  Worktree bereinigen.
  
  Erstelle KEINEN weiteren Batch-Modus. TICKET_ID=$<TICKET_ID>.
  Hauptrepo: <MAIN_REPO>.
  ```

Nach dem Spawnen aller Subagenten:
```
✅ Batch-Orchestrierung gestartet: $BATCH_COUNT Implementierungen laufen parallel

📊 Fortschritt verfolgen:
kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -c \
  "SELECT external_id, status, title FROM tickets.tickets
   WHERE external_id IN (<kommagetrennte TICKET_IDs>) ORDER BY status;"
```

**STOPP** nach Batch-Start. Die Implementierungen laufen parallel. Warte auf die Subagenten-Ergebnisse (du wirst benachrichtigt wenn `run_in_background`-Agenten fertig sind) oder verfolge den Fortschritt über die DB-Query.

---

## Single-Modus: Einzelnen Plan implementieren

Wenn `EXECUTE_MODE="single"`:

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

## Schritt 1: Plan-Pfad aus der Datenbank laden (Single Source of Truth)

Der Plan-Pfad wird von `dev-flow-plan` via `ticket.sh stage-plan` in der Datenbank gespeichert
(als `FACTORY-PLAN-REF branch=<branch> plan=<plan_path>` Kommentar). **Niemals** per Glob raten —
immer die DB als Quelle nutzen, genau wie der Factory-Dispatcher.

```bash
# TICKET_ID muss bekannt sein (aus Branch-Name, User-Input, oder ticket.sh get --branch <branch>)
TICKET_ID="<T-######>"

# Plan-Metadaten aus der Datenbank laden
TICKET_JSON=$(./scripts/ticket.sh get --id "$TICKET_ID")
PLAN_REF=$(echo "$TICKET_JSON" | jq -r '.plan_ref // empty')

if [[ -z "$PLAN_REF" ]]; then
  echo "🛑 Kein FACTORY-PLAN-REF für Ticket $TICKET_ID gefunden."
  echo "   → dev-flow-plan wurde nicht ausgeführt oder stage-plan fehlgeschlagen."
  exit 1
fi

# Branch und Plan-Pfad aus dem FACTORY-PLAN-REF parsen
# Format: "FACTORY-PLAN-REF branch=<branch> plan=<plan_path>"
BRANCH=$(echo "$PLAN_REF" | sed -n 's/.*branch=\([^ ]*\).*/\1/p')
PLAN_FILE=$(echo "$PLAN_REF" | sed -n 's/.*plan=\([^ ]*\).*/\1/p')

if [[ -z "$PLAN_FILE" || ! -f "$PLAN_FILE" ]]; then
  echo "🛑 Plan-Datei '$PLAN_FILE' existiert nicht (Branch: $BRANCH)."
  echo "   → Worktree prüfen: git worktree list"
  exit 1
fi

echo "✅ Plan geladen: $PLAN_FILE (Branch: $BRANCH)"
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
- **Provider-Routing (Kosten/Resilienz):** Vor dem Spawnen den Provider routen:
  ```bash
  ROUTE=$(bash scripts/factory/route-provider.sh dev-flow-execute sonnet)
  MODEL=$(echo "$ROUTE" | jq -r .modelId)
  SLOT=$(echo "$ROUTE" | jq -r .slotId)
  ```
  Subagent mit `--model "$MODEL"` spawnen. Danach den Slot freigeben:
  ```bash
  bash scripts/factory/release-slot.sh "$SLOT" true   # false bei Fehlschlag → Circuit-Breaker
  ```
  `opus`/plan-kritische Subagenten IMMER ohne Routing (hardcodiert Anthropic).
- **Effort per Prompt-Direktive** (das `Agent`-Tool kennt keinen Effort-Regler): mechanisch „Arbeite zügig und fokussiert."; komplex/riskant „Ultrathink. Denke sehr gründlich nach."
- `subagent_type: general-purpose`.
- **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit):
  - Absoluter Worktree-Pfad + Branch-Name; er arbeitet NUR relativ dazu.
  - Plan-Datei `$PLAN_FILE` (aus Schritt 1, via DB aufgelöst) + Ticket-ID.
  - Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
- **⚠️ BATS-Pflicht (kein neues File ohne Prüfung):**
  Bevor du eine neue `.bats`-Datei erstellst, suche erst in `tests/unit/` nach einer thematisch passenden bestehenden Datei und erweitere diese stattdessen:
  ```bash
  # Beispiel: testest du ein Script → scripts.bats; Ticket-Logik → tickets-*.bats; Website → website-*.bats
  grep -rl "<modul-stichwort>" tests/unit/ tests/local/
  ```
  **Neue `.bats`-Datei nur wenn:** das zu testende Modul hat bisher NULL Testabdeckung UND kein thematisch verwandter Dateiname existiert. In allen anderen Fällen: `@test`-Block in die passende bestehende Datei einfügen. Ziel: die Gesamtzahl der `.bats`-Dateien in `tests/unit/` sinkt oder bleibt konstant.

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
task freshness:check        # CI-Äquivalent — failt lokal GENAU wie CI (S1–S4-Ratchet + Baseline-Assertion)
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```

**Wichtig — beide Befehle sind nötig:**
- `task freshness:regenerate` aktualisiert die generierten Artefakte (test-inventory.json, route-manifest.json, agent-guide docs/maps, learning-assets, repo-index.json), sonst CI rot.
- `task freshness:check` ist das **CI-Äquivalent** und failt lokal genauso wie CI — insbesondere am **S1-Zeilen-Ratchet** (`quality:check` gegen `docs/code-quality/baseline.json`) sowie der Baseline-Key-Count-Assertion. **`task test:all` fängt S1 NICHT** (sein `test:code-quality` läuft nur die Gate-Unit-Tests, nicht das Ratchet über deine Dateien). Ohne `freshness:check` lokal wird eine Zeilen-Limit-Überschreitung erst nach dem Push in CI sichtbar — und du landest im Firefight-Modus.

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

> **Hinweis:** `E2E PR` ist kein required check (T000722). Auto-Merge wartet nur auf:
> `Offline Tests (Manifests, Configs, Unit)`, `Security Scan`, `Brett TypeScript`,
> `Vitest (website + arena-server)`, `Conventional Commits`.
> Ein roter E2E-Check blockiert den Merge NICHT — er erscheint als informativer
> gelber Status im PR. PR-Autor prüft E2E-Ergebnis manuell bei Bedarf.

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

# PR-Nummer in ticket_links eintragen, damit der Shipped-Tab sie zeigt (Fix 1):
./scripts/ticket.sh add-pr-link --id "$TICKET_ID" --pr "$PR_NUM"

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

# Plan-Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird (Fix 3/4):
sed -i 's/^status: active$/status: completed/' "$PLAN_FILE"

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


> **Mitten in der Umsetzung blockiert?** Nutzer grillen und die Antworten ans Ticket
> hängen: `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | Voraussetzung — liefert den Implementierungsplan |
| `dev-flow-iterate` | Alternative — inkrementelle Dev-Iteration |
| `dev-flow-e2e` | Folge — schreibt E2E-Tests nach Deploy |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).