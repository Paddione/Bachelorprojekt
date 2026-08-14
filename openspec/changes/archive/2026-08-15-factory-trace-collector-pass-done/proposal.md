---
title: Proposal: factory-trace-collector-pass-done
ticket_id: T006282
domains: [db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: factory-trace-collector-pass-done

## Why

Der Erfolgsfilter in `scripts/finetune/collect_factory_traces.py` prüft
`phase == 'verify' AND state == 'pass'` — die Live-DB
(`tickets.factory_phase_events`) kennt diesen State aber nicht
(`entered|done|blocked` laut Aufnahme-Mechanik). Messung (2026-08-15,
mcp-postgres): verify-Verteilung 408×done, 266×entered, 0×pass. Der Korpus wäre
heute leer (354 abgeschlossene Läufe mit `verify/done` würden verworfen). Der
Skript-Docstring verweist dabei auf eine 'pass'-Konvention, die in CLAUDE.md
nicht existiert — die Referenz ist erfunden. Blocker für S3/T006252
(Unsloth-Finetuning auf Factory-Traces).

## What

- `is_successful()` auf `state == 'done'` umstellen (Option A; die
  Aufnahme-Mechanik ist die dokumentierte Referenz, ein toleranter 'pass'-Pfad
  wäre toter Code).
- Docstring im Skript auf die reale Konvention korrigieren.
- Fixture in `tests/spec/unsloth-training-env/factory-traces.bats` angleichen
  (verify/done = Erfolg, verify/entered = kein Erfolg) — Rot-Grün: Test ist mit
  heutigem Code rot, mit Fix grün. Positiv-Anker bleibt, Output-Verifikation.

_Ticket: T006282_
