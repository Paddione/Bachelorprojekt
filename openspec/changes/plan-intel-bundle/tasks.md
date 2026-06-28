---
title: "plan-intel-bundle — Implementation Plan"
ticket_id: T001323
domains: [plan-authoring, dev-tooling]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-intel-bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a typed, schema-validated Plan Intel Bundle (`openspec/changes/<slug>/intel.json`)
that is filled once in the plan phase from existing intel sources and consumed as mandatory context by
both `dev-flow-plan` and `dev-flow-execute`.

**Architecture:** Approach A (JSON-SSOT) from the design spec. `intel.json` is validated against a
draft-2020-12 JSON-Schema; a hand-maintained `.d.ts` mirror gives editor/tsc types; a BATS drift-guard
asserts key parity between schema and `.d.ts`. CI validates a committed `intel.example.json` via
structural `jq` assertions — no `ajv`, no new runtime dependency. The two `dev-flow-*` skills are wired
to produce/consume the bundle.

**Tech Stack:** JSON-Schema (draft 2020-12), TypeScript declaration file, BATS (`tests/unit/lib/bats-core`),
`jq`, the existing `dev-flow-plan` / `dev-flow-execute` skill markdown.

**Spec:** `docs/superpowers/specs/2026-06-29-plan-intel-bundle-design.md`
**Delta-Spec:** `openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md` (parent SSOT: `openspec/specs/dev-flow-plan.md`)

## Global Constraints

- No new runtime dependency: validation is structural `jq`, never `ajv`.
- No generator script and no new subagent (the bundle is agent-filled by design — YAGNI).
- `dev-flow-chore` is not touched (chores need no bundle).
- `.agents/skills` is a directory symlink to `.claude/skills`; edit under `.claude/skills/<name>.md`,
  the BATS gates slice the `.agents/skills/…` path (existing convention).
- BATS run command for this change: `tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats`.
- No brand-domain literals (`*.mentolder.de` / `*.korczewski.de`) in any snippet (S3).
- No new `docs/code-quality/baseline.json` entries (CI key-count assertion fails on growth).

## S1 line-budget per file (effective threshold = max static limit, baseline)

- `tests/spec/dev-flow-plan.bats` — `.bats` is S1-ungated (limit 0) → N.A.
- `.claude/skills/references/schemas/plan-intel-bundle.schema.json` — `.json` ungated → N.A.
- `.claude/skills/references/schemas/plan-intel-bundle.example.json` — `.json` ungated → N.A.
- `.claude/skills/references/plan-intel-bundle.md` — `.md` ungated → N.A.
- `.claude/skills/dev-flow-plan/SKILL.md` — `.md` ungated → N.A. (adds ~30 lines).
- `.claude/skills/dev-flow-execute/SKILL.md` — `.md` ungated → N.A. (adds ~6 lines).
- `.claude/skills/references/schemas/plan-intel-bundle.d.ts` — new file, `.ts` static limit 600,
  ~70 lines → far under limit, no split needed (no numeric budget row emitted for this new file).

## File Structure

```
tests/spec/dev-flow-plan.bats                                       ← NEW: failing-test gate (RED→GREEN)
.claude/skills/references/schemas/plan-intel-bundle.schema.json     ← NEW: JSON-Schema (draft 2020-12), 8 sections
.claude/skills/references/schemas/plan-intel-bundle.d.ts            ← NEW: TS interface mirror of the schema
.claude/skills/references/schemas/plan-intel-bundle.example.json    ← NEW: CI-validated fixture
.claude/skills/references/plan-intel-bundle.md                      ← NEW: how-to + section→source mapping doc
.claude/skills/dev-flow-plan/SKILL.md                               ← MOD: A.1.5 Intel-Gathering, 3.7 injection, B.2 move
.claude/skills/dev-flow-execute/SKILL.md                            ← MOD: Step 2 loads intel.json
openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md           ← delta-spec (authored with this plan)
```

---

## Task 1: Failing BATS gate `tests/spec/dev-flow-plan.bats` (RED)

