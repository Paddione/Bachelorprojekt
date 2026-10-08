"""Native migration of tests/spec/s1-violations.bats."""
import json

def test_baseline_limit(repo_root):
    baseline = json.loads((repo_root / 'docs/code-quality/baseline.json').read_text())
    assert sum(key.startswith('S1:') for key in baseline) <= 30

def test_gltf_excluded(repo_root):
    gates = (repo_root / 'docs/code-quality/gates.yaml').read_text()
    baseline = json.loads((repo_root / 'docs/code-quality/baseline.json').read_text())
    assert 'GLTFLoader' not in gates or not baseline.get('S1:components/brett/public/lib/GLTFLoader.js')
