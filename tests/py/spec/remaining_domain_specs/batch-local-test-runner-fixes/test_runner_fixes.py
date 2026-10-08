"""Native migration of tests/spec/batch-local-test-runner-fixes/runner-fixes.bats."""
def test_unreachable_e2e_handling(repo_root):
    lines = (repo_root / 'taskfiles/Taskfile.test.yml').read_text().splitlines()
    blocks = ['\n'.join(lines[i:i+9]) for i, line in enumerate(lines) if 'RUN_E2E_WEBSITE' in line]
    assert 'exec 3<>/dev/tcp/127.0.0.1/4321' in '\n'.join(blocks)

def test_madge_resolution(repo_root, run_cmd):
    program = """
import { runS2 } from './scripts/code-quality/gates/s2-cycles.mjs';
import { loadGates } from './scripts/code-quality/load.mjs';
const res = runS2(process.cwd(), loadGates('docs/code-quality'));
if (!res || !res.gate || res.gate !== 'S2') process.exit(1);
"""
    run_cmd(['node', '-e', program]).check(0)

def test_cockpit_mock_paths(repo_root):
    base = repo_root / 'components/website/src/lib/sdlc/tickets/__tests__'
    for name in ['cockpit-api.test.ts', 'cockpit-api-actions.test.ts']:
        text = (base / name).read_text()
        assert "vi.mock('../../../../lib/auth'" in text
        assert "vi.mock('../../../../lib/sdlc/tickets/cockpit-db'" in text
