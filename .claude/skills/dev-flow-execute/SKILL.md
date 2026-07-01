---
name: dev-flow-execute
description: Use when on a feature/* or fix/* branch that has a staged plan in openspec/changes/ ready to implement. Invoke after dev-flow-plan has committed and pushed the plan to the branch.
---

# dev-flow-execute — Plan-Ausführung & PR

## Wann diese Skill greift

Du bist auf einem `feature/*` oder `fix/*` Branch. `dev-flow-plan` hat Spec und Plan committed und gepusht. Jetzt soll implementiert werden.

**Sage zu Beginn:** "Ich nutze dev-flow-execute zur Plan-Ausführung."

---

## Position im Git-Kreislauf

```
    ┌─────────────────────────────────────────────────────────────┐
    ▼                                                             │
[ main ]                                                          │
    │                                                             │
    └──► [branch + plan committed] ──► [implement] ──► [PR+merge] ──► AUSSTIEG
              (von dev-flow-plan)       DIESER SKILL              │
                                                                  │
                                        zurück zu [ main ] ───────┘
```

**EINSTIEG:** Feature/Fix-Branch mit `plan_staged` Ticket — von `dev-flow-plan` übergeben  
**AUSSTIEG:** PR gemergt zu `main`, Worktree bereinigt, Ticket `done/shipped`, Kreislauf geschlossen  
**Voraussetzung:** `dev-flow-plan` hat `FACTORY-PLAN-REF` Kommentar im Ticket hinterlegt

---

## Modus-Erkennung: Single vs Batch

```
    ┌─────────────────────────────────────────────────────────────┐
    ▼                                                             │
[ main ]                                                          │
    │                                                             │
    └──► [branch + plan committed] ──► [implement] ──► [PR+merge] ──► AUSSTIEG
              (von dev-flow-plan)       DIESER SKILL              │
                                                                  │
                                        zurück zu [ main ] ───────┘
```

**EINSTIEG:** Feature/Fix-Branch mit `plan_staged` Ticket — von `dev-flow-plan` übergeben  
**AUSSTIEG:** PR gemergt zu `main`, Worktree bereinigt, Ticket `done/shipped`, OpenSpec archiviert, Kreislauf geschlossen  
**Voraussetzung:** `dev-flow-plan` hat Branch + Plan-Pfad via `ticket.sh stage-plan` in der DB verankert

---

## Ticket-ID ermitteln

Falls `TICKET_ID` nicht bereits im Kontext gesetzt ist (z.B. vom User oder aus dem Branch-Namen ableitbar):

Plan-Metadaten aus der DB holen — **MCP-first** (`mcp-postgres`, READ-ONLY, nimmt nur `sql`):

> `mcp__mcp-postgres__query({ sql: "SELECT external_id, title FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC LIMIT 10;" })`

Fallback (mcp-postgres nicht erreichbar — Verfügbarkeits-Guard siehe [`mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md)):

```bash
kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC LIMIT 10;"
```

Bei mehreren staged plans den User via `AskUserQuestion`-Tool nach der gewünschten Ticket-ID fragen.

---

## Schritt −1: Main-Branch im Haupt-Repo synchronisieren (Pull-First)

Synchronisiere `main` im Haupt-Repo:

```bash
bash scripts/agent-lock.sh reap   # Session-Koordination [T000510]: Zombie-Prozesse, stale Worktrees & tote Locks räumen
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
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

`dev-flow-execute` erwartet normalerweise, dass `dev-flow-plan` bereits einen isolierten Worktree unter
`tmp/wt-*` übergeben hat. Das wird hier nie explizit geprüft — läuft die Execute-Phase versehentlich im
Haupt-Checkout (z.B. nach einem Session-Neustart), schreibt der Implementer-Subagent direkt ins
Haupt-Repo statt in eine isolierte Kopie [T001363]:

```bash
# Worktree-Isolation-Check [T001363]
# Wir sind entweder schon in einem tmp/wt-*-Worktree ODER müssen einen anlegen.
if [[ "$PWD" != *"/tmp/wt-"* ]]; then
  echo "⚠️  Kein isolierter Worktree unter tmp/wt-* erkannt (PWD=$PWD)."
  SLUG=$(echo "$EXPECTED_BRANCH" | sed 's#^[a-z]*/##')
  WORKTREE_PATH="tmp/wt-${SLUG}"
  echo "→ Lege isolierten Worktree an: scripts/worktree-create.sh $EXPECTED_BRANCH $WORKTREE_PATH"
  bash scripts/worktree-create.sh "$EXPECTED_BRANCH" "$WORKTREE_PATH"
  echo "✅ Worktree bereit unter $WORKTREE_PATH — dorthin wechseln, bevor mit Schritt 1 fortgefahren wird."
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
(als `FACTORY-PLAN-REF branch=<branch> plan=<plan_path>` Kommentar im Ticket). **Niemals** per Glob raten —
immer die DB als Quelle nutzen.

