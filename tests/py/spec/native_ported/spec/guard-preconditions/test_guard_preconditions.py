"""Native migration of tests/spec/guard-preconditions/guard-preconditions.bats."""
# Self-test for tests/lib/guard-preconditions.sh. All cases run offline: `skip` is stubbed (exit 42),
# kubectl/curl are overridden as shell functions where needed. The production library is sourced

# inside `bash -c` (the BATS original used `load` for the same file).

import datetime
import os
from pathlib import Path

import pytest

SKIP_STUB = 'source "$LIB"\nskip() { echo "SKIP: $1"; exit 42; }\n'


@pytest.fixture
def lib(repo_root):
    return repo_root / "tests" / "lib" / "guard-preconditions.sh"


@pytest.fixture
def sh(run_cmd, lib):
    """Run bash code with the library sourced (no skip stub)."""
    def _run(code):
        return run_cmd(["bash", "-c", 'source "$LIB"\n' + code], env={"LIB": str(lib)})
    return _run


@pytest.fixture
def with_skip_stub(run_cmd, lib):
    """Mirror of _with_skip_stub: library sourced, skip() replaced by a stub that exits 42."""
    def _run(code):
        return run_cmd(["bash", "-c", SKIP_STUB + code + "\n"], env={"LIB": str(lib)})
    return _run


def _mtime(year, month, day):
    return datetime.datetime(year, month, day).timestamp()


def _touch(path: Path, ts: float):
    """Equivalent of `touch -d <date> <file>`: create if missing, then set the mtime."""
    path.touch(exist_ok=True)
    os.utime(path, (ts, ts))


def test_require_command_laesst_vorhandenes_binary_durch(sh):
    res = sh("require_command bash")
    assert res.returncode == 0


def test_require_command_skippt_mit_binary_namen_bei_fehlendem_binary(with_skip_stub):
    res = with_skip_stub('require_command __gibt_es_nicht_4123__ "Test-Probe"')
    assert res.returncode == 42
    assert "__gibt_es_nicht_4123__" in res.output
    assert "Test-Probe" in res.output


def test_port_open_meldet_geschlossenen_loopback_port_als_zu(sh):
    res = sh("port_open 127.0.0.1 9")
    assert res.returncode != 0


def test_require_port_skippt_mit_host_port_bei_geschlossenem_port(with_skip_stub):
    res = with_skip_stub('require_port 127.0.0.1 9 "Test-Listener"')
    assert res.returncode == 42
    assert "127.0.0.1:9" in res.output


def test_http_code_liefert_leer_oder_000_bei_unerreichbarem_ziel(sh):
    res = sh('http_code "http://127.0.0.1:9/nirgends"')
    assert res.returncode == 0
    assert res.stdout.strip() in ("", "000")


def test_require_http_skippt_mit_erwartetem_code_bei_unerreichbarem_ziel(with_skip_stub):
    res = with_skip_stub('require_http "http://127.0.0.1:9/nirgends" 200 "Test-Route"')
    assert res.returncode == 42
    assert "statt '200'" in res.output


def test_require_http_contains_skippt_bei_unerreichbarem_ziel(with_skip_stub):
    res = with_skip_stub('require_http_contains "http://127.0.0.1:9/katalog" "modell-x" "Test-Katalog"')
    assert res.returncode == 42
    assert "Test-Katalog" in res.output


def test_require_http_contains_skippt_mit_nadel_bei_fehlendem_inhalt(with_skip_stub):
    res = with_skip_stub(
        'curl() { echo "{\\"models\\":[]}"; }; '
        'require_http_contains "http://127.0.0.1:9/katalog" "modell-x" "Test-Katalog"'
    )
    assert res.returncode == 42
    assert "modell-x" in res.output


def test_require_http_contains_laesst_vorhandenen_inhalt_durch(with_skip_stub):
    res = with_skip_stub(
        'curl() { echo "{\\"models\\":[\\"modell-x\\"]}"; }; '
        'require_http_contains "http://127.0.0.1:9/katalog" "modell-x" "Test-Katalog"; echo PASS-THROUGH'
    )
    assert res.returncode == 0
    assert "PASS-THROUGH" in res.output


