import json, sys, textwrap, tempfile, os
sys.path.insert(0, os.path.dirname(__file__))
import plans_parse as pp

SAMPLE = textwrap.dedent("""\
    ---
    title: My Feature Plan
    domains: [infra, db]
    status: active
    pr_number: null
    ---
    Intro paragraph before first heading.

    ## Architecture

    This is the arch section.

    ## Files to Modify

    - `scripts/foo.sh` — create it
""")

def test_parse_frontmatter():
    with tempfile.NamedTemporaryFile(suffix='.md', mode='w', delete=False) as f:
        f.write(SAMPLE)
        path = f.name
    try:
        result = pp.parse_plan(path)
        assert result['title'] == 'My Feature Plan'
        assert result['domains'] == ['infra', 'db']
        assert result['status'] == 'active'
        assert result['pr_number'] is None
        assert result['type'] == 'plan'
    finally:
        os.unlink(path)

def test_parse_sections():
    with tempfile.NamedTemporaryFile(suffix='.md', mode='w', delete=False) as f:
        f.write(SAMPLE)
        path = f.name
    try:
        result = pp.parse_plan(path)
        types = [s['section_type'] for s in result['sections']]
        assert 'overview' in types
        assert 'architecture' in types
        assert 'files' in types
        assert all(isinstance(s['seq'], int) for s in result['sections'])
    finally:
        os.unlink(path)

if __name__ == '__main__':
    test_parse_frontmatter()
    test_parse_sections()
    print("All tests passed.")
