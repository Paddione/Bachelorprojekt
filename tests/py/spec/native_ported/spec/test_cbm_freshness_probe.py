"""Native migration of tests/spec/cbm-freshness-probe.bats."""
import shutil
from pathlib import Path

import pytest

# Ticket: T900993 task A1 — freshness probe must read `cli --json` envelopes.
# Network-free: pure envelope helpers are exercised via `python3 -c` imports.

WRAPPER = r"""
import importlib.util, sys
spec = importlib.util.spec_from_file_location('cbm_freshness', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
{snippet}
"""


@pytest.fixture
def fresh_py(run_cmd, repo_root):
    """Run a python snippet with the freshness module loaded as `m` (BATS fresh_py helper)."""
    script = str(repo_root / "scripts" / "mcp" / "cbm-freshness.py")

    def _run(snippet: str):
        code = WRAPPER.replace("{snippet}", snippet)
        return run_cmd(["python3", "-c", code, script])

    return _run


def test_detect_changes_envelope_unwraps_to_plain_text_payload(fresh_py):
    r = fresh_py(r"""
import json
inner = 'base: main\nmerge_base: 1dae9ccf91b1b31e989d293ec5f134c81a61f782\ndirection: inbound\nchanged_files: 2\n  ml/qwen35-training/\n  ml/qwen35_pipe_2026_10_04/\n'
env = {'content': [{'type': 'text', 'text': inner}], 'isError': False}
assert m.envelope_text(env) == inner
payload, raw, err = m.parse_probe_payload(env, False)
assert err is None, err
assert raw == inner, raw
assert payload['text'] == inner
assert payload['base'] == 'main', payload
assert payload['changed_files'] == 2, payload
""")
    assert r.returncode == 0, r.output


def test_index_status_envelope_inner_json_parses_to_dict_with_project_and_nodes(fresh_py):
    r = fresh_py(r"""
import json
inner = json.dumps({'project': 'home-patrick-Bachelorprojekt', 'nodes': 52349, 'edges': 1, 'status': 'ready', 'root_path': '/tmp/repo'})
env = {'content': [{'type': 'text', 'text': inner}], 'isError': False}
assert m.envelope_text(env) == inner
payload, raw, err = m.parse_probe_payload(env, True)
assert err is None, err
assert isinstance(payload, dict), payload
assert payload['project'] == 'home-patrick-Bachelorprojekt'
assert payload['nodes'] == 52349
proj, root = m.graph_identity(payload)
assert proj == 'home-patrick-Bachelorprojekt', proj
""")
    assert r.returncode == 0, r.output


def test_malformed_envelopes_fail_closed_as_probe_malformed_error_envelopes_as_tool_error(fresh_py):
    r = fresh_py(r"""
import json
_, _, e1 = m.parse_probe_payload({'isError': False}, True)
assert e1 == 'probe-malformed', e1
_, _, e2 = m.parse_probe_payload({'content': [{'type': 'image'}]}, True)
assert e2 == 'probe-malformed', e2
env3 = {'content': [{'type': 'text', 'text': 'base: main\n'}], 'isError': False}
_, _, e3 = m.parse_probe_payload(env3, True)
assert e3 == 'probe-malformed', e3
env4 = {'content': [{'type': 'text', 'text': '   '}], 'isError': False}
_, _, e4 = m.parse_probe_payload(env4, False)
assert e4 == 'probe-malformed', e4
env5 = {'content': [{'type': 'text', 'text': 'boom'}], 'isError': True}
_, _, e5 = m.parse_probe_payload(env5, True)
assert e5 == 'tool-error', e5
env6 = {'content': [{'type': 'text', 'text': json.dumps({'error': 'boom'})}], 'isError': False}
_, _, e6 = m.parse_probe_payload(env6, True)
assert e6 == 'tool-error', e6
""")
    assert r.returncode == 0, r.output


# Ticket T901558 — tool 0.11.0 changed probe defaults: index_status renders
# tree text unless --format json is passed, and detect_changes assumes
# base_branch=main. Both must be pinned or freshness fails closed forever.


def test_index_status_cmd_requests_json_format(fresh_py):
    r = fresh_py(r"""
cmd = m.index_status_cmd('home-patrick')
assert cmd[:5] == ['codebase-memory-mcp', 'cli', '--json', 'index_status', '--project'], cmd
assert cmd[5] == 'home-patrick', cmd
assert '--format' in cmd and cmd[cmd.index('--format') + 1] == 'json', cmd
""")
    assert r.returncode == 0, r.output


def test_detect_changes_cmd_pins_given_base_branch(fresh_py):
    r = fresh_py(r"""
cmd = m.detect_changes_cmd('home-patrick', 'master')
assert cmd[:5] == ['codebase-memory-mcp', 'cli', '--json', 'detect_changes', '--project'], cmd
assert '--base-branch' in cmd and cmd[cmd.index('--base-branch') + 1] == 'master', cmd
""")
    assert r.returncode == 0, r.output


@pytest.mark.skipif(shutil.which("git") is None, reason="git binary not installed")
def test_default_base_branch_prefers_origin_head_then_main_master(fresh_py):
    r = fresh_py(r"""
import os, subprocess, tempfile
def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True)
with tempfile.TemporaryDirectory() as td:
    r1 = os.path.join(td, 'r1'); os.mkdir(r1)
    git(r1, 'init', '-b', 'dev', '-q')
    git(r1, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x')
    git(r1, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/released')
    assert m.default_base_branch(r1) == 'released', m.default_base_branch(r1)
    r2 = os.path.join(td, 'r2'); os.mkdir(r2)
    git(r2, 'init', '-b', 'dev', '-q')
    git(r2, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x')
    git(r2, 'branch', 'main'); git(r2, 'branch', 'master')
    assert m.default_base_branch(r2) == 'main', m.default_base_branch(r2)
    git(r2, 'branch', '-D', 'main')
    assert m.default_base_branch(r2) == 'master', m.default_base_branch(r2)
    git(r2, 'branch', '-D', 'master')
    assert m.default_base_branch(r2) == 'main', m.default_base_branch(r2)
    assert m.default_base_branch(os.path.join(td, 'nope')) == 'main'
""")
    assert r.returncode == 0, r.output
