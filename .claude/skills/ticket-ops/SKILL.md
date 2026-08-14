---
name: ticket-ops
description: 'Use for the CONTENT of tickets — triage open tickets for completeness, decide severity/component/areas, ask the user the questions a ticket is missing, and plan which tickets can run in parallel. Triggers on "triage tickets", "what can I work on", "plan parallel work", "what is missing on these tickets", Definition of Readiness, DoR flags, attention_mode, planning_rank, lastenheft lock. Not for the state of the repository — stale branches, worktrees, PR merging and factory queue belong to repo-hygiene. For a production outage use incident-response.'
---

> **Mishap Tracking:** Führe während dieses Skills ein `MISHAP_LOG` und rufe am Ende
> `mishap-tracker` auf — Eintragsformat und Ablauf: siehe `mishap-tracker` §Input.

# ticket-ops

Ticket-Inhalte: Vollständigkeit, Klärung, Parallelisierung. Für zeitkritische Produktionsvorfälle
`incident-response`; für den Repo-Zustand (Branches, Worktrees, PRs, Factory-Queue)
`repo-hygiene`.

**Aufbau:** Dieser Body führt den Ablauf und **jede Invariante**. Die ausformulierten Schritte,
SQL-Queries, Rubriken und die Subagent-Matrix stehen in
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md)
und werden gelesen, wenn die jeweilige Phase dran ist.

## Workflow at a glance

Ein vollständiger Durchlauf hat vier Phasen. Für eine enge Anfrage direkt in die passende Phase
springen; für „triagiere alles / was kann ich parallel machen" 1 → 2 → 3 → 4 der Reihe nach.

1. **Completeness triage** — alle offenen Tickets holen, pro Ticket berechnen *was fehlt*,
   klassifizieren. Der Agent entscheidet Severity, Component, Areas und Readiness-Flags
   autonom nach Rubrik; nur echte Ermessensfragen werden eskaliert.
2. **Backlog grouping scan** — nach der Triage: zusammengehörige Tickets zu **Batch-Gruppen**
   bündeln, um den Planungs- und Merge-Overhead bei vielen kleinen Tickets zu senken.
   Heuristiken: gleiche `areas` + kein Dateikonflikt, explizite `relates_to`-Links,
   Bulk-Operationen mit gleichförmigem Titel. Jede Gruppe bekommt ein Parent-Ticket
   (`type='feat'`, `child_of`-Links), dessen Branch alle enthaltenen Tickets abdeckt.
3. **Human clarification** — für die gefilterte Teilmenge die fehlenden Angaben beim Menschen
   erfragen (gebündelt), Antworten in die DB zurückschreiben.
4. **Parallelization masterplan** — Abhängigkeitsgraph über die nun fertigen Tickets bauen, in
   Wellen sortieren (Impact-gewichtete Reihenfolge, Batch-Gruppen als Einheiten), Konflikte
   sichtbar machen und nach Freigabe Welle 1 dispatchen. Enthält **Quick-Win-Detection**
   für `effort=klein`-Tickets ohne Abhängigkeiten.

Repo-Housekeeping (stale Worktrees/Branches, PR-Triage, Issue-Intake, Factory-Queue) ist **nicht
mehr Teil dieses Skills** — es liegt vollständig bei [`repo-hygiene`](../repo-hygiene/SKILL.md),
mechanisch beschrieben in
[`repo-hygiene-ops`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/repo-hygiene-ops.md).

## Invarianten (gelten in allen Phasen)

**Der Tracker ist die Wahrheit, nicht GitHub.** `tickets.tickets` auf `mentolder` (DB `website`)
ist SSOT für Issues; dieses Repo nutzt keine GitHub Issues. PRs sind der Merge-Mechanismus und
hängen nur über weiche Kanäle am Ticket (`[T000XXX]` im Titel, `ticket_plans.pr_number`, ein
schließender Kommentar) — **es gibt keinen `ticket_id`-FK auf PRs**.