```bash
# TICKET_ID muss bekannt sein (aus Branch-Name, User-Input, oder ticket.sh get --branch <branch>)
TICKET_ID="<T-######>"

# Plan-Metadaten aus der Datenbank laden
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID")
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

> **Optional:** Wenn der Plan via `dev-flow-plan` auf `plan_staged` steht, kannst du vor diesem
> Schritt `/opsx:apply <slug>` aufrufen — das ist die upstream-Variante von `task openspec:apply`,
> die den OpenSpec-Change in den Apply-Modus überführt. Fallback wenn die upstream-CLI nicht
> installiert ist: `task openspec:apply -- <slug>`.

Falls eine Ticket-ID vorhanden ist, setze das Ticket auf in_progress — **MCP-first** (`ticket-mcp`):

> `mcp__ticket-mcp__transition_status({ id: "$TICKET_ID", status: "in_progress" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "plan", state: "entered", driver: "devflow", detail: "Plan: <slug> · $TICKET_ID" })`

Fallback (ticket-mcp nicht erreichbar; Live-Floor-Telemetrie ist best-effort und darf den Flow nie stoppen):

```bash
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status in_progress
SLUG=$(basename "$PLAN_FILE" .md)
./scripts/ticket.sh phase "$TICKET_ID" plan entered --driver devflow --detail "Plan: $SLUG · $TICKET_ID" || true
```

Falls der Plan die berührten Dateien kennt, registriere sie für die Conflict-Gate (parallele Sessions sehen die Kollision via `agent-collision.sh`) — **MCP-first**:

> `mcp__ticket-mcp__set_touched_files({ id: "$TICKET_ID", files: "<comma-separated-paths>" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "plan", state: "done", driver: "devflow", detail: "Plan geladen · Assets folgen" })`

Fallback:

```bash
./scripts/ticket.sh set-touched-files --id "$TICKET_ID" --files "<comma-separated-paths>"
./scripts/ticket.sh phase "$TICKET_ID" plan done --driver devflow --detail "Plan geladen · Assets folgen" || true
```

---

## Schritt 1.7: Visual & Textual Assets laden (Visual Handoff)

Falls eine Ticket-ID vorhanden ist, lade alle Anhänge (wie Screenshots, Logdateien, Mockups) herunter — **MCP-first** (`ticket-mcp`):

> `mcp__ticket-mcp__get_attachments({ id: "$TICKET_ID", out_dir: "/tmp/ticket-attachments-$TICKET_ID" })`

Fallback (ticket-mcp nicht erreichbar):

```bash
ATTACHMENT_DIR="/tmp/ticket-attachments-$TICKET_ID"
./scripts/ticket.sh get-attachments --id "$TICKET_ID" --out-dir "$ATTACHMENT_DIR"
```

**⚠️ Pflicht für UI-Arbeiten:** Lies (mit dem `Read` Tool) alle heruntergeladenen Bilddateien und Textdateien in diesem Ordner ein, um ein pixelgenaues Verständnis des UI-Designs zu erlangen. Verlasse dich nicht auf Prose allein.

---

## Schritt 2: Implementierung an frischen Implementer-Subagenten delegieren

Live-Floor-Telemetrie (best-effort): Implementer-Subagent wird gespawnt — **MCP-first**:

> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "entered", driver: "devflow", detail: "Subagent gestartet" })`

