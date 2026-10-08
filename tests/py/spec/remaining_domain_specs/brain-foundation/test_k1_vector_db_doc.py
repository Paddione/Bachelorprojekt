"""Native migration of tests/spec/brain-foundation/k1-vector-db-doc.bats."""
def test_diagram_exists(repo_root):
    assert (repo_root / 'docs/diagrams/k1-vector-db.md').is_file()

def test_four_vector_tables(repo_root):
    text = (repo_root / 'docs/diagrams/k1-vector-db.md').read_text()
    for needle in ['code_embeddings', 'knowledge.chunks', 'ticket_embeddings', 'knowledge.collections']:
        assert needle in text

def test_design_references_single_copy(repo_root):
    text = (repo_root / 'docs/superpowers/specs/2026-07-28-sdlc-cockpit-design.md').read_text()
    assert 'docs/diagrams/k1-vector-db.md' in text
    assert 'knowledge.collections' not in text
