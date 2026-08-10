> **⚠ Reihenfolge: erst committen, dann stagen [T002673].** Schritt 4.5 legt das Ticket an und
> claimt es; der eigentliche `stage-plan`-Aufruf gehört **hinter** den Plan-Commit aus Schritt 5.
> `stage-plan.sh` liest die Plandatei per `git cat-file -p "${branch}:${plan}"` aus dem
> **Branch-Commit**, nicht aus dem Arbeitsbaum. Läuft es vor dem Commit, findet es dort das
> `propose`-Skeleton, die `touched_files`-Ableitung ist leer — und seit T003267 **bricht
> `stage-plan` dann mit Exit 1 ab** statt still zu melden. Override für legitime Sonderfälle
> ohne File-Structure-Pfade: `--allow-empty-touched`. Der Aufruf ist idempotent und vereinigt
> `touched_files` in SQL; ein Zweitaufruf nach dem Commit repariert es also, die richtige
> Reihenfolge erspart ihn.

### Schritt 4.5: Ticket anlegen oder wiederverwenden
Prüfe ob ein bestehendes Ticket-ID übergeben wurde (z.B. von `feature-intake`).
**MCP-first** (`ticket-mcp`) — wenn noch kein `TICKET_EXT_ID` gesetzt ist, ein neues Ticket anlegen (Rückgabe-Parsing: MCP-Tool-Guide §ticket-mcp).
> `mcp__ticket-mcp__create_ticket({ type: "task", brand: "mentolder", title: "Plan: <slug>", priority: "mittel", description: "Branch: feature/<slug>\nPlan: openspec/changes/<slug>/tasks.md\nSpec: openspec/changes/<slug>/design.md\n<grilling-ref>" })`
Bei vorhandenem Ticket stattdessen die UUID lesen: `mcp__ticket-mcp__get_ticket({ id: "$TICKET_EXT_ID" })` → `.id` ist die UUID.
Plan stagen (Branch + Plan-Pfad im Ticket verankern — SSOT für dev-flow-execute) — **MCP-first**:
> `mcp__ticket-mcp__stage_plan({ id: "$TICKET_EXT_ID", branch: "feature/<slug>", plan: "openspec/changes/<slug>/tasks.md" })`

**Partial-Anzahl mitgeben (T002074):** Bei einem Multi-Partial-Plan die Slot-Zahl
für das Gang-Gating durchreichen — MCP-seitig via `set_plan_meta`, sonst per Fallback
`bash scripts/ticket.sh stage-plan --id "$TICKET_EXT_ID" --branch "feature/<slug>" --plan "openspec/changes/<slug>/tasks.md" --partials N`
(N = Anzahl der Partials aus dem `## Partials`-Manifest, 1..9; Default 1). `--partials`
lebt in `scripts/vda/ticket/stage-plan.sh` — `scripts/ticket.sh` bleibt unberührt.

> **`--partials` ist PFLICHT, auch für einen einzelnen, nicht aufgeteilten Fix-Plan** —
> `stage-plan.sh` validiert `case "$partials" in [1-9]`. Das stand bisher nirgends, und die
> Formulierung „bei einem Multi-Partial-Plan" liest sich wie eine Ausnahme. [T002372-M2]

> **⚠️ `stage-plan` verlangt seit T003267 eine explizite Hold-Entscheidung.** Ohne
> `--hold` ODER `--no-hold` beendet sich `stage-plan.sh` mit Exit 1. `--no-hold` weckt
> `factory.service` und setzt eine Force-Tick-Flag — die Factory greift sofort zu.
> Wer interaktiv plant und den Zeitpunkt selbst bestimmen will, muss `--hold` setzen.
> `dev-flow-execute` gibt später per `ticket.sh release-hold` frei. [T002372-M2]

> **Flag-Drift zu `archive-plan`:** `stage-plan` akzeptiert seit [T002375-p3] **beides**,
> `--plan` und `--plan-file`. `archive-plan` kennt weiterhin nur `--plan-file` — dort ist das
> der etablierte Name, den auch der MCP-Wrapper `archive_plan` verwendet. Ein Flag zur Uebergabe des Slugs
> hat es an keiner der beiden Stellen je gegeben — der Slug steckt im Plan-Pfad.

