"""Native migration of tests/spec/brain-gekko-inbox.bats."""
def test_create_wiki_page(repo_root, run_cmd, tmp_path):
    inbox = tmp_path / 'inbox'
    wiki = tmp_path / 'wiki'
    inbox.mkdir()
    wiki.mkdir()
    source = inbox / 'new-note.md'
    source.write_text('# My New Note\n\ncontent here\n')
    res = run_cmd(['bash', str(repo_root / 'scripts/brain-gekko-inbox.sh'), str(source), str(wiki), '--title', 'My New Note', '--tags', 'test,gekko'])
    res.check(0)
    assert 'type: note' in (wiki / 'new-note.md').read_text()

def test_missing_source_rejected(repo_root, run_cmd, tmp_path):
    wiki = tmp_path / 'wiki'
    wiki.mkdir()
    res = run_cmd(['bash', str(repo_root / 'scripts/brain-gekko-inbox.sh'), str(tmp_path / 'absent.md'), str(wiki)])
    assert res.returncode != 0