**Enum-Werte** — ein Wert außerhalb der Menge lässt die CHECK-Constraint fehlschlagen:
`priority ∈ {hoch,mittel,niedrig}` · `severity ∈ {critical,major,minor,trivial}` ·
`status ∈ {triage,planning,plan_staged,backlog,in_progress,in_review,blocked,qa_review,done,archived}` ·
`resolution ∈ {fixed,shipped,obsolete}` · `attention_mode ∈ {auto,ai_ready,needs_human}`.

**Abhängigkeiten stehen an zwei Orten — in Phase 3 beide lesen:**
`tickets.tickets.depends_on` (`text[]` blockierender `external_id`s) und `tickets.ticket_links`
(normalisierte Kanten). `ticket_links` ist ticket→ticket, **nie** für PR-Referenzen.

**⚠️ DoR ≠ das Factory-Gate.** Die vier DoR-Flags (`spec_skizziert`,
`offene_fragen_geklaert`, `abhaengigkeiten_klar`, `aufwand_geschaetzt`) ergeben `dorScore = 4` —
aber `scripts/factory/queue.sh` dispatcht nur `type='feat' AND status='backlog'` mit
`readiness.lastenheft_locked = true`, einem **fünften, separaten** Flag. Ein Ticket kann
`dorScore = 4` haben und trotzdem unsichtbar im Backlog verrotten, wenn niemand
`ticket.sh lastenheft lock --id <id>` ausgeführt hat. Wer hier ein `type='feat'`-Ticket nach
`backlog` bewegt, füllt im **selben** Durchgang `requirements_list` und setzt den Lock — dieser
Schritt wird nicht auf später vertagt.

**Dedupe-Guard vor jeder Intake-Zeile:** Bevor aus einer Intake-Quelle eine neue Zeile entsteht,
wird nach einem offenen Ticket mit demselben Titel gesucht (case-insensitiv,
Whitespace-normalisiert). Bei einem Treffer wird die bestehende `external_id` wiederverwendet und
ein `ticket_comments`-Eintrag mit der Re-Trigger-Quelle angehängt — **keine** neue Zeile. Sonst
erzeugt ein wiederholtes Upstream-Signal (Factory-Tick, Cron-Re-Fail, Event-Replay) N
Beinahe-Duplikate. Gilt in Phase 1 bei der Klassifikation **und** im Issue-Intake von
[`repo-hygiene`](../repo-hygiene/SKILL.md).

**Vollständige Beschreibungen lesen:** Ticket-Beschreibungen nie kürzen (z.B. `left(description,700)`). Die wichtigsten Einschränkungen ("haengt an X", "wird dort mit erledigt") stehen typischerweise am ENDE der Beschreibung. Vor jedem Dispatch die Beschreibung vollständig lesen, um verfrühte Dispatches zu vermeiden.

**M1: Line-Nummern-Prüfung vor sed-Extraktion (T002469):** Vor jeder Extraktion mit `sed -n 'start,endp'` die Zeilennummern gegen `wc -l` der Quelldatei prüfen. `end > wc -l` verursacht Syntaxfehler (T2 Extraction befand: falscher Zeilenbereich → Syntax-Error). Positiv-Anker: die extrahierte Sektion auf `bash -n` prüfen, bevor die Originaldatei gelöscht wird.

**M3: Planning- vs. Execution-Dispatch (T002469):** Der Orchestrator (DeepSeek/o1) führt die Planung selbst durch; gemma-4-12b wird nur für Execution-Dispatches genutzt. Phase 3 unterscheidet zwischen `dispatch_for_planning` (→ Orchestrator, behält Control) und `dispatch_for_execution` (→ gemma, gibt ab). Ein gemma-Planungs-Dispatch wird abgelehnt — der User hat das explizit so entschieden.

