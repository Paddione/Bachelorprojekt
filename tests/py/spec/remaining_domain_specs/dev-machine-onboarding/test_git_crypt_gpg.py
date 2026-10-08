"""Native migration of tests/spec/dev-machine-onboarding/git-crypt-gpg.bats."""
def test_image_gnupg(repo_root):
    assert 'gnupg' in (repo_root / 'docker/dev-shell/Dockerfile').read_text()

def test_image_pinentry(repo_root):
    assert 'pinentry' in (repo_root / 'docker/dev-shell/Dockerfile').read_text()

def test_gpg_runbook(repo_root):
    text = (repo_root / 'docs/runbooks/git-crypt-key-distribution.md').read_text()
    assert 'add-gpg-user' in text
    assert 'GPG_TTY' in text
