# Plan-Status & Ausführungsoptionen (Feature- und Fix-Pfad)

Aus `dev-flow-plan` Schritt 6.5 (Feature-Pfad) und Schritt 6 (Fix-Pfad) extrahiert (Chore T001007).
Beide Pfade hatten ~50 Zeilen identische Logik — in diese Referenz zusammengeführt.

## 1. Status laden

**MCP-Schnellweg (read-only).** Wenn `mcp-postgres` erreichbar (`bash scripts/mcp-portforward.sh status`),
führe beide Reads via `mcp__mcp-postgres__query` aus:
> staged plans — `sql:` `SELECT external_id, title, priority, COALESCE(value_prop,'') FROM tickets.tickets WHERE status='plan_staged' ORDER BY planning_rank ASC NULLS LAST, created_at DESC;`
> planning-Count — `sql:` `SELECT COUNT(*) FROM tickets.tickets WHERE status='planning';`

Belege `STAGED_PLANS` bzw. `PLANNING_COUNT` aus den MCP-Ergebnissen. **Fallback:** der kubectl-Block unten. Siehe [`references/mcp-tool-guide.md`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md).

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
   Plan: openspec/changes/<slug>/tasks.md

📋 Kommissionierung (status=plan_staged): $STAGED_COUNT Plan(s)
   • T000xxx [priorität] <titel> — <value_prop>
   • T000yyy [priorität] <titel> — <value_prop>
   ...

📝 Planungsbüro (status=planning): $PLANNING_COUNT Ticket(s) warten auf Planung

🚀 Ausführungsoptionen:

1. **Einzel-Ausführung (Manuell):**
   dev-flow-execute auf <feature|fix>/<slug> aufrufen
   → Implementiert nur diesen einen Plan

2. **Einzel-Ausführung (Factory):**
   bash scripts/ticket.sh enqueue --id "$TICKET_EXT_ID" \
     --branch "<feature|fix>/<slug>" --plan "openspec/changes/<slug>/tasks.md"
   → Factory-Dispatcher arbeitet den Plan automatisch ab

3. **Batch-Ausführung (alle staged plans):**
   Wenn mehrere Pläne bereit sind, können sie parallel via Factory implementiert werden:
   - UI: In /dev-status alle staged plans auswählen → "→ Factory (Batch)"
   - CLI: Für jeden staged plan:
     bash scripts/ticket.sh enqueue --id <ext_id> --branch <branch> --plan <plan>
   → Factory-Dispatcher verarbeitet alle Pläne parallel (Plan-Reuse, kein Neu-Planen)

4. **Batch-Ausführung (mit dev-flow-batch):**
   Wenn weitere planning-Tickets existieren und du erst alle planen willst:
   dev-flow-batch aufrufen → plant alle status=planning Tickets parallel
   → Danach alle fertigen Pläne via Option 3 an Factory übergeben
```

**Empfehlung:** Wenn nur dieser eine Plan fertig ist → Option 2 (Factory einzeln). Wenn mehrere Pläne fertig sind → Option 3 (Batch via Factory). Wenn noch planning-Tickets warten → Option 4 (erst dev-flow-batch, dann Factory).

STOPP danach.
