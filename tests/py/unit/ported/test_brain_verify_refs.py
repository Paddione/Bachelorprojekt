"""Native migration of tests/unit/brain-verify-refs.bats."""
import re
from pathlib import Path

import pytest

PAGE_MD = """---
type: note
tags: [note]
status: active
---

# Page

Live `docs/ok.md` und tot `docs/gone.md` sowie kahl scripts/missing.sh.
State-Key `docs/ok.md#1` löst auf die Datei auf.
Schema `docs/*` und `.agents/plans/<slug>/` sind keine Befunde.
Kommando `docs/ok.md --flag` löst auf die Datei auf.
Prosa tools/list und k3d/k3s sind keine Befunde.
MCP-Methode `tools/call` ist kein Pfad.
URL https://example.com/docs/gone.md ist kein Befund.
Siehe [[docs-gone]] und T123456 ohne Flag.

source:: Bachelorprojekt docs/ok.md
"""


@pytest.fixture
def testdir(tmp_path: Path, repo_root: Path) -> dict:
    root = tmp_path / "root"
    brain = tmp_path / "brain"
    (root / "docs").mkdir(parents=True)
    (brain / "wiki").mkdir(parents=True)
    (root / "docs" / "ok.md").write_text("# ok\n", encoding="utf-8")
    (brain / "wiki" / "page.md").write_text(PAGE_MD, encoding="utf-8")
    return {
        "dir": tmp_path,
        "root": root,
        "brain": brain,
        "script": repo_root / "scripts" / "brain-verify-refs.sh",
        "ticket": repo_root / "scripts" / "ticket.sh",
    }


def _git(run_cmd, repo: Path, *args):
    return run_cmd(["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t", *args])


def test_finds_dangling_paths_skips_live_url_wikilink_own_source_ticket(run_cmd, testdir):
    result = run_cmd(["bash", str(testdir["script"]), "--brain-repo", str(testdir["brain"]),
                      "--root", str(testdir["root"]), "--slugs", "page"])
    assert result.returncode == 0
    out = result.output
    assert "DANGLING-REF: wiki/page.md" in out
    assert "docs/gone.md" in out
    assert "scripts/missing.sh" in out
    assert "docs/ok.md" not in out
    assert "example.com" not in out
    assert "docs-gone" not in out
    assert "T123456" not in out
    assert "2 dangling" in out


def test_default_scope_diffs_the_delivery_branch(run_cmd, testdir):
    brain = testdir["brain"]
    assert _git(run_cmd, brain, "init", "-q", "-b", "main").returncode == 0
    assert _git(run_cmd, brain, "add", "wiki/page.md").returncode == 0
    assert _git(run_cmd, brain, "commit", "-qm", "init").returncode == 0
    assert _git(run_cmd, brain, "checkout", "-qb", "delivery").returncode == 0
    with (brain / "wiki" / "page.md").open("a", encoding="utf-8") as handle:
        handle.write("tot docs/gone2.md\n")
    assert _git(run_cmd, brain, "commit", "-qam", "change").returncode == 0

    result = run_cmd(["bash", str(testdir["script"]), "--brain-repo", str(brain),
                      "--root", str(testdir["root"]), "--branch-diff", "main"])
    assert result.returncode == 0
    assert "docs/gone.md" in result.output
    assert "docs/gone2.md" in result.output


def test_ticket_check_verifies_ids_against_the_db_when_reachable(run_cmd, testdir):
    probe = run_cmd(["bash", str(testdir["ticket"]), "get", "--id", "T900402"], timeout=300)
    if probe.returncode != 0:
        pytest.skip("ticket DB unreachable")
    (testdir["brain"] / "wiki" / "tk.md").write_text(
        "---\ntype: note\n---\n\n# T\n\nEcht T900402, erfunden T999999.\n", encoding="utf-8")
    result = run_cmd(["bash", str(testdir["script"]), "--brain-repo", str(testdir["brain"]),
                      "--root", str(testdir["root"]), "--slugs", "tk", "--check-tickets"], timeout=300)
    assert result.returncode == 0
    out = result.output
    # Glob semantics of the original: the ID must appear on the DANGLING-TICKET line for tk.md.
    assert re.search(r"DANGLING-TICKET: wiki/tk\.md:.*T999999", out, re.S)
    assert not re.search(r"DANGLING-TICKET: wiki/tk\.md:.*T900402", out, re.S)
