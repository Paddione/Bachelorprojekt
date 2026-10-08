"""Native migration of tests/spec/local-llm-proxy/loadout-enabled-flag.bats."""

# [T003204]

import subprocess

PARSE_JS = """
    import { parseLoadouts } from 'REPO/scripts/llm-proxy/loadouts.mjs';
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try { parseLoadouts(raw); process.exit(0); }
      catch (e) { console.error(e.message); process.exit(1); }
    });
"""

IS_ENABLED_JS = """
    import { parseLoadouts, isLoadoutEnabled, findLoadout } from 'REPO/scripts/llm-proxy/loadouts.mjs';
    const doc = parseLoadouts(process.env.FIXTURE);
    process.stdout.write(String(isLoadoutEnabled(findLoadout(doc, 'probe-loadout'))));
"""


def _fixture(extra: str = "") -> str:
    """Mirror of the BATS _fixture heredoc: extra is spliced in after fit."""
    comma = "," if extra else ""
    return (
        "{\n"
        '  "version": 1,\n'
        '  "modelRoots": ["~/models/gguf"],\n'
        '  "defaults": { "host": "0.0.0.0" },\n'
        '  "loadouts": [{\n'
        '    "slug": "probe-loadout",\n'
        '    "label": "Probe",\n'
        '    "model": "probe/probe.gguf",\n'
        '    "port": 8099,\n'
        '    "fit": { "enabled": true, "targetMarginMib": 2400, "minCtx": 32768 }' + comma + "\n"
        "    " + extra + "\n"
        "  }]\n"
        "}\n"
    )


def _parse(run_cmd, repo_root, doc):
    js = PARSE_JS.replace("REPO", str(repo_root))
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", js], input=doc, cwd=str(repo_root),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60,
    )
    return proc


def test_loadout_enabled_flag_parse_loadouts_akzeptiert_ein_loadout_mit_enabled_false(run_cmd, repo_root):
    assert _parse(run_cmd, repo_root, _fixture("")).returncode == 0
    assert _parse(run_cmd, repo_root, _fixture('"enabled": false')).returncode == 0


def test_loadout_enabled_flag_is_loadout_enabled_liefert_false_fuer_ein_abgeschaltetes_loadout(run_cmd, repo_root):
    assert _parse(run_cmd, repo_root, _fixture("")).returncode == 0
    res = run_cmd(
        ["node", "--input-type=module", "-e", IS_ENABLED_JS.replace("REPO", str(repo_root))],
        cwd=repo_root, env={"FIXTURE": _fixture('"enabled": false')},
    )
    assert res.returncode == 0, res.output
    assert res.output == "false"


def test_loadout_enabled_flag_fehlendes_enabled_bedeutet_aktiv_rueckwaertskompatibilitaet(run_cmd, repo_root):
    res = run_cmd(
        ["node", "--input-type=module", "-e", IS_ENABLED_JS.replace("REPO", str(repo_root))],
        cwd=repo_root, env={"FIXTURE": _fixture("")},
    )
    assert res.returncode == 0, res.output
    assert res.output == "true"


def test_loadout_enabled_flag_enabled_als_string_laesst_parse_loadouts_scheitern(run_cmd, repo_root):
    assert _parse(run_cmd, repo_root, _fixture('"enabled": true')).returncode == 0
    assert _parse(run_cmd, repo_root, _fixture('"enabled": "false"')).returncode != 0
