"""Native migration of tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats."""
import re

def guide(repo_root):
    return (repo_root/'.claude/skills/references/mcp-tool-guide.md').read_text()

def test_helper_fleet_context(repo_root):
    lines=guide(repo_root).splitlines()
    start=next(i for i,line in enumerate(lines) if 'kubectl get pod -n workspace' in line)
    end=next(i for i in range(start,len(lines)) if re.search(r'^\s*psql\(\) \{ kubectl exec',lines[i]))
    block='\n'.join(lines[start:end+1])
    assert block
    assert '--context fleet' in block
    assert '--context workspace-dev' not in block

def test_postgres_ticket_ssot(repo_root):
    text=guide(repo_root)
    match=re.search(r'^## `mcp-postgres`.*?(?=^## `mcp-kubernetes`|\Z)',text,re.M|re.S)
    assert match
    section=match.group()
    assert 'fleet' in section
    assert re.search(r'SSOT|DB of record',section,re.I)
    assert 'Eingefrorene fleet-Kopie, nicht die lokale SSOT' not in section
