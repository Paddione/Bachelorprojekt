"""Tests for scripts/vda/frontmatter.sh (migrated from tests/unit/vda-frontmatter.bats)."""

from pathlib import Path
import pytest


@pytest.fixture
def sample_files(tmp_path: Path) -> dict[str, Path]:
    # A - NO frontmatter
    a = tmp_path / "a-none.md"
    a.write_text("# My Plan\n\nThis plan touches k3d/ manifests and kustomize overlays.\n")

    # B - present but domains: [] (orphaned); body has infra+db signals
    b = tmp_path / "b-empty-domains.md"
    b.write_text(
        "---\ntitle: Existing\nticket_id: T000999\ndomains: []\nstatus: active\npr_number: null\n---\n\n"
        "# Existing Plan\n\nTouches k3d/ kustomize overlays and a database schema query.\n"
    )

    # C - present but missing status line entirely
    c = tmp_path / "c-missing-status.md"
    c.write_text("---\ntitle: NoStatus\ndomains: [infra]\n---\n\n# Plan\n\nTouches k3d/ manifests.\n")

    # D - deliberate non-active status
    d = tmp_path / "d-deliberate-done.md"
    d.write_text("---\ntitle: Done plan\ndomains: [infra]\nstatus: done\n---\n\n# Plan\n\nTouches k3d/ manifests.\n")

    # E - already complete: idempotent no-op
    e = tmp_path / "e-complete.md"
    e.write_text(
        "---\ntitle: Complete\nticket_id: null\ndomains: [infra]\nstatus: active\npr_number: null\n"
        "file_locks: []\nshared_changes: false\nbatch_id: null\nparent_feature: null\ndepends_on_plans: []\n---\n\n"
        "# Plan\n\nTouches k3d/ manifests.\n"
    )

    # F - domains: null with website signals
    f = tmp_path / "f-null-domains.md"
    f.write_text(
        "---\ntitle: NullDomains\ndomains: null\nstatus: active\n---\n\n"
        "# Plan\n\nTouches the components/website/ astro and svelte components.\n"
    )

    # G - incomplete frontmatter missing batch fields
    g = tmp_path / "g-missing-batch.md"
    g.write_text(
        "---\ntitle: BatchTest\nticket_id: T000999\ndomains: [infra]\nstatus: active\npr_number: null\n---\n\n"
        "# Plan\n\nTouches k3d/ manifests.\n"
    )

    return {"a": a, "b": b, "c": c, "d": d, "e": e, "f": f, "g": g}


