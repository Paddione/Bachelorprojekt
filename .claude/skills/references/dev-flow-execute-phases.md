# dev-flow-execute — Phasen im Detail

Referenz zu [`dev-flow-execute`](../dev-flow-execute/SKILL.md). Der Skill-Body führt den Ablauf,
die Delegation an den Implementer und **alle Gates**; hier stehen die ausformulierten
Befehlsfolgen der mechanischen Schritte.

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
Bei mehreren staged plans den User via `AskUserQuestion` (Claude Code) oder `question` (opencode/agy) nach der gewünschten Ticket-ID fragen.


---

## Schritt −1 bis 0.5 — Pre-Flight, Sync, Worktree-Konsistenz, Rebase

Vor jeder Git-Operation MUSS das Ticket atomisch geclaimed werden (verhindert die Race
zwischen dev-flow-execute und der Factory-Pipeline — Claim VOR dem ersten Factory-Check).
Vollständige Mechanik (Status-Check, branch-scoped Claim [T003102], Exit-Code-Semantik, Broadcast):
[ticket-preflight-lock](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-preflight-lock.md).
```bash
TICKET_JSON=$(./scripts/vda.sh ticket get --id "$TICKET_ID" 2>/dev/null || echo '{}')
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
# [T003102] branch-scoped statt ticket-scoped: ein ticket-scoped Lock der
# auftraggebenden Session blockt den Abschluss durch Subagent/ticket-mcp/
# post-merge (je eigene SID). Der branch-scoped Claim schuetzt den Worktree,
# den diese Session betritt, und blockt den Status-Schreibpfad nicht; die
# Factory sieht ihn ueber die Ticket-ID im Branch-Namen.
bash scripts/agent-lock.sh claim branch "$CURRENT_BRANCH" --worktree "$(pwd)" --label dev-flow-execute \
  || { echo "🛑 siehe ticket-preflight-lock.md für Exit-Code-Behandlung"; exit 1; }
bash scripts/agent-msg.sh post "dev-flow-execute startet Arbeit an Ticket $TICKET_ID" --to all
```


## Schritt 0: Main-Branch im Haupt-Repo synchronisieren (Pull-First)

Synchronisiere `main` im Haupt-Repo:
```bash
bash scripts/agent-lock.sh reap           # Reaper — siehe session-coordination (SSOT)
bash scripts/agent-msg.sh read --unread   # Nachrichten paralleler Sessions [T000882]
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
if [[ -n "$MAIN_REPO" && -d "$MAIN_REPO" ]]; then
  (cd "$MAIN_REPO" && git fetch origin main && git pull --rebase origin main)
else
  git fetch origin main && git pull --rebase origin main
fi
```
Lock-Lebenszyklus (claim/release, Registry-Overlap): [session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md).

## Schritt 0: Worktree-Konsistenz prüfen

