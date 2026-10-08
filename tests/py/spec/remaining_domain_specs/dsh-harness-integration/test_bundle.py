"""Native migration of tests/spec/dsh-harness-integration/bundle.bats."""
import json
import shutil

def test_bundle_patch(repo_root):
    data = json.loads((repo_root / 'tools/dsh/package.json').read_text())
    assert data.get('dsh', {}).get('bundle', {}).get('patch')

def test_patch_cc_hooks(repo_root):
    assert 'cc-hooks' in (repo_root / 'tools/dsh/cordis.patch.yml').read_text()

def test_entry_loads_empty_plugins(repo_root, run_cmd, tmp_path):
    (tmp_path / 'plugins').mkdir()
    entry = tmp_path / 'index.js'
    shutil.copyfile(repo_root / 'tools/dsh/index.js', entry)
    program = f"import({json.dumps(str(entry))}).then(m => console.log('loaded:', m.name)).catch(e => {{console.error(e); process.exit(1)}})"
    res = run_cmd(['node', '--input-type=module', '-e', program], timeout=5)
    res.check(0)
    assert 'loaded' in res.output

def test_no_vendored_harness(repo_root, run_cmd):
    res = run_cmd(['git', 'ls-files', 'deepseek-harness/'])
    assert not res.output

def test_bundle_files(repo_root):
    for name in ['package.json', 'cordis.patch.yml', 'index.js', 'README.md']:
        assert (repo_root / 'tools/dsh' / name).is_file(), name
