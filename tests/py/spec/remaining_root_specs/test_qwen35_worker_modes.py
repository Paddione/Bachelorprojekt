"""Native migration of tests/spec/qwen35-worker-modes.bats."""
import json
import re

def test_worker_routes(repo_root):
    cfg = json.loads(re.sub(r'^\s*//.*$', '', (repo_root / '.opencode/agent-models.jsonc').read_text(), flags=re.M))
    for key in ['qwen35-4b', 'plan-worker-qwen35']:
        assert cfg['agent'][key]['model'] == 'llamacpp-qwen3/Qwen3.5-4B-MTP'
        assert cfg['agent'][key]['prompt'] == '{file:./prompts/qwen35-worker.md}'
        assert cfg['agent'][key]['permission']['task'] == 'deny'
    assert cfg['agent']['qwen35-4b']['permission']['write'] == 'deny'
    assert cfg['agent']['plan-worker-qwen35']['permission']['write'] == 'allow'
    assert cfg['agent']['local']['model'] == 'llamacpp-local/Qwen3.8-27B'
    assert cfg['provider']['llamacpp-qwen3']['models']['Qwen3.5-4B-MTP']['limit']['context'] == 98304
    slim = json.loads(re.sub(r'^\s*//.*$', '', (repo_root / '.opencode/oh-my-opencode-slim.jsonc').read_text(), flags=re.M))
    for key in ['explorer', 'librarian']:
        assert slim['agents'][key]['model'] == cfg['agent']['qwen35-4b']['model']

def test_launcher(repo_root):
    data = (repo_root / 'scripts/llm/start-qwen35-4b-service.ps1').read_bytes()
    assert all(byte < 128 for byte in data)
    text = data.decode()
    for expected in ['GPU-6b9ac882-e9e9-a364-4423-92d838536b86', '--chat-template-kwargs', 'enable_thinking', '/v1/models', '/apply-template', '$direct', 'Get-NetTCPConnection', 'CUDA_VISIBLE_DEVICES = $GpuUuid']:
        assert expected in text
    assert 'Stop-Process' not in text
