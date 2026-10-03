"""CPU-testable preparation for Qwen3.5-9B planner training on Google Colab."""
from dataclasses import dataclass
import json
import math
from pathlib import Path
import re

MODEL_ID = 'Qwen/Qwen3.5-9B'


@dataclass(frozen=True)
class Budget:
    units_per_hour: float
    credits: float = 200
    already_used: float = 0
    reserve: float = 20

    def __post_init__(self):
        values = (self.units_per_hour, self.credits, self.already_used, self.reserve)
        if not all(isinstance(value, (float, int)) and math.isfinite(value) for value in values):
            raise ValueError('enter finite displayed Colab compute units/hour and credit values')
        if self.units_per_hour <= 0 or not 0 < self.credits <= 200:
            raise ValueError('positive displayed rate required; credit ceiling is 200')
        if self.already_used < 0 or self.reserve <= 0 or self.already_used + self.reserve >= self.credits:
            raise ValueError('remaining credits must exceed saving/evaluation reserve')

    def used_credits(self, elapsed_seconds):
        if elapsed_seconds < 0:
            raise ValueError('elapsed time cannot be negative')
        return self.already_used + elapsed_seconds * self.units_per_hour / 3600

    def training_seconds(self, elapsed_seconds):
        remaining = self.credits - self.reserve - self.used_credits(elapsed_seconds)
        return max(0, remaining / self.units_per_hour * 3600)

    def should_stop(self, elapsed_seconds):
        return self.training_seconds(elapsed_seconds) <= 0


def observed_plan(message):
    text = message.get('content', '').strip()
    text = re.sub(r'^<think>.*?</think>\s*', '', text, flags=re.S)
    if text.startswith('```') and text.endswith('```'):
        text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    try:
        plan = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValueError('planner final response must contain observed plan JSON') from exc
    steps = plan.get('steps') if isinstance(plan, dict) else None
    if not isinstance(steps, list) or not steps:
        raise ValueError('planner plan requires nonempty steps')
    ids, dependencies = set(), {}
    for step in steps:
        if not isinstance(step, dict):
            raise ValueError('plan step must be object')
        for field in ('id', 'worker', 'goal'):
            if not isinstance(step.get(field), str) or not step[field].strip():
                raise ValueError(f'plan step requires {field}')
        if step['id'] in ids:
            raise ValueError('duplicate plan step id')
        ids.add(step['id'])
        for field in ('depends_on', 'acceptance_criteria'):
            value = step.get(field)
            if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
                raise ValueError(f'plan step requires string-list {field}')
        if not step['acceptance_criteria']:
            raise ValueError('plan acceptance criteria cannot be empty')
        dependencies[step['id']] = step['depends_on']
    visited, visiting = set(), set()
    def visit(node):
        if node in visiting or node not in ids:
            raise ValueError('plan dependency cycle or unknown dependency')
        if node in visited:
            return
        visiting.add(node)
        for dependency in dependencies[node]:
            visit(dependency)
        visiting.remove(node)
        visited.add(node)
    for node in ids:
        visit(node)
    return plan


def planner_gate(rows, *, minimum_reasoning=.75):
    if not rows:
        raise ValueError('no reviewed planner training data; placeholder paths are not datasets')
    reasoning_count = 0
    for row in rows:
        meta, messages = row.get('meta', {}), row.get('messages', [])
        provenance = meta.get('provenance', {})
        if meta.get('role') != 'planner' or not provenance.get('reviewed') or not provenance.get('executed'):
            raise ValueError('only reviewed, executed planner episodes are eligible')
        if not messages or messages[-1].get('role') != 'assistant':
            raise ValueError('planner episode requires final assistant response')
        observed_plan(messages[-1])
        has_reasoning = any(
            message.get('role') == 'assistant' and (
                isinstance(message.get('reasoning_content'), str) and message['reasoning_content'].strip()
                or re.search(r'<think>\s*\S.*?</think>', message.get('content', ''), re.S))
            for message in messages)
        reasoning_count += bool(has_reasoning)
    fraction = reasoning_count / len(rows)
    if fraction < minimum_reasoning:
        raise ValueError('reasoning planner requires at least 75% actual recorded reasoning; generate/review it first')
    return {'rows': len(rows), 'reasoning_fraction': fraction}


def save_run_manifest(path, identity, *, resume=False):
    path = Path(path)
    if path.exists():
        existing = json.loads(path.read_text())
        if not resume or existing != identity:
            raise ValueError('run already exists or resume dataset/config differs; use a new run directory')
    elif resume:
        raise ValueError('resume requires original durable run manifest')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(identity, sort_keys=True, indent=2) + '\n')


def sft_kwargs(output_dir, *, max_steps=20, max_length=2048):
    if max_steps <= 0 or max_length <= 0:
        raise ValueError('positive steps and context required')
    return dict(output_dir=str(output_dir), max_steps=max_steps, max_length=max_length,
                per_device_train_batch_size=1, gradient_accumulation_steps=8,
                learning_rate=2e-4, warmup_steps=min(5, max_steps // 5),
                bf16=True, fp16=False, gradient_checkpointing=True,
                logging_steps=1, save_strategy='steps', save_steps=5, save_total_limit=2,
                optim='adamw_torch', weight_decay=.01, lr_scheduler_type='linear',
                seed=3407, packing=False, assistant_only_loss=False,
                report_to='none', push_to_hub=False, eval_strategy='no')
