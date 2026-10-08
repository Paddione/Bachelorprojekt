"""Native migration of tests/spec/brain-foundation.bats."""

import shutil
from pathlib import Path

import pytest


@pytest.fixture
def brain(repo_root: Path):
    return {
        "lint_wl": repo_root / "templates" / "brain" / "scripts" / "lint-wikilinks.sh",
        "lint_fm": repo_root / "templates" / "brain" / "scripts" / "lint-frontmatter.sh",
        "dockerfile": repo_root / "templates" / "brain" / "site.Dockerfile",
        "workflow": repo_root / "templates" / "brain" / ".github" / "workflows" / "build-site.yml",
    }


def _wiki(tmp_path: Path) -> Path:
    base = tmp_path / "w"
    (base / "wiki").mkdir(parents=True)
    return base


def test_lint_frontmatter_flags_a_missing_mandatory_field(run_cmd, brain, tmp_path):
    w = _wiki(tmp_path)
    (w / "wiki" / "bad.md").write_text("---\ntype: note\ntags: [x]\n---\nbody\n")
    res = run_cmd(["bash", str(brain["lint_fm"]), str(w)])
    assert res.returncode != 0
    assert "missing required frontmatter field: status" in res.output


def test_lint_frontmatter_passes_a_well_formed_page(run_cmd, brain, tmp_path):
    w = _wiki(tmp_path)
    (w / "wiki" / "ok.md").write_text("---\ntype: note\ntags: [x]\nstatus: active\n---\nbody\n")
    run_cmd(["bash", str(brain["lint_fm"]), str(w)]).check(0)


def test_lint_wikilinks_flags_a_dead_link(run_cmd, brain, tmp_path):
    w = _wiki(tmp_path)
    (w / "wiki" / "a.md").write_text("---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[ghost]]\n")
    res = run_cmd(["bash", str(brain["lint_wl"]), str(w)])
    assert res.returncode != 0
    assert "dead wikilink: [[ghost]]" in res.output


def test_lint_wikilinks_passes_when_every_link_resolves(run_cmd, brain, tmp_path):
    w = _wiki(tmp_path)
    (w / "wiki" / "a.md").write_text("---\ntype: note\ntags: [x]\nstatus: active\n---\nsee [[b]]\n")
    (w / "wiki" / "b.md").write_text("---\ntype: note\ntags: [x]\nstatus: active\n---\nhi\n")
    run_cmd(["bash", str(brain["lint_wl"]), str(w)]).check(0)


def test_site_dockerfile_pins_quartz_v4_5_2_via_tagged_clone(brain):
    assert "--branch v4.5.2" in brain["dockerfile"].read_text(encoding="utf-8")


def test_site_dockerfile_runtime_stage_uses_official_static_web_server_image(brain):
    text = brain["dockerfile"].read_text(encoding="utf-8")
    assert "ghcr.io/static-web-server/static-web-server:2-alpine" in text


def test_site_dockerfile_has_no_npm_ci_against_nonexistent_package_json(brain):
    text = brain["dockerfile"].read_text(encoding="utf-8")
    assert "COPY package" not in text
    assert "--only=production" not in text


def test_build_site_workflow_template_exists_and_pushes_brain_site_latest(brain):
    wf = brain["workflow"]
    assert wf.is_file(), f"missing workflow: {wf}"
    text = wf.read_text(encoding="utf-8")
    assert "ghcr.io/paddione/brain-site:latest" in text
    assert "site.Dockerfile" in text


def test_build_graph_docs_emits_architecture_md_with_mermaid_fences_not_html(run_cmd, repo_root, tmp_path):
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    out = tmp_path / "architecture.md"
    res = run_cmd(
        ["node", "scripts/build-graph-docs.mjs"],
        cwd=repo_root,
        env={"ARCH_OUT": str(out)},
    )
    assert res.returncode == 0, f"generator exited non-zero: {res.output}"
    assert out.is_file(), "architecture.md not written"
    text = out.read_text(encoding="utf-8")
    assert "```mermaid" in text, "no mermaid fence in output"
    assert "<html" not in text, "output still contains raw HTML"
    assert "cdn.jsdelivr.net" not in text, "output still references the CDN mermaid script"


def test_architecture_md_is_byte_identical_across_two_generator_runs(run_cmd, repo_root, tmp_path):
    if shutil.which("node") is None:
        pytest.skip("node not installed")
    out = tmp_path / "architecture.md"
    res = run_cmd(["node", "scripts/build-graph-docs.mjs"], cwd=repo_root, env={"ARCH_OUT": str(out)})
    assert res.returncode == 0
    first = out.read_text(encoding="utf-8")
    res = run_cmd(["node", "scripts/build-graph-docs.mjs"], cwd=repo_root, env={"ARCH_OUT": str(out)})
    assert res.returncode == 0
    second = out.read_text(encoding="utf-8")
    assert first == second, "output differs between consecutive runs (likely an embedded timestamp)"
