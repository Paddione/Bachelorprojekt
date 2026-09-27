---
title: "p1 — Fälle laden, validieren und Läufe bewerten"
ticket_id: T900561
domains: [llm-local-dev]
status: active
---

# p1 — Fälle laden, validieren und Läufe bewerten

Files: `scripts/llm/agent-bench/lib/cases.mjs`, `scripts/llm/agent-bench/lib/scoring.mjs`,
`scripts/llm/agent-bench/scoring.json` (alle neu, reine Module ohne Netzwerk- und Prozesszugriff).

## Task 1.1: Fall-Layout laden (`cases.mjs`)

`loadCases(casesDir, { split } = {})` liest jedes Unterverzeichnis `cases/<fall-id>/` und liefert
`[{ id, split, source, base, replay, variants: [{ id, perspective, roles, budget, briefPath, referenceDir, checksDir }] }]`.

- Pflicht je Fall: `source.md` (nicht leer) und `case.json` mit `{ "split": "eval"|"train", "source_ref": "<Ticket-ID|Change-Slug|Commit>" }`.
- Genau eines von `base/` (Fixture-Repo) oder `replay.json` (`{ "parent_commit", "change_path" }`).
- Je Variante `variants/<vid>/variant.json`:
  `{ "perspective": "clean|ambiguous|faulty-worker|conflicting|detour-trap|vision", "roles": [..], "budget": { "tokens": n, "turns": n }, "expected_decision": "execute|clarify" }`,
  dazu `brief.md`, `reference/` (Plan-Runner-Format: `tasks.md` mit `## Partials` + `tasks.d/`) und `checks/`.
- `split`-Filter: nur Fälle mit passendem `split`.

## Task 1.2: Validierung mit sprechenden Fehlern

`validateCases(casesDir)` liefert `{ ok, errors: [{ caseId, message }] }`. Fehler u. a.:
fehlende oder leere `source.md`, fehlende `source_ref`, unbekannte Perspektive, unbekannte Rolle,
Variante ohne `checks/`, `vision`-Variante ohne Bilddatei in `checks/`. `bench.mjs` (p4) bricht bei
`ok === false` mit Exit 2 ab und nennt jede Fall-ID (Requirement "Cases Are Grounded In Real Events").

## Task 1.3: Rollen-Konstanten

Export `ROLES = ['planner','orchestrator','code-worker','vision-worker','reviewer']` und
`parseRoles(csv)`, das bei unbekannter Rolle einen `Error` mit dem falschen Namen wirft.

## Task 1.4: Bewertungskonfiguration (`scoring.json`)

```json
{
  "version": 1,
  "weights": { "error": 15, "detour": 8, "budget_per_50pct_over": 10, "budget_cap": 30 },
  "roles": {
    "planner":       { "clarify_miss_error": 1, "file_precision_detour": 1 },
    "orchestrator":  { "accepted_faulty_result_error": 2, "self_exec_detour": 1 },
    "code-worker":   { "red_test_run_detour": 0.5, "out_of_scope_file_detour": 1 },
    "vision-worker": { "hallucinated_element_error": 2 },
    "reviewer":      { "false_pass_error": 3, "false_fail_error": 1, "defect_unnamed_detour": 1 }
  }
}
```

## Task 1.5: Score-Berechnung (`scoring.mjs`)

`scoreRun({ role, outcome, events, usage, budget }, config)` ist rein und deterministisch.

- `events` ist eine Liste `{ kind, weight? }` aus der Rollen-Auswertung (p5), z. B.
  `{ kind: 'out_of_scope_file' }`. Die Abbildung `kind → error|detour` samt Faktor kommt aus
  `config.roles[role]` (Schlüssel `<kind>_error` bzw. `<kind>_detour`); allgemeine Arten
  `protocol_error`, `tool_error`, `timeout` zählen immer als Fehler mit Faktor 1.
- `effort = usage.total_tokens / budget.tokens`; Budgetabzug = `min(cap, floor((effort-1)/0.5 + 1) * budget_per_50pct_over)` wenn `effort > 1`, sonst 0.
- `score = max(0, round(100*outcome - weights.error*E - weights.detour*D - budgetAbzug))`.
- Rückgabe `{ scoring_version, outcome, errors: E, detours: D, effort, score, events }`.
- `compareVersions(a, b)` wirft bei ungleicher `scoring_version` (Requirement "Paired Regression Gate").

Akzeptanz: `node --check` auf beide Module; p9-Tests "Same trace yields same score",
"Detour lowers the score", "False pass weighs more than false fail" nutzen `scoreRun` direkt.
