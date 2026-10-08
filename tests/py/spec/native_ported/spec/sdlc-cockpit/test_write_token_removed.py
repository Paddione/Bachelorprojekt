"""Native migration of tests/spec/sdlc-cockpit/write-token-removed.bats."""
# (K4, T002463)
# Evaluates .lavish/kit/adapter.js in a node sandbox with window/document/fetch stubs and reports the
# typeof of the data API members.

import pytest

DUMP_JS = r"""
const fs = require('node:fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const noop = () => {};
const win = {};
const document = { addEventListener: noop, hidden: false };
const location = { protocol: 'file:', port: '39152' };
const fetch = async () => ({ ok: true, json: async () => ({}) });
global.window = win;
global.document = document;
global.location = location;
global.fetch = fetch;
global.EventSource = function () {};
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'location', 'fetch', 'EventSource', src)(win, document, location, fetch, EventSource);
console.log('ticketAction=' + typeof win.data.ticketAction);
console.log('agentAction=' + typeof win.data.agentAction);
console.log('getToken=' + typeof win.data.getToken);
"""


@pytest.fixture
def dump(repo_root, run_cmd, tmp_path):
    script = tmp_path / "dump-api.cjs"
    script.write_text(DUMP_JS, encoding="utf-8")
    result = run_cmd(["node", str(script), str(repo_root / ".lavish/kit/adapter.js")])
    return result.output.splitlines()


def test_k4_positiv_anchor_ticket_action_ist_eine_funktion(dump):
    assert "ticketAction=function" in dump


def test_k4_agent_action_ist_entfernt_undefined(dump):
    assert "agentAction=undefined" in dump


def test_k4_get_token_ist_entfernt_undefined(dump):
    assert "getToken=undefined" in dump
