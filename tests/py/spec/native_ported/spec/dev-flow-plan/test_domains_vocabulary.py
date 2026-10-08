"""Native migration of tests/spec/dev-flow-plan/domains-vocabulary.bats."""

import re
from pathlib import Path

import pytest


@pytest.fixture
def tmp_repo(run_cmd, tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    run_cmd(["git", "init", "-q", str(root)]).check()
    run_cmd(["git", "-C", str(root), "config", "user.email", "t002614-test@example.invalid"]).check()
    run_cmd(["git", "-C", str(root), "config", "user.name", "T002614 Test"]).check()
    return root


@pytest.fixture
def pcf(run_cmd, repo_root, tmp_repo):
    script = repo_root / "scripts" / "plan-context.sh"

    def _run(*args):
        return run_cmd(["bash", str(script), *args], cwd=tmp_repo)

    return _run


def _make_fixture(root: Path, slug: str, domains: str) -> None:
    d = root / ".agents" / "plans" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "proposal.md").write_text(
        f'---\ntitle: "Proposal: {slug}"\n---\n\n# Proposal: {slug}\n\ntest fixture, safe to ignore.\n',
        encoding="utf-8",
    )
    (d / "tasks.md").write_text(
        f'---\ntitle: "Tasks: {slug}"\ndomains: [{domains}]\nstatus: active\n---\n\n'
        f"# Tasks: {slug}\n\n- [ ] test fixture task\n",
        encoding="utf-8",
    )


def _proposal_domains(path: Path) -> str:
    """Mirror of the frontmatter parsing in plan-context.sh (proposal.md, fallback tasks.md)."""
    for f in (path, path.parent / "tasks.md"):
        if not f.is_file():
            continue
        lines = f.read_text(encoding="utf-8").splitlines()
        seen_open = False
        content = []
        for line in lines:
            if line == "---":
                if not seen_open:
                    seen_open = True
                    continue
                break
            if seen_open:
                content.append(line)
        match = [l for l in content if re.match(r"^domains:", l)]
        if match:
            value = re.sub(r"^domains:[ \t]*(.*)$", r"\1", match[0]).strip()
            value = re.sub(r'[\[\]"]', "", value).replace(",", " ")
            return re.sub(r" +", " ", value)
    return ""


# ── (1) Selbst-Match ──────────────────────────────────────────────────────

def test_t002614_full_role_name_as_domain_matches_its_own_role_red_pre_fix(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-self-test", "bachelorprojekt-test")
    out = pcf("bachelorprojekt-test").stdout
    assert "### Active proposal: zz-t002614-self-test" in out, (
        "MISSING: zz-t002614-self-test (domains: [bachelorprojekt-test]) should be included "
        "for role bachelorprojekt-test"
    )


def test_t002614_full_role_name_bachelorprojekt_infra_matches_role_bachelorprojekt_infra_red_pre_fix(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-self-infra", "bachelorprojekt-infra")
    out = pcf("bachelorprojekt-infra").stdout
    assert "### Active proposal: zz-t002614-self-infra" in out, (
        "MISSING: zz-t002614-self-infra (domains: [bachelorprojekt-infra]) should be included "
        "for role bachelorprojekt-infra"
    )


# ── (2) Vokabular ─────────────────────────────────────────────────────────

def test_t002614_corpus_word_scripts_reaches_role_bachelorprojekt_test_red_pre_fix(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-scripts", "scripts")
    out = pcf("bachelorprojekt-test").stdout
    assert "### Active proposal: zz-t002614-scripts" in out, (
        "MISSING: zz-t002614-scripts (domains: [scripts]) should be included for role bachelorprojekt-test"
    )


def test_t002614_corpus_word_deployment_reaches_role_bachelorprojekt_infra_red_pre_fix(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-deployment", "deployment")
    out = pcf("bachelorprojekt-infra").stdout
    assert "### Active proposal: zz-t002614-deployment" in out, (
        "MISSING: zz-t002614-deployment (domains: [deployment]) should be included "
        "for role bachelorprojekt-infra"
    )


# ── (3) Fail-loud ─────────────────────────────────────────────────────────

def test_t002614_all_dead_domains_emit_a_warn_naming_slug_and_domains_red_pre_fix(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-dead", "tooling, skills")
    err = pcf("bachelorprojekt-ops").stderr
    assert (
        "zz-t002614-dead" in err and "matching no role allowlist" in err and "tooling" in err
    ), f"MISSING stderr WARN for all-dead proposal (domains: [tooling, skills], role: ops) — got stderr: [{err}]"


def test_t002614_anchored_proposal_emits_no_dead_domains_warn_positive_anchor(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-anchored", "ops")
    err = pcf("bachelorprojekt-ops").stderr
    assert "matching no role allowlist" not in err, (
        "REGRESSION: anchored proposal (domains: [ops]) triggered the dead-domains WARN"
    )


def test_t002614_orchestrator_includes_an_unanchored_proposal_without_warn_anchor(pcf, tmp_repo):
    _make_fixture(tmp_repo, "zz-t002614-unanchored", "tooling")
    out = pcf("orchestrator").stdout
    assert "### Active proposal: zz-t002614-unanchored" in out, (
        "MISSING: orchestrator must include the unanchored proposal"
    )
    err = pcf("orchestrator").stderr
    assert "matching no role allowlist" not in err, (
        "REGRESSION: orchestrator (__ALL__) must not emit the dead-domains WARN"
    )


# ── (4) Korpus-Guard ──────────────────────────────────────────────────────

def test_t002614_every_active_proposal_has_at_least_one_domain_anchor_corpus_guard(run_cmd, repo_root):
    # Runs from the repo root (cwd default), like the BATS original; reads the live corpus.
    script = repo_root / "scripts" / "plan-context.sh"
    # $(...) in bash strips trailing newlines.
    vocab = run_cmd(["bash", str(script), "--vocab"]).stdout.rstrip("\n")
    # Contract: --vocab prints the token union, no proposal dump.
    assert " website " in f" {vocab} " and "Active proposal" not in vocab, (
        "MISSING: plan-context.sh --vocab must print the union vocabulary (tokens, no proposal markup)"
    )

    unanchored = []
    for f in sorted((repo_root / ".agents" / "plans").glob("*/proposal.md")):
        if not f.is_file():
            continue
        slug = f.parent.name
        if slug == "archive":
            continue
        domains = _proposal_domains(f)
        if not domains:
            continue  # legacy without domains: not in guard scope
        anchored = False
        for d in domains.split():
            if "/" in d:
                continue  # path tokens are explicit references, never vocabulary
            if f" {d} " in f" {vocab} ":
                anchored = True
                break
        if not anchored:
            unanchored.append(f"{slug} (domains: [{domains}])")
    assert not unanchored, (
        "UNANCHORED: " + "; ".join(unanchored)
        + " — Wort in _role_allowlist aufnehmen oder Proposal reparieren"
    )