def test_require_k8s_context_skippt_bei_unerreichbarem_cluster(with_skip_stub):
    res = with_skip_stub("kubectl() { return 1; }; require_k8s_context __kontext_4123__")
    assert res.returncode == 42
    assert "__kontext_4123__ not running" in res.output


def test_require_k8s_rollout_laesst_ausgerolltes_deployment_durch(with_skip_stub):
    res = with_skip_stub(
        'kubectl() { echo "1"; return 0; }; '
        "require_k8s_rollout __ctx__ __ns__ deploy __name__ && echo PASS-THROUGH"
    )
    assert res.returncode == 0
    assert "PASS-THROUGH" in res.output


def test_node_modules_fresh_erkennt_frischen_install_module_neuer_als_lockfile(sh, tmp_path):
    d = tmp_path / "nm-fresh"
    (d / "node_modules").mkdir(parents=True)
    _touch(d / "pnpm-lock.yaml", _mtime(2026, 1, 1))
    _touch(d / "package.json", _mtime(2026, 1, 1))
    _touch(d / "node_modules" / ".modules.yaml", _mtime(2026, 6, 1))
    res = sh(f'node_modules_fresh "{d}"')
    assert res.returncode == 0


def test_node_modules_fresh_meldet_veralteten_install_lockfile_neuer(sh, tmp_path):
    d = tmp_path / "nm-stale"
    (d / "node_modules").mkdir(parents=True)
    _touch(d / "pnpm-lock.yaml", _mtime(2026, 6, 1))
    _touch(d / "package.json", _mtime(2026, 6, 1))
    _touch(d / "node_modules" / ".modules.yaml", _mtime(2026, 1, 1))
    res = sh(f'node_modules_fresh "{d}"')
    assert res.returncode == 1


def test_node_modules_fresh_meldet_fehlende_module(sh, tmp_path):
    res = sh(f'node_modules_fresh "{tmp_path / "nm-missing"}"')
    assert res.returncode == 1


def test_require_fresh_node_modules_skippt_mit_pnpm_install_hinweis_bei_skew(with_skip_stub, tmp_path):
    d = tmp_path / "nm-stale-skip"
    (d / "node_modules").mkdir(parents=True)
    _touch(d / "pnpm-lock.yaml", _mtime(2026, 6, 1))
    _touch(d / "package.json", _mtime(2026, 6, 1))
    _touch(d / "node_modules" / ".modules.yaml", _mtime(2026, 1, 1))
    res = with_skip_stub(f"require_fresh_node_modules '{d}'")
    assert res.returncode == 42
    assert "pnpm install" in res.output


def test_require_fresh_node_modules_laesst_frischen_install_durch(with_skip_stub, tmp_path):
    d = tmp_path / "nm-fresh-through"
    (d / "node_modules").mkdir(parents=True)
    _touch(d / "pnpm-lock.yaml", _mtime(2026, 1, 1))
    _touch(d / "package.json", _mtime(2026, 1, 1))
    _touch(d / "node_modules" / ".modules.yaml", _mtime(2026, 6, 1))
    res = with_skip_stub(f"require_fresh_node_modules '{d}' && echo PASS-THROUGH")
    assert res.returncode == 0
    assert "PASS-THROUGH" in res.output


def test_require_k8s_rollout_skippt_mit_readyreplicas_bei_0_1(with_skip_stub):
    res = with_skip_stub(
        'kubectl() { if [[ "$*" == *"readyReplicas"* ]]; then echo "0"; '
        'elif [[ "$*" == *"spec.replicas"* ]]; then echo "1"; fi; return 0; }; '
        "require_k8s_rollout __ctx__ __ns__ deploy __name__"
    )
    assert res.returncode == 42
    assert "deploy/__name__" in res.output
    assert "readyReplicas=0/1" in res.output