def test_no_frontmatter_prepends_full_block(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["a"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    lines = content.splitlines()
    assert lines[0] == "---"
    assert any(line.startswith("domains:") and "infra" in line for line in lines)
    assert "status: active" in lines


def test_no_frontmatter_includes_batch_fields(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["a"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "file_locks: []" in content
    assert "shared_changes: false" in content
    assert "batch_id: null" in content
    assert "parent_feature: null" in content
    assert "depends_on_plans: []" in content


def test_empty_domains_is_rederived(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["b"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "ticket_id: T000999" in content
    assert any(line.startswith("domains:") and "infra" in line for line in content.splitlines())
    assert any(line.startswith("domains:") and "db" in line for line in content.splitlines())


def test_missing_status_is_added(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["c"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "status: active" in content
    assert any(line.startswith("domains:") and "infra" in line for line in content.splitlines())


def test_domains_null_is_filled(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["f"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert any(line.startswith("domains:") and "website" in line for line in content.splitlines())
    assert not any(line.strip() == "domains: null" for line in content.splitlines())


def test_missing_batch_fields_added_to_incomplete_frontmatter(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["g"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "file_locks: []" in content
    assert "shared_changes: false" in content
    assert "batch_id: null" in content


def test_deliberate_status_done_preserved(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["d"]
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "status: done" in content
    assert "status: active" not in content


def test_complete_frontmatter_idempotent(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["e"]
    before = target.read_text()
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    assert target.read_text() == before


def test_crlf_frontmatter_idempotent(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "crlf.md"
    target.write_bytes(
        b"---\r\ntitle: X\r\ndomains: [infra]\r\nstatus: active\r\npr_number: null\r\n---\r\n\r\n# Plan\r\n\r\nTouches k3d/.\r\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    dash_count = sum(1 for line in content.replace("\r", "").splitlines() if line == "---")
    assert dash_count == 2


def test_no_duplicate_frontmatter_block(repo_root: Path, run_cmd, sample_files: dict[str, Path]):
    vda = repo_root / "scripts" / "vda.sh"
    target = sample_files["b"]
    run_cmd(["bash", str(vda), "frontmatter", str(target)])
    content = target.read_text()
    lines = content.splitlines()
    assert lines[0] == "---"
    dash_count = sum(1 for line in lines if line == "---")
    assert dash_count == 2


def test_activate_flag_forces_active(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "d-completed.md"
    target.write_text(
        "---\ntitle: Done Plan\ndomains: [infra]\nstatus: completed\n---\n\n# Done Plan\nTouches k3d/ kustomize overlays.\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", "--activate", str(target)])
    assert res.returncode == 0
    assert "status: active" in target.read_text()


def test_without_activate_completed_preserved(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "e-keep.md"
    target.write_text(
        "---\ntitle: Keep Plan\ndomains: [infra]\nstatus: completed\n---\n\n# Keep Plan\nTouches k3d/ kustomize overlays.\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    assert "status: completed" in target.read_text()


def test_spec_flag_adds_spec_frontmatter(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "f-spec.md"
    target.write_text("# My Feature Design\n\nSome design prose.\n")
    res = run_cmd(["bash", str(vda), "frontmatter", "--spec", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    lines = content.splitlines()
    assert lines[0] == "---"
    assert any(line.startswith("ticket_id:") for line in lines)
    assert any(line.startswith("plan_ref:") for line in lines)
    assert "status: active" in lines
    assert any(line.startswith("date:") for line in lines)


def test_spec_flag_idempotent_when_present(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "g-spec.md"
    content = "---\nticket_id: T000999\nplan_ref: null\nstatus: active\ndate: 2026-06-13\n---\n\n# Already Has It\n"
    target.write_text(content)
    res = run_cmd(["bash", str(vda), "frontmatter", "--spec", str(target)])
    assert res.returncode == 0
    assert target.read_text() == content


def test_ticket_id_derived_from_body_ticket_line(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "h-body-ticket.md"
    target.write_text("# Plan — Some Feature\n\n**Ticket:** T000886\n**Branch:** feature/t000886\n\nTouches scripts/ and skills.\n")
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "ticket_id: T000886" in content
    assert "ticket_id: null" not in content


def test_ticket_id_derived_from_filename_slug(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "2026-06-16-t000884.md"
    target.write_text("# Plan — Loops\n\nTouches scripts/factory and tests/.\n")
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    assert "ticket_id: T000884" in target.read_text()


def test_incomplete_frontmatter_null_ticket_repaired(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "i-null-ticket.md"
    target.write_text(
        "---\ntitle: Repair me\nticket_id: null\ndomains: []\nstatus: active\n---\n\n# Plan\n\n**Ticket:** T000999\n\nTouches k3d/ manifests.\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "ticket_id: T000999" in content
    assert any(line.startswith("domains:") and "infra" in line for line in content.splitlines())


def test_ticket_id_null_stays_null_when_not_derivable(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "j-undeterminable.md"
    content = (
        "---\ntitle: Generic\nticket_id: null\ndomains: [infra]\nstatus: active\npr_number: null\n"
        "file_locks: []\nshared_changes: false\nbatch_id: null\nparent_feature: null\ndepends_on_plans: []\n---\n\n"
        "# Plan\n\nTouches k3d/ manifests.\n"
    )
    target.write_text(content)
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    assert target.read_text() == content


def test_validate_autofills_title(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "v-no-title.md"
    target.write_text("---\nticket_id: T000910\ndomains: [infra]\nstatus: active\n---\n\n# Derived Title Plan\n\nTouches k3d/ manifests.\n")
    res = run_cmd(["bash", str(vda), "frontmatter", "--validate", str(target)])
    assert res.returncode == 0
    assert "title: Derived Title Plan" in target.read_text()


def test_validate_exits_1_when_domains_missing_and_underivable(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "v-no-domains.md"
    target.write_text(
        "---\ntitle: Has Title\nticket_id: T000910\nstatus: active\ndomains: []\n---\n\n# Has Title\n\nProse with no routing signals whatsoever zzz.\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", "--validate", str(target)])
    assert res.returncode == 1


def test_validate_accepts_yaml_list_domains(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "v-yaml-list.md"
    target.write_text(
        "---\ntitle: List Domains\nticket_id: T005563\ndomains:\n  - factory\n  - test\nstatus: active\n---\n\n# List Domains\n\nTouches scheduling and tests.\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", "--validate", str(target)])
    assert res.returncode == 0


def test_repair_converts_yaml_list_to_flow_form(repo_root: Path, run_cmd, tmp_path: Path):
    vda = repo_root / "scripts" / "vda.sh"
    target = tmp_path / "v-yaml-list-repair.md"
    target.write_text(
        "---\ntitle: List Domains\nticket_id: T005563\ndomains:\n  - factory\nstatus: active\n---\n\n# List Domains\n\nTouches scheduling.\n"
    )
    res = run_cmd(["bash", str(vda), "frontmatter", str(target)])
    assert res.returncode == 0
    content = target.read_text()
    assert "domains: [factory]" in content
    assert "  - " not in content
    assert "domains: [website" not in content
