"""Native migration of tests/spec/plan-context.bats."""

import re
import subprocess
from pathlib import Path

import pytest

FIXTURE_OPS_SLUG = "zz-test-pcf-fixture-ops"
FIXTURE_WEBSITE_SLUG = "zz-test-pcf-fixture-website"
FIXTURE_CI_SLUG = "zz-test-pcf-fixture-ci"
FIXTURE_ARCHIVE_SLUG = "archive"


def _make_fixture(changes_dir: Path, slug: str, domains: str) -> None:
    d = changes_dir / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "proposal.md").write_text(
        f'---\ntitle: "Proposal: {slug}"\n---\n\n# Proposal: {slug}\n\ntest fixture, safe to ignore.\n',
        encoding="utf-8")
    (d / "tasks.md").write_text(
        f'---\ntitle: "Tasks: {slug}"\ndomains: [{domains}]\nstatus: active\n---\n\n'
        f"# Tasks: {slug}\n\n- [ ] test fixture task\n",
        encoding="utf-8")


@pytest.fixture
def pcf(repo_root, tmp_path):
    """BATS setup: Wegwerf-Git-Repo mit Fixture-Proposals; plan-context.sh laeuft darin."""
    tmp_root = tmp_path / "repo"
    tmp_root.mkdir()
    subprocess.run(["git", "init", "-q", str(tmp_root)], check=True)
    subprocess.run(["git", "-C", str(tmp_root), "config", "user.email", "pcf-test@example.invalid"], check=True)
    subprocess.run(["git", "-C", str(tmp_root), "config", "user.name", "PCF Test"], check=True)
    changes_dir = tmp_root / ".agents" / "plans"
    _make_fixture(changes_dir, FIXTURE_OPS_SLUG, "ops")
    _make_fixture(changes_dir, FIXTURE_WEBSITE_SLUG, "website")
    _make_fixture(changes_dir, FIXTURE_CI_SLUG, "ci")
    # Proposal direkt unter archive/ (Skip-Pfad `slug == archive` in plan-context.sh).
    _make_fixture(changes_dir, FIXTURE_ARCHIVE_SLUG, "ops")
    script = repo_root / "scripts" / "plan-context.sh"

    def run_pcf(*args):
        """(cd TMP_ROOT && bash SCRIPT args) — stdout, stderr getrennt."""
        return subprocess.run(["bash", str(script), *args], cwd=str(tmp_root), stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, timeout=120)

    return {"run": run_pcf, "changes": changes_dir, "script": script}


def _out(pcf, *args) -> str:
    return pcf["run"](*args).stdout


def _expected_non_archived(pcf) -> int:
    n = 0
    for f in sorted(pcf["changes"].glob("*/proposal.md")):
        if not f.is_file():
            continue
        if f.parent.name == "archive":
            continue
        n += 1
    return n


def _count_active(out: str) -> int:
    return len([line for line in out.splitlines() if line.startswith("### Active proposal:")])


# ── (1) role=ops ───────────────────────────────────────────────────────

def test_pcf_role_bp_run_includes_ops_tagged_proposal_fixture(pcf):
    out = _out(pcf, "bp-run")
    assert f"### Active proposal: {FIXTURE_OPS_SLUG}" in out, \
        f"MISSING: {FIXTURE_OPS_SLUG} (domains: [ops]) should be included for ops"


def test_pcf_role_bp_run_excludes_website_only_proposal_fixture(pcf):
    out = _out(pcf, "bp-run")
    assert f"### Active proposal: {FIXTURE_WEBSITE_SLUG}" not in out, \
        f"REGRESSION: {FIXTURE_WEBSITE_SLUG} (domains: [website]) leaked into ops output"


def test_pcf_role_bp_run_excludes_non_ops_non_infra_proposal_fixture(pcf):
    out = _out(pcf, "bp-run")
    assert f"### Active proposal: {FIXTURE_CI_SLUG}" not in out, \
        f"REGRESSION: {FIXTURE_CI_SLUG} (domains: [ci]) leaked into ops output"


# ── (2) role=website ───────────────────────────────────────────────────

def test_pcf_role_bp_ship_includes_website_tagged_proposal_fixture(pcf):
    out = _out(pcf, "bp-ship")
    assert f"### Active proposal: {FIXTURE_WEBSITE_SLUG}" in out, \
        f"MISSING: {FIXTURE_WEBSITE_SLUG} (domains: [website]) should be included for website"


