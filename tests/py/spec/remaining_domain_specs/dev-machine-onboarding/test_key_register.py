"""Native migration of tests/spec/dev-machine-onboarding/key-register.bats."""
import re
import yaml

def section(repo_root, heading):
    text = (repo_root / 'docs/runbooks/git-crypt-key-distribution.md').read_text()
    match = re.search(r'^## ' + heading + r'[^\n]*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
    assert match and match.group(1).strip()
    return match.group(1)

def test_holder_fields(repo_root):
    holders = yaml.safe_load((repo_root / 'devmesh/key-holders.yaml').read_text())['holders']
    assert holders
    for holder in holders:
        for key in ['machine', 'person', 'since']:
            assert holder.get(key), (holder, key)

def test_revocation_steps(repo_root):
    text = section(repo_root, 'Widerruf')
    for token in ['git-crypt init', 'git rm -r --cached', 'Rotation aller Secrets']:
        assert token in text

def test_transport_steps(repo_root):
    text = section(repo_root, 'Transport')
    for token in ['Vaultwarden Send', 'Maximale Zugriffsanzahl: 1', '24 Stunden']:
        assert token in text
