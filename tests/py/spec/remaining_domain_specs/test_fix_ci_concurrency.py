"""Metadata edits cannot cancel or replace checks from a code-CI run."""
import yaml


def _workflow(repo_root, name):
    return yaml.load((repo_root / f'.github/workflows/{name}.yml').read_text(), Loader=yaml.BaseLoader)


def test_cancel_isolated_from_metadata_edits(repo_root):
    code = _workflow(repo_root, 'ci')
    metadata = _workflow(repo_root, 'pr-metadata')
    assert 'edited' not in code['on']['pull_request']['types']
    assert code['concurrency']['group'] != metadata['concurrency']['group']
    assert code['concurrency']['cancel-in-progress'] == "${{ github.event_name == 'pull_request' }}"


def test_metadata_edits_cannot_publish_skipped_code_jobs(repo_root):
    metadata = _workflow(repo_root, 'pr-metadata')
    assert 'edited' in metadata['on']['pull_request']['types']
    assert [job['name'] for job in metadata['jobs'].values()] == ['Conventional Commits']
    assert 'commit-lint' not in _workflow(repo_root, 'ci')['jobs']