**Files:**
- Create: `tests/spec/dev-flow-plan.bats`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the hermetic test contract that Tasks 2–4 turn green. Reads (read-only) the schema, the
  `.d.ts`, the example fixture, and both `.agents/skills/dev-flow-*/SKILL.md` files. It hard-codes the
  artifact paths Tasks 2–4 must create exactly:
  `.claude/skills/references/schemas/plan-intel-bundle.schema.json`,
  `.claude/skills/references/schemas/plan-intel-bundle.d.ts`,
  `.claude/skills/references/schemas/plan-intel-bundle.example.json`, the `PlanIntelBundle` interface
  name, and the `intel.json` token in both skills.

- [ ] **Step 1: Write the failing test file.** Create `tests/spec/dev-flow-plan.bats` with this exact content:

````bash
#!/usr/bin/env bats
# tests/spec/dev-flow-plan.bats
# SSOT: openspec/specs/dev-flow-plan.md (delta: openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md)
# T001323 — Plan Intel Bundle: schema contract + .d.ts mirror + fixture + skill wiring.
#
# One .bats file per SSOT spec (slug convention). Hermetic: only reads repo files
# (schema, .d.ts, fixture, both dev-flow-* SKILL.md via the .agents/skills symlink).
# No cluster, no network.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCHEMA="$REPO/.claude/skills/references/schemas/plan-intel-bundle.schema.json"
  DTS="$REPO/.claude/skills/references/schemas/plan-intel-bundle.d.ts"
  EXAMPLE="$REPO/.claude/skills/references/schemas/plan-intel-bundle.example.json"
  PLAN_SKILL="$REPO/.agents/skills/dev-flow-plan/SKILL.md"
  EXEC_SKILL="$REPO/.agents/skills/dev-flow-execute/SKILL.md"
}

# ── (1) schema is valid JSON declaring draft 2020-12 + required sections ──
@test "PIB: schema file is valid JSON" {
  [ -f "$SCHEMA" ] || { echo "MISSING schema: $SCHEMA"; return 1; }
  jq . "$SCHEMA" >/dev/null
}

@test "PIB: schema declares JSON-Schema draft 2020-12" {
  grep -q '2020-12' "$SCHEMA"
}

@test "PIB: schema marks meta/impact_files/symbols required" {
  jq -e '.required | index("meta") and index("impact_files") and index("symbols")' "$SCHEMA" >/dev/null
}

@test "PIB: schema declares all eight top-level sections" {
  for s in meta impact_files symbols call_graph db_tables api_contracts external_types risks; do
    jq -e --arg s "$s" '.properties | has($s)' "$SCHEMA" >/dev/null \
      || { echo "MISSING schema section: $s"; return 1; }
  done
}

# ── (2) fixture conforms: required top-level keys + element required fields ──
@test "PIB: example.json is valid JSON with required top-level keys" {
  [ -f "$EXAMPLE" ] || { echo "MISSING example: $EXAMPLE"; return 1; }
  jq . "$EXAMPLE" >/dev/null
  for k in meta impact_files symbols; do
    jq -e --arg k "$k" 'has($k)' "$EXAMPLE" >/dev/null \
      || { echo "MISSING top-level key: $k"; return 1; }
  done
}

@test "PIB: example.json meta.slug and meta.ticket_id are strings" {
  [ "$(jq -r '.meta.slug | type' "$EXAMPLE")" = "string" ]
  [ "$(jq -r '.meta.ticket_id | type' "$EXAMPLE")" = "string" ]
}

@test "PIB: example.json impact_files is a non-empty array with required element fields" {
  [ "$(jq -r '.impact_files | type' "$EXAMPLE")" = "array" ]
  [ "$(jq -r '.impact_files | length' "$EXAMPLE")" -gt 0 ]
  jq -e '.impact_files | all(has("path") and has("language") and has("loc") and has("s1_limit") and has("s1_baseline") and has("s1_budget"))' "$EXAMPLE" >/dev/null
}

