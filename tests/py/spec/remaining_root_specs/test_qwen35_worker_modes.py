"""Native migration of tests/spec/qwen35-worker-modes.bats."""
import json
import re

def test_worker_routes(repo_root):
    cfg = json.loads(re.sub(r'^\s*//.*$', '', (repo_root / '.opencode/agent-models.jsonc').read_text(), flags=re.M))
    # T016656: der 4B-Pool :8080 und der CPU-2B-Pool sind aus der Config entfernt (dotfiles #131);
    # der Cloud-Worker des plan-runners ist plan-worker-muse.
    muse = cfg['agent']['plan-worker-muse']
    assert muse['model'] == 'opencode/muse-spark-1.3-contributor-free'
    assert muse['mode'] == 'primary'
    assert muse['prompt'] == '{file:./prompts/vllm-worker.md}'
    assert muse['permission']['task'] == 'deny'
    assert muse['permission']['write'] == 'allow'
    for key in ['qwen35-4b', 'plan-worker-qwen35', 'plan-worker-cpu2b', 'plan-worker-vllm']:
        assert key not in cfg['agent']
    for key in ['llamacpp-qwen3', 'llamacpp-cpu-2b']:
        assert key not in cfg['provider']
    assert cfg['agent']['local']['model'] == 'llamacpp-local/Qwen3.8-27B'
    slim = json.loads(re.sub(r'^\s*//.*$', '', (repo_root / '.opencode/oh-my-opencode-slim.jsonc').read_text(), flags=re.M))
    for key in ['explorer', 'librarian']:
        assert slim['agents'][key]['model'] == 'vllm-local/w4a4'

def test_launcher(repo_root):
    data = (repo_root / 'scripts/llm/start-qwen35-4b-service.ps1').read_bytes()
    assert all(byte < 128 for byte in data)
    text = data.decode()
    for expected in ['GPU-6b9ac882-e9e9-a364-4423-92d838536b86', '--chat-template-kwargs', 'enable_thinking', '/v1/models', '/apply-template', '$direct', 'Get-NetTCPConnection', 'CUDA_VISIBLE_DEVICES = $GpuUuid']:
        assert expected in text
    assert 'Stop-Process' not in text