```bash
# Branch-Guard [T000321]
CURRENT_BRANCH=$(git branch --show-current)
# Automatisch aus dem aktuellen Branch ableiten
EXPECTED_BRANCH="$CURRENT_BRANCH"
if [[ -z "$CURRENT_BRANCH" || "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "🛑 HALT: Kein gültiger Branch ausgecheckt (detached HEAD)." >&2
  exit 1
fi
```
`dev-flow-execute` erwartet normalerweise, dass `dev-flow-plan` bereits einen isolierten Worktree unter
`.worktrees/*` übergeben hat. Das wird hier nie explizit geprüft — läuft die Execute-Phase versehentlich im
Haupt-Checkout (z.B. nach einem Session-Neustart), schreibt der Implementer-Subagent direkt ins
Haupt-Repo statt in eine isolierte Kopie [T001363]:
```bash
# Worktree-Isolation-Check [T001363]
# Wir sind entweder schon in einem .worktrees/*-Worktree ODER müssen einen anlegen.
if [[ "$PWD" != *".worktrees/"* ]]; then
  echo "⚠️  Kein isolierter Worktree unter .worktrees/* erkannt (PWD=$PWD)."
  SLUG=$(echo "$CURRENT_BRANCH" | sed 's#^[a-z]*/##')
  WORKTREE_PATH=".worktrees/${SLUG}"
  echo "→ Lege isolierten Worktree an: scripts/worktree-create.sh $CURRENT_BRANCH $WORKTREE_PATH"
  bash scripts/worktree-create.sh "$CURRENT_BRANCH" "$WORKTREE_PATH"
  if [[ -d "$WORKTREE_PATH" ]]; then
    echo "✅ Worktree bereit unter $WORKTREE_PATH — setze dort fort."
    # In den Worktree wechseln und die Implementierung delegieren.
    # Der Orchestrator muss die Session im neuen Worktree neu starten.
    echo "   Bitte Session im Worktree-Pfad fortsetzen: cd $(pwd)/$WORKTREE_PATH"
  else
    echo "❌ Worktree-Erstellung fehlgeschlagen." >&2
    exit 1
  fi
  exit 1
fi
```

## Schritt 0.5: Sync mit main & Rebase

```bash
git fetch origin main
git rebase origin/main
# Falls push fehlschlägt, wende --force-with-lease an
```


---

## Schritt 1 — Plan-Pfad aus der Datenbank laden

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

if [[ -z "$PLAN_FILE" ]]; then
  echo "🛑 Plan-Datei-Pfad leer im FACTORY-PLAN-REF für Ticket $TICKET_ID."
  echo "   → Re-run dev-flow-plan für dieses Ticket."
  exit 1
fi

# Validate the plan file exists in the current git tree (not just filesystem)
if ! git cat-file -e "HEAD:$PLAN_FILE" 2>/dev/null; then
  echo "🛑 Plan-Datei '$PLAN_FILE' existiert nicht im Git-Tree (Branch: $BRANCH)."
  echo "   → Re-run dev-flow-plan für dieses Ticket, oder prüfe den Worktree: git worktree list"
  exit 1
fi

echo "✅ Plan geladen: $PLAN_FILE (Branch: $BRANCH)"

# Validate OpenSpec delta artifacts exist (required by task test:openspec)
SLUG=$(basename "$PLAN_FILE" .md)
CHANGE_DIR="openspec/changes/$SLUG"
if [[ -d "$CHANGE_DIR" ]]; then
  if [[ ! -d "$CHANGE_DIR/specs" ]]; then
    echo "⚠️  $CHANGE_DIR/specs/ fehlt — Delta-Specs werden von test:openspec erwartet."
  fi
  if [[ ! -f "$CHANGE_DIR/.ticket" ]]; then
    echo "⚠️  $CHANGE_DIR/.ticket fehlt — Ticket-Reference wird von test:openspec erwartet."
  fi
else
  echo "⚠️  $CHANGE_DIR/ fehlt — OpenSpec-Change-Verzeichnis wurde nicht von dev-flow-plan angelegt."
fi
```


---

## Schritt 1.4 / 1.4.5 / 1.4.6 — Doppelarbeit-Guard und Pipeline-Modus

Der Ticket-Claim wurde bereits in Schritt −1.2 atomisch platziert. Hier wird
nur verifiziert, dass der Claim noch dieser Session gehört (z.B. nicht durch
einen Reaper zwischenzeitlich gelöscht):

```bash
bash scripts/agent-lock.sh check ticket "$TICKET_ID" | head -1 | grep -q '^mine$' \
  || { echo "🛑 Ticket $TICKET_ID nicht mehr von dieser Session geclaimed — Abbruch." >&2; exit 1; }