@test "PIB: example.json symbols is a non-empty array with required element fields" {
  [ "$(jq -r '.symbols | type' "$EXAMPLE")" = "array" ]
  [ "$(jq -r '.symbols | length' "$EXAMPLE")" -gt 0 ]
  jq -e '.symbols | all(has("qualified_name") and has("kind") and has("file") and has("signature") and has("type_text") and has("source"))' "$EXAMPLE" >/dev/null
}

# ── (3) schema ↔ .d.ts top-level key parity (cheap drift guard) ──
@test "PIB: schema and .d.ts top-level keys are in parity" {
  [ -f "$DTS" ] || { echo "MISSING .d.ts: $DTS"; return 1; }
  schema_keys="$(jq -r '.properties | keys[]' "$SCHEMA" | sort | tr '\n' ' ')"
  dts_keys="$(awk '/^export interface PlanIntelBundle \{/{c=1;next} c&&/^\}/{c=0} c' "$DTS" \
    | grep -oE '^[[:space:]]+[a-zA-Z_]+\??:' | sed -E 's/[[:space:]]//g; s/\??:$//' \
    | sort | tr '\n' ' ')"
  [ "$schema_keys" = "$dts_keys" ] \
    || { echo "DRIFT: schema=[$schema_keys] dts=[$dts_keys]"; return 1; }
}

# ── (4) dev-flow-plan wiring: Intel-Gathering step + intel.json + four sources ──
@test "PIB: dev-flow-plan SKILL.md adds the Intel-Gathering step" {
  grep -Eq 'A\.1\.5|Intel-Gathering|Plan Intel Bundle' "$PLAN_SKILL"
}

@test "PIB: dev-flow-plan SKILL.md references intel.json" {
  grep -q 'intel\.json' "$PLAN_SKILL"
}

@test "PIB: dev-flow-plan SKILL.md names the four intel sources" {
  grep -q 'codebase-memory' "$PLAN_SKILL" || { echo "MISSING codebase-memory"; return 1; }
  grep -q 'mcp-postgres'    "$PLAN_SKILL" || { echo "MISSING mcp-postgres";    return 1; }
  grep -q 'context7'        "$PLAN_SKILL" || { echo "MISSING context7";        return 1; }
  grep -Eq '\bLSP\b'        "$PLAN_SKILL" || { echo "MISSING LSP";             return 1; }
}

# ── (5) dev-flow-execute wiring: Step 2 references intel.json ──
_exec_step2_block() {
  awk '/^## Schritt 2:/{c=1;print;next} c&&/^## /{exit} c' "$EXEC_SKILL"
}

@test "PIB: dev-flow-execute SKILL.md Step 2 references intel.json" {
  _exec_step2_block | grep -q 'intel\.json' \
    || { echo "MISSING intel.json in dev-flow-execute Step 2 block"; return 1; }
}
````

