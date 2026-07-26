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
./scripts/ticket.sh stage-plan \
  --id "$TICKET_EXT_ID" \
  --branch "feature/<slug>" \
  --plan "openspec/changes/<slug>/tasks.md"
```
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
