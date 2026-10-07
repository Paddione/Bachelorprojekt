"""CPU-only format, manifest, and optional local chat-template checks before training."""
import argparse
import hashlib
import json
from pathlib import Path


def inspect_export(directory, *, role=None, tokenizer=None, assistant_only=False, max_length=None):
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text())
    families, counts, max_tokens = {}, {}, 0
    for split in ('train', 'val', 'test'):
        path = directory / f'{split}.jsonl'
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != manifest['sha256'][path.name]:
            raise ValueError(f'{path.name}: manifest hash mismatch')
        all_rows = [json.loads(line) for line in payload.decode().splitlines() if line.strip()]
        if len(all_rows) != manifest['counts'][split]:
            raise ValueError(f'{path.name}: count mismatch')
        rows = []
        for row in all_rows:
            meta = row['meta']
            if meta['split'] != split or manifest['families'].get(meta['family']) != split:
                raise ValueError('split metadata does not match manifest')
            prior = families.setdefault(meta['family'], split)
            if prior != split:
                raise ValueError('scenario family leakage')
            if role is None or meta['role'] == role:
                rows.append(row)
        counts[split] = len(rows)
        for row in rows:
            messages, tools = row['messages'], row['tools']
            if not isinstance(messages, list) or not messages or not isinstance(tools, list):
                raise ValueError('SFT requires nonempty messages and a tools list')
            definitions = {tool.get('function', {}).get('name'): tool.get('function', {}).get('parameters') for tool in tools}
            for message in messages:
                for call in message.get('tool_calls', []):
                    function = call.get('function', {})
                    if not isinstance(function.get('arguments'), dict):
                        raise ValueError('Transformers tool arguments must be dictionaries')
                    schema = definitions.get(function.get('name'))
                    if schema is None:
                        raise ValueError('tool call lacks its JSON schema')
                    import jsonschema
                    try:
                        jsonschema.Draft202012Validator.check_schema(schema)
                        jsonschema.validate(function['arguments'], schema)
                    except (jsonschema.ValidationError, jsonschema.SchemaError) as exc:
                        raise ValueError(f'tool JSON schema mismatch: {exc.message}') from exc
            if tokenizer is not None:
                kwargs = {'tools': tools or None, 'tokenize': True, 'add_generation_prompt': False, 'return_dict': True}
                if assistant_only:
                    kwargs.update(return_dict=True, return_assistant_tokens_mask=True)
                tokenized = tokenizer.apply_chat_template(messages, **kwargs)
                if assistant_only:
                    ids, mask = tokenized['input_ids'], tokenized.get('assistant_masks')
                    if ids and isinstance(ids[0], list):
                        ids = ids[0]
                    if mask and isinstance(mask[0], list):
                        mask = mask[0]
                    if not mask or len(mask) != len(ids) or not any(mask):
                        raise ValueError('assistant-only loss needs valid nonempty generation masks')
                else:
                    ids = tokenized['input_ids'] if isinstance(tokenized, dict) or hasattr(tokenized, 'keys') else tokenized
                    if ids and isinstance(ids[0], list):
                        ids = ids[0]
                max_tokens = max(max_tokens, len(ids))
                if max_length is not None and len(ids) > max_length:
                    raise ValueError(f'episode {row["meta"]["episode_id"]} exceeds max_length; do not truncate tool evidence silently')
    if not sum(counts.values()):
        raise ValueError('no rows selected')
    return {'counts': counts, 'role': role, 'max_tokens': max_tokens if tokenizer else None,
            'chat_template_checked': tokenizer is not None, 'assistant_only_checked': assistant_only and tokenizer is not None}


def load_hf_splits(directory, role=None):
    """Optional real datasets loader, preserving split membership while filtering roles."""
    inspect_export(directory, role=role)
    from datasets import Dataset, Features, List, Json
    # Arbitrary nested tool arguments need Json rather than Arrow struct inference.
    features = Features({'messages': List(Json()), 'tools': List(Json()), 'meta': Json()})
    selected = {}
    for split in ('train', 'val', 'test'):
        path = Path(directory) / f'{split}.jsonl'
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        if role:
            rows = [row for row in rows if row['meta']['role'] == role]
        if rows:
            selected[split] = Dataset.from_list(rows, features=features)

    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--role', choices=['dispatcher', 'executor', 'orchestrator', 'planner'])
    parser.add_argument('--tokenizer', help='local or already cached tokenizer; never downloads weights')
    parser.add_argument('--assistant-only-loss', action='store_true')
    parser.add_argument('--max-length', type=int)
    parser.add_argument('--hf-datasets', action='store_true', help='also load using optional datasets library')
    args = parser.parse_args()
    if args.assistant_only_loss and not args.tokenizer:
        parser.error('--assistant-only-loss requires --tokenizer')
    tokenizer = None
    if args.tokenizer:
        from transformers import AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(args.tokenizer, local_files_only=True, trust_remote_code=False)
    try:
        report = inspect_export(args.directory, role=args.role, tokenizer=tokenizer,
                                assistant_only=args.assistant_only_loss, max_length=args.max_length)
        if args.hf_datasets:
            report['hf_loaded'] = {split: len(dataset) for split, dataset in load_hf_splits(args.directory, args.role).items()}
    except (ValueError, KeyError, TypeError) as exc:
        parser.exit(1, f'Preflight failed: {exc}\n')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