Fallback:

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```

Statt deinen eigenen Kontext/Modell zurückzusetzen (das ließe dich den Faden verlieren), delegiere die **gesamte Implementierung an EINEN frischen Subagenten** — sauberer Kontext per Konstruktion. Du behältst den vollen Plan-Kontext und verifizierst das Ergebnis anschließend unabhängig.

> **Warum EIN Implementer statt `superpowers:subagent-driven-development`-Fan-out?** Dieser Skill läuft bereits *selbst* als delegierte Ebene (oft aus einem dev-flow-Orchestrator). Ein zusätzlicher Per-Task-Fan-out wäre **verschachtelte Delegation** $\rightarrow$ Kontext-Explosion und Synthese-Last (siehe [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md), 162k-Prompt-Lehre). Der Implementer ruft `superpowers:executing-plans` daher **in-context** auf (kein weiterer Agenten-Fan-out). Nur wenn der Plan ausdrücklich viele **voneinander unabhängige** Tasks hat und der Einzel-Implementer am Kontext-Limit scheitert, lohnt der Wechsel auf `subagent-driven-development` bzw. einen `Workflow`-Fan-out — bewusste Eskalation, nicht Default.

Spawne den Subagenten:
* **Gemini/Antigravity CLI:** call `invoke_subagent` with `TypeName: "self"` (inherits permissions and tools), `Role: "Implementer <TICKET_ID>"`, and `Workspace: "share"` (or `"inherit"`).
* **Claude Code CLI:** Spawne über das `Agent`/`Task`-Tool einen Subagenten, **provisioniert gemäß** [subagent-provisioning](file:///home/patrick/Bachelorprojekt/.claude/skills/references/subagent-provisioning.md) (Modell · Effort · Kontext):
  * **Modell — nach Plan-Charakter wählen, nicht pauschal:** mechanisch (Config/Doku/Single-File) $\rightarrow$ `haiku`; Standard-Feature/Fix $\rightarrow$ `sonnet`; komplex/riskant (systemübergreifend, Architektur, DB-Migration, Auto-Deploy) $\rightarrow$ `opus`.
  * **Effort per Prompt-Direktive** (das `Agent`-Tool kennt keinen Effort-Regler): mechanisch „Arbeite zügig und fokussiert."; komplex/riskant „Ultrathink. Denke sehr gründlich nach."
  * `subagent_type: general-purpose`.
- **Kontext-Injektion** (er hat sonst KEINEN Kontext — gib ihm alles explizit):
  - **Absoluter Worktree-Pfad (PFLICHT):** Beginne JEDEN Subagenten-Prompt mit `cd <WORKTREE_PATH>` (z.B. `cd /tmp/wt-<slug>`). Der Subagent hat keinen impliziten CWD und schreibt sonst Dateien ins Haupt-Checkout. Danach: Branch-Name; er arbeitet NUR relativ zum Worktree.
  - Plan-Datei `$PLAN_FILE` (aus Schritt 1, via DB aufgelöst) + Ticket-ID.
  - Attachment-Verzeichnis `$ATTACHMENT_DIR` — bei UI-Arbeit ALLE Bilder/Texte mit dem `Read`-Tool einlesen.
  - **Plan Intel Bundle (PFLICHT):** `openspec/changes/<slug>/intel.json` (aus der Plan-Phase) — der
    Implementer lädt es als Pflicht-Kontext (analog zu `$ATTACHMENT_DIR`) und arbeitet gegen dieselbe
    Typen-Wahrheit wie der Plan: reale Signaturen aus `symbols`, DB-Spalten aus `db_tables`,
    API-Contracts aus `api_contracts` — kein Re-Explorieren. Format:
    [plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).
- **⚠️ BATS-Pflicht — Konvention: ein File pro OpenSpec-Spec:**
  Neue `@test`-Einträge gehören in `tests/spec/<spec-slug>.bats` (die Spec zum Feature/Fix aus `openspec/specs/`).
  Reihenfolge:
  1. **Spec-Slug ermitteln:** Welche OpenSpec-Spec (`openspec/specs/*.md`) deckt das zu testende Verhalten ab?
  2. **Spec-File prüfen/anlegen:** Existiert `tests/spec/<spec-slug>.bats`? Falls ja → `@test`-Block einfügen. Falls nein → neue Datei anlegen (Vorlage: `tests/spec/software-factory.bats`).
  3. **Fallback:** Für übergreifende Tests ohne Spec-Zuordnung → passende Datei in `tests/unit/` erweitern.
  ```bash
  # Spec-Slug herausfinden:
  ls openspec/specs/          # alle SSOT-Specs
  ls tests/spec/              # bereits konsolidierte Spec-Dateien
  # @test in tests/spec/<slug>.bats einfügen, nicht neue tests/local/FA-XY-*.bats Datei
  ```
  **Ziel:** Die Gesamtzahl der `.bats`-Dateien in `tests/local/` sinkt oder bleibt konstant. Ticket-nummerierte Dateien (`FA-SF-42.bats`) sind Legacy — nicht neu anlegen.

- **Auftrag:**
  - **/goal: Finish dev-flow-execute and merge the PR cleanly.**
  - *Feature:* Rufe `superpowers:executing-plans` (in-context, KEIN weiterer Agenten-Fan-out) + `test-driven-development` auf und arbeite den Plan vollständig ab. Aktualisiere nach jedem Meilenstein die Checkbox im Plan (`- [ ] M1` → `- [x] M1`), committe und pushe.
  - *Fix:* Verifiziere zuerst, dass ein failing Test existiert, dann nach Rot-Grün-Prinzip bis grün.
   - Bei Kompilier-/Testfehlern: diagnostiziere und fixe systematisch (Logs lesen, Fehler eingrenzen, Hypothese testen, fixen, Re-Test).
  - **PFLICHT vor PR-Erstellung — Freshness-Artefakte regenerieren und committen** (sonst schlägt CI mit "stale artifact" fehl; `executing-plans` → `finishing-a-development-branch` überspringt diesen Schritt):
    ```bash
    task freshness:regenerate
    git add \
      website/src/data/test-inventory.json \
      website/src/data/route-manifest.json \
      website/src/lib/learning-assets.generated.json \
      "website/public/learning-assets/THIRD-PARTY-ASSETS.md" \
      docs/code-quality/repo-index.json \
      docs/agent-guide/10-ziele.md \
      docs/agent-guide/20-werkzeuge.md \
      docs/agent-guide/30-bausteine.md \
      docs/agent-guide/maps/goals-map.md \
      docs/agent-guide/maps/tools-map.md \
      docs/agent-guide/maps/danger-map.md \
      website/src/lib/agent-guide.generated.json \
      website/src/lib/platform-descriptions.generated.json \
      docs/generated/graph.json \
      docs/generated/api-map.json \
      docs/generated/blast-radius.md 2>/dev/null || true
    git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [$TICKET_ID]"
    ```
  - Erstelle einen PR, durchlaufe die CI-Fix-Schleife bis grün, und merge via Auto-Merge.
  - Schließe das Ticket ab und archiviere den Plan.

