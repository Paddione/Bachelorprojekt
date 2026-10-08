"""Native migration of tests/spec/agent-skills/finalize-plan-ref-whitespace.bats."""

import re

import pytest

EXPECTED_BRANCH = "fix/finalizer-resolve-worktree-by-branch-T012240"
EXPECTED_PLAN = ".agents/plans/finalizer-resolve-worktree-by-branch/tasks.md"
TICKET_JSON = (
    '{"external_id" : "T012240", "type" : "bug", "status" : "done", '
    '"plan_ref" : "FACTORY-PLAN-REF branch=' + EXPECTED_BRANCH + " plan=" + EXPECTED_PLAN + '"}'
)


@pytest.fixture
def finalize(repo_root):
    script = repo_root / "scripts/devflow-post-merge-finalize.sh"
    assert script.is_file()
    return script


def _extract_prelude(lines):
    """awk: /^# json_field: fuer Werte OHNE/{inside=1} /^json_field\\(\\) \\{/{inside=1}
    inside{print}; inside && /^PLAN_REF=/{exit}"""
    out = []
    inside = False
    for line in lines:
        if line.startswith("# json_field: fuer Werte OHNE") or re.match(r"^json_field\(\) \{", line):
            inside = True
        if inside:
            out.append(line)
            if re.match(r"^PLAN_REF=", line):
                break
    return "\n".join(out)


def _extract_section(lines):
    """awk: /^PLAN_FILE=""$/{inside=1}; inside{print}; inside && /^fi$/{exit}"""
    out = []
    inside = False
    for line in lines:
        if re.match(r'^PLAN_FILE=""$', line):
            inside = True
        if inside:
            out.append(line)
            if re.match(r"^fi$", line):
                break
    return "\n".join(out)


def _extract_fields(run_cmd, finalize):
    lines = finalize.read_text(encoding="utf-8").splitlines()
    prelude = _extract_prelude(lines)
    section = _extract_section(lines)
    assert prelude, "FATAL: json_field/PLAN_REF-Praeambel nicht gefunden"
    assert section, "FATAL: plan_ref-Auswertung nicht gefunden"
    assert re.search(r"^PLAN_REF=", prelude, re.M), "FATAL: PLAN_REF-Zuweisung fehlt in der Praeambel"
    script = (
        "set -uo pipefail\n"
        + prelude
        + "\n"
        + section
        + "\nprintf 'BRANCH=%s\\n' \"$BRANCH\"\n"
        + "printf 'PLAN_FILE=%s\\n' \"$PLAN_FILE\"\n"
    )
    return run_cmd(
        ["bash", "-c", script],
        env={"REPO_DIR": "/repo", "TICKET_JSON": TICKET_JSON, "BRANCH": ""},
    )


def _values(output, key):
    prefix = key + "="
    return "\n".join(line[len(prefix):] for line in output.splitlines() if line.startswith(prefix))


def test_extract_json_field_und_plan_ref_auswertung_liefern_nicht_leere_werte(run_cmd, finalize):
    r = _extract_fields(run_cmd, finalize)
    assert r.returncode == 0
    assert "BRANCH=" in r.output
    assert "PLAN_FILE=" in r.output
    assert _values(r.output, "BRANCH") != ""
    assert _values(r.output, "PLAN_FILE") != ""


def test_extract_branch_ist_der_branchname_allein_ohne_angehaengtes_plan(run_cmd, finalize):
    r = _extract_fields(run_cmd, finalize)
    assert r.returncode == 0
    assert _values(r.output, "BRANCH") == EXPECTED_BRANCH


def test_extract_plan_file_ist_der_plan_pfad_zu_repo_dir_absolut_gemacht(run_cmd, finalize):
    r = _extract_fields(run_cmd, finalize)
    assert r.returncode == 0
    assert _values(r.output, "PLAN_FILE") == "/repo/" + EXPECTED_PLAN


def test_extract_json_field_liefert_weiterhin_status_und_type_korrekt(run_cmd, finalize):
    lines = finalize.read_text(encoding="utf-8").splitlines()
    fn_lines = []
    inside = False
    for line in lines:
        if re.match(r"^json_field\(\) \{", line):
            inside = True
        if inside:
            fn_lines.append(line)
            if re.match(r"^\}$", line):
                break
    fn = "\n".join(fn_lines)
    script = (
        "set -uo pipefail\n"
        + fn
        + "\n"
        + "printf 'status=%s\\n' \"$(json_field status '" + TICKET_JSON + "')\"\n"
        + "printf 'type=%s\\n' \"$(json_field type '" + TICKET_JSON + "')\"\n"
    )
    r = run_cmd(["bash", "-c", script])
    assert r.returncode == 0
    assert "status=done" in r.output
    assert "type=bug" in r.output
