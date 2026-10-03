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

## CPU preflight for Hugging Face / TRL

The dataset and trainer skills inform these preparation gates; no Hugging Face
Job or training run is submitted by this pipeline. SFT rows use conversational
`messages` plus `tools`. Export converts wire-format JSON argument strings into
function argument dictionaries required by Transformers chat templates.

```sh
uv run python -m pipeline.preflight exports/v1 --role executor
uv run --with 'datasets>=4.7.0' python -m pipeline.preflight exports/v1 --role executor --hf-datasets
uv run --with transformers python -m pipeline.preflight exports/v1 --role executor \
  --tokenizer /absolute/path/to/local-tokenizer --max-length 32768
```

Preflight validates manifest hashes, split/family metadata and SFT shape before
GPU allocation. Optional Hugging Face loading tests the actual JSON dataset
conversion on CPU using explicit `Json()` features for messages, tools and
metadata, preserving heterogeneous tool arguments without Arrow struct
inference. This requires `datasets>=4.7.0`. Filter each existing split by role; never merge splits and call
`train_test_split` again. Empty role splits stay empty. Before a GPU training run, explicitly require
a nonempty selected train split; a small family-based dataset may contain only
held-out examples. For example:

```python
from pipeline.preflight import load_hf_splits
splits = load_hf_splits("exports/v1", role="executor")
assert "train" in splits and len(splits["train"]), "No reviewed executor training rows"
train_dataset = splits["train"]
eval_dataset = splits.get("val")  # reserve test for final evaluation
```
 The optional tokenizer
check uses only local/cached files, with no model weights or remote code. Choose
context length from the measured token lengths; reject overlong episodes rather
than silently cutting tool outputs. TRL's configuration field is `max_length`.

For `assistant_only_loss=True`, add `--assistant-only-loss` and require a chat
template supporting generation masks. Preflight rejects missing, empty or
misaligned masks; a successful text rendering alone does not prove that loss
masking works. Tool-bearing transcripts must render correctly with the selected
model's actual template before training.

Future Hub dataset/trace sharing requires explicit authorization. Default to a
private dataset repository, inspect/redact sensitive prompts, paths, outputs and
PII first, preserve source provenance and split membership, and verify Viewer
subset/split metadata rather than assuming upload success. Current raw OpenCode
captures are not claimed to be automatically supported by the Hub trace viewer.

Format references: [Transformers tool chat templates](https://huggingface.co/docs/transformers/chat_extras),
[TRL tool-calling dataset formats](https://huggingface.co/docs/trl/dataset_formats#tool-calling),
and [SFT Trainer](https://huggingface.co/docs/trl/sft_trainer).

## Google Colab: Qwen3.5-9B planner only

[Qwen35_9B_Planner_Colab.ipynb](colab/Qwen35_9B_Planner_Colab.ipynb) is a standalone,
downloadable Google Colab notebook. Upload it to Colab, choose A100 40GB or larger
bf16 hardware, and replace its Google Drive export placeholder when reviewed
planner data exists. The placeholder intentionally fails before package setup
or model downloads. No fixture dataset is supplied and no training has run.

The recipe is text-only bf16 LoRA: rank/alpha 16, batch 1, gradient accumulation
8, Unsloth gradient checkpointing, and a 20-step pilot with 2048-token context.
It requires nonempty reviewed planner train episodes, valid observed plan JSON
and at least 75% actual recorded reasoning examples for the reasoning planner.
Capture now preserves actual OpenCode reasoning events as `reasoning_content`;
it never creates rationales. Existing episodes without those traces need new
teacher collection/review. Full-conversation loss is explicit: the raw Qwen
chat template lacks generation masks, so assistant-only loss is not assumed.

Enter the compute-units/hour currently displayed by Colab and update already-used
units after reconnecting. The ceiling is 200 units, including elapsed setup,
with a configurable saving/evaluation reserve. No fixed hourly rate or guaranteed
training duration is claimed. GPU availability and billing can vary; callbacks
stop at optimizer-step boundaries and cannot impose a hard billing limit. Setup,
compilation and a long step can overrun the estimate. Inspect the pilot before
choosing a measured larger run. An attached idle GPU continues consuming units:
disconnect and delete the runtime after verifying durable files in Drive.

Adapters, tokenizer, frequent optimizer checkpoints, local Trackio metrics,
model/source revisions, dependency versions and dataset/config hashes persist
to the chosen Drive run directory. Resume requires the same immutable run
manifest and an actual full checkpoint, plus unchanged critical dependencies;
changed datasets/configs require a new run directory. Final saving is guarded
with `finally`, but a terminated Colab runtime cannot execute that block, so
frequent checkpoints matter. No HF Job, public Space, Hub upload or production
deployment is launched. Notebook syntax, nbformat and CPU guards are verified;
**actual Colab GPU installation/training remains unverified**.

Sources: [Unsloth Qwen3.5 training](https://unsloth.ai/docs/models/qwen3.5/fine-tune),
[Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B), and
[Colab resource/compute-unit FAQ](https://research.google.com/colaboratory/faq.html).
Regenerate the notebook with `python3 colab/build_notebook.py` from this directory.
