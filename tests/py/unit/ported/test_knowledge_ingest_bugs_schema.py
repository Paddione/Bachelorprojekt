"""Native migration of tests/unit/knowledge-ingest-bugs-schema.bats."""

import shutil
import subprocess

import pytest


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """Render k3d/ once, stdout and stderr combined (as the BATS setup_file did)."""
    if shutil.which("kubectl") is None:
        pytest.skip("kubectl not installed")
    out = tmp_path_factory.mktemp("knowledge-ingest") / "rendered-knowledge-bugs.yaml"
    with open(out, "w", encoding="utf-8") as handle:
        subprocess.run(
            ["kubectl", "kustomize", str(repo_root / "k3d"), "--load-restrictor=LoadRestrictionsNone"],
            stdout=handle,
            stderr=subprocess.STDOUT,
            timeout=300,
            check=False,
        )
    return out


def test_ingest_bug_tickets_mjs_does_not_query_non_existent_columns_id_title(rendered):
    text = rendered.read_text(encoding="utf-8")
    # The broken columns should NOT be found in the SELECT query.
    assert "SELECT id, title" not in text
    # ticket_id SHOULD be found.
    assert "ticket_id," in text
