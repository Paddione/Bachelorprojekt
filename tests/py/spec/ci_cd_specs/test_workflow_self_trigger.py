"""Native assertions from tests/spec/ci-cd/workflow-self-trigger.bats."""

import re


def test_filtered_workflows_list_themselves(repo_root):
    workflows = [(file, file.read_text()) for file in (repo_root / ".github/workflows").glob("*.yml")]
    filtered = [(file, source) for file, source in workflows if re.search(r"^\s+paths:", source, re.M)]
    assert filtered
    assert any(f".github/workflows/{file.name}" in source for file, source in filtered)
    missing = [file.name for file, source in filtered if f".github/workflows/{file.name}" not in source]
    assert not missing, missing


def test_fleet_render_runs_on_every_main_push(repo_root):
    source = (repo_root / ".github/workflows/render-fleet-artifact.yml").read_text()
    assert re.search(r"^\s+branches: \[main\]", source, re.M)
    assert not re.search(r"^\s+paths:", source, re.M)


def _pr_required_contexts(repo_root, action):
    import yaml
    required = {'Unit + Quality Gates', 'Security Scan', 'Brett TypeScript',
                'Conventional Commits', 'Spec + Guards'}
    published = []
    for file in (repo_root / '.github/workflows').glob('*.yml'):
        workflow = yaml.load(file.read_text(), Loader=yaml.BaseLoader)
        trigger = workflow.get('on', {}).get('pull_request')
        if trigger is None or action not in trigger.get('types', ['opened', 'synchronize', 'reopened']):
            continue
        # A skipped job still publishes its check context: job `if` is not an
        # event-level firewall for required checks.
        published.extend(job.get('name', key) for key, job in workflow.get('jobs', {}).items()
                         if job.get('name', key) in required)
    return published


def test_pr_edited_publishes_only_metadata_required_check(repo_root):
    assert _pr_required_contexts(repo_root, 'edited') == ['Conventional Commits']


def test_code_events_preserve_all_five_required_contexts(repo_root):
    expected = {'Unit + Quality Gates', 'Security Scan', 'Brett TypeScript',
                'Conventional Commits', 'Spec + Guards'}
    for action in ('opened', 'synchronize', 'reopened'):
        contexts = _pr_required_contexts(repo_root, action)
        assert set(contexts) == expected
        assert len(contexts) == len(expected)


def test_metadata_run_cannot_cancel_code_run(repo_root):
    import yaml
    workflows = {name: yaml.load((repo_root / f'.github/workflows/{name}.yml').read_text(),
                                Loader=yaml.BaseLoader)
                 for name in ('ci', 'pr-metadata')}
    metadata = workflows['pr-metadata']
    assert set(metadata['on']) == {'pull_request'}
    assert metadata['on']['pull_request']['branches'] == ['main']
    assert set(metadata['jobs']) == {'commit-lint'}
    assert metadata['concurrency']['group'] != workflows['ci']['concurrency']['group']
    assert metadata['concurrency']['cancel-in-progress'] == 'true'
