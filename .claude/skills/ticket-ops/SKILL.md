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

Ein vollständiger Durchlauf hat drei Phasen. Für eine enge Anfrage direkt in die passende Phase
springen; für „triagiere alles / was kann ich parallel machen" 1 → 2 → 3 der Reihe nach.

1. **Completeness triage** — alle offenen Tickets holen, pro Ticket berechnen *was fehlt*,
   klassifizieren. Der Agent entscheidet Severity, Component, Areas und Readiness-Flags
   autonom nach Rubrik; nur echte Ermessensfragen werden eskaliert.
2. **Human clarification** — für die gefilterte Teilmenge die fehlenden Angaben beim Menschen
   erfragen (gebündelt), Antworten in die DB zurückschreiben.
3. **Parallelization masterplan** — Abhängigkeitsgraph über die nun fertigen Tickets bauen, in
   Wellen sortieren, Konflikte sichtbar machen und nach Freigabe Welle 1 dispatchen.

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
aber `scripts/factory/queue.sh` dispatcht nur `type='feature' AND status='backlog'` mit
`readiness.lastenheft_locked = true`, einem **fünften, separaten** Flag. Ein Ticket kann
`dorScore = 4` haben und trotzdem unsichtbar im Backlog verrotten, wenn niemand
`ticket.sh lastenheft lock --id <id>` ausgeführt hat. Wer hier ein `type='feature'`-Ticket nach
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

## Phase 1 — Completeness Triage

Entscheidungsrubrik (severity/component/areas/readiness mit Eskalationsschwellen), die
Enriched-Fetch-Query, die Tier-A/Tier-B-Berechnung der `missing[]`-Liste, das Laden des
OpenSpec-Status und die Klassifikation (resolved · obsolete · ready · incomplete):
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 1.

## Phase 2 — Human Escalation Round

Auswahl der Eskalationsmenge, Subagent-Dispatch zur Validierung, Herleitung der Fragen aus den
Lücken (spiegelt `website/src/lib/clarification-questions.ts`), der interaktive Frageweg je
Harness und das Zurückschreiben per JSONB-Merge:
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 2.

> Beim Zurückschreiben der DoR-Flags **immer** per JSONB-Merge (`readiness || '{…}'::jsonb`) —
> ein direktes Setzen überschreibt die übrigen Flags.

## Phase 3 — Parallelization Masterplan

Aufbau des Abhängigkeitsgraphen aus beiden Quellen, topologische Sortierung in Wellen, das
Routing (plan vs. execute), das Masterplan-Format und der Wave-1-Dispatch:
[`ticket-ops-procedures`](file:///home/patrick/Bachelorprojekt/.claude/skills/references/ticket-ops-procedures.md) §Phase 3.

> **Soft-Conflict-Kante:** Zwei fertige Tickets, die sich einen `areas`-Eintrag teilen, haben
> Datei-Kollisionsrisiko und dürfen **nicht** in dieselbe Welle. Bewusst konservativ — die
> Kollision wird angezeigt, nicht versteckt.

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