```

Prüfe zusätzlich den Registry-Overlap für geteilte Hochfrequenz-Dateien (SSOT:
[session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md)):

## Schritt 1.4.5: Pipeline-Modus erkennen (T002110)

Prüfe in der DB, ob das Ticket im Pipeline-Modus (Partial-Dispatch) gestaged wurde:

```bash
TICKET_STRUCT=$(./scripts/vda.sh ticket get --id "$TICKET_ID" 2>/dev/null || echo '{}')
SLOT_COUNT=$(echo "$TICKET_STRUCT" | jq -r '.slot_count // 1')
TICKET_STATUS=$(echo "$TICKET_STRUCT" | jq -r '.status // empty')
echo "ℹ️  Ticket $TICKET_ID: status=$TICKET_STATUS, slot_count=$SLOT_COUNT"
```

- **slot_count > 1:** Pipeline-Modus — die Factory hat bereits mit der Arbeit begonnen (vom Planner enqueued). Warte auf vollständige Partial-Dispatches (siehe Schritt 2.1).
- **slot_count = 1:** Single-Shot — normale sequentielle Ausführung.

### Schritt 1.4.6: Pipeline-Modus — Auf Partial-Vollständigkeit warten

Wenn `slot_count > 1` und Factory bereits läuft (`status == 'in_progress'`):

```bash
# Poll-Schleife: warte bis alle N Partials im Branch sichtbar sind
for wait_min in $(seq 1 30); do
  git fetch origin "$(git branch --show-current)"
  PLAN_COUNT=$(grep -c '^| p[0-9]' "$PLAN_FILE" 2>/dev/null || echo 0)
  if [ "$PLAN_COUNT" -ge "$SLOT_COUNT" ]; then
    echo "✅ Alle $SLOT_COUNT Partials sind im Branch sichtbar."
    break
  fi
  echo "⏳ Warte auf Partial $PLAN_COUNT/$SLOT_COUNT ..."
  git pull --rebase origin "$(git branch --show-current)"
  sleep 30
done
```

Dann normal rebasen und alle Partials implementieren.


---

## Schritt 1.5 / 1.7 — Ticket auf in_progress, touched_files, Assets

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
> `plan`/`implement`/`deploy`-Events entstehen jetzt automatisch aus den Statuswechseln (`update-status`/`stage-plan`); Doppel-Emission ist dank Dedup harmlos.
> **`touched_files` ist beim Stagen bereits gesetzt [T002446].** `stage-plan` leitet die Liste
> aus dem `## File Structure`-Block des Plans ab — der Block ist plan-lint Hard Rule STRUCT1,
> die Information existiert also zwingend. Dieser Schritt **ergänzt** deshalb nur noch, was der
> Plan nicht kannte; er ist kein Erstschreiben mehr. Vorher hing die Befüllung an der Formulierung
> „Falls der Plan die berührten Dateien kennt" — also an der Sorgfalt des ausführenden Agenten,
> und ein übersehener Fall genügt für eine unentdeckte Kollision.

Berührt die Umsetzung Dateien, die im Plan **nicht** standen, ergänze sie für die Conflict-Gate
(parallele Sessions sehen die Kollision via `agent-collision.sh`) — **MCP-first**:
> `mcp__ticket-mcp__set_touched_files({ id: "$TICKET_ID", files: "<alle Pfade, inkl. der bereits gesetzten>" })`
> `mcp__ticket-mcp__record_phase_event({ id: "$TICKET_ID", phase: "plan", state: "done", driver: "devflow", detail: "Plan geladen · Assets folgen" })`
Fallback:
```bash
# ACHTUNG: set-touched-files ERSETZT die Liste. Erst den Ist-Stand lesen, dann die neuen
# Pfade anhängen — sonst gehen die beim Stagen abgeleiteten Plan-Pfade verloren.
./scripts/ticket.sh get --id "$TICKET_ID"        # aktuelle touched_files ablesen
./scripts/ticket.sh set-touched-files --id "$TICKET_ID" --files "<bestehende>,<neue>"
./scripts/ticket.sh phase "$TICKET_ID" plan done --driver devflow --detail "Plan geladen · Assets folgen" || true
```

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

