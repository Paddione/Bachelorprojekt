"""Native migration of tests/spec/art-library-webapp.bats."""
import re

def sprite(repo_root):
    return (repo_root / 'components/website/public/brand/mentolder/icons.svg').read_text()

def test_six_symbols(repo_root):
    assert sum('<symbol id=' in line for line in sprite(repo_root).splitlines()) == 6

def test_unique_ids(repo_root):
    ids = re.findall(r'id="[^"]*"', sprite(repo_root))
    assert len(ids) == len(set(ids))

def test_avatar_exists(repo_root):
    assert (repo_root / 'components/website/public/brand/mentolder/characters/leadership.portrait.svg').is_file()

def test_service_symbols(repo_root):
    text = (repo_root / 'components/website/src/config/brands/mentolder.ts').read_text()
    ids = [value for line in text.splitlines() if 'iconSpriteId:' in line for value in re.findall(r"'([^']*)'", line)]
    assert ids
    for value in ids:
        assert 'id="' + value + '"' in sprite(repo_root)

def test_props(repo_root):
    props = repo_root / 'components/website/public/brand/mentolder/props'
    assert len(list(props.rglob('*.svg'))) >= 6
