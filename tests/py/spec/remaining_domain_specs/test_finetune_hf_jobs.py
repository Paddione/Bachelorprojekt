"""Native migration of tests/spec/finetune-hf-jobs.bats."""
import re

def test_readme_primary_hf_jobs(repo_root):
    text = (repo_root / 'scripts/finetune/README.md').read_text()
    assert 'HF Jobs Cloud (primär' in text
    assert 'trackio' in text.lower()
    assert 'deprecated' in text.lower()

def test_targets_without_credentials_or_hosts(repo_root):
    text = (repo_root / 'taskfiles/Taskfile.finetune.yml').read_text()
    assert 'hf-jobs:train:' in text
    assert 'hf-jobs:export:' in text
    assert not re.search(r'hf_[A-Za-z0-9]{20,}|https://[a-z0-9.-]+\.(de|com|org)', text)
    assert re.search(r'HF_TOKEN erforderlich|HF_TOKEN ist nicht gesetzt', text)
