"""Build the standalone Colab notebook; no training or model downloads locally."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
cells = []

def markdown(source):
    cells.append({'cell_type': 'markdown', 'metadata': {}, 'source': source.splitlines(True)})

def code(source):
    cells.append({'cell_type': 'code', 'metadata': {}, 'source': source.splitlines(True),
                  'execution_count': None, 'outputs': []})

markdown('''# Qwen3.5-9B planner — Google Colab, 200-unit budget
Upload this notebook to Colab. Select an A100 with at least 40 GB VRAM (or a larger bf16-capable GPU).
GPU availability and displayed compute-units/hour vary; 200 units do not guarantee a complete run.
This is a 20-step bf16 LoRA pilot, text-only, planner-only. No HF Jobs or automatic Hub uploads.

**Data comes first:** replace the Drive placeholder with a reviewed export containing a nonempty
planner train split, valid observed plan JSON, and at least 75% actual recorded reasoning examples.
There is currently no real reviewed dataset supplied. Missing data fails before package/model setup.
Run cells in order. Reconnects consume credits too: enter already-used units from Colab each time.
The budget timer includes installation, download and setup after its first cell.
''')
code('''from pathlib import Path
import time, json, hashlib, os
if 'SESSION_STARTED' not in globals():
    SESSION_STARTED = time.monotonic()
from google.colab import drive
drive.mount('/content/drive')
EXPORT_DIR = Path('/content/drive/MyDrive/REPLACE_WITH_REVIEWED_PLANNER_EXPORT')
RUN_DIR = Path('/content/drive/MyDrive/qwen35-9b-planner/pilot-01')
CU_PER_HOUR = None  # Enter the actual displayed Colab rate; no fixed rate assumed.
ALREADY_USED_CU = 0.0  # Update from the Colab UI after reconnect/restart.
CREDIT_CEILING = 200.0
RESERVE_CU = 20.0  # Saving/evaluation reserve, not additional credits.
MAX_STEPS = 20
MAX_LENGTH = 2048  # Raise to 4096 only after checking lengths and memory.
RESUME_CHECKPOINT = None  # Exact Drive checkpoint path from the SAME run manifest.
MODEL_REVISION = None  # Resolve and persist an immutable model revision below.
if not (EXPORT_DIR / 'manifest.json').is_file():
    raise FileNotFoundError('Replace placeholder with a real reviewed export; no model is downloaded.')
if CU_PER_HOUR is None:
    raise ValueError('Enter compute units/hour shown by Colab before continuing.')
''')
code((ROOT / 'config.py').read_text())
code('''budget = Budget(CU_PER_HOUR, CREDIT_CEILING, ALREADY_USED_CU, RESERVE_CU)
def elapsed():
    return time.monotonic() - SESSION_STARTED
def budget_guard():
    if budget.should_stop(elapsed()):
        raise RuntimeError('Training allowance exhausted; reserve remaining for durable save/disconnect.')
print('Remaining training allowance in hours:', budget.training_seconds(elapsed()) / 3600)
# Check placeholder data with standard-library code before installing GPU packages.
raw_train = [json.loads(line) for line in (EXPORT_DIR / 'train.jsonl').read_text().splitlines() if line.strip()]
planner_rows = [row for row in raw_train if row.get('meta', {}).get('role') == 'planner']
print(planner_gate(planner_rows))
budget_guard()
''')
markdown('''## Install the current supported Qwen3.5 stack
Based on the official Unsloth Qwen3.5 notebook installation recipe (checked 2026-10-03).
The source Git dependencies are resolved to immutable commits and recorded to Drive. Pip freeze is
also persisted. Dependency installation and kernel compilation consume time/credits. Colab GPU
execution of this adaptation is unverified; dependency or kernel failures must be resolved before
increasing training steps. Do not install older Transformers 4 recipes for this model.
''')
code('''import subprocess, sys, urllib.request
# Inspect assigned hardware before costly package setup.
gpu = subprocess.check_output(['nvidia-smi', '--query-gpu=name,memory.total,compute_cap', '--format=csv,noheader,nounits'], text=True).strip()
print(gpu)
name, memory_mib, capability = gpu.splitlines()[0].split(',')
if float(memory_mib) < 39 * 1024 or float(capability) < 8:
    raise RuntimeError('A100 40GB or larger bf16 hardware required before installation.')
if RUN_DIR.exists() and not RESUME_CHECKPOINT:
    raise ValueError('Run directory exists; use exact checkpoint resume or choose a fresh run name.')
source_path = RUN_DIR / 'installation_sources.json'
if RESUME_CHECKPOINT:
    source_revisions = json.loads(source_path.read_text())
else:
    source_revisions = {}
    for name, repository in [('unsloth', 'unslothai/unsloth'), ('unsloth_zoo', 'unslothai/unsloth-zoo')]:
        url = 'https://api.github.com/repos/' + repository + '/commits/main'
        source_revisions[name] = json.load(urllib.request.urlopen(url))['sha']
    RUN_DIR.mkdir(parents=True, exist_ok=False)
    source_path.write_text(json.dumps(source_revisions, indent=2))
def pip(*arguments):
    subprocess.check_call([sys.executable, '-m', 'pip', *arguments])
pip('install', '--upgrade', 'uv')
pip('install', 'torch==2.8.0', 'torchvision==0.23.0', 'triton>=3.3.0',
    'xformers==0.0.32.post2', 'bitsandbytes', 'pillow', 'numpy',
    'unsloth_zoo[base] @ git+https://github.com/unslothai/unsloth-zoo@' + source_revisions['unsloth_zoo'],
    'unsloth[base] @ git+https://github.com/unslothai/unsloth@' + source_revisions['unsloth'])
pip('install', 'transformers==5.2.0', 'trl==0.22.2', 'datasets>=4.7.0', 'jsonschema>=4', 'trackio', 'tokenizers>=0.22.0,<=0.23.0')
pip('install', '--no-deps', 'torchcodec==0.7.0', 'torchao>=0.16.0')
pip('uninstall', '-y', 'flash-linear-attention', 'fla-core')
pip('install', '--no-build-isolation', 'causal_conv1d==1.6.0')
import importlib.metadata
critical_names = ['torch', 'triton', 'xformers', 'transformers', 'trl', 'datasets', 'trackio', 'tokenizers', 'unsloth', 'unsloth_zoo', 'causal-conv1d', 'torchcodec', 'torchao']
critical_versions = {name: importlib.metadata.version(name) for name in critical_names}
version_path = RUN_DIR / 'critical_versions.json'
if RESUME_CHECKPOINT:
    if json.loads(version_path.read_text()) != critical_versions:
        raise RuntimeError('Runtime dependency versions changed; restore recorded versions before resume.')
else:
    version_path.write_text(json.dumps(critical_versions, indent=2))
    (RUN_DIR / 'requirements.freeze.txt').write_text(subprocess.check_output([sys.executable, '-m', 'pip', 'freeze'], text=True))
budget_guard()
''')
markdown('''## CPU dataset and tokenizer preflight, then model allocation
Pipeline code is fetched from the immutable episode-phase commit, not a moving branch. The tokenizer
is downloaded before model weights. No resplitting: train is training, val is optional evaluation,
test remains untouched. Full-conversation loss is explicit: Qwen's raw template lacks generation masks;
this notebook does not assume assistant-only loss. Reasoning remains actual teacher data.
''')
code('''# Unsloth must precede Transformers imports for its supported patches.
from unsloth import FastLanguageModel
import torch
if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
    raise RuntimeError('CUDA bf16 GPU required; T4 is insufficient for this bf16 9B recipe.')
if torch.cuda.get_device_properties(0).total_memory < 39 * 1024**3:
    raise RuntimeError('Use A100 40GB or larger; this recipe does not use 4-bit QLoRA.')
PIPELINE_COMMIT = '93e01a1628ad99cd238159dc7f54c9bdb9c5cd8e'
source = urllib.request.urlopen('https://raw.githubusercontent.com/Paddione/Bachelorprojekt/' + PIPELINE_COMMIT + '/ml/qwen35-agents/pipeline/preflight.py').read().decode()
namespace = {'__name__': 'colab_pipeline_preflight'}
exec(compile(source, 'pinned-preflight.py', 'exec'), namespace)
from huggingface_hub import HfApi
from transformers import AutoTokenizer
if RESUME_CHECKPOINT:
    persisted = json.loads((RUN_DIR / 'run_manifest.json').read_text())
    MODEL_REVISION = persisted['model_revision']
else:
    MODEL_REVISION = MODEL_REVISION or HfApi().model_info(MODEL_ID).sha
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False)
print(namespace['inspect_export'](EXPORT_DIR, role='planner', tokenizer=tokenizer, max_length=MAX_LENGTH))
splits = namespace['load_hf_splits'](EXPORT_DIR, role='planner')
if 'train' not in splits or not len(splits['train']):
    raise ValueError('Nonempty reviewed planner train split required; never train on holdouts.')
print(planner_gate(splits['train'].to_list()))
train_dataset = splits['train'].remove_columns(['meta'])
val_dataset = splits.get('val')
if val_dataset is not None:
    planner_gate(val_dataset.to_list(), minimum_reasoning=0)
    val_dataset = val_dataset.remove_columns(['meta'])
identity = {'model': MODEL_ID, 'model_revision': MODEL_REVISION, 'role': 'planner',
            'pipeline_commit': PIPELINE_COMMIT, 'dataset_manifest_sha256': hashlib.sha256((EXPORT_DIR / 'manifest.json').read_bytes()).hexdigest(),
            'max_steps': MAX_STEPS, 'max_length': MAX_LENGTH, 'r': 16, 'alpha': 16,
            'batch_size': 1, 'gradient_accumulation_steps': 8, 'seed': 3407,
            'precision': 'bf16', 'loss': 'full-conversation', 'source_revisions': source_revisions, 'critical_versions': critical_versions}
save_run_manifest(RUN_DIR / 'run_manifest.json', identity, resume=bool(RESUME_CHECKPOINT))
if RESUME_CHECKPOINT:
    checkpoint = Path(RESUME_CHECKPOINT).resolve()
    if RUN_DIR.resolve() not in checkpoint.parents or not (checkpoint / 'trainer_state.json').is_file():
        raise ValueError('Resume requires a full optimizer/checkpoint from this run, not adapter-only files.')
budget_guard()
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_ID, revision=MODEL_REVISION, max_seq_length=MAX_LENGTH,
    dtype=torch.bfloat16, load_in_4bit=False, load_in_16bit=True, full_finetuning=False,
    use_gradient_checkpointing='unsloth', trust_remote_code=False, use_exact_model_name=True)
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=16, lora_dropout=0,
    target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    bias='none', use_gradient_checkpointing='unsloth', random_state=3407)
# Loader-patched tokenizer is also checked: never silently truncate tool/plan evidence.
print(namespace['inspect_export'](EXPORT_DIR, role='planner', tokenizer=tokenizer, max_length=MAX_LENGTH))
budget_guard()
''')
markdown('''## Pilot with budget-stop callbacks and local tracking
Budget is a best-effort elapsed-time estimate from the displayed rate, checked at optimizer steps.
A long step, compilation, installation, evaluation or saving can overrun the estimate. Watch Colab's
actual remaining units and keep a reserve; the notebook cannot enforce Google's billing. Start with
20 steps, inspect results, then choose a fresh run directory and measured larger step limit. No claim
that 200 units cover a full epoch. Save frequently to Drive; interrupted runtimes cannot run finally.
''')
code('''for name in list(os.environ):
    if name.startswith('TRACKIO_'):
        os.environ.pop(name, None)
os.environ['TRACKIO_DIR'] = str(RUN_DIR / 'trackio')
import trackio
trackio.init(project='qwen35-9b-planner-colab', name=RUN_DIR.name, space_id=None)
from transformers import TrainerCallback
from trl import SFTTrainer, SFTConfig
class BudgetStop(TrainerCallback):
    def on_step_end(self, args, state, control, **kwargs):
        if budget.should_stop(elapsed()):
            control.should_training_stop = True
            control.should_save = True
        return control
    def on_log(self, args, state, control, logs=None, **kwargs):
        trackio.log({**(logs or {}), 'elapsed_seconds': elapsed(),
                     'estimated_cu_used': budget.used_credits(elapsed())}, step=state.global_step)
        return control
args = SFTConfig(**sft_kwargs(RUN_DIR / 'checkpoints', max_steps=MAX_STEPS, max_length=MAX_LENGTH))
trainer = SFTTrainer(model=model, processing_class=tokenizer, args=args,
                     train_dataset=train_dataset, eval_dataset=val_dataset, callbacks=[BudgetStop()])
budget_guard()
try:
    result = trainer.train(resume_from_checkpoint=RESUME_CHECKPOINT)
    (RUN_DIR / 'pilot_metrics.json').write_text(json.dumps(result.metrics, indent=2))
finally:
    try:
        # Checkpoints include optimizer state for resume; final adapter is portable.
        trainer.save_model(str(RUN_DIR / 'adapter'))
        tokenizer.save_pretrained(str(RUN_DIR / 'adapter'))
        trainer.save_state()
        adapter_files = [path for path in (RUN_DIR / 'adapter').rglob('*') if path.is_file()]
        if not adapter_files or not (RUN_DIR / 'adapter' / 'adapter_config.json').is_file():
            raise RuntimeError('Adapter save could not be verified.')
        durable = {str(path.relative_to(RUN_DIR)): hashlib.sha256(path.read_bytes()).hexdigest() for path in adapter_files}
        (RUN_DIR / 'adapter.sha256.json').write_text(json.dumps(durable, indent=2))
        (RUN_DIR / 'budget_estimate.json').write_text(json.dumps({'elapsed_seconds': elapsed(), 'estimated_cu_used': budget.used_credits(elapsed())}, indent=2))
    finally:
        trackio.finish()
print('Saved adapter/tokenizer and checkpoints to', RUN_DIR)
''')
markdown('''## Verify durable save and disconnect
Inspect the Drive adapter/config/tokenizer and checkpoints before ending the runtime. Copy/download
the run directory if desired. Do not launch automatic test-set evaluation or public uploads here.
For evaluation, reserve time and units separately; record val results, leave test for final evaluation.
An attached idle GPU still consumes units: **Runtime → Disconnect and delete runtime** after checking
Drive files. Resume using the same run manifest, dataset hashes, model revision, config and checkpoint;
update actual already-used units/rate after reconnect. Adapter-only saving cannot resume optimizer state.

Sources: [Unsloth Qwen3.5 guide](https://unsloth.ai/docs/models/qwen3.5/fine-tune),
[official installation notebook](https://github.com/unslothai/notebooks/blob/main/nb/Qwen3_5_(4B)_Vision.ipynb),
[Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B),
[TRL SFT](https://huggingface.co/docs/trl/sft_trainer),
[Colab FAQ](https://research.google.com/colaboratory/faq.html).
This notebook was syntax/CPU-tested offline; **Colab GPU training remains unverified**.
''')
notebook = {'nbformat': 4, 'nbformat_minor': 5, 'metadata': {'kernelspec': {'name': 'python3', 'display_name': 'Python 3'}, 'language_info': {'name': 'python'}, 'colab': {'name': 'Qwen35_9B_Planner_Colab.ipynb'}}, 'cells': cells}
for index, cell in enumerate(cells):
    cell['id'] = f'qwen35-planner-{index}'
    if cell['cell_type'] == 'code':
        compile(''.join(cell['source']), cell['id'], 'exec')
(ROOT / 'Qwen35_9B_Planner_Colab.ipynb').write_text(json.dumps(notebook, indent=2) + '\n')
