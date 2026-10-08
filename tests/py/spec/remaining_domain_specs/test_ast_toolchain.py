"""Native migration of tests/spec/ast-toolchain.bats."""
import re
import yaml

def test_rule_directories(repo_root):
    config = yaml.safe_load((repo_root / 'sgconfig.yml').read_text())
    dirs = config.get('ruleDirs') or []
    assert dirs
    assert all((repo_root / directory).is_dir() for directory in dirs)

def test_rule_documents(repo_root):
    files = list((repo_root / 'ast-rules').glob('*.yml'))
    assert files
    for path in files:
        doc = yaml.safe_load(path.read_text())
        for key in ['id', 'language', 'rule']:
            assert key in doc, (path, key)

def test_pinned_ast_task(repo_root):
    text = (repo_root / 'taskfiles/Taskfile.quality.yml').read_text()
    assert re.search(r'^  quality:ast:', text, re.M)
    assert re.search(r'@ast-grep/cli@[0-9]+\.[0-9]+\.[0-9]+', text)
