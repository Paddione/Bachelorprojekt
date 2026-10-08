"""Native migration of tests/spec/mcp-task-runner/planner-sees-real-deps.bats."""
import json
import shutil
import subprocess
import pytest

def test_real_dependency_groups(repo_root):
    binary = shutil.which('mcp-task-runner')
    if not binary:
        pytest.skip('mcp-task-runner binary not installed')
    req = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'plan_tasks', 'arguments': {'tasks': [{'task': 'workspace:transcriber-push', 'env': 'dev'}, {'task': 'workspace:transcriber-build', 'env': 'dev'}]}}}
    res = subprocess.run([binary, '--taskfile', str(repo_root / 'Taskfile.yml')], input=json.dumps(req)+'\n', cwd=repo_root, capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, res.stderr
    groups = json.loads(json.loads(res.stdout)['result']['content'][0]['text'])['groups']
    sources = [repo_root / 'Taskfile.yml', *list((repo_root / 'taskfiles').rglob('*'))]
    assert any('deps: [workspace:transcriber-build]' in p.read_text() for p in sources if p.is_file())
    assert len(groups) == 2
    assert groups[0]['tasks'][0]['task'] == 'workspace:transcriber-build'
    assert groups[1]['tasks'][0]['task'] == 'workspace:transcriber-push'
