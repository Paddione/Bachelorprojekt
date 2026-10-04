#!/usr/bin/env bats
# tests/spec/cbm-freshness-probe.bats
# Ticket: T900993 task A1 — freshness probe must read `cli --json` envelopes.
#
# Contract (RED gate):
#   (a) detect_changes --json envelope unwraps to its plain-text payload
#       (non-empty text = success; base/changed_files structured when present)
#   (b) index_status --json envelope inner text parses to a dict carrying
#       project/nodes, suitable for graph_identity()
#   (c) malformed envelopes fail closed as probe-malformed (never success);
#       error envelopes fail closed as tool-error
#
# Network-free: pure envelope helpers are exercised via `python3 -c` imports.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FRESH_PY="$REPO_ROOT/scripts/mcp/cbm-freshness.py"
}

# Runs a python snippet with the freshness module loaded as `m`.
fresh_py() {
  python3 -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('cbm_freshness', sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
$1
" "$FRESH_PY" "${@:2}"
}

@test "detect_changes envelope unwraps to plain-text payload (non-empty text is success)" {
  run fresh_py "
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
"
  [ "$status" -eq 0 ]
}

@test "index_status envelope inner JSON parses to dict with project and nodes" {
  run fresh_py "
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
"
  [ "$status" -eq 0 ]
}

@test "malformed envelopes fail closed as probe-malformed, error envelopes as tool-error" {
  run fresh_py "
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
"
  [ "$status" -eq 0 ]
}
