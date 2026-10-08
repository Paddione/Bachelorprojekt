"""Native migration of tests/spec/mishap-categorize-erden.bats."""
import re
import pytest

@pytest.fixture
def script(repo_root):
    return (repo_root / 'scripts/mishap-categorize.sh').read_text()

@pytest.mark.parametrize('pattern', [r'^_fetch_existing_categories\(\)', r'^_build_enum_fallback\(\)'])
def test_function_exists(script, pattern):
    assert re.search(pattern, script, re.M)

def test_categories_before_api(script):
    lines = script.splitlines()
    cat = next(i for i, line in enumerate(lines) if '_fetch_existing_categories 2>/dev/null' in line)
    api = next(i for i, line in enumerate(lines) if not re.match(r'^\s*#', line) and 'DEEPSEEK_API_KEY' in line)
    assert cat < api

@pytest.mark.parametrize('expected', ['[EXISTING_CATEGORIES]', '$(echo "$existing_categories"', 'existing_categories=$(_build_enum_fallback)', '<<< "$existing_categories"', "'kind:'"])
def test_category_structure(script, expected):
    assert expected in script

def test_canonical_fallback(script):
    for category in ['CI-Konflikt', 'Gate-Fehler', 'API-Fehler', 'Scout-Qualität', 'Deploy-Fehler', 'Spec-Lücke', 'Test-Lücke', 'Sonstige']:
        assert f"'{category}'" in script

def test_keyword_matching(script):
    assert 'best_count=0' in script
    assert 'keyword match →' in script
