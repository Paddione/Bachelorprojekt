"""Capture actual OpenCode --format json events or import agent-bench recorder traces.

The caller explicitly chooses an isolated worktree and teacher model. Capture is
not a sandbox: configure OpenCode permissions before running untrusted scenarios.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'schema'))
from episodes import Episode, Provenance, Result, ToolCall
from pipeline.scenarios import Scenario


def normalize(events, prompt):
    messages = [{'role': 'user', 'content': prompt}]
    calls = []
    sessions = set()
    finished = False
    reasoning = ""
    for event in events:
        if not isinstance(event, dict):
            raise ValueError('event must be an object')
        if event.get('sessionID'):
            sessions.add(event['sessionID'])
        kind = event.get('type')
        part = event.get('part', {})
        if kind == 'reasoning':
            if not isinstance(part.get('text'), str):
                raise ValueError('reasoning event missing text')
            reasoning += part['text']
        elif kind == 'text':
            if not isinstance(part.get('text'), str):
                raise ValueError('text event missing text')
            message = {'role': 'assistant', 'content': part['text']}
            if reasoning:
                message['reasoning_content'] = reasoning
                reasoning = ''
            messages.append(message)
        elif kind == 'tool_use':
            state = part.get('state', {})
            status = state.get('status')
            if status not in ('completed', 'error'):
                raise ValueError('unfinished tool event')
            name, call_id = part.get('tool'), part.get('callID')
            arguments = state.get('input')
            if not name or not call_id or not isinstance(arguments, dict):
                raise ValueError('tool event missing name, id or input')
            if status == 'completed' and 'output' not in state:
                raise ValueError('completed tool lacks output')
            content = state.get('output') if status == 'completed' else state.get('error')
            if not isinstance(content, str):
                raise ValueError('tool output/error must be text')
            assistant = {'role': 'assistant', 'content': '', 'tool_calls': [
                {'id': call_id, 'type': 'function', 'function': {
                    'name': name, 'arguments': json.dumps(arguments, sort_keys=True)}}]}
            if reasoning:
                assistant['reasoning_content'] = reasoning
                reasoning = ''
            messages.append(assistant)
            metadata = state.get('metadata', {})
            exit_code = metadata.get('exit')
            # OpenCode bash may report a completed invocation with nonzero shell exit.
            outcome = ('failed' if status == 'error' or (exit_code is not None and exit_code != 0)
                       else 'unknown' if name == 'bash' and exit_code is None else 'succeeded')
            messages.append({'role': 'tool', 'tool_call_id': call_id, 'name': name,
                             'content': content, 'status': outcome, 'exit_code': exit_code})
            calls.append(ToolCall(name=name, arguments=arguments))
        elif kind == 'step_finish':
            finished = part.get('reason') == 'stop'
        elif kind == 'error':
            raise ValueError(f'teacher error: {event.get("error", "unspecified")}')
        elif kind not in ('step_start', 'reasoning'):
            raise ValueError(f'unsupported event type: {kind}')
    if reasoning:
        raise ValueError('reasoning lacks subsequent assistant text/tool call')
    if len(sessions) != 1:
        raise ValueError('capture must contain exactly one teacher session')
    if not finished:
        raise ValueError('teacher did not finish with stop')
    return messages, calls, next(iter(sessions))


def from_events(scenario, events, *, teacher_model, raw_sha256, process_exit=None, reviewed=False):
    messages, calls, session = normalize(events, scenario.prompt)
    tools = [m for m in messages if m['role'] == 'tool']
    status = 'failed' if process_exit not in (None, 0) or any(m['status'] == 'failed' for m in tools) else 'succeeded'
    unknown = process_exit in (None, 0) and (not tools or any(m['status'] == 'unknown' for m in tools))
    decision = {}
    if scenario.role in ('dispatcher', 'planner', 'orchestrator'):
        text = ''.join(m.get('content', '') for m in messages if m['role'] == 'assistant' and not m.get('tool_calls')).strip()
        if text.startswith('```') and text.endswith('```'):
            text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        try:
            decision = json.loads(text)
            if not isinstance(decision, dict):
                decision = {}
        except ValueError:
            pass
    identity = hashlib.sha256(f'{scenario.scenario_id}:{raw_sha256}'.encode()).hexdigest()[:24]
    return Episode(
        episode_id=identity, role=scenario.role, scenario_id=scenario.family,
        scenario_version=scenario.version, base_model=scenario.base_model,
        messages=messages, tool_calls=calls, tools=scenario.tools,
        result=None if unknown else Result(status=status, exit_code=process_exit,
                      summary='Capture status derived from process exit and actual tool events; acceptance requires review.'),
        expected_task=scenario.expected_task, expected_arguments=scenario.expected_arguments,
        allowed_paths=scenario.allowed_paths, expected_plan=scenario.plan,
        scenario_variant=scenario.scenario_id,
        selected_task=decision.get('selected_task') if scenario.role == 'dispatcher' else None,
        selected_arguments=decision.get('selected_arguments') if scenario.role == 'dispatcher' else None,
        plan=decision if decision.get('steps') and scenario.role != 'dispatcher' else None,
        acceptance_criteria=scenario.acceptance_criteria,
        provenance=Provenance(generator=f'opencode:{teacher_model}', source_session=session,
                              reviewed=reviewed, split_assigned=False, tool_schema_version='opencode-json-v1',
                              scenario_version=scenario.version, raw_sha256=raw_sha256),
        split='train',
    )


def from_recorder(scenario, records, *, reviewed=False):
    """Reuse agent-bench's final full request + response, retaining its tool schemas."""
    if not records:
        raise ValueError('empty recorder trace')
    last = records[-1]
    if any(record.get('redactions', 0) for record in records):
        raise ValueError('redacted recorder trace requires explicit source repair')
    request, response = last['request'], last['response']
    if response.get('finish_reason') != 'stop':
        raise ValueError('recorder trace is incomplete')
    messages = request['messages'] + [response['message']]
    raw_sha = hashlib.sha256(json.dumps(records, sort_keys=True).encode()).hexdigest()
    # Recorder tool content contains no authoritative normalized outcome. Never
    # infer success from a process exit or assistant prose; reviewer supplies result.
    return Episode(
        episode_id=raw_sha[:24], role=scenario.role, scenario_id=scenario.family,
        scenario_version=scenario.version, base_model=scenario.base_model,
        messages=messages, tools=request.get('tools') or [],
        expected_task=scenario.expected_task, expected_arguments=scenario.expected_arguments,
        allowed_paths=scenario.allowed_paths, expected_plan=scenario.plan,
        scenario_variant=scenario.scenario_id,
        acceptance_criteria=scenario.acceptance_criteria,
        provenance=Provenance(generator=f'agent-bench:{request.get("model")}',
                              source_session=f'trace:{raw_sha}', reviewed=reviewed, split_assigned=False,
                              tool_schema_version='openai-chat-v1', scenario_version=scenario.version,
                              raw_sha256=raw_sha), split='train',
    )