**M5: Agent-Lock-Prüfung in DoR (T002469):** Vor der Einplanung eines Tickets den Agent-Lock-Status prüfen: `bash scripts/agent-lock.sh check ticket <id>` → `held` bedeutet, eine andere Session arbeitet aktiv daran. Solche Tickets in `in_progress` lassen und NICHT in den Masterplan aufnehmen. Die DoR-Prüfung in Phase 1 liest den agent-lock-Status und setzt `attention_mode=auto` bei live-claimed Tickets.

**Claim-Timing-Regel (T004602):** Der branch-scoped Claim im Dispatch wird bei unplanned Tickets erst NACH der `dev-flow-plan`-Proposal-Phase (Phase A im Haupt-Checkout) gehalten, da ein aktiver Worktree-Claim sonst Write-Tools im Haupt-Checkout blockiert; Details in [`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) Step 3.6 `[T004602]`.

**M2: mcp-postgres Fallback (T002469):** Wenn `mcp__mcp-postgres__query` nicht erreichbar ist (curl-Probe 000), auf den `kubectl exec` psql-Fallback ausweichen. Der Fallback ist in `scripts/ticket.sh` via `BRAND`-Routing dokumentiert. Vor jedem Bulk-Triage-Lauf die Erreichbarkeit mit `curl -s -o /dev/null -w '%{http_code}' localhost:13001/health` prüfen.

**Laufende Arbeit nicht anfassen:** Tickets in `in_progress`, die auf einen lebenden Plan-Branch
zeigen, bleiben unberührt.

**Nichts still fallen lassen:** Die Eskalation ist auf ~3 Tickets pro Runde gedeckelt, die
Verarbeitung auf ~6. Jedes Ticket jenseits des Caps wird explizit als **DEFERRED** aufgeführt.

**Ein einziges Approval-Gate:** Die einzige Aktion in diesem Skill, die eine ausdrückliche
Freigabe braucht, ist der Dispatch von Welle 1 (Phase 3). Phase-1-Writes sind Buchhaltung
(`attention_mode`, sowie `done`/`obsolete` **mit zitiertem** Merge- oder Decommission-Beleg);
alles Mehrdeutige bleibt unangetastet und wird zur Phase-2-Frage.

**DB-Zugriff:** Reads MCP-first via `mcp__mcp-postgres__query` (read-only). Writes gehen über
`ticket-mcp`-Wrapper oder den `psql()`-Helper — SSOT:
[`MCP-Tool-Guide`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/mcp-tool-guide.md) §mcp-postgres.

**Batch-Grouping-Regel [T003550]:** Bei >10 offenen Tickets im Backlog lohnt sich Batch-Gruppierung.
Tickets, die in denselben `areas` liegen, keine disjunkten Dateimengen berühren und keinen
harten Blockierer (`depends_on`) untereinander haben, KÖNNEN in eine Batch-Gruppe. Eine Gruppe
erhält ein neu angelegtes Parent-Ticket (`type='feat'`, `child_of`-Links von den Kind-Tickets);
der Parent-Branch `feature/batch-<slug>` deckt alle Kinder in einem Durchlauf ab. Kind-Tickets
behalten ihre eigene `external_id` und schließen einzeln — der Parent dient nur als
Planungsanker. **Nicht** gruppieren: Tickets mit `severity=critical`, Tickets in `in_progress`,
oder Tickets, die bereits einen gestagten Plan haben.

## Phase 1 — Completeness Triage

Entscheidungsrubrik (severity/component/areas/readiness mit Eskalationsschwellen), die
Enriched-Fetch-Query, die Tier-A/Tier-B-Berechnung der `missing[]`-Liste, das Laden des
OpenSpec-Status und die Klassifikation (resolved · obsolete · ready · incomplete):
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 1.

## Phase 1.5 — Backlog Grouping Scan

Nachdem alle Tickets klassifiziert sind: zusammengehörige Tickets zu Batch-Gruppen bündeln.
Die Heuristiken, Parent-Ticket-Erstellung und die Ausgabe als `batch-map.json`:
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 1.5.

> **Wann lohnt sich das?** Ab ~10 offenen Tickets im Backlog. Darunter ist der Overhead
> (Parent-Ticket anlegen, `child_of`-Links setzen) größer als der Gewinn durch gebündelte
> Planung und einen Merge statt N.

## Phase 2 — Human Escalation Round

Auswahl der Eskalationsmenge, Subagent-Dispatch zur Validierung, Herleitung der Fragen aus den
Lücken (spiegelt `website/src/lib/sdlc/clarification-questions.ts`), der interaktive Frageweg je
Harness und das Zurückschreiben per JSONB-Merge:
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 2.

> Beim Zurückschreiben der DoR-Flags **immer** per JSONB-Merge (`readiness || '{…}'::jsonb`) —
> ein direktes Setzen überschreibt die übrigen Flags.

## Phase 3 — Parallelization Masterplan

Aufbau des Abhängigkeitsgraphen aus beiden Quellen, topologische Sortierung in Wellen
(Impact-gewichtet, Batch-Gruppen als Einheiten), Quick-Win-Detection, das
Routing (plan vs. execute), das Masterplan-Format und der Wave-1-Dispatch:
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 3.

> **Soft-Conflict-Kante:** Zwei fertige Tickets, die sich einen `areas`-Eintrag teilen, haben
> Datei-Kollisionsrisiko und dürfen **nicht** in dieselbe Welle. Bewusst konservativ — die
> Kollision wird angezeigt, nicht versteckt.
>
> **Pre-Check-Invariante [T002422]:** Vor dem ersten `claim`-Aufruf in der Dispatch-Schleife
> wird für jedes Wave-1-Ticket `agent-lock.sh check ticket <id>` ausgeführt. Tickets mit Status
> `held` werden gesammelt und vor dem Worktree-Setup gemeldet (`LOCK-KONFLIKT: T002XXX bereits
> gehalten von ...`). Der Dispatch fährt nur mit den freien Tickets fort. Dadurch wird
> verhindert, dass bereits belegte Tickets erst nach dem Aufbau des Worktrees (kostspielig)
> als blockiert erkannt werden.
>
> **Beide Lock-Scopes prüfen [T002498-M6]:** `check ticket` allein greift nicht — die
> dev-flow-*-Skills locken branch-scoped, das Feld `held` bleibt dann für das Ticket leer
> (T002497). Zusätzlich `check branch <vorgesehener-branch>` sowie
> `agent-lock.sh list | grep <ext-id>` (Locks jeden Scopes) und ein Porcelain-Check auf
> Worktrees mit der ID im Namen ausführen — Details in
> [`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md)
> §Step 3.3.

**Merge = Abschluss:** Jedes Ticket schließt über seinen eigenen grünen Auto-Merge; der
Masterplan verfolgt den Dispatch, nicht den Prod-Live-Stand.

## Post-Execution: Mishap Report

Nach Abschluss aller Schritte `mishap-tracker` mit dem akkumulierten `MISHAP_LOG` aufrufen.
Ohne Mishaps beendet sich der Skill sauber.

## Related Skills

| Skill | Relationship |
|-------|--------------|
| `repo-hygiene` | Repo-Zustand: Branches, Worktrees, PR-Merge, Factory-Queue |
| `incident-response` | Zeitkritische Vorfälle — anderer Workflow |
| `superpowers:dispatching-parallel-agents` | Phase-3-Fan-out über fertige Tickets |
| `dev-flow-plan` | Planning-Wave-Tickets (`ai_ready`, kein gestagter Plan) |
| `dev-flow-execute` | Execution-Wave-Tickets (`plan_staged`) |
| `database-specialist` | DB-bezogene Tickets |
| `mishap-tracker` | Bündelt Ausführungs-Frictions zu einem Ticket |

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
