"""Native migration of tests/spec/dev-flow-plan/plan-lint-task-count.bats."""
# G2 (T002593): plan-lint warns, non-blocking, when a plan has fewer than 3 or more than 7

# "## Task" blocks. Command output verification [T002448-M4]: each test runs scripts/plan-lint.sh.

import json
import re
import subprocess

import pytest


def mkplan(path, n: int) -> None:
    """Lint-conformant plan with exactly n '## Task' blocks (mirror of the BATS helper mkplan)."""
    lines = [
        "---",
        "title: Task Count Fixture",
        "ticket_id: T002593",
        "domains: [test]",
        "status: active",
        "---",
        "",
        "# Task Count Fixture Implementation Plan",
        "",
        "## File Structure",
        "",
        "- Modify: `scripts/example.sh`",
        "",
        "## Task 1: RED",
        "",
        "- [ ] **Step 1: Write the failing test**",
        "",
        "Run: `bats tests/unit/example.bats`",
        "Expected: FAIL",
    ]
    for i in range(2, n):
        lines += ["", f"## Task {i}: GREEN step {i}", "", "- [ ] **Step 1: Implement**"]
    lines += [
        "",
        f"## Task {n}: Verify",
        "",
        "```bash",
        "task test:changed",
        "task freshness:regenerate",
        "task freshness:check",
        "```",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def lint(run_cmd, repo_root):
    script = repo_root / "scripts" / "plan-lint.sh"

    def _run(path, *extra):
        return run_cmd(["bash", str(script), *extra, str(path)], cwd=repo_root)

    return _run


def _warn_lines(output, token):
    return [l for l in output.splitlines() if l.startswith("⚠") and token in l]


def test_g2_5_tasks_liegen_im_korridor_und_loesen_keine_warnung_aus(tmp_path, lint):
    zwei, fuenf = tmp_path / "zwei.md", tmp_path / "fuenf.md"
    mkplan(zwei, 2)
    # Positive anchor: G2 must fire at all.
    assert "G2" in lint(zwei).output, "Anker: G2 feuert nicht bei 2 Tasks"

    mkplan(fuenf, 5)
    res = lint(fuenf)
    assert res.returncode == 0
    assert "PLAN-LINT: PASS" in res.output
    assert "G2" not in res.output


def test_g2_unter_3_tasks_warnt_ohne_den_exit_code_zu_aendern_warn_only(tmp_path, lint):
    zwei = tmp_path / "zwei.md"
    mkplan(zwei, 2)
    res = lint(zwei)
    assert res.returncode == 0
    assert "PLAN-LINT: PASS" in res.output
    assert _warn_lines(res.output, "G2"), "expected a G2 warning line"
    assert any("G2" in l and "2" in l for l in res.output.splitlines())


def test_g2_ueber_7_tasks_warnt_ohne_den_exit_code_zu_aendern_warn_only(tmp_path, lint):
    acht = tmp_path / "acht.md"
    mkplan(acht, 8)
    res = lint(acht)
    assert res.returncode == 0
    assert "PLAN-LINT: PASS" in res.output
    assert _warn_lines(res.output, "G2"), "expected a G2 warning line"
    assert any("G2" in l and "8" in l for l in res.output.splitlines())


def test_g2_schwellenwerte_3_und_7_selbst_sind_noch_im_korridor(tmp_path, lint):
    acht, drei, sieben = tmp_path / "acht.md", tmp_path / "drei.md", tmp_path / "sieben.md"
    mkplan(acht, 8)
    assert "G2" in lint(acht).output, "Anker: G2 feuert nicht bei 8 Tasks"

    mkplan(drei, 3)
    res = lint(drei)
    assert res.returncode == 0
    assert "G2" not in res.output

    mkplan(sieben, 7)
    res = lint(sieben)
    assert res.returncode == 0
    assert "G2" not in res.output


def test_g2_partial_mode_tasks_werden_ueber_tasks_d_summiert_nicht_nur_im_index_gezaehlt(
    repo_root, tmp_path, lint
):
    chg = tmp_path / "chg"
    # Builds the partial-plan fixture (production test helper, run as the BATS original does).
    subprocess.run(
        ["bash", str(repo_root / "tests/spec/fixtures/make-partial-plan.sh"), str(chg), "ok"],
        cwd=str(repo_root), capture_output=True, text=True, timeout=120, check=False,
    )
    zwei = tmp_path / "zwei.md"
    mkplan(zwei, 2)
    # Positive anchors: G2 fires, and the index alone is below the threshold.
    assert "G2" in lint(zwei).output, "Anker: G2 feuert nicht bei 2 Tasks"
    index_text = (chg / "tasks.md").read_text(encoding="utf-8")
    assert len(re.findall(r"^#+[ \t]+Task", index_text, re.MULTILINE)) < 3

    res = lint(chg / "tasks.md")
    assert res.returncode == 0
    assert "G2" not in res.output


def test_g2_zaehlt_auch_das_plan_format_n_titel_nicht_nur_task_n(tmp_path, lint):
    p = tmp_path / "numeriert.md"
    p.write_text(
        "---\ntitle: Numeriert\nticket_id: T002593\ndomains: [test]\nstatus: active\n---\n\n"
        "# Numeriert Implementation Plan\n\n## File Structure\n\n- Modify: `scripts/example.sh`\n\n"
        "## 1. RED\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n\n"
        "## 2. GREEN\n\n- [ ] implement\n\n"
        "## 3. Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n",
        encoding="utf-8",
    )
    zwei = tmp_path / "zwei.md"
    mkplan(zwei, 2)
    assert "G2" in lint(zwei).output, "Anker: G2 feuert nicht bei 2 Tasks"
    assert "G2" not in lint(p).output


def test_g2_zaehlt_tasks_und_task_list_nicht_als_task(tmp_path, lint):
    p = tmp_path / "sammel.md"
    mkplan(p, 2)
    with p.open("a", encoding="utf-8") as fh:
        fh.write("\n## Tasks\n\n## Task List\n")
    res = lint(p)
    assert any("G2" in l and "2" in l for l in res.output.splitlines())


def test_g2_schweigt_bei_0_erkannten_tasks_format_unsicherheit_kein_befund(tmp_path, lint):
    p = tmp_path / "kein-format.md"
    p.write_text(
        "---\ntitle: Ohne\nticket_id: T002593\ndomains: [test]\nstatus: active\n---\n\n"
        "# Ohne Implementation Plan\n\n## File Structure\n\n- Modify: `scripts/example.sh`\n\n"
        "## Vorgehen\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n\n"
        "## Abschluss\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n",
        encoding="utf-8",
    )
    zwei = tmp_path / "zwei.md"
    mkplan(zwei, 2)
    assert "G2" in lint(zwei).output, "Anker: G2 feuert nicht bei 2 Tasks"
    assert "G2" not in lint(p).output


def test_g2_erkennt_die_formate_t1_em_dash_und_checklisten_task_1(tmp_path, lint):
    p = tmp_path / "t-form.md"
    p.write_text(
        "---\ntitle: T-Form\nticket_id: T002593\ndomains: [test]\nstatus: active\n---\n\n"
        "# T-Form Implementation Plan\n\n## File Structure\n\n- Modify: `scripts/example.sh`\n\n"
        "## T1 — RED\n\nRun: `bats tests/unit/example.bats`\nExpected: FAIL\n\n"
        "## T2 — GREEN\n\n- [ ] **Task 3: extra step**\n\n"
        "## T4 — Verify\n\n```bash\ntask test:changed\ntask freshness:regenerate\ntask freshness:check\n```\n",
        encoding="utf-8",
    )
    zwei = tmp_path / "zwei.md"
    mkplan(zwei, 2)
    assert "G2" in lint(zwei).output, "Anker: G2 feuert nicht bei 2 Tasks"

    # Sharp check: keep only ONE of the four tasks -> 1 task, below threshold, MUST warn.
    # sed '/^## T2 /,/^- \[ \] \*\*Task 3/d; /^## T4 /d'
    lines = p.read_text(encoding="utf-8").split("\n")
    kept, in_range = [], False
    for line in lines:
        if not in_range and line.startswith("## T2 "):
            in_range = True
        if in_range:
            if re.match(r"^- \[ \] \*\*Task 3", line):
                in_range = False
            continue
        if line.startswith("## T4 "):
            continue
        kept.append(line)
    q = tmp_path / "t-form-eins.md"
    q.write_text("\n".join(kept), encoding="utf-8")
    res = lint(q)
    assert any("G2" in l and "1" in l for l in res.output.splitlines())

    assert "G2" not in lint(p).output


def test_g2_erscheint_im_json_modus_unter_warn_niemals_unter_hard(tmp_path, lint):
    zwei = tmp_path / "zwei.md"
    mkplan(zwei, 2)
    res = lint(zwei, "--json")
    assert res.returncode == 0
    data = json.loads(res.stdout)
    assert data["verdict"] == "PASS", data["verdict"]
    assert any("G2" in w for w in data["warn"]), data["warn"]
    assert not any("G2" in h for h in data["hard"]), data["hard"]