def run_teacher(command, directory, timeout):
    """Bounded subprocess capture; failed processes retain original stdout/stderr."""
    import signal
    started = datetime.now(timezone.utc).isoformat()
    try:
        process = subprocess.Popen(command, cwd=directory, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, start_new_session=True)
    except OSError as exc:
        return {'command': command, 'worktree': str(directory), 'started': started,
                'finished': datetime.now(timezone.utc).isoformat(), 'exit_code': None,
                'timed_out': False, 'stdout': '', 'stderr': str(exc), 'launch_error': True}
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate()
    return {'command': command, 'worktree': str(directory), 'started': started,
            'finished': datetime.now(timezone.utc).isoformat(), 'exit_code': process.returncode,
            'timed_out': timed_out, 'stdout': stdout.decode('utf-8', errors='replace'),
            'stderr': stderr.decode('utf-8', errors='replace')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scenario', type=Path)
    parser.add_argument('output', type=Path, help='new run directory')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--events', type=Path)
    source.add_argument('--recorder', type=Path)
    source.add_argument('--run', action='store_true')
    parser.add_argument('--worktree', type=Path)
    parser.add_argument('--teacher-model')
    parser.add_argument('--source-split', choices=['train', 'val', 'test'], help='required for imported traces; preserve evaluation membership')
    parser.add_argument('--agent', default='build')
    parser.add_argument('--executable', default='opencode')
    parser.add_argument('--timeout', type=float, default=120)
    args = parser.parse_args()
    scenario = Scenario.model_validate_json(args.scenario.read_text())
    if not args.run and not args.source_split:
        parser.error('import requires --source-split to preserve evaluation membership')
    if args.output.exists():
        parser.error('output already exists')
    if args.run and (not args.worktree or not args.teacher_model):
        parser.error('--run requires --worktree and --teacher-model')
    if args.run and not (args.worktree.resolve() / '.git').is_file():
        parser.error('teacher directory must be a Git worktree (.git file)')
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    args.output.mkdir(parents=True)
    if args.run:
        directory = args.worktree.resolve()
        if not (directory / '.git').is_file():
            parser.error('teacher directory must be a Git worktree (.git file)')
        teacher_dir = str(directory)
        resolved = subprocess.run(['which', args.executable], capture_output=True, text=True).stdout.strip()
        if os.environ.get('WSL_DISTRO_NAME') and resolved.startswith('/mnt/c/'):
            teacher_dir = subprocess.check_output(['wslpath', '-w', str(directory)], text=True).strip()
        command = [args.executable, 'run', '--format', 'json', '--dir', teacher_dir,
                   '--model', args.teacher_model, '--agent', args.agent, scenario.prompt]
        record = run_teacher(command, directory, args.timeout)
        (args.output / 'run.json').write_text(json.dumps(record, indent=2))
        raw = record['stdout']
    else:
        raw = (args.events or args.recorder).read_text()
        record = {'exit_code': None, 'timed_out': False}
    (args.output / 'source.jsonl').write_text(raw)
    (args.output / 'scenario.json').write_text(scenario.model_dump_json(indent=2))
    try:
        if record.get('launch_error'):
            raise ValueError('teacher executable could not be launched; original error retained')
        if record['timed_out']:
            raise ValueError('teacher timed out; raw run retained, no training episode emitted')
        records = [json.loads(line) for line in raw.splitlines() if line.strip()]
        episode = (from_recorder(scenario, records) if args.recorder else
                   from_events(scenario, records, teacher_model=args.teacher_model or 'imported',
                               raw_sha256=hashlib.sha256(raw.encode()).hexdigest(),
                               process_exit=record['exit_code']))
        if args.source_split:
            episode.split = args.source_split
            episode.provenance.split_assigned = True
        if args.run:
            episode.provenance.source_worktree = str(directory)
        (args.output / 'episode.json').write_text(episode.model_dump_json(indent=2))
    except (ValueError, KeyError, TypeError) as exc:
        (args.output / 'rejected.json').write_text(json.dumps({'reason': str(exc)}))
        raise SystemExit(f'Capture rejected; raw evidence retained: {exc}')


if __name__ == '__main__':
    main()
