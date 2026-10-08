"""Native migration of tests/spec/k8-headed-tests/headed-verify-not-in-ci-path.bats."""
def test_spec_exists(repo_root):
    assert (repo_root/'tests/e2e/specs/k8-headed-verify.spec.ts').is_file()

def test_playwright_registration(repo_root):
    text=(repo_root/'tests/e2e/playwright.config.ts').read_text()
    assert 'fa-01-' in text
    assert 'k8-headed-verify' not in text

def test_no_feature_tag(repo_root):
    anchor=(repo_root/'tests/e2e/specs/fa-01-messaging.spec.ts').read_text()
    assert "tag: ['@messaging']" in anchor
    assert 'tag: [' not in (repo_root/'tests/e2e/specs/k8-headed-verify.spec.ts').read_text()

def test_ci_skip(repo_root):
    assert 'process.env.CI' in (repo_root/'tests/e2e/specs/k8-headed-verify.spec.ts').read_text()

def test_e2e_optional_documented(repo_root):
    assert 'K8 headed-verify' in (repo_root/'.github/workflows/e2e.yml').read_text()

def test_required_ci_excludes(repo_root):
    text=(repo_root/'.github/workflows/ci.yml').read_text()
    assert text
    assert 'k8-headed-verify' not in text

def test_skill_optional_step(repo_root):
    assert 'headed-verify' in (repo_root/'.claude/skills/dev-flow-e2e/SKILL.md').read_text()
