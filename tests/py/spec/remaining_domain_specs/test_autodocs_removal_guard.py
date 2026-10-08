"""Native migration of tests/spec/autodocs-removal-guard.bats."""
import re

def test_generator_removed(repo_root):
    for name in ['.github/workflows/build-docs.yml', 'scripts/docs.Dockerfile', 'scripts/build-docs.mjs', 'scripts/docs-gen']:
        assert not (repo_root / name).exists()

def test_serving_removed(repo_root):
    for name in ['k3d/docs.yaml', 'k3d/oauth2-proxy-docs.yaml', 'k3d/docs-content-built']:
        assert not (repo_root / name).exists()
    for name in ['k3d/ingress.yaml', 'k3d/kustomization.yaml']:
        assert not re.search(r'docs\.localhost|oauth2-proxy-docs|docs\.yaml', (repo_root / name).read_text())

def test_tasks_removed(repo_root):
    files = [repo_root / 'Taskfile.yml', *list((repo_root / 'taskfiles').rglob('*'))]
    for path in files:
        if path.is_file():
            assert not re.search(r'^  (docs:build|docs:deploy|test:docs-gen):', path.read_text(), re.M), path

def test_env_keys_removed(repo_root):
    for path in (repo_root / 'environments').glob('*.yaml'):
        assert not re.search(r'DOCS_URL|DOCS_IMAGE', path.read_text()), path

def test_site_docs_removed(repo_root):
    for name in ['docs/brain/k4-brain-wiki.md', 'docs/DOCS-DESIGN-STANDARDS.md']:
        assert not (repo_root / name).exists()

def test_keepers_present(repo_root):
    assert (repo_root / '.github/workflows/freshness-regen.yml').is_file()
    assert re.search(r'^  graph:build-docs:', (repo_root / 'taskfiles/Taskfile.data.yml').read_text(), re.M)
    assert (repo_root / 'docs/legacy-html').is_dir()
    assert (repo_root / 'templates/brain').is_dir()
