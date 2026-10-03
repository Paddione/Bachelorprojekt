# qwen35-agents — Dataset pipeline (T900930)

Registry generation, scenario authoring, actual teacher capture and reviewed SFT
export for dispatcher, executor, orchestrator and planner roles. This phase does
not train models or change the worker model configuration.

Run Python commands from this directory with `uv run python`. From repository
root, use `uv run --project ml/qwen35-agents` and change into this directory for
module commands.

## Workflow

1. `uv run python registry/generate_registry.py` generates the actual recursive
   Taskfile registry, including manual entries and risk classifications.
2. `uv run python -m pipeline.scenarios scenarios-v1` writes eight authoring
   seeds. Edit prompts, target `base_model`, real tool schemas, expectations and
   paths before collecting data. Dispatcher prompts include a registry excerpt and request a structured task
   selection without execution; observed selection is stored separately from
   OpenCode tool calls. Replace the excerpt with actual registry entries for
   new scenarios. Ordinary OpenCode tools remain read/bash, not task IDs.
   Failure seeds require actually failing environments, not invented evidence.
3. Configure the teacher's tool permissions and create an isolated Git worktree.
   Capture a bounded teacher run explicitly:

   ```sh
   uv run python -m pipeline.capture scenarios-v1/executor-inspect-success.json runs/readme-1 \
     --run --worktree /absolute/path/to/worktree --teacher-model provider/model --timeout 120
   ```

   Capture executes the chosen OpenCode agent with `--format json`. It is not a
   sandbox; worktrees isolate Git changes, not arbitrary commands or network
   access. Use a read-only permission configuration for a first smoke run.
   Do not run destructive scenarios without the repository's required approval.
   On WSL, Windows launcher paths receive a Windows `--dir` path.
4. Review `run.json`, `source.jsonl`, `scenario.json`, and `episode.json`. Capture
   preserves real tool outputs/errors, session provenance and source SHA256.
   Failed launches, timeouts and incomplete/invalid events retain their raw
   evidence and produce `rejected.json`, without a training episode. A successful
   bash handler needs its actual exit code; unknown outcomes require review.
5. The reviewer confirms acceptance criteria, tool schemas, path boundaries and
   correct handling of failures. Set `provenance.reviewed=true` only after that
   review. Set the observed `result` where unavailable. `expected_plan` is the
   reference; `plan` comes from actual structured teacher output when parseable. Dispatcher
   output uses `selected_task` and `selected_arguments`. Decision-only episodes
   do not claim successful task execution; review is still mandatory. Capture
   does not copy a reference plan into observed metrics.
6. Copy reviewed `episode.json` files into a flat `data/` directory using unique
   filenames. `uv run python schema/validate.py data/ --registry registry.json`
   checks schema, secrets, canonical dedupe and matched tool evidence.
7. `uv run python -m pipeline.export data/ exports/v1 --seed qwen35-v1` refuses
   all output if any episode is invalid, unreviewed, missing tool definitions or
   lacks a final assistant response. Export writes `train.jsonl`, `val.jsonl`,
   `test.jsonl` and a manifest with source/output hashes and family assignments.
   Only `train.jsonl` belongs in training. Handled failures remain eligible after
   review; failed processes do not imply good failure handling.

New live captures have `provenance.split_assigned=false`. Export assigns these
families deterministically using SHA256 of seed and scenario family (80/10/10 by
hash bucket, not guaranteed counts for small datasets). All roles, versions and
model sizes in one family share a split. Existing assigned train/val/test
membership is preserved; conflicting assigned splits within a family fail.
Choose family identifiers broadly enough to contain related prompt variants.
Never change the seed to improve reported evaluation results.

## Import existing evidence

```sh
uv run python -m pipeline.capture scenarios-v1/executor-inspect-success.json runs/import-1 \
  --events actual-opencode-events.jsonl --source-split test --teacher-model provider/model
uv run python -m pipeline.capture scenarios-v1/executor-inspect-success.json runs/import-2 \
  --recorder actual-agent-bench-trace.jsonl --source-split train
```

Recorder import reuses the final full request/messages/tools plus final response
from `scripts/llm/agent-bench/lib/recorder.mjs`, matching that existing trajectory
format. Recorder traces lack normalized authoritative tool status: import leaves
`result` unset for review. Redacted traces and incomplete final responses are
rejected. This exporter separately supports reviewed handled failures, which the
existing clean-only agent-bench corpus intentionally excludes. Preserve the
source evaluation split when importing. Raw captures may contain sensitive
material; keep them locally, review them before copying episodes, and never add
raw runs or datasets to Git.

## Verification

`uv run --with pytest python -m pytest tests -q` exercises real subprocess
failure/timeout capture, realistic OpenCode events, fabricated-success rejection,
path guards, argument-sensitive dedupe, held-out split preservation and atomic
export refusal. `eval/role_metrics.py` remains the role-scoring scaffold; observed
plans require explicit parsing/review before planner or orchestrator scoring.