## Schritt 6.4 bis 7.5 — Merge-Wait, Ticket-Abschluss, Archivierung, Cleanup

tatsächlich durch ist, bevor das Ticket geschlossen wird (vermeidet Ticket=done bei
PR=OPEN+CONFLICTING Drift, Mishap T001149-M1). Voller Poll-Loop mit Timeout/State-Handling
(`MERGED`/`CLOSED`/Timeout-Exit-Codes): [ci-fix-loop](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ci-fix-loop.md)
§"PR-Merge-Wait-Loop" — der Subagent MUSS die Datei lesen und den Loop von dort ausführen
(nicht aus dem Gedächtnis rekonstruieren).


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
> `plan`/`implement`/`deploy`-Events entstehen jetzt automatisch aus den Statuswechseln (`update-status`/`stage-plan`); Doppel-Emission ist dank Dedup harmlos. Das `verify:done`-Event bleibt Pflicht (Merge-Gate).
Fallback (ticket-mcp nicht erreichbar; die `verify`-Zeile bleibt Pflicht, der Rest ist idempotent):
```bash
./scripts/ticket.sh add-pr-link --id "$TICKET_ID" --pr "$PR_NUM"
./scripts/vda.sh ticket update-status --id "$TICKET_ID" --status done --resolution "$RESOLUTION"
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "gate=ci result=pass" || true
./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow --detail "PR #$PR_NUM merged · done/shipped" || true
./scripts/ticket.sh add-comment --id "$TICKET_ID" --body "PR #$PR_NUM merged. Plan archived to tickets.ticket_plans."
```

## Schritt 7: Plan & OpenSpec archivieren

Zwei Schritte: (1) `tasks.md` nach postgres (`ticket-mcp` `archive_plan` bzw. `ticket.sh archive-plan`),
(2) der gesamte OpenSpec-Change-Ordner ins Archiv via `scripts/openspec.sh archive` — inkl.
Push-Verification (T001268) und PR-Creation-Verification (T001331). Vollständige Mechanik:
[plan-archive-steps](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-archive-steps.md).


## Schritt 7.5: Worktree & Branch bereinigen

Lösche den lokalen Worktree und Branch (im Haupt-Repo ausführen):
Claims freigeben VOR dem Worktree-Remove ([session-coordination](file:///home/patrick/Bachelorprojekt/.claude/skills/references/session-coordination.md)), dann:
```bash
git worktree remove "$MAIN_REPO/.worktrees/<slug>" --force
git branch -D "<branch>"
```


---

## BATS — ein File pro OpenSpec-Spec

  Neue `@test`-Einträge gehören in `tests/spec/<spec-slug>.bats` (die Spec zum Feature/Fix aus `openspec/specs/`).
  Reihenfolge:
  1. **Spec-Slug ermitteln:** Welche OpenSpec-Spec (`openspec/specs/*.md`) deckt das zu testende Verhalten ab?
  2. **Spec-File prüfen/anlegen:** Existiert `tests/spec/<spec-slug>.bats`? Falls ja → `@test`-Block einfügen. Falls nein → neue Datei anlegen (Vorlage: `tests/spec/software-factory/`).
  3. **Fallback:** Für übergreifende Tests ohne Spec-Zuordnung → passende Datei in `tests/unit/` erweitern.
  ```bash
  # Spec-Slug herausfinden:
  ls openspec/specs/          # alle SSOT-Specs
  ls tests/spec/              # bereits konsolidierte Spec-Dateien
  # @test in tests/spec/<slug>.bats einfügen, nicht neue tests/local/FA-XY-*.bats Datei
  ```
  **Ziel:** Die Gesamtzahl der `.bats`-Dateien in `tests/local/` sinkt oder bleibt konstant. Ticket-nummerierte Dateien (`FA-SF-42.bats`) sind Legacy — nicht neu anlegen.
