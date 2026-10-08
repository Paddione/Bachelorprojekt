"""Native migration of tests/spec/commit-scope-vokabular/mcp-gateway-alias.bats."""
import re

def validate(repo_root, run_cmd, tmp_path, message):
    path = tmp_path / 'message.txt'
    path.write_text(message + '\n')
    return run_cmd([str(repo_root / 'scripts/validate-commit-msg.sh'), 'message', str(path)])

def test_ops_scope(repo_root, run_cmd, tmp_path):
    validate(repo_root, run_cmd, tmp_path, 'fix(ops): correct commit-lint scope').check(0)

def test_gateway_redirect(repo_root, run_cmd, tmp_path):
    res = validate(repo_root, run_cmd, tmp_path, 'fix(mcp-gateway): agy headless mcp tool permissions')
    res.check(1)
    assert 'mcp' in res.output

def test_ticket_redirect(repo_root, run_cmd, tmp_path):
    res = validate(repo_root, run_cmd, tmp_path, 'chore(tickets): register mcp tool params')
    res.check(1)
    assert 'Ticket-Scope' in res.output

def test_unknown_scope_hint(repo_root, run_cmd, tmp_path):
    res = validate(repo_root, run_cmd, tmp_path, 'fix(totally-not-a-real-scope): x')
    res.check(1)
    assert re.search(r'[Pp][Rr]-?[Tt]it(el|le)', res.output)
