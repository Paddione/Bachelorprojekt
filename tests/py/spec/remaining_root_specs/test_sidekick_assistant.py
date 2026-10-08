"""Native migration of tests/spec/sidekick-assistant.bats; structural guards."""
import re
import pytest

@pytest.mark.parametrize('route', ['execute', 'nudges', 'chat', 'dismiss'])
def test_route_exists(repo_root, route):
    assert (repo_root / f'components/website/src/pages/api/assistant/{route}.ts').is_file()

@pytest.mark.parametrize(('route', 'pattern'), [('execute', r'profile.*admin.*portal|invalid profile'), ('execute', r'403|forbidden'), ('nudges', r'profile.*admin.*portal|invalid profile'), ('chat', r'profile.*admin.*portal|invalid profile'), ('chat', r'admin.*useBooks|useBooks.*admin')])
def test_access_guards(repo_root, route, pattern):
    assert re.search(pattern, (repo_root / f'components/website/src/pages/api/assistant/{route}.ts').read_text())
