"""Native migration of tests/spec/sdlc-cockpit/endpoint-host-map.bats."""
# (K4, T002463)
# Misst die Endpunkt-Karte im Lauf: node laedt adapter.js mit document/window/fetch-Attrappe.

DUMP_JS = r"""
const fs = require('node:fs');
const path = require('node:path');
const adapterPath = process.argv[2];
const src = fs.readFileSync(adapterPath, 'utf8');

const noop = () => {};
const win = {};
const document = { addEventListener: noop, hidden: false };
const location = { protocol: 'http:', port: '' }; // Admin-Kontext (eigene Origin)
const fetch = async () => ({ ok: true, json: async () => ({}) });
global.window = win;
global.document = document;
global.location = location;
global.fetch = fetch;
global.EventSource = function () {};

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'location', 'fetch', 'EventSource', src)(win, document, location, fetch, EventSource);

const keys = ['portfolio', 'pods-list', 'ticket-status', 'audit',
  'epics', 'styles', 'ci', 'agents', 'models'];
for (const key of keys) {
  const r = win.data.resolveEndpoint(key);
  if (!r.available) {
    console.log(`${key} unavailable`);
  } else {
    console.log(`${key} ${r.host}`);
  }
}
"""


def _dump(repo_root, run_cmd, tmp_path):
    script = tmp_path / "dump-map.cjs"
    script.write_text(DUMP_JS, encoding="utf-8")
    return run_cmd(["node", str(script), str(repo_root / ".lavish/kit/adapter.js")])


def _lines_starting(output, prefix):
    return [line for line in output.splitlines() if line.startswith(prefix)]


def test_k4_portfolio_loest_im_admin_kontext_auf_die_eigene_origin_auf(repo_root, run_cmd, tmp_path):
    output = _dump(repo_root, run_cmd, tmp_path).output
    assert sum(1 for line in _lines_starting(output, "portfolio ") if line == "portfolio ") == 1


def test_k4_agents_und_models_melden_im_admin_kontext_nicht_verfuegbar(repo_root, run_cmd, tmp_path):
    output = _dump(repo_root, run_cmd, tmp_path).output
    assert sum(1 for line in _lines_starting(output, "agents ") if "unavailable" in line) == 1
    assert sum(1 for line in _lines_starting(output, "models ") if "unavailable" in line) == 1


def test_k4_website_gestuetzte_endpunkte_sind_im_admin_kontext_verfuegbar(repo_root, run_cmd, tmp_path):
    output = _dump(repo_root, run_cmd, tmp_path).output
    for key in ["portfolio", "pods-list", "ticket-status", "audit"]:
        unavailable = sum(1 for line in _lines_starting(output, f"{key} ") if "unavailable" in line)
        assert unavailable == 0, f"{key} sollte im Admin-Kontext verfuegbar sein"
