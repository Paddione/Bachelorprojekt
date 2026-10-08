"""Native migration of tests/spec/kv-budget.bats."""
import os

def budget(repo_root, run_cmd, *args):
    script = repo_root / 'scripts/llm/kv-budget.sh'
    assert os.access(script, os.X_OK)
    return run_cmd([str(script), *args])

def test_baseline(repo_root, run_cmd):
    res = budget(repo_root, run_cmd, '--ctx', '65536', '--slots', '1', '--kvu', '--kv-type', 'q4_0', '--mmproj')
    res.check(0)
    for token in ['8672 MiB', 'Konfiguration', 'Gesamt-VRAM', 'Frei']:
        assert token in res.output

def test_three_slots(repo_root, run_cmd):
    res = budget(repo_root, run_cmd, '--ctx', '65536', '--slots', '3', '--no-kvu', '--kv-type', 'q4_0', '--mmproj')
    res.check(0)
    assert '9616 MiB' in res.output

def test_overcommit(repo_root, run_cmd):
    res = budget(repo_root, run_cmd, '--ctx', '200000', '--slots', '6', '--no-kvu', '--kv-type', 'q8_0', '--mmproj')
    res.check(0)
    assert '⚠️ OVERCOMMIT' in res.output

def test_kvu_pool_modes(repo_root, run_cmd):
    for mode in ['--kvu', '--no-kvu']:
        budget(repo_root, run_cmd, '--ctx', '200000', '--slots', '3', mode, '--kv-type', 'q8_0', '--mmproj').check(0)

def test_invalid_type(repo_root, run_cmd):
    budget(repo_root, run_cmd, '--kv-type', 'unsupported').check(1)

def test_max_slots(repo_root, run_cmd):
    res = budget(repo_root, run_cmd, '--ctx', '65536', '--kv-type', 'q4_0', '--mmproj', '--max-slots')
    res.check(0)
    assert 'Max slots:' in res.output

def test_fitt_margin(repo_root, run_cmd):
    res = budget(repo_root, run_cmd, '--ctx', '65536', '--slots', '3', '--no-kvu', '--kv-type', 'q4_0', '--fitt-margin', '2400')
    res.check(0)
    assert 'c_fitt' in res.output
