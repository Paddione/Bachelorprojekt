"""Native migration of tests/unit/knowledge-ingest-schema.bats."""
import shutil

import pytest


@pytest.fixture
def rendered_lines(run_cmd, repo_root):
    """Render the k3d base like `kubectl kustomize ... > file 2>&1` and return its lines."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not available")
    result = run_cmd(["kubectl", "kustomize", str(repo_root / "k3d"), "--load-restrictor=LoadRestrictionsNone"],
                     timeout=300)
    return (result.stdout + result.stderr).splitlines()


def test_ingest_prs_does_not_query_non_existent_columns_body_labels(rendered_lines):
    # [T002605] The source is ticket_links; the SELECT starts with 'SELECT DISTINCT l.pr_number'.
    anchor = "SELECT DISTINCT l.pr_number"
    hits = [i for i, line in enumerate(rendered_lines) if anchor in line]
    # grep -A 10 emits the match line plus the 10 lines after it.
    assert hits, "SELECT DISTINCT l.pr_number not found in rendered schema"
    window = []
    for i in hits:
        window.extend(rendered_lines[i:i + 11])
    # The broken columns must not appear in the SELECT query.
    assert not any("body," in line for line in window)
    assert not any("labels" in line for line in window)
