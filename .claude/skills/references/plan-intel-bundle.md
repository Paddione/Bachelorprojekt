# Plan Intel Bundle (PIB)

Typed, schema-validated intel artifact at `openspec/changes/<slug>/intel.json`. Filled once in the
plan phase (`dev-flow-plan` Schritt A.1.5) and consumed as mandatory context by both `dev-flow-plan`
(Schritt 3.7) and `dev-flow-execute` (Schritt 2). Pläne referenzieren so reale Signaturen, DB-Spalten
und API-Contracts statt erfundener Typen.

## Files

| File | Role |
|------|------|
| `schemas/plan-intel-bundle.schema.json` | Authoritative JSON-Schema (draft 2020-12). |
| `schemas/plan-intel-bundle.d.ts` | Hand-maintained TS mirror; key parity guarded by BATS. |
| `schemas/plan-intel-bundle.example.json` | CI-validated fixture (`jq`-structural, no `ajv`). |

## Section → intel source mapping

| Section | Primary source | Fallback |
|---------|----------------|----------|
| `symbols` / `signature` / `type_text` | `codebase-memory` (`get_code_snippet`, `search_graph`) + LSP hover/definition | `grep` / `Read` |
| `call_graph` | `codebase-memory` `trace_path` (`calls` / `data_flow` / `cross_service`) | manual grep chain |
| `db_tables` | `mcp-postgres` (`information_schema.columns`, read-only) | `kubectl exec … psql` |
| `api_contracts` | `Read` of the `website/src/pages/api/**` handlers + their types | — |
| `external_types` | `context7` (`resolve-library-id` → `query-docs`) | read the library `.d.ts` |
| `impact_files` / `s1_*` | `wc -l` + `docs/code-quality/baseline.json` + the `_ext_limit` table (plan-lint logic) | — |

`meta`, `impact_files` and `symbols` are required; the other arrays may be empty when the dimension
does not apply (no DB touch → `db_tables: []`). If a source and its fallback are both unavailable,
record a `risks[]` entry with `severity: warn` instead of leaving the section silently empty.

## S1 pre-computation

For each `impact_files[]` entry, pre-compute the S1 ratchet so the plan-subagent does not re-derive it:
`loc` = `wc -l`; `s1_limit` = static `_ext_limit`; `s1_baseline` = `docs/code-quality/baseline.json`
`."S1:<path>".metric` (or `null` if unbaselined); `s1_budget` = `max(s1_limit, s1_baseline) − loc`.

## Validation

```bash
jq . .claude/skills/references/schemas/plan-intel-bundle.schema.json    # schema parses
jq . openspec/changes/<slug>/intel.json                                 # bundle parses
```

The BATS gate `tests/spec/dev-flow-plan.bats` asserts the schema is valid, the fixture conforms,
schema ↔ `.d.ts` key parity holds, and both skill wirings are present.
