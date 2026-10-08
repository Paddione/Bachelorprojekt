"""Native migration of tests/spec/ticket-mcp.bats."""
import pytest

@pytest.fixture
def ticket(repo_root, run_cmd):
    def execute(args, **env):
        return run_cmd(['bash', str(repo_root / 'scripts/ticket.sh'), *args], env={'TICKET_DRY_RESOLVE': '1', 'TICKET_OFFLINE': '0', 'BRAND': 'mentolder', **env})
    return execute

@pytest.mark.parametrize('args', [['list', '--brand', 'mentolder'], ['list', '--brand', 'mentolder', '--limit', '50'], ['backfill-id', '--brand', 'mentolder']])
def test_dry_resolve(ticket, args):
    result = ticket(args)
    result.check()
    assert 'DRY-RESOLVE' in result.output

def test_invalid_brand(ticket):
    ticket(['list'], BRAND='unknown-brand').check(2)

def test_list_sort(ticket):
    for order in ['desc', 'asc']:
        result = ticket(['list', '--brand', 'mentolder', '--sort', order])
        result.check()
        assert 'DRY-RESOLVE' in result.output

def test_invalid_sort(ticket):
    ticket(['list', '--brand', 'mentolder', '--sort', 'bogus']).check(2)

@pytest.mark.parametrize('args', [['link-tickets', '--to', 'T000002', '--kind', 'blocks'], ['link-tickets', '--from', 'T000001', '--to', 'T000002']])
def test_missing_link_arguments(ticket, args):
    ticket(args).check(2)

def test_invalid_link_kind(ticket):
    result = ticket(['link-tickets', '--from', 'T000001', '--to', 'T000002', '--kind', 'depends'])
    result.check(2)
    assert 'kind' in result.output.lower()

def test_link_offline(ticket):
    result = ticket(['link-tickets', '--from', 'T000001', '--to', 'T000002', '--kind', 'blocks'], TICKET_OFFLINE='1')
    result.check()
    assert 'offline' in result.output.lower()

@pytest.mark.parametrize('command', ['get-ticket-links', 'get-timeline'])
def test_missing_id(ticket, command):
    ticket([command]).check(2)

@pytest.mark.parametrize('command', ['get-ticket-links', 'get-timeline'])
def test_offline_read(ticket, command):
    ticket([command, '--id', 'T000001'], TICKET_OFFLINE='1').check(9)
