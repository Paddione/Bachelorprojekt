# Testsets — Unsloth Eval Harness (T002606)

Two testsets, split by role (T901286):

- **`agent-actions.jsonl`** (default, consumed by `scripts/finetune/eval_harness.py`):
  orchestrator set with all three partitions (`action`, `no_action`, `clarify`).
- **`instruct-worker.jsonl`**: worker set for instruct models. Workers execute
  plan steps and always emit actions — `clarify`/`no_action` behaviour belongs
  to the thinking orchestrator, not the worker. Action-only (`class=action`
  throughout), requests in plan-step style ("Step N of the work plan: …"),
  including multi-action sets. Reachable without code change via
  `eval-runner.sh --testset` (and `run_tuned_fixed.py <testset>`).

Both are validated by `scripts/finetune/eval_scoring.py validate-testset`.

## Format

One JSON object per line:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique case id. Convention: `<pair_id>-<language>`. |
| `pair_id` | string | Links the English and German instance of the same scenario. |
| `class` | string | One of `action`, `no_action`, `clarify`. |
| `language` | string | `en` or `de`. |
| `provenance` | string | How the case was produced. Must document that it does **not** come from a training corpus — use `handwritten-not-in-training-corpus` unless a different, equally explicit value applies. |
| `request` | string | The user request text fed to the model. |
| `action_schemas` | object | Action name → `{"required": [...], "optional": [...]}`. The full set of actions the model may choose from for this case. |
| `expected_actions` | array | Expected `{"name": ..., "params": {...}}` entries. Empty for `no_action` and `clarify`. |

## Case classes

- **`action`** — a specific action (or set of actions) is correct. Scored on well-formed
  output, exact match of the action-name set, complete required params, and no unknown
  params (`eval_scoring.score_action_case`).
- **`no_action`** — the correct response emits no action at all. This is the partition that
  catches a model inventing work that wasn't asked for.
- **`clarify`** — the request is missing required information; a clarifying question is
  correct, any emitted action (even with guessed params) scores zero.

## Requirements enforced by `validate-testset`

- At least 40 cases total.
- At least one partition (`action`, `no_action`, `clarify`) non-empty —
  single-partition sets such as the action-only worker set are accepted.
  The legacy orchestrator set keeps all three partitions populated.
- Every `pair_id` has both an `en` and a `de` row.

## Adding a case

Append one line per language to the set that matches the role under test
(`agent-actions.jsonl` for orchestrator behaviour, `instruct-worker.jsonl`
for worker plan-step execution) — no code change required. Worker cases must
use `class=action` with a plan-step request and entities disjoint from the
training corpora and `agent-actions.jsonl` (exact request texts must not
repeat). Use
action names/schemas from this file's own domain (generic productivity actions), not brand
or product literals, and route any example hostname through a placeholder rather than a real
domain. Keep the `provenance` field honest: a case copied or adapted from a training corpus
must not use `handwritten-not-in-training-corpus`.

Validate after editing:

```bash
python3 scripts/finetune/eval_scoring.py validate-testset scripts/finetune/testsets/agent-actions.jsonl
```