Der Subagent führt den gesamten dev-flow-execute-Pipeline selbstständig bis zum Merge durch. Du wirst per `<task-notification>` benachrichtigt, wenn er fertig ist. Fahre dann mit Schritt 8 (Post-Merge Deploy & Verify) fort.

---

## Schritt 2.5 — Lokaler Self-Correcting-Loop (optional)

Nach dem Implementer-Subagenten (Schritt 2) **vor** der finalen Verifikation (Schritt 3):

```bash
bash scripts/devflow-build-loop.sh "$TICKET_ID"
```

- Default `MAX_LOOP=3`, env `FACTORY_BUILD_LOOP_MAX` überschreibbar.
- Bei `abort:escalate-gate|no-progress|max-iterations`: Eskalation (Ticket-Kommentar), **kein** blindes Weiter-Pushen.
- **Abgrenzung zu Schritt 5.5:** Dieser Loop ist **vorgelagert** (lokal, vor `git push`) und reduziert die Last auf die CI-Retry-Schleife — ersetzt sie aber nicht. Schritt 3 (finale Verifikation) bleibt unverändert.

---

## Schritt 3: Lokale Verifikation

Rufe das Skill **`verification-before-completion`** auf, um die Verifikation strukturiert zu steuern.

Phasen-Telemetrie (best-effort) — **MCP-first** (`ticket-mcp`):

> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "done", driver: "devflow", detail: "Implementierung fertig" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "entered", driver: "devflow", detail: "task test:changed + freshness" })`

Verifikation ausführen:

```bash
task workspace:validate
./tests/runner.sh local <FA-XX oder SA-XX>
task test:changed
task freshness:regenerate
task freshness:check        # CI-Äquivalent — failt lokal GENAU wie CI (S1–S4-Ratchet + Baseline-Assertion)
```

Nach grünen Tests — **MCP-first**:

> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "done", driver: "devflow", detail: "Tests grün · freshness OK" })`

Fallback (ticket-mcp nicht erreichbar; Telemetrie ist best-effort und darf den Flow nie stoppen):

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:changed + freshness" || true
# nach den Tests:
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```

**Wichtig — beide Befehle sind nötig:**
- `task freshness:regenerate` aktualisiert die generierten Artefakte (test-inventory.json, route-manifest.json, agent-guide docs/maps, learning-assets, repo-index.json), sonst CI rot.
- `task freshness:check` ist das **CI-Äquivalent** und failt lokal genauso wie CI — insbesondere am **S1-Zeilen-Ratchet** (`quality:check` gegen `docs/code-quality/baseline.json`) sowie der Baseline-Key-Count-Assertion. Ohne `freshness:check` lokal wird eine Zeilen-Limit-Überschreitung erst nach dem Push in CI sichtbar — und du landest im Firefight-Modus.

Siehe [dev-flow-gotchas](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md) für TypeScript/pnpm Gotchas in Worktrees.

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

> **Scope vorab prüfen [T001395]:** Bevor `<scope>` gewählt wird, gegen die SSOT-Allowlist
> abgleichen (`bash scripts/validate-commit-msg.sh scopes`) — nicht erst beim
> `preflight-pr-scope.sh`-Check unten. Ein geratener, nicht registrierter Scope (z. B.
> `installer`/`rustdesk`) erzwingt sonst einen Soft-Reset + Recommit mitten im Flow. Siehe
> [dev-flow-gotchas T001395](file:///home/patrick/Bachelorprojekt/.claude/skills/references/dev-flow-gotchas.md).

```bash
# Branch-Guard prüfen
BASE_SHA="$(git rev-parse "@{upstream}" 2>/dev/null || git rev-parse origin/main)"
git add -A
git commit -m "<type>(<scope>): <subject> [<TICKET_ID>]" # commitlint regeln beachten (<100 Zeichen Subject/Header)
# Closes T000XXX im Body bei Fixes

# Verify commit landed — git-crypt clean filter can cause silent commit failures
# in worktrees, and an un-chained push would send an empty branch. [T000925]
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" = "$BASE_SHA" ]; then
  echo "FATAL: commit did not land (git-crypt clean filter?). Push aborted." >&2
  exit 1
fi

# Validate PR title scope BEFORE creating the PR — prevents a full CI cycle loss
# when the scope is not in the semantic-PR allowlist (e.g. 'cockpit' instead of 'admin'). [T000925]
bash scripts/preflight-pr-scope.sh "<type>(<scope>): <subject>"
if [ $? -ne 0 ]; then
  echo "FATAL: PR title scope failed preflight — fix the scope and retry." >&2
  exit 1
fi

