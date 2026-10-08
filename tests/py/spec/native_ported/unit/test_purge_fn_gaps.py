"""Native migration of tests/unit/purge-fn-gaps.bats."""
import re
from pathlib import Path

import pytest


def _version_key(path: Path):
    """Emulate `sort -V` for file names: digit runs compare numerically."""
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)]


@pytest.fixture
def latest_purge_fn(repo_root) -> Path:
    candidates = sorted((repo_root / "scripts" / "one-shot").glob("purge-fn-v*.sql"), key=_version_key)
    assert candidates, "no purge-fn-v*.sql found in scripts/one-shot/"
    return candidates[-1]


@pytest.fixture
def purge_ts(repo_root) -> Path:
    path = repo_root / "components/website/src/pages/sdlc/api/testdata/purge.ts"
    assert path.is_file(), "purge.ts not found"
    return path


def _first_line_no(lines, needle):
    """Emulate `grep -n NEEDLE | head -1 | cut -d: -f1` (1-based, None if absent)."""
    for i, line in enumerate(lines, start=1):
        if needle in line:
            return i
    return None


def test_gap1_latest_purge_fn_sweeps_meetings_with_test_meeting_type(latest_purge_fn):
    assert "meeting_type LIKE '[TEST]%'" in latest_purge_fn.read_text(encoding="utf-8")


def test_gap1_meetings_sweep_appears_before_customer_allowlist_sweep(latest_purge_fn):
    lines = latest_purge_fn.read_text(encoding="utf-8").splitlines()
    meetings_line = _first_line_no(lines, "meeting_type LIKE")
    customers_line = next(
        (
            i
            for i, line in enumerate(lines, start=1)
            if "Customer allowlist sweep" in line or "DELETE FROM customers" in line
        ),
        None,
    )
    assert meetings_line is not None, "meetings sweep line not found"
    assert customers_line is not None, "customers sweep line not found"
    assert meetings_line < customers_line


def test_gap2_latest_purge_fn_sweeps_questionnaire_templates_with_e2e_title(latest_purge_fn):
    text = latest_purge_fn.read_text(encoding="utf-8")
    assert "questionnaire_templates" in text
    assert "title LIKE 'e2e-%" in text


def test_gap2_questionnaire_templates_sweep_appears_before_assignments_step(latest_purge_fn):
    lines = latest_purge_fn.read_text(encoding="utf-8").splitlines()
    templates_line = _first_line_no(lines, "DELETE FROM questionnaire_templates")
    assignments_line = _first_line_no(lines, "DELETE FROM questionnaire_assignments WHERE is_test_data")
    assert templates_line is not None, "questionnaire_templates sweep not found"
    assert assignments_line is not None, "questionnaire_assignments sweep not found"
    assert templates_line < assignments_line


def test_gap3_purge_ts_accepts_x_cron_secret_auth(purge_ts):
    assert "X-Cron-Secret" in purge_ts.read_text(encoding="utf-8")


def test_gap3_purge_ts_cron_secret_check_mirrors_purge_all_test_data_pattern(purge_ts):
    assert "CRON_SECRET" in purge_ts.read_text(encoding="utf-8")


def test_gap4_latest_purge_fn_carries_runtime_check_marker_matching_its_function(latest_purge_fn):
    lines = latest_purge_fn.read_text(encoding="utf-8").splitlines()
    marker = next((line for line in lines if "-- RUNTIME-CHECK:" in line), None)
    assert marker is not None, f"no RUNTIME-CHECK marker in {latest_purge_fn}"
    fn_line = next((line for line in lines if "CREATE OR REPLACE FUNCTION" in line), None)
    assert fn_line is not None, f"no CREATE OR REPLACE FUNCTION in {latest_purge_fn}"
    # sed -E 's/.*FUNCTION ([a-z_]+)\.([a-z_]+).*/\1.\2/' (ohne Treffer bleibt die Zeile unveraendert)
    m = re.match(r".*FUNCTION ([a-z_]+)\.([a-z_]+).*", fn_line)
    fn = f"{m.group(1)}.{m.group(2)}" if m else fn_line
    assert f"function={fn} " in marker
