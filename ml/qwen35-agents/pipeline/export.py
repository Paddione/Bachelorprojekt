"""QC-gated SFT export: deterministic, version-independent scenario-family splits."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'schema'))
from episodes import Episode
from validate import validate_episode


def family_split(family, seed, train=80, val=10):
    if not 0 <= train <= 100 or not 0 <= val <= 100 or train + val > 100:
        raise ValueError('split percentages must be nonnegative and sum to at most 100')
    bucket = int(hashlib.sha256(f'{seed}:{family}'.encode()).hexdigest(), 16) % 100
    return 'train' if bucket < train else 'val' if bucket < train + val else 'test'


def export_dataset(source, output, *, seed='qwen35-v1', train=80, val=10, registry=None):
    source, output = Path(source), Path(output)
    if output.exists():
        raise ValueError('output already exists; use a new export directory')
    files = sorted(source.glob('*.json'))
    if not files:
        raise ValueError('no episodes found')
    seen, ids, rows, inputs = {}, set(), {'train': [], 'val': [], 'test': []}, {}
    families = {}
    loaded = []
    for path in files:
        try:
            ep = Episode.model_validate_json(path.read_bytes())
        except Exception as exc:
            raise ValueError(f'{path.name}: invalid episode: {exc}') from exc
        loaded.append((path, ep))
        if ep.provenance.split_assigned:
            previous = families.setdefault(ep.scenario_id, ep.split)
            if previous != ep.split:
                raise ValueError(f'family {ep.scenario_id!r} has conflicting source splits')
    for path, ep in loaded:
        raw = path.read_bytes()
        try:
            ep = Episode.model_validate_json(raw)
        except Exception as exc:
            raise ValueError(f'{path.name}: invalid episode: {exc}') from exc
        errors = validate_episode(ep, seen, registry)
        if ep.role == 'dispatcher':
            if not ep.selected_task or ep.selected_arguments is None:
                errors.append('reviewed dispatcher decision required')
        elif ep.role == 'planner':
            if not ep.plan or not ep.plan.get('steps'):
                errors.append('observed planner output required')
        elif not ep.result:
            errors.append('reviewed observed result required')
        if ep.base_model == 'unselected':
            errors.append('choose the target base_model before export')
        if not ep.provenance.reviewed:
            errors.append('review required before SFT export (including handled failures)')
        if not ep.provenance.executed or not ep.provenance.source_session:
            errors.append('executed source session required')
        if ep.episode_id in ids:
            errors.append('duplicate episode id')
        ids.add(ep.episode_id)
        if not ep.messages or ep.messages[-1].get('role') != 'assistant':
            errors.append('final assistant handling required')
        called = {call.get('function', {}).get('name') for message in ep.messages
                  for call in message.get('tool_calls', [])}
        defined = {tool.get('function', {}).get('name') for tool in ep.tools}
        if called - defined:
            errors.append(f'missing tool definitions: {sorted(called - defined)}')
        if errors:
            raise ValueError(f'{path.name}: ' + '; '.join(errors))
        split = families.get(ep.scenario_id) or family_split(ep.scenario_id, seed, train, val)
        families[ep.scenario_id] = split
        inputs[path.name] = hashlib.sha256(raw).hexdigest()
        # Training rows contain only standard chat fields. Evidence status is meta,
        # keeping authoritative QC data separate from model-facing tool content.
        messages = [{key: value for key, value in message.items()
                     if key in ('role', 'content', 'tool_calls', 'tool_call_id', 'name', 'reasoning_content')}
                    for message in ep.messages]
        rows[split].append({'messages': messages, 'tools': ep.tools,
                            'meta': {'episode_id': ep.episode_id, 'role': ep.role,
                                     'family': ep.scenario_id, 'split': split,
                                     'result': ep.result.model_dump() if ep.result else None,
                                     'provenance': ep.provenance.model_dump()}})
    payloads = {f'{split}.jsonl': ''.join(json.dumps(row, sort_keys=True, ensure_ascii=False) + '\n'
                                         for row in sorted(data, key=lambda r: r['meta']['episode_id']))
                for split, data in rows.items()}
    manifest = {'version': 1, 'seed': seed, 'percentages': {'train': train, 'val': val, 'test': 100-train-val},
                'inputs': inputs, 'families': families, 'counts': {key: len(data) for key, data in rows.items()},
                'sha256': {name: hashlib.sha256(content.encode()).hexdigest() for name, content in payloads.items()}}
    payloads['manifest.json'] = json.dumps(manifest, sort_keys=True, indent=2) + '\n'
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.qwen-export-', dir=output.parent))
    try:
        for name, content in payloads.items():
            (temporary / name).write_text(content, encoding='utf-8')
        temporary.rename(output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--seed', default='qwen35-v1')
    parser.add_argument('--train-percent', type=int, default=80)
    parser.add_argument('--val-percent', type=int, default=10)
    parser.add_argument('--registry', type=Path)
    args = parser.parse_args()
    registry = {entry['task_id'] for entry in json.loads(args.registry.read_text())['tasks']} if args.registry else None
    try:
        manifest = export_dataset(args.source, args.output, seed=args.seed,
                                  train=args.train_percent, val=args.val_percent, registry=registry)
    except ValueError as exc:
        parser.exit(1, f'Export refused: {exc}\n')
    print(json.dumps(manifest['counts'], sort_keys=True))


if __name__ == '__main__':
    main()