> **Exit-Code über eine Pipe: `${PIPESTATUS[0]}`, nicht `$?`.** Läuft der Aufruf als
> `timeout 120 bash scripts/ticket.sh stage-plan … | tail -5`, misst `$?` das **letzte**
> Glied der Pipe — also `tail`, das praktisch immer 0 liefert. Ein falsches Flag sieht dann
> wie ein Erfolg aus, und genau das machte die beiden Punkte oben unsichtbar. [T002372-M2]
>
> ```bash
> timeout 120 bash scripts/ticket.sh stage-plan … | tail -5
> [ "${PIPESTATUS[0]}" -eq 0 ] || echo "stage-plan FEHLGESCHLAGEN"
> ```

**Embedding-Index (Hybrid-Kontext-Transfer Teil 2):** Direkt nach dem Stage, vor
Commit/Push, den Change nach pgvector indizieren, damit die Execute-/Factory-Phase
ihn per factory-mcp `openspec_find_similar` abrufen kann — über den **fail-visible
Wrapper** (NICHT das nackte `openspec-embed.mjs`, das skippt bei fehlender Env still):
`bash scripts/openspec-embed-local.sh <slug> "$(pwd)"`
(2. Argument = Worktree-Root, in dem `openspec/changes/<slug>/` liegt. Der Wrapper
löst SESSIONS_DATABASE_URL selbst per kubectl/port-forward auf, probt das
TEI-Backend vorab und bricht mit Remediation-Hinweis ab statt still zu skippen.
Exit ≠ 0 ⇒ Embedding fehlt — beheben, nicht ignorieren; Erfolgskriterium ist die
Zeile `indexed slug='<slug>'`.)
Fallback (ticket-mcp nicht erreichbar):
```bash
# Falls TICKET_EXT_ID bereits gesetzt ist (von feature-intake oder User-Input),
# wiederverwenden — kein neues Ticket erstellen.
if [[ -z "${TICKET_EXT_ID:-}" ]]; then
  # Kein bestehendes Ticket — neues erstellen
  GRILLING_REF=""
  if [[ -n "${GRILLING_TICKET_EXT_ID:-}" ]]; then
    GRILLING_REF=$'\n'"Grilling-Ticket: ${GRILLING_TICKET_EXT_ID}"
  fi

  TICKET_RESULT=$(./scripts/ticket.sh create \
    --type task \
    --brand mentolder \
    --title "Plan: <slug>" \
    --priority mittel \
    --description "Branch: feature/<slug>"$'\n'"Plan: openspec/changes/<slug>/tasks.md"$'\n'"Spec: openspec/changes/<slug>/design.md"$GRILLING_REF)

  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
  TICKET_UUID=$(echo "$TICKET_RESULT"   | cut -d'|' -f2)
else
  # Bestehendes Ticket wiederverwenden — UUID für Attachments holen
  TICKET_UUID=$(./scripts/ticket.sh get --id "$TICKET_EXT_ID" | jq -r '.id')
  echo "✅ Wiederverwende bestehendes Ticket $TICKET_EXT_ID"
fi

# Plan stagen: Branch + Plan-Pfad im Ticket verankern (Single Source of Truth für dev-flow-execute).
# Seit T003267 ist --hold/--no-hold Pflicht; interaktiv immer --hold.
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "openspec/changes/<slug>/tasks.md" \
  --hold
```
**`--hold`-Flag Pflicht seit T003267:** `stage-plan` verlangt entweder `--hold` oder `--no-hold`. `--hold` setzt `readiness.execution_released=false` — der Factory-Dispatch wird zurückgehalten, bis `dev-flow-execute` per `ticket.sh release-hold` freigibt. Verwende `--hold` in allen interaktiven dev-flow-plan Calls, damit der Operator die Kontrolle behält. `--no-hold` ist für headless Factory-Pfade reserviert.

Hänge gesammelte Assets mit `bash scripts/ticket-attach.sh "$TICKET_UUID" <pfade>` an.
Ticket-Claim jetzt nachholen (Session-Koordination [T000510]) — der Feature-Pfad kennt
die Ticket-ID erst ab hier; Schritt 5's Pre-Commit-Guard prüft ticket-scoped und braucht
diesen Claim VOR dem Commit. Falls Schritt B.1 den Claim bereits gesetzt hat (Ticket-ID
war vorab bekannt), ist ein erneuter Claim durch dieselbe Session ein no-op-Refresh
(kein Fehler):
```bash
bash scripts/agent-lock.sh claim ticket "$TICKET_EXT_ID" \
  --branch "$(git branch --show-current)" --worktree "$(pwd)" --label dev-flow-plan \
  || { echo "🛑 Ticket wird bereits von einer anderen Session bearbeitet — koordinieren."; exit 1; }
```