def test_pcf_role_bp_ship_excludes_non_website_proposal_fixture(pcf):
    out = _out(pcf, "bp-ship")
    assert f"### Active proposal: {FIXTURE_OPS_SLUG}" not in out, \
        f"REGRESSION: {FIXTURE_OPS_SLUG} (domains: [ops]) leaked into website output"


# ── (3) role=orchestrator (anchor) ─────────────────────────────────────

def test_pcf_role_orchestrator_returns_all_non_archived_proposals_anchor(pcf):
    expected = _expected_non_archived(pcf)
    count = _count_active(_out(pcf, "orchestrator"))
    assert count == expected, f"orchestrator should return all {expected} non-archived proposals (got {count})"


# ── (4) unbekannte Rolle ───────────────────────────────────────────────

def test_pcf_unknown_role_emits_warn_unknown_role_on_stderr(pcf):
    err = pcf["run"]("foobar").stderr
    assert re.search(r"WARN: *unknown role", err), f"MISSING stderr WARN for unknown role (got: {err})"


def test_pcf_unknown_role_returns_all_non_archived_proposals_fail_soft(pcf):
    expected = _expected_non_archived(pcf)
    count = _count_active(_out(pcf, "foobar"))
    assert count == expected, f"unknown role should return all {expected} proposals as fail-soft (got {count})"


# ── (5) archive/ immer ausgeschlossen (anchor) ─────────────────────────

def test_pcf_archive_proposals_never_appear_in_any_role_output_anchor(pcf):
    for role in ("bp-ship", "bp-run", "orchestrator"):
        out = _out(pcf, role)
        assert not re.search(rf"^### Active proposal: {FIXTURE_ARCHIVE_SLUG}$", out, re.MULTILINE), \
            f"REGRESSION: {FIXTURE_ARCHIVE_SLUG} proposal leaked into output for role={role}"


# ── (6) Filter reduziert das Volumen ───────────────────────────────────

def test_pcf_filtered_output_is_substantially_smaller_than_orchestrator_output(pcf):
    all_count = _count_active(_out(pcf, "orchestrator"))
    ops = _count_active(_out(pcf, "bp-run"))
    website = _count_active(_out(pcf, "bp-ship"))
    assert ops < all_count, f"BUG STILL ACTIVE: ops count ({ops}) >= orchestrator count ({all_count})"
    assert website < all_count, f"BUG STILL ACTIVE: website count ({website}) >= orchestrator count ({all_count})"


# ── (7) Pflichtargument (anchor) ───────────────────────────────────────

def test_pcf_no_arg_invocation_exits_non_zero_with_usage_on_stderr_anchor(run_cmd, pcf):
    r = run_cmd(["bash", str(pcf["script"])])
    assert r.returncode != 0, "expected non-zero exit without args"
    assert "Usage" in r.output, f"expected 'Usage' on stderr (got: {r.output})"


# ── [T002322] Ausgabe-Granularitaet ────────────────────────────────────

def _t002322_bulky_fixture(pcf) -> str:
    slug = "zz-test-t002322-bulky"
    d = pcf["changes"] / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "proposal.md").write_text(
        '---\ntitle: "Proposal: bulky"\n---\n\n# Proposal: bulky\n\nKurzbeschreibung in der ersten Zeile.\n',
        encoding="utf-8")
    lines = [
        "---",
        'title: "Tasks: bulky"',
        "domains: [ops]",
        "status: active",
        "---",
        "",
        "# Tasks: bulky",
        "",
        "## Schritt eins",
    ]
    # Fuellkoerper: eine eindeutige Marke tief im Rumpf, die in einer Zusammenfassung NICHT auftauchen darf.
    for i in range(1, 201):
        lines.append(f"Fuellzeile {i} mit Detail ZZMARKERTIEFIMRUMPF{i}")
    (d / "tasks.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return slug


def test_t002322_per_proposal_output_is_a_summary_not_the_full_plan_body(pcf):
    slug = _t002322_bulky_fixture(pcf)
    out = _out(pcf, "bp-run")
    # Der Titel muss da sein — sonst waere das Proposal gar nicht ausgewaehlt.
    assert f"### Active proposal: {slug}" in out
    # Der Rumpf darf NICHT vollstaendig mitkommen.
    assert "ZZMARKERTIEFIMRUMPF150" not in out


def test_t002322_full_restores_the_complete_plan_body(pcf):
    # Gegenprobe: Die Zusammenfassung darf den Volltext nicht unerreichbar machen.
    _t002322_bulky_fixture(pcf)
    out = _out(pcf, "bp-run", "--full")
    assert "ZZMARKERTIEFIMRUMPF150" in out
