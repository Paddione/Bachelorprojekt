"""Episode-Validator: Schema + QC-Gates.

Gates:
  - Pydantic-Schema (inkl. Pflicht-Provenance und Split)
  - Keine Secrets in Nachrichten (sk-, AKIA, BEGIN PRIVATE KEY, password=)
  - Dedupe: identische Assistant-Antworten werden abgelehnt
  - dispatcher-Episoden brauchen expected_task; executor brauchen allowed_paths
  - result.status == "succeeded" verlangt mindestens einen erfolgreichen
    Tool-Call in messages (kein erfundener Erfolg)

Usage:
  python validate.py <dir-mit-episoden.json> [--registry registry.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from episodes import Episode  # noqa: E402

SECRET_PATTERNS = ("sk-", "AKIA", "BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY", "password=")


def episode_fingerprint(ep: Episode) -> str:
    # Include prompts, arguments, tool outputs and reasoning, not volatile call IDs.
    messages = []
    for message in ep.messages:
        normalized = {key: value for key, value in message.items()
                      if key not in ('tool_call_id', 'id')}
        if 'tool_calls' in normalized:
            calls = []
            for call in normalized['tool_calls']:
                function = dict(call.get('function', {}))
                arguments = function.get('arguments')
                if isinstance(arguments, str):
                    try:
                        function['arguments'] = json.loads(arguments)
                    except ValueError:
                        pass
                calls.append({'type': call.get('type'), 'function': function})
            normalized['tool_calls'] = calls
        messages.append(normalized)
    canonical = json.dumps({'role': ep.role, 'messages': messages, 'tools': ep.tools},
                           sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def validate_episode(ep: Episode, seen: dict[str, str], registry: set[str] | None) -> list[str]:
    errors = []
    blob = ep.model_dump_json()
    for pattern in SECRET_PATTERNS:
        if pattern.lower() in blob.lower():
            errors.append(f'possible secret ({pattern!r})')
    import re
    if re.search(r'(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s\"]+|gh[pousr]_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', blob):
        errors.append('possible token')
    fp = episode_fingerprint(ep)
    if fp in seen:
        errors.append(f'duplicate of {seen[fp]}')
    else:
        seen[fp] = ep.episode_id
    if ep.role == 'dispatcher' and not ep.expected_task:
        errors.append('dispatcher without expected_task')
    if ep.role == 'executor' and ep.allowed_paths is None:
        errors.append('executor without allowed_paths')
    if not ep.provenance.generator or not ep.provenance.tool_schema_version:
        errors.append('empty provenance')
    pending = {}
    completed = set()
    successful = []
    observed_calls = []
    for message in ep.messages:
        role = message.get('role')
        if role not in ('system', 'user', 'assistant', 'tool'):
            errors.append('invalid message role')
        if role == 'assistant':
            for call in message.get('tool_calls', []):
                call_id, function = call.get('id'), call.get('function', {})
                arguments = function.get('arguments')
                try:
                    parsed = json.loads(arguments) if isinstance(arguments, str) else arguments
                    if not call_id or call_id in pending or call_id in completed:
                        raise ValueError('missing/duplicate call id')
                    if not function.get('name') or not isinstance(parsed, dict):
                        raise ValueError('invalid function/arguments')
                    pending[call_id] = function['name']
                    observed_calls.append({'name': function['name'], 'arguments': parsed})
                except (ValueError, TypeError):
                    errors.append('malformed assistant tool call')
        elif message.get('tool_calls'):
            errors.append('tool calls belong to assistant')
        if role == 'tool':
            call_id = message.get('tool_call_id')
            name = pending.pop(call_id, None)
            if not name:
                errors.append('unmatched/duplicate tool result')
            completed.add(call_id)
            if not isinstance(message.get('content'), str):
                errors.append('tool result content must be text')
            if message.get('status') == 'succeeded':
                exit_code = message.get('exit_code')
                if exit_code not in (None, 0):
                    errors.append('successful tool has nonzero exit')
                elif name == 'bash' and exit_code is None:
                    errors.append('bash success needs actual exit code')
                else:
                    successful.append(call_id)
    if ep.role == 'executor':
        root = Path(ep.provenance.source_worktree) if ep.provenance.source_worktree else None
        allowed = set(ep.allowed_paths or [])
        for call in observed_calls:
            for key in ('path', 'file', 'filePath'):
                value = call['arguments'].get(key)
                if not isinstance(value, str):
                    continue
                candidate = Path(value)
                if root:
                    try:
                        value = str((root / candidate).resolve().relative_to(root.resolve()))
                    except ValueError:
                        errors.append('executor path outside worktree')
                        continue
                elif candidate.is_absolute() or '..' in candidate.parts:
                    errors.append('executor path requires worktree provenance or is unsafe')
                    continue
                if value not in allowed:
                    errors.append(f'executor disallowed path: {value}')
    if pending:
        errors.append('tool call without result')
    if ep.tool_calls and observed_calls != [tc.model_dump() for tc in ep.tool_calls]:
        errors.append('tool call summary disagrees with transcript')
    if ep.result and ep.result.status == 'succeeded':
        if not successful or not ep.provenance.executed:
            errors.append('succeeded without successful executed tool evidence')
        if ep.result.exit_code not in (None, 0):
            errors.append('succeeded with nonzero process exit')
        if any(m.get('status') == 'failed' for m in ep.messages if m.get('role') == 'tool'):
            errors.append('succeeded contains unreviewed failed tool evidence')
    # Dispatcher uses task IDs; executor uses OpenCode tools and is not registry checked.
    if registry is not None and ep.role == 'dispatcher':
        if ep.expected_task not in registry:
            errors.append(f'unknown expected task {ep.expected_task!r}')
        if ep.selected_task and ep.selected_task not in registry:
            errors.append(f'unknown selected task {ep.selected_task!r}')
    return errors


def validate_file(path: Path, seen: dict[str, str], registry: set[str] | None) -> list[str]:
    try:
        ep = Episode.model_validate_json(path.read_text(encoding='utf-8'))
    except Exception as exc:
        return [f'{path.name}: SCHEMA ERROR: {exc}']
    return [f'{path.name}: {error}' for error in validate_episode(ep, seen, registry)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("episodes_dir", type=Path)
    ap.add_argument("--registry", type=Path, default=None, help="registry.json fuer Task-Namen")
    args = ap.parse_args()

    registry: set[str] | None = None
    if args.registry and args.registry.exists():
        reg = json.loads(args.registry.read_text(encoding="utf-8"))
        registry = {e["task_id"] for e in reg["tasks"]}

    seen: dict[str, str] = {}
    all_errors: list[str] = []
    files = sorted(args.episodes_dir.glob("*.json"))
    if not files:
        print(f"keine Episoden in {args.episodes_dir}")
        return 1
    for f in files:
        all_errors.extend(validate_file(f, seen, registry))

    n = len(files)
    bad = len({e.split(":")[0] for e in all_errors})
    print(f"{n} Episoden geprueft, {n - bad} gueltig, {len(all_errors)} Fehler")
    for e in all_errors[:20]:
        print(" ", e)
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main())