git push -u origin "$(git rev-parse --abbrev-ref HEAD)"
```

> **Titel nachträglich editieren (REST-Fallback):** `gh pr edit --title` scheitert
> gelegentlich an einer Projects-Classic-GraphQL-Deprecation. Nutze stattdessen:
> ```bash
> gh api -X PATCH "repos/{owner}/{repo}/pulls/<n>" -f title="<neuer Titel>"
> ```
> Der Preflight (oben) sollte Titel-Edits aber überflüssig machen. [T000925]

Rufe `commit-commands:commit-push-pr` auf (oder führe `gh pr create` manuell aus).

---

## Schritt 5.5: CI/CD-Fix-Schleife

Nachdem der PR gepusht ist, überwache CI und behebe Fehler — bevor du mergst. Details und Required-Check-Liste: [references/ci-fix-loop.md](references/ci-fix-loop.md).

```bash
PR_URL=$(gh pr view --json url -q '.url')
bash scripts/devflow-ci-watch.sh "$TICKET_ID" "$PR_URL"
```

Bei roten Checks: Logs aus dem Skript-Output als Prompt-Kontext an einen `sonnet`-Subagenten übergeben (Fix-Routine: Freshness → TS → BATS → Kustomize → Commitlint), nach erfolgreichem Push Loop wiederholen.

`devflow-ci-watch.sh` prüft `mergeStateStatus` bereits **vor** dem CI-Poll-Loop und rebased bei `DIRTY` selbstständig gegen `origin/main` (T001408, Finding 2). Bricht der Rebase mit einem Konflikt ab, beendet sich das Skript mit Exit-Code `3` (statt hängen zu bleiben). In diesem Fall löst der **implementierende Subagent selbst** den Konflikt (kein zweiter Subagent für denselben Branch — genau das Doppel-Push-Risiko aus T001408) und ruft `devflow-ci-watch.sh` danach erneut auf.

---

## Schritt 6: Auto-Merge wenn CI grün

> **Hinweis:** `E2E PR` ist kein required check (T000722). Auto-Merge wartet nur auf:
> `Offline Tests (Manifests, Configs, Unit)`, `Security Scan`, `Brett TypeScript`,
> `Vitest (website)`, `Conventional Commits`.
> Ein roter E2E-Check blockiert den Merge NICHT — er erscheint als informativer
> gelber Status im PR. PR-Autor prüft E2E-Ergebnis manuell bei Bedarf.

```bash
# Merge PR aus dem Haupt-Repo, um Konflikte zu vermeiden
(cd "$MAIN_REPO" && gh pr merge --auto --squash --delete-branch)
```

---

## Schritt 6.4: Warte auf PR-Merge (vor Ticket-Abschluss)

`gh pr merge --auto` kehrt sofort zurück — der eigentliche Merge passiert asynchron im Hintergrund.
Bisher hat Schritt 6.5 das Ticket direkt nach `--auto` auf `done` gesetzt, was zu Drift führte
(s. Mishap T001149-M1, T001145/PR #2101: Ticket `done`, PR aber OPEN+CONFLICTING).
Jetzt: **warten, bis der Merge tatsächlich durch ist**, bevor das Ticket geschlossen wird.

```bash
PR_NUM=$(gh pr view --json number -q '.number')
PR_URL="https://github.com/Paddione/Bachelorprojekt/pull/$PR_NUM"
MAX_MERGE_WAIT_MIN="${MAX_MERGE_WAIT_MIN:-15}"
WAIT_START=$(date +%s)

echo "⏳ Warte auf Merge von PR #$PR_NUM (max ${MAX_MERGE_WAIT_MIN}min) ..."
MERGE_STATE=""
while true; do
  MERGE_STATE=$(gh pr view "$PR_NUM" --json mergeStateStatus,state -q '.state + "|" + .mergeStateStatus' 2>/dev/null || echo "UNKNOWN|UNKNOWN")
  STATE="${MERGE_STATE%%|*}"
  MS="${MERGE_STATE##*|}"

  case "$STATE" in
    MERGED)
      echo "✅ PR #$PR_NUM ist gemergt — fahre mit Ticket-Abschluss fort."
      break
      ;;
    CLOSED)
      echo "❌ PR #$PR_NUM wurde geschlossen ohne Merge — breche ab." >&2
      exit 2
      ;;
  esac

  ELAPSED=$(( $(date +%s) - WAIT_START ))
  if (( ELAPSED > MAX_MERGE_WAIT_MIN * 60 )); then
    echo "❌ PR #$PR_NUM nach ${MAX_MERGE_WAIT_MIN}min noch nicht gemergt (state=$STATE mergeStateStatus=$MS)." >&2
    echo "   CI rot? Branch-Protection blockiert? Manuell prüfen:" >&2
    echo "   gh pr view $PR_NUM --json mergeStateStatus,statusCheckRollup,reviewDecision" >&2
    exit 3
  fi

  sleep 15