- [ ] **Step 2: Run the suite and confirm it fails (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
# expected: FAIL — schema files and skill wiring do not exist yet on this branch
```

`expected: FAIL` — every test case errors/fails because the three schema artifacts and both skill
wirings are absent. This is the required red state for STRUCT2.

- [ ] **Step 3: Commit.**

```bash
git add tests/spec/dev-flow-plan.bats
git commit -m "test(dev-flow-plan): add failing Plan Intel Bundle gate [T001323]"
```

---

## Task 2: Schema contract + TS mirror + fixture (turns cases 1–3 green)

**Files:**
- Create: `.claude/skills/references/schemas/plan-intel-bundle.schema.json`
- Create: `.claude/skills/references/schemas/plan-intel-bundle.d.ts`
- Create: `.claude/skills/references/schemas/plan-intel-bundle.example.json`

**Interfaces:**
- Consumes: the path + key contract hard-coded in `tests/spec/dev-flow-plan.bats` (Task 1).
- Produces: the `PlanIntelBundle` shape (8 top-level keys: `meta`, `impact_files`, `symbols`,
  `call_graph`, `db_tables`, `api_contracts`, `external_types`, `risks`; required: `meta`,
  `impact_files`, `symbols`) — consumed by the skill docs in Tasks 3–4 and by future `intel.json` files.

- [ ] **Step 1: Create the directory and the JSON-Schema.** Run `mkdir -p
  .claude/skills/references/schemas` first, then write
  `.claude/skills/references/schemas/plan-intel-bundle.schema.json` with this exact content:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://bachelorprojekt.local/schemas/plan-intel-bundle.schema.json",
  "title": "Plan Intel Bundle",
  "description": "Typed, schema-validated intel artifact (openspec/changes/<slug>/intel.json) consumed by dev-flow-plan and dev-flow-execute.",
  "type": "object",
  "required": ["meta", "impact_files", "symbols"],
  "additionalProperties": false,
  "properties": {
    "meta": {
      "type": "object",
      "required": ["slug", "ticket_id", "generated_from", "domains", "intel_sources"],
      "additionalProperties": false,
      "properties": {
        "slug": { "type": "string" },
        "ticket_id": { "type": "string" },
        "generated_from": { "type": "string", "description": "main@<sha>" },
        "domains": { "type": "array", "items": { "type": "string" } },
        "intel_sources": { "type": "array", "items": { "type": "string" } }
      }
    },
    "impact_files": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "language", "loc", "s1_limit", "s1_baseline", "s1_budget"],
        "additionalProperties": false,
        "properties": {
          "path": { "type": "string" },
          "language": { "type": "string" },
          "loc": { "type": "integer" },
          "s1_limit": { "type": "integer" },
          "s1_baseline": { "type": ["integer", "null"] },
          "s1_budget": { "type": "integer" }
        }
      }
    },
    "symbols": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["qualified_name", "kind", "file", "signature", "type_text", "source"],
        "additionalProperties": false,
        "properties": {
          "qualified_name": { "type": "string" },
          "kind": { "type": "string" },
          "file": { "type": "string" },
          "signature": { "type": "string" },
          "type_text": { "type": "string" },
          "source": { "type": "string" }
        }
      }
    },
    "call_graph": {
      "type": "object",
      "required": ["entrypoints", "edges"],
      "additionalProperties": false,
      "properties": {
        "entrypoints": { "type": "array", "items": { "type": "string" } },
        "edges": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["from", "to", "kind"],
            "additionalProperties": false,
            "properties": {
              "from": { "type": "string" },
              "to": { "type": "string" },
              "kind": { "type": "string", "enum": ["calls", "data_flow", "cross_service"] }
            }
          }
        }
      }
    },
    "db_tables": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "columns"],
        "additionalProperties": false,
        "properties": {
          "name": { "type": "string" },
          "columns": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["name", "type", "nullable", "default", "constraints"],
              "additionalProperties": false,
              "properties": {
                "name": { "type": "string" },
                "type": { "type": "string" },
                "nullable": { "type": "boolean" },
                "default": { "type": ["string", "null"] },
                "constraints": { "type": "array", "items": { "type": "string" } }
              }
            }
          }
        }
      }
    },
    "api_contracts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["route", "method", "request_type", "response_type", "file"],
        "additionalProperties": false,
        "properties": {
          "route": { "type": "string" },
          "method": { "type": "string" },
          "request_type": { "type": "string" },
          "response_type": { "type": "string" },
          "file": { "type": "string" }
        }
      }
    },
    "external_types": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["library", "symbol", "signature", "source"],
        "additionalProperties": false,
        "properties": {
          "library": { "type": "string" },
          "symbol": { "type": "string" },
          "signature": { "type": "string" },
          "source": { "type": "string" }
        }
      }
    },
    "risks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["note", "severity"],
        "additionalProperties": false,
        "properties": {
          "note": { "type": "string" },
          "severity": { "type": "string", "enum": ["info", "warn", "blocker"] }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create the TypeScript mirror.** Write
  `.claude/skills/references/schemas/plan-intel-bundle.d.ts` with this exact content. The top-level
  `PlanIntelBundle` interface MUST list exactly the eight keys the schema declares under `.properties`,
  in field form `name: Type;` / `name?: Type;` so the parity test (Task 1 case 3) matches:

```typescript
/**
 * Plan Intel Bundle — TypeScript mirror of plan-intel-bundle.schema.json.
 * Hand-maintained; the BATS drift-guard (tests/spec/dev-flow-plan.bats) asserts
 * top-level key parity with the JSON-Schema. Runtime path: openspec/changes/<slug>/intel.json
 */

export type IntelEdgeKind = "calls" | "data_flow" | "cross_service";
export type RiskSeverity = "info" | "warn" | "blocker";

export interface PlanIntelMeta {
  slug: string;
  ticket_id: string;
  generated_from: string;
  domains: string[];
  intel_sources: string[];
}

export interface ImpactFile {
  path: string;
  language: string;
  loc: number;
  s1_limit: number;
  s1_baseline: number | null;
  s1_budget: number;
}

export interface IntelSymbol {
  qualified_name: string;
  kind: string;
  file: string;
  signature: string;
  type_text: string;
  source: string;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  kind: IntelEdgeKind;
}

export interface CallGraph {
  entrypoints: string[];
  edges: CallGraphEdge[];
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  constraints: string[];
}

export interface DbTable {
  name: string;
  columns: DbColumn[];
}

export interface ApiContract {
  route: string;
  method: string;
  request_type: string;
  response_type: string;
  file: string;
}

export interface ExternalType {
  library: string;
  symbol: string;
  signature: string;
  source: string;
}

export interface Risk {
  note: string;
  severity: RiskSeverity;
}

export interface PlanIntelBundle {
  meta: PlanIntelMeta;
  impact_files: ImpactFile[];
  symbols: IntelSymbol[];
  call_graph?: CallGraph;
  db_tables?: DbTable[];
  api_contracts?: ApiContract[];
  external_types?: ExternalType[];
  risks?: Risk[];
}
```

- [ ] **Step 3: Create the example fixture.** Write
  `.claude/skills/references/schemas/plan-intel-bundle.example.json` with this exact content. It
  satisfies the schema and the Task 1 case-2 `jq` assertions (string `meta.slug`/`meta.ticket_id`;
  non-empty `impact_files`/`symbols` with all required element fields):

```json
{
  "meta": {
    "slug": "plan-intel-bundle",
    "ticket_id": "T001323",
    "generated_from": "main@0000000",
    "domains": ["plan-authoring", "dev-tooling"],
    "intel_sources": ["codebase-memory", "mcp-postgres", "context7", "lsp", "baseline.json"]
  },
  "impact_files": [
    {
      "path": ".claude/skills/references/schemas/plan-intel-bundle.schema.json",
      "language": "json",
      "loc": 120,
      "s1_limit": 0,
      "s1_baseline": null,
      "s1_budget": 0
    },
    {
      "path": ".claude/skills/dev-flow-plan/SKILL.md",
      "language": "markdown",
      "loc": 548,
      "s1_limit": 0,
      "s1_baseline": null,
      "s1_budget": 0
    }
  ],
  "symbols": [
    {
      "qualified_name": "scripts/plan-lint.sh:effective_threshold",
      "kind": "function",
      "file": "scripts/plan-lint.sh",
      "signature": "effective_threshold <path> -> int",
      "type_text": "(path: string) => number",
      "source": "codebase-memory"
    }
  ],
  "call_graph": {
    "entrypoints": ["scripts/plan-lint.sh:emit_verdict"],
    "edges": [
      { "from": "emit_verdict", "to": "residual_budget", "kind": "calls" }
    ]
  },
  "db_tables": [],
  "api_contracts": [],
  "external_types": [],
  "risks": [
    { "note": "context7 unreachable — cross-check external_types against the library .d.ts", "severity": "info" }
  ]
}
```

- [ ] **Step 4: Run the suite and confirm cases 1–3 now pass, 4–5 still fail.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
# Expected: PASS for the schema/fixture/parity cases; the two skill-wiring cases still FAIL (Tasks 3–4).
```

- [ ] **Step 5: Commit.**

```bash
git add .claude/skills/references/schemas/plan-intel-bundle.schema.json \
        .claude/skills/references/schemas/plan-intel-bundle.d.ts \
        .claude/skills/references/schemas/plan-intel-bundle.example.json
git commit -m "feat(dev-flow-plan): add Plan Intel Bundle schema + .d.ts + fixture [T001323]"
```

---

## Task 3: How-to doc + wire `dev-flow-plan` (turns case 4 green)

**Files:**
- Create: `.claude/skills/references/plan-intel-bundle.md`
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`

**Interfaces:**
- Consumes: the `PlanIntelBundle` sections from Task 2; the schema path
  `.claude/skills/references/schemas/plan-intel-bundle.schema.json`.
- Produces: a referenced how-to doc and the wired A.1.5 / 3.7 / B.2 steps. Task 1 case 4 greps the whole
  `dev-flow-plan/SKILL.md` for `intel.json`, an Intel-Gathering anchor, and the four source names
  (`codebase-memory`, `mcp-postgres`, `context7`, `LSP`).

- [ ] **Step 1: Create the how-to / source-mapping doc.** Write
  `.claude/skills/references/plan-intel-bundle.md` with this exact content:

````markdown
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
````

- [ ] **Step 2: Insert Schritt A.1.5 into `dev-flow-plan/SKILL.md`.** After the A.1 block (the line
  ending `… vor dem Brainstorming zu analysieren.`) and before `#### Schritt A.2:`, insert:

````markdown
#### Schritt A.1.5: Intel-Gathering → Plan Intel Bundle ⚡

Nach der Exploration (A.1) ein typisiertes **Plan Intel Bundle** befüllen (`intel.json`) — die
maschinenlesbare Typen-Wahrheit, die Plan- und Execute-Phase teilen. Schema + Quellen-Mapping:
[plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).

Jede Sektion ist an ihre Intel-Quelle gebunden:
- `symbols` / `signature` / `type_text` → **codebase-memory** (`get_code_snippet`, `search_graph`) + **LSP** (Hover/Definition); Fallback `grep`/`Read`.
- `call_graph` → **codebase-memory** `trace_path` (`calls`/`data_flow`/`cross_service`).
- `db_tables` → **mcp-postgres** (`information_schema.columns`, read-only); Fallback `kubectl exec … psql`.
- `api_contracts` → `Read` der `website/src/pages/api/**`-Handler + deren Typen.
- `external_types` → **context7** (`resolve-library-id` → `query-docs`).
- `impact_files` / `s1_*` → `wc -l` + `docs/code-quality/baseline.json` + `_ext_limit` (plan-lint-Logik).

Liegt vor `/opsx:propose` noch kein Change-Ordner vor, halte das Bundle bei den übrigen
Phase-A-Artefakten und verschiebe es in **B.2** nach `openspec/changes/<slug>/intel.json`. Ist eine
Quelle und auch ihr Fallback nicht erreichbar, setze einen `risks[]`-Eintrag (`severity: warn`) statt
die Sektion still leer zu lassen. Validiere lokal strukturell (`jq`). Das Bundle informiert bereits
das Brainstorming (A.4).
````

- [ ] **Step 3: Inject the bundle into the Schritt 3.7 subagent prompt.** In the Schritt 3.7
  **Kontext-Injektion** bullet list (under `- **Kontext-Injektion** …`), add a new bullet immediately
  after the `**CI-/Quality-Gates:**` bullet:

````markdown
     - **Plan Intel Bundle (PFLICHT):** `openspec/changes/<slug>/intel.json` — der Plan-Subagent MUSS
       ausschließlich reale Signaturen/Typen aus `intel.json` referenzieren (keine erfundenen Typen),
       die vorberechneten `s1_budget`-Werte aus `impact_files` für die S1-Notation pro Datei nutzen und
       DB-Spalten/API-Contracts aus den `db_tables`/`api_contracts`-Sektionen zitieren. Format/Quellen:
       [plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).
````

- [ ] **Step 4: Move the bundle in Schritt B.2.** In the Schritt B.2 bash block, after the
  `mv "${REPO_ROOT}/openspec/changes/<slug>" …` line, add:

```bash
# Plan Intel Bundle (aus A.1.5) in den Change-Ordner verschieben (falls separat gehalten)
[ -f "${REPO_ROOT}/intel.json" ] && \
  mv "${REPO_ROOT}/intel.json" "${WT}/openspec/changes/<slug>/intel.json" 2>/dev/null || true
```

- [ ] **Step 5: Run the suite and confirm case 4 passes, case 5 still fails.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
# Expected: the dev-flow-plan wiring cases now PASS; the dev-flow-execute Step-2 case still FAILS (Task 4).
```

- [ ] **Step 6: Commit.**

```bash
git add .claude/skills/references/plan-intel-bundle.md .claude/skills/dev-flow-plan/SKILL.md
git commit -m "feat(dev-flow-plan): wire Intel-Gathering + 3.7 bundle injection [T001323]"
```

---

## Task 4: Wire `dev-flow-execute` Step 2 (turns case 5 green)

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

**Interfaces:**
- Consumes: `openspec/changes/<slug>/intel.json` (produced in the plan phase).
- Produces: a `## Schritt 2:` block that names `intel.json` as mandatory implementer context. Task 1
  case 5 slices the `## Schritt 2:` block (up to the next `## ` header) and greps for `intel.json`.

- [ ] **Step 1: Add the bundle to the Step 2 Kontext-Injektion list.** In the `## Schritt 2:` block,
  inside the `- **Kontext-Injektion** …` bullet list (after the `- Attachment-Verzeichnis $ATTACHMENT_DIR …`
  bullet), add:

````markdown
  - **Plan Intel Bundle (PFLICHT):** `openspec/changes/<slug>/intel.json` (aus der Plan-Phase) — der
    Implementer lädt es als Pflicht-Kontext (analog zu `$ATTACHMENT_DIR`) und arbeitet gegen dieselbe
    Typen-Wahrheit wie der Plan: reale Signaturen aus `symbols`, DB-Spalten aus `db_tables`,
    API-Contracts aus `api_contracts` — kein Re-Explorieren. Format:
    [plan-intel-bundle](file:///home/patrick/Bachelorprojekt/.claude/skills/references/plan-intel-bundle.md).
````

- [ ] **Step 2: Run the full suite and confirm all cases pass (GREEN).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
# Expected: PASS — all test cases green (schema, fixture, parity, both skill wirings).
```

- [ ] **Step 3: Commit.**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(dev-flow-execute): consume intel.json as mandatory implementer context [T001323]"
```

---

## Task 5: Final verification (gates + inventory + openspec)

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated)

**Interfaces:**
- Consumes: all artifacts from Tasks 1–4 and the delta-spec
  `openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md`.
- Produces: a green CI-equivalent state.

- [ ] **Step 1: Regenerate the test inventory** (a new BATS file was added, so the committed inventory
  must be updated or CI's inventory check fails):

```bash
task test:inventory
git add website/src/data/test-inventory.json
git commit -m "chore: regenerate test inventory for dev-flow-plan.bats [T001323]"
```

- [ ] **Step 2: Validate the OpenSpec change** (proposal + tasks + delta-spec must be well-formed):

```bash
task test:openspec          # or: bash scripts/openspec.sh validate
# Expected: PASS — the plan-intel-bundle change validates against openspec/specs/dev-flow-plan.md
```

- [ ] **Step 3: Run the three mandatory CI gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

`task freshness:check` is the CI equivalent (S1–S4 ratchet + baseline key-count assertion). If
`freshness:regenerate` produced changed artifacts, commit them:

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: regenerate freshness artifacts [T001323]"
```

- [ ] **Step 4: Final green re-run of the suite.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats
# Expected: PASS — all cases green.
```
