"""Native migration of tests/spec/opencode-local-model-runner.bats."""
import pytest

@pytest.mark.parametrize('expected', ['runs-on: [self-hosted, fleet-gpu]', 'github.repository', 'model: llamacpp-local/gemma26-factory'])
def test_workflow_configuration(repo_root, expected):
    assert expected in (repo_root / '.github/workflows/opencode.yml').read_text()