done
```

---

## Schritt 6.5: Ticket abschließen

Falls eine Ticket-ID vorhanden ist, schließe das Ticket:

PR-Nummer ermitteln (falls nicht aus Schritt 6.4 bekannt):

```bash
RESOLUTION="shipped" # oder "fixed" bei Fixes
: "${PR_NUM:=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")}"
```

Abschluss-Lifecycle — **MCP-first** (`ticket-mcp`). Merge = Abschluss (T001092): Schritt 6.4 hat bestätigt, dass der PR gemergt ist; der Prod-Deploy (Schritt 8) ist entkoppelt und ändert den Ticket-Status NICHT.

> `mcp__ticket-mcp__add_pr_link({ id: "$TICKET_ID", pr: "$PR_NUM" })`
> `mcp__ticket-mcp__transition_status({ id: "$TICKET_ID", status: "done", resolution: "<shipped|fixed>" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "done", driver: "devflow", detail: "gate=ci result=pass" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "deploy", state: "done", driver: "devflow", detail: "PR #$PR_NUM merged · done/shipped" })`
> `mcp__ticket-mcp__add_comment({ id: "$TICKET_ID", body: "PR #$PR_NUM merged. Plan archived to tickets.ticket_plans." })`

Fallback (ticket-mcp nicht erreichbar; die Phasen-Events sind best-effort und nie blockierend):

```bash
./scripts/ticket.sh add-pr-link --id "$TICKET_ID" --pr "$PR_NUM"
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "gate=ci result=pass" || true
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "PR #$PR_NUM merged · done/shipped" || true
./scripts/ticket.sh add-comment --id "$TICKET_ID" --body "PR #$PR_NUM merged. Plan archived to tickets.ticket_plans."
```

---

## Schritt 7: Plan & OpenSpec archivieren

Zwei Schritte: (1) `tasks.md` nach postgres, (2) den gesamten OpenSpec-Change-Ordner ins Archiv.

```bash
SLUG="<slug>"
BRANCH="feature/<slug>" # oder fix/<slug>
PR_NUM=$(gh pr view --json number -q '.number' 2>/dev/null || echo "")

# 1. Plan-Frontmatter auf completed setzen, BEVOR der Inhalt archiviert wird:
sed -E -i 's/^status: (active|plan_staged|in_progress)$/status: completed/' "$PLAN_FILE"
```

2. tasks.md → postgres (`tickets.ticket_plans`) — **MCP-first** (`ticket-mcp`):

> `mcp__ticket-mcp__archive_plan({ id: "$TICKET_ID", slug: "$SLUG", branch: "$BRANCH", plan_file: "$PLAN_FILE", pr: "$PR_NUM" })`

Fallback (ticket-mcp nicht erreichbar):

```bash
./scripts/ticket.sh archive-plan \
  --id "$TICKET_ID" \
  --slug "$SLUG" \
  --branch "$BRANCH" \
  --plan-file "$PLAN_FILE" \
  --pr "$PR_NUM"
```

3. OpenSpec-Change archivieren: `openspec/changes/<slug>/` → `openspec/changes/archive/<date>-<slug>/`. Verschiebt proposal.md, tasks.md, specs/, assets/ ins Archiv und aktualisiert den SSOT-Delta.

```bash
bash scripts/openspec.sh archive "$SLUG"
# Alternativ: task openspec:archive -- "$SLUG"

# 4. Archivierung committen und via PR mergen (wegen Branch-Protection)
git add openspec/changes/ openspec/changes/archive/
git commit -m "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]"

ARCHIVE_BRANCH="chore/plan-archive-${SLUG//\//-}"
git checkout -b "$ARCHIVE_BRANCH"

