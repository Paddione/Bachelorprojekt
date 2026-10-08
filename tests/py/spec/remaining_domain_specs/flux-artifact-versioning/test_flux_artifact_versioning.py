"""Native migration of tests/spec/flux-artifact-versioning/flux-artifact-versioning.bats."""
import re
import pytest

@pytest.fixture
def rendered(repo_root,run_cmd,tmp_path):
    res=run_cmd(['bash',str(repo_root/'scripts/flux-render-artifact.sh'),'--out',str(tmp_path)],env={'WEBSITE_IMAGE_DIGEST':'sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41','BRETT_IMAGE_DIGEST':'sha256:9090909090909090909090909090909090909090909090909090909090909090'},timeout=180)
    res.check(0)
    return tmp_path

def test_website_digest_no_latest(rendered):
    assert any('@sha256:' in p.read_text() for p in rendered.rglob('*') if p.is_file())
    for name in ['website-mentolder','website-korczewski','mentolder','korczewski']:
        path=rendered/name/(name+'.yaml')
        if path.is_file():
            assert not re.search(r'image: ghcr\.io/paddione/(website|workspace-brett):latest',path.read_text())

def test_brett_digest(rendered):
    assert 'sha256:9090909090909090909090909090909090909090909090909090909090909090' in (rendered/'mentolder/mentolder.yaml').read_text()
