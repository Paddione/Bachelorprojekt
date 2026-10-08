"""Native migration of tests/spec/brain-quality-goals.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def brain(repo_root: Path):
    tpl = repo_root / "templates" / "brain"
    return {
        "tpl": tpl,
        "lint_wl": tpl / "scripts" / "lint-wikilinks.sh",
        "lint_fm": tpl / "scripts" / "lint-frontmatter.sh",
        "wf": tpl / ".github" / "workflows" / "build-site.yml",
    }


def _page(w: Path, rel: str, text: str) -> None:
    p = w / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


FM = "---\ntype: note\ntags: [x]\nstatus: active\n---\n"


def test_g_brain01_dead_alias_wikilink_fails_lint_wikilinks(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", FM + "see [[ghost|Text]]\n")
    res = run_cmd(["bash", str(brain["lint_wl"]), str(w)])
    assert res.returncode != 0
    assert "dead wikilink: [[ghost]]" in res.output


def test_g_brain01_dead_anchor_wikilink_fails_lint_wikilinks(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", FM + "see [[ghost#abschnitt]]\n")
    res = run_cmd(["bash", str(brain["lint_wl"]), str(w)])
    assert res.returncode != 0
    assert "dead wikilink: [[ghost]]" in res.output


def test_g_brain01_alias_and_anchor_links_to_existing_pages_pass(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", FM + "see [[b|Alias]] und [[b#sektion]]\n")
    _page(w, "wiki/b.md", FM + "hi\n")
    run_cmd(["bash", str(brain["lint_wl"]), str(w)]).check(0)


def test_g_brain04_lint_wikilinks_lists_every_dead_link_before_exiting(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", FM + "see [[ghost-eins]]\n")
    _page(w, "wiki/b.md", FM + "see [[ghost-zwei|Alias]]\n")
    res = run_cmd(["bash", str(brain["lint_wl"]), str(w)])
    assert res.returncode != 0
    assert "[[ghost-eins]]" in res.output
    assert "[[ghost-zwei]]" in res.output


def test_g_brain02_empty_tags_list_is_rejected_by_lint_frontmatter(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", "---\ntype: note\ntags: []\nstatus: active\n---\nbody\n")
    res = run_cmd(["bash", str(brain["lint_fm"]), str(w)])
    assert res.returncode != 0
    assert "tags must be a non-empty list" in res.output


def test_g_brain02_bare_tags_line_without_values_is_rejected(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", "---\ntype: note\ntags:\nstatus: active\n---\nbody\n")
    res = run_cmd(["bash", str(brain["lint_fm"]), str(w)])
    assert res.returncode != 0
    assert "tags must be a non-empty list" in res.output


def test_g_brain03_raw_files_without_frontmatter_pass_lint_frontmatter(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "raw/dump.md", "rohes fragment ohne frontmatter\n")
    _page(w, "wiki/ok.md", FM + "body\n")
    run_cmd(["bash", str(brain["lint_fm"]), str(w)]).check(0)


def test_g_brain03_readme_md_without_frontmatter_passes_lint_frontmatter(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "README.md", "# Landing ohne Frontmatter\n")
    _page(w, "wiki/ok.md", FM + "body\n")
    run_cmd(["bash", str(brain["lint_fm"]), str(w)]).check(0)


def test_g_brain03_hub_page_index_md_stays_in_lint_scope(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "index.md", "kein frontmatter\n")
    res = run_cmd(["bash", str(brain["lint_fm"]), str(w)])
    assert res.returncode != 0
    assert "index.md" in res.output


def test_g_brain04_invalid_enum_yields_fail_line_and_later_files_still_checked(run_cmd, brain, tmp_path):
    w = tmp_path / "w"
    _page(w, "wiki/a.md", "---\ntype: Note\ntags: [x]\nstatus: active\n---\nbody\n")
    _page(w, "wiki/b.md", "---\ntype: note\ntags: [x]\nstatus: bogus\n---\nbody\n")
    res = run_cmd(["bash", str(brain["lint_fm"]), str(w)])
    assert res.returncode != 0
    assert "invalid type: Note" in res.output
    assert "invalid status: bogus" in res.output


def test_g_brain05_build_site_workflow_runs_both_linters_in_gating_lint_job(brain):
    text = brain["wf"].read_text(encoding="utf-8")
    assert "lint-wikilinks.sh" in text
    assert "lint-frontmatter.sh" in text
    assert re.search(r"needs:[ \t]*lint", text)


def test_g_brain06_build_site_workflow_stages_no_raw_directory(brain):
    text = brain["wf"].read_text(encoding="utf-8")
    assert not re.search(r"\braw\b", text), "build-site.yml references raw/"


def test_seed_ships_five_doc_pages_plus_readme_linked_from_both_hubs(brain):
    tpl = brain["tpl"]
    for page in ("quality-goals", "usage", "cheatsheet", "first-aid", "llm-workflows"):
        assert (tpl / "wiki" / f"{page}.md").is_file(), f"missing wiki/{page}.md"
        assert page in (tpl / "index.md").read_text(encoding="utf-8")
        assert page in (tpl / "wiki" / "index-moc.md").read_text(encoding="utf-8")
    assert (tpl / "README.md").is_file()


def test_quality_goals_page_lists_all_eleven_goals_with_baseline_date(brain):
    qg = (brain["tpl"] / "wiki" / "quality-goals.md").read_text(encoding="utf-8")
    for i in range(1, 12):
        assert f"G-BRAIN{i:02d}" in qg, f"G-BRAIN{i:02d} missing"
    assert "2026-07-03" in qg
    assert "type: decision" in qg