# Push-Verification Checkpoint (PFLICHT — Schritt 7) [T001268]:
# Bevor der archive commit als "erledigt" gilt, MUSS der Subagent beweisen, dass
# der Commit auf origin ist. Wir prüfen via `git ls-remote origin`, dass der
# remote SHA gleich dem lokalen HEAD ist. `push_verified:<sha>` ist ein
# Pflicht-Feld im Subagent-Return-Contract — der Orchestrator darf ohne dieses
# Feld weder mergen noch das Ticket schließen.
git push -u origin "$ARCHIVE_BRANCH" || { echo "FATAL: archive push fehlgeschlagen" >&2; exit 1; }
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/$ARCHIVE_BRANCH" | awk '{print $1}')"
[ "$LOCAL_SHA" = "$REMOTE_SHA" ] || { echo "FATAL: push_verified mismatch — local=$LOCAL_SHA remote=$REMOTE_SHA" >&2; exit 1; }
echo "push_verified:$LOCAL_SHA"

gh pr create --title "chore(plans): archive $SLUG → postgres + openspec/archive [$TICKET_ID]" --base main

# PR Creation Verification (T001331): Confirm the PR was actually created.
# The subagent must return pr_created:<pr-number> alongside push_verified:<sha>.
# The orchestrator must not proceed without both fields.
PR_NUM="$(gh pr view --json number -q '.number' 2>/dev/null || echo '')"
if [ -z "$PR_NUM" ]; then
  echo "FATAL: gh pr create did not produce a visible PR — orphan branch left behind." >&2
  exit 1
fi
echo "pr_created:$PR_NUM"
gh pr merge --auto --squash --delete-branch
```

---

## Schritt 7.5: Worktree & Branch bereinigen

Lösche den lokalen Worktree und Branch (im Haupt-Repo ausführen):

```bash
# Claims freigeben (Session-Koordination [T000510]) — VOR dem Worktree-Remove:
bash scripts/agent-lock.sh release ticket "$TICKET_ID" 2>/dev/null || true
bash scripts/agent-lock.sh release branch "<branch>" 2>/dev/null || true
git worktree remove "$MAIN_REPO/tmp/wt-<slug>" --force
git branch -D "<branch>"
```

---

## Schritt 8: Post-Merge Deploy & Verify

```bash
bash scripts/devflow-post-merge-deploy.sh "$TICKET_ID"
```

**Deploy-Mapping (Single Source of Truth):** Pfad→Task-Tabelle und Pod-Verify-Schleife leben in [deploy-routing](file:///home/patrick/Bachelorprojekt/.claude/skills/references/deploy-routing.md). Bei Änderungen am Deploy-Mapping **nur** diese Referenz pflegen.

Führe danach `dev-flow-e2e` aus, um E2E-Tests gegen die Live-Umgebung zu schreiben.

---


> **Mitten in der Umsetzung blockiert?** Nutzer mit `lavish` grillen — erstelle `.lavish/<slug>-grilling.html` (Input-Playbook) und poll auf Antworten. Danach die Antworten ans Ticket
> hängen: `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.

## Übergabe — Kreislauf geschlossen

**Zustand nach Schritt 8:**
- `main` enthält die gemergten Änderungen (squash commit)
- Worktree `/tmp/wt-<slug>` gelöscht, Branch `feature/<slug>` gelöscht
- Ticket status = `done` (resolution=shipped)
- Branch-Lock und Ticket-Lock freigegeben
- Deployed (falls `devflow-post-merge-deploy.sh` Pfad-Treffer)

**Kreislauf zurück zu `main`** — nächste Arbeit startet mit `dev-flow-plan` von einem frischen `git pull`.

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `dev-flow-plan` | **Vorgänger im Kreislauf** — liefert Branch + committiertem Plan |
| `dev-flow-iterate` | Alternative — inkrementelle Dev-Iteration |
| `dev-flow-e2e` | Folge — schreibt E2E-Tests nach Deploy |
| `mishap-tracker` | Abschluss — protokolliert Frictions |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende des Skills über `mishap-tracker` (Invoke `mishap-tracker` with your accumulated MISHAP_LOG).