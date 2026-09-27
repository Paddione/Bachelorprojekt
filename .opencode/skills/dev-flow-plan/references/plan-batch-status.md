# Plan-Status & Ausführungsoptionen (Feature- und Fix-Pfad)

Aus `dev-flow-plan` Schritt 6.5 (Feature-Pfad) und Schritt 6 (Fix-Pfad) extrahiert (Chore T001007).
Beide Pfade hatten ~50 Zeilen identische Logik — in diese Referenz zusammengeführt.

## 1. Status laden

**MCP-Schnellweg (read-only).** Wenn `mcp-postgres` erreichbar (MCP-Tool direkt nutzbar — `SELECT 1`),
führe beide Reads via `mcp-postgres_query` aus:
> staged plans — `sql:` `SELECT external_id, title, priority, COALESCE(value_prop,'') FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC;`
> planning-Count — `sql:` `SELECT COUNT(*) FROM tickets.tickets WHERE status='planning';`

Belege `STAGED_PLANS` bzw. `PLANNING_COUNT` aus den MCP-Ergebnissen. **Fallback:** der kubectl-Block unten. Siehe [`MCP-Tool-Guide`](.agents/skills/references/mcp-tool-guide.md).

_Fallback:_

```bash
STAGED_PLANS=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT external_id, title, priority, COALESCE(value_prop,''), COALESCE(effort,''),
   array_to_string(areas,','), COALESCE(depends_on::text,'{}')
   FROM tickets.tickets WHERE status='plan_staged'
   ORDER BY planning_rank ASC NULLS LAST, created_at DESC;" 2>/dev/null)
STAGED_COUNT=$(echo "$STAGED_PLANS" | grep -c '|' || echo 0)

PLANNING_COUNT=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -c \
  "SELECT COUNT(*) FROM tickets.tickets WHERE status='planning';" 2>/dev/null)
```

## 2. Ausgabe-Format (identisch für Feature- und Fix-Pfad)

**STOPP.** Informiere den User:

```
✅ <Feature|Fix>-Plan bereit: <slug> (Ticket $TICKET_EXT_ID)
   Branch: <feature|fix>/<slug>
   Plan: .agents/plans/<slug>/tasks.md

📋 Kommissionierung (status=plan_staged): $STAGED_COUNT Plan(s)
   • T000xxx [priorität] <titel> — <value_prop>
   • T000yyy [priorität] <titel> — <value_prop>
   ...

📝 Planungsbüro (status=planning): $PLANNING_COUNT Ticket(s) warten auf Planung

🚀 Ausführungsoptionen:

1. **Einzel-Ausführung:**
   dev-flow-execute auf <feature|fix>/<slug> aufrufen
   → Implementiert nur diesen einen Plan

2. **Lokal mit dem Plan-Runner:**
   node scripts/llm/plan-runner.mjs .agents/plans/<slug> --worktree <pfad>
   → Führt die Partials mit den lokalen Modellen aus (Runbook: docs/runbooks/plan-runner.md)

3. **Batch-Planung (mit dev-flow-batch):**
   Wenn weitere planning-Tickets existieren und du erst alle planen willst:
   dev-flow-batch aufrufen → plant alle status=planning Tickets parallel
   → Danach jeden fertigen Plan per Option 1 oder 2 ausführen
```

**Empfehlung:** Ein fertiger Plan → Option 1. Lokal ohne Cloud-Budget → Option 2. Wenn noch planning-Tickets warten → Option 3.

STOPP danach.
