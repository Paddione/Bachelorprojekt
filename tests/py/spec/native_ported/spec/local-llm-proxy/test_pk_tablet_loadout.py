"""PK-Tablet als Inferenz-Endpoint: Geraete-Loadout, Render-Stufe und Apply-Dry-Run.

Geprueft wird die Ausgabe von render.mjs und apply.sh --dry-run, nicht deren
Quelltext (T002448-M4).
"""
import json
import os
import re
import shutil

import pytest

LOADOUTS = 'devmesh/pk-tablet/loadouts.json'
RENDER = 'scripts/llm/pk-tablet/render.mjs'
APPLY = 'scripts/llm/pk-tablet/apply.sh'
EMBED_MODEL = '/var/lib/llama/models/unsloth/embeddinggemma-300m-GGUF/embeddinggemma-300M-Q8_0.gguf'
# 27-GB-Optane-Teil: OS + Reserve abgezogen bleiben fuer Modelle hoechstens ~20 GiB.
MODEL_BUDGET_BYTES = 20 * 1024**3

pytestmark = pytest.mark.skipif(shutil.which('node') is None, reason='node binary not installed')


@pytest.fixture
def render(repo_root, run_cmd, tmp_path):
    def _render(*args):
        out = tmp_path / 'out'
        result = run_cmd(['node', str(repo_root / RENDER), '--out', str(out), *args])
        return result, out
    return _render


def test_geraete_loadout_ist_kanonisch(repo_root, run_cmd):
    run_cmd(['node', 'scripts/llm/loadouts-format.mjs', '--check', LOADOUTS]).check()


def test_render_schreibt_argv_je_aktivem_loadout(render):
    result, out = render()
    result.check()
    # Rerank-Loadout entfernt 2026-10-26 (23,7 s je Suche auf dem Tablet, kein Qualitaetsgewinn).
    assert (out / 'enabled.list').read_text().split() == ['gemma-embed']
    argv = (out / 'gemma-embed.argv').read_text().splitlines()
    assert argv[argv.index('-m') + 1] == EMBED_MODEL
    assert argv[argv.index('--port') + 1] == '8081'
    assert '--embeddings' in argv
    assert not (out / 'bge-rerank.argv').exists()


def test_models_list_hat_sha_und_url(render):
    result, out = render()
    result.check()
    rows = [l.split() for l in (out / 'models.list').read_text().splitlines() if l.strip()]
    assert len(rows) == 1
    for rel, sha, url, size in rows:
        assert int(size) > 0, rel
        assert re.fullmatch(r'[0-9a-f]{64}', sha), rel
        assert url.startswith('https://huggingface.co/'), rel
    assert sum(int(r[3]) for r in rows) < MODEL_BUDGET_BYTES


def test_deaktiviertes_loadout_faellt_raus(repo_root, render, tmp_path):
    doc = json.loads((repo_root / LOADOUTS).read_text())
    extra = dict(doc['loadouts'][0], slug='gemma-embed-2', port=8082)
    doc['loadouts'].append(dict(extra, enabled=False))
    copy = tmp_path / 'loadouts.json'
    copy.write_text(json.dumps(doc))
    result, out = render('--loadouts', str(copy))
    result.check()
    assert (out / 'gemma-embed.argv').exists()
    assert not (out / 'gemma-embed-2.argv').exists()
    assert (out / 'ports.list').read_text().split() == ['gemma-embed', '8081']


def test_render_fehlende_modellquelle_bricht_ab(render, tmp_path):
    empty = tmp_path / 'models.json'
    empty.write_text('{}')
    result, _ = render('--models', str(empty))
    assert result.returncode != 0
    # Abbruch beim ersten aktiven Slug (sortiert) — welcher Modellpfad, ist egal.
    assert 'keine Quelle' in result.output
    assert re.search(r'\S+\.gguf', result.output)


def test_apply_dry_run_ohne_ssh(repo_root, run_cmd, tmp_path):
    # PATH ohne ssh/scp: ein Dry-Run, der doch eine Verbindung versucht, faellt hier auf.
    bindir = tmp_path / 'bin'
    bindir.mkdir()
    for tool in ('node', 'bash', 'env', 'mktemp', 'rm', 'cat', 'dirname', 'sort', 'awk', 'tr'):
        found = shutil.which(tool)
        if found:
            os.symlink(found, bindir / tool)
    result = run_cmd(['bash', str(repo_root / APPLY), '--dry-run'], env={'PATH': str(bindir)})
    result.check()
    assert 'unit enable gemma-embed port 8081' in result.output
    assert 'bge-rerank' not in result.output


def _dry_run_env(tmp_path):
    # PATH ohne ssh/scp: ein Dry-Run, der doch eine Verbindung versucht, faellt auf.
    bindir = tmp_path / 'bin'
    bindir.mkdir(exist_ok=True)
    for tool in ('node', 'bash', 'env', 'mktemp', 'rm', 'cat', 'dirname', 'sort', 'awk', 'tr'):
        found = shutil.which(tool)
        if found and not (bindir / tool).exists():
            os.symlink(found, bindir / tool)
    return {'PATH': str(bindir)}


def test_apply_dry_run_oeffnet_ports_nur_auf_tailscale(repo_root, run_cmd, tmp_path):
    result = run_cmd(['bash', str(repo_root / APPLY), '--dry-run'], env=_dry_run_env(tmp_path))
    result.check()
    assert 'ufw allow 8081 on tailscale0' in result.output
    assert 'ufw allow 8080' not in result.output
    # ADR-014: kein WireGuard mehr
    assert 'wg0' not in result.output


def test_apply_bootstrap_braucht_kein_wireguard(repo_root, run_cmd, tmp_path):
    result = run_cmd(['bash', str(repo_root / APPLY), '--bootstrap', '--dry-run'], env=_dry_run_env(tmp_path))
    result.check()
    assert 'tailscale up --hostname pk-tablet-linux' in result.output
    assert 'wg' not in result.output.lower()
