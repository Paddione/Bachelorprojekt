# langfuse-tracing-completion — Proposal

_Ticket: T900750 · Nachfolger T900688_

## Warum

Langfuse auf devmesh nimmt Traces an, verliert aber Daten: ClickHouse verwirft Inserts am
Speicherlimit, der Claude-Code-Hook verwirft Exportfehler still (26 Turns gemeldet, 4 angekommen).
Die Environments sind uneinheitlich, Traces sind nicht gesichert, und niemand merkt, wenn eine
Harness nicht mehr liefert. Die Traces sollen die Datenbasis für den Qwen3.5-4B-Finetune werden
(`docs/runbooks/qwen35-mtp-subagent-finetuning.md`, 1.500–3.000 Trajektorien).

## Was

1. ClickHouse auf 8Gi (offizielles Minimum).
2. Collector setzt `langfuse.environment=development`, wenn es fehlt.
3. Täglicher JSONL-Export aller Observations nach MinIO.
4. `tracing-status.sh` + SessionStart-Hook: warnt bei fehlender Harness-Config und Exportlücken,
   erinnert ab 3.000 Tool-Traces an das Finetune-Runbook.
5. `backfill-claude.sh` holt verlorene Claude-Sessions nach.
6. Runbook §3 nennt den Export als Datenquelle.

Details und Entscheidungen D1–D7: `design.md`.
